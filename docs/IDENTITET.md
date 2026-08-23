# Access control (Identitet)

Oblak has a lightweight identity-and-access model: one **root** account with
full access, and any number of **members** each granted access to specific
services. It is deliberately coarse (the shape of Identitet, not fine-grained
policies), and is the foundation for the CLI/SDK credentials coming next.

## The model

- **Root** sees and does everything, and is the only account that can manage
  users. The root account is the one whose email matches `OBLAK_ROOT_EMAIL`
  (see below). There is exactly one, asserted from the environment.
- **Members** are every other account. A member has a **grants** map giving it,
  per service, an access level of **none**, **read**, or **write** (write
  implies read). A newly self-registered account starts with **no access to any
  service** (least privilege): it sees an empty dashboard until root grants it
  something. The sidebar hides services a member cannot reach.
- Within a service that owns resources, a member additionally sees and touches
  only the resources **it created** (owner-isolation). Root sees all.

### Services

Grants are per service:

| Service | Covers |
|---|---|
| `functions` | Impuls functions |
| `vms` | Izvor virtual machines |
| `storage` | Spomen buckets and objects |
| `photos` | Polaroid |
| `containers` | Pristaniste containers, repositories, images |
| `databases` | Tefter databases, replicas, backups |
| `keyvalue` | Indeks tables, items, backups |
| `queues` | Red queues, triggers, backups |
| `gateway` | Vrata routes (shared infrastructure, not owner-isolated) |
| `observability` | Logs, traces, metrics, alerts, activity |

`gateway` and `observability` are shared infrastructure, so they are gated by
access level only (there is no per-user ownership of a route or a trace).
Everything else is owner-isolated: a member with `write` on `queues` can create
queues and manage the ones it created, but cannot see another member's queues.

## Setting the root account

Set `OBLAK_ROOT_EMAIL` in `backend-dashboard/.env` to the email of the account
that should be root:

```bash
OBLAK_ROOT_EMAIL=admin@oblak.local
```

This is asserted on every login and on backend start, which means:

- it survives a database reset,
- it cannot be locked out by an errant grant edit,
- changing it moves root to a different account on the next login/restart.

If it is unset, **no account has root access** and the backend logs a warning at
start. Register (or already have) an account with that email, then sign in: it
becomes root automatically.

## Managing users (root only)

Root gets a **Users** entry in the sidebar (**Settings -> Users**). From there:

- **Create a member**: username, email, password, and an initial per-service
  grant. The create form starts each service at **read** for convenience; change
  any to none or write before saving.
- **Edit grants**: change a member's access level per service at any time, with
  quick "None / All read / All write" shortcuts.
- **Block / unblock**: a blocked account cannot sign in.
- **Delete**: removes the account. Resources it created are not deleted.

The root account itself shows as "managed by env" and cannot be edited or
deleted from the UI; change `OBLAK_ROOT_EMAIL` instead.

### API

All under the dashboard API, root-only except `me`:

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/identitet/me` | any user | Current user's role and effective grants |
| GET | `/api/identitet/services` | root | Service catalogue and levels |
| GET | `/api/identitet/users` | root | List all users |
| POST | `/api/identitet/users` | root | Create a member |
| PUT | `/api/identitet/users/:id` | root | Update grants / blocked |
| DELETE | `/api/identitet/users/:id` | root | Delete a member |

## How enforcement works

Two independent gates, both in the dashboard backend (the Go services trust the
backend and are not exposed directly):

1. **Service-level gate.** Every proxied handler calls
   `requireAccess(ctx, service, 'read' | 'write')`. A member without the level is
   refused with `403`. Root always passes.
2. **Owner-isolation.** For owned services, list endpoints return only the
   caller's resources, and single-resource endpoints verify ownership before
   acting. A member cannot tell an unowned resource from a missing one (it gets
   `404`). Root bypasses this.

Ownership for the platform services (Pristaniste, Tefter, Indeks, Red) is tracked in a
small internal registry in the dashboard database, because those Go services
have no user model. Pristaniste containers also carry an `io.oblak.owner` label so
ownership travels with the container. The already-owned Strapi resources
(functions, VMs, buckets, photos) keep their existing `owner` relation.

The frontend hides services a member cannot reach, but the backend is always the
real gate.

## API keys (CLI and SDKs)

An API key lets the CLI or an SDK act as a user without their password. A key
**authenticates as its owner and inherits exactly the owner's access**, so every
gate above applies unchanged: a key is never more powerful than the person who
created it. Revoke a key and anything using it stops immediately.

### Managing keys

Every signed-in user manages their own keys under **Settings -> API Keys**:
create one (optionally with an expiry), copy the secret once, and revoke it later.
Root can additionally list all keys via the API.

The secret is shown **once**, at creation. Only a SHA-256 hash is stored, so a
lost key cannot be recovered: revoke it and make a new one.

### Using a key

Send it as either header:

```bash
curl http://<host>/api/red/queues -H "Authorization: Bearer oblak_xxx_yyy"
curl http://<host>/api/red/queues -H "X-API-Key: oblak_xxx_yyy"
```

The key format is `oblak_<keyId>_<secret>`. The `keyId` is a public lookup
handle; the `secret` is the part that is hashed and never stored.

### API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/identitet/keys` | List your keys (root: `?all=true` for everyone's) |
| POST | `/api/identitet/keys` | Create a key (`name`, optional `expiresInDays`); returns the secret once |
| DELETE | `/api/identitet/keys/:id` | Revoke a key (your own; root: any) |

### How it works

A key is resolved by a second content-api authentication strategy registered
alongside the users-permissions JWT strategy: a request carrying an `oblak_...`
key is authenticated as the key's owner, with the same permission ability the
owner's session would have. So the permission layer, the identitet grants, and
owner-isolation all treat a key request exactly like a session request. An
`X-API-Key` header is promoted to `Authorization: Bearer` by a small middleware
so both header styles take the same path.

## What is deliberately out of scope (for now)

- **Per-resource policies** (e.g. "this Impuls function may read this one Indeks
  table but not others"): the next phase. Today access is per service plus
  owner-isolation, and a key inherits its owner's access wholesale rather than
  being scoped to a subset.
- **Groups / teams**: access is per user, not per group.
- **Custom roles**: there are two roles, root and member.
