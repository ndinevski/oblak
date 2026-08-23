package telemetry

import (
	"context"
	"log/slog"
)

// fanoutHandler writes every record to several slog handlers.
//
// Oblak ships logs to the telemetry store, but a service whose logs are only
// visible in ClickHouse becomes undebuggable exactly when the telemetry stack
// is the thing that is down. So records go to both the OTel bridge and stderr.
type fanoutHandler struct {
	handlers []slog.Handler
}

func newFanoutHandler(handlers ...slog.Handler) slog.Handler {
	return &fanoutHandler{handlers: handlers}
}

func (h *fanoutHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, inner := range h.handlers {
		if inner.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (h *fanoutHandler) Handle(ctx context.Context, record slog.Record) error {
	// A failing destination must not stop the others, so errors are collected
	// rather than returned on the first failure.
	var firstErr error
	for _, inner := range h.handlers {
		if !inner.Enabled(ctx, record.Level) {
			continue
		}
		// Each handler may retain the record, so hand out an independent copy.
		if err := inner.Handle(ctx, record.Clone()); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func (h *fanoutHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	next := make([]slog.Handler, len(h.handlers))
	for i, inner := range h.handlers {
		next[i] = inner.WithAttrs(attrs)
	}
	return &fanoutHandler{handlers: next}
}

func (h *fanoutHandler) WithGroup(name string) slog.Handler {
	next := make([]slog.Handler, len(h.handlers))
	for i, inner := range h.handlers {
		next[i] = inner.WithGroup(name)
	}
	return &fanoutHandler{handlers: next}
}
