package dbstats

import (
	"context"
	"sync"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"

	"github.com/oblak/tefter/internal/models"
)

// snapshotStore holds the latest set of readings behind a lock, so the poller
// can swap in a fresh set while instrument callbacks read the current one.
type snapshotStore struct {
	mu   sync.RWMutex
	data []models.InstanceStats
}

func newSnapshotStore() *snapshotStore { return &snapshotStore{} }

func (s *snapshotStore) set(readings []models.InstanceStats) {
	s.mu.Lock()
	s.data = readings
	s.mu.Unlock()
}

func (s *snapshotStore) get() []models.InstanceStats {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data
}

// instruments are the OTel metrics the collector publishes. Gauges hold
// point-in-time values; the three counters are cumulative so the dashboard can
// derive a rate.
type instruments struct {
	up          metric.Int64ObservableGauge
	connections metric.Int64ObservableGauge
	maxConns    metric.Int64ObservableGauge
	sizeBytes   metric.Int64ObservableGauge
	cacheHit    metric.Float64ObservableGauge
	connUtil    metric.Float64ObservableGauge
	replLag     metric.Float64ObservableGauge
	slowQueries metric.Int64ObservableGauge
	slowestMs   metric.Float64ObservableGauge

	commits   metric.Int64ObservableCounter
	rollbacks metric.Int64ObservableCounter
	deadlocks metric.Int64ObservableCounter
}

// register creates the instruments and wires a single callback that reads the
// latest snapshot and reports each instance. Doing the reporting in a callback
// (rather than recording synchronously in collect) is the idiomatic OTel way to
// publish polled state, and keeps the export cadence independent of the poll.
func (c *Collector) register() error {
	meter := otel.GetMeterProvider().Meter("tefter/dbstats")

	i := &instruments{}
	var err error

	if i.up, err = meter.Int64ObservableGauge("tefter.db.up",
		metric.WithDescription("Whether the database answered its stats query (1) or not (0)")); err != nil {
		return err
	}
	if i.connections, err = meter.Int64ObservableGauge("tefter.db.connections",
		metric.WithDescription("Current client connections"), metric.WithUnit("{connection}")); err != nil {
		return err
	}
	if i.maxConns, err = meter.Int64ObservableGauge("tefter.db.connections.max",
		metric.WithDescription("Configured connection limit"), metric.WithUnit("{connection}")); err != nil {
		return err
	}
	if i.sizeBytes, err = meter.Int64ObservableGauge("tefter.db.size",
		metric.WithDescription("On-disk size of the database"), metric.WithUnit("By")); err != nil {
		return err
	}
	if i.cacheHit, err = meter.Float64ObservableGauge("tefter.db.cache_hit_ratio",
		metric.WithDescription("Fraction of block reads served from the buffer cache")); err != nil {
		return err
	}
	if i.connUtil, err = meter.Float64ObservableGauge("tefter.db.connection_utilization",
		metric.WithDescription("Connections as a fraction of the limit")); err != nil {
		return err
	}
	if i.replLag, err = meter.Float64ObservableGauge("tefter.db.replication.lag",
		metric.WithDescription("Replica lag behind its primary"), metric.WithUnit("s")); err != nil {
		return err
	}
	if i.slowQueries, err = meter.Int64ObservableGauge("tefter.db.slow_queries",
		metric.WithDescription("Distinct statements whose mean execution time exceeds 100ms"), metric.WithUnit("{statement}")); err != nil {
		return err
	}
	if i.slowestMs, err = meter.Float64ObservableGauge("tefter.db.slowest_query",
		metric.WithDescription("Mean execution time of the slowest tracked statement"), metric.WithUnit("ms")); err != nil {
		return err
	}
	if i.commits, err = meter.Int64ObservableCounter("tefter.db.commits",
		metric.WithDescription("Transactions committed since server start"), metric.WithUnit("{transaction}")); err != nil {
		return err
	}
	if i.rollbacks, err = meter.Int64ObservableCounter("tefter.db.rollbacks",
		metric.WithDescription("Transactions rolled back since server start"), metric.WithUnit("{transaction}")); err != nil {
		return err
	}
	if i.deadlocks, err = meter.Int64ObservableCounter("tefter.db.deadlocks",
		metric.WithDescription("Deadlocks detected since server start"), metric.WithUnit("{deadlock}")); err != nil {
		return err
	}

	reg, err := meter.RegisterCallback(
		func(_ context.Context, o metric.Observer) error {
			for _, s := range c.snapMu.get() {
				s := s
				set := metric.WithAttributeSet(attrsFor(&s))
				o.ObserveInt64(i.up, boolToInt(s.Up), set)
				// Only a responsive instance has meaningful counters; reporting
				// zeros for a down one would look like a real drop to zero.
				if !s.Up {
					continue
				}
				o.ObserveInt64(i.connections, s.Connections, set)
				o.ObserveInt64(i.maxConns, s.MaxConnections, set)
				o.ObserveInt64(i.sizeBytes, s.SizeBytes, set)
				o.ObserveFloat64(i.cacheHit, s.CacheHitRatio(), set)
				o.ObserveFloat64(i.connUtil, s.ConnectionUtilization(), set)
				o.ObserveInt64(i.commits, s.CommitsTotal, set)
				o.ObserveInt64(i.rollbacks, s.RollbacksTotal, set)
				o.ObserveInt64(i.deadlocks, s.DeadlocksTotal, set)
				if s.ReplicationLagSeconds != nil {
					o.ObserveFloat64(i.replLag, *s.ReplicationLagSeconds, set)
				}
				// Slow-query stats are absent on an instance without
				// pg_stat_statements, so only report them when present.
				if s.SlowQueries != nil {
					o.ObserveInt64(i.slowQueries, *s.SlowQueries, set)
				}
				if s.SlowestQueryMeanMs != nil {
					o.ObserveFloat64(i.slowestMs, *s.SlowestQueryMeanMs, set)
				}
			}
			return nil
		},
		i.up, i.connections, i.maxConns, i.sizeBytes, i.cacheHit, i.connUtil,
		i.replLag, i.slowQueries, i.slowestMs, i.commits, i.rollbacks, i.deadlocks,
	)
	if err != nil {
		return err
	}

	c.instr = i
	c.registration = reg
	return nil
}
