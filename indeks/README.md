# Indeks - Key/Value Store

A key/value and document store for Oblak, in the shape of Amazon DynamoDB.

Indeks stores schemaless items in tables addressed by a **partition key** and an
optional **sort key**. Items in a partition are kept in sort-key order, so a
range query over one partition is cheap. It is backed by an embedded
[bbolt](https://github.com/etcd-io/bbolt) database, so it is fully self-hostable
with no external dependency, the same way Tefter wraps stock engine images and
Pristaniste wraps a stock registry.

| Concept | Shaped like | Backed by |
|---|---|---|
| Tables | DynamoDB tables | bbolt buckets |
| Partition + sort key | DynamoDB primary key | ordered composite byte keys |
| Items | DynamoDB items (JSON) | JSON values in the bucket |
| Backups | DynamoDB on-demand backups | logical JSON exports |

## What it does

**Tables**
- Create a table with a partition key and an optional sort key (string or number)
- The key schema is fixed at creation; every item must carry the key attributes
- List, inspect (item count, size) and delete tables

**Items**
- Put an item (a JSON object); putting over an existing key replaces it
- Get and delete an item by its key
- **Query** one partition, optionally narrowed by a sort-key condition
  (`eq`, `lt`, `lte`, `gt`, `gte`, `between`, `begins_with`), in ascending or
  descending order
- **Scan** a whole table

Number keys sort numerically, not lexically (2 < 10 < 100), because key values
are stored in an order-preserving encoding.

**Backups**
- Take an on-demand logical backup of a table (schema + every item)
- List and delete backups; backups outlive the table they came from
- Restore a backup over a table (replacing its contents), with `confirm` required

Global secondary indexes, streams, transactions and TTL are deliberately out of
scope. Indeks is a single-node self-hosted store.

## Quick start

```bash
make up-indeks
curl http://localhost:8086/health
```

Create a table and put an item:

```bash
# A table keyed by user_id (partition) and created (sort, numeric)
curl -X POST http://localhost:8086/api/v1/tables \
  -H 'Content-Type: application/json' \
  -d '{"name":"sessions","partition_key":"user_id","sort_key":"created","sort_type":"N"}'

curl -X PUT http://localhost:8086/api/v1/tables/sessions/items \
  -H 'Content-Type: application/json' \
  -d '{"item":{"user_id":"u1","created":1700000000,"ip":"10.0.0.1"}}'

# Query one user's sessions since a timestamp
curl -X POST http://localhost:8086/api/v1/tables/sessions/query \
  -H 'Content-Type: application/json' \
  -d '{"partition_value":"u1","sort":{"op":"gte","value":1699999999}}'
```

Back up and restore:

```bash
curl -X POST http://localhost:8086/api/v1/tables/sessions/backups          # -> {"id": "..."}
curl -X POST http://localhost:8086/api/v1/backups/restore \
  -H 'Content-Type: application/json' \
  -d '{"backup_id":"sessions-20260101-120000-ab12","confirm":true}'
```

## API

All routes are under `/api/v1`. Health is at `/health`.

| Method | Path | Description |
|---|---|---|
| GET | `/tables` | List tables |
| POST | `/tables` | Create a table |
| GET | `/tables/{table}` | Get one table |
| DELETE | `/tables/{table}` | Delete a table and its items |
| PUT | `/tables/{table}/items` | Put an item |
| POST | `/tables/{table}/get` | Get an item by key |
| POST | `/tables/{table}/delete` | Delete an item by key |
| POST | `/tables/{table}/query` | Query a partition |
| GET | `/tables/{table}/scan` | Scan a table (`?limit=`) |
| GET | `/tables/{table}/backups` | Backups of one table |
| POST | `/tables/{table}/backups` | Back up a table |
| GET | `/backups` | List all backups |
| GET | `/backups/{id}` | Get one backup |
| DELETE | `/backups/{id}` | Delete a backup |
| POST | `/backups/restore` | Restore a backup (requires `confirm`) |

Get/delete/query take the key values in the JSON body (`partition_value`,
`sort_value`), so a numeric key keeps its type.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `INDEKS_PORT` | `8086` | API listen port |
| `INDEKS_DATA_FILE` | `/var/lib/indeks/indeks.db` | The embedded bbolt database file |
| `INDEKS_BACKUP_DIR` | `/var/lib/indeks/backups` | Where backups are written |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `oblak-otel-collector:4317` | Telemetry collector |

## Testing

```bash
make test-indeks
```

The store is behind an interface with an in-memory mock, so the API tests run
without touching disk; the real bbolt store is covered by its own tests
(composite keys, numeric ordering, range queries, backup round-trips,
persistence across reopen).
