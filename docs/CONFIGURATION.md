# Oblak Configuration Reference

Everything you can configure in Oblak, what it does, its default, whether you
need to set it, and **when you would change it**. Configuration comes in two
kinds, and the distinction matters:

- **Deploy-time (environment variables)** — read once at start-up from each
  service's `.env` file (or the compose environment). Changing one takes effect
  only after the service is restarted. These are infrastructure settings:
  ports, credentials, backend addresses, data locations, poll intervals.
- **Runtime (dashboard-editable)** — the operational settings of individual
  resources (a queue's visibility timeout, a trigger's enabled state, an alert
  rule's threshold). These change immediately, no restart, and can be edited
  from the dashboard.

> Rule of thumb: if it is about *the service* (where it listens, what it talks
> to), it is a deploy-time env var. If it is about *a resource the service
> manages* (a specific queue, table, function, alert), it is runtime and lives
> in the dashboard.

Each service ships an `.env.example`; copy it to `.env` and adjust. Every value
has a working default for local development except the passwords, which you
should change before exposing anything.

---

## Table of contents

- [Cross-cutting settings](#cross-cutting-settings)
- [Per-service deploy-time settings](#per-service-deploy-time-settings)
  - [Impuls (functions)](#impuls-functions)
  - [Spomen (object storage)](#spomen-object-storage)
  - [Izvor (VMs)](#izvor-vms)
  - [Pristaniste (containers)](#pristaniste-containers)
  - [Tefter (databases)](#tefter-databases)
  - [Vrata (gateway)](#vrata-gateway)
  - [Indeks (key/value)](#indeks-keyvalue)
  - [Red (message queue)](#red-message-queue)
  - [Observability (collector + ClickHouse)](#observability-collector--clickhouse)
  - [Dashboard backend (Strapi)](#dashboard-backend-strapi)
- [Runtime settings you change from the dashboard](#runtime-settings-you-change-from-the-dashboard)
- [Resource quotas](#resource-quotas)
- [First-run checklist](#first-run-checklist)

---

## Cross-cutting settings

These appear in several services and mean the same thing everywhere.

| Variable | Default | Required? | When to change |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `oblak-otel-collector:4317` | No | Only if the collector runs elsewhere. Unset it to run a service with telemetry disabled. |
| `OBLAK_ENV` | `development` | No | Set to `production` (or a name per deployment) so telemetry is tagged with the environment. |
| `OBLAK_ROOT_EMAIL` | (unset) | **Recommended** | The account with this email becomes the root user (full access, manages all others). Set it in `backend-dashboard/.env`. Unset means no account has root access. See [Identitet](IDENTITET.md). |
| `DOCKER_GID` | `989` | Sometimes | On a host where the `docker` group id is not 989 (`getent group docker`), set this so a service that uses the Docker socket can read it. Affects Pristaniste, Tefter and the collector. |
| `*_API_PORT` | per service | No | Change only to avoid a host port clash. The port *inside* the container is fixed; this is the published host port. |

The default port map (host side):

| Port | Service |
|---|---|
| 8080 | Impuls |
| 8081 | Spomen API |
| 8082 | Izvor |
| 8083 | Pristaniste API |
| 8084 | Tefter |
| 8085 | Vrata management API |
| 8086 | Indeks |
| 8087 | Red |
| 8090 | Vrata data-plane proxy |
| 9000 / 9001 | MinIO API / console (Spomen) |
| 5000 | Pristaniste image registry |
| 1337 | Dashboard backend (Strapi) |
| 5174 | Dashboard frontend (dev) |
| 4317 / 4318 | OTel collector (gRPC / HTTP) |
| 8123 | ClickHouse |
| 2283 | Polaroid (Immich) |

---

## Per-service deploy-time settings

### Impuls (functions)

| Variable | Default | Required? | When to change |
|---|---|---|---|
| `IMPULS_API_PORT` | `8080` | No | Host port clash. |
| `IMPULS_STORAGE_TYPE` | `postgres` | No | `file` for a dependency-free local run; `postgres` for production/multi-instance. |
| `IMPULS_DB_USER` / `IMPULS_DB_PASSWORD` / `IMPULS_DB_NAME` | `impuls` / `impuls123` / `impuls` | **Change password** | Always change the password before exposing it. |
| `IMPULS_DATA_DIR` | `/var/lib/impuls` | No | Where function code and (file mode) data live. |
| `STRAPI_INVOCATION_REPORT_URL` | backend URL | No | Only if the dashboard backend is elsewhere; this is how invocations are reported for the dashboard. |
| `IMPULS_REPORT_SECRET` | (empty) | Recommended | Set a shared secret so only Impuls can post invocation reports. |

Function logs and errors are shipped to observability automatically when
telemetry is enabled — nothing to configure. See `impuls/README.md`.

### Spomen (object storage)

| Variable | Default | Required? | When to change |
|---|---|---|---|
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | `spomen-admin` / `change-this-secret-key` | **Change password** | Always, before exposing. These are the storage root credentials. |
| `MINIO_API_PORT` / `MINIO_CONSOLE_PORT` | `9000` / `9001` | No | Port clashes. |
| `SPOMEN_API_PORT` | `8081` | No | Port clash. |
| `MINIO_DATA_DIR` | `./data` | Yes for production | Point at the disk/volume where objects should live. |

### Izvor (VMs)

| Variable | Default | Required? | When to change |
|---|---|---|---|
| `IZVOR_API_PORT` | `8082` | No | Port clash. |
| `PROXMOX_URL` | `https://proxmox.local:8006` | **Yes** | Your Proxmox endpoint. Izvor cannot provision VMs without it. |
| `PROXMOX_USER` / `PROXMOX_PASSWORD` | `root@pam` / (empty) | **Yes** | Proxmox credentials. |
| `PROXMOX_NODE` | `pve` | Maybe | The Proxmox node name to provision on. |
| `PROXMOX_INSECURE` | `true` | Production: set `false` | `true` skips TLS verification of the Proxmox cert; set `false` with a real cert in production. |

### Pristaniste (containers)

| Variable | Default | Required? | When to change |
|---|---|---|---|
| `PRISTANISTE_API_PORT` | `8083` | No | Port clash. |
| `PRISTANISTE_REGISTRY_PORT` | `5000` | No | Port clash with the image registry. |
| `REGISTRY_URL` | `http://pristaniste-registry:5000` | No | Only if the registry runs elsewhere. |
| `PRISTANISTE_REGISTRY_PUBLIC_HOST` | `localhost:5000` | **Yes for remote use** | The address clients use to `docker push`. Set to the host's LAN address (e.g. `192.168.1.83:5000`) so pushes work from other machines. |
| `PRISTANISTE_REGISTRY_USERNAME` / `PRISTANISTE_REGISTRY_PASSWORD` | (empty) | Recommended | Set to require auth on the registry. |
| `DOCKER_GID` | `989` | Sometimes | See cross-cutting. Pristaniste uses the host Docker socket. |

> **Security:** Pristaniste uses the host container runtime (`docker.sock` = root on
> the host). Do not expose the Pristaniste API to untrusted callers.

### Tefter (databases)

| Variable | Default | Required? | When to change |
|---|---|---|---|
| `TEFTER_API_PORT` | `8084` | No | Port clash. |
| `TEFTER_PORT_RANGE_START` / `_END` | `15000` / `15099` | No | The host ports database instances are published on. Widen for more than 100 instances, or move to avoid a clash. |
| `TEFTER_PUBLIC_HOST` | `localhost` | **Yes for remote use** | The host address that goes into a database connection string. Set to the LAN address so clients on other machines can connect. |
| `TEFTER_NETWORK` | `tefter-network` | No | The Docker network instances join so replicas can reach primaries. |
| `TEFTER_BACKUP_DIR` | `/var/lib/tefter/backups` | No | Where logical backups are written. |
| `TEFTER_STATS_INTERVAL_SECONDS` | `30` | No | How often each database is polled for metrics/logs. Lower for finer resolution, higher to reduce load. Minimum 5. |
| `DOCKER_GID` | `989` | Sometimes | See cross-cutting. |

### Vrata (gateway)

| Variable | Default | Required? | When to change |
|---|---|---|---|
| `VRATA_API_PORT` | `8085` | No | Port clash. |
| `VRATA_PROXY_PORT` | `8090` | No | The data-plane port workload traffic goes to. |
| `VRATA_PRISTANISTE_URL` | `http://pristaniste-api:8083` | No | Set to enable auto-discovery of Pristaniste containers; **unset to disable** it and manage routes by hand only. |
| `VRATA_DISCOVERY_INTERVAL_SECONDS` | `30` | No | How often Pristaniste is polled for containers. |
| `VRATA_WORKLOAD_HOST` | `host.docker.internal` | Maybe | The host Vrata uses to reach a container's published port. Change if the gateway runs outside Docker. |

### Indeks (key/value)

| Variable | Default | Required? | When to change |
|---|---|---|---|
| `INDEKS_API_PORT` | `8086` | No | Port clash. |
| `INDEKS_DATA_FILE` | `/var/lib/indeks/indeks.db` | No | The embedded database file. Put it on a persistent volume (the compose file already does). |
| `INDEKS_BACKUP_DIR` | `/var/lib/indeks/backups` | No | Where backups are written. |

### Red (message queue)

| Variable | Default | Required? | When to change |
|---|---|---|---|
| `RED_API_PORT` | `8087` | No | Port clash. |
| `RED_DATA_FILE` | `/var/lib/red/red.db` | No | The embedded database file. |
| `RED_BACKUP_DIR` | `/var/lib/red/backups` | No | Where backups are written. |
| `RED_SWEEP_INTERVAL_SECONDS` | `5` | No | How often visibility timeouts, dead-lettering and retention are enforced. Lower = tighter redelivery timing, more work. |
| `RED_IMPULS_URL` | `http://impuls-dev:8080` | For triggers | Impuls base URL. **Unset to disable triggers** entirely. |
| `RED_DISPATCH_INTERVAL_SECONDS` | `2` | No | How often subscriptions are dispatched to Impuls. |
| `RED_IMPULS_LOCAL` | `false` | Set `true` without Firecracker | Invoke functions in Impuls local mode (no microVM). Set `true` on a host that cannot run Firecracker; leave `false` in production. |

### Observability (collector + ClickHouse)

| Variable | Default | Required? | When to change |
|---|---|---|---|
| `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` / `CLICKHOUSE_DB` | `oblak` / (set one) / `otel` | **Change password** | Always change the password. The backend needs the same values to query. |
| `OTEL_TTL` | `720h` (30 days) | No | Retention for every signal. Raise for longer history (more disk), lower to save space. |
| `OTLP_GRPC_PORT` / `OTLP_HTTP_PORT` | `4317` / `4318` | No | Ingest ports. |

The collector also scrapes Postgres, Redis, MinIO and ClickHouse; those targets
are wired in `observability/otel-collector/config.yaml` and generally need no
change. See `observability/README.md`.

### Dashboard backend (Strapi)

The backend proxies every service and needs to know where each one is. It reads
the service URLs (and optional API keys) from its own `.env`:

| Variable | Default | When to change |
|---|---|---|
| `IMPULS_URL`, `IZVOR_URL`, `SPOMEN_URL`, `PRISTANISTE_URL`, `TEFTER_URL`, `VRATA_URL`, `INDEKS_URL`, `RED_URL`, `POLAROID_URL` | localhost ports above | Only if a service runs on a non-default host/port. |
| `*_API_KEY` (per service) | (empty) | Set if the corresponding service requires a bearer token. |
| `CLICKHOUSE_URL` / `CLICKHOUSE_DB` / `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` | localhost / matching observability | Must match the observability stack so the dashboard can read telemetry. |
| `ALERT_EVAL_INTERVAL_SECONDS` | `60` | How often alert rules are evaluated. |
| `ALERTS_ENABLED` | `true` | Set `false` to stop evaluating alert rules. |

Database, JWT and app-key settings are standard Strapi configuration; see
`docs/DEVELOPER-GUIDE.md`.

---

## Runtime settings you change from the dashboard

These are **not** environment variables. They live in the data and change
immediately from the dashboard (or the API), no restart:

| Where | What you can change | How |
|---|---|---|
| **Red → a queue → Overview** | Visibility timeout, retention, dead-letter policy | **Edit** button on the Policy card |
| **Red → Triggers** | Enable/pause a trigger, batch size | The **enable toggle** and the **Edit** (pencil) action; create/delete a trigger |
| **Tefter → an instance** | Add/promote replicas, take/restore backups | Instance detail tabs |
| **Pristaniste → a container** | Start / stop / restart / remove, resource limits at create | Container detail |
| **Indeks → a table** | Items (put/delete), backups | Table detail; the key schema is fixed at creation |
| **Vrata → Gateway** | Add/remove routes (manual ones) | Routes page; auto-discovered routes are managed for you |
| **Observability → Alerts** | Rule thresholds, windows, enable/mute, notifications | Alerts page |
| **Any service** | Take and restore backups | The service's Backups tab |

What is deliberately **not** dashboard-editable, and why:

- **Ports, backend URLs, credentials, data locations** — infrastructure. They
  need a restart and belong in `.env`/compose, not in a running app's UI.
- **A queue's name, or a table's key schema** — identity/structure that other
  data depends on. Create a new resource instead.
- **A trigger's queue or function binding** — recreate the trigger to repoint
  it (its enabled state and batch size *are* editable).

---

## Resource quotas

Quotas cap how much of each resource can be created, so a runaway script or a
mistake cannot exhaust the host. They are enforced at create time (the API
returns `403` with the limit in the message) and shown per resource under
**Settings → Quota**.

Functions, VMs and object storage are counted **per user**. The platform
services (Pristaniste, Tefter, Indeks, Red) keep their resources in the Go services
with no per-user ownership, so their quotas are counted **platform-wide** across
the whole deployment. Quota counting fails open: if a service is unreachable
when the quota is read, its usage is reported as zero rather than blocking, since
the create call would fail against that service anyway.

| Resource | Default cap | Scope |
|---|---|---|
| Functions | 20 | per user |
| Function invocations / day | 10,000 | per user |
| Virtual machines | 5 (32 cores, 32 GB, 500 GB disk total) | per user |
| Buckets | 10 (10 GB total) | per user |
| Containers (Pristaniste) | 20 | platform-wide |
| Databases (Tefter) | 10 | platform-wide |
| Key/value tables (Indeks) | 50 | platform-wide |
| Queues (Red) | 50 | platform-wide |

These defaults are defined in `backend-dashboard/src/api/quota/services/quota.ts`
(`DEFAULT_LIMITS`). They are not environment variables or dashboard-editable
today; change them there and restart the backend. The structure already allows
for per-user or per-plan limits later.

---

## First-run checklist

The minimum to change before anyone else can reach your deployment:

1. **Passwords.** `MINIO_ROOT_PASSWORD` (Spomen), `IMPULS_DB_PASSWORD`,
   `CLICKHOUSE_PASSWORD`, the dashboard database password, and `PROXMOX_PASSWORD`
   if you use Izvor.
2. **Public addresses**, if clients connect from other machines:
   `TEFTER_PUBLIC_HOST` and `PRISTANISTE_REGISTRY_PUBLIC_HOST` → your host's LAN address.
3. **Proxmox**, if you use Izvor: `PROXMOX_URL`, `PROXMOX_USER`,
   `PROXMOX_PASSWORD`, and `PROXMOX_INSECURE=false` with a real certificate.
4. **`OBLAK_ENV=production`** across services so telemetry is tagged correctly.
5. **Firecracker**: leave `RED_IMPULS_LOCAL=false` if the host runs microVMs;
   set it `true` only where Firecracker is unavailable.

Then `make up-observability` first (it creates the shared network), followed by
the services you want (`make up-impuls`, `make up-red`, and so on). See the root
`README.md` for the full start sequence.
