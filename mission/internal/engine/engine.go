// Package engine is the onboard mission supervisor. It owns the high-level
// state machine (preflight / armed / takeoff / mission / hold / rtl / land /
// failsafe), holds the active mission plan, and translates ground commands
// into FlightCommands the flight controller can act on.
//
// Lower-level rate/attitude/PID loops still live in flight/. The engine never
// micromanages the FC; it only declares intent.
package engine

import (
	"context"
	"math"
	"sync"
	"time"

	"github.com/TimLai666/airyn-flight/mission/internal/flightlink"
	"github.com/TimLai666/airyn-flight/mission/internal/protocol"
)

// arrivalRadiusMeters is the horizontal distance below which a waypoint is
// considered reached.
const arrivalRadiusMeters = 5.0

// Config tunes the engine.
type Config struct {
	Vehicle protocol.VehicleConfig
	// GroundLossTimeout is how long to keep flying the current waypoint after
	// we lose ground contact before triggering RTL. Zero disables the timer.
	GroundLossTimeout time.Duration
	// PreflightVbatMin is the minimum battery voltage to allow arming.
	PreflightVbatMin float64
	// PreflightSatsMin is the minimum GPS satellite count to allow arming.
	PreflightSatsMin int
}

// DefaultConfig is the development-friendly baseline.
func DefaultConfig(v protocol.VehicleConfig) Config {
	return Config{
		Vehicle:           v,
		GroundLossTimeout: 30 * time.Second,
		PreflightVbatMin:  18.5,
		PreflightSatsMin:  6,
	}
}

// Listener observes engine output. The engine publishes one VehicleFrame per
// flight tick and zero or more LogMessages.
type Listener interface {
	OnFrame(frame protocol.VehicleFrame)
	OnLog(msg protocol.LogMessage)
}

// Engine wires a flight link into the mission state machine. Call Start to
// begin processing on a goroutine, and Stop (or cancel the start ctx) to
// terminate.
type Engine struct {
	cfg      Config
	link     flightlink.Link
	listener Listener

	cmdCh   chan command
	planCh  chan []protocol.MissionWaypoint
	groundCh chan groundEvent

	mu    sync.RWMutex
	state engineState
}

type command struct {
	cmd protocol.VehicleCommand
}

type groundEvent struct {
	connected bool
}

type engineState struct {
	// Last frame received from the FC; zero value before first frame.
	frame    protocol.FlightFrame
	hasFrame bool
	flight   bool // FC link is healthy

	mode        protocol.VehicleMode
	safety      protocol.SafetyState
	plan        []protocol.MissionWaypoint
	activeWP    int
	missionMode bool
	insActive   bool

	groundConnected bool
	groundLossSince time.Time
}

// New constructs an Engine. Frames begin flowing into the listener once the
// FC link emits frames and Start has been called.
func New(cfg Config, link flightlink.Link, listener Listener) *Engine {
	if cfg.PreflightSatsMin <= 0 {
		cfg.PreflightSatsMin = 6
	}
	if cfg.PreflightVbatMin <= 0 {
		cfg.PreflightVbatMin = 18.5
	}
	return &Engine{
		cfg:      cfg,
		link:     link,
		listener: listener,
		cmdCh:    make(chan command, 16),
		planCh:   make(chan []protocol.MissionWaypoint, 4),
		groundCh: make(chan groundEvent, 8),
		state: engineState{
			mode:     protocol.ModeStandby,
			safety:   protocol.SafetyOffline,
			activeWP: -1,
		},
	}
}

// Vehicle returns the static identity the engine was configured with.
func (e *Engine) Vehicle() protocol.VehicleConfig { return e.cfg.Vehicle }

// Command queues a ground command for processing. Returns immediately.
func (e *Engine) Command(cmd protocol.VehicleCommand) {
	select {
	case e.cmdCh <- command{cmd: cmd}:
	default:
	}
}

// UploadPlan stores a new mission plan. The engine sanitises invalid coords
// before adopting it. Called by the ground server.
func (e *Engine) UploadPlan(plan []protocol.MissionWaypoint) {
	clean := make([]protocol.MissionWaypoint, 0, len(plan))
	for _, wp := range plan {
		if !finite(wp.Lat) || !finite(wp.Lon) || !finite(wp.Alt) {
			continue
		}
		clean = append(clean, wp)
	}
	select {
	case e.planCh <- clean:
	default:
	}
}

// GroundConnected notifies the engine of ground-link state changes. The first
// connection clears any pending ground-loss timer; a disconnect starts it.
func (e *Engine) GroundConnected(connected bool) {
	select {
	case e.groundCh <- groundEvent{connected: connected}:
	default:
	}
}

// Snapshot returns the most recent telemetry frame the engine produced. Used
// by the ground server to seed newly connected clients.
func (e *Engine) Snapshot() protocol.VehicleFrame {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.composeFrame()
}

// Start runs the engine until ctx is cancelled or the flight-link channel is
// closed. Start must be called exactly once.
func (e *Engine) Start(ctx context.Context) {
	go e.run(ctx)
}

func (e *Engine) run(ctx context.Context) {
	frames := e.link.Frames()
	health := e.link.Health()

	for {
		select {
		case <-ctx.Done():
			return

		case h, ok := <-health:
			if !ok {
				health = nil
				continue
			}
			e.handleHealth(h)

		case ev := <-e.groundCh:
			e.handleGround(ev)

		case plan := <-e.planCh:
			e.handlePlan(plan)

		case cmd := <-e.cmdCh:
			e.handleCommand(ctx, cmd.cmd)

		case f, ok := <-frames:
			if !ok {
				return
			}
			e.handleFrame(ctx, f)
		}
	}
}

func (e *Engine) handleHealth(h flightlink.Health) {
	e.mu.Lock()
	prev := e.state.flight
	e.state.flight = h.Healthy
	if !h.Healthy {
		e.state.safety = protocol.SafetyOffline
	} else if e.state.safety == protocol.SafetyOffline {
		e.state.safety = protocol.SafetyPreflight
	}
	e.mu.Unlock()

	if prev != h.Healthy {
		if h.Healthy {
			e.log(protocol.LogInfo, "log.tag.link", "log.msg.connected",
				e.cfg.Vehicle.Callsign, "FC link up")
		} else {
			reason := h.Reason
			if reason == "" {
				reason = "FC link down"
			}
			e.log(protocol.LogErr, "log.tag.link", "log.msg.link_lost",
				e.cfg.Vehicle.Callsign, reason)
		}
	}
}

func (e *Engine) handleGround(ev groundEvent) {
	e.mu.Lock()
	prev := e.state.groundConnected
	e.state.groundConnected = ev.connected
	if ev.connected {
		e.state.groundLossSince = time.Time{}
	} else if prev {
		e.state.groundLossSince = time.Now()
	}
	e.mu.Unlock()

	switch {
	case ev.connected && !prev:
		e.log(protocol.LogInfo, "log.tag.link", "log.msg.connected",
			e.cfg.Vehicle.Callsign, "ground link up")
	case !ev.connected && prev:
		e.log(protocol.LogWarn, "log.tag.link", "log.msg.disconnected",
			e.cfg.Vehicle.Callsign)
	}
}

func (e *Engine) handlePlan(plan []protocol.MissionWaypoint) {
	e.mu.Lock()
	e.state.plan = plan
	e.state.activeWP = -1
	e.state.missionMode = false
	e.mu.Unlock()
	e.log(protocol.LogInfo, "log.tag.model", "log.msg.plan_upload", len(plan))
}

func (e *Engine) handleCommand(ctx context.Context, cmd protocol.VehicleCommand) {
	switch cmd {
	case protocol.CmdKill:
		e.sendFlight(ctx, protocol.FlightCommand{Kind: protocol.FlightCmdKill})
		e.mu.Lock()
		e.state.mode = protocol.ModeStandby
		e.state.safety = protocol.SafetyFailsafe
		e.state.missionMode = false
		e.state.activeWP = -1
		e.mu.Unlock()
		e.log(protocol.LogErr, "log.tag.cmd", "log.msg.command_kill", e.cfg.Vehicle.Callsign)
		return

	case protocol.CmdArm:
		if !e.checkPreflight() {
			e.log(protocol.LogWarn, "log.tag.safe", "log.msg.arm_rejected", e.cfg.Vehicle.Callsign)
			return
		}
		e.sendFlight(ctx, protocol.FlightCommand{Kind: protocol.FlightCmdArm})
		e.mu.Lock()
		e.state.safety = protocol.SafetyArmed
		e.state.mode = protocol.ModeStandby
		e.mu.Unlock()
		e.log(protocol.LogInfo, "log.tag.cmd", "log.msg.command_arm", e.cfg.Vehicle.Callsign)
		return

	case protocol.CmdDisarm:
		e.sendFlight(ctx, protocol.FlightCommand{Kind: protocol.FlightCmdDisarm})
		e.mu.Lock()
		e.state.safety = protocol.SafetyPreflight
		e.state.mode = protocol.ModeStandby
		e.state.missionMode = false
		e.state.activeWP = -1
		e.mu.Unlock()
		e.log(protocol.LogInfo, "log.tag.cmd", "log.msg.command_disarm", e.cfg.Vehicle.Callsign)
		return
	}

	// The remaining commands assume an armed aircraft. Arm-on-demand for
	// takeoff/mission, mirroring the ground simulator's UX.
	e.mu.RLock()
	armed := e.state.safety == protocol.SafetyArmed
	e.mu.RUnlock()

	if !armed && (cmd == protocol.CmdTakeoff || cmd == protocol.CmdMission) {
		if !e.checkPreflight() {
			e.log(protocol.LogWarn, "log.tag.safe", "log.msg.arm_rejected", e.cfg.Vehicle.Callsign)
			return
		}
		e.sendFlight(ctx, protocol.FlightCommand{Kind: protocol.FlightCmdArm})
		e.mu.Lock()
		e.state.safety = protocol.SafetyArmed
		e.mu.Unlock()
	}

	switch cmd {
	case protocol.CmdTakeoff:
		alt := e.takeoffAltitude()
		e.sendFlight(ctx, protocol.FlightCommand{Kind: protocol.FlightCmdTakeoff, Alt: alt})
		e.mu.Lock()
		e.state.mode = protocol.ModeTakeoff
		e.state.missionMode = false
		e.state.activeWP = -1
		e.mu.Unlock()
		e.log(protocol.LogInfo, "log.tag.cmd", "log.msg.command_takeoff",
			e.cfg.Vehicle.Callsign, int(alt))

	case protocol.CmdHold:
		e.sendFlight(ctx, protocol.FlightCommand{Kind: protocol.FlightCmdHold})
		e.mu.Lock()
		e.state.mode = protocol.ModeHold
		e.mu.Unlock()
		e.log(protocol.LogInfo, "log.tag.cmd", "log.msg.command_hold", e.cfg.Vehicle.Callsign)

	case protocol.CmdMission:
		e.mu.RLock()
		hasPlan := len(e.state.plan) > 0
		e.mu.RUnlock()
		if !hasPlan {
			e.log(protocol.LogWarn, "log.tag.cmd", "log.msg.command_rejected_no_plan",
				e.cfg.Vehicle.Callsign)
			return
		}
		e.mu.Lock()
		e.state.mode = protocol.ModeMission
		e.state.missionMode = true
		e.state.activeWP = 0
		first := e.state.plan[0]
		e.mu.Unlock()
		e.sendFlight(ctx, protocol.FlightCommand{
			Kind: protocol.FlightCmdGoto,
			Lat:  first.Lat, Lon: first.Lon, Alt: first.Alt,
		})
		e.log(protocol.LogInfo, "log.tag.cmd", "log.msg.command_mission",
			e.cfg.Vehicle.Callsign, len(e.state.plan))

	case protocol.CmdRTL:
		e.sendFlight(ctx, protocol.FlightCommand{Kind: protocol.FlightCmdRTL})
		e.mu.Lock()
		e.state.mode = protocol.ModeRTL
		e.state.missionMode = false
		e.state.activeWP = -1
		e.mu.Unlock()
		e.log(protocol.LogWarn, "log.tag.cmd", "log.msg.command_rtl", e.cfg.Vehicle.Callsign)

	case protocol.CmdLand:
		e.sendFlight(ctx, protocol.FlightCommand{Kind: protocol.FlightCmdLand})
		e.mu.Lock()
		e.state.mode = protocol.ModeLand
		e.state.missionMode = false
		e.state.activeWP = -1
		e.mu.Unlock()
		e.log(protocol.LogWarn, "log.tag.cmd", "log.msg.command_land", e.cfg.Vehicle.Callsign)
	}
}

func (e *Engine) handleFrame(ctx context.Context, f protocol.FlightFrame) {
	e.mu.Lock()
	e.state.frame = f
	e.state.hasFrame = true

	// Only track INS when GPS dropped but the FC is still reporting frames.
	wasINS := e.state.insActive
	e.state.insActive = !f.GPSActive && f.Armed
	insChanged := wasINS != e.state.insActive

	// Mission progress: if we are in mission mode, advance through the plan.
	advanced := false
	completed := false
	if e.state.missionMode && e.state.activeWP >= 0 && e.state.activeWP < len(e.state.plan) {
		wp := e.state.plan[e.state.activeWP]
		dist := HaversineMeters(f.Lat, f.Lon, wp.Lat, wp.Lon)
		if dist <= arrivalRadiusMeters {
			e.state.activeWP++
			advanced = true
			if e.state.activeWP >= len(e.state.plan) {
				completed = true
				e.state.missionMode = false
				e.state.activeWP = -1
				e.state.mode = protocol.ModeHold
			}
		}
	}

	// Keep safety state honest with FC-reported armed bit.
	if !f.Armed && e.state.safety == protocol.SafetyArmed {
		e.state.safety = protocol.SafetyPreflight
		e.state.mode = protocol.ModeStandby
		e.state.missionMode = false
		e.state.activeWP = -1
	}

	// Ground-loss policy.
	groundTimeout := e.cfg.GroundLossTimeout > 0 &&
		!e.state.groundConnected &&
		!e.state.groundLossSince.IsZero() &&
		time.Since(e.state.groundLossSince) > e.cfg.GroundLossTimeout &&
		f.Armed &&
		e.state.mode != protocol.ModeRTL &&
		e.state.mode != protocol.ModeLand

	// Capture any next waypoint to emit AFTER releasing the lock.
	var nextWP *protocol.MissionWaypoint
	if advanced && !completed {
		wp := e.state.plan[e.state.activeWP]
		nextWP = &wp
	}
	frameOut := e.composeFrame()
	e.mu.Unlock()

	if insChanged {
		if e.state.insActive {
			e.log(protocol.LogWarn, "log.tag.ins", "log.msg.gps_lost", e.cfg.Vehicle.Callsign)
		} else {
			e.log(protocol.LogInfo, "log.tag.gps", "log.msg.gps_resume", e.cfg.Vehicle.Callsign)
		}
	}
	if completed {
		e.log(protocol.LogInfo, "log.tag.cmd", "log.msg.command_hold", e.cfg.Vehicle.Callsign)
	}
	if nextWP != nil {
		e.sendFlight(ctx, protocol.FlightCommand{
			Kind: protocol.FlightCmdGoto,
			Lat:  nextWP.Lat, Lon: nextWP.Lon, Alt: nextWP.Alt,
		})
	}
	if groundTimeout {
		e.log(protocol.LogWarn, "log.tag.cmd", "log.msg.command_rtl", e.cfg.Vehicle.Callsign)
		e.sendFlight(ctx, protocol.FlightCommand{Kind: protocol.FlightCmdRTL})
		e.mu.Lock()
		e.state.mode = protocol.ModeRTL
		e.state.missionMode = false
		e.state.activeWP = -1
		// Clear the timer so we don't loop into RTL repeatedly.
		e.state.groundLossSince = time.Now().Add(time.Hour)
		e.mu.Unlock()
	}

	if e.listener != nil {
		e.listener.OnFrame(frameOut)
	}
}

// composeFrame must be called with e.mu held (read or write).
func (e *Engine) composeFrame() protocol.VehicleFrame {
	s := &e.state
	id := e.cfg.Vehicle.ID
	frame := protocol.VehicleFrame{
		ID:                 id,
		Flight:             s.flight,
		LinkActive:         s.flight,
		Lat:                s.frame.Lat,
		Lon:                s.frame.Lon,
		Altitude:           s.frame.Altitude,
		Speed:              s.frame.Speed,
		Heading:            s.frame.Heading,
		GPSActive:          s.frame.GPSActive,
		GPSSats:            s.frame.GPSSats,
		GPSHdop:            s.frame.GPSHdop,
		INSActive:          s.insActive,
		Mode:               s.mode,
		SafetyState:        s.safety,
		PreflightOK:        s.flight && s.frame.GPSActive && s.frame.GPSSats >= e.cfg.PreflightSatsMin && s.frame.Vbat >= e.cfg.PreflightVbatMin,
		MissionUploaded:    len(s.plan) > 0,
		MissionCount:       len(s.plan),
		MissionActiveIndex: optionalInt(s.activeWP),
		Roll:               s.frame.Roll,
		Pitch:              s.frame.Pitch,
		Yaw:                s.frame.Yaw,
		Thr:                s.frame.Thr,
		Vbat:               s.frame.Vbat,
		Armed:              s.frame.Armed,
		GyroX:              s.frame.GyroX,
		GyroY:              s.frame.GyroY,
		GyroZ:              s.frame.GyroZ,
		AccelX:             s.frame.AccelX,
		AccelY:             s.frame.AccelY,
		AccelZ:             s.frame.AccelZ,
		BaroAlt:            s.frame.BaroAlt,
		BaroVs:             s.frame.BaroVs,
		BaroP:              s.frame.BaroP,
		BaroT:              s.frame.BaroT,
		BatI:               s.frame.BatI,
		BatUsed:            s.frame.BatUsed,
	}
	return frame
}

func (e *Engine) takeoffAltitude() float64 {
	e.mu.RLock()
	defer e.mu.RUnlock()
	target := 20.0
	if e.state.hasFrame && e.state.frame.Altitude+8 > target {
		target = e.state.frame.Altitude + 8
	}
	return target
}

func (e *Engine) checkPreflight() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	if !e.state.flight || !e.state.hasFrame {
		return false
	}
	if !e.state.frame.GPSActive {
		return false
	}
	if e.state.frame.GPSSats < e.cfg.PreflightSatsMin {
		return false
	}
	if e.state.frame.Vbat < e.cfg.PreflightVbatMin {
		return false
	}
	return true
}

func (e *Engine) sendFlight(ctx context.Context, cmd protocol.FlightCommand) {
	if e.link == nil {
		return
	}
	// Best-effort with a tight deadline; the link is responsible for buffering.
	sendCtx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	_ = e.link.Send(sendCtx, cmd)
}

func (e *Engine) log(level protocol.LogLevel, tag, msg string, args ...any) {
	if e.listener == nil {
		return
	}
	e.listener.OnLog(protocol.NewLog(level, tag, msg, args...))
}

func optionalInt(i int) *int {
	if i < 0 {
		return nil
	}
	v := i
	return &v
}

func finite(f float64) bool {
	return !math.IsNaN(f) && !math.IsInf(f, 0)
}
