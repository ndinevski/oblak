/**
 * Alert rule routes.
 *
 * Literal segments are declared before the parameterised ones so /alert-rules/types
 * is not captured by /alert-rules/:id.
 */

const route = (method: string, path: string, handler: string, description: string) => ({
  method,
  path,
  handler,
  info: { type: 'content-api' as const },
  config: {
    policies: [],
    middlewares: [],
    description,
    tags: ['Alerts'],
  },
});

export default {
  routes: [
    route('GET', '/alert-rules/types', 'alert-rule.types', 'Available alert rule types'),
    route('GET', '/alert-rules/history', 'alert-rule.history', 'Alert state change history'),
    route('POST', '/alert-rules/evaluate', 'alert-rule.evaluate', 'Evaluate every rule now'),
    route('POST', '/alert-rules/test', 'alert-rule.test', 'Evaluate an unsaved rule'),

    route('GET', '/alert-rules', 'alert-rule.find', 'List alert rules'),
    route('POST', '/alert-rules', 'alert-rule.create', 'Create an alert rule'),
    route('GET', '/alert-rules/:id', 'alert-rule.findOne', 'Get one alert rule'),
    route('PUT', '/alert-rules/:id', 'alert-rule.update', 'Update an alert rule'),
    route('DELETE', '/alert-rules/:id', 'alert-rule.delete', 'Delete an alert rule'),
    route('POST', '/alert-rules/:id/test', 'alert-rule.test', 'Evaluate one rule now'),
    route('POST', '/alert-rules/:id/mute', 'alert-rule.mute', 'Silence or unsilence a rule'),
  ],
};
