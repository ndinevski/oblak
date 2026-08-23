/**
 * Vrata API.
 *
 * Proxies the Vrata gateway's route-management API for the dashboard, adding
 * authentication and audit. Vrata has no notion of Oblak users, so ownership
 * and auditing live here.
 */

import type { Context } from 'koa';
import { getVrataClient, VrataError } from '../services/vrata-client';
import { recordAuditFromContext } from '../../../telemetry/audit';

function getAuthenticatedUser(ctx: Context) {
  const user = ctx.state.user;
  if (!user) {
    return ctx.unauthorized('You must be logged in');
  }
  return user;
}

async function handle<T>(ctx: Context, fn: () => Promise<T>) {
  try {
    const data = await fn();
    return { data };
  } catch (error) {
    if (error instanceof VrataError) {
      strapi.log.warn(`Vrata request failed (${error.status}): ${error.message}`);
      return ctx.send(
        { error: { status: error.status, name: 'VrataError', message: error.message } },
        error.status
      );
    }
    throw error;
  }
}

export default {
  async health(ctx: Context) {
    getAuthenticatedUser(ctx);
    return { data: await getVrataClient().health() };
  },

  async listRoutes(ctx: Context) {
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getVrataClient().listRoutes());
  },

  async getRoute(ctx: Context) {
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getVrataClient().getRoute(ctx.params.name));
  },

  async createRoute(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;

    if (!body.name || !body.upstream) {
      return ctx.badRequest('name and upstream are required');
    }

    const result = await handle(ctx, () => getVrataClient().createRoute(body as any));

    if (result && 'data' in result) {
      recordAuditFromContext(ctx, {
        action: 'gateway.route.create',
        resourceType: 'gateway',
        resourceName: String(body.name),
        details: { kind: String(body.kind ?? 'custom'), upstream: String(body.upstream), owner: user.id },
      });
      ctx.status = 201;
    }
    return result;
  },

  async deleteRoute(ctx: Context) {
    getAuthenticatedUser(ctx);
    const name = ctx.params.name;

    const result = await handle(ctx, async () => {
      await getVrataClient().deleteRoute(name);
      return { name, deleted: true };
    });

    if (result && 'data' in result) {
      recordAuditFromContext(ctx, {
        action: 'gateway.route.delete',
        resourceType: 'gateway',
        resourceName: name,
      });
    }
    return result;
  },
};
