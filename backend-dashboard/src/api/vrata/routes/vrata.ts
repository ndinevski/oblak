/**
 * Vrata routes.
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
    tags: ['Vrata'],
  },
});

export default {
  routes: [
    route('GET', '/vrata/health', 'vrata.health', 'Vrata gateway health'),
    route('GET', '/vrata/routes', 'vrata.listRoutes', 'List gateway routes'),
    route('POST', '/vrata/routes', 'vrata.createRoute', 'Create a gateway route'),
    route('GET', '/vrata/routes/:name', 'vrata.getRoute', 'Get one route'),
    route('DELETE', '/vrata/routes/:name', 'vrata.deleteRoute', 'Delete a route'),
  ],
};
