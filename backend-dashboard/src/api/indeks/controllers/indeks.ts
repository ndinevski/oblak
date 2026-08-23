/**
 * Indeks API.
 *
 * Proxies the Indeks key/value store for the dashboard, adding authentication,
 * Identitet access control and audit. Read paths (list/get/query/scan) are not
 * audited; writes are.
 *
 * Identitet: gated on the `keyvalue` service. Tables are owned resources; items and
 * backups are governed by their table.
 */

import type { Context } from 'koa';
import { getIndeksClient, IndeksError } from '../services/indeks-client';
import { recordAuditFromContext } from '../../../telemetry/audit';
import {
  requireAccess,
  requireOwnership,
  recordOwnership,
  dropOwnership,
  filterOwned,
  ownerOf,
  isRoot,
} from '../../../identitet/authz';

const SERVICE = 'keyvalue';

async function handle<T>(ctx: Context, fn: () => Promise<T>) {
  try {
    const data = await fn();
    return { data };
  } catch (error) {
    if (error instanceof IndeksError) {
      strapi.log.warn(`Indeks request failed (${error.status}): ${error.message}`);
      return ctx.send(
        { error: { status: error.status, name: 'IndeksError', message: error.message } },
        error.status
      );
    }
    throw error;
  }
}

export default {
  async health(ctx: Context) {
    if (!requireAccess(ctx, SERVICE, 'read')) return;
    return { data: await getIndeksClient().health() };
  },

  // --- Tables ---------------------------------------------------------------

  async listTables(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const all = await getIndeksClient().listTables();
    if (isRoot(user)) return { data: all };
    const owned = await filterOwned(strapi, user, SERVICE, all.map((t) => t.name));
    return { data: all.filter((t) => owned.has(t.name)) };
  },

  async getTable(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, ctx.params.table))) return;
    return handle(ctx, () => getIndeksClient().getTable(ctx.params.table));
  },

  async createTable(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    if (!body.name || !body.partition_key) {
      return ctx.badRequest('name and partition_key are required');
    }
    const quota = await strapi
      .service('api::quota.quota')
      .checkKeyValueTableQuota();
    if (!quota.allowed) return ctx.forbidden(quota.message);
    const result = await handle(ctx, () => getIndeksClient().createTable(body));
    if (result && 'data' in result) {
      await recordOwnership(strapi, SERVICE, 'table', String(body.name), user.id);
      recordAuditFromContext(ctx, {
        action: 'keyvalue.table.create',
        resourceType: 'keyvalue',
        resourceName: String(body.name),
        details: { partition_key: String(body.partition_key), owner: user.id },
      });
      ctx.status = 201;
    }
    return result;
  },

  async deleteTable(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const name = ctx.params.table;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, name))) return;
    const result = await handle(ctx, async () => {
      await getIndeksClient().deleteTable(name);
      return { name, deleted: true };
    });
    if (result && 'data' in result) {
      await dropOwnership(strapi, SERVICE, name);
      recordAuditFromContext(ctx, {
        action: 'keyvalue.table.delete',
        resourceType: 'keyvalue',
        resourceName: name,
      });
    }
    return result;
  },

  // --- Items ----------------------------------------------------------------

  async putItem(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const table = ctx.params.table;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, table))) return;
    const body = (ctx.request.body ?? {}) as { item?: Record<string, unknown> };
    if (!body.item) {
      return ctx.badRequest('item is required');
    }
    // Items are high-volume; not audited individually (the table is).
    return handle(ctx, () => getIndeksClient().putItem(table, body.item!));
  },

  async getItem(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const table = ctx.params.table;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, table))) return;
    const body = (ctx.request.body ?? {}) as { partition_value?: unknown; sort_value?: unknown };
    return handle(ctx, () => getIndeksClient().getItem(table, body.partition_value, body.sort_value));
  },

  async deleteItem(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const table = ctx.params.table;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, table))) return;
    const body = (ctx.request.body ?? {}) as { partition_value?: unknown; sort_value?: unknown };
    return handle(ctx, async () => {
      await getIndeksClient().deleteItem(table, body.partition_value, body.sort_value);
      return { deleted: true };
    });
  },

  async query(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const table = ctx.params.table;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, table))) return;
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    return handle(ctx, () => getIndeksClient().query(table, body));
  },

  async scan(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const table = ctx.params.table;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, table))) return;
    const limit = ctx.query.limit ? Number(ctx.query.limit) : undefined;
    return handle(ctx, () => getIndeksClient().scan(table, limit));
  },

  // --- Backups --------------------------------------------------------------

  async listBackups(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const table = typeof ctx.query.table === 'string' ? ctx.query.table : undefined;
    const all = await getIndeksClient().listBackups(table);
    if (isRoot(user)) return { data: all };
    const owned = await filterOwned(strapi, user, SERVICE, all.map((b) => b.table));
    return { data: all.filter((b) => owned.has(b.table)) };
  },

  async listTableBackups(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, ctx.params.table))) return;
    return handle(ctx, () => getIndeksClient().listBackups(ctx.params.table));
  },

  async getBackup(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const id = ctx.params.id;
    return handle(ctx, async () => {
      const all = await getIndeksClient().listBackups();
      const found = all.find((b) => b.id === id);
      if (!found) throw new IndeksError(`not found: backup ${id}`, 404);
      if (!isRoot(user)) {
        const owned = await filterOwned(strapi, user, SERVICE, [found.table]);
        if (!owned.has(found.table)) throw new IndeksError(`not found: backup ${id}`, 404);
      }
      return found;
    });
  },

  async createBackup(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const table = ctx.params.table;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, table))) return;
    const result = await handle(ctx, () => getIndeksClient().createBackup(table));
    if (result && 'data' in result) {
      recordAuditFromContext(ctx, {
        action: 'keyvalue.backup.create',
        resourceType: 'keyvalue',
        resourceName: table,
        details: { backup_id: (result.data as { id?: string })?.id },
      });
      ctx.status = 201;
    }
    return result;
  },

  async deleteBackup(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const id = ctx.params.id;
    if (!isRoot(user)) {
      const all = await getIndeksClient().listBackups();
      const found = all.find((b) => b.id === id);
      if (!found) return ctx.notFound('backup not found');
      if (!(await requireOwnership(strapi, ctx, user, SERVICE, found.table))) return;
    }
    const result = await handle(ctx, async () => {
      await getIndeksClient().deleteBackup(id);
      return { backup_id: id, deleted: true };
    });
    if (result && 'data' in result) {
      recordAuditFromContext(ctx, {
        action: 'keyvalue.backup.delete',
        resourceType: 'keyvalue',
        resourceName: id,
      });
    }
    return result;
  },

  async restoreBackup(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const body = (ctx.request.body ?? {}) as {
      backup_id?: string;
      target_table?: string;
      confirm?: boolean;
    };
    if (!body.backup_id) {
      return ctx.badRequest('backup_id is required');
    }
    if (!isRoot(user)) {
      const all = await getIndeksClient().listBackups();
      const found = all.find((b) => b.id === body.backup_id);
      if (!found) return ctx.notFound('backup not found');
      if (!(await requireOwnership(strapi, ctx, user, SERVICE, found.table))) return;
      if (body.target_table) {
        const owner = await ownerOf(strapi, SERVICE, body.target_table);
        if (owner !== null && owner !== user.id) {
          return ctx.forbidden('You do not have access to the target table');
        }
      }
    }
    const result = await handle(ctx, () =>
      getIndeksClient().restoreBackup({
        backup_id: body.backup_id!,
        target_table: body.target_table,
        confirm: body.confirm === true,
      })
    );
    if (result && 'data' in result) {
      const restoredInto = body.target_table || (result.data as { table?: string })?.table;
      if (restoredInto) {
        await recordOwnership(strapi, SERVICE, 'table', restoredInto, user.id);
      }
      recordAuditFromContext(ctx, {
        action: 'keyvalue.backup.restore',
        resourceType: 'keyvalue',
        resourceName: body.target_table || body.backup_id,
        details: { backup_id: body.backup_id },
      });
    }
    return result;
  },
};
