// Package app is the entry point that ties the flight link, mission engine,
// telemetry buffer, and ground server into one running daemon.
package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/TimLai666/airyn-flight/mission/internal/config"
	"github.com/TimLai666/airyn-flight/mission/internal/engine"
	"github.com/TimLai666/airyn-flight/mission/internal/flightlink"
	"github.com/TimLai666/airyn-flight/mission/internal/groundserver"
	"github.com/TimLai666/airyn-flight/mission/internal/protocol"
	"github.com/TimLai666/airyn-flight/mission/internal/telemetry"
)

// Runtime describes the mission computer process state.
type Runtime struct {
	Version   string
	StartedAt time.Time
}

// NewRuntime creates a mission runtime state snapshot.
func NewRuntime(now time.Time) Runtime {
	return Runtime{
		Version:   Version,
		StartedAt: now.UTC(),
	}
}

// Run starts the mission computer process with default configuration loaded
// from the environment. Blocks until ctx is cancelled.
func Run(ctx context.Context, out io.Writer) error {
	cfg, err := config.FromEnv(nil)
	if err != nil {
		return err
	}
	return RunWithConfig(ctx, out, cfg)
}

// RunWithConfig is Run with explicit settings, useful for tests.
func RunWithConfig(ctx context.Context, out io.Writer, cfg config.Config) error {
	if err := writeStartupLine(out); err != nil {
		return err
	}

	vehicle := protocol.VehicleConfig{
		ID:       cfg.VehicleID,
		Callsign: cfg.VehicleCallsign,
		Color:    cfg.VehicleColor,
		Link: protocol.VehicleLink{
			Mode:      protocol.LinkViaMission,
			Transport: protocol.TransportWS,
			Endpoint:  cfg.Listen,
		},
	}

	link, err := buildLink(ctx, cfg)
	if err != nil {
		return err
	}
	defer link.Close()

	engCfg := engine.Config{
		Vehicle:           vehicle,
		GroundLossTimeout: cfg.GroundLossTimeout,
		PreflightVbatMin:  cfg.PreflightVbatMin,
		PreflightSatsMin:  cfg.PreflightSatsMin,
	}

	hub := groundserver.NewHub()
	srv := groundserver.New(groundserver.Config{
		Listen: cfg.Listen,
		Build:  Version,
	}, hub, nil, out)

	buffer := telemetry.NewBuffer(cfg.TelemetryCapacity)
	startedAt := time.Now()

	listener := newListener(srv, buffer, startedAt)
	eng := engine.New(engCfg, link, listener)

	// Wire the engine into the server before Start so initial snapshot works.
	srv.SetEngine(eng)

	addr, err := srv.Start(ctx)
	if err != nil {
		return err
	}
	fmt.Fprintf(out, "airyn mission ground server listening on %s\n", addr)

	eng.Start(ctx)

	<-ctx.Done()
	if err := ctx.Err(); err != nil && !errors.Is(err, context.Canceled) {
		return err
	}
	return nil
}

func buildLink(ctx context.Context, cfg config.Config) (flightlink.Link, error) {
	switch cfg.FlightLink {
	case "", "stub":
		stubCfg := flightlink.DefaultStubConfig()
		stubCfg.TickRate = cfg.FlightTickRate
		return flightlink.NewStub(ctx, stubCfg), nil
	default:
		return nil, fmt.Errorf("unknown flight link %q (only \"stub\" is wired)", cfg.FlightLink)
	}
}

func writeStartupLine(out io.Writer) error {
	runtime := NewRuntime(time.Now())
	_, err := fmt.Fprintf(
		out,
		"airyn mission online version=%s started_at=%s\n",
		runtime.Version,
		runtime.StartedAt.Format(time.RFC3339),
	)
	return err
}

// engineListener bridges engine output into both the WebSocket server and the
// telemetry buffer. The buffer needs the raw flight frame, but engine.Listener
// only delivers VehicleFrames. We synthesise a FlightFrame from the same data.
type engineListener struct {
	srv       *groundserver.Server
	buffer    *telemetry.Buffer
	startedAt time.Time
	mu        sync.Mutex
	tick      int64
}

func newListener(srv *groundserver.Server, buffer *telemetry.Buffer, startedAt time.Time) *engineListener {
	return &engineListener{srv: srv, buffer: buffer, startedAt: startedAt}
}

func (l *engineListener) OnFrame(frame protocol.VehicleFrame) {
	l.srv.OnFrame(frame)

	l.mu.Lock()
	l.tick++
	t := time.Since(l.startedAt).Seconds()
	l.mu.Unlock()

	sample := telemetry.Sample{
		T:        t,
		Lat:      frame.Lat,
		Lon:      frame.Lon,
		Altitude: frame.Altitude,
		Speed:    frame.Speed,
		Vbat:     frame.Vbat,
		BatI:     frame.BatI,
		BatUsed:  frame.BatUsed,
		BaroAlt:  frame.BaroAlt,
		BaroVs:   frame.BaroVs,
		GPSSats:  frame.GPSSats,
		GPSHdop:  frame.GPSHdop,
		Armed:    frame.Armed,
	}
	l.buffer.Append(sample)
}

func (l *engineListener) OnLog(msg protocol.LogMessage) {
	l.srv.OnLog(msg)
}
