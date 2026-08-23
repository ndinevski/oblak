/**
 * Red routes.
 *
 * Ordering matters: /backups/restore before /backups/:id, and the literal
 * message sub-paths are distinct from the single-segment :queue.
 */

const route = (method: string, path: string, handler: string, description: string) => ({
  method,
  path,
  handler,
  info: { type: 'content-api' as const },
  config: { policies: [], middlewares: [], description, tags: ['Red'] },
});

export default {
  routes: [
    route('GET', '/red/health', 'red.health', 'Red service health'),

    route('GET', '/red/backups', 'red.listBackups', 'List backups'),
    route('POST', '/red/backups/restore', 'red.restoreBackup', 'Restore a backup'),
    route('GET', '/red/backups/:id', 'red.getBackup', 'Get one backup'),
    route('DELETE', '/red/backups/:id', 'red.deleteBackup', 'Delete a backup'),

    route('GET', '/red/queues', 'red.listQueues', 'List queues'),
    route('POST', '/red/queues', 'red.createQueue', 'Create a queue'),
    route('GET', '/red/queues/:queue', 'red.getQueue', 'Get one queue'),
    route('PATCH', '/red/queues/:queue', 'red.updateQueue', 'Update a queue'),
    route('DELETE', '/red/queues/:queue', 'red.deleteQueue', 'Delete a queue'),
    route('GET', '/red/queues/:queue/stats', 'red.stats', 'Queue depth'),
    route('POST', '/red/queues/:queue/purge', 'red.purge', 'Purge a queue'),

    route('POST', '/red/queues/:queue/messages', 'red.sendMessage', 'Send a message'),
    route('POST', '/red/queues/:queue/messages/receive', 'red.receive', 'Receive messages'),
    route('POST', '/red/queues/:queue/messages/delete', 'red.deleteMessage', 'Delete a message'),

    route('GET', '/red/subscriptions', 'red.listSubscriptions', 'List subscriptions'),
    route('POST', '/red/subscriptions', 'red.createSubscription', 'Create a subscription'),
    route('PATCH', '/red/subscriptions/:name', 'red.updateSubscription', 'Update a subscription'),
    route('DELETE', '/red/subscriptions/:name', 'red.deleteSubscription', 'Delete a subscription'),

    route('GET', '/red/queues/:queue/backups', 'red.listQueueBackups', 'Backups for one queue'),
    route('POST', '/red/queues/:queue/backups', 'red.createBackup', 'Back up a queue'),
  ],
};
