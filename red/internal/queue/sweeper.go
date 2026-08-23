// Package queue holds Red's background maintenance: the sweeper that enforces
// the visibility-timeout state machine over time.
//
// Receive() only hides a message and stamps a deadline; something has to bring
// a message back when that deadline passes without a delete. That is the
// sweeper: on a fixed tick it asks the store to release timed-out in-flight
// messages, dead-letter those that have been received too many times, and drop
// messages past their retention. Doing this on a schedule (rather than lazily
// on the next receive) keeps queue depth and message age honest even for an
// idle queue, and is what makes dead-lettering and retention actually happen.
package queue

import (
	"context"
	"log/slog"
	"time"

	"github.com/oblak/red/internal/store"
)

// Sweeper periodically runs the store's expiry pass.
type Sweeper struct {
	store    store.Store
	logger   *slog.Logger
	interval time.Duration
}

// NewSweeper builds a sweeper. interval is clamped to a sane floor so a
// misconfiguration cannot spin.
func NewSweeper(st store.Store, logger *slog.Logger, interval time.Duration) *Sweeper {
	if interval < time.Second {
		interval = 5 * time.Second
	}
	return &Sweeper{store: st, logger: logger, interval: interval}
}

// Run sweeps on every tick until the context is cancelled. Blocking; call it in
// its own goroutine.
func (s *Sweeper) Run(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			s.sweep(ctx, now)
		}
	}
}

func (s *Sweeper) sweep(ctx context.Context, now time.Time) {
	released, deadLettered, expired, err := s.store.ReleaseExpired(ctx, now)
	if err != nil {
		s.logger.Warn("red sweep failed", "error", err)
		return
	}
	if released+deadLettered+expired > 0 {
		s.logger.Info("red sweep",
			"released", released, "dead_lettered", deadLettered, "expired", expired)
	}
}
