# Tefter - Database Service

Managed relational databases for Oblak: PostgreSQL and MySQL instances with
read replicas and backups, in the shape of Amazon RDS.

Tefter supplies the management API and the dashboard integration. The databases
themselves are stock engine images, the same way Spomen wraps MinIO, Izvor wraps
Proxmox and Pristaniste wraps Docker:

| Concept | Shaped like | Backed by |
|---|---|---|
| Instances | RDS DB instances | Official `postgres` and `mysql` images |
| Read replicas | RDS read replicas | Postgres streaming replication / MySQL GTID replication |
| Backups | RDS snapshots | Logical dumps (`pg_dump` / `mysqldump`) |

Each instance is a container Tefter provisions on demand, published on a host
port so ordinary database clients can connect to it directly.

## What it does

**Instances**
- Provision a PostgreSQL (16, 15, 14) or MySQL (8.4, 8.0) instance
- Predefined sizes (micro, small, medium, large) that cap CPU and memory
- Start, stop and delete
- The instance password is generated and returned exactly once, at creation

**Read replicas**
- Create a replica that is seeded from the primary and then streams changes
- A replica serves reads and refuses writes
- Live replication state and lag, per replica
- Promote a replica to a standalone primary (one-way)

**Backups**
- Take an on-demand logical backup, with an optional note
- List and delete backups; backups outlive the instance they came from
- Restore a backup over an instance, with a safety backup taken first

Automatic failover, cross-region replication and point-in-time recovery are
deliberately out of scope. Tefter is a single-node self-hosted service.

## Security model

Tefter provisions databases as containers, so it needs the host's container
runtime. Access to `docker.sock` is equivalent to root on the host. Tefter
limits the blast radius by labelling everything it creates and refusing to
touch containers without that label, but the socket itself is still full
control. **Do not expose this API to untrusted callers.**

Credentials are never passed on a command line, where they would be visible in
a process listing and in engine logs. Every engine command that needs a
password receives it through the environment (`PGPASSWORD`, `MYSQL_PWD`). The
generated instance password is returned once and never stored by Tefter: there
is no credential store to leak, and no way to recover a lost password.

## Quick start

```bash
make up-tefter
```

That starts the API. Verify:

```bash
curl http://localhost:8084/health
```

Provision a database:

```bash
curl -X POST http://localhost:8084/api/v1/instances \
  -H 'Content-Type: application/json' \
  -d '{"name":"orders","engine":"postgres","size":"small"}'
```

The response includes the password once. Connect with any client:

```bash
psql "postgresql://tefter:<password>@localhost:15000/orders"
```

Add a read replica:

```bash
curl -X POST http://localhost:8084/api/v1/instances/orders/replicas \
  -H 'Content-Type: application/json' \
  -d '{"name":"orders-ro","size":"micro"}'

# Check its lag
curl http://localhost:8084/api/v1/instances/orders-ro/replication
```

Back up and restore:

```bash
# Take a backup
curl -X POST http://localhost:8084/api/v1/instances/orders/backups \
  -H 'Content-Type: application/json' -d '{"description":"before migration"}'

# Restore it (confirm is required; a safety backup is taken first)
curl -X POST http://localhost:8084/api/v1/backups/restore \
  -H 'Content-Type: application/json' \
  -d '{"backup_id":"orders-20260101-120000-ab12","confirm":true}'
```

## API

All routes are under `/api/v1`. Health is at `/health`.

| Method | Path | Description |
|---|---|---|
| GET | `/engines` | Supported engines and versions |
| GET | `/sizes` | Available instance sizes |
| GET | `/instances` | List instances |
| POST | `/instances` | Provision an instance |
| GET | `/instances/{name}` | Get one instance |
| DELETE | `/instances/{name}` | Delete an instance and its data |
| POST | `/instances/{name}/start` | Start a stopped instance |
| POST | `/instances/{name}/stop` | Stop a running instance |
| GET | `/instances/{name}/replicas` | List an instance's replicas |
| POST | `/instances/{name}/replicas` | Create a read replica |
| GET | `/instances/{name}/replication` | Replication state and lag |
| POST | `/instances/{name}/promote` | Promote a replica to primary |
| GET | `/instances/{name}/backups` | Backups for one instance |
| POST | `/instances/{name}/backups` | Back up an instance |
| GET | `/backups` | List all backups |
| GET | `/backups/{id}` | Get one backup |
| DELETE | `/backups/{id}` | Delete a backup |
| POST | `/backups/restore` | Restore a backup (requires `confirm`) |

## Configuration

| Variable | Default | Description |
|---|---|---|
| `TEFTER_PORT` | `8084` | API listen port |
| `TEFTER_NETWORK` | `tefter-network` | Docker network provisioned instances join |
| `TEFTER_PORT_RANGE_START` | `15000` | First host port allocated to instances |
| `TEFTER_PORT_RANGE_END` | `15099` | Last host port allocated to instances |
| `TEFTER_BACKUP_DIR` | `/var/lib/tefter/backups` | Where backups are written |
| `TEFTER_PUBLIC_HOST` | `localhost` | Host clients use in a connection string |
| `TEFTER_STATS_INTERVAL_SECONDS` | `30` | How often each database is polled for stats (min 5) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `oblak-otel-collector:4317` | Telemetry collector |

## Observability

Every managed database is monitored, not just at the moment it is created.
Tefter runs a background collector that polls each instance's own counters on a
schedule and republishes them as OpenTelemetry metrics and logs, so a database
appears in the Oblak observability stack the way a service does. Nothing is
installed inside the database container: the collector asks the engine for its
own statistics through the same channel Tefter uses for everything else.

Metrics (service `tefter`, one series per instance, tagged `db.instance`,
`db.engine`, `db.role`):

| Metric | Meaning |
|---|---|
| `tefter.db.up` | 1 if the database answered, 0 if it did not |
| `tefter.db.connections` / `.connections.max` | Current and maximum client connections |
| `tefter.db.connection_utilization` | Connections as a fraction of the limit |
| `tefter.db.size` | On-disk size of the database, in bytes |
| `tefter.db.cache_hit_ratio` | Fraction of block reads served from the buffer cache |
| `tefter.db.commits` / `.rollbacks` / `.deadlocks` | Cumulative transaction counters |
| `tefter.db.replication.lag` | Replica lag behind its primary, in seconds |

The collector also emits a `database stats` log line per instance per interval,
so a database that goes down or fills up is visible in the Logs view, not only
on a chart. A database that stops responding is reported as `up=0` with a
`database is not responding` warning rather than vanishing from the dashboard.

The poll interval is `TEFTER_STATS_INTERVAL_SECONDS` (default 30, minimum 5).
The collector runs only when telemetry is enabled.

## How replication works

**PostgreSQL** uses streaming replication. On the primary, Tefter creates a
`tefter_repl` role and adds a `replication` line to `pg_hba.conf` (the general
host line the image writes does not cover replication connections). A new
replica is cloned with `pg_basebackup -R`, which writes `standby.signal` and
`primary_conninfo`, so it starts as a follower. Lag is read from
`pg_last_wal_replay_lsn()` and reported as zero when the replica has caught up.

**MySQL** uses GTID-based replication. A fresh replica cannot simply auto-position
from the beginning: the primary's binlog contains the statements its image ran to
initialise itself, which collide with the replica's own initialisation. Tefter
therefore seeds the replica from a `mysqldump --set-gtid-purged=ON`, which
establishes a starting GTID set, then points it at the primary with
`SOURCE_AUTO_POSITION=1`. The replica is set `super_read_only` after
initialisation (not at boot, which would break the image's own setup pass).

## Testing

```bash
make test-tefter
```

The engine layer is behind an interface with a mock, so the API and model tests
run without Docker. The end-to-end behaviour (real replication, backup and
restore) is exercised against live containers.
