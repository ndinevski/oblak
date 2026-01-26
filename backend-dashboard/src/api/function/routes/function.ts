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
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/functions/:id',
      handler: 'function.findOne',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/functions',
      handler: 'function.create',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/functions/:id',
      handler: 'function.update',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/functions/:id',
      handler: 'function.delete',
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
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
