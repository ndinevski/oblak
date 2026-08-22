/**
 * Default alert rules.
 *
 * These recreate the intent of the Prometheus/Alertmanager rules the platform
 * used to carry, expressed against the telemetry store instead.
 *
 * Seeded once, only when no rules exist at all, so they act as a starting
 * point rather than something that reappears after the operator deletes it.
 * None of them carry a notification channel: a freshly installed platform
 * should surface alerts in the dashboard, not start emailing someone.
 */

export interface DefaultAlertRule {
  name: string;
  description: string;
  ruleType: string;
  target?: string;
  comparison: 'gt' | 'lt';
  threshold: number;
  windowMinutes: number;
  forMinutes: number;
  severity: 'warning' | 'critical';
}

export const DEFAULT_ALERT_RULES: DefaultAlertRule[] = [
  // --- Host ----------------------------------------------------------------
  {
    name: 'Host CPU high',
    description: 'Host CPU has been busy for a sustained period.',
    ruleType: 'host.cpu',
    comparison: 'gt',
    threshold: 80,
    windowMinutes: 5,
    forMinutes: 5,
    severity: 'warning',
  },
  {
    name: 'Host memory high',
    description: 'Host memory usage is approaching capacity.',
    ruleType: 'host.memory',
    comparison: 'gt',
    threshold: 85,
    windowMinutes: 5,
    forMinutes: 5,
    severity: 'warning',
  },
  {
    name: 'Disk space low',
    description: 'The fullest filesystem is running out of room.',
    ruleType: 'host.disk',
    comparison: 'gt',
    threshold: 85,
    windowMinutes: 5,
    forMinutes: 5,
    severity: 'warning',
  },
  {
    name: 'Disk space critical',
    description: 'A filesystem is nearly full. Writes will start failing.',
    ruleType: 'host.disk',
    comparison: 'gt',
    threshold: 92,
    windowMinutes: 5,
    forMinutes: 0,
    severity: 'critical',
  },

  // --- Services ------------------------------------------------------------
  {
    name: 'Impuls not reporting',
    description: 'No traces received from Impuls. The service may be down.',
    ruleType: 'service.absent',
    target: 'impuls',
    comparison: 'lt',
    threshold: 1,
    windowMinutes: 10,
    forMinutes: 0,
    severity: 'critical',
  },
  {
    name: 'Spomen not reporting',
    description: 'No traces received from Spomen. The service may be down.',
    ruleType: 'service.absent',
    target: 'spomen',
    comparison: 'lt',
    threshold: 1,
    windowMinutes: 10,
    forMinutes: 0,
    severity: 'critical',
  },
  {
    name: 'Izvor not reporting',
    description: 'No traces received from Izvor. The service may be down.',
    ruleType: 'service.absent',
    target: 'izvor',
    comparison: 'lt',
    threshold: 1,
    windowMinutes: 10,
    forMinutes: 0,
    severity: 'critical',
  },
  {
    name: 'Dashboard backend not reporting',
    description: 'No traces received from the Strapi backend.',
    ruleType: 'service.absent',
    target: 'oblak-backend',
    comparison: 'lt',
    threshold: 1,
    windowMinutes: 10,
    forMinutes: 0,
    severity: 'critical',
  },
  {
    name: 'High error rate',
    description: 'More than one request in twenty is failing across the platform.',
    ruleType: 'service.error_rate',
    comparison: 'gt',
    threshold: 5,
    windowMinutes: 10,
    forMinutes: 5,
    severity: 'warning',
  },
  {
    name: 'High request latency',
    description: 'p95 latency has been above one second for a sustained period.',
    ruleType: 'service.latency_p95',
    comparison: 'gt',
    threshold: 1000,
    windowMinutes: 10,
    forMinutes: 5,
    severity: 'warning',
  },
  {
    name: 'Error log spike',
    description: 'An unusual number of error-level log records.',
    ruleType: 'log.error_count',
    comparison: 'gt',
    threshold: 100,
    windowMinutes: 5,
    forMinutes: 0,
    severity: 'warning',
  },

  // --- Data stores ---------------------------------------------------------
  {
    name: 'Postgres connections high',
    description: 'A database is close to exhausting its connection slots.',
    ruleType: 'postgres.connections',
    comparison: 'gt',
    threshold: 80,
    windowMinutes: 5,
    forMinutes: 5,
    severity: 'warning',
  },
  {
    name: 'Dashboard database not reporting',
    description: 'No container metrics from the dashboard Postgres.',
    ruleType: 'container.absent',
    target: 'oblak-postgres-dev',
    comparison: 'lt',
    threshold: 1,
    windowMinutes: 10,
    forMinutes: 0,
    severity: 'critical',
  },
  {
    name: 'Container memory high',
    description: 'A container is using an unusual amount of memory.',
    ruleType: 'container.memory',
    comparison: 'gt',
    threshold: 4096,
    windowMinutes: 10,
    forMinutes: 10,
    severity: 'warning',
  },
];
