# Strapi Backend for Oblak Dashboard

## Development

```bash
npm install
npm run develop
```

## Production

```bash
npm run build
npm run start
```

## Docker

```bash
docker compose up -d
```

## What this backend does

Strapi is the control plane for the dashboard. It owns users, authentication,
resource ownership and the audit trail, and it proxies every underlying service
so the frontend talks to one authenticated origin:

| Path prefix | Proxies to | Service |
|---|---|---|
| `/api/functions` | Impuls | Serverless functions |
| `/api/virtual-machines` | Izvor | VMs |
| `/api/buckets`, `/api/objects` | Spomen | Object storage |
| `/api/brod/*` | Brod | Containers (registry + runtime) |
| `/api/tefter/*` | Tefter | Managed databases |
| `/api/vrata/*` | Vrata | Observability gateway |
| `/api/telemetry/*`, `/api/alert-rules/*` | ClickHouse | Observability & alerting |

Each proxy adds authentication and writes an audit record; failures are mapped
back to the status code the upstream returned. See `docs/API.md` for the full
endpoint reference and the per-service READMEs for the services themselves.

Telemetry (traces, logs, metrics, audit) is emitted via OpenTelemetry from
`src/telemetry/` and `instrumentation.cjs`.

## Environment Variables

See `.env.example` for all required environment variables, including the URL of
each proxied service (`IMPULS_URL`, `IZVOR_URL`, `SPOMEN_URL`, `BROD_URL`,
`TEFTER_URL`, `VRATA_URL`) and the telemetry endpoint.
