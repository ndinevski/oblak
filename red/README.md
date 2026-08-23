# Red - Message Queue

A message queue for Oblak, in the shape of Amazon SQS. ("Red" is Croatian for a
queue or line.)

Red holds messages in named queues and delivers them at least once: a consumer
receives a message (which makes it invisible for a visibility timeout),
processes it, and deletes it; if it is not deleted in time it is redelivered,
and after too many redeliveries it is moved to a dead-letter queue. It is backed
by an embedded [bbolt](https://github.com/etcd-io/bbolt) database, so it is fully
self-hostable with no external dependency.

| Concept | Shaped like | Backed by |
|---|---|---|
| Queues | SQS queues | bbolt buckets |
| Visibility timeout | SQS visibility timeout | a per-message deadline + a background sweeper |
| Dead-letter queues | SQS redrive policy | move-on-receive past max-receive-count |
| Triggers | SQS → Lambda | a dispatcher that invokes Impuls functions |
| Backups | SQS has none; parity with other Oblak services | logical JSON exports |

## What it does

**Queues**
- Create a queue with a visibility timeout, retention, and optional dead-letter policy
- List, inspect (live depth), purge and delete

**Messages**
- Send a message (with an optional delay), up to 256 KB
- Receive a batch (1-10), which makes those messages invisible until deleted or
  the visibility timeout returns them; long polling is supported
- Delete (ack) a message by its receipt handle
- Change a message's visibility timeout mid-flight

**Delivery guarantees**
- At-least-once: an un-acked message is redelivered after its visibility timeout
- Dead-lettering: a message received more than `max_receive_count` times is moved
  to the queue's dead-letter queue
- Retention: a message older than the queue's retention is dropped

A background **sweeper** enforces visibility timeouts, dead-lettering and
retention on a schedule, so these happen even for an idle queue.

**Triggers (Impuls integration)**
- A **subscription** connects a queue to an Impuls function
- A background **dispatcher** receives messages and invokes the function once per
  message; a successful invocation acks the message, a failure leaves it for the
  queue to retry and, eventually, dead-letter
- The producer's trace context travels with the message, so producer → queue →
  function is one distributed trace

FIFO ordering within a queue, exactly-once delivery, and message-group keys are
out of scope. Red is a single-node self-hosted queue.

## Quick start

```bash
make up-red
curl http://localhost:8087/health
```

Send and receive:

```bash
curl -X POST http://localhost:8087/api/v1/queues -d '{"name":"jobs"}'
curl -X POST http://localhost:8087/api/v1/queues/jobs/messages -d '{"body":"{\"task\":1}"}'

# Receive makes the message invisible; keep the receipt_handle to delete it.
curl -X POST http://localhost:8087/api/v1/queues/jobs/messages/receive -d '{"max_messages":1}'
curl -X POST http://localhost:8087/api/v1/queues/jobs/messages/delete \
  -d '{"receipt_handle":"rh-..."}'
```

Trigger an Impuls function for every message:

```bash
curl -X POST http://localhost:8087/api/v1/subscriptions \
  -d '{"name":"process-jobs","queue":"jobs","function":"my-worker"}'
```

## API

All routes are under `/api/v1`. Health is at `/health`.

| Method | Path | Description |
|---|---|---|
| GET/POST | `/queues` | List / create queues |
| GET/PATCH/DELETE | `/queues/{q}` | Get / update / delete a queue |
| GET | `/queues/{q}/stats` | Live depth (visible, in-flight, oldest age) |
| POST | `/queues/{q}/purge` | Delete all messages |
| POST | `/queues/{q}/messages` | Send a message |
| POST | `/queues/{q}/messages/receive` | Receive a batch |
| POST | `/queues/{q}/messages/delete` | Delete (ack) by receipt handle |
| POST | `/queues/{q}/messages/visibility` | Change a message's visibility |
| GET/POST | `/subscriptions` | List / create triggers |
| GET/PATCH/DELETE | `/subscriptions/{name}` | Get / update / delete a trigger |
| GET/POST | `/queues/{q}/backups` | Backups of one queue |
| GET | `/backups` | List all backups |
| DELETE | `/backups/{id}` | Delete a backup |
| POST | `/backups/restore` | Restore a backup (requires `confirm`) |

## Runtime settings (editable while running)

A queue's operational settings can be changed after creation without recreating
it, via `PATCH /queues/{q}` or the dashboard's **Edit** button on the queue's
Overview: visibility timeout, retention, and the dead-letter policy
(`max_receive_count` + `dead_letter_queue`). Changes apply to messages received
from then on. The queue's name and its messages are never touched.

A trigger can be paused, resumed, and have its batch size changed without
deleting it, via `PATCH /subscriptions/{name}` (`enabled`, `batch_size`) or, on
the dashboard's Triggers page, the enable toggle and the **Edit** (pencil)
action. The queue and function it binds are fixed at creation; recreate the
trigger to repoint it.

Everything else (ports, the Impuls URL, data locations, intervals) is
deploy-time configuration; see below and `docs/CONFIGURATION.md`.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `RED_PORT` | `8087` | API listen port |
| `RED_DATA_FILE` | `/var/lib/red/red.db` | Embedded bbolt database |
| `RED_BACKUP_DIR` | `/var/lib/red/backups` | Where backups are written |
| `RED_SWEEP_INTERVAL_SECONDS` | `5` | How often timeouts/dead-lettering/retention are enforced |
| `RED_IMPULS_URL` | (unset) | Impuls base URL; set it to enable triggers |
| `RED_IMPULS_LOCAL` | `false` | Invoke functions in Impuls local mode (no Firecracker), for hosts without microVM support |
| `RED_DISPATCH_INTERVAL_SECONDS` | `2` | How often subscriptions are dispatched |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `oblak-otel-collector:4317` | Telemetry collector |

## How visibility timeouts work

Each queue has two bbolt buckets: the messages, and an ordered index keyed by
each message's next-visible time. Receiving a message re-indexes it at its
visibility deadline, so "the next visible message" and "everything whose
deadline has passed" are both cheap ordered scans. The sweeper walks the expired
entries and either returns them to visible (redelivery) or, past
`max_receive_count`, moves them to the dead-letter queue. Dead-lettering is also
enforced at receive time, so an eager consumer cannot outrun the sweeper and
redeliver a poison message forever.

## Testing

```bash
make test-red
```

The store is behind an interface with an in-memory mock, so the API tests run
without disk; the real bbolt store is covered by its own tests, including the
visibility-timeout state machine, dead-lettering, delayed messages, retention,
FIFO order, and backup round-trips.
