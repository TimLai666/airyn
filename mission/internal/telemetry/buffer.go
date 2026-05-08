// Package telemetry stores recent flight frames in an Insyra DataTable so the
// mission daemon can compute rolling statistics (battery trend, baro variance,
// GPS quality) without hand-written reductions. Insyra is the project's
// preferred data-processing layer per AGENTS.md.
package telemetry

import (
	"sync"
	"time"

	"github.com/HazelnutParadise/insyra"
	"github.com/TimLai666/airyn-flight/mission/internal/protocol"
)

// Column names in the rolling DataTable. Centralising them avoids scattered
// string literals when adding new analytics.
const (
	colT       = "t"
	colLat     = "lat"
	colLon     = "lon"
	colAlt     = "alt"
	colSpeed   = "speed"
	colVbat    = "vbat"
	colBatI    = "batI"
	colBatUsed = "batUsed"
	colBaroAlt = "baroAlt"
	colBaroVs  = "baroVs"
	colGPSSats = "gpsSats"
	colGPSHdop = "gpsHdop"
	colArmed   = "armed"
)

// Sample is the minimal record persisted into the buffer per tick.
type Sample struct {
	T          float64
	Lat        float64
	Lon        float64
	Altitude   float64
	Speed      float64
	Vbat       float64
	BatI       float64
	BatUsed    float64
	BaroAlt    float64
	BaroVs     float64
	GPSSats    int
	GPSHdop    float64
	Armed      bool
	ReceivedAt time.Time
}

// SampleFromFlight converts a flight frame to a buffer sample at simulator
// time t.
func SampleFromFlight(t float64, f protocol.FlightFrame, now time.Time) Sample {
	return Sample{
		T:          t,
		Lat:        f.Lat,
		Lon:        f.Lon,
		Altitude:   f.Altitude,
		Speed:      f.Speed,
		Vbat:       f.Vbat,
		BatI:       f.BatI,
		BatUsed:    f.BatUsed,
		BaroAlt:    f.BaroAlt,
		BaroVs:     f.BaroVs,
		GPSSats:    f.GPSSats,
		GPSHdop:    f.GPSHdop,
		Armed:      f.Armed,
		ReceivedAt: now,
	}
}

// Summary is a snapshot of the rolling analytics. All values are zero when no
// samples are present.
type Summary struct {
	Samples       int
	WindowSeconds float64

	VbatMean   float64
	VbatMin    float64
	VbatStdev  float64
	BaroVsStd  float64
	GPSSatsAvg float64
	GPSHdopAvg float64
	SpeedMean  float64
	SpeedMax   float64

	ArmedRatio float64 // fraction of the window the FC was armed
	OldestT    float64
	NewestT    float64
}

// Buffer is a fixed-capacity ring of recent samples backed by an Insyra
// DataTable. Reads and writes are serialised by a single mutex so the
// telemetry pipeline can publish summaries while the engine is appending.
//
// Capacity is in samples, not seconds. Pair it with the FC tick rate (e.g.
// 10 Hz × 60 s = 600).
type Buffer struct {
	mu       sync.Mutex
	capacity int
	table    *insyra.DataTable
}

// NewBuffer constructs an empty buffer with the given capacity. Capacity must
// be > 0.
func NewBuffer(capacity int) *Buffer {
	if capacity <= 0 {
		capacity = 1
	}
	dt := insyra.NewDataTable(
		insyra.NewDataList().SetName(colT),
		insyra.NewDataList().SetName(colLat),
		insyra.NewDataList().SetName(colLon),
		insyra.NewDataList().SetName(colAlt),
		insyra.NewDataList().SetName(colSpeed),
		insyra.NewDataList().SetName(colVbat),
		insyra.NewDataList().SetName(colBatI),
		insyra.NewDataList().SetName(colBatUsed),
		insyra.NewDataList().SetName(colBaroAlt),
		insyra.NewDataList().SetName(colBaroVs),
		insyra.NewDataList().SetName(colGPSSats),
		insyra.NewDataList().SetName(colGPSHdop),
		insyra.NewDataList().SetName(colArmed),
	)
	return &Buffer{capacity: capacity, table: dt}
}

// Capacity returns the configured capacity.
func (b *Buffer) Capacity() int { return b.capacity }

// Len returns the current sample count.
func (b *Buffer) Len() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.table.NumRows()
}

// Append inserts one sample. When capacity would be exceeded, the oldest
// sample is dropped first (FIFO).
func (b *Buffer) Append(s Sample) {
	b.mu.Lock()
	defer b.mu.Unlock()

	armed := 0.0
	if s.Armed {
		armed = 1.0
	}

	row := map[string]any{
		colT:       s.T,
		colLat:     s.Lat,
		colLon:     s.Lon,
		colAlt:     s.Altitude,
		colSpeed:   s.Speed,
		colVbat:    s.Vbat,
		colBatI:    s.BatI,
		colBatUsed: s.BatUsed,
		colBaroAlt: s.BaroAlt,
		colBaroVs:  s.BaroVs,
		colGPSSats: float64(s.GPSSats),
		colGPSHdop: s.GPSHdop,
		colArmed:   armed,
	}
	b.table.AppendRowsByColName(row)

	for b.table.NumRows() > b.capacity {
		b.table.DropRowsByIndex(0)
	}
}

// Summary computes rolling statistics over the current window. Cheap enough
// to call once per tick: O(N) over the buffer columns.
func (b *Buffer) Summary() Summary {
	b.mu.Lock()
	defer b.mu.Unlock()

	n := b.table.NumRows()
	if n == 0 {
		return Summary{}
	}

	tCol := b.table.GetColByName(colT)
	vbatCol := b.table.GetColByName(colVbat)
	baroVs := b.table.GetColByName(colBaroVs)
	sats := b.table.GetColByName(colGPSSats)
	hdop := b.table.GetColByName(colGPSHdop)
	speed := b.table.GetColByName(colSpeed)
	armed := b.table.GetColByName(colArmed)

	oldest := tCol.Min()
	newest := tCol.Max()
	window := newest - oldest

	return Summary{
		Samples:       n,
		WindowSeconds: window,
		VbatMean:      vbatCol.Mean(),
		VbatMin:       vbatCol.Min(),
		VbatStdev:     vbatCol.Stdev(),
		BaroVsStd:     baroVs.Stdev(),
		GPSSatsAvg:    sats.Mean(),
		GPSHdopAvg:    hdop.Mean(),
		SpeedMean:     speed.Mean(),
		SpeedMax:      speed.Max(),
		ArmedRatio:    armed.Mean(),
		OldestT:       oldest,
		NewestT:       newest,
	}
}

// Reset drops all samples while keeping the column layout.
func (b *Buffer) Reset() {
	b.mu.Lock()
	defer b.mu.Unlock()
	for b.table.NumRows() > 0 {
		b.table.DropRowsByIndex(0)
	}
}
