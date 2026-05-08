package telemetry

import (
	"math"
	"testing"
	"time"
)

func TestBufferAppendCapsCapacity(t *testing.T) {
	buf := NewBuffer(3)

	for i := 0; i < 5; i++ {
		buf.Append(Sample{T: float64(i), Vbat: 22.0 - float64(i)*0.1})
	}

	if got := buf.Len(); got != 3 {
		t.Fatalf("Len = %d, want 3", got)
	}

	s := buf.Summary()
	if s.Samples != 3 {
		t.Fatalf("summary samples = %d, want 3", s.Samples)
	}
	if s.OldestT != 2 || s.NewestT != 4 {
		t.Fatalf("expected window [2,4], got [%v,%v]", s.OldestT, s.NewestT)
	}
}

func TestBufferSummaryStats(t *testing.T) {
	buf := NewBuffer(10)
	for i := 0; i < 5; i++ {
		buf.Append(Sample{
			T:        float64(i),
			Vbat:     20.0 + float64(i),       // 20..24, mean 22
			Speed:    float64(i),              // 0..4, max 4, mean 2
			GPSSats:  10,
			GPSHdop:  1.0,
			Armed:    i >= 3,                  // armed for last two
			BaroVs:   float64(i%2) * 0.5,      // alternating
			ReceivedAt: time.Now(),
		})
	}
	s := buf.Summary()

	if math.Abs(s.VbatMean-22.0) > 1e-9 {
		t.Fatalf("VbatMean = %v, want 22", s.VbatMean)
	}
	if math.Abs(s.SpeedMax-4.0) > 1e-9 {
		t.Fatalf("SpeedMax = %v, want 4", s.SpeedMax)
	}
	if math.Abs(s.ArmedRatio-0.4) > 1e-9 {
		t.Fatalf("ArmedRatio = %v, want 0.4", s.ArmedRatio)
	}
	if s.GPSSatsAvg != 10 {
		t.Fatalf("GPSSatsAvg = %v, want 10", s.GPSSatsAvg)
	}
	if s.WindowSeconds != 4 {
		t.Fatalf("WindowSeconds = %v, want 4", s.WindowSeconds)
	}
}

func TestBufferEmptySummary(t *testing.T) {
	buf := NewBuffer(4)
	s := buf.Summary()
	if s.Samples != 0 {
		t.Fatalf("empty buffer Samples = %d", s.Samples)
	}
}

func TestBufferReset(t *testing.T) {
	buf := NewBuffer(4)
	buf.Append(Sample{T: 1, Vbat: 22})
	buf.Append(Sample{T: 2, Vbat: 21})
	buf.Reset()
	if buf.Len() != 0 {
		t.Fatalf("after Reset Len = %d, want 0", buf.Len())
	}
}
