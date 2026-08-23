# Build stage
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o indeks-server ./cmd/indeks-server

# Runtime stage
FROM alpine:3.19
WORKDIR /app
RUN apk --no-cache add ca-certificates curl
COPY --from=builder /app/indeks-server .

# Run as a non-root user. The data file and backups are written here, so the
# directory must exist and be writable before the volume is mounted over it.
RUN adduser -D -u 10001 indeks \
    && mkdir -p /var/lib/indeks/backups \
    && chown -R indeks /app /var/lib/indeks
USER indeks

EXPOSE 8086

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8086/health >/dev/null || exit 1

ENTRYPOINT ["./indeks-server"]
