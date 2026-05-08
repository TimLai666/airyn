// Package protocol defines the JSON wire format the mission daemon speaks to
// ground stations. It mirrors ground/src/shared/protocol.ts so the existing
// Electrobun renderer can connect to a mission computer with the same parser
// it already uses against the in-process bun simulator.
package protocol

import (
	"encoding/json"
	"errors"
	"fmt"
)

// LinkMode is how ground reaches the flight controller.
type LinkMode string

const (
	LinkDirect     LinkMode = "direct"
	LinkViaMission LinkMode = "via-mission"
)

// LinkTransport describes the underlying carrier of a vehicle link.
type LinkTransport string

const (
	TransportSerial LinkTransport = "serial"
	TransportUDP    LinkTransport = "udp"
	TransportTCP    LinkTransport = "tcp"
	TransportWS     LinkTransport = "ws"
)

// VehicleColor matches the renderer color palette.
type VehicleColor string

const (
	ColorOchre VehicleColor = "ochre"
	ColorIce   VehicleColor = "ice"
	ColorOK    VehicleColor = "ok"
)

// LogLevel matches the renderer log severity scale.
type LogLevel string

const (
	LogInfo LogLevel = "info"
	LogWarn LogLevel = "warn"
	LogErr  LogLevel = "err"
)

// VehicleMode is the high-level flight mode reported to ground.
type VehicleMode string

const (
	ModeStandby VehicleMode = "standby"
	ModeManual  VehicleMode = "manual"
	ModeTakeoff VehicleMode = "takeoff"
	ModeHold    VehicleMode = "hold"
	ModeMission VehicleMode = "mission"
	ModeRTL     VehicleMode = "rtl"
	ModeLand    VehicleMode = "land"
)

// SafetyState is the supervisor's view of arming.
type SafetyState string

const (
	SafetyOffline   SafetyState = "offline"
	SafetyPreflight SafetyState = "preflight"
	SafetyArmed     SafetyState = "armed"
	SafetyFailsafe  SafetyState = "failsafe"
)

// VehicleCommand is an operator command from ground.
type VehicleCommand string

const (
	CmdArm     VehicleCommand = "arm"
	CmdDisarm  VehicleCommand = "disarm"
	CmdTakeoff VehicleCommand = "takeoff"
	CmdHold    VehicleCommand = "hold"
	CmdMission VehicleCommand = "mission"
	CmdRTL     VehicleCommand = "rtl"
	CmdLand    VehicleCommand = "land"
	CmdKill    VehicleCommand = "kill"
)

// WaypointType is the high-level intent of a single mission step.
type WaypointType string

const (
	WaypointTakeoff WaypointType = "takeoff"
	WaypointGo      WaypointType = "waypoint"
	WaypointLand    WaypointType = "land"
)

// VehicleLink describes the active transport for a vehicle.
type VehicleLink struct {
	Mode      LinkMode      `json:"mode"`
	Transport LinkTransport `json:"transport"`
	Endpoint  string        `json:"endpoint"`
}

// VehicleConfig is the per-vehicle static data sent in the hello message.
type VehicleConfig struct {
	ID       string       `json:"id"`
	Callsign string       `json:"callsign"`
	Color    VehicleColor `json:"color"`
	Link     VehicleLink  `json:"link"`
}

// MissionWaypoint matches the renderer's waypoint shape.
type MissionWaypoint struct {
	Type WaypointType `json:"type"`
	Lat  float64      `json:"lat"`
	Lon  float64      `json:"lon"`
	Alt  float64      `json:"alt"`
}

// VehicleFrame is a 10 Hz telemetry snapshot.
//
// LinkActive=false means we are echoing the last good frame so the renderer
// can dead-reckon. The mission daemon flips this when its link to the flight
// controller is unhealthy, mirroring the semantics ground already implements
// for its in-process simulator.
type VehicleFrame struct {
	ID         string `json:"id"`
	Flight     bool   `json:"flight"`
	LinkActive bool   `json:"linkActive"`

	Lat       float64 `json:"lat"`
	Lon       float64 `json:"lon"`
	Altitude  float64 `json:"altitude"`
	Speed     float64 `json:"speed"`
	Heading   float64 `json:"heading"`
	GPSActive bool    `json:"gpsActive"`
	GPSSats   int     `json:"gpsSats"`
	GPSHdop   float64 `json:"gpsHdop"`
	INSActive bool    `json:"insActive"`

	Mode               VehicleMode `json:"mode"`
	SafetyState        SafetyState `json:"safetyState"`
	PreflightOK        bool        `json:"preflightOk"`
	MissionUploaded    bool        `json:"missionUploaded"`
	MissionCount       int         `json:"missionCount"`
	MissionActiveIndex *int        `json:"missionActiveIndex"`

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

// HelloMessage is the per-connection greeting sent immediately after a ground
// client opens the WebSocket.
type HelloMessage struct {
	Type     string          `json:"type"` // always "hello"
	Build    string          `json:"build"`
	Port     int             `json:"port"`
	Vehicles []VehicleConfig `json:"vehicles"`
}

// FleetMessage is the periodic 10 Hz fleet snapshot.
type FleetMessage struct {
	Type     string         `json:"type"` // always "fleet"
	T        float64        `json:"t"`
	Flight   bool           `json:"flight"`
	Vehicles []VehicleFrame `json:"vehicles"`
}

// LogMessage is a structured log line; ground translates the keys via i18n.
type LogMessage struct {
	Type    string   `json:"type"` // always "log"
	Level   LogLevel `json:"level"`
	TagKey  string   `json:"tagKey"`
	MsgKey  string   `json:"msgKey"`
	MsgArgs []any    `json:"msgArgs,omitempty"`
}

// NewHello constructs a HelloMessage with the discriminator set.
func NewHello(build string, port int, vehicles []VehicleConfig) HelloMessage {
	return HelloMessage{Type: "hello", Build: build, Port: port, Vehicles: vehicles}
}

// NewFleet constructs a FleetMessage with the discriminator set.
func NewFleet(t float64, flight bool, vehicles []VehicleFrame) FleetMessage {
	return FleetMessage{Type: "fleet", T: t, Flight: flight, Vehicles: vehicles}
}

// NewLog constructs a LogMessage with the discriminator set.
func NewLog(level LogLevel, tagKey, msgKey string, args ...any) LogMessage {
	return LogMessage{Type: "log", Level: level, TagKey: tagKey, MsgKey: msgKey, MsgArgs: args}
}

// ClientMessageType is the discriminator on incoming messages.
type ClientMessageType string

const (
	ClientConnect       ClientMessageType = "connect"
	ClientDisconnect    ClientMessageType = "disconnect"
	ClientConfigureLink ClientMessageType = "configureLink"
	ClientCommand       ClientMessageType = "command"
	ClientUploadPlan    ClientMessageType = "uploadPlan"
	ClientCalibration   ClientMessageType = "calibration"
)

// ClientMessage is the union of operator actions ground can send.
//
// The renderer never sees this struct; it sends per-type JSON. Decoding looks
// only at the discriminator, then unmarshals into the matching struct.
type ClientMessage struct {
	Type      string            `json:"type"`
	ID        string            `json:"id,omitempty"`
	Link      *VehicleLink      `json:"link,omitempty"`
	Command   VehicleCommand    `json:"command,omitempty"`
	Waypoints []MissionWaypoint `json:"waypoints,omitempty"`
	Step      int               `json:"step,omitempty"`
	Capture   int               `json:"capture,omitempty"`
	Done      bool              `json:"done,omitempty"`
}

// DecodeClientMessage parses one JSON object from the renderer.
func DecodeClientMessage(raw []byte) (ClientMessage, error) {
	var msg ClientMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		return ClientMessage{}, fmt.Errorf("decode client message: %w", err)
	}
	if msg.Type == "" {
		return ClientMessage{}, errors.New("client message missing type discriminator")
	}
	return msg, nil
}

// BridgePort matches ground/src/shared/protocol.ts BRIDGE_PORT, used when
// the mission daemon mimics the ground bridge endpoint for development.
const BridgePort = 7711

// MissionPort is the conventional port the mission computer exposes for
// ground clients in via-mission link mode.
const MissionPort = 7700
