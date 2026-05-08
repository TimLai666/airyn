package protocol

// FlightFrame is the slice of state the mission daemon expects to receive from
// the flight controller on every tick. It is intentionally a strict subset of
// the renderer's VehicleFrame: the FC owns gyro/accel, baro, battery, and the
// arming/safety bit, but it does not own the high-level mission state machine
// (current waypoint, mission mode, ground-loss policy). Mission keeps that.
type FlightFrame struct {
	Lat       float64 `json:"lat"`
	Lon       float64 `json:"lon"`
	Altitude  float64 `json:"altitude"`
	Speed     float64 `json:"speed"`
	Heading   float64 `json:"heading"`
	GPSActive bool    `json:"gpsActive"`
	GPSSats   int     `json:"gpsSats"`
	GPSHdop   float64 `json:"gpsHdop"`
	INSActive bool    `json:"insActive"`

	Roll  float64 `json:"roll"`
	Pitch float64 `json:"pitch"`
	Yaw   float64 `json:"yaw"`
	Thr   float64 `json:"thr"`
	Vbat  float64 `json:"vbat"`
	Armed bool    `json:"armed"`

	GyroX   float64 `json:"gyroX"`
	GyroY   float64 `json:"gyroY"`
	GyroZ   float64 `json:"gyroZ"`
	AccelX  float64 `json:"accelX"`
	AccelY  float64 `json:"accelY"`
	AccelZ  float64 `json:"accelZ"`
	BaroAlt float64 `json:"baroAlt"`
	BaroVs  float64 `json:"baroVs"`
	BaroP   float64 `json:"baroP"`
	BaroT   float64 `json:"baroT"`
	BatI    float64 `json:"batI"`
	BatUsed float64 `json:"batUsed"`
}

// FlightCommandKind names a high-level setpoint the mission daemon asks the
// flight controller to enforce. The FC still owns lower-level rate/attitude
// loops; mission only describes intent.
type FlightCommandKind string

const (
	FlightCmdArm     FlightCommandKind = "arm"
	FlightCmdDisarm  FlightCommandKind = "disarm"
	FlightCmdHold    FlightCommandKind = "hold"
	FlightCmdGoto    FlightCommandKind = "goto"
	FlightCmdTakeoff FlightCommandKind = "takeoff"
	FlightCmdLand    FlightCommandKind = "land"
	FlightCmdRTL     FlightCommandKind = "rtl"
	FlightCmdKill    FlightCommandKind = "kill"
)

// FlightCommand is the structured request the mission daemon sends down to
// the flight controller. Only the fields meaningful for Kind need to be set.
type FlightCommand struct {
	Kind FlightCommandKind `json:"kind"`
	Lat  float64           `json:"lat,omitempty"`
	Lon  float64           `json:"lon,omitempty"`
	Alt  float64           `json:"alt,omitempty"`
}
