package app

import (
	"context"
	"fmt"
	"io"
	"time"
)

const version = "0.1.0-dev"

// Runtime describes the mission computer process state.
type Runtime struct {
	Version   string
	StartedAt time.Time
}

// NewRuntime creates a mission runtime state snapshot.
func NewRuntime(now time.Time) Runtime {
	return Runtime{
		Version:   version,
		StartedAt: now.UTC(),
	}
}

// Run starts the mission computer process.
func Run(ctx context.Context, out io.Writer) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	runtime := NewRuntime(time.Now())
	_, err := fmt.Fprintf(
		out,
		"airyn mission online version=%s started_at=%s\n",
		runtime.Version,
		runtime.StartedAt.Format(time.RFC3339),
	)
	return err
}
