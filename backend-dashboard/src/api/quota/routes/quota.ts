/**
 * Quota Router
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/quota',
      handler: 'quota.getQuota',
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
      config: {
        policies: [],
        middlewares: [],
        description: 'Get quota limits for the current user',
        tags: ['Quota'],
      },
    },
  ],
};
