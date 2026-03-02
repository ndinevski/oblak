/**
 * Activity Log Router
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/activity-logs',
      handler: 'activity-log.find',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'List activity logs for the current user',
        tags: ['Activity'],
      },
    },
    {
      method: 'GET',
      path: '/activity-logs/summary',
      handler: 'activity-log.summary',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Get activity summary for the current user',
        tags: ['Activity'],
      },
    },
    {
      method: 'GET',
      path: '/activity-logs/retention',
      handler: 'activity-log.retention',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Get log retention policy',
        tags: ['Activity'],
      },
    },
    {
      method: 'PUT',
      path: '/activity-logs/retention',
      handler: 'activity-log.updateRetention',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Update log retention policy',
        tags: ['Activity'],
      },
    },
    {
      method: 'GET',
      path: '/activity-logs/:id',
      handler: 'activity-log.findOne',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Get a specific activity log',
        tags: ['Activity'],
      },
    },
  ],
};
