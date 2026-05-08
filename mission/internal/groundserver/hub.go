// Package groundserver exposes the mission daemon over WebSocket so the
// ground app can connect to it the same way it connects to its in-process
// bun simulator. The wire format is the same protocol package used by both
// sides; the Hub only fans messages out and back.
package groundserver

import (
	"sync"
)

// Subscriber receives one already-encoded JSON payload at a time. The hub
// drops messages for a subscriber whose queue is full rather than blocking
// the broadcaster.
type Subscriber struct {
	send chan []byte
}

// Hub broadcasts encoded payloads to all currently connected ground clients.
type Hub struct {
	mu          sync.Mutex
	subscribers map[*Subscriber]struct{}
}

// NewHub constructs an empty hub.
func NewHub() *Hub {
	return &Hub{subscribers: map[*Subscriber]struct{}{}}
}

// Subscribe registers a new client. The returned channel receives encoded
// payloads; the caller must drain it. Use Unsubscribe to detach.
func (h *Hub) Subscribe(buffer int) *Subscriber {
	if buffer <= 0 {
		buffer = 16
	}
	sub := &Subscriber{send: make(chan []byte, buffer)}
	h.mu.Lock()
	h.subscribers[sub] = struct{}{}
	h.mu.Unlock()
	return sub
}

// Channel returns the subscriber's read channel.
func (s *Subscriber) Channel() <-chan []byte { return s.send }

// Unsubscribe detaches a client. Idempotent.
func (h *Hub) Unsubscribe(sub *Subscriber) {
	h.mu.Lock()
	if _, ok := h.subscribers[sub]; ok {
		delete(h.subscribers, sub)
		close(sub.send)
	}
	h.mu.Unlock()
}

// Count returns the current subscriber count.
func (h *Hub) Count() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.subscribers)
}

// Broadcast pushes an encoded payload to every subscriber. Slow subscribers
// drop the oldest queued payload to avoid blocking real-time telemetry.
func (h *Hub) Broadcast(payload []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for sub := range h.subscribers {
		select {
		case sub.send <- payload:
		default:
			// Make room by discarding the oldest, then enqueue.
			select {
			case <-sub.send:
			default:
			}
			select {
			case sub.send <- payload:
			default:
			}
		}
	}
}
