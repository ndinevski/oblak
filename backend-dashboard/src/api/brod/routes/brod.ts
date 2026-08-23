/**
 * Brod routes.
 *
 * Ordering matters: literal segments come before the wildcards, and a
 * repository name may itself contain slashes, so its route uses a greedy
 * parameter and is registered last.
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
    tags: ['Brod'],
  },
});

export default {
  routes: [
    route('GET', '/brod/health', 'brod.health', 'Brod service health'),
    route('GET', '/brod/registry', 'brod.registry', 'Where to push and pull images'),

    // Containers before repositories: /brod/containers must not be captured by
    // the greedy repository-name route.
    route('GET', '/brod/containers', 'brod.listContainers', 'List containers'),
    route('POST', '/brod/containers', 'brod.createContainer', 'Run a container'),
    route('GET', '/brod/containers/:id', 'brod.getContainer', 'Get one container'),
    route('DELETE', '/brod/containers/:id', 'brod.deleteContainer', 'Remove a container'),
    route('POST', '/brod/containers/:id/start', 'brod.startContainer', 'Start a container'),
    route('POST', '/brod/containers/:id/stop', 'brod.stopContainer', 'Stop a container'),
    route('POST', '/brod/containers/:id/restart', 'brod.restartContainer', 'Restart a container'),
    route('GET', '/brod/containers/:id/logs', 'brod.containerLogs', 'Container logs'),
    route('GET', '/brod/containers/:id/stats', 'brod.containerStats', 'Container resource usage'),

    route('GET', '/brod/repositories', 'brod.listRepositories', 'List image repositories'),
    route('POST', '/brod/repositories', 'brod.createRepository', 'Declare a repository'),
    // A repository name can contain slashes, so these use a greedy match and
    // the image sub-paths are declared before the bare repository route.
    route('DELETE', '/brod/repositories/:name/images/:tag', 'brod.deleteImage', 'Delete an image tag'),
    route('GET', '/brod/repositories/:name/images', 'brod.listImages', 'List image tags'),
    route('GET', '/brod/repositories/:name', 'brod.getRepository', 'Get one repository'),
    route('DELETE', '/brod/repositories/:name', 'brod.deleteRepository', 'Delete a repository'),
  ],
};
