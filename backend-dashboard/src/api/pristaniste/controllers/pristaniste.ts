/**
 * Pristaniste API.
 *
 * Proxies the Pristaniste container service for the dashboard, adding authentication,
 * Identitet access control, audit records and consistent error shaping. Pristaniste itself
 * has no notion of Oblak users, so ownership, access control and auditing live
 * here.
 *
 * Identitet: gated on the `containers` service. Container ownership uses the
 * `io.oblak.owner` label stamped at create (robust: it travels with the
 * container). Repositories are owned via the ownership registry. Images belong
 * to a repository.
 */

import type { Context } from 'koa';
import { getPristanisteClient, PristanisteError, type PristanisteContainer } from '../services/pristaniste-client';
import { recordAuditFromContext } from '../../../telemetry/audit';
import {
  requireAccess,
  requireOwnership,
  recordOwnership,
  dropOwnership,
  filterOwned,
  isRoot,
} from '../../../identitet/authz';

const SERVICE = 'containers';
const OWNER_LABEL = 'io.oblak.owner';

/**
 * Runs a Pristaniste call, mapping its failures onto the same status codes Pristaniste used.
 *
 * Without this a 404 from Pristaniste would surface as a 500 from Strapi, and the
 * dashboard could not tell "no such container" from "everything is broken".
 */
async function handle<T>(ctx: Context, fn: () => Promise<T>) {
  try {
    const data = await fn();
    return { data };
  } catch (error) {
    if (error instanceof PristanisteError) {
      strapi.log.warn(`Pristaniste request failed (${error.status}): ${error.message}`);
      return ctx.send(
        { error: { status: error.status, name: 'PristanisteError', message: error.message } },
        error.status
      );
    }
    throw error;
  }
}

function ownsContainer(user: any, container: PristanisteContainer): boolean {
  if (isRoot(user)) return true;
  return container.labels?.[OWNER_LABEL] === String(user.id);
}

/**
 * Loads a container and enforces ownership. Returns the container on success;
 * on failure sets the response (403/404) and returns null.
 */
async function loadOwnedContainer(
  ctx: Context,
  user: any,
  id: string,
): Promise<PristanisteContainer | null> {
  let container: PristanisteContainer;
  try {
    container = await getPristanisteClient().getContainer(id);
  } catch (error) {
    if (error instanceof PristanisteError) {
      ctx.send({ error: { status: error.status, name: 'PristanisteError', message: error.message } }, error.status);
      return null;
    }
    throw error;
  }
  if (!ownsContainer(user, container)) {
    // A member cannot tell an unowned container from a missing one.
    ctx.notFound('container not found');
    return null;
  }
  return container;
}

export default {
  // --- Service ---------------------------------------------------------------

  async health(ctx: Context) {
    if (!requireAccess(ctx, SERVICE, 'read')) return;
    return { data: await getPristanisteClient().health() };
  },

  async registry(ctx: Context) {
    if (!requireAccess(ctx, SERVICE, 'read')) return;
    return handle(ctx, () => getPristanisteClient().registryInfo());
  },

  // --- Repositories ----------------------------------------------------------

  async listRepositories(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const all = await getPristanisteClient().listRepositories();
    if (isRoot(user)) return { data: all };
    const owned = await filterOwned(strapi, user, `${SERVICE}:repo`, all.map((r) => r.name));
    return { data: all.filter((r) => owned.has(r.name)) };
  },

  async getRepository(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    if (!(await requireOwnership(strapi, ctx, user, `${SERVICE}:repo`, ctx.params.name))) return;
    return handle(ctx, () => getPristanisteClient().getRepository(ctx.params.name));
  },

  async createRepository(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const body = (ctx.request.body ?? {}) as { name?: string; description?: string };

    if (!body.name) {
      return ctx.badRequest('A repository name is required');
    }

    const result = await handle(ctx, () =>
      getPristanisteClient().createRepository(body.name!, body.description)
    );

    if (result && 'data' in result) {
      await recordOwnership(strapi, `${SERVICE}:repo`, 'repository', body.name!, user.id);
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
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const name = ctx.params.name;
    if (!(await requireOwnership(strapi, ctx, user, `${SERVICE}:repo`, name))) return;

    const result = await handle(ctx, async () => {
      await getPristanisteClient().deleteRepository(name);
      return { name, deleted: true };
    });

    if (result && 'data' in result) {
      await dropOwnership(strapi, `${SERVICE}:repo`, name);
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
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    if (!(await requireOwnership(strapi, ctx, user, `${SERVICE}:repo`, ctx.params.name))) return;
    return handle(ctx, () => getPristanisteClient().listImages(ctx.params.name));
  },

  async deleteImage(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const { name, tag } = ctx.params;
    if (!(await requireOwnership(strapi, ctx, user, `${SERVICE}:repo`, name))) return;

    const result = await handle(ctx, async () => {
      await getPristanisteClient().deleteImage(name, tag);
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
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const all = ctx.query.all !== 'false';
    const list = await getPristanisteClient().listContainers(all);
    if (isRoot(user)) return { data: list };
    return { data: list.filter((c) => ownsContainer(user, c)) };
  },

  async getContainer(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    const container = await loadOwnedContainer(ctx, user, ctx.params.id);
    if (!container) return;
    return { data: container };
  },

  async createContainer(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;

    if (!body.name || !body.image) {
      return ctx.badRequest('name and image are required');
    }

    const quota = await strapi.service('api::quota.quota').checkContainerQuota();
    if (!quota.allowed) return ctx.forbidden(quota.message);

    const result = await handle(ctx, () =>
      getPristanisteClient().createContainer({
        ...(body as any),
        // Stamp the owner so a container can be traced back to whoever
        // launched it, and so ownership survives without a registry lookup.
        labels: { ...((body.labels as Record<string, string>) ?? {}), [OWNER_LABEL]: String(user.id) },
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
    const user = requireAccess(ctx, SERVICE, 'write');
    if (!user) return;
    const id = ctx.params.id;
    if (!(await loadOwnedContainer(ctx, user, id))) return;
    const force = ctx.query.force !== 'false';

    const result = await handle(ctx, async () => {
      await getPristanisteClient().deleteContainer(id, force);
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
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    if (!(await loadOwnedContainer(ctx, user, ctx.params.id))) return;
    const tail = Math.min(Math.max(Number(ctx.query.tail) || 200, 1), 5000);
    return handle(ctx, () => getPristanisteClient().containerLogs(ctx.params.id, tail));
  },

  async containerStats(ctx: Context) {
    const user = requireAccess(ctx, SERVICE, 'read');
    if (!user) return;
    if (!(await loadOwnedContainer(ctx, user, ctx.params.id))) return;
    return handle(ctx, () => getPristanisteClient().containerStats(ctx.params.id));
  },
};

/**
 * Shared implementation for the three lifecycle actions, which differ only in
 * which client method they call and what they audit.
 */
async function actionHandler(ctx: Context, action: 'start' | 'stop' | 'restart') {
  const user = requireAccess(ctx, SERVICE, 'write');
  if (!user) return;

  const id = ctx.params.id;
  if (!(await loadOwnedContainer(ctx, user, id))) return;
  const body = (ctx.request.body ?? {}) as { timeout_seconds?: number };
  const client = getPristanisteClient();

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
