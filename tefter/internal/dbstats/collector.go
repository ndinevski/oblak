// Package dbstats collects per-database observability from the instances Tefter
// manages and emits it as OpenTelemetry metrics and logs.
//
// A managed database runs a stock Postgres or MySQL image with no Oblak
// telemetry of its own, so without this its internals are invisible: you can
// see that Tefter created an instance, but not how many connections it has, how
// large it is, how much it is committing, or how far a replica has fallen
// behind. The collector closes that gap the way a metrics agent would, but
// without installing anything inside the database container: it asks the engine
// for its own counters on a schedule and republishes them.
package dbstats

import (
	"context"
	"log/slog"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"github.com/oblak/tefter/internal/engine"
	"github.com/oblak/tefter/internal/models"
)

// Collector periodically reads each instance's stats and exposes them as OTel
// instruments. It owns no database connections of its own: it goes through the
// provisioner, which already knows how to reach each instance.
type Collector struct {
	prov     engine.Provisioner
	logger   *slog.Logger
	interval time.Duration

	// snapshot is the most recent reading, published for the observable
	// instrument callbacks to read. Swapped wholesale under snapMu so a
	// callback never sees a half-updated set.
	snapMu       *snapshotStore
	instr        *instruments
	registration metric.Registration
}

// New builds a collector and registers its instruments. interval is clamped to
// a sane floor so a misconfiguration cannot hammer every database.
func New(prov engine.Provisioner, logger *slog.Logger, interval time.Duration) (*Collector, error) {
	if interval < 5*time.Second {
		interval = 30 * time.Second
	}
	c := &Collector{
		prov:     prov,
		logger:   logger,
		interval: interval,
		snapMu:   newSnapshotStore(),
	}
	if err := c.register(); err != nil {
		return nil, err
	}
	return c, nil
}

// Run collects immediately, then on every tick, until the context is cancelled.
// Blocking; call it in its own goroutine.
func (c *Collector) Run(ctx context.Context) {
	c.collect(ctx)

	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			if c.registration != nil {
				_ = c.registration.Unregister()
			}
			return
		case <-ticker.C:
			c.collect(ctx)
		}
	}
}

// collect reads every instance's stats and publishes a fresh snapshot. One
// instance failing never stops the others: a failed read is published as
// Up=false, which is itself the signal that the database is in trouble.
func (c *Collector) collect(ctx context.Context) {
	instances, err := c.prov.ListInstances(ctx)
	if err != nil {
		c.logger.Warn("db stats: could not list instances", "error", err)
		return
	}

	readings := make([]models.InstanceStats, 0, len(instances))
	for i := range instances {
		inst := instances[i]
		stats, err := c.prov.Stats(ctx, &inst)
		if err != nil {
			c.logger.Warn("db stats: collection failed",
				"instance", inst.Name, "engine", inst.Engine, "error", err)
			readings = append(readings, models.InstanceStats{
				Instance: inst.Name, Engine: inst.Engine, Role: inst.Role,
				Up: false, CollectedAt: time.Now().UTC(),
			})
			continue
		}
		readings = append(readings, *stats)
		c.logStats(ctx, stats)
	}

	c.snapMu.set(readings)
}

// logStats emits one structured line per instance per collection. That gives a
// queryable per-database log stream in the dashboard, and makes a database that
// goes down or fills up visible in the logs, not only on a chart.
func (c *Collector) logStats(ctx context.Context, s *models.InstanceStats) {
	fields := []any{
		slog.String("db.instance", s.Instance),
		slog.String("db.engine", string(s.Engine)),
		slog.String("db.role", string(s.Role)),
		slog.Bool("db.up", s.Up),
	}
	if !s.Up {
		c.logger.WarnContext(ctx, "database is not responding", fields...)
		return
	}
	fields = append(fields,
		slog.Int64("db.connections", s.Connections),
		slog.Int64("db.connections.max", s.MaxConnections),
		slog.Int64("db.size_bytes", s.SizeBytes),
		slog.Int64("db.commits_total", s.CommitsTotal),
		slog.Int64("db.rollbacks_total", s.RollbacksTotal),
		slog.Float64("db.cache_hit_ratio", round4(s.CacheHitRatio())),
		slog.Float64("db.connection_utilization", round4(s.ConnectionUtilization())),
	)
	if s.ReplicationLagSeconds != nil {
		fields = append(fields, slog.Float64("db.replication_lag_seconds", *s.ReplicationLagSeconds))
	}
	if s.SlowQueries != nil {
		fields = append(fields, slog.Int64("db.slow_queries", *s.SlowQueries))
	}
	if s.SlowestQueryMeanMs != nil {
		fields = append(fields, slog.Float64("db.slowest_query_mean_ms", *s.SlowestQueryMeanMs))
	}
	c.logger.InfoContext(ctx, "database stats", fields...)
}

func round4(f float64) float64 {
	return float64(int64(f*10000+0.5)) / 10000
}

func attrsFor(s *models.InstanceStats) attribute.Set {
	return attribute.NewSet(
		attribute.String("db.instance", s.Instance),
		attribute.String("db.engine", string(s.Engine)),
		attribute.String("db.role", string(s.Role)),
	)
}

// boolToInt turns Up into the 1/0 an OTel gauge wants.
func boolToInt(b bool) int64 {
	if b {
		return 1
	}
	return 0
}
