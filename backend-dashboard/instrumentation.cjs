/**
 * OpenTelemetry bootstrap for the Oblak dashboard backend.
 *
 * This file MUST be loaded before Strapi (see the `--require` flag in the npm
 * scripts). OpenTelemetry works by monkey-patching modules like `http` and
 * `pg` as they are first required; if Strapi loads them first there is nothing
 * left to patch and traces come out empty.
 *
 * Telemetry is optional: with OTEL_EXPORTER_OTLP_ENDPOINT unset this is a
 * no-op, so tests and bare local runs do not need a collector.
 */

'use strict';

const endpoint = (
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  process.env.OBLAK_OTLP_ENDPOINT ||
  ''
).replace(/\/$/, '');

if (!endpoint) {
  // Nothing to do. Deliberately quiet: this is the normal state during tests.
  return;
}

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-proto');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-proto');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} = require('@opentelemetry/semantic-conventions');

const serviceName = process.env.OTEL_SERVICE_NAME || 'oblak-backend';
const serviceVersion = process.env.OBLAK_SERVICE_VERSION || require('./package.json').version;
const environment = process.env.OBLAK_ENV || 'development';

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: serviceName,
  [ATTR_SERVICE_VERSION]: serviceVersion,
  'deployment.environment': environment,
  'oblak.platform': 'oblak',
});

const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
    exportIntervalMillis: 15000,
  }),
  logRecordProcessors: [
    // sdk-logs takes a single options object with the exporter inside it.
    // Passing the exporter positionally silently yields an undefined exporter
    // and every log record is dropped at export time.
    new BatchLogRecordProcessor({
      exporter: new OTLPLogExporter({ url: `${endpoint}/v1/logs` }),
      scheduledDelayMillis: 5000,
    }),
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      // Every file read would become a span. Enormous volume, no diagnostic
      // value for an HTTP API.
      '@opentelemetry/instrumentation-fs': { enabled: false },
      // Equally noisy, and the useful part (connect latency) already shows up
      // inside the HTTP and pg spans.
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        // Docker's healthcheck polls these every few seconds and would
        // otherwise dominate the trace explorer.
        ignoreIncomingRequestHook(request) {
          const url = request.url || '';
          return (
            url.startsWith('/_health') ||
            url === '/favicon.ico' ||
            url.startsWith('/admin/project-type')
          );
        },
      },
      // Captures the SQL Strapi runs, which is how a slow dashboard endpoint
      // gets traced down to the query behind it.
      '@opentelemetry/instrumentation-pg': {
        enhancedDatabaseReporting: true,
      },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
