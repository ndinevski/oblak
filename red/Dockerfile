# Build stage
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o red-server ./cmd/red-server

# Runtime stage
FROM alpine:3.19
WORKDIR /app
RUN apk --no-cache add ca-certificates curl
COPY --from=builder /app/red-server .
RUN adduser -D -u 10001 red \
    && mkdir -p /var/lib/red/backups \
    && chown -R red /app /var/lib/red
USER red
EXPOSE 8087
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8087/health >/dev/null || exit 1
ENTRYPOINT ["./red-server"]
