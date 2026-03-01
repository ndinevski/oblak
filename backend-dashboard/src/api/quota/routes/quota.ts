/**
 * Quota Router
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/quota',
      handler: 'quota.getQuota',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Get full quota information including limits, usage, and remaining',
        tags: ['Quota'],
      },
    },
    {
      method: 'GET',
      path: '/quota/usage',
      handler: 'quota.getUsage',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Get current resource usage',
        tags: ['Quota'],
      },
    },
    {
      method: 'GET',
      path: '/quota/limits',
      handler: 'quota.getLimits',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Get quota limits for the current user',
        tags: ['Quota'],
      },
    },
  ],
};
