package app

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/TimLai666/airyn-flight/mission/internal/config"
)

func TestNewRuntimeUsesUTC(t *testing.T) {
	runtime := NewRuntime(time.Date(2026, 4, 26, 11, 30, 0, 0, time.FixedZone("TST", 8*60*60)))

	if runtime.Version == "" {
		t.Fatal("version is empty")
	}
	if runtime.StartedAt.Location() != time.UTC {
		t.Fatalf("StartedAt location = %v, want UTC", runtime.StartedAt.Location())
	}
}

// safeBuffer is a goroutine-safe wrapper around bytes.Buffer for the long-
// running Run goroutine that writes startup lines while the test reads them.
type safeBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *safeBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *safeBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func TestRunWritesStartupLine(t *testing.T) {
	cfg := config.Default()
	cfg.Listen = "127.0.0.1:0"      // ephemeral port — never collides
	cfg.TelemetryCapacity = 16      // tiny buffer, faster test
	cfg.FlightTickRate = 25 * time.Millisecond

	out := &safeBuffer{}
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan error, 1)
	go func() { done <- RunWithConfig(ctx, out, cfg) }()

	deadline := time.After(2 * time.Second)
	for {
		if strings.Contains(out.String(), "airyn mission online") {
			break
		}
		select {
		case <-deadline:
			cancel()
			t.Fatalf("startup line never appeared, got: %q", out.String())
		case <-time.After(10 * time.Millisecond):
		}
	}

	cancel()
	select {
	case err := <-done:
		if err != nil && !errors.Is(err, context.Canceled) {
			t.Fatalf("Run returned error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
}
