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
    description: 'No telemetry received from Impuls. The service may be down.',
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
    description: 'No telemetry received from Spomen. The service may be down.',
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
    description: 'No telemetry received from Izvor. The service may be down.',
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
    description: 'No telemetry received from the Strapi backend.',
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

  // --- Pristaniste, Tefter, Vrata (added after the originals) ----------------------
  {
    name: 'Pristaniste not reporting',
    description: 'No telemetry received from Pristaniste. The container service may be down.',
    ruleType: 'service.absent',
    target: 'pristaniste',
    comparison: 'lt',
    threshold: 1,
    windowMinutes: 10,
    forMinutes: 0,
    severity: 'critical',
  },
  {
    name: 'Tefter not reporting',
    description: 'No telemetry received from Tefter. The database service may be down.',
    ruleType: 'service.absent',
    target: 'tefter',
    comparison: 'lt',
    threshold: 1,
    windowMinutes: 10,
    forMinutes: 0,
    severity: 'critical',
  },
  {
    name: 'Vrata not reporting',
    description: 'No telemetry received from Vrata. The gateway may be down, which also means workload traffic is going unobserved.',
    ruleType: 'service.absent',
    target: 'vrata',
    comparison: 'lt',
    threshold: 1,
    windowMinutes: 10,
    forMinutes: 0,
    severity: 'critical',
  },
  {
    name: 'Indeks not reporting',
    description: 'No telemetry received from Indeks. The key/value store may be down.',
    ruleType: 'service.absent',
    target: 'indeks',
    comparison: 'lt',
    threshold: 1,
    windowMinutes: 10,
    forMinutes: 0,
    severity: 'critical',
  },
  {
    name: 'Red not reporting',
    description: 'No telemetry received from Red. The message queue may be down, which stalls any triggers that consume from it.',
    ruleType: 'service.absent',
    target: 'red',
    comparison: 'lt',
    threshold: 1,
    windowMinutes: 10,
    forMinutes: 0,
    severity: 'critical',
  },
  {
    name: 'Tefter database down',
    description: 'A managed database is running but not answering its stats probe.',
    ruleType: 'tefter.db_down',
    comparison: 'lt',
    threshold: 1,
    windowMinutes: 5,
    forMinutes: 2,
    severity: 'critical',
  },
  {
    name: 'Tefter replica lag high',
    description: 'A read replica has fallen more than 30s behind its primary.',
    ruleType: 'tefter.replication_lag',
    comparison: 'gt',
    threshold: 30,
    windowMinutes: 5,
    forMinutes: 5,
    severity: 'warning',
  },
  {
    name: 'Vrata upstream errors high',
    description: 'A large share of proxied requests are failing, usually a stopped container or a down VM behind the gateway.',
    ruleType: 'service.error_rate',
    target: 'vrata',
    comparison: 'gt',
    threshold: 10,
    windowMinutes: 10,
    forMinutes: 5,
    severity: 'warning',
  },
];
