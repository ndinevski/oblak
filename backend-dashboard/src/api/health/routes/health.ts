export default {
  routes: [
    {
      method: 'GET',
      path: '/health',
      handler: 'health.index',
      info: {
        type: 'content-api',
      },
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
