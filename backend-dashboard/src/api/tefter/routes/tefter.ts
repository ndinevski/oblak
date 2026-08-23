/**
 * Tefter routes.
 *
 * Ordering matters: literal segments come before parameterised ones, so
 * /tefter/backups/restore is not swallowed by /tefter/backups/:id.
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
    tags: ['Tefter'],
  },
});

export default {
  routes: [
    route('GET', '/tefter/health', 'tefter.health', 'Tefter service health'),
    route('GET', '/tefter/engines', 'tefter.engines', 'Supported engines and versions'),
    route('GET', '/tefter/sizes', 'tefter.sizes', 'Available instance sizes'),

    // Backups. The literal /restore is declared before /:id so it is not
    // matched as a backup id.
    route('GET', '/tefter/backups', 'tefter.listBackups', 'List backups'),
    route('POST', '/tefter/backups/restore', 'tefter.restoreBackup', 'Restore a backup'),
    route('GET', '/tefter/backups/:id', 'tefter.getBackup', 'Get one backup'),
    route('DELETE', '/tefter/backups/:id', 'tefter.deleteBackup', 'Delete a backup'),

    // Instances.
    route('GET', '/tefter/instances', 'tefter.listInstances', 'List database instances'),
    route('POST', '/tefter/instances', 'tefter.createInstance', 'Provision a database'),
    route('GET', '/tefter/instances/:name', 'tefter.getInstance', 'Get one instance'),
    route('DELETE', '/tefter/instances/:name', 'tefter.deleteInstance', 'Delete an instance'),
    route('POST', '/tefter/instances/:name/start', 'tefter.startInstance', 'Start an instance'),
    route('POST', '/tefter/instances/:name/stop', 'tefter.stopInstance', 'Stop an instance'),

    route('GET', '/tefter/instances/:name/backups', 'tefter.listInstanceBackups', 'Backups for one instance'),
    route('POST', '/tefter/instances/:name/backups', 'tefter.createBackup', 'Back up an instance'),

    route('GET', '/tefter/instances/:name/replicas', 'tefter.listReplicas', 'Replicas of an instance'),
    route('POST', '/tefter/instances/:name/replicas', 'tefter.createReplica', 'Create a read replica'),
    route('GET', '/tefter/instances/:name/replication', 'tefter.replicationStatus', 'Replication lag'),
    route('POST', '/tefter/instances/:name/promote', 'tefter.promoteReplica', 'Promote a replica'),
  ],
};
