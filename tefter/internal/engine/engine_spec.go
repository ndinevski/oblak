package engine

import (
	"fmt"
	"strings"

	"github.com/oblak/tefter/internal/models"
)

// execSpec is a command to run inside an instance's container, with any
// credentials supplied through the environment.
//
// Credentials never go in Argv: a command line is visible to anything that can
// read /proc inside the container, and it ends up in engine logs. Both clients
// read a password from the environment instead (PGPASSWORD, MYSQL_PWD).
type execSpec struct {
	Argv []string
	Env  []string
}

// engineSpec captures everything that differs between Postgres and MySQL.
//
// Both engines need the same shape of work (start a server, add a replication
// user, seed a follower, dump, restore) but the mechanics differ completely.
// Collecting the differences here keeps the provisioner free of engine
// conditionals and makes adding a third engine a matter of one more spec.
type engineSpec struct {
	engine models.Engine

	// port the server listens on inside the container.
	port int

	// dataDir is where the engine keeps its data, and therefore where the
	// instance volume is mounted.
	dataDir string
}

var (
	postgresSpec = engineSpec{
		engine:  models.EnginePostgres,
		port:    5432,
		dataDir: "/var/lib/postgresql/data",
	}

	mysqlSpec = engineSpec{
		engine:  models.EngineMySQL,
		port:    3306,
		dataDir: "/var/lib/mysql",
	}
)

func specFor(e models.Engine) (engineSpec, error) {
	switch e {
	case models.EnginePostgres:
		return postgresSpec, nil
	case models.EngineMySQL:
		return mysqlSpec, nil
	}
	return engineSpec{}, fmt.Errorf("%w: engine %s", models.ErrNotSupported, e)
}

// =============================================================================
// Primary configuration
// =============================================================================

// primaryEnv builds the container environment for a new primary.
func (s engineSpec) primaryEnv(req *models.CreateInstanceRequest, password, replPassword string) []string {
	switch s.engine {
	case models.EnginePostgres:
		return []string{
			// The image creates this user and the initial database.
			"POSTGRES_USER=" + req.Username,
			"POSTGRES_PASSWORD=" + password,
			"POSTGRES_DB=" + req.Database,
			// Without this the image writes `trust` into pg_hba for host
			// connections, leaving the database open to every container on
			// the network.
			"POSTGRES_HOST_AUTH_METHOD=scram-sha-256",
			"POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256",
			// Kept on the container so Tefter can read it back when seeding a
			// replica, rather than holding a credential store of its own.
			tefterReplPasswordEnv + "=" + replPassword,
			tefterPasswordEnv + "=" + password,
		}
	case models.EngineMySQL:
		return []string{
			"MYSQL_ROOT_PASSWORD=" + password,
			"MYSQL_DATABASE=" + req.Database,
			"MYSQL_USER=" + req.Username,
			"MYSQL_PASSWORD=" + password,
			tefterReplPasswordEnv + "=" + replPassword,
			tefterPasswordEnv + "=" + password,
		}
	}
	return nil
}

// primaryCommand builds the server arguments for a new primary.
//
// Both engines need replication switched on at startup: neither can enable it
// later without a restart, and provisioning a primary that could never take a
// replica would be a trap.
func (s engineSpec) primaryCommand(serverID int) []string {
	switch s.engine {
	case models.EnginePostgres:
		return []string{
			"postgres",
			// The minimum WAL detail for streaming replication.
			"-c", "wal_level=replica",
			"-c", "max_wal_senders=10",
			"-c", "max_replication_slots=10",
			// Lets a replica serve reads while it applies WAL.
			"-c", "hot_standby=on",
			// Without a floor the primary can recycle WAL a lagging replica
			// still needs, which breaks replication permanently.
			"-c", "wal_keep_size=256MB",
			"-c", "listen_addresses=*",
			// Load pg_stat_statements so Tefter's collector can report slow
			// queries. It must be preloaded at startup; the extension is then
			// created on the database (see CreateInstance). Cheap and standard.
			"-c", "shared_preload_libraries=pg_stat_statements",
			"-c", "pg_stat_statements.track=top",
		}
	case models.EngineMySQL:
		return []string{
			fmt.Sprintf("--server-id=%d", serverID),
			"--log-bin=mysql-bin",
			// Row-based binlog is the only safe format for replicating
			// non-deterministic statements.
			"--binlog-format=ROW",
			// GTIDs let a replica position itself without tracking binlog file
			// names and offsets, which is what makes SOURCE_AUTO_POSITION work.
			"--gtid-mode=ON",
			"--enforce-gtid-consistency=ON",
			"--binlog-expire-logs-seconds=604800",
		}
	}
	return nil
}

// replicaCommand builds the server arguments for a follower.
func (s engineSpec) replicaCommand(serverID int) []string {
	switch s.engine {
	case models.EnginePostgres:
		// A Postgres replica is configured by files in its data directory
		// (standby.signal and primary_conninfo), which pg_basebackup -R writes
		// during seeding. Its server arguments are otherwise the primary's.
		return s.primaryCommand(serverID)
	case models.EngineMySQL:
		return []string{
			fmt.Sprintf("--server-id=%d", serverID),
			"--log-bin=mysql-bin",
			"--binlog-format=ROW",
			"--gtid-mode=ON",
			"--enforce-gtid-consistency=ON",
			// Read-only is deliberately NOT set here. The image's entrypoint
			// passes these same arguments to the temporary server it runs to
			// initialise the data directory, and a super-read-only server
			// cannot create the accounts that setup pass is there to create:
			// the replica would come up with no usable credentials at all.
			// enforceReadOnly applies it once init is safely behind us.
			"--relay-log=relay-bin",
		}
	}
	return nil
}

// =============================================================================
// Replication
// =============================================================================

// createReplicationUser returns the command that creates the account a replica
// authenticates with.
func (s engineSpec) createReplicationUser(inst *models.DBInstance, password, replPassword string) execSpec {
	switch s.engine {
	case models.EnginePostgres:
		sql := fmt.Sprintf(
			`DO $tefter$ BEGIN
			   IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tefter_repl') THEN
			     CREATE ROLE tefter_repl WITH REPLICATION LOGIN PASSWORD %s;
			   END IF;
			 END $tefter$;`,
			quotePostgresLiteral(replPassword),
		)
		return execSpec{
			Argv: []string{"psql", "-U", inst.Username, "-d", inst.Database, "-v", "ON_ERROR_STOP=1", "-c", sql},
			Env:  []string{"PGPASSWORD=" + password},
		}

	case models.EngineMySQL:
		sql := fmt.Sprintf(
			"CREATE USER IF NOT EXISTS 'tefter_repl'@'%%' IDENTIFIED BY %s; "+
				// Replication itself needs only the first two. The rest are
				// what mysqldump requires to take the seed copy a new replica
				// starts from, including BACKUP_ADMIN for the LOCK INSTANCE
				// FOR BACKUP that --single-transaction issues.
				"GRANT REPLICATION SLAVE, REPLICATION CLIENT, SELECT, LOCK TABLES, "+
				"SHOW VIEW, EVENT, TRIGGER, RELOAD, PROCESS ON *.* TO 'tefter_repl'@'%%'; "+
				"GRANT BACKUP_ADMIN ON *.* TO 'tefter_repl'@'%%'; "+
				"FLUSH PRIVILEGES;",
			quoteMySQLLiteral(replPassword),
		)
		return execSpec{
			Argv: []string{"mysql", "-uroot", "-e", sql},
			Env:  []string{"MYSQL_PWD=" + password},
		}
	}
	return execSpec{}
}

// allowReplicationAccess returns the command that lets the replication user
// actually connect.
//
// Postgres treats "replication" as a distinct pseudo-database in pg_hba.conf:
// the `host all all` line the image writes from POSTGRES_HOST_AUTH_METHOD does
// NOT cover replication connections, so pg_basebackup is rejected with "no
// pg_hba.conf entry for replication connection" no matter how the role is
// configured. The entry has to be added explicitly and the config reloaded.
//
// MySQL needs no equivalent: its replication user is created with a host
// wildcard, and it has no separate access-control file.
func (s engineSpec) allowReplicationAccess(inst *models.DBInstance, password string) execSpec {
	if s.engine != models.EnginePostgres {
		return execSpec{}
	}

	hba := s.dataDir + "/pg_hba.conf"
	// Appended idempotently so a restart or a second replica does not stack
	// duplicate lines, then reloaded so it takes effect without a restart.
	script := fmt.Sprintf(
		`set -e
		 grep -qE '^host[[:space:]]+replication[[:space:]]+tefter_repl' %s || \
		   echo 'host replication tefter_repl all scram-sha-256' >> %s
		 psql -U %s -d %s -tAc 'SELECT pg_reload_conf()' >/dev/null`,
		hba, hba, inst.Username, inst.Database,
	)
	return execSpec{
		Argv: []string{"sh", "-c", script},
		Env:  []string{"PGPASSWORD=" + password},
	}
}

// seedReplica returns the command that gives a fresh replica its starting copy
// of the primary's data. Both engines need one, for different reasons, and the
// two run at different moments: the Postgres clone replaces the data directory
// and so must happen before the server starts, while the MySQL import needs a
// running server and so happens after.
//
// Postgres: pg_basebackup clones the data directory and, with -R, writes the
// standby configuration at the same time.
func (s engineSpec) seedReplica(primaryHost, replPassword string) execSpec {
	if s.engine != models.EnginePostgres {
		return execSpec{}
	}
	return execSpec{
		Argv: []string{
			"pg_basebackup",
			"-h", primaryHost,
			"-p", fmt.Sprintf("%d", s.port),
			"-U", "tefter_repl",
			"-D", s.dataDir,
			// Plain format, streaming WAL alongside the base copy so the
			// clone is consistent without needing archived WAL.
			"-Fp", "-Xs",
			// Writes standby.signal and primary_conninfo, which is what makes
			// the clone start as a follower rather than a second primary.
			"-R",
			// Never prompt: this runs unattended.
			"-w",
		},
		Env: []string{"PGPASSWORD=" + replPassword},
	}
}

// seedReplicaMySQL returns the command that loads a fresh MySQL replica with
// the primary's data and tells it which transactions it can therefore skip.
//
// Letting GTID auto-positioning replay the primary's binlog from the beginning
// looks like it should work and does not: the primary's binlog contains the
// statements its own image ran to initialise itself, and the replica's image
// has just run the equivalent statements locally. The applier hits the first
// CREATE and stops with a duplicate-object error, leaving a replica that is
// permanently stuck.
//
// Importing a dump and setting GTID_PURGED from it establishes a real starting
// point, so auto-positioning resumes from there instead of from zero.
//
// Both credentials come from the container's own environment rather than from
// arguments, so neither ends up in a process listing.
func (s engineSpec) seedReplicaMySQL(primaryHost, database string) execSpec {
	if s.engine != models.EngineMySQL {
		return execSpec{}
	}

	// Setting GTID_PURGED requires an empty gtid_executed, so the GTIDs the
	// replica generated during its own initialisation have to go first. The
	// statement was renamed in 8.4 and Tefter supports both, hence the
	// fallback rather than a version check.
	script := fmt.Sprintf(`set -e
	  export MYSQL_PWD="$%s"
	  mysql --protocol=socket -uroot -e 'RESET BINARY LOGS AND GTIDS' 2>/dev/null \
	    || mysql --protocol=socket -uroot -e 'RESET MASTER'
	  MYSQL_PWD="$%s" mysqldump -h %s -P %d -u tefter_repl \
	    --single-transaction --routines --triggers --events \
	    --set-gtid-purged=ON --databases %s > /tmp/tefter-seed.sql
	  mysql --protocol=socket -uroot < /tmp/tefter-seed.sql
	  rm -f /tmp/tefter-seed.sql`,
		tefterPasswordEnv, tefterReplPasswordEnv, primaryHost, s.port, database,
	)
	return execSpec{Argv: []string{"sh", "-c", script}}
}

// startReplication returns the command that points a MySQL replica at its
// primary. Postgres needs no equivalent, since seedReplica already wrote the
// connection details into the data directory.
func (s engineSpec) startReplication(primaryHost, rootPassword, replPassword string) execSpec {
	if s.engine != models.EngineMySQL {
		return execSpec{}
	}
	sql := fmt.Sprintf(
		"CHANGE REPLICATION SOURCE TO SOURCE_HOST='%s', SOURCE_PORT=%d, "+
			"SOURCE_USER='tefter_repl', SOURCE_PASSWORD=%s, SOURCE_AUTO_POSITION=1, "+
			"GET_SOURCE_PUBLIC_KEY=1; START REPLICA;",
		primaryHost, s.port, quoteMySQLLiteral(replPassword),
	)
	return execSpec{
		Argv: []string{"mysql", "-uroot", "-e", sql},
		Env:  []string{"MYSQL_PWD=" + rootPassword},
	}
}

// enforceReadOnly returns the command that stops a replica accepting writes.
//
// Applied after initialisation rather than through server arguments (see
// replicaCommand), in two parts: a runtime SET for the server that is already
// up, and a drop-in config file so a plain container restart comes back
// read-only too. The file lives in the container's own filesystem, not the
// data volume, so promoting a replica (which recreates the container) clears
// it without any extra cleanup.
//
// Postgres needs no equivalent: a standby refuses writes because it is in
// recovery, which is not a setting that can drift.
func (s engineSpec) enforceReadOnly(inst *models.DBInstance, password string) execSpec {
	if s.engine != models.EngineMySQL {
		return execSpec{}
	}
	// super_read_only implies read_only, and unlike read_only it also holds
	// for users with SUPER, which every account Tefter creates has.
	script := `set -e
	  printf '[mysqld]\nread_only=ON\nsuper_read_only=ON\n' > /etc/mysql/conf.d/tefter-replica.cnf
	  mysql --protocol=socket -uroot -e 'SET GLOBAL super_read_only = ON'`
	return execSpec{
		Argv: []string{"sh", "-c", script},
		Env:  []string{"MYSQL_PWD=" + password},
	}
}

// allowWrites reverses enforceReadOnly, for a replica being promoted.
func (s engineSpec) allowWrites(inst *models.DBInstance, password string) execSpec {
	if s.engine != models.EngineMySQL {
		return execSpec{}
	}
	script := `set -e
	  rm -f /etc/mysql/conf.d/tefter-replica.cnf
	  mysql --protocol=socket -uroot -e 'SET GLOBAL super_read_only = OFF; SET GLOBAL read_only = OFF'`
	return execSpec{
		Argv: []string{"sh", "-c", script},
		Env:  []string{"MYSQL_PWD=" + password},
	}
}

// replicationStatus returns the command that reports how far behind a replica
// is. The output is parsed by parsePostgresLag / parseMySQLLag.
func (s engineSpec) replicationStatus(replica *models.DBInstance, password string) execSpec {
	switch s.engine {
	case models.EnginePostgres:
		// Reported from the replica's own view: whether it is still in
		// recovery, how stale its last replay is, how many WAL bytes it has
		// received but not yet applied, and what the receiver thinks.
		//
		// The time figure needs the CASE guard: on its own,
		// now() - pg_last_xact_replay_timestamp() measures how long it has been
		// since the primary last committed anything, so a perfectly current
		// replica of an idle database reports a lag that grows forever. When
		// the replay LSN has caught up to the receive LSN there is nothing
		// outstanding, and the honest answer is zero.
		sql := `SELECT pg_is_in_recovery()::text
		        || '|' || COALESCE(CASE
		                    WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() THEN 0
		                    ELSE EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
		                  END::text, '')
		        || '|' || COALESCE(pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn())::text, '')
		        || '|' || COALESCE((SELECT status FROM pg_stat_wal_receiver LIMIT 1), 'no-receiver')`
		return execSpec{
			Argv: []string{"psql", "-U", replica.Username, "-d", replica.Database, "-tAc", sql},
			Env:  []string{"PGPASSWORD=" + password},
		}

	case models.EngineMySQL:
		return execSpec{
			Argv: []string{"mysql", "-uroot", "-e", "SHOW REPLICA STATUS\\G"},
			Env:  []string{"MYSQL_PWD=" + password},
		}
	}
	return execSpec{}
}

// promote returns the command that turns a replica into a standalone primary.
func (s engineSpec) promote(replica *models.DBInstance, password string) execSpec {
	switch s.engine {
	case models.EnginePostgres:
		// Deliberately not `pg_ctl promote`: pg_ctl refuses to run as root,
		// and docker exec runs as root. pg_promote() does the same job over an
		// ordinary connection, and waits for the promotion to finish rather
		// than only requesting it, so the caller knows it actually happened.
		return execSpec{
			Argv: []string{
				"psql", "-U", replica.Username, "-d", replica.Database,
				"-v", "ON_ERROR_STOP=1", "-tAc", "SELECT pg_promote(wait => true)",
			},
			Env: []string{"PGPASSWORD=" + password},
		}
	case models.EngineMySQL:
		// Stopping and forgetting the source leaves the server standalone;
		// clearing read-only makes it writable.
		sql := "STOP REPLICA; RESET REPLICA ALL; SET GLOBAL super_read_only=OFF; SET GLOBAL read_only=OFF;"
		return execSpec{
			Argv: []string{"mysql", "--protocol=socket", "-uroot", "-e", sql},
			Env:  []string{"MYSQL_PWD=" + password},
		}
	}
	return execSpec{}
}

// =============================================================================
// Backup and restore
// =============================================================================

// dump returns the command that writes a logical dump to stdout.
func (s engineSpec) dump(inst *models.DBInstance, password string) execSpec {
	switch s.engine {
	case models.EnginePostgres:
		return execSpec{
			Argv: []string{
				"pg_dump",
				"-U", inst.Username,
				"-d", inst.Database,
				// Makes the dump idempotent, so restoring over an existing
				// database replaces rather than collides.
				"--clean", "--if-exists",
				"--no-owner", "--no-privileges",
			},
			Env: []string{"PGPASSWORD=" + password},
		}
	case models.EngineMySQL:
		return execSpec{
			Argv: []string{
				"mysqldump",
				"-uroot",
				"--single-transaction",
				// Without this the dump carries the source's GTID state and
				// restoring it would corrupt replication on the target.
				"--set-gtid-purged=OFF",
				"--routines", "--triggers", "--events",
				"--add-drop-table",
				inst.Database,
			},
			Env: []string{"MYSQL_PWD=" + password},
		}
	}
	return execSpec{}
}

// restore returns the command that reads a dump from stdin.
func (s engineSpec) restore(inst *models.DBInstance, password string) execSpec {
	switch s.engine {
	case models.EnginePostgres:
		return execSpec{
			// ON_ERROR_STOP makes a failed restore fail loudly rather than
			// leaving the database half-populated and reporting success.
			Argv: []string{"psql", "-U", inst.Username, "-d", inst.Database, "-v", "ON_ERROR_STOP=1"},
			Env:  []string{"PGPASSWORD=" + password},
		}
	case models.EngineMySQL:
		return execSpec{
			Argv: []string{"mysql", "-uroot", inst.Database},
			Env:  []string{"MYSQL_PWD=" + password},
		}
	}
	return execSpec{}
}

// ready returns a command that succeeds once the server accepts connections.
//
// Both images initialise a fresh data directory on first start, which takes
// seconds and during which every other command fails, so callers wait on this
// before doing anything else.
func (s engineSpec) ready(inst *models.DBInstance, password string) execSpec {
	switch s.engine {
	case models.EnginePostgres:
		return execSpec{
			Argv: []string{"pg_isready", "-U", inst.Username, "-d", inst.Database},
			Env:  []string{"PGPASSWORD=" + password},
		}
	case models.EngineMySQL:
		// Deliberately not `mysqladmin ping`: that exits 0 as soon as the
		// server answers, including when it answers "access denied", so it
		// reports ready while the image is still initialising. And deliberately
		// over TCP rather than the socket, because the entrypoint runs its
		// setup pass with --skip-networking; a socket probe would succeed
		// against that temporary server and let Tefter write to a database
		// that is about to be restarted underneath it.
		//
		// Running a real query against the real database therefore proves all
		// three things at once: init has finished, the credentials are live,
		// and the database exists.
		return execSpec{
			Argv: []string{
				"mysql", "--protocol=tcp", "-h", "127.0.0.1",
				"-uroot", "-D", inst.Database, "-e", "SELECT 1",
			},
			Env: []string{"MYSQL_PWD=" + password},
		}
	}
	return execSpec{}
}

// =============================================================================
// Status parsing
// =============================================================================

// parsePostgresLag reads the pipe-delimited row replicationStatus produces.
// statsQuery returns the command that reads an instance's internal counters.
//
// Both engines return a single pipe-delimited line in the same field order, so
// one parser (parseInstanceStats) handles both:
//
//	connections|max_connections|size_bytes|commits|rollbacks|blocks_hit|blocks_read|deadlocks
func (s engineSpec) statsQuery(inst *models.DBInstance, password string) execSpec {
	switch s.engine {
	case models.EnginePostgres:
		sql := `SELECT (SELECT count(*) FROM pg_stat_activity)
		        || '|' || current_setting('max_connections')
		        || '|' || pg_database_size(current_database())
		        || '|' || COALESCE((SELECT sum(xact_commit) FROM pg_stat_database), 0)
		        || '|' || COALESCE((SELECT sum(xact_rollback) FROM pg_stat_database), 0)
		        || '|' || COALESCE((SELECT sum(blks_hit) FROM pg_stat_database), 0)
		        || '|' || COALESCE((SELECT sum(blks_read) FROM pg_stat_database), 0)
		        || '|' || COALESCE((SELECT sum(deadlocks) FROM pg_stat_database), 0)`
		return execSpec{
			Argv: []string{"psql", "-U", inst.Username, "-d", inst.Database, "-tAc", sql},
			Env:  []string{"PGPASSWORD=" + password},
		}

	case models.EngineMySQL:
		// global_status moved to performance_schema in 8.0; the database size
		// excludes the engine's own system schemas. MySQL has no cheap global
		// deadlock counter, so that field is zero.
		//
		// Every field is wrapped in IFNULL: CONCAT_WS silently drops NULL
		// arguments, which would shift every later field left and make the line
		// unparseable. A missing status variable must read as 0, not vanish.
		sql := `SELECT CONCAT_WS('|',
		    IFNULL((SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Threads_connected'), '0'),
		    IFNULL(@@max_connections, '0'),
		    IFNULL((SELECT SUM(data_length+index_length) FROM information_schema.tables
		       WHERE table_schema NOT IN ('mysql','information_schema','performance_schema','sys')), '0'),
		    IFNULL((SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Com_commit'), '0'),
		    IFNULL((SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Com_rollback'), '0'),
		    IFNULL((SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Innodb_buffer_pool_read_requests'), '0'),
		    IFNULL((SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME='Innodb_buffer_pool_reads'), '0'),
		    '0')`
		return execSpec{
			Argv: []string{"mysql", "--protocol=socket", "-uroot", "-N", "-B", "-e", sql},
			Env:  []string{"MYSQL_PWD=" + password},
		}
	}
	return execSpec{}
}

// parseInstanceStats parses the pipe-delimited line statsQuery produces. It
// fills only the counter fields; the caller sets Instance, Engine, Role, Up,
// replication lag and the timestamp.
func parseInstanceStats(out string) (*models.InstanceStats, bool) {
	parts := strings.Split(strings.TrimSpace(out), "|")
	if len(parts) < 8 {
		return nil, false
	}
	num := func(i int) int64 {
		v, err := parseInt(parts[i])
		if err != nil {
			return 0
		}
		return v
	}
	return &models.InstanceStats{
		Connections:    num(0),
		MaxConnections: num(1),
		SizeBytes:      num(2),
		CommitsTotal:   num(3),
		RollbacksTotal: num(4),
		BlocksHit:      num(5),
		BlocksRead:     num(6),
		DeadlocksTotal: num(7),
	}, true
}

// slowQueryThresholdMs is the mean-execution-time line above which a statement
// counts as slow. 100ms is the usual "a human notices" boundary and matches the
// platform Postgres receiver's threshold, so the two are comparable.
const slowQueryThresholdMs = 100

// enableSlowQueryStats returns the command that turns on slow-query tracking.
// Postgres needs the extension created (the library is already preloaded by
// primaryCommand); MySQL's performance_schema is on by default, so there is
// nothing to do. Safe to run more than once.
func (s engineSpec) enableSlowQueryStats(inst *models.DBInstance, password string) execSpec {
	if s.engine != models.EnginePostgres {
		return execSpec{}
	}
	return execSpec{
		Argv: []string{
			"psql", "-U", inst.Username, "-d", inst.Database,
			"-c", "CREATE EXTENSION IF NOT EXISTS pg_stat_statements",
		},
		Env: []string{"PGPASSWORD=" + password},
	}
}

// slowQueryQuery returns the command that reports slow-query statistics:
//
//	slow_statement_count|slowest_mean_ms
//
// Kept separate from statsQuery because its source can be absent (Postgres
// before pg_stat_statements was preloaded), and a failure here must not lose
// the core stats. parseSlowQueries reads the result.
func (s engineSpec) slowQueryQuery(inst *models.DBInstance, password string) execSpec {
	switch s.engine {
	case models.EnginePostgres:
		sql := fmt.Sprintf(`SELECT count(*) FILTER (WHERE mean_exec_time > %d)
		        || '|' || COALESCE(max(mean_exec_time), 0)
		        FROM pg_stat_statements`, slowQueryThresholdMs)
		return execSpec{
			Argv: []string{"psql", "-U", inst.Username, "-d", inst.Database, "-tAc", sql},
			Env:  []string{"PGPASSWORD=" + password},
		}
	case models.EngineMySQL:
		// performance_schema is on by default. AVG_TIMER_WAIT is in picoseconds;
		// /1e9 converts to milliseconds. Digests with no name are internal.
		sql := fmt.Sprintf(`SELECT CONCAT_WS('|',
		    IFNULL(SUM(CASE WHEN AVG_TIMER_WAIT/1e9 > %d THEN 1 ELSE 0 END), 0),
		    IFNULL(MAX(AVG_TIMER_WAIT)/1e9, 0))
		    FROM performance_schema.events_statements_summary_by_digest
		    WHERE DIGEST IS NOT NULL`, slowQueryThresholdMs)
		return execSpec{
			Argv: []string{"mysql", "--protocol=socket", "-uroot", "-N", "-B", "-e", sql},
			Env:  []string{"MYSQL_PWD=" + password},
		}
	}
	return execSpec{}
}

// parseSlowQueries parses the "count|slowest_ms" line slowQueryQuery produces.
func parseSlowQueries(out string) (count int64, slowestMs float64, ok bool) {
	parts := strings.Split(strings.TrimSpace(out), "|")
	if len(parts) < 2 {
		return 0, 0, false
	}
	c, err := parseInt(parts[0])
	if err != nil {
		return 0, 0, false
	}
	ms, err := parseFloat(parts[1])
	if err != nil {
		return 0, 0, false
	}
	return c, ms, true
}

func parsePostgresLag(out string) *models.ReplicationStatus {
	status := &models.ReplicationStatus{State: models.ReplicationUnknown}

	parts := strings.Split(strings.TrimSpace(out), "|")
	if len(parts) < 4 {
		status.Detail = strings.TrimSpace(out)
		return status
	}

	// Postgres renders a boolean as "t" on the wire but as "true" once cast to
	// text, which is what the status query does. Accept either rather than
	// depending on which rendering the cast happens to pick.
	first := strings.TrimSpace(parts[0])
	inRecovery := first == "t" || first == "true"
	if !inRecovery {
		// Out of recovery means the server is a primary, not a follower. That
		// is a real state (someone promoted it), not an error.
		status.State = models.ReplicationStopped
		status.Detail = "server is not in recovery; it is no longer a replica"
		return status
	}

	if v := strings.TrimSpace(parts[1]); v != "" {
		if secs, err := parseFloat(v); err == nil {
			status.LagSeconds = &secs
		}
	}
	if v := strings.TrimSpace(parts[2]); v != "" {
		if bytes, err := parseInt(v); err == nil {
			status.LagBytes = &bytes
		}
	}

	switch receiver := strings.TrimSpace(parts[3]); receiver {
	case "streaming":
		status.State = models.ReplicationStreaming
	case "no-receiver":
		// In recovery with no WAL receiver means the connection to the primary
		// is down, even though the replica still serves reads.
		status.State = models.ReplicationError
		status.Detail = "no WAL receiver: the replica is not connected to its primary"
	default:
		status.State = models.ReplicationCatchup
		status.Detail = receiver
	}

	return status
}

// parseMySQLLag reads the vertical output of SHOW REPLICA STATUS.
func parseMySQLLag(out string) *models.ReplicationStatus {
	status := &models.ReplicationStatus{State: models.ReplicationUnknown}

	if strings.TrimSpace(out) == "" {
		// An empty result means the server was never configured as a replica.
		status.State = models.ReplicationStopped
		status.Detail = "no replica status: the server is not configured as a replica"
		return status
	}

	fields := map[string]string{}
	for _, line := range strings.Split(out, "\n") {
		idx := strings.Index(line, ":")
		if idx < 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		fields[key] = strings.TrimSpace(line[idx+1:])
	}

	ioRunning := fields["Replica_IO_Running"] == "Yes"
	sqlRunning := fields["Replica_SQL_Running"] == "Yes"

	if v := fields["Seconds_Behind_Source"]; v != "" && v != "NULL" {
		if secs, err := parseFloat(v); err == nil {
			status.LagSeconds = &secs
		}
	}

	switch {
	case ioRunning && sqlRunning:
		status.State = models.ReplicationStreaming
		// A running replica reporting a large lag is catching up rather than
		// streaming in step.
		if status.LagSeconds != nil && *status.LagSeconds > 30 {
			status.State = models.ReplicationCatchup
		}
	case !ioRunning && !sqlRunning:
		status.State = models.ReplicationStopped
		status.Detail = firstNonEmpty(fields["Last_Error"], fields["Last_IO_Error"], "replication is stopped")
	default:
		status.State = models.ReplicationError
		status.Detail = firstNonEmpty(
			fields["Last_IO_Error"], fields["Last_SQL_Error"], fields["Last_Error"],
			fmt.Sprintf("IO thread %v, SQL thread %v", fields["Replica_IO_Running"], fields["Replica_SQL_Running"]),
		)
	}

	return status
}

// =============================================================================
// Quoting and small helpers
// =============================================================================

// quotePostgresLiteral renders a Go string as a Postgres string literal.
func quotePostgresLiteral(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

// quoteMySQLLiteral renders a Go string as a MySQL string literal.
func quoteMySQLLiteral(s string) string {
	return "'" + strings.NewReplacer(`\`, `\\`, `'`, `\'`).Replace(s) + "'"
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
