package queue

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/oblak/red/internal/models"
	"github.com/oblak/red/internal/store"
)

// Dispatcher delivers queued messages to Impuls functions.
//
// This is the piece that turns Red from a store into an integration: for each
// enabled subscription it receives a batch, invokes the target function once
// per message, and - on a 2xx - deletes the message. A non-2xx or an
// unreachable function leaves the message untouched, so the queue's visibility
// timeout redelivers it and, past the queue's max-receive-count, dead-letters
// it. Retry and dead-lettering therefore come entirely from the queue; the
// dispatcher only has to invoke and ack.
type Dispatcher struct {
	store      store.Store
	logger     *slog.Logger
	impulsBase string
	local      bool
	interval   time.Duration
	http       *http.Client
}

// NewDispatcher builds a dispatcher. It is inert unless impulsBase is set, so a
// deployment without Impuls simply never delivers. When local is true it
// invokes functions in Impuls's local execution mode (no Firecracker), for
// hosts where microVMs are unavailable.
func NewDispatcher(st store.Store, logger *slog.Logger, impulsBase string, local bool, interval time.Duration) *Dispatcher {
	if interval < time.Second {
		interval = 2 * time.Second
	}
	return &Dispatcher{
		store:      st,
		logger:     logger,
		impulsBase: impulsBase,
		local:      local,
		interval:   interval,
		// A per-invocation timeout well under a typical visibility timeout, so a
		// slow function does not hold a worker forever.
		http: &http.Client{Timeout: 25 * time.Second},
	}
}

// Enabled reports whether the dispatcher has somewhere to deliver.
func (d *Dispatcher) Enabled() bool { return d.impulsBase != "" }

// Run dispatches on every tick until the context is cancelled. Blocking; call
// it in its own goroutine.
func (d *Dispatcher) Run(ctx context.Context) {
	if !d.Enabled() {
		d.logger.Info("red dispatcher idle: no Impuls URL configured")
		return
	}
	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.dispatchAll(ctx)
		}
	}
}

func (d *Dispatcher) dispatchAll(ctx context.Context) {
	subs, err := d.store.ListSubscriptions(ctx)
	if err != nil {
		d.logger.Warn("red dispatcher: could not list subscriptions", "error", err)
		return
	}
	for i := range subs {
		sub := subs[i]
		if !sub.Enabled {
			continue
		}
		d.dispatchOne(ctx, &sub)
	}
}

func (d *Dispatcher) dispatchOne(ctx context.Context, sub *models.Subscription) {
	msgs, err := d.store.Receive(ctx, sub.Queue, sub.BatchSize, time.Now(), 0)
	if err != nil {
		// A deleted queue or transient error: record it and move on.
		_ = d.store.UpdateSubscriptionStats(ctx, sub.Name, 0, 0, err.Error(), time.Now())
		return
	}
	if len(msgs) == 0 {
		return
	}

	var delivered, failed int64
	var lastErr string
	for i := range msgs {
		m := msgs[i]
		if err := d.invoke(ctx, sub, &m); err != nil {
			failed++
			lastErr = err.Error()
			d.logger.Warn("red delivery failed",
				"subscription", sub.Name, "queue", sub.Queue, "function", sub.Function,
				"message_id", m.ID, "receive_count", m.ReceiveCount, "error", err)
			// Leave the message in-flight; the visibility timeout redelivers it.
			continue
		}
		// Success: ack the message so it is not redelivered.
		if derr := d.store.Delete(ctx, sub.Queue, m.ReceiptHandle); derr != nil {
			d.logger.Warn("red delivery succeeded but ack failed",
				"subscription", sub.Name, "message_id", m.ID, "error", derr)
		}
		delivered++
	}

	_ = d.store.UpdateSubscriptionStats(ctx, sub.Name, delivered, failed, lastErr, time.Now())
	if delivered > 0 {
		d.logger.Info("red delivered",
			"subscription", sub.Name, "function", sub.Function, "delivered", delivered, "failed", failed)
	}
}

// invoke POSTs one message to the subscription's function. The message becomes
// the invocation payload; the queue and message metadata travel in headers, and
// the message's captured trace context is propagated so producer, queue and
// function share one trace.
func (d *Dispatcher) invoke(ctx context.Context, sub *models.Subscription, m *models.Message) error {
	reqCtx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()

	// The function receives the raw message body as its event. If the body is
	// valid JSON it is forwarded as-is; otherwise it is wrapped so the function
	// always gets a JSON event.
	var payload []byte
	if json.Valid([]byte(m.Body)) {
		payload = []byte(m.Body)
	} else {
		payload, _ = json.Marshal(map[string]string{"body": m.Body})
	}

	url := sub.InvokeURL(d.impulsBase)
	if d.local {
		url += "?local=true"
	}
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Red-Queue", sub.Queue)
	req.Header.Set("X-Red-Message-Id", m.ID)
	req.Header.Set("X-Red-Receive-Count", fmt.Sprintf("%d", m.ReceiveCount))
	// Continue the producer's trace into the function invocation.
	for k, v := range m.TraceContext {
		req.Header.Set(k, v)
	}

	resp, err := d.http.Do(req)
	if err != nil {
		return fmt.Errorf("invoke %s: %w", sub.Function, err)
	}
	defer resp.Body.Close()
	// Drain the body so the connection can be reused.
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("function returned %d: %s", resp.StatusCode, truncate(string(body), 200))
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
