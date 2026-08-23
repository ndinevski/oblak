package engine

import "testing"

func TestParseInstanceStats(t *testing.T) {
	// connections|max|size|commits|rollbacks|blks_hit|blks_read|deadlocks
	s, ok := parseInstanceStats("12|100|2097152|50000|7|990000|10000|2")
	if !ok {
		t.Fatal("expected the line to parse")
	}
	if s.Connections != 12 || s.MaxConnections != 100 {
		t.Errorf("connections = %d/%d, want 12/100", s.Connections, s.MaxConnections)
	}
	if s.SizeBytes != 2097152 {
		t.Errorf("size = %d, want 2097152", s.SizeBytes)
	}
	if s.CommitsTotal != 50000 || s.RollbacksTotal != 7 {
		t.Errorf("commits/rollbacks = %d/%d, want 50000/7", s.CommitsTotal, s.RollbacksTotal)
	}
	if s.BlocksHit != 990000 || s.BlocksRead != 10000 {
		t.Errorf("blocks = %d/%d", s.BlocksHit, s.BlocksRead)
	}
	if s.DeadlocksTotal != 2 {
		t.Errorf("deadlocks = %d, want 2", s.DeadlocksTotal)
	}
	// 990000 / (990000+10000) = 0.99
	if r := s.CacheHitRatio(); r < 0.989 || r > 0.991 {
		t.Errorf("cache hit ratio = %f, want ~0.99", r)
	}
}

func TestParseInstanceStatsRejectsShortLine(t *testing.T) {
	if _, ok := parseInstanceStats("1|2|3"); ok {
		t.Error("a line with too few fields must be rejected")
	}
	if _, ok := parseInstanceStats(""); ok {
		t.Error("an empty line must be rejected")
	}
}

func TestParseInstanceStatsToleratesJunkFields(t *testing.T) {
	// A non-numeric field becomes zero rather than failing the whole read.
	s, ok := parseInstanceStats("10|100|abc|5|0|9|1|0")
	if !ok {
		t.Fatal("expected the line to parse")
	}
	if s.SizeBytes != 0 {
		t.Errorf("a non-numeric size should read as 0, got %d", s.SizeBytes)
	}
}

func TestParseSlowQueries(t *testing.T) {
	count, slowest, ok := parseSlowQueries("3|248.7")
	if !ok {
		t.Fatal("expected the line to parse")
	}
	if count != 3 {
		t.Errorf("count = %d, want 3", count)
	}
	if slowest < 248.6 || slowest > 248.8 {
		t.Errorf("slowest = %f, want ~248.7", slowest)
	}

	if _, _, ok := parseSlowQueries("only-one-field"); ok {
		t.Error("a single-field line must be rejected")
	}
	if _, _, ok := parseSlowQueries("x|y"); ok {
		t.Error("non-numeric fields must be rejected")
	}
}
