package models

import "time"

// InstanceStats is a point-in-time snapshot of one database's internals.
//
// It is the database equivalent of the per-request telemetry the HTTP services
// emit: where they report rate, errors and duration, a database reports
// connections, size, throughput and cache behaviour. Tefter collects it on a
// schedule and emits it as OpenTelemetry metrics and logs, so a managed
// database is observable in the dashboard even though the engine image itself
// carries no Oblak telemetry.
//
// The counter fields (commits, rollbacks, deadlocks) are cumulative since the
// server started, which is what an OTel counter expects; the dashboard turns
// them into rates.
type InstanceStats struct {
	Instance string       `json:"instance"`
	Engine   Engine       `json:"engine"`
	Role     InstanceRole `json:"role"`

	// Up is false when the database did not answer the stats query, which is
	// how a hung or crashed instance is distinguished from a healthy idle one.
	Up bool `json:"up"`

	Connections    int64 `json:"connections"`
	MaxConnections int64 `json:"max_connections"`
	SizeBytes      int64 `json:"size_bytes"`

	CommitsTotal   int64 `json:"commits_total"`
	RollbacksTotal int64 `json:"rollbacks_total"`
	DeadlocksTotal int64 `json:"deadlocks_total"`

	// BlocksHit and BlocksRead measure the buffer cache: a read served from
	// memory versus one that went to disk. Their ratio is the cache hit ratio.
	BlocksHit  int64 `json:"blocks_hit"`
	BlocksRead int64 `json:"blocks_read"`

	// ReplicationLagSeconds is set only on a replica.
	ReplicationLagSeconds *float64 `json:"replication_lag_seconds,omitempty"`

	// SlowQueries is the number of distinct statements whose mean execution
	// time exceeds slowQueryThresholdMs, and SlowestQueryMeanMs is the mean of
	// the slowest tracked statement. Both are nil when the source is
	// unavailable (a Postgres instance created before pg_stat_statements was
	// preloaded, or a query error), so "unknown" is distinct from "zero".
	SlowQueries        *int64   `json:"slow_queries,omitempty"`
	SlowestQueryMeanMs *float64 `json:"slowest_query_mean_ms,omitempty"`

	CollectedAt time.Time `json:"collected_at"`
}

// CacheHitRatio returns the fraction of block reads served from the buffer
// cache, in [0,1]. It returns 1 when nothing has been read yet, since a
// database that has done no disk reads has, trivially, missed nothing.
func (s *InstanceStats) CacheHitRatio() float64 {
	total := s.BlocksHit + s.BlocksRead
	if total <= 0 {
		return 1
	}
	return float64(s.BlocksHit) / float64(total)
}

// ConnectionUtilization returns how close the instance is to its connection
// limit, in [0,1]. Returns 0 when the limit is unknown.
func (s *InstanceStats) ConnectionUtilization() float64 {
	if s.MaxConnections <= 0 {
		return 0
	}
	return float64(s.Connections) / float64(s.MaxConnections)
}
