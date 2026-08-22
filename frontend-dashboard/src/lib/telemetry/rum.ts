/**
 * Real User Monitoring for the Oblak dashboard.
 *
 * The browser exports spans straight to the Oblak collector over OTLP/HTTP.
 * Because fetch calls to the Strapi API are instrumented and trace context is
 * propagated, a slow page in the browser can be followed through the backend
 * and into Impuls or Spomen on one trace.
 *
 * This is optional: with VITE_OTLP_ENDPOINT unset, initRum() does nothing, so
 * a plain `npm run dev` without the observability stack still works.
 */

import { WebTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { trace, type Tracer } from '@opentelemetry/api';

const SERVICE_NAME = 'oblak-dashboard';

let tracer: Tracer | null = null;
let started = false;

function endpoint(): string {
  const raw = (import.meta.env.VITE_OTLP_ENDPOINT as string | undefined) ?? '';
  return raw.replace(/\/$/, '');
}

/**
 * Hosts whose requests should carry trace context.
 *
 * This must stay a explicit allowlist: attaching `traceparent` to a
 * cross-origin request the server does not expect triggers a CORS preflight
 * failure, which would break the request rather than just lose a trace.
 */
function propagationTargets(): RegExp[] {
  const targets = [/localhost/, /127\.0\.0\.1/];

  for (const url of [
    import.meta.env.VITE_API_URL,
    import.meta.env.VITE_IMPULS_URL,
    import.meta.env.VITE_SPOMEN_URL,
    import.meta.env.VITE_IZVOR_URL,
  ]) {
    if (typeof url !== 'string' || !url) continue;
    try {
      const host = new URL(url, window.location.origin).host;
      targets.push(new RegExp(host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    } catch {
      // A malformed URL in the environment must not stop telemetry starting.
    }
  }

  return targets;
}

/**
 * Starts browser telemetry. Safe to call more than once.
 */
export function initRum(): void {
  if (started) return;
  started = true;

  const url = endpoint();
  if (!url) return;

  try {
    const provider = new WebTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: (import.meta.env.VITE_APP_VERSION as string) || 'dev',
        'deployment.environment': (import.meta.env.MODE as string) || 'development',
        'oblak.platform': 'oblak',
        // Distinguishes browser sessions in the telemetry store without
        // storing anything that identifies the person.
        'browser.language': navigator.language,
      }),
      spanProcessors: [
        new BatchSpanProcessor(new OTLPTraceExporter({ url: `${url}/v1/traces` }), {
          scheduledDelayMillis: 5000,
          maxExportBatchSize: 64,
        }),
      ],
    });

    provider.register({
      // Zone context keeps the active span correct across the async
      // boundaries React introduces; without it, fetch spans detach from the
      // interaction that caused them.
      contextManager: new ZoneContextManager(),
    });

    registerInstrumentations({
      instrumentations: [
        new DocumentLoadInstrumentation(),
        new FetchInstrumentation({
          propagateTraceHeaderCorsUrls: propagationTargets(),
          clearTimingResources: true,
          // Telemetry requests would otherwise trace themselves, producing an
          // endless feedback loop of spans about sending spans.
          ignoreUrls: [/\/v1\/traces$/, /\/v1\/metrics$/, /\/v1\/logs$/],
        }),
      ],
    });

    tracer = trace.getTracer(SERVICE_NAME);
    reportWebVitals();
  } catch (error) {
    // Telemetry must never prevent the dashboard from loading.
    console.warn('Browser telemetry disabled:', error);
  }
}

/**
 * Records Core Web Vitals as spans.
 *
 * Uses PerformanceObserver directly rather than pulling in the web-vitals
 * package: LCP and CLS are the two that matter for a dashboard, and both are
 * a few lines from the native API.
 */
function reportWebVitals(): void {
  if (typeof PerformanceObserver === 'undefined' || !tracer) return;

  const emit = (name: string, value: number, unit: string) => {
    if (!tracer) return;
    const span = tracer.startSpan(`web-vital ${name}`);
    span.setAttribute('web_vital.name', name);
    span.setAttribute('web_vital.value', value);
    span.setAttribute('web_vital.unit', unit);
    span.setAttribute('url.path', window.location.pathname);
    span.end();
  };

  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) emit('LCP', Math.round(last.startTime), 'ms');
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // Not supported in this browser; skip silently.
  }

  try {
    let cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { value: number; hadRecentInput: boolean }
      >) {
        // Layout shifts caused by user input are expected and excluded from
        // the metric by the spec.
        if (!entry.hadRecentInput) cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });

    // CLS is cumulative, so it is only meaningful once the page is being
    // discarded or hidden.
    addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden' && cls > 0) {
          emit('CLS', Math.round(cls * 1000) / 1000, '1');
        }
      },
      { once: true }
    );
  } catch {
    // Not supported in this browser; skip silently.
  }
}

/**
 * Wraps a user interaction in a span, so a slow action can be traced from the
 * click through to the backend call it triggered.
 */
export function traceInteraction<T>(name: string, fn: () => T | Promise<T>): T | Promise<T> {
  if (!tracer) return fn();

  const span = tracer.startSpan(`ui ${name}`);
  span.setAttribute('url.path', window.location.pathname);

  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(() => span.end());
    }
    span.end();
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.end();
    throw error;
  }
}

/** Reports an unhandled UI error as a span so it shows up in the dashboard. */
export function reportError(error: Error, context?: Record<string, string>): void {
  if (!tracer) return;

  const span = tracer.startSpan('ui error');
  span.recordException(error);
  span.setAttribute('error.type', error.name);
  span.setAttribute('error.message', error.message);
  span.setAttribute('url.path', window.location.pathname);
  for (const [key, value] of Object.entries(context ?? {})) {
    span.setAttribute(key, value);
  }
  span.end();
}
