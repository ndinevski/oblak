/**
 * Indeks routes.
 *
 * Ordering matters: /backups/restore before /backups/:id, and the literal
 * item sub-paths before nothing ambiguous (table is a single segment).
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
    tags: ['Indeks'],
  },
});

export default {
  routes: [
    route('GET', '/indeks/health', 'indeks.health', 'Indeks service health'),

    // Backups (literal /restore before /:id).
    route('GET', '/indeks/backups', 'indeks.listBackups', 'List backups'),
    route('POST', '/indeks/backups/restore', 'indeks.restoreBackup', 'Restore a backup'),
    route('GET', '/indeks/backups/:id', 'indeks.getBackup', 'Get one backup'),
    route('DELETE', '/indeks/backups/:id', 'indeks.deleteBackup', 'Delete a backup'),

    // Tables.
    route('GET', '/indeks/tables', 'indeks.listTables', 'List tables'),
    route('POST', '/indeks/tables', 'indeks.createTable', 'Create a table'),
    route('GET', '/indeks/tables/:table', 'indeks.getTable', 'Get one table'),
    route('DELETE', '/indeks/tables/:table', 'indeks.deleteTable', 'Delete a table'),

    // Items.
    route('PUT', '/indeks/tables/:table/items', 'indeks.putItem', 'Put an item'),
    route('POST', '/indeks/tables/:table/get', 'indeks.getItem', 'Get an item by key'),
    route('POST', '/indeks/tables/:table/delete', 'indeks.deleteItem', 'Delete an item by key'),
    route('POST', '/indeks/tables/:table/query', 'indeks.query', 'Query a partition'),
    route('GET', '/indeks/tables/:table/scan', 'indeks.scan', 'Scan a table'),

    // Per-table backups.
    route('GET', '/indeks/tables/:table/backups', 'indeks.listTableBackups', 'Backups for one table'),
    route('POST', '/indeks/tables/:table/backups', 'indeks.createBackup', 'Back up a table'),
  ],
};
