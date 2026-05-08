// Package flightlink abstracts the connection between the mission daemon and
// the flight controller. The mission daemon does not know whether frames are
// arriving over USB serial, UDP, or a synthetic stub.
//
// Real serial/UDP transports will be implemented as separate types in this
// package. The contract is the same: emit FlightFrames at roughly the
// configured rate, accept FlightCommands without blocking the engine, and
// surface health changes.
package flightlink

import (
	"context"

	"github.com/TimLai666/airyn-flight/mission/internal/protocol"
)

// Health is the link's view of the flight controller link.
type Health struct {
	Healthy bool
	// Reason is a stable key for ground-side i18n when Healthy is false.
	Reason string
}

// Link is what the engine consumes. Frames is closed by the implementation
// when the link is shutting down.
type Link interface {
	// Frames returns the channel of incoming flight frames.
	Frames() <-chan protocol.FlightFrame
	// Health returns the channel of health transitions.
	Health() <-chan Health
	// Send delivers a command to the flight controller. It must not block on
	// transport I/O for longer than a single tick; transports should buffer.
	Send(ctx context.Context, cmd protocol.FlightCommand) error
	// Close releases the link.
	Close() error
}
