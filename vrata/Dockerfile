# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o vrata-server ./cmd/vrata-server

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# ca-certificates for TLS to https upstreams, curl for the healthcheck.
RUN apk --no-cache add ca-certificates curl

COPY --from=builder /app/vrata-server .

# Run as a non-root user. The route table is written here, so the directory
# must exist and be writable before the volume is mounted over it.
RUN adduser -D -u 10001 vrata \
    && mkdir -p /var/lib/vrata \
    && chown -R vrata /app /var/lib/vrata
USER vrata

# 8085 = management API, 8090 = data-plane proxy.
EXPOSE 8085 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8085/health >/dev/null || exit 1

ENTRYPOINT ["./vrata-server"]
