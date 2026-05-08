package flightlink

import (
	"context"
	"math"
	"math/rand/v2"
	"sync"
	"time"

	"github.com/TimLai666/airyn-flight/mission/internal/protocol"
)

// StubConfig parameterises the synthetic flight controller.
type StubConfig struct {
	HomeLat     float64       // start latitude (and RTL home)
	HomeLon     float64       // start longitude
	HomeHeading float64       // initial heading, degrees
	TickRate    time.Duration // how often to emit a frame
}

// DefaultStubConfig returns a config keyed to the same Hsinchu testbench area
// the ground simulator uses.
func DefaultStubConfig() StubConfig {
	return StubConfig{
		HomeLat:     24.78670,
		HomeLon:     121.00890,
		HomeHeading: 45,
		TickRate:    100 * time.Millisecond,
	}
}

// Stub is a deterministic synthetic flight controller used while real
// serial/UDP transports are not yet available. It models enough physics to
// exercise the mission engine end-to-end: it integrates a simple goto
// controller, drains battery, and reports GPS quality.
//
// The stub is intentionally separate from ground/src/bun/sim.ts so the
// renderer simulator can keep its multi-vehicle behaviour while mission gets
// a single-vehicle physics model that listens to FlightCommand inputs.
type Stub struct {
	cfg    StubConfig
	frames chan protocol.FlightFrame
	health chan Health
	cmds   chan protocol.FlightCommand
	done   chan struct{}
	closed sync.Once
}

// NewStub constructs a stub flight controller and begins ticking on its own
// goroutine. The link is healthy immediately.
func NewStub(ctx context.Context, cfg StubConfig) *Stub {
	if cfg.TickRate <= 0 {
		cfg.TickRate = 100 * time.Millisecond
	}
	s := &Stub{
		cfg:    cfg,
		frames: make(chan protocol.FlightFrame, 8),
		health: make(chan Health, 4),
		cmds:   make(chan protocol.FlightCommand, 16),
		done:   make(chan struct{}),
	}
	go s.run(ctx)
	return s
}

// Frames implements Link.
func (s *Stub) Frames() <-chan protocol.FlightFrame { return s.frames }

// Health implements Link.
func (s *Stub) Health() <-chan Health { return s.health }

// Send implements Link.
func (s *Stub) Send(ctx context.Context, cmd protocol.FlightCommand) error {
	select {
	case s.cmds <- cmd:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-s.done:
		return context.Canceled
	}
}

// Close implements Link.
func (s *Stub) Close() error {
	s.closed.Do(func() { close(s.done) })
	return nil
}

type stubState struct {
	lat, lon, alt float64
	prevAlt       float64
	heading       float64
	speed         float64
	armed         bool
	target        *protocol.FlightCommand
	homeLat       float64
	homeLon       float64
	vbat          float64
	batUsed       float64
	baroVs        float64
	gpsSats       int
	rng           *rand.Rand
	t             float64
}

func (s *Stub) run(ctx context.Context) {
	defer close(s.frames)

	st := &stubState{
		lat:     s.cfg.HomeLat,
		lon:     s.cfg.HomeLon,
		homeLat: s.cfg.HomeLat,
		homeLon: s.cfg.HomeLon,
		heading: s.cfg.HomeHeading,
		vbat:    22.4,
		gpsSats: 8,
		rng:     rand.New(rand.NewPCG(0xA1, 0xB2)),
	}

	// Best-effort startup signal so the engine knows the link is up.
	select {
	case s.health <- Health{Healthy: true}:
	default:
	}

	tick := time.NewTicker(s.cfg.TickRate)
	defer tick.Stop()

	dt := s.cfg.TickRate.Seconds()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.done:
			return
		case cmd := <-s.cmds:
			applyCommand(st, cmd)
		case <-tick.C:
			step(st, dt)
			endTick(st, dt)
			frame := snapshot(st)
			select {
			case s.frames <- frame:
			default:
				// Drop the oldest if the engine is slow; mission is real-time.
				select {
				case <-s.frames:
				default:
				}
				select {
				case s.frames <- frame:
				default:
				}
			}
		}
	}
}

func applyCommand(st *stubState, cmd protocol.FlightCommand) {
	switch cmd.Kind {
	case protocol.FlightCmdArm:
		st.armed = true
		st.target = nil
	case protocol.FlightCmdDisarm:
		st.armed = false
		st.target = nil
		st.speed = 0
	case protocol.FlightCmdHold:
		copy := cmd
		copy.Lat = st.lat
		copy.Lon = st.lon
		if copy.Alt == 0 {
			copy.Alt = st.alt
		}
		st.target = &copy
	case protocol.FlightCmdTakeoff:
		copy := cmd
		copy.Lat = st.lat
		copy.Lon = st.lon
		if copy.Alt == 0 {
			copy.Alt = 20
		}
		st.armed = true
		st.target = &copy
	case protocol.FlightCmdGoto:
		copy := cmd
		st.target = &copy
	case protocol.FlightCmdRTL:
		copy := protocol.FlightCommand{
			Kind: protocol.FlightCmdRTL,
			Lat:  st.homeLat,
			Lon:  st.homeLon,
			Alt:  math.Max(15, st.alt),
		}
		st.target = &copy
	case protocol.FlightCmdLand:
		copy := protocol.FlightCommand{
			Kind: protocol.FlightCmdLand,
			Lat:  st.lat,
			Lon:  st.lon,
			Alt:  0,
		}
		st.target = &copy
	case protocol.FlightCmdKill:
		st.armed = false
		st.target = nil
		st.speed = 0
		st.alt = 0
	}
}

func step(st *stubState, dt float64) {
	st.t += dt
	st.prevAlt = st.alt

	// GPS warm-up.
	if st.gpsSats < 14 {
		st.gpsSats++
	}

	// Battery drain: 0.0002 V/s at idle, 0.002 V/s armed.
	drain := 0.0002
	if st.armed {
		drain = 0.002
	}
	st.vbat = math.Max(15, st.vbat-drain*dt)

	if !st.armed || st.target == nil {
		st.speed *= 0.9
		return
	}

	// Approach target with simple proportional terms.
	switch st.target.Kind {
	case protocol.FlightCmdLand:
		st.alt = math.Max(0, st.alt-1.4*dt)
		if st.alt <= 0.05 {
			st.armed = false
			st.target = nil
			st.speed = 0
		}
		return
	case protocol.FlightCmdTakeoff, protocol.FlightCmdHold:
		st.alt += (st.target.Alt - st.alt) * 0.06
		st.speed *= 0.7
		return
	}

	// goto / rtl: move toward target lat/lon at desired speed.
	desiredAlt := st.target.Alt
	if desiredAlt == 0 {
		desiredAlt = st.alt
	}
	st.alt += (desiredAlt - st.alt) * 0.06

	dLat := st.target.Lat - st.lat
	dLon := st.target.Lon - st.lon
	cosLat := math.Cos(st.lat * math.Pi / 180)
	north := dLat * 111111
	east := dLon * 111111 * cosLat
	dist := math.Hypot(north, east)

	if dist < 0.5 {
		// Hold at the arrival point.
		st.target = nil
		st.speed *= 0.5
		return
	}

	bearing := math.Atan2(east, north) * 180 / math.Pi
	if bearing < 0 {
		bearing += 360
	}
	st.heading = bearing

	desired := 8.0
	if st.target.Kind == protocol.FlightCmdRTL {
		desired = 7
	}
	st.speed += (desired - st.speed) * 0.12

	headRad := bearing * math.Pi / 180
	st.lat += (st.speed * dt * math.Cos(headRad)) / 111111
	st.lon += (st.speed * dt * math.Sin(headRad)) / (111111 * cosLat)
}

func endTick(st *stubState, dt float64) {
	if dt <= 0 {
		return
	}
	st.baroVs = (st.alt - st.prevAlt) / dt
	st.batUsed += currentEstimate(st) * dt / 3.6
}

func snapshot(st *stubState) protocol.FlightFrame {
	jitter := func(span float64) float64 { return (st.rng.Float64() - 0.5) * span * 2 }
	frame := protocol.FlightFrame{
		Lat:       st.lat,
		Lon:       st.lon,
		Altitude:  st.alt,
		Speed:     st.speed,
		Heading:   st.heading,
		GPSActive: st.gpsSats >= 6,
		GPSSats:   st.gpsSats,
		GPSHdop:   0.7 + jitter(0.05),
		INSActive: false,
		Roll:      jitter(0.3),
		Pitch:     jitter(0.3),
		Yaw:       st.heading,
		Thr:       throttleEstimate(st),
		Vbat:      st.vbat,
		Armed:     st.armed,
		GyroX:     jitter(0.4),
		GyroY:     jitter(0.4),
		GyroZ:     jitter(0.4),
		AccelX:    jitter(0.04),
		AccelY:    jitter(0.04),
		AccelZ:    1.0 + jitter(0.02),
		BaroAlt:   st.alt + jitter(0.3),
		BaroVs:    0,
		BaroP:     1013.2 + jitter(0.4),
		BaroT:     24.5 + jitter(0.1),
		BatI:      currentEstimate(st),
		BatUsed:   st.batUsed,
	}
	return frame
}

func throttleEstimate(st *stubState) float64 {
	if !st.armed {
		return 0
	}
	if st.target == nil {
		return 18
	}
	switch st.target.Kind {
	case protocol.FlightCmdLand:
		return 22
	case protocol.FlightCmdTakeoff, protocol.FlightCmdHold:
		return 20
	default:
		return 35
	}
}

func currentEstimate(st *stubState) float64 {
	if !st.armed {
		return 1.4
	}
	if st.target == nil {
		return 5.2
	}
	return 8.4
}
