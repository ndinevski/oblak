/**
 * Brod API.
 *
 * Proxies the Brod container service for the dashboard, adding authentication,
 * audit records and consistent error shaping. Brod itself has no notion of
 * Oblak users, so ownership and auditing live here.
 */

import type { Context } from 'koa';
import { getBrodClient, BrodError } from '../services/brod-client';
import { recordAuditFromContext } from '../../../telemetry/audit';

function getAuthenticatedUser(ctx: Context) {
  const user = ctx.state.user;
  if (!user) {
    return ctx.unauthorized('You must be logged in');
  }
  return user;
}

/**
 * Runs a Brod call, mapping its failures onto the same status codes Brod used.
 *
 * Without this a 404 from Brod would surface as a 500 from Strapi, and the
 * dashboard could not tell "no such container" from "everything is broken".
 */
async function handle<T>(ctx: Context, fn: () => Promise<T>) {
  try {
    const data = await fn();
    return { data };
  } catch (error) {
    if (error instanceof BrodError) {
      strapi.log.warn(`Brod request failed (${error.status}): ${error.message}`);
      return ctx.send(
        { error: { status: error.status, name: 'BrodError', message: error.message } },
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
    return { data: await getBrodClient().health() };
  },

  async registry(ctx: Context) {
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getBrodClient().registryInfo());
  },

  // --- Repositories ----------------------------------------------------------

  async listRepositories(ctx: Context) {
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getBrodClient().listRepositories());
  },

  async getRepository(ctx: Context) {
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getBrodClient().getRepository(ctx.params.name));
  },

  async createRepository(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    const body = (ctx.request.body ?? {}) as { name?: string; description?: string };

    if (!body.name) {
      return ctx.badRequest('A repository name is required');
    }

    const result = await handle(ctx, () =>
      getBrodClient().createRepository(body.name!, body.description)
    );

    if (result && 'data' in result) {
      recordAuditFromContext(ctx, {
        action: 'container.repository.create',
        resourceType: 'container',
        resourceName: body.name,
        details: { owner: user.id },
      });
      ctx.status = 201;
    }
    return result;
  },

  async deleteRepository(ctx: Context) {
    getAuthenticatedUser(ctx);
    const name = ctx.params.name;

    const result = await handle(ctx, async () => {
      await getBrodClient().deleteRepository(name);
      return { name, deleted: true };
    });

    if (result && 'data' in result) {
      recordAuditFromContext(ctx, {
        action: 'container.repository.delete',
        resourceType: 'container',
        resourceName: name,
      });
    }
    return result;
  },

  // --- Images ----------------------------------------------------------------

  async listImages(ctx: Context) {
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getBrodClient().listImages(ctx.params.name));
  },

  async deleteImage(ctx: Context) {
    getAuthenticatedUser(ctx);
    const { name, tag } = ctx.params;

    const result = await handle(ctx, async () => {
      await getBrodClient().deleteImage(name, tag);
      return { repository: name, tag, deleted: true };
    });

    if (result && 'data' in result) {
      recordAuditFromContext(ctx, {
        action: 'container.image.delete',
        resourceType: 'container',
        resourceName: `${name}:${tag}`,
      });
    }
    return result;
  },

  // --- Containers ------------------------------------------------------------

  async listContainers(ctx: Context) {
    getAuthenticatedUser(ctx);
    const all = ctx.query.all !== 'false';
    return handle(ctx, () => getBrodClient().listContainers(all));
  },

  async getContainer(ctx: Context) {
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getBrodClient().getContainer(ctx.params.id));
  },

  async createContainer(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;

    if (!body.name || !body.image) {
      return ctx.badRequest('name and image are required');
    }

    const result = await handle(ctx, () =>
      getBrodClient().createContainer({
        ...(body as any),
        // Stamp the owner so a container can be traced back to whoever
        // launched it. Brod has no user model of its own.
        labels: { ...((body.labels as Record<string, string>) ?? {}), 'io.oblak.owner': String(user.id) },
      })
    );

    if (result && 'data' in result) {
      recordAuditFromContext(ctx, {
        action: 'container.create',
        resourceType: 'container',
        resourceName: String(body.name),
        details: { image: String(body.image) },
      });
      ctx.status = 201;
    }
    return result;
  },

  async deleteContainer(ctx: Context) {
    getAuthenticatedUser(ctx);
    const id = ctx.params.id;
    const force = ctx.query.force !== 'false';

    const result = await handle(ctx, async () => {
      await getBrodClient().deleteContainer(id, force);
      return { id, deleted: true };
    });

    if (result && 'data' in result) {
      recordAuditFromContext(ctx, {
        action: 'container.delete',
        resourceType: 'container',
        resourceName: id,
      });
    }
    return result;
  },

  async startContainer(ctx: Context) {
    return actionHandler(ctx, 'start');
  },

  async stopContainer(ctx: Context) {
    return actionHandler(ctx, 'stop');
  },

  async restartContainer(ctx: Context) {
    return actionHandler(ctx, 'restart');
  },

  async containerLogs(ctx: Context) {
    getAuthenticatedUser(ctx);
    const tail = Math.min(Math.max(Number(ctx.query.tail) || 200, 1), 5000);
    return handle(ctx, () => getBrodClient().containerLogs(ctx.params.id, tail));
  },

  async containerStats(ctx: Context) {
    getAuthenticatedUser(ctx);
    return handle(ctx, () => getBrodClient().containerStats(ctx.params.id));
  },
};

/**
 * Shared implementation for the three lifecycle actions, which differ only in
 * which client method they call and what they audit.
 */
async function actionHandler(ctx: Context, action: 'start' | 'stop' | 'restart') {
  const user = ctx.state.user;
  if (!user) {
    return ctx.unauthorized('You must be logged in');
  }

  const id = ctx.params.id;
  const body = (ctx.request.body ?? {}) as { timeout_seconds?: number };
  const client = getBrodClient();

  const result = await handle(ctx, () => {
    switch (action) {
      case 'start':
        return client.startContainer(id);
      case 'stop':
        return client.stopContainer(id, body.timeout_seconds);
      case 'restart':
        return client.restartContainer(id, body.timeout_seconds);
    }
  });

  if (result && 'data' in result) {
    recordAuditFromContext(ctx, {
      action: `container.${action}`,
      resourceType: 'container',
      resourceName: id,
    });
  }
  return result;
}
