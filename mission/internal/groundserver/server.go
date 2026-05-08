package groundserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/TimLai666/airyn-flight/mission/internal/protocol"
)

// Engine is the subset of *engine.Engine the ground server needs. Defined as
// an interface so tests can drop in a fake without spinning up a flight link.
type Engine interface {
	Vehicle() protocol.VehicleConfig
	Snapshot() protocol.VehicleFrame
	Command(cmd protocol.VehicleCommand)
	UploadPlan(plan []protocol.MissionWaypoint)
	GroundConnected(connected bool)
}

// Config tunes the WebSocket server.
type Config struct {
	// Listen is the bind address, e.g. ":7700" or "127.0.0.1:0".
	Listen string
	// Build is the version string reported in hello.
	Build string
}

// Server hosts the WebSocket endpoint and a tiny health page.
type Server struct {
	cfg      Config
	hub      *Hub
	engine   Engine
	httpSrv  *http.Server
	listener net.Listener
	logger   io.Writer

	mu       sync.Mutex
	clientCt int
}

// New constructs the server but does not start listening; call Start.
//
// The engine may be nil at construction; call SetEngine before Start. This
// indirection avoids an awkward chicken-and-egg between the server (which the
// engine needs as a Listener) and the engine (which the server needs to
// dispatch commands).
func New(cfg Config, hub *Hub, eng Engine, logger io.Writer) *Server {
	if logger == nil {
		logger = io.Discard
	}
	if cfg.Build == "" {
		cfg.Build = "dev"
	}
	if cfg.Listen == "" {
		cfg.Listen = fmt.Sprintf(":%d", protocol.MissionPort)
	}
	return &Server{cfg: cfg, hub: hub, engine: eng, logger: logger}
}

// SetEngine attaches the engine after construction. Must be called before
// Start; otherwise WebSocket clients would receive empty hello messages.
func (s *Server) SetEngine(eng Engine) {
	s.mu.Lock()
	s.engine = eng
	s.mu.Unlock()
}

// OnFrame implements engine.Listener: encode a fleet message and broadcast.
func (s *Server) OnFrame(frame protocol.VehicleFrame) {
	msg := protocol.NewFleet(timeToSeconds(time.Now()), frame.Flight, []protocol.VehicleFrame{frame})
	if payload, err := json.Marshal(msg); err == nil {
		s.hub.Broadcast(payload)
	}
}

// OnLog implements engine.Listener: encode a log line and broadcast.
func (s *Server) OnLog(msg protocol.LogMessage) {
	if payload, err := json.Marshal(msg); err == nil {
		s.hub.Broadcast(payload)
	}
}

// Start binds the listener and serves until ctx is cancelled. Returns the
// effective listen address (useful when Listen=":0").
func (s *Server) Start(ctx context.Context) (string, error) {
	ln, err := net.Listen("tcp", s.cfg.Listen)
	if err != nil {
		return "", fmt.Errorf("listen %s: %w", s.cfg.Listen, err)
	}
	s.listener = ln

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleWS)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "Airyn Mission online\n")
	})

	s.httpSrv = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = s.httpSrv.Shutdown(shutdownCtx)
	}()

	go func() {
		if err := s.httpSrv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Fprintf(s.logger, "[airyn-mission] http serve: %v\n", err)
		}
	}()

	return ln.Addr().String(), nil
}

// Addr returns the bound address (only valid after Start).
func (s *Server) Addr() string {
	if s.listener == nil {
		return ""
	}
	return s.listener.Addr().String()
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	if r.Header.Get("Upgrade") == "" {
		// Fallback for plain HTTP probes (browsers, curl).
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "Airyn Mission bridge\n")
		return
	}

	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// Localhost ground UI is the expected client; allow it without a host
		// allowlist. Production deployments should proxy through TLS.
		InsecureSkipVerify: true,
	})
	if err != nil {
		fmt.Fprintf(s.logger, "[airyn-mission] ws accept: %v\n", err)
		return
	}
	defer c.CloseNow()

	ctx := r.Context()
	sub := s.hub.Subscribe(64)
	defer s.hub.Unsubscribe(sub)

	s.mu.Lock()
	s.clientCt++
	first := s.clientCt == 1
	s.mu.Unlock()
	if first {
		s.engine.GroundConnected(true)
	}
	defer func() {
		s.mu.Lock()
		s.clientCt--
		last := s.clientCt == 0
		s.mu.Unlock()
		if last {
			s.engine.GroundConnected(false)
		}
	}()

	if err := s.sendHello(ctx, c); err != nil {
		return
	}
	if err := s.sendInitialSnapshot(ctx, c); err != nil {
		return
	}

	// Reader pump: parse client commands.
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		for {
			var raw json.RawMessage
			if err := wsjson.Read(ctx, c, &raw); err != nil {
				return
			}
			msg, err := protocol.DecodeClientMessage(raw)
			if err != nil {
				fmt.Fprintf(s.logger, "[airyn-mission] bad client message: %v\n", err)
				continue
			}
			s.dispatch(msg)
		}
	}()

	// Writer pump: drain hub messages to this socket.
	for {
		select {
		case <-ctx.Done():
			return
		case <-readDone:
			return
		case payload, ok := <-sub.Channel():
			if !ok {
				return
			}
			writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := c.Write(writeCtx, websocket.MessageText, payload)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func (s *Server) sendHello(ctx context.Context, c *websocket.Conn) error {
	port, _ := portFromAddr(s.Addr())
	hello := protocol.NewHello(s.cfg.Build, port, []protocol.VehicleConfig{s.engine.Vehicle()})
	return wsjson.Write(ctx, c, hello)
}

func (s *Server) sendInitialSnapshot(ctx context.Context, c *websocket.Conn) error {
	frame := s.engine.Snapshot()
	msg := protocol.NewFleet(0, frame.Flight, []protocol.VehicleFrame{frame})
	return wsjson.Write(ctx, c, msg)
}

func (s *Server) dispatch(msg protocol.ClientMessage) {
	switch protocol.ClientMessageType(msg.Type) {
	case protocol.ClientConnect, protocol.ClientDisconnect:
		// Mission daemons supervise a single airframe. Ignore connect/disconnect
		// at the wire level; the FC link is owned by the daemon, not the operator.
	case protocol.ClientConfigureLink:
		// No-op for now: changing the mission<->flight transport at runtime
		// requires restarting the daemon. Future work.
	case protocol.ClientCommand:
		if msg.Command == "" {
			return
		}
		s.engine.Command(msg.Command)
	case protocol.ClientUploadPlan:
		s.engine.UploadPlan(msg.Waypoints)
	case protocol.ClientCalibration:
		// Calibration captures will be forwarded to the FC once a calibration
		// service exists. Logged here for observability.
		fmt.Fprintf(s.logger, "[airyn-mission] cal step=%d capture=%d done=%v\n",
			msg.Step, msg.Capture, msg.Done)
	}
}

func portFromAddr(addr string) (int, error) {
	_, p, err := net.SplitHostPort(addr)
	if err != nil {
		return 0, err
	}
	var port int
	_, err = fmt.Sscanf(p, "%d", &port)
	return port, err
}

func timeToSeconds(t time.Time) float64 {
	return float64(t.UnixMilli()) / 1000.0
}
