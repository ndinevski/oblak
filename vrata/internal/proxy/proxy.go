// Package proxy is Vrata's data plane: the reverse proxy that fronts Brod
// containers and Izvor VMs and, crucially, records a trace, an access log and
// RED metrics for every request that passes through it. That per-request record
// is the whole point of Vrata: without it, traffic to a workload is invisible,
// because the workload runs the operator's own image and is not instrumented.
package proxy

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	oteltrace "go.opentelemetry.io/otel/trace"

	"github.com/oblak/vrata/internal/models"
	"github.com/oblak/vrata/internal/routes"
)

// Metrics holds the RED instruments the dashboard charts for proxied traffic,
// mirroring the ones the service APIs emit so gateway traffic sits alongside
// them on the same charts.
type Metrics struct {
	requests metric.Int64Counter
	duration metric.Float64Histogram
	inFlight metric.Int64UpDownCounter
	respSize metric.Int64Histogram
}

// NewMetrics registers the proxy's HTTP instruments.
func NewMetrics() (*Metrics, error) {
	meter := otel.GetMeterProvider().Meter("vrata")

	requests, err := meter.Int64Counter("http.server.request.count",
		metric.WithDescription("Proxied requests handled"), metric.WithUnit("{request}"))
	if err != nil {
		return nil, err
	}
	duration, err := meter.Float64Histogram("http.server.request.duration",
		metric.WithDescription("Proxied request latency"), metric.WithUnit("ms"),
		metric.WithExplicitBucketBoundaries(1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000))
	if err != nil {
		return nil, err
	}
	inFlight, err := meter.Int64UpDownCounter("http.server.active_requests",
		metric.WithDescription("Proxied requests in flight"), metric.WithUnit("{request}"))
	if err != nil {
		return nil, err
	}
	respSize, err := meter.Int64Histogram("http.server.response.body.size",
		metric.WithDescription("Proxied response body size"), metric.WithUnit("By"))
	if err != nil {
		return nil, err
	}
	return &Metrics{requests: requests, duration: duration, inFlight: inFlight, respSize: respSize}, nil
}

// Handler is the data-plane HTTP handler. It matches each request to a route,
// forwards it, and records the request.
type Handler struct {
	table   *routes.Table
	logger  *slog.Logger
	metrics *Metrics
	tracer  oteltrace.Tracer
	// transport is shared across all upstreams so connections are pooled rather
	// than reopened per request.
	transport http.RoundTripper
}

// NewHandler builds the proxy handler. logger and metrics may be nil, which
// disables that signal without disabling proxying.
func NewHandler(table *routes.Table, logger *slog.Logger, metrics *Metrics) *Handler {
	return &Handler{
		table:   table,
		logger:  logger,
		metrics: metrics,
		tracer:  otel.Tracer("vrata"),
		transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			DialContext: (&net.Dialer{
				Timeout:   10 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			MaxIdleConns:          100,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
		},
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	route, forwardPath, ok := h.table.Match(r.Host, r.URL.Path)

	// Continue any inbound trace so a request that began in the browser or the
	// dashboard stays on one trace through the gateway. Every request gets a
	// span, matched or not, so every access-log line correlates to a trace.
	ctx := otel.GetTextMapPropagator().Extract(r.Context(), propagation.HeaderCarrier(r.Header))
	spanName := "PROXY (unmatched)"
	spanAttrs := []attribute.KeyValue{
		attribute.String("service.name", "vrata"),
		attribute.String("http.request.method", r.Method),
		attribute.String("url.path", r.URL.Path),
	}
	if ok {
		spanName = "PROXY " + route.Name
		spanAttrs = append(spanAttrs,
			attribute.String("vrata.route", route.Name),
			attribute.String("vrata.route.kind", string(route.Kind)),
			attribute.String("vrata.upstream", route.Upstream),
			attribute.String("vrata.target", route.Target),
			attribute.String("server.address", route.Upstream),
		)
	}
	ctx, span := h.tracer.Start(ctx, spanName,
		oteltrace.WithSpanKind(oteltrace.SpanKindServer),
		oteltrace.WithAttributes(spanAttrs...),
	)
	defer span.End()

	if !ok {
		// A 404 here usually means a route is missing or misspelled, which is
		// exactly the kind of thing the operator needs to see.
		span.SetAttributes(attribute.Int("http.response.status_code", http.StatusNotFound))
		h.record(ctx, r, nil, http.StatusNotFound, 0, time.Since(start))
		http.Error(w, "no Vrata route matches this request", http.StatusNotFound)
		return
	}

	if h.metrics != nil {
		attrs := metric.WithAttributes(
			attribute.String("http.request.method", r.Method),
			attribute.String("vrata.route", route.Name),
			attribute.String("service.name", "vrata"),
		)
		h.metrics.inFlight.Add(ctx, 1, attrs)
		defer h.metrics.inFlight.Add(ctx, -1, attrs)
	}

	target, err := url.Parse(route.Upstream)
	if err != nil {
		// Validated at creation, so this is close to unreachable, but a broken
		// upstream must fail the request, not panic the proxy.
		span.RecordError(err)
		span.SetStatus(codes.Error, "invalid upstream")
		h.record(ctx, r, route, http.StatusBadGateway, 0, time.Since(start))
		http.Error(w, "route has an invalid upstream", http.StatusBadGateway)
		return
	}

	rec := &statusRecorder{ResponseWriter: w, status: 0}
	rp := &httputil.ReverseProxy{
		Transport: h.transport,
		Director: func(req *http.Request) {
			req.URL.Scheme = target.Scheme
			req.URL.Host = target.Host
			req.URL.Path = forwardPath
			req.Host = target.Host
			// Tell the upstream it is behind a proxy and at what name. The
			// ReverseProxy itself maintains X-Forwarded-For, so setting it here
			// too would double the client IP.
			req.Header.Set("X-Forwarded-Host", r.Host)
			req.Header.Set("X-Forwarded-Proto", schemeOf(r))
			// Propagate trace context downstream: if the upstream happens to be
			// instrumented, its spans join this trace.
			otel.GetTextMapPropagator().Inject(req.Context(), propagation.HeaderCarrier(req.Header))
		},
		ErrorHandler: func(rw http.ResponseWriter, _ *http.Request, e error) {
			// A dead upstream is the common failure (container stopped, VM
			// down); report it as 502 rather than letting it look like success.
			span.RecordError(e)
			span.SetStatus(codes.Error, e.Error())
			rw.WriteHeader(http.StatusBadGateway)
			_, _ = rw.Write([]byte("upstream unreachable"))
		},
	}

	rp.ServeHTTP(rec, r.WithContext(ctx))

	if rec.status == 0 {
		rec.status = http.StatusOK
	}
	elapsed := time.Since(start)

	span.SetAttributes(
		attribute.Int("http.response.status_code", rec.status),
		attribute.String("http.response.status_class", statusClass(rec.status)),
		attribute.Int64("http.response.body.size", rec.written),
	)
	if rec.status >= 500 {
		span.SetStatus(codes.Error, http.StatusText(rec.status))
	}

	h.record(ctx, r, route, rec.status, rec.written, elapsed)
}

// record writes the access log and RED metrics for one proxied request. This is
// the log line the operator sees per request to a workload.
func (h *Handler) record(ctx context.Context, r *http.Request, route *models.Route, status int, written int64, elapsed time.Duration) {
	if h.metrics != nil && route != nil {
		attrs := metric.WithAttributes(
			attribute.String("http.request.method", r.Method),
			attribute.String("vrata.route", route.Name),
			attribute.Int("http.response.status_code", status),
			attribute.String("http.response.status_class", statusClass(status)),
			attribute.String("service.name", "vrata"),
		)
		h.metrics.requests.Add(ctx, 1, attrs)
		h.metrics.duration.Record(ctx, float64(elapsed.Milliseconds()), attrs)
		h.metrics.respSize.Record(ctx, written, attrs)
	}

	if h.logger == nil {
		return
	}

	fields := []any{
		slog.String("http.request.method", r.Method),
		slog.String("url.path", r.URL.Path),
		slog.String("http.request.host", r.Host),
		slog.Int("http.response.status_code", status),
		slog.Int64("http.server.duration_ms", elapsed.Milliseconds()),
		slog.Int64("http.response.body.size", written),
		slog.String("client.address", clientIP(r)),
	}
	if route != nil {
		fields = append(fields,
			slog.String("vrata.route", route.Name),
			slog.String("vrata.route.kind", string(route.Kind)),
			slog.String("vrata.upstream", route.Upstream),
			slog.String("vrata.target", route.Target),
		)
	}
	// Carry the ids explicitly so a log line stays linkable to its trace.
	if sc := oteltrace.SpanContextFromContext(ctx); sc.IsValid() {
		fields = append(fields,
			slog.String("trace_id", sc.TraceID().String()),
			slog.String("span_id", sc.SpanID().String()),
		)
	}

	switch {
	case status >= 500:
		h.logger.ErrorContext(ctx, "proxied request failed", fields...)
	case status >= 400:
		h.logger.WarnContext(ctx, "proxied request rejected", fields...)
	default:
		h.logger.InfoContext(ctx, "proxied request", fields...)
	}
}

// statusRecorder captures the status code and body size the ResponseWriter does
// not expose after the fact.
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

// Flush lets streamed responses (server-sent events, chunked bodies) pass
// through the wrapper.
func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func statusClass(code int) string { return strconv.Itoa(code/100) + "xx" }

func schemeOf(r *http.Request) string {
	if r.TLS != nil {
		return "https"
	}
	return "http"
}

func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		for i := 0; i < len(fwd); i++ {
			if fwd[i] == ',' {
				return fwd[:i]
			}
		}
		return fwd
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}
