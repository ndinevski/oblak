#!/bin/sh
# Resolve the OTel collector's container IP and write it to an env file for the
# Impuls systemd unit. The host's docker-proxy mishandles gRPC (HTTP/2), so the
# host-run server must reach the collector's container IP directly rather than
# localhost:4317. Re-run on every (re)start so a new collector IP is picked up.
set -eu
mkdir -p /run/impuls
IP=$(docker inspect oblak-otel-collector --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{"\n"}}{{end}}' 2>/dev/null | head -1 || true)
if [ -n "${IP:-}" ]; then
  echo "OTEL_EXPORTER_OTLP_ENDPOINT=${IP}:4317" > /run/impuls/otel.env
else
  # Collector not found: leave telemetry disabled rather than spamming errors.
  echo "OTEL_EXPORTER_OTLP_ENDPOINT=" > /run/impuls/otel.env
fi
