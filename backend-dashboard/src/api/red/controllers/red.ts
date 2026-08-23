/**
 * Red API.
 *
 * Proxies the Red message queue for the dashboard, adding authentication, Identitet
 * access control and audit. Message send/receive/delete are high-volume and not
 * audited individually; queue and backup operations are.
 *
 * Identitet: gated on the `queues` service. Queues and subscriptions are owned
 * resources (owner-isolation for members, full access for root); a member sees
 * and touches only what it created. Backups are governed by their queue.
 */

import type { Context } from 'koa';
import { getRedClient, RedError } from '../services/red-client';
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

const SERVICE = 'queues';

async function handle<T>(ctx: Context, fn: () => Promise<T>) {
  try {
    const data = await fn();
    return { data };
  } catch (error) {
    if (error instanceof RedError) {
      strapi.log.warn(`Red request failed (${error.status}): ${error.message}`);
      return ctx.send({ error: { status: error.status, name: 'RedError', message: error.message } }, error.status);
    }
    throw error;
  }
}

export default {
  async health(ctx: Context) {
    if (!requireAccess(ctx, SERVICE, 'read')) return;
    return { data: await getRedClient().health() };
  },

  // --- Queues ---------------------------------------------------------------

  async listQueues(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const all = await getRedClient().listQueues();
    if (isRoot(user)) return { data: all };
    const owned = await filterOwned(strapi, user, SERVICE, all.map((q) => q.name));
    return { data: all.filter((q) => owned.has(q.name)) };
  },

  async getQueue(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, ctx.params.queue))) return;
    return handle(ctx, () => getRedClient().getQueue(ctx.params.queue));
  },

  async createQueue(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    if (!body.name) return ctx.badRequest('name is required');
    const quota = await strapi.service('api::quota.quota').checkQueueQuota();
    if (!quota.allowed) return ctx.forbidden(quota.message);
    const result = await handle(ctx, () => getRedClient().createQueue(body));
    if (result && 'data' in result) {
      await recordOwnership(strapi, SERVICE, 'queue', String(body.name), user.id);
      recordAuditFromContext(ctx, {
        action: 'queue.create',
        resourceType: 'queue',
        resourceName: String(body.name),
        details: { dead_letter_queue: body.dead_letter_queue ?? null, owner: user.id },
      });
      ctx.status = 201;
    }
    return result;
  },

  async deleteQueue(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const name = ctx.params.queue;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, name))) return;
    const result = await handle(ctx, async () => {
      await getRedClient().deleteQueue(name);
      return { name, deleted: true };
    });
    if (result && 'data' in result) {
      await dropOwnership(strapi, SERVICE, name);
      recordAuditFromContext(ctx, { action: 'queue.delete', resourceType: 'queue', resourceName: name });
    }
    return result;
  },

  async updateQueue(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const name = ctx.params.queue;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, name))) return;
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const result = await handle(ctx, () => getRedClient().updateQueue(name, body));
    if (result && 'data' in result) {
      recordAuditFromContext(ctx, { action: 'queue.update', resourceType: 'queue', resourceName: name, details: body });
    }
    return result;
  },

  async stats(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, ctx.params.queue))) return;
    return handle(ctx, () => getRedClient().stats(ctx.params.queue));
  },

  async purge(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const name = ctx.params.queue;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, name))) return;
    const result = await handle(ctx, () => getRedClient().purge(name));
    if (result && 'data' in result) {
      recordAuditFromContext(ctx, { action: 'queue.purge', resourceType: 'queue', resourceName: name });
    }
    return result;
  },

  // --- Messages -------------------------------------------------------------

  async sendMessage(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const queue = ctx.params.queue;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, queue))) return;
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    if (!body.body) return ctx.badRequest('body is required');
    return handle(ctx, () => getRedClient().sendMessage(queue, body));
  },

  async receive(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const queue = ctx.params.queue;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, queue))) return;
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    return handle(ctx, () => getRedClient().receive(queue, body));
  },

  async deleteMessage(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const queue = ctx.params.queue;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, queue))) return;
    const body = (ctx.request.body ?? {}) as { receipt_handle?: string };
    if (!body.receipt_handle) return ctx.badRequest('receipt_handle is required');
    return handle(ctx, async () => {
      await getRedClient().deleteMessage(queue, body.receipt_handle!);
      return { deleted: true };
    });
  },

  // --- Subscriptions (Impuls triggers) --------------------------------------

  async listSubscriptions(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const all = await getRedClient().listSubscriptions();
    if (isRoot(user)) return { data: all };
    // A subscription is visible if the member owns the subscription itself or
    // the queue it reads from.
    const ownedSubs = await filterOwned(strapi, user, SERVICE, all.map((s) => s.name));
    const ownedQueues = await filterOwned(strapi, user, SERVICE, all.map((s) => s.queue));
    return {
      data: all.filter((s) => ownedSubs.has(s.name) || ownedQueues.has(s.queue)),
    };
  },

  async createSubscription(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    if (!body.name || !body.queue || !body.function) {
      return ctx.badRequest('name, queue and function are required');
    }
    // A member can only wire a trigger onto a queue it owns.
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, String(body.queue)))) return;
    const result = await handle(ctx, () => getRedClient().createSubscription(body));
    if (result && 'data' in result) {
      await recordOwnership(strapi, SERVICE, 'subscription', String(body.name), user.id);
      recordAuditFromContext(ctx, {
        action: 'queue.subscription.create',
        resourceType: 'queue',
        resourceName: String(body.name),
        details: { queue: String(body.queue), function: String(body.function), owner: user.id },
      });
      ctx.status = 201;
    }
    return result;
  },

  async updateSubscription(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const name = ctx.params.name;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, name))) return;
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const result = await handle(ctx, () => getRedClient().updateSubscription(name, body));
    if (result && 'data' in result) {
      recordAuditFromContext(ctx, { action: 'queue.subscription.update', resourceType: 'queue', resourceName: name, details: body });
    }
    return result;
  },

  async deleteSubscription(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const name = ctx.params.name;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, name))) return;
    const result = await handle(ctx, async () => {
      await getRedClient().deleteSubscription(name);
      return { name, deleted: true };
    });
    if (result && 'data' in result) {
      await dropOwnership(strapi, SERVICE, name);
      recordAuditFromContext(ctx, { action: 'queue.subscription.delete', resourceType: 'queue', resourceName: name });
    }
    return result;
  },

  // --- Backups --------------------------------------------------------------

  async listBackups(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const queue = typeof ctx.query.queue === 'string' ? ctx.query.queue : undefined;
    const all = await getRedClient().listBackups(queue);
    if (isRoot(user)) return { data: all };
    const owned = await filterOwned(strapi, user, SERVICE, all.map((b) => b.queue));
    return { data: all.filter((b) => owned.has(b.queue)) };
  },

  async listQueueBackups(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, ctx.params.queue))) return;
    return handle(ctx, () => getRedClient().listBackups(ctx.params.queue));
  },

  async createBackup(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const queue = ctx.params.queue;
    if (!(await requireOwnership(strapi, ctx, user, SERVICE, queue))) return;
    const result = await handle(ctx, () => getRedClient().createBackup(queue));
    if (result && 'data' in result) {
      recordAuditFromContext(ctx, {
        action: 'queue.backup.create',
        resourceType: 'queue',
        resourceName: queue,
        details: { backup_id: (result.data as { id?: string })?.id },
      });
      ctx.status = 201;
    }
    return result;
  },

  async getBackup(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const id = ctx.params.id;
    return handle(ctx, async () => {
      const all = await getRedClient().listBackups();
      const found = all.find((b) => b.id === id);
      if (!found) throw new RedError(`not found: backup ${id}`, 404);
      if (!isRoot(user)) {
        const owned = await filterOwned(strapi, user, SERVICE, [found.queue]);
        if (!owned.has(found.queue)) throw new RedError('not found: backup ' + id, 404);
      }
      return found;
    });
  },

  async deleteBackup(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const id = ctx.params.id;
    // Resolve the backup to its queue so a member can only delete backups of a
    // queue it owns.
    if (!isRoot(user)) {
      const all = await getRedClient().listBackups();
      const found = all.find((b) => b.id === id);
      if (!found) return ctx.notFound('backup not found');
      if (!(await requireOwnership(strapi, ctx, user, SERVICE, found.queue))) return;
    }
    const result = await handle(ctx, async () => {
      await getRedClient().deleteBackup(id);
      return { backup_id: id, deleted: true };
    });
    if (result && 'data' in result) {
      recordAuditFromContext(ctx, { action: 'queue.backup.delete', resourceType: 'queue', resourceName: id });
    }
    return result;
  },

  async restoreBackup(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const body = (ctx.request.body ?? {}) as { backup_id?: string; target_queue?: string; confirm?: boolean };
    if (!body.backup_id) return ctx.badRequest('backup_id is required');
    // A member may restore only its own backup, and only into a queue it owns
    // (or a new queue, which it will then own).
    if (!isRoot(user)) {
      const all = await getRedClient().listBackups();
      const found = all.find((b) => b.id === body.backup_id);
      if (!found) return ctx.notFound('backup not found');
      if (!(await requireOwnership(strapi, ctx, user, SERVICE, found.queue))) return;
      if (body.target_queue) {
        const owner = await ownerOf(strapi, SERVICE, body.target_queue);
        if (owner !== null && owner !== user.id) {
          return ctx.forbidden('You do not have access to the target queue');
        }
      }
    }
    const result = await handle(ctx, () =>
      getRedClient().restoreBackup({
        backup_id: body.backup_id!,
        target_queue: body.target_queue,
        confirm: body.confirm === true,
      })
    );
    if (result && 'data' in result) {
      const restoredInto = body.target_queue || (result.data as { queue?: string })?.queue;
      if (restoredInto) {
        await recordOwnership(strapi, SERVICE, 'queue', restoredInto, user.id);
      }
      recordAuditFromContext(ctx, {
        action: 'queue.backup.restore',
        resourceType: 'queue',
        resourceName: body.target_queue || body.backup_id,
        details: { backup_id: body.backup_id },
      });
    }
    return result;
  },
};
