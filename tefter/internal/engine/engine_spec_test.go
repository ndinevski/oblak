package engine

import (
	"strings"
	"testing"

	"github.com/oblak/tefter/internal/models"
)

// =============================================================================
// Postgres replication status
// =============================================================================

func TestParsePostgresLagStreaming(t *testing.T) {
	// in_recovery | lag_seconds | lag_bytes | receiver_status
	status := parsePostgresLag("t|0.5|1024|streaming")

	if status.State != models.ReplicationStreaming {
		t.Errorf("expected streaming, got %q", status.State)
	}
	if status.LagSeconds == nil || *status.LagSeconds != 0.5 {
		t.Errorf("expected 0.5s of lag, got %v", status.LagSeconds)
	}
	if status.LagBytes == nil || *status.LagBytes != 1024 {
		t.Errorf("expected 1024 bytes of lag, got %v", status.LagBytes)
	}
}

// A replica out of recovery has been promoted; that is a real state, not an
// error.
func TestParsePostgresLagNotInRecovery(t *testing.T) {
	status := parsePostgresLag("f|||")

	if status.State != models.ReplicationStopped {
		t.Errorf("expected stopped, got %q", status.State)
	}
	if !strings.Contains(status.Detail, "not in recovery") {
		t.Errorf("expected the detail to explain why, got %q", status.Detail)
	}
}

// In recovery but with no WAL receiver means the link to the primary is down,
// even though the replica still serves reads. Reporting that as healthy would
// hide a real outage.
func TestParsePostgresLagNoReceiver(t *testing.T) {
	status := parsePostgresLag("t|120.0||no-receiver")

	if status.State != models.ReplicationError {
		t.Errorf("expected error, got %q", status.State)
	}
	if !strings.Contains(status.Detail, "not connected") {
		t.Errorf("expected the detail to say it is disconnected, got %q", status.Detail)
	}
}

func TestParsePostgresLagCatchup(t *testing.T) {
	status := parsePostgresLag("t|10|4096|catchup")
	if status.State != models.ReplicationCatchup {
		t.Errorf("expected catching-up, got %q", status.State)
	}
}

func TestParsePostgresLagMalformed(t *testing.T) {
	// Garbage must produce unknown rather than a confident wrong answer.
	status := parsePostgresLag("something unexpected")
	if status.State != models.ReplicationUnknown {
		t.Errorf("expected unknown, got %q", status.State)
	}
}

func TestParsePostgresLagHandlesMissingValues(t *testing.T) {
	// A replica that has replayed nothing yet reports empty lag fields.
	status := parsePostgresLag("t|||streaming")

	if status.State != models.ReplicationStreaming {
		t.Errorf("expected streaming, got %q", status.State)
	}
	// Nil is meaningfully different from zero: it means "not reported".
	if status.LagSeconds != nil {
		t.Errorf("expected no lag reading, got %v", *status.LagSeconds)
	}
}

// =============================================================================
// MySQL replication status
// =============================================================================

const healthyReplicaStatus = `*************************** 1. row ***************************
             Replica_IO_State: Waiting for source to send event
                  Source_Host: tefter-orders
                  Source_User: tefter_repl
            Replica_IO_Running: Yes
           Replica_SQL_Running: Yes
        Seconds_Behind_Source: 0
                   Last_Error:
`

func TestParseMySQLLagStreaming(t *testing.T) {
	status := parseMySQLLag(healthyReplicaStatus)

	if status.State != models.ReplicationStreaming {
		t.Errorf("expected streaming, got %q (%s)", status.State, status.Detail)
	}
	if status.LagSeconds == nil || *status.LagSeconds != 0 {
		t.Errorf("expected zero lag, got %v", status.LagSeconds)
	}
}

// A running replica far behind is catching up, not streaming in step.
func TestParseMySQLLagCatchup(t *testing.T) {
	out := strings.Replace(healthyReplicaStatus, "Seconds_Behind_Source: 0", "Seconds_Behind_Source: 300", 1)
	status := parseMySQLLag(out)

	if status.State != models.ReplicationCatchup {
		t.Errorf("expected catching-up at 300s behind, got %q", status.State)
	}
	if status.LagSeconds == nil || *status.LagSeconds != 300 {
		t.Errorf("expected 300s of lag, got %v", status.LagSeconds)
	}
}

func TestParseMySQLLagStopped(t *testing.T) {
	out := `Replica_IO_Running: No
           Replica_SQL_Running: No
        Seconds_Behind_Source: NULL
                   Last_Error:
`
	status := parseMySQLLag(out)
	if status.State != models.ReplicationStopped {
		t.Errorf("expected stopped, got %q", status.State)
	}
}

// One thread running and one stopped is a broken replica, which is worse than
// a cleanly stopped one and must be reported differently.
func TestParseMySQLLagOneThreadDown(t *testing.T) {
	out := `Replica_IO_Running: Yes
           Replica_SQL_Running: No
        Seconds_Behind_Source: NULL
               Last_SQL_Error: Duplicate entry '1' for key 'PRIMARY'
`
	status := parseMySQLLag(out)

	if status.State != models.ReplicationError {
		t.Errorf("expected error, got %q", status.State)
	}
	if !strings.Contains(status.Detail, "Duplicate entry") {
		t.Errorf("expected the engine error to be surfaced, got %q", status.Detail)
	}
}

func TestParseMySQLLagEmpty(t *testing.T) {
	// SHOW REPLICA STATUS returns nothing on a server that is not a replica.
	status := parseMySQLLag("")
	if status.State != models.ReplicationStopped {
		t.Errorf("expected stopped, got %q", status.State)
	}
}

// NULL is MySQL's "unknown", and must not be read as zero lag.
func TestParseMySQLLagNullSecondsIsNotZero(t *testing.T) {
	out := strings.Replace(healthyReplicaStatus, "Seconds_Behind_Source: 0", "Seconds_Behind_Source: NULL", 1)
	status := parseMySQLLag(out)

	if status.LagSeconds != nil {
		t.Errorf("expected NULL to mean no reading, got %v", *status.LagSeconds)
	}
}

// =============================================================================
// Engine specs
// =============================================================================

func TestSpecForKnownEngines(t *testing.T) {
	pg, err := specFor(models.EnginePostgres)
	if err != nil {
		t.Fatalf("postgres: %v", err)
	}
	if pg.port != 5432 || pg.dataDir != "/var/lib/postgresql/data" {
		t.Errorf("unexpected postgres spec: %+v", pg)
	}

	my, err := specFor(models.EngineMySQL)
	if err != nil {
		t.Fatalf("mysql: %v", err)
	}
	if my.port != 3306 || my.dataDir != "/var/lib/mysql" {
		t.Errorf("unexpected mysql spec: %+v", my)
	}

	if _, err := specFor("mongodb"); err == nil {
		t.Error("expected an unknown engine to be rejected")
	}
}

// Replication must be enabled at startup: neither engine can turn it on later
// without a restart, so a primary provisioned without it could never take a
// replica.
func TestPrimaryCommandEnablesReplication(t *testing.T) {
	pg := strings.Join(postgresSpec.primaryCommand(1), " ")
	for _, want := range []string{"wal_level=replica", "max_wal_senders", "hot_standby=on", "wal_keep_size"} {
		if !strings.Contains(pg, want) {
			t.Errorf("postgres primary command missing %q: %s", want, pg)
		}
	}

	my := strings.Join(mysqlSpec.primaryCommand(7), " ")
	for _, want := range []string{"--server-id=7", "--log-bin", "--binlog-format=ROW", "--gtid-mode=ON"} {
		if !strings.Contains(my, want) {
			t.Errorf("mysql primary command missing %q: %s", want, my)
		}
	}
}

// A read replica that accepts writes would silently diverge from its primary.
// A MySQL replica must end up read-only, but NOT via its boot arguments: the
// image hands those to the temporary server it uses to initialise the data
// directory, and a super-read-only server cannot create the accounts that pass
// exists to create. Setting it at boot produced a replica with no working
// credentials at all, so the flags belong in enforceReadOnly instead.
func TestMySQLReplicaBootCommandIsNotReadOnly(t *testing.T) {
	cmd := strings.Join(mysqlSpec.replicaCommand(2), " ")
	for _, flag := range []string{"--read-only", "--super-read-only"} {
		if strings.Contains(cmd, flag) {
			t.Errorf("%s must not be a boot argument, it breaks image init: %s", flag, cmd)
		}
	}
}

func TestMySQLEnforceReadOnly(t *testing.T) {
	inst := &models.DBInstance{Name: "billing", Engine: models.EngineMySQL, Username: "tefter", Database: "billing"}

	spec := mysqlSpec.enforceReadOnly(inst, "s3cret")
	script := strings.Join(spec.Argv, " ")
	// super_read_only matters because read_only alone still lets privileged
	// users write, and every account Tefter creates is privileged.
	if !strings.Contains(script, "super_read_only = ON") {
		t.Errorf("expected the running server to be set read-only, got %s", script)
	}
	// Persisted too, so a restart does not quietly bring back a writable
	// replica that would then diverge from its primary.
	if !strings.Contains(script, "/etc/mysql/conf.d/tefter-replica.cnf") {
		t.Errorf("expected the setting to persist across a restart, got %s", script)
	}
	rw := mysqlSpec.allowWrites(inst, "s3cret")
	rwScript := strings.Join(rw.Argv, " ")
	if !strings.Contains(rwScript, "super_read_only = OFF") {
		t.Errorf("expected promotion to re-enable writes, got %s", rwScript)
	}
	if !strings.Contains(rwScript, "rm -f /etc/mysql/conf.d/tefter-replica.cnf") {
		t.Errorf("expected promotion to drop the persisted setting, got %s", rwScript)
	}

	// Postgres has no equivalent: a standby refuses writes because it is in
	// recovery, so there is nothing to set and nothing to undo.
	if len(postgresSpec.enforceReadOnly(inst, "s3cret").Argv) != 0 {
		t.Error("expected postgres to need no read-only command")
	}
	if len(postgresSpec.allowWrites(inst, "s3cret").Argv) != 0 {
		t.Error("expected postgres to need no allow-writes command")
	}
}

// Credentials must travel in the environment, never in argv, where they would
// be visible in process listings and engine logs.
func TestCredentialsNeverAppearInArgv(t *testing.T) {
	const password = "sup3rs3cr3tp4ss"
	inst := &models.DBInstance{
		Name: "orders", Engine: models.EngineMySQL, Username: "tefter", Database: "orders",
	}

	specs := map[string]execSpec{
		"dump":      mysqlSpec.dump(inst, password),
		"restore":   mysqlSpec.restore(inst, password),
		"ready":     mysqlSpec.ready(inst, password),
		"promote":   mysqlSpec.promote(inst, password),
		"status":    mysqlSpec.replicationStatus(inst, password),
		"read-only": mysqlSpec.enforceReadOnly(inst, password),
		"writable":  mysqlSpec.allowWrites(inst, password),
	}

	for name, spec := range specs {
		argv := strings.Join(spec.Argv, " ")
		if strings.Contains(argv, password) {
			t.Errorf("%s: password leaked into argv: %s", name, argv)
		}
		if !strings.Contains(strings.Join(spec.Env, " "), password) {
			t.Errorf("%s: expected the password to be passed via the environment", name)
		}
	}

	pgInst := &models.DBInstance{
		Name: "orders", Engine: models.EnginePostgres, Username: "tefter", Database: "orders",
	}
	for name, spec := range map[string]execSpec{
		"dump":        postgresSpec.dump(pgInst, password),
		"restore":     postgresSpec.restore(pgInst, password),
		"ready":       postgresSpec.ready(pgInst, password),
		"replication": postgresSpec.allowReplicationAccess(pgInst, password),
	} {
		if strings.Contains(strings.Join(spec.Argv, " "), password) {
			t.Errorf("%s: password leaked into argv", name)
		}
	}
}

// A dump carrying the source's GTID state would corrupt replication on the
// target when restored.
func TestMySQLDumpDisablesGTIDPurged(t *testing.T) {
	inst := &models.DBInstance{Engine: models.EngineMySQL, Database: "orders"}
	argv := strings.Join(mysqlSpec.dump(inst, "pw").Argv, " ")

	if !strings.Contains(argv, "--set-gtid-purged=OFF") {
		t.Errorf("expected --set-gtid-purged=OFF, got %s", argv)
	}
	// Without a consistent snapshot the dump could capture a torn state.
	if !strings.Contains(argv, "--single-transaction") {
		t.Errorf("expected --single-transaction, got %s", argv)
	}
}

// A restore that half-fails silently is worse than one that stops.
func TestPostgresRestoreStopsOnError(t *testing.T) {
	inst := &models.DBInstance{Engine: models.EnginePostgres, Username: "u", Database: "d"}
	argv := strings.Join(postgresSpec.restore(inst, "pw").Argv, " ")

	if !strings.Contains(argv, "ON_ERROR_STOP=1") {
		t.Errorf("expected ON_ERROR_STOP=1, got %s", argv)
	}
}

// The dump has to be able to replace an existing database, or a restore into
// a populated instance would collide on every object.
func TestPostgresDumpIsIdempotent(t *testing.T) {
	inst := &models.DBInstance{Engine: models.EnginePostgres, Username: "u", Database: "d"}
	argv := strings.Join(postgresSpec.dump(inst, "pw").Argv, " ")

	if !strings.Contains(argv, "--clean") || !strings.Contains(argv, "--if-exists") {
		t.Errorf("expected --clean --if-exists, got %s", argv)
	}
}

// pg_basebackup -R is what makes the clone start as a follower rather than a
// second primary.
func TestPostgresSeedWritesStandbyConfig(t *testing.T) {
	seed := postgresSpec.seedReplica("tefter-orders", "replpass")
	argv := strings.Join(seed.Argv, " ")

	if !strings.Contains(argv, "pg_basebackup") {
		t.Errorf("expected pg_basebackup, got %s", argv)
	}
	if !strings.Contains(argv, "-R") {
		t.Errorf("expected -R to write standby config, got %s", argv)
	}
	if strings.Contains(argv, "replpass") {
		t.Error("the replication password leaked into argv")
	}
}

// MySQL seeds itself from the primary's binlog, so there is no clone step.
func TestMySQLHasNoSeedStep(t *testing.T) {
	if len(mysqlSpec.seedReplica("host", "pw").Argv) != 0 {
		t.Error("expected mysql to need no seeding command")
	}
}

// Conversely, Postgres needs no CHANGE REPLICATION SOURCE: pg_basebackup -R
// already wrote the connection details.
func TestPostgresHasNoStartReplicationStep(t *testing.T) {
	if len(postgresSpec.startReplication("host", "root", "repl").Argv) != 0 {
		t.Error("expected postgres to need no start-replication command")
	}
}

func TestMySQLStartReplicationUsesGTIDAutoPosition(t *testing.T) {
	spec := mysqlSpec.startReplication("tefter-orders", "rootpw", "replpw")
	argv := strings.Join(spec.Argv, " ")

	// Auto-position is what lets the replica find its place without tracking
	// binlog file names and offsets.
	if !strings.Contains(argv, "SOURCE_AUTO_POSITION=1") {
		t.Errorf("expected SOURCE_AUTO_POSITION=1, got %s", argv)
	}
	if !strings.Contains(argv, "START REPLICA") {
		t.Errorf("expected START REPLICA, got %s", argv)
	}
	// The root password goes in the environment; the replication password is
	// unavoidably part of the SQL statement.
	if strings.Contains(argv, "rootpw") {
		t.Error("the root password leaked into argv")
	}
}

// =============================================================================
// Quoting and helpers
// =============================================================================

func TestQuoting(t *testing.T) {
	if got := quotePostgresLiteral("it's"); got != "'it''s'" {
		t.Errorf("postgres quoting: got %s", got)
	}
	if got := quoteMySQLLiteral("it's"); got != `'it\'s'` {
		t.Errorf("mysql quoting: got %s", got)
	}
	if got := quoteMySQLLiteral(`back\slash`); got != `'back\\slash'` {
		t.Errorf("mysql backslash quoting: got %s", got)
	}
}

// Two MySQL servers sharing a server id break replication in confusing ways,
// so the derived id must be stable per name and distinct across names.
func TestServerIDForIsStableAndDistinct(t *testing.T) {
	a1 := serverIDFor("orders")
	a2 := serverIDFor("orders")
	b := serverIDFor("orders-ro")

	if a1 != a2 {
		t.Error("expected the same name to yield the same server id")
	}
	if a1 == b {
		t.Error("expected different names to yield different server ids")
	}
	// Zero is reserved by MySQL.
	if a1 == 0 || b == 0 {
		t.Error("expected a non-zero server id")
	}
}

// The generated password ends up inside SQL literals and shell commands, so
// restricting it to alphanumerics removes a whole class of quoting bug.
func TestGeneratePasswordIsAlphanumericAndUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 50; i++ {
		pw := generatePassword(24)
		if len(pw) != 24 {
			t.Fatalf("expected 24 characters, got %d", len(pw))
		}
		for _, c := range pw {
			isAlnum := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
			if !isAlnum {
				t.Fatalf("unexpected character %q in generated password", c)
			}
		}
		if seen[pw] {
			t.Fatal("generated the same password twice")
		}
		seen[pw] = true
	}
}

// Regression: the status query casts the boolean to text, so Postgres renders
// it as "true" rather than the "t" a bare column would print. Reading only "t"
// made every healthy replica report as promoted.
func TestParsePostgresLagAcceptsBothBooleanRenderings(t *testing.T) {
	for _, in := range []string{"t|1.5|0|streaming", "true|1.5|0|streaming"} {
		got := parsePostgresLag(in)
		if got.State != models.ReplicationStreaming {
			t.Errorf("%q: expected streaming, got %s (%s)", in, got.State, got.Detail)
		}
	}
}
