// Package telemetry wires this service into Oblak's OpenTelemetry pipeline.
//
// All three signals (traces, metrics, logs) are exported over OTLP to the
// Oblak collector, which writes them to ClickHouse. The service never talks to
// the telemetry store directly.
//
// Telemetry is optional by design: when OTEL_EXPORTER_OTLP_ENDPOINT is empty
// Init returns a working no-op setup. That keeps `go test` and bare local runs
// from depending on a running collector.
package telemetry

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// Config describes how this service identifies itself in the telemetry store.
type Config struct {
	// ServiceName is the value every signal is grouped by in the dashboard.
	ServiceName string
	// ServiceVersion is reported so a regression can be tied to a release.
	ServiceVersion string
	// Endpoint is the collector's OTLP gRPC address, e.g. "otel-collector:4317".
	// Empty disables export entirely.
	Endpoint string
	// Environment tags the deployment (development/staging/production).
	Environment string
	// SampleRatio is the trace sampling ratio. 0 or less means "always sample",
	// which is the right default for a private cloud's own control plane.
	SampleRatio float64
}

// ConfigFromEnv builds a Config from the standard OTEL_* environment
// variables so deployment can be changed without a rebuild.
func ConfigFromEnv(serviceName, serviceVersion string) Config {
	endpoint := firstNonEmpty(
		os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
		os.Getenv("OBLAK_OTLP_ENDPOINT"),
	)
	// The OTEL spec allows a full URL; the gRPC exporter wants host:port.
	endpoint = strings.TrimPrefix(strings.TrimPrefix(endpoint, "http://"), "https://")
	endpoint = strings.TrimSuffix(endpoint, "/")

	if name := os.Getenv("OTEL_SERVICE_NAME"); name != "" {
		serviceName = name
	}

	return Config{
		ServiceName:    serviceName,
		ServiceVersion: serviceVersion,
		Endpoint:       endpoint,
		Environment:    firstNonEmpty(os.Getenv("OBLAK_ENV"), "development"),
	}
}

// Telemetry holds the initialised providers and the logger the service
// should use for everything it wants to appear in the dashboard.
type Telemetry struct {
	// Logger writes structured records that are shipped to the telemetry store
	// and correlated with the active trace. Always non-nil.
	Logger *slog.Logger
	// Enabled reports whether signals are actually being exported.
	Enabled bool

	shutdownFuncs []func(context.Context) error
}

// Init sets up trace, metric and log pipelines. The returned Telemetry is
// always usable, even when export is disabled or the collector is unreachable.
func Init(ctx context.Context, cfg Config) (*Telemetry, error) {
	t := &Telemetry{
		// Until the OTel logger provider is wired, fall back to stderr so early
		// startup problems are never swallowed.
		Logger: slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})),
	}

	if cfg.Endpoint == "" {
		return t, nil
	}

	res, err := buildResource(ctx, cfg)
	if err != nil {
		return t, fmt.Errorf("build telemetry resource: %w", err)
	}

	// Trace context must propagate across Oblak services so a dashboard
	// request can be followed all the way into Impuls or Spomen.
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	if err := t.initTracing(ctx, cfg, res); err != nil {
		return t, err
	}
	if err := t.initMetrics(ctx, cfg, res); err != nil {
		return t, err
	}
	if err := t.initLogging(ctx, cfg, res); err != nil {
		return t, err
	}

	t.Enabled = true
	return t, nil
}

func buildResource(ctx context.Context, cfg Config) (*resource.Resource, error) {
	hostname, _ := os.Hostname()

	return resource.New(ctx,
		resource.WithFromEnv(),
		resource.WithProcess(),
		resource.WithTelemetrySDK(),
		resource.WithAttributes(
			semconv.ServiceName(cfg.ServiceName),
			semconv.ServiceVersion(cfg.ServiceVersion),
			semconv.DeploymentEnvironment(cfg.Environment),
			semconv.HostName(hostname),
			attribute.String("oblak.platform", "oblak"),
		),
	)
}

func (t *Telemetry) initTracing(ctx context.Context, cfg Config, res *resource.Resource) error {
	exp, err := otlptracegrpc.New(ctx,
		otlptracegrpc.WithEndpoint(cfg.Endpoint),
		// The collector is reached over the private Docker network, so TLS
		// would add cost without adding protection.
		otlptracegrpc.WithInsecure(),
		otlptracegrpc.WithTimeout(10*time.Second),
	)
	if err != nil {
		return fmt.Errorf("create trace exporter: %w", err)
	}

	sampler := sdktrace.AlwaysSample()
	if cfg.SampleRatio > 0 && cfg.SampleRatio < 1 {
		sampler = sdktrace.ParentBased(sdktrace.TraceIDRatioBased(cfg.SampleRatio))
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sampler),
		sdktrace.WithBatcher(exp,
			sdktrace.WithBatchTimeout(5*time.Second),
			sdktrace.WithMaxExportBatchSize(512),
		),
	)

	otel.SetTracerProvider(tp)
	t.shutdownFuncs = append(t.shutdownFuncs, tp.Shutdown)
	return nil
}

func (t *Telemetry) initMetrics(ctx context.Context, cfg Config, res *resource.Resource) error {
	exp, err := otlpmetricgrpc.New(ctx,
		otlpmetricgrpc.WithEndpoint(cfg.Endpoint),
		otlpmetricgrpc.WithInsecure(),
		otlpmetricgrpc.WithTimeout(10*time.Second),
	)
	if err != nil {
		return fmt.Errorf("create metric exporter: %w", err)
	}

	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithResource(res),
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(exp,
			sdkmetric.WithInterval(15*time.Second),
		)),
	)

	otel.SetMeterProvider(mp)
	t.shutdownFuncs = append(t.shutdownFuncs, mp.Shutdown)
	return nil
}

func (t *Telemetry) initLogging(ctx context.Context, cfg Config, res *resource.Resource) error {
	exp, err := otlploggrpc.New(ctx,
		otlploggrpc.WithEndpoint(cfg.Endpoint),
		otlploggrpc.WithInsecure(),
		otlploggrpc.WithTimeout(10*time.Second),
	)
	if err != nil {
		return fmt.Errorf("create log exporter: %w", err)
	}

	lp := sdklog.NewLoggerProvider(
		sdklog.WithResource(res),
		sdklog.WithProcessor(sdklog.NewBatchProcessor(exp,
			sdklog.WithExportInterval(5*time.Second),
		)),
	)

	// Records written through this logger carry the active trace and span id,
	// which is what lets the dashboard jump from a trace to its logs.
	t.Logger = slog.New(newFanoutHandler(
		otelslog.NewHandler(cfg.ServiceName, otelslog.WithLoggerProvider(lp)),
		// Keep writing to stderr as well: `docker logs` staying useful matters
		// when the telemetry stack itself is the thing that is broken.
		slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}),
	))

	t.shutdownFuncs = append(t.shutdownFuncs, lp.Shutdown)
	return nil
}

// Shutdown flushes everything still buffered. Call it on service exit or the
// last few seconds of telemetry before a restart are lost.
func (t *Telemetry) Shutdown(ctx context.Context) error {
	var errs []error
	// Reverse order so logs about shutting down are flushed before the
	// providers they depend on go away.
	for i := len(t.shutdownFuncs) - 1; i >= 0; i-- {
		if err := t.shutdownFuncs[i](ctx); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
