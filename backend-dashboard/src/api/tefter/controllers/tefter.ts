/**
 * Tefter API.
 *
 * Proxies the Tefter managed database service for the dashboard, adding
 * authentication, audit records and consistent error shaping. Tefter itself
 * has no notion of Oblak users, so ownership and auditing live here.
 */

import type { Context } from 'koa';
import { getTefterClient, TefterError } from '../services/tefter-client';
import { recordAuditFromContext } from '../../../telemetry/audit';

function getAuthenticatedUser(ctx: Context) {
  const user = ctx.state.user;
  if (!user) {
    return ctx.unauthorized('You must be logged in');
  }
  return user;
}

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
    getAuthenticatedUser(ctx);
    return { data: await getTefterClient().health() };
  },

  async engines(ctx: Context) {
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getTefterClient().listEngines());
  },

  async sizes(ctx: Context) {
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getTefterClient().listSizes());
  },

  // --- Instances -------------------------------------------------------------

  async listInstances(ctx: Context) {
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getTefterClient().listInstances());
  },

  async getInstance(ctx: Context) {
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getTefterClient().getInstance(ctx.params.name));
  },

  async createInstance(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;

    if (!body.name || !body.engine) {
      return ctx.badRequest('name and engine are required');
    }

    const result = await handle(ctx, () => getTefterClient().createInstance(body as any));

    if (result && 'data' in result) {
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
    getAuthenticatedUser(ctx);
    const name = ctx.params.name;

    const result = await handle(ctx, async () => {
      await getTefterClient().deleteInstance(name);
      return { name, deleted: true };
    });

    if (result && 'data' in result) {
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
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getTefterClient().listReplicas(ctx.params.name));
  },

  async createReplica(ctx: Context) {
    getAuthenticatedUser(ctx);
    const source = ctx.params.name;
    const body = (ctx.request.body ?? {}) as { name?: string; size?: string };

    if (!body.name) {
      return ctx.badRequest('A replica name is required');
    }

    const result = await handle(ctx, () =>
      getTefterClient().createReplica(source, { name: body.name!, size: body.size })
    );

    if (result && 'data' in result) {
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
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getTefterClient().replicationStatus(ctx.params.name));
  },

  async promoteReplica(ctx: Context) {
    getAuthenticatedUser(ctx);
    const name = ctx.params.name;

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
    getAuthenticatedUser(ctx);
    const instance = typeof ctx.query.instance === 'string' ? ctx.query.instance : undefined;
    return handle(ctx, () => getTefterClient().listBackups(instance));
  },

  async listInstanceBackups(ctx: Context) {
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getTefterClient().listBackups(ctx.params.name));
  },

  async createBackup(ctx: Context) {
    getAuthenticatedUser(ctx);
    const name = ctx.params.name;
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
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getTefterClient().getBackup(ctx.params.id));
  },

  async deleteBackup(ctx: Context) {
    getAuthenticatedUser(ctx);
    const id = ctx.params.id;

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
    getAuthenticatedUser(ctx);
    const body = (ctx.request.body ?? {}) as {
      backup_id?: string;
      target_instance?: string;
      confirm?: boolean;
      skip_pre_restore_backup?: boolean;
    };

    if (!body.backup_id) {
      return ctx.badRequest('backup_id is required');
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
  const user = ctx.state.user;
  if (!user) {
    return ctx.unauthorized('You must be logged in');
  }

  const name = ctx.params.name;
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
