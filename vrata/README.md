# Vrata - Gateway

The Oblak gateway: an instrumented reverse proxy that sits in front of the
workloads Oblak runs, so that **every request to a workload is traced and
logged**. ("Vrata" is Croatian for "gate".)

## Why it exists

Oblak's services (Impuls, Spomen, Izvor, Pristaniste, Tefter) are all instrumented:
their management APIs emit traces, logs and RED metrics. But the *workloads*
they run are not. A Pristaniste container runs the operator's own image; an Izvor VM
runs a whole guest OS. Neither carries Oblak telemetry, so once a container or
VM is running, HTTP traffic to it is invisible: you cannot see a request, its
status, or its latency anywhere in the dashboard.

Vrata closes that gap. Point traffic at Vrata instead of straight at the
workload, and Vrata records a span, an access-log line and RED metrics for every
request before forwarding it. That record shows up in the observability UI
alongside every other Oblak service, under the service name `vrata`, tagged with
the route and whether the upstream is a container or a VM.

| | Instrumented before | Instrumented by Vrata |
|---|---|---|
| Service management APIs | yes | - |
| Impuls function invocations | yes (via the invoke API) | - |
| Traffic to Pristaniste containers | no | yes |
| Traffic to Izvor VMs | no | yes |

## How it works

Vrata listens on two ports:

- **Management API** (`8085`) - a small CRUD API for the route table.
- **Data-plane proxy** (`8090`) - where traffic to workloads goes.

A **route** maps an incoming request to an upstream. A request is matched to a
route in one of two ways:

- **By Host header** - set a route's `host` (e.g. `shop.oblak.lan`) and any
  request with that Host is forwarded with its path untouched. This is what lets
  a single-page app whose assets live at `/assets/...` work unmodified.
- **By path prefix** - a request to `/<name>/...` matches the route named
  `<name>`; the `/<name>` prefix is stripped before forwarding (unless
  `strip_prefix` is false). This needs no DNS and suits an API under a shared
  address.

A Host match always wins over a path match.

### Auto-discovery of Pristaniste containers

Vrata can register routes on its own. When `VRATA_PRISTANISTE_URL` is set, a background
poller asks Pristaniste for its running containers and keeps one route per container
that publishes a port: a container named `webapp` becomes a route `webapp`
reachable at `<proxy>/webapp/...`. Containers with more than one published port
get one route each, suffixed with the container port (`webapp-80`, `webapp-9090`).

This means a container deployed through Pristaniste is observable through Vrata with no
manual step: run it, and its traffic shows up in the dashboard. When the
container stops or is deleted, its route is removed on the next poll.

Discovered routes carry `source: "pristaniste"`. Reconciliation only ever touches
routes it owns: a route you created by hand (`source: "manual"`) is never
modified or removed, and if a container happens to share a manual route's name,
the manual route wins.

Only Pristaniste containers are auto-discovered. Izvor VMs are not: a VM's address
alone does not say whether it serves HTTP or on what port, so VM routes are
created manually (the `vm` kind). Tefter databases are never routed through
Vrata at all, since they speak the Postgres/MySQL wire protocol, not HTTP.

## Quick start

```bash
make up-vrata
curl http://localhost:8085/health
```

Register a route to a Pristaniste container published on host port 80:

```bash
curl -X POST http://localhost:8085/api/v1/routes \
  -H 'Content-Type: application/json' \
  -d '{
        "name": "webapp",
        "kind": "container",
        "upstream": "http://host.docker.internal:80",
        "target": "my-container",
        "host": "webapp.oblak.lan"
      }'
```

Now send traffic through the proxy - both of these are proxied and recorded:

```bash
curl -H 'Host: webapp.oblak.lan' http://localhost:8090/       # host-routed
curl http://localhost:8090/webapp/                            # path-routed
```

Every request appears in the dashboard under **Logs** (`vrata proxied request`),
**Traces** (`PROXY webapp`), and the **Service Map** (an edge into `vrata`),
each carrying the route name, upstream, status and latency.

Front an Izvor VM the same way, using the VM's LAN address:

```bash
curl -X POST http://localhost:8085/api/v1/routes \
  -H 'Content-Type: application/json' \
  -d '{"name":"vm-app","kind":"vm","upstream":"http://192.168.1.100:80","host":"vm-app.oblak.lan"}'
```

If the VM is down, the request is recorded as a `502` - which means a broken VM
is now visible instead of silent.

## API

Management API, under `/api/v1` on port 8085:

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Service health and route count |
| GET | `/routes` | List routes |
| POST | `/routes` | Create a route |
| GET | `/routes/{name}` | Get one route |
| DELETE | `/routes/{name}` | Delete a route |

The dashboard reaches these through Strapi under `/api/vrata/*`, which adds
authentication and audit. The data plane (proxied workload traffic) uses the
proxy port directly and never goes through Strapi.

Routes can be managed from the dashboard under **Vrata** in the sidebar: the
page lists every route (manual and auto-discovered, distinguished by source),
and offers a form to add a route and a control to delete one. Auto-discovered
routes appear there automatically; a route deleted while its container still
runs reappears on the next discovery poll.

A route:

| Field | Meaning |
|---|---|
| `name` | Unique key; also the path-prefix segment. Lowercase letters, digits, hyphens. |
| `kind` | `container`, `vm` or `custom` - descriptive, used to tag telemetry. |
| `upstream` | Where matched requests go, as `scheme://host:port`. A bare `host:port` is assumed http. |
| `host` | Optional Host header to match; forwards the path untouched. |
| `strip_prefix` | Strip `/<name>` before forwarding a path match. Defaults to true. |
| `target` | Free-text name of the container or VM behind the route, for display. |

## Configuration

| Variable | Default | Description |
|---|---|---|
| `VRATA_API_PORT` | `8085` | Management API port |
| `VRATA_PROXY_PORT` | `8090` | Data-plane proxy port |
| `VRATA_ROUTE_FILE` | `/var/lib/vrata/routes.json` | Where the route table is persisted |
| `VRATA_PRISTANISTE_URL` | (unset) | Pristaniste's API URL. Set it to enable auto-discovery of Pristaniste containers; unset disables it. |
| `VRATA_DISCOVERY_INTERVAL_SECONDS` | `30` | How often Pristaniste is polled for containers (min 5) |
| `VRATA_WORKLOAD_HOST` | `host.docker.internal` | Host Vrata uses to reach a container's published port |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `oblak-otel-collector:4317` | Telemetry collector |

## Networking

Vrata joins the `oblak-telemetry` network to reach the collector, and is given a
`host.docker.internal` host-gateway mapping so a route can target a Pristaniste
container by its published host port. Izvor VMs are reached by their LAN address
directly.

## Testing

```bash
make test-vrata
```

The route table, matching rules and the proxy (against a real in-process
upstream) are covered by unit tests, so the behaviour is verified without any
live containers or VMs.
