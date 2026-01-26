/**
 * Activity log router
 */

export default {
  routes: [
    {
      method: 'GET',
      path: '/activity-logs',
      handler: 'activity-log.find',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/activity-logs/:id',
      handler: 'activity-log.findOne',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
