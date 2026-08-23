# Oblak Observability

CloudWatch-style observability for the whole Oblak platform: logs, metrics and
traces from every service in one store, queried through one API, and rendered
in the Oblak dashboard.

## How it fits together

```
impuls ─┐
spomen ─┤
izvor  ─┼─ OTLP/gRPC :4317 ─┐
Strapi ─┘                   │
                            ├─► OTel Collector ──► ClickHouse ──► Strapi
browser (RUM) ── OTLP/HTTP ─┘    (batching,          (otel db)     /telemetry/*
                    :4318         filtering)                            │
host + container metrics ────────►                                      ▼
  (hostmetrics, docker_stats)                                  Oblak dashboard
```

Two rules shape the design:

- **The collector is the only ingest point.** No service holds ClickHouse
  credentials, and storage can be swapped without touching a single service.
- **One store for all three signals.** Because logs, metrics and traces share a
  SQL database, the dashboard can join across them: a log line links to its
  trace, a trace links to its logs, and an audit entry links to the request that
  produced it.

## Quick start

```bash
make up-observability
```

That creates the shared `oblak-telemetry` network, starts ClickHouse and the
collector, and lets the collector create its own schema on first run.

Verify:

```bash
curl http://localhost:13133/          # collector health
curl http://localhost:8123/ping       # ClickHouse health
```

Then open **Observability** in the dashboard.

## Configuration

Copy `.env.example` to `.env`. Everything has a working default except the
ClickHouse password, which you should change.

| Variable | Purpose |
|---|---|
| `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` / `CLICKHOUSE_DB` | Telemetry store credentials |
| `CLICKHOUSE_HTTP_PORT` | HTTP interface (8123), used by the Strapi query API |
| `CLICKHOUSE_NATIVE_PORT` | Native protocol, remapped to **9010** because MinIO/Spomen already uses 9000 |
| `OTLP_GRPC_PORT` / `OTLP_HTTP_PORT` | Collector ingest (4317 / 4318) |
| `OTEL_TTL` | Retention for every signal (default 720h = 30 days) |
| `OBLAK_ENV` | Environment tag stamped onto every signal |
| `DOCKER_GID` | Host docker group id, needed for container metrics |

The backend needs matching values so it can query the store:

```bash
# backend-dashboard/.env
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_DB=otel
CLICKHOUSE_USER=oblak
CLICKHOUSE_PASSWORD=<same as observability/.env>
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

## What is instrumented

| Source | Traces | Metrics | Logs |
|---|:---:|:---:|:---:|
| Impuls, Spomen, Izvor, Brod, Tefter, Vrata (Go) | yes | yes | yes |
| Impuls function logs (per invocation, `faas.*`) | via trace | - | yes |
| Strapi backend (Node) | yes | yes | yes |
| Dashboard (browser RUM) | yes | - | - |
| Host (CPU, memory, disk, network) | - | yes | - |
| Containers (every container, CPU/mem/net) | - | yes | - |
| Postgres internals (platform databases) | - | yes | - |
| Tefter-managed databases (per instance) | - | yes | yes |
| Redis (Polaroid cache) | - | yes | - |
| MinIO (Spomen storage) | - | yes | - |
| ClickHouse (the telemetry store itself) | - | yes | - |
| Brod containers & other workloads (stdout/stderr) | - | - | yes |
| Vrata-proxied requests to workloads | yes | yes | yes |

The Go services emit a server span, RED metrics and a trace-correlated access
log for every request. Route templates (`/functions/{name}`) rather than
concrete paths are used as the metric dimension, so cardinality stays bounded.

Strapi is auto-instrumented down to its SQL, so a slow dashboard endpoint can be
traced to the query behind it.

Each platform Postgres is scraped directly for connection counts, cache hit
ratio, database size and table/index statistics. Container metrics only show CPU
and memory; these are the numbers that explain *why* a query was slow. The
databases are attached to the shared `oblak-telemetry` network so the collector
can reach them, and each has its own credentials in `.env`.

The backing systems behind the services report their own internals: Redis
(keyspace, memory, hit rate), MinIO (capacity, objects, request rate) over its
public Prometheus endpoint, and ClickHouse itself over the Prometheus endpoint
enabled in `clickhouse/config/prometheus.xml` — so the store that holds every
other signal is monitored too.

Tefter's managed databases are not scraped by the collector (they come and go as
Tefter provisions them); instead Tefter's own stats collector polls each
instance and emits `tefter.db.*` metrics and a per-database log line. See
`tefter/README.md`.

**Workload logs.** A Brod container or any workload runs the operator's own
image with no Oblak telemetry. The `filelog/containers` receiver tails Docker's
own json-file logs from `/var/lib/docker/containers`, so every container's
stdout/stderr reaches the log explorer under the service name `workload-logs`,
tagged with the container id. This is how a plain nginx container's access log
becomes searchable without touching the image. The collector runs as root for
this, which is no new privilege since it already mounts docker.sock.

**Workload requests.** For HTTP traffic *to* a workload (which bypasses every
instrumented service), route it through the Vrata gateway, which records a span,
an access log and RED metrics per request. See `vrata/README.md`.

## Retention and cost

Retention is a ClickHouse table TTL (`OTEL_TTL`), not an application job. Data
ages out on its own, and the dashboard's Metrics page shows rows and disk per
signal so growth is visible.

Health checks are dropped from traces at the collector: Docker polls them every
few seconds and they would otherwise dominate the trace explorer.

## Alerting

Rules are evaluated on the backend against the telemetry store and surfaced in
the dashboard under **Observability -> Alerts**.

A rule names a **rule type** rather than carrying SQL. That keeps arbitrary
queries out of a user-editable field, bounds evaluation cost, and lets the
dashboard render a real form. The available types cover service error rate and
latency, request rate, services and containers that have stopped reporting,
error-log volume, host CPU/memory/disk, container memory, Postgres connections
and slow statements, and Tefter database health (a managed database that is down
or a read replica that has fallen behind). The default rule set also watches
Brod, Tefter and Vrata for having stopped reporting, and Vrata's upstream error
rate.

Each rule carries a comparison, a threshold, a measurement window, and an
optional sustained duration so a brief spike does not page anyone.

### State machine

```
ok ──breach──> pending ──held for forMinutes──> firing
 ^                 │                               │
 └─────────────────┴──────── recovered ────────────┘

unknown  <── query failed, or no data in the window
```

The evaluator is deliberately conservative:

- a rule whose query fails goes to `unknown`, **never** to `firing`, so an
  unreachable telemetry store cannot page anyone,
- an empty window is `unknown` rather than `ok`, so a silent service does not
  look healthy,
- the two "not reporting" rule types are the exception, because there zero
  *is* the signal.

### Notifications

Notifications fire on transitions into and out of `firing`, never on every
evaluation cycle. Two channels are available per rule, both optional:

- **Webhook** - a JSON POST, which works with Slack, Discord or anything else
  that accepts one. Ten second timeout, so a hanging endpoint cannot stall the
  evaluation loop.
- **Email** - through the configured SMTP provider.

With neither set, the alert appears in the dashboard only. That is the default
for the seeded rules: a fresh install should not start emailing someone.

Two independent suppressions keep a noisy rule from becoming noise, without
hiding it from the dashboard:

- **Silence** a rule for a period from the Alerts page. It keeps evaluating and
  keeps showing its state; it just stops notifying. This is distinct from
  disabling, which stops evaluation entirely.
- **A notification cooldown** per rule sets a minimum gap between
  notifications, damping a rule that oscillates around its threshold. A
  recovery is never held back by cooldown: telling someone a problem started
  and then withholding "it stopped" is worse than one extra message.

A suppressed transition is still written to the telemetry store, tagged with
`oblak.alert.notification_suppressed`, so the silence is itself auditable.

Every state change is *also* emitted as an OpenTelemetry log record, so the
firing history sits in the log explorer beside the telemetry that caused it and
ages out with the same retention. Filter on `oblak.alert.event = true`.

### Defaults

Fourteen rules are seeded on first start, recreating the intent of the
Prometheus/Alertmanager rules the platform used to carry. They are seeded only
when no rules exist at all, so deleting one makes it stay deleted.

### Configuration

| Variable | Purpose |
|---|---|
| `ALERT_EVAL_INTERVAL_SECONDS` | Evaluation cadence, minimum 15s (default 60) |
| `ALERTS_ENABLED` | Set `false` to stop evaluating entirely |

## Postgres slow queries

`pg_stat_statements` gives per-statement execution statistics, which is what
turns "a query was slow" into "*this* query was slow". Two numbers per database
are collected every minute: how many distinct statements average over 100ms,
and the slowest average of any statement.

The extension needs `shared_preload_libraries=pg_stat_statements`, which cannot
be set at runtime. Each Oblak Postgres therefore sets it via its compose
`command`, and `observability/postgres-init` enables the extension on a fresh
volume. On an existing database, enable it once by hand:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

This covers the two Oblak-owned databases. Polaroid's Postgres is left alone
deliberately: it is a third-party appliance whose preload list (`vectors.so`)
is managed by the Immich image, and appending to it risks Immich's vector
search for little gain.

## Audit trail

Audit events used to be rows in Strapi's `activity_logs` table. They are now
OpenTelemetry log records carrying `oblak.audit.*` attributes, which means:

- they live with the rest of the telemetry and age out with the same TTL,
- they carry the trace id of the request that caused them, and
- the Activity view is served by `/api/telemetry/audit`.

Filter for `oblak.audit.event = true` in the log explorer to see only audit
records.

## Security notes

- **Container metrics need docker.sock.** That is equivalent to root on the
  host, and on SELinux systems the collector also runs with
  `security_opt: label:disable`. Both are documented inline in
  `docker-compose.yml` along with how to drop the feature if you would rather
  not make that trade.
- **The collector's OTLP ports are unauthenticated.** They are intended for a
  private network. Do not expose 4317/4318 to the internet without a proxy in
  front.
- **Browser RUM posts directly to the collector**, so the dashboard's origin
  must be listed under `receivers.otlp.protocols.http.cors` in
  `otel-collector/config.yaml`.
- **The query API is read-only.** Every ClickHouse query runs with
  `readonly=2`, and all user input travels as bound parameters.

## Troubleshooting

**Collector restarting with "Database otel does not exist"**
ClickHouse creates the database and user only when its data directory is empty.
If a first boot failed part-way, remove the volumes and start again:
`docker compose -f observability/docker-compose.yml down && docker volume rm observability_clickhouse-data observability_clickhouse-logs`

**Collector restarting with "permission denied ... docker.sock"**
The host docker group id does not match `DOCKER_GID`. Find it with
`getent group docker | cut -d: -f3` and set it in `.env`.

**Dashboard shows "Telemetry store unreachable"**
Check `CLICKHOUSE_URL` in `backend-dashboard/.env` and that ClickHouse is
healthy. Note that Strapi reads `.env` only at startup, so restart it after
changing those values.

**No browser telemetry**
Confirm `VITE_OTLP_ENDPOINT` is set in `frontend-dashboard/.env` and that the
dashboard's origin is in the collector's CORS allowlist.
