# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum* ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o tefter-server ./cmd/tefter-server

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# ca-certificates for TLS, curl for the healthcheck. The database clients are
# NOT installed here: every dump, restore and replication command runs inside
# the instance's own container, so it always uses a client matching that
# engine's exact version.
RUN apk --no-cache add ca-certificates curl

# Copy the binary
COPY --from=builder /app/tefter-server .

# Run as a non-root user. Pristaniste reaches docker.sock through the host's docker
# group (see group_add in docker-compose.yml) rather than by running as root.
# Backups are written here, so the directory must exist and be writable by the
# non-root user before the volume is mounted over it.
RUN adduser -D -u 10001 tefter \
    && mkdir -p /var/lib/tefter/backups \
    && chown -R tefter /app /var/lib/tefter
USER tefter

# Expose the API port
EXPOSE 8084

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8084/health >/dev/null || exit 1

ENTRYPOINT ["./tefter-server"]
