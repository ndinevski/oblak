/**
 * Pristaniste routes.
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
    tags: ['Pristaniste'],
  },
});

export default {
  routes: [
    route('GET', '/pristaniste/health', 'pristaniste.health', 'Pristaniste service health'),
    route('GET', '/pristaniste/registry', 'pristaniste.registry', 'Where to push and pull images'),

    // Containers before repositories: /pristaniste/containers must not be captured by
    // the greedy repository-name route.
    route('GET', '/pristaniste/containers', 'pristaniste.listContainers', 'List containers'),
    route('POST', '/pristaniste/containers', 'pristaniste.createContainer', 'Run a container'),
    route('GET', '/pristaniste/containers/:id', 'pristaniste.getContainer', 'Get one container'),
    route('DELETE', '/pristaniste/containers/:id', 'pristaniste.deleteContainer', 'Remove a container'),
    route('POST', '/pristaniste/containers/:id/start', 'pristaniste.startContainer', 'Start a container'),
    route('POST', '/pristaniste/containers/:id/stop', 'pristaniste.stopContainer', 'Stop a container'),
    route('POST', '/pristaniste/containers/:id/restart', 'pristaniste.restartContainer', 'Restart a container'),
    route('GET', '/pristaniste/containers/:id/logs', 'pristaniste.containerLogs', 'Container logs'),
    route('GET', '/pristaniste/containers/:id/stats', 'pristaniste.containerStats', 'Container resource usage'),

    route('GET', '/pristaniste/repositories', 'pristaniste.listRepositories', 'List image repositories'),
    route('POST', '/pristaniste/repositories', 'pristaniste.createRepository', 'Declare a repository'),
    // A repository name can contain slashes, so these use a greedy match and
    // the image sub-paths are declared before the bare repository route.
    route('DELETE', '/pristaniste/repositories/:name/images/:tag', 'pristaniste.deleteImage', 'Delete an image tag'),
    route('GET', '/pristaniste/repositories/:name/images', 'pristaniste.listImages', 'List image tags'),
    route('GET', '/pristaniste/repositories/:name', 'pristaniste.getRepository', 'Get one repository'),
    route('DELETE', '/pristaniste/repositories/:name', 'pristaniste.deleteRepository', 'Delete a repository'),
  ],
};
