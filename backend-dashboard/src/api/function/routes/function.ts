/**
 * Function router configuration
 */

export default {
  routes: [
    // Standard CRUD routes
    {
      method: 'GET',
      path: '/functions',
      handler: 'function.find',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/functions/:id',
      handler: 'function.findOne',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/functions',
      handler: 'function.create',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/functions/:id',
      handler: 'function.update',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/functions/:id',
      handler: 'function.delete',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // Custom invoke route
    {
      method: 'POST',
      path: '/functions/:id/invoke',
      handler: 'function.invoke',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // Get function by name
    {
      method: 'GET',
      path: '/functions/name/:name',
      handler: 'function.findByName',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
