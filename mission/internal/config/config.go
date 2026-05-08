// Package config loads mission daemon settings from environment variables
// with safe defaults. Heavier configuration formats can be layered on top
// later; the daemon currently has only a handful of knobs.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/TimLai666/airyn-flight/mission/internal/protocol"
)

// Config groups all mission daemon settings.
type Config struct {
	// Listen is the bind address for the ground WebSocket server.
	Listen string

	// FlightLink picks the flight transport. Currently only "stub" is wired.
	FlightLink string

	// Vehicle identity reported to ground.
	VehicleID       string
	VehicleCallsign string
	VehicleColor    protocol.VehicleColor

	// Mission engine knobs.
	GroundLossTimeout time.Duration
	PreflightVbatMin  float64
	PreflightSatsMin  int

	// TelemetryCapacity is the rolling buffer size, in samples.
	TelemetryCapacity int

	// FlightTickRate is how often the stub link emits frames.
	FlightTickRate time.Duration
}

// Default returns the development-friendly defaults.
func Default() Config {
	return Config{
		Listen:            fmt.Sprintf(":%d", protocol.MissionPort),
		FlightLink:        "stub",
		VehicleID:         "v1",
		VehicleCallsign:   "AIRYN",
		VehicleColor:      protocol.ColorOchre,
		GroundLossTimeout: 30 * time.Second,
		PreflightVbatMin:  18.5,
		PreflightSatsMin:  6,
		TelemetryCapacity: 600,
		FlightTickRate:    100 * time.Millisecond,
	}
}

// FromEnv overlays the defaults with environment variables. Unknown values
// surface as errors so a typo in deployment fails fast.
func FromEnv(getenv func(string) string) (Config, error) {
	if getenv == nil {
		getenv = os.Getenv
	}
	cfg := Default()

	if v := getenv("AIRYN_MISSION_LISTEN"); v != "" {
		cfg.Listen = v
	}
	if v := getenv("AIRYN_MISSION_LINK"); v != "" {
		cfg.FlightLink = strings.ToLower(v)
	}
	if v := getenv("AIRYN_MISSION_VEHICLE_ID"); v != "" {
		cfg.VehicleID = v
	}
	if v := getenv("AIRYN_MISSION_VEHICLE_CALLSIGN"); v != "" {
		cfg.VehicleCallsign = v
	}
	if v := getenv("AIRYN_MISSION_VEHICLE_COLOR"); v != "" {
		switch protocol.VehicleColor(v) {
		case protocol.ColorOchre, protocol.ColorIce, protocol.ColorOK:
			cfg.VehicleColor = protocol.VehicleColor(v)
		default:
			return cfg, fmt.Errorf("invalid AIRYN_MISSION_VEHICLE_COLOR %q", v)
		}
	}
	if v := getenv("AIRYN_MISSION_GROUND_LOSS_TIMEOUT"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return cfg, fmt.Errorf("AIRYN_MISSION_GROUND_LOSS_TIMEOUT: %w", err)
		}
		cfg.GroundLossTimeout = d
	}
	if v := getenv("AIRYN_MISSION_PREFLIGHT_VBAT"); v != "" {
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			return cfg, fmt.Errorf("AIRYN_MISSION_PREFLIGHT_VBAT: %w", err)
		}
		cfg.PreflightVbatMin = f
	}
	if v := getenv("AIRYN_MISSION_PREFLIGHT_SATS"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return cfg, fmt.Errorf("AIRYN_MISSION_PREFLIGHT_SATS: %w", err)
		}
		cfg.PreflightSatsMin = n
	}
	if v := getenv("AIRYN_MISSION_TELEMETRY_CAP"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return cfg, fmt.Errorf("AIRYN_MISSION_TELEMETRY_CAP: %w", err)
		}
		cfg.TelemetryCapacity = n
	}
	if v := getenv("AIRYN_MISSION_TICK_RATE"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return cfg, fmt.Errorf("AIRYN_MISSION_TICK_RATE: %w", err)
		}
		cfg.FlightTickRate = d
	}
	return cfg, nil
}
