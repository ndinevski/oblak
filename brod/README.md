# Brod - Container Service

Self-hosted container platform for Oblak: an image registry and a container
runtime, in the shape of ECR and ECS.

Brod supplies the management API and the dashboard integration. The storage and
the runtime are stock components, the same way Spomen wraps MinIO and Izvor
wraps Proxmox:

| Half | Shaped like | Backed by |
|---|---|---|
| Image repositories | ECR | Docker Distribution (`registry:2`) |
| Containers | ECS | The host's container engine (Docker) |

## What it does

**Repositories and images**
- List repositories with image counts and total size
- Declare a repository before the first push, with name validation
- List tags in a repository, with digest, size, platform and push time
- Delete a tag or a whole repository

**Containers**
- Run a container from an image, with ports, env, volumes, CPU and memory limits
- Start, stop, restart and remove
- Read logs and sample resource usage

Autoscaling, load balancing and multi-node scheduling are deliberately out of
scope. Brod is a single-node self-hosted service; a "service" with one replica
and no scaling is the whole story, and an abstraction that never varies would
only be in the way.

## Quick start

```bash
make up-brod
```

That starts the registry and the API. Verify:

```bash
curl http://localhost:8083/health
```

Then push an image and run it:

```bash
# Push to Brod's registry
docker tag alpine:3.19 localhost:5000/my-app:v1
docker push localhost:5000/my-app:v1

# See it
curl http://localhost:8083/api/v1/repositories

# Run it
curl -X POST http://localhost:8083/api/v1/containers \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-app","image":"my-app:v1","ports":[{"container_port":80,"host_port":8090}]}'
```

Note the image reference is the bare `my-app:v1`. Brod resolves an unqualified
name against its own registry, so a freshly pushed image runs by short name. A
reference that already names a registry (`ghcr.io/owner/img`, `docker.io/...`)
is left alone and pulled from there.

## Ports

| Port | Purpose |
|---|---|
| 8083 | Brod API |
| 5000 | Image registry (`docker push` target) |

## Configuration

Copy `.env.example` to `.env`. Everything has a working default.

| Variable | Purpose |
|---|---|
| `BROD_API_PORT` | API port (8083) |
| `BROD_REGISTRY_PORT` | Published registry port (5000) |
| `REGISTRY_URL` | Where Brod reaches the registry, over the compose network |
| `BROD_REGISTRY_PUBLIC_HOST` | What users put in an image reference |
| `BROD_REGISTRY_USERNAME` / `_PASSWORD` | Registry credentials, if it requires them |
| `DOCKER_GID` | Host docker group id, needed to read `docker.sock` |

`REGISTRY_URL` and `BROD_REGISTRY_PUBLIC_HOST` differ on purpose: Brod talks to
the registry over the container network, while `docker push` runs on the host.
When pushing from another machine, set the public host to the server's LAN
address, for example `192.168.1.83:5000`.

## API

```
GET    /health
GET    /api/v1/registry                                  where to push and pull

GET    /api/v1/repositories                              list repositories
POST   /api/v1/repositories                              declare a repository
GET    /api/v1/repositories/{name}                       one repository
DELETE /api/v1/repositories/{name}                       delete every image in it
GET    /api/v1/repositories/{name}/images                list tags
GET    /api/v1/repositories/{name}/images/{tag}          one image
DELETE /api/v1/repositories/{name}/images/{tag}          delete a tag

GET    /api/v1/containers?all=true                       list containers
POST   /api/v1/containers                                run a container
GET    /api/v1/containers/{id}                           one container
DELETE /api/v1/containers/{id}?force=true                remove
POST   /api/v1/containers/{id}/start
POST   /api/v1/containers/{id}/stop
POST   /api/v1/containers/{id}/restart
GET    /api/v1/containers/{id}/logs?tail=100
GET    /api/v1/containers/{id}/stats
```

## Things worth knowing

**Creating a repository does not create anything.** The registry protocol
brings a repository into existence on first push. `POST /repositories`
validates the name and hands back the URI to push to, which is the useful half
of ECR's CreateRepository; the response reports `exists: false` until an image
lands.

**Deleting an image deletes a digest, not a tag.** The registry has no notion of
removing one tag. When several tags point at the same manifest they all go
together, so the API reports the image's `shared_tags` beforehand and lists
`also_deleted_tags` afterwards.

**Deletion does not immediately free disk.** Manifests are unlinked at once, but
space is only reclaimed when the registry runs garbage collection. The delete
response says so rather than overstating what happened.

**Deletion must be enabled on the registry.** `registry:2` disables it by
default; the compose file sets `REGISTRY_STORAGE_DELETE_ENABLED=true`. Against a
registry without it, delete endpoints return 501 with a clear message.

## Security

**Brod needs the host's container engine, and `docker.sock` is root-equivalent.**
That is inherent to running containers, not something Brod adds. Two things
limit the blast radius:

- Every container Brod creates is labelled `io.oblak.brod.managed`, and Brod
  lists, inspects and mutates **only** labelled containers. It cannot stop
  Postgres or delete the telemetry collector, even if asked by name: those
  return 404.
- The API process runs as a non-root user and reaches the socket through the
  host's docker group.

Neither changes the fact that the socket is mounted. **Do not expose Brod's API
to untrusted callers.** On SELinux hosts the container also runs with
`security_opt: label:disable`, the same trade the telemetry collector makes.

**The registry is unauthenticated by default**, which is appropriate only on a
trusted network. Set `BROD_REGISTRY_USERNAME` and `BROD_REGISTRY_PASSWORD`, and
configure the registry's own auth, before exposing it.

## Development

```bash
make build   # compile
make test    # run tests
make dev     # run against a local registry on :5000
```

Tests run without Docker or a registry: `internal/engine` provides `MockEngine`
and `MockRegistry`, and `api.NewServerWithBackends` injects them, so the whole
HTTP surface is exercised in memory. This mirrors Izvor's `MockClient`.

## Telemetry

Brod reports traces, RED metrics and trace-correlated logs to the Oblak
collector like every other service. The Docker SDK also instruments its own
transport, so engine calls appear as client spans inside a Brod trace, which
makes it visible when a slow request is really a slow image pull.
