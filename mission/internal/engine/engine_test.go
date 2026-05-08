package engine

import (
	"context"
	"math"
	"sync"
	"testing"
	"time"

	"github.com/TimLai666/airyn-flight/mission/internal/flightlink"
	"github.com/TimLai666/airyn-flight/mission/internal/protocol"
)

func TestHaversineMeters(t *testing.T) {
	d := HaversineMeters(0, 0, 0.01, 0)
	if math.Abs(d-1113.2) > 5 {
		t.Fatalf("HaversineMeters = %.1f m, want ~1113 m", d)
	}
}

func TestBearingDeg(t *testing.T) {
	if b := BearingDeg(0, 0, 1, 0); math.Abs(b) > 0.5 && math.Abs(b-360) > 0.5 {
		t.Fatalf("BearingDeg north = %.2f, want 0", b)
	}
	if b := BearingDeg(0, 0, 0, 1); math.Abs(b-90) > 0.5 {
		t.Fatalf("BearingDeg east = %.2f, want 90", b)
	}
}

// fakeLink satisfies flightlink.Link without timers or goroutines.
type fakeLink struct {
	frames chan protocol.FlightFrame
	health chan flightlink.Health
	mu     sync.Mutex
	sent   []protocol.FlightCommand
}

func newFakeLink() *fakeLink {
	return &fakeLink{
		frames: make(chan protocol.FlightFrame, 16),
		health: make(chan flightlink.Health, 4),
	}
}

func (l *fakeLink) Frames() <-chan protocol.FlightFrame { return l.frames }
func (l *fakeLink) Health() <-chan flightlink.Health     { return l.health }
func (l *fakeLink) Send(_ context.Context, cmd protocol.FlightCommand) error {
	l.mu.Lock()
	l.sent = append(l.sent, cmd)
	l.mu.Unlock()
	return nil
}
func (l *fakeLink) Close() error { return nil }
func (l *fakeLink) Sent() []protocol.FlightCommand {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]protocol.FlightCommand, len(l.sent))
	copy(out, l.sent)
	return out
}

// captureListener records what the engine emits.
type captureListener struct {
	mu     sync.Mutex
	frames []protocol.VehicleFrame
	logs   []protocol.LogMessage
}

func (c *captureListener) OnFrame(f protocol.VehicleFrame) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.frames = append(c.frames, f)
}
func (c *captureListener) OnLog(m protocol.LogMessage) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.logs = append(c.logs, m)
}
func (c *captureListener) FrameCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.frames)
}
func (c *captureListener) LastFrame() protocol.VehicleFrame {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.frames[len(c.frames)-1]
}
func (c *captureListener) HasLog(key string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, m := range c.logs {
		if m.MsgKey == key {
			return true
		}
	}
	return false
}

func newTestEngine(t *testing.T) (*Engine, *fakeLink, *captureListener, context.CancelFunc) {
	t.Helper()
	link := newFakeLink()
	listener := &captureListener{}
	cfg := DefaultConfig(protocol.VehicleConfig{
		ID: "v1", Callsign: "AIRYN", Color: protocol.ColorOchre,
		Link: protocol.VehicleLink{
			Mode:      protocol.LinkViaMission,
			Transport: protocol.TransportWS,
			Endpoint:  "test:0",
		},
	})
	cfg.GroundLossTimeout = 0 // disable timer-based RTL in unit tests
	eng := New(cfg, link, listener)
	ctx, cancel := context.WithCancel(context.Background())
	eng.Start(ctx)
	// Mark FC link healthy so the preflight gate is unblocked.
	link.health <- flightlink.Health{Healthy: true}
	return eng, link, listener, cancel
}

// pushHealthyFrame sends a frame that satisfies the default preflight rules.
func pushHealthyFrame(link *fakeLink, lat, lon, alt float64, armed bool) {
	link.frames <- protocol.FlightFrame{
		Lat: lat, Lon: lon, Altitude: alt,
		GPSActive: true, GPSSats: 12, GPSHdop: 0.7,
		Vbat: 22.0, Armed: armed,
	}
}

// waitFor polls predicate until it returns true or the deadline passes.
func waitFor(t *testing.T, predicate func() bool, what string) {
	t.Helper()
	deadline := time.After(time.Second)
	for {
		if predicate() {
			return
		}
		select {
		case <-deadline:
			t.Fatalf("timed out waiting for %s", what)
		case <-time.After(5 * time.Millisecond):
		}
	}
}

func TestArmRejectedBeforeFrame(t *testing.T) {
	eng, link, listener, cancel := newTestEngine(t)
	defer cancel()

	eng.Command(protocol.CmdArm)
	waitFor(t, func() bool {
		return listener.HasLog("log.msg.arm_rejected")
	}, "arm_rejected log")

	// No FlightCmdArm should have made it down.
	for _, c := range link.Sent() {
		if c.Kind == protocol.FlightCmdArm {
			t.Fatalf("FC received arm despite preflight failure")
		}
	}
}

func TestArmAcceptedWithHealthyFrame(t *testing.T) {
	eng, link, listener, cancel := newTestEngine(t)
	defer cancel()

	pushHealthyFrame(link, 24.7867, 121.0089, 0, false)
	waitFor(t, func() bool { return listener.FrameCount() > 0 }, "first frame published")

	eng.Command(protocol.CmdArm)
	waitFor(t, func() bool { return listener.HasLog("log.msg.command_arm") }, "command_arm log")

	found := false
	for _, c := range link.Sent() {
		if c.Kind == protocol.FlightCmdArm {
			found = true
		}
	}
	if !found {
		t.Fatalf("FlightCmdArm was not sent")
	}
}

func TestMissionRequiresPlan(t *testing.T) {
	eng, link, listener, cancel := newTestEngine(t)
	defer cancel()

	pushHealthyFrame(link, 24.7867, 121.0089, 0, false)
	waitFor(t, func() bool { return listener.FrameCount() > 0 }, "first frame")

	eng.Command(protocol.CmdMission)
	waitFor(t, func() bool {
		return listener.HasLog("log.msg.command_rejected_no_plan")
	}, "no plan log")
}

func TestMissionAdvancesAndCompletes(t *testing.T) {
	eng, link, listener, cancel := newTestEngine(t)
	defer cancel()

	plan := []protocol.MissionWaypoint{
		{Type: protocol.WaypointGo, Lat: 24.7868, Lon: 121.0090, Alt: 30},
		{Type: protocol.WaypointGo, Lat: 24.7869, Lon: 121.0091, Alt: 30},
	}
	eng.UploadPlan(plan)
	waitFor(t, func() bool { return listener.HasLog("log.msg.plan_upload") }, "plan_upload log")

	pushHealthyFrame(link, 24.7867, 121.0089, 30, false)
	waitFor(t, func() bool { return listener.FrameCount() > 0 }, "first frame")

	eng.Command(protocol.CmdMission)
	waitFor(t, func() bool {
		for _, c := range link.Sent() {
			if c.Kind == protocol.FlightCmdGoto && c.Lat == 24.7868 {
				return true
			}
		}
		return false
	}, "goto cmd 1")

	// Arrive at WP1 — frame within arrival radius.
	pushHealthyFrame(link, 24.7868, 121.0090, 30, true)
	waitFor(t, func() bool {
		for _, c := range link.Sent() {
			if c.Kind == protocol.FlightCmdGoto && c.Lat == 24.7869 {
				return true
			}
		}
		return false
	}, "goto cmd 2")

	// Arrive at WP2 — mission should complete; engine returns to hold mode.
	pushHealthyFrame(link, 24.7869, 121.0091, 30, true)
	waitFor(t, func() bool {
		f := listener.LastFrame()
		return f.Mode == protocol.ModeHold && f.MissionActiveIndex == nil
	}, "mission complete")
}
