package app

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"
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

func TestRunWritesStartupLine(t *testing.T) {
	var out bytes.Buffer

	if err := Run(context.Background(), &out); err != nil {
		t.Fatalf("Run returned error: %v", err)
	}

	line := out.String()
	if !strings.Contains(line, "airyn mission online") {
		t.Fatalf("startup line %q does not contain mission status", line)
	}
}
