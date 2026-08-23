package telemetry

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

// HTTPMetrics holds the RED (Rate, Errors, Duration) instruments the Oblak
// dashboard charts for every service.
type HTTPMetrics struct {
	requests   metric.Int64Counter
	duration   metric.Float64Histogram
	inFlight   metric.Int64UpDownCounter
	reqBodySz  metric.Int64Histogram
	respBodySz metric.Int64Histogram
}

// NewHTTPMetrics registers the standard HTTP instruments for a service.
func NewHTTPMetrics(serviceName string) (*HTTPMetrics, error) {
	meter := otel.GetMeterProvider().Meter(serviceName)

	requests, err := meter.Int64Counter(
		"http.server.request.count",
		metric.WithDescription("Total HTTP requests handled"),
		metric.WithUnit("{request}"),
	)
	if err != nil {
		return nil, err
	}

	duration, err := meter.Float64Histogram(
		"http.server.request.duration",
		metric.WithDescription("HTTP request latency"),
		metric.WithUnit("ms"),
		// Buckets tuned for an API gateway: most calls are single-digit ms,
		// but function invocations and object uploads reach seconds.
		metric.WithExplicitBucketBoundaries(1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000),
	)
	if err != nil {
		return nil, err
	}

	inFlight, err := meter.Int64UpDownCounter(
		"http.server.active_requests",
		metric.WithDescription("Requests currently being served"),
		metric.WithUnit("{request}"),
	)
	if err != nil {
		return nil, err
	}

	reqBodySz, err := meter.Int64Histogram(
		"http.server.request.body.size",
		metric.WithDescription("HTTP request body size"),
		metric.WithUnit("By"),
	)
	if err != nil {
		return nil, err
	}

	respBodySz, err := meter.Int64Histogram(
		"http.server.response.body.size",
		metric.WithDescription("HTTP response body size"),
		metric.WithUnit("By"),
	)
	if err != nil {
		return nil, err
	}

	return &HTTPMetrics{
		requests:   requests,
		duration:   duration,
		inFlight:   inFlight,
		reqBodySz:  reqBodySz,
		respBodySz: respBodySz,
	}, nil
}

// statusRecorder captures the status code and body size, which the standard
// http.ResponseWriter does not expose after the fact.
type statusRecorder struct {
	http.ResponseWriter
	status  int
	written int64
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(b)
	r.written += int64(n)
	return n, err
}

// Flush lets streaming handlers keep working through the wrapper.
func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Middleware returns mux middleware that records a span, RED metrics and an
// access log line for every request, all sharing the same trace id.
//
// Pass the route template (not the raw path) as the metric dimension so that
// /functions/a and /functions/b aggregate together instead of exploding
// cardinality in ClickHouse.
func (t *Telemetry) Middleware(serviceName string, m *HTTPMetrics) mux.MiddlewareFunc {
	logger := t.Logger

	return func(next http.Handler) http.Handler {
		instrumented := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()

			route := routeTemplate(r)
			rec := &statusRecorder{ResponseWriter: w, status: 0}

			baseAttrs := []attribute.KeyValue{
				attribute.String("http.request.method", r.Method),
				attribute.String("http.route", route),
				attribute.String("service.name", serviceName),
			}

			if m != nil {
				m.inFlight.Add(r.Context(), 1, metric.WithAttributes(baseAttrs...))
				defer m.inFlight.Add(r.Context(), -1, metric.WithAttributes(baseAttrs...))
				if r.ContentLength > 0 {
					m.reqBodySz.Record(r.Context(), r.ContentLength, metric.WithAttributes(baseAttrs...))
				}
			}

			next.ServeHTTP(rec, r)

			if rec.status == 0 {
				rec.status = http.StatusOK
			}
			elapsed := time.Since(start)

			attrs := append(baseAttrs,
				attribute.Int("http.response.status_code", rec.status),
				attribute.String("http.response.status_class", statusClass(rec.status)),
			)

			if m != nil {
				m.requests.Add(r.Context(), 1, metric.WithAttributes(attrs...))
				m.duration.Record(r.Context(), float64(elapsed.Milliseconds()), metric.WithAttributes(attrs...))
				m.respBodySz.Record(r.Context(), rec.written, metric.WithAttributes(attrs...))
			}

			logAccess(r.Context(), logger, r, route, rec.status, elapsed, rec.written)
		})

		// otelhttp creates the server span and extracts inbound trace context,
		// so a request that started in the browser stays on one trace.
		return otelhttp.NewHandler(instrumented, "http.server",
			otelhttp.WithSpanNameFormatter(func(_ string, r *http.Request) string {
				return r.Method + " " + routeTemplate(r)
			}),
		)
	}
}

// routeTemplate returns the mux route pattern (e.g. /api/v1/functions/{name})
// so metrics and spans group by endpoint rather than by concrete id.
func routeTemplate(r *http.Request) string {
	if route := mux.CurrentRoute(r); route != nil {
		if tpl, err := route.GetPathTemplate(); err == nil {
			return tpl
		}
	}
	return r.URL.Path
}

func statusClass(code int) string {
	return strconv.Itoa(code/100) + "xx"
}

func logAccess(ctx context.Context, logger *slog.Logger, r *http.Request, route string, status int, elapsed time.Duration, written int64) {
	if logger == nil {
		return
	}

	attrs := []any{
		slog.String("http.request.method", r.Method),
		slog.String("http.route", route),
		slog.String("url.path", r.URL.Path),
		slog.Int("http.response.status_code", status),
		slog.Int64("http.server.duration_ms", elapsed.Milliseconds()),
		slog.Int64("http.response.body.size", written),
		slog.String("client.address", clientIP(r)),
	}

	// Carrying the ids explicitly means a log line remains linkable to its
	// trace even when viewed outside the log explorer.
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		attrs = append(attrs,
			slog.String("trace_id", sc.TraceID().String()),
			slog.String("span_id", sc.SpanID().String()),
		)
	}

	switch {
	case status >= 500:
		logger.ErrorContext(ctx, "http request failed", attrs...)
	case status >= 400:
		logger.WarnContext(ctx, "http request rejected", attrs...)
	default:
		logger.InfoContext(ctx, "http request", attrs...)
	}
}

func clientIP(r *http.Request) string {
	// Behind the Oblak dashboard the real client is in X-Forwarded-For.
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		if idx := indexByte(fwd, ','); idx > 0 {
			return fwd[:idx]
		}
		return fwd
	}
	return r.RemoteAddr
}

func indexByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}
