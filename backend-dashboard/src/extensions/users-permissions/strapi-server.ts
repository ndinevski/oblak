/**
 * Users-Permissions plugin extension
 * Customizes authentication behavior for Oblak Dashboard
 */

import type { Core } from '@strapi/strapi';
import { DEFAULT_MEMBER_GRANTS } from '../../identitet/authz';

/**
 * The user whose email matches OBLAK_ROOT_EMAIL is the root account: full
 * access to everything. It is asserted from the environment (not the database)
 * so it survives a reset and cannot be locked out by an errant grant edit.
 */
function rootEmail(): string | null {
  const value = (process.env.OBLAK_ROOT_EMAIL ?? '').trim().toLowerCase();
  return value || null;
}

/**
 * Promotes the env-root user and demotes anyone else who is marked root,
 * keeping exactly one root that matches the environment. Also backfills default
 * grants for any member that has none yet. Safe to call on every login.
 */
async function reconcileRole(strapi: Core.Strapi | undefined, user: any): Promise<any> {
  if (!strapi || !user) return user;
  const root = rootEmail();
  const email = (user.email ?? '').trim().toLowerCase();
  const shouldBeRoot = root !== null && email === root;
  // `identitetRole`, not `role`: `role` is the reserved users-permissions relation.
  const currentRole = user.identitetRole ?? 'member';
  const desiredRole = shouldBeRoot ? 'root' : currentRole === 'root' ? 'member' : currentRole;

  const patch: Record<string, unknown> = {};
  if (desiredRole !== currentRole) patch.identitetRole = desiredRole;
  if (!shouldBeRoot && (!user.grants || Object.keys(user.grants).length === 0)) {
    patch.grants = DEFAULT_MEMBER_GRANTS;
  }
  if (Object.keys(patch).length === 0) return user;

  const updated = await strapi.db
    .query('plugin::users-permissions.user')
    .update({ where: { id: user.id }, data: patch });
  return { ...user, ...updated };
}

export default (plugin: any) => {
  // Store original controller methods
  const originalAuthController = plugin.controllers.auth;

  // Extend the auth controller
  plugin.controllers.auth = (controllerCtx: { strapi?: Core.Strapi }) => {
    const original = originalAuthController(controllerCtx);

    return {
      ...original,

      /**
       * Custom callback after successful login
       * Adds additional user data to the response
       */
      async callback(ctx: any) {
        // Call original callback
        await original.callback(ctx);

        // If successful, add additional info
        if (ctx.body?.user) {
          let user = ctx.body.user;

          // Assert the env-root and backfill member grants on login.
          user = await reconcileRole(controllerCtx?.strapi, user);

          ctx.body.user = {
            ...user,
            meta: {
              loginTime: new Date().toISOString(),
            },
          };
        }
      },

      /**
       * Custom registration handler
       * Validates additional fields and sets defaults
       */
      async register(ctx: any) {
        const { organization } = ctx.request.body;

        // Set default organization if not provided
        if (!organization) {
          ctx.request.body.organization = 'Personal';
        }

        // Call original register
        await original.register(ctx);

        // Assign role (env-root or member) and default grants at registration.
        if (ctx.body?.user) {
          ctx.body.user = await reconcileRole(controllerCtx?.strapi, ctx.body.user);
          controllerCtx?.strapi?.log?.info?.(`New user registered: ${ctx.body.user.email}`);
        }
      },
    };
  };

  // Extend content types (add custom fields)
  plugin.contentTypes.user.schema.attributes = {
    ...plugin.contentTypes.user.schema.attributes,
    // Organization name
    organization: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      default: 'Personal',
    },
    // Resource quotas
    quotas: {
      type: 'json',
      default: {
        maxFunctions: 10,
        maxVMs: 5,
        maxBuckets: 10,
        maxStorageGB: 50,
      },
    },
    // Last login timestamp
    lastLoginAt: {
      type: 'datetime',
    },
    // Identitet role: 'root' (full access) or 'member' (scoped by grants). The
    // env-root user is reconciled to 'root' on login regardless of this value.
    // Named identitetRole to avoid shadowing the reserved users-permissions `role`.
    identitetRole: {
      type: 'enumeration',
      enum: ['root', 'member'],
      default: 'member',
    },
    // Identitet grants: per-service access level for a member. { queues: 'write', ... }
    grants: {
      type: 'json',
      default: {},
    },
  };

  return plugin;
};
