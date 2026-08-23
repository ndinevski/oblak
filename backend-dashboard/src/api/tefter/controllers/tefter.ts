/**
 * Tefter API.
 *
 * Proxies the Tefter managed database service for the dashboard, adding
 * authentication, Identitet access control, audit records and consistent error
 * shaping. Tefter itself has no notion of Oblak users, so ownership, access
 * control and auditing live here.
 *
 * Identitet: gated on the `databases` service. Instances (primaries and replicas) are
 * owned resources; backups are governed by their instance. Engines and sizes
 * are catalogue reads available to anyone with read access.
 */

import type { Context } from 'koa';
import { getTefterClient, TefterError } from '../services/tefter-client';
import { recordAuditFromContext } from '../../../telemetry/audit';
import {
  requireAccess,
  requireOwnership,
  recordOwnership,
  dropOwnership,
  filterOwned,
  isRoot,
} from '../../../identitet/authz';

const SERVICE = 'databases';

/**
 * Runs a Tefter call, mapping its failures onto the same status codes Tefter
 * used.
 *
 * Without this a 404 from Tefter would surface as a 500 from Strapi, and the
 * dashboard could not tell "no such instance" from "everything is broken".
 */
async function handle<T>(ctx: Context, fn: () => Promise<T>) {
  try {
    const data = await fn();
    return { data };
  } catch (error) {
    if (error instanceof TefterError) {
      strapi.log.warn(`Tefter request failed (${error.status}): ${error.message}`);
      return ctx.send(
        { error: { status: error.status, name: 'TefterError', message: error.message } },
        error.status
      );
    }
    throw error;
  }
}

export default {
  // --- Service ---------------------------------------------------------------

  async health(ctx: Context) {
    if (!requireAccess(ctx, SERVICE, 'read')) return;
    return { data: await getTefterClient().health() };
  },

  async engines(ctx: Context) {
    if (!requireAccess(ctx, SERVICE, 'read')) return;
    return handle(ctx, () => getTefterClient().listEngines());
  },

  async sizes(ctx: Context) {
    if (!requireAccess(ctx, SERVICE, 'read')) return;
    return handle(ctx, () => getTefterClient().listSizes());
  },

  // --- Instances -------------------------------------------------------------

  async listInstances(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const all = await getTefterClient().listInstances();
    if (isRoot(user)) return { data: all };
    const owned = await filterOwned(strapi, user, SERVICE, all.map((i) => i.name));
    return { data: all.filter((i) => owned.has(i.name)) };
  },

  async getInstance(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, ctx.params.name))) return;
    return handle(ctx, () => getTefterClient().getInstance(ctx.params.name));
  },

  async createInstance(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;

    if (!body.name || !body.engine) {
      return ctx.badRequest('name and engine are required');
    }

    const quota = await strapi.service('api::quota.quota').checkDatabaseQuota();
    if (!quota.allowed) return ctx.forbidden(quota.message);

    const result = await handle(ctx, () => getTefterClient().createInstance(body as any));

    if (result && 'data' in result) {
      await recordOwnership(strapi, SERVICE, 'instance', String(body.name), user.id);
      recordAuditFromContext(ctx, {
        action: 'database.instance.create',
        resourceType: 'database',
        resourceName: String(body.name),
        // Deliberately no password, generated or supplied: an audit record is
        // long-lived and widely readable, which is the opposite of what a
        // credential needs.
        details: { engine: String(body.engine), size: String(body.size ?? 'small'), owner: user.id },
      });
      ctx.status = 201;
    }
    return result;
  },

  async deleteInstance(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const name = ctx.params.name;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, name))) return;

    const result = await handle(ctx, async () => {
      await getTefterClient().deleteInstance(name);
      return { name, deleted: true };
    });

    if (result && 'data' in result) {
      await dropOwnership(strapi, SERVICE, name);
      recordAuditFromContext(ctx, {
        action: 'database.instance.delete',
        resourceType: 'database',
        resourceName: name,
      });
    }
    return result;
  },

  async startInstance(ctx: Context) {
    return lifecycleHandler(ctx, 'start');
  },

  async stopInstance(ctx: Context) {
    return lifecycleHandler(ctx, 'stop');
  },

  // --- Replicas --------------------------------------------------------------

  async listReplicas(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, ctx.params.name))) return;
    return handle(ctx, () => getTefterClient().listReplicas(ctx.params.name));
  },

  async createReplica(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const source = ctx.params.name;
    // A member can only replicate an instance it owns; the replica it owns too.
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, source))) return;
    const body = (ctx.request.body ?? {}) as { name?: string; size?: string };

    if (!body.name) {
      return ctx.badRequest('A replica name is required');
    }

    const result = await handle(ctx, () =>
      getTefterClient().createReplica(source, { name: body.name!, size: body.size })
    );

    if (result && 'data' in result) {
      await recordOwnership(strapi, SERVICE, 'instance', String(body.name), user.id);
      recordAuditFromContext(ctx, {
        action: 'database.replica.create',
        resourceType: 'database',
        resourceName: body.name,
        details: { source_instance: source },
      });
      ctx.status = 201;
    }
    return result;
  },

  async replicationStatus(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, ctx.params.name))) return;
    return handle(ctx, () => getTefterClient().replicationStatus(ctx.params.name));
  },

  async promoteReplica(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const name = ctx.params.name;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, name))) return;

    const result = await handle(ctx, () => getTefterClient().promoteReplica(name));

    if (result && 'data' in result) {
      // Promotion is one-way and breaks replication, so it is worth recording
      // even though nothing was deleted.
      recordAuditFromContext(ctx, {
        action: 'database.replica.promote',
        resourceType: 'database',
        resourceName: name,
      });
    }
    return result;
  },

  // --- Backups ---------------------------------------------------------------

  async listBackups(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const instance = typeof ctx.query.instance === 'string' ? ctx.query.instance : undefined;
    const all = await getTefterClient().listBackups(instance);
    if (isRoot(user)) return { data: all };
    const owned = await filterOwned(strapi, user, SERVICE, all.map((b) => b.instance));
    return { data: all.filter((b) => owned.has(b.instance)) };
  },

  async listInstanceBackups(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, ctx.params.name))) return;
    return handle(ctx, () => getTefterClient().listBackups(ctx.params.name));
  },

  async createBackup(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const name = ctx.params.name;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, name))) return;
    const body = (ctx.request.body ?? {}) as { description?: string };

    const result = await handle(ctx, () => getTefterClient().createBackup(name, body.description));

    if (result && 'data' in result) {
      recordAuditFromContext(ctx, {
        action: 'database.backup.create',
        resourceType: 'database',
        resourceName: name,
        details: { backup_id: (result.data as any)?.id },
      });
      ctx.status = 201;
    }
    return result;
  },

  async getBackup(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const backup = await handle(ctx, () => getTefterClient().getBackup(ctx.params.id));
    if (backup && 'data' in backup && !isRoot(user)) {
      const inst = (backup.data as any)?.instance;
      const owned = await filterOwned(strapi, user, SERVICE, inst ? [inst] : []);
      if (!inst || !owned.has(inst)) return ctx.notFound('backup not found');
    }
    return backup;
  },

  async deleteBackup(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const id = ctx.params.id;
    if (!isRoot(user)) {
      const found = await getTefterClient().getBackup(id).catch(() => null);
      if (!found) return ctx.notFound('backup not found');
      if (!(await requireOwnership(strapi, ctx, user, SERVICE, (found as any).instance))) return;
    }

    const result = await handle(ctx, async () => {
      await getTefterClient().deleteBackup(id);
      return { id, deleted: true };
    });

    if (result && 'data' in result) {
      recordAuditFromContext(ctx, {
        action: 'database.backup.delete',
        resourceType: 'database',
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
      target_instance?: string;
      confirm?: boolean;
      skip_pre_restore_backup?: boolean;
    };

    if (!body.backup_id) {
      return ctx.badRequest('backup_id is required');
    }

    if (!isRoot(user)) {
      const found = await getTefterClient().getBackup(body.backup_id).catch(() => null);
      if (!found) return ctx.notFound('backup not found');
      if (!(await requireOwnership(strapi, ctx, user, SERVICE, (found as any).instance))) return;
      if (body.target_instance && !(await requireOwnership(strapi, ctx, user, SERVICE, body.target_instance))) {
        return;
      }
    }

    const result = await handle(ctx, () =>
      getTefterClient().restoreBackup({
        backup_id: body.backup_id!,
        target_instance: body.target_instance,
        // Passed through rather than defaulted: Tefter refuses an
        // unconfirmed restore, and that guard is the point.
        confirm: body.confirm === true,
        skip_pre_restore_backup: body.skip_pre_restore_backup,
      })
    );

    if (result && 'data' in result) {
      const restore = result.data as any;
      recordAuditFromContext(ctx, {
        action: 'database.backup.restore',
        resourceType: 'database',
        resourceName: restore?.target_instance ?? body.backup_id,
        details: {
          backup_id: body.backup_id,
          pre_restore_backup_id: restore?.pre_restore_backup_id,
          skipped_pre_restore_backup: body.skip_pre_restore_backup === true,
        },
      });
    }
    return result;
  },
};

/**
 * Shared implementation for the lifecycle actions, which differ only in which
 * client method they call and what they audit.
 */
async function lifecycleHandler(ctx: Context, action: 'start' | 'stop') {
  const user = requireAccess(ctx, SERVICE, 'write');
  if (!user) return;

  const name = ctx.params.name;
  if (!(await requireOwnership(strapi, ctx, user, SERVICE, name))) return;
  const client = getTefterClient();

  const result = await handle(ctx, () =>
    action === 'start' ? client.startInstance(name) : client.stopInstance(name)
  );

  if (result && 'data' in result) {
    recordAuditFromContext(ctx, {
      action: `database.instance.${action}`,
      resourceType: 'database',
      resourceName: name,
    });
  }
  return result;
}
