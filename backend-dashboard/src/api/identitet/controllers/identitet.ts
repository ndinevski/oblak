/**
 * Identitet admin API.
 *
 * Root-only management of users and their access. Members can read their own
 * effective access via `me` so the dashboard can hide what they cannot use.
 */

import type { Context } from 'koa';
import {
  SERVICES,
  DEFAULT_MEMBER_GRANTS,
  isRoot,
  type AccessLevel,
} from '../../../identitet/authz';
import { recordAuditFromContext } from '../../../telemetry/audit';
import { generateKey } from '../../../identitet/credentials';

const USER = 'plugin::users-permissions.user' as const;
const CREDENTIAL = 'api::credential.credential' as const;
const LEVELS: AccessLevel[] = ['none', 'read', 'write'];

/** Shape of an API key returned to the UI. Never includes the hash or secret. */
function publicKey(k: any) {
  return {
    id: k.id,
    name: k.name,
    keyId: k.keyId,
    revoked: Boolean(k.revoked),
    lastUsedAt: k.lastUsedAt ?? null,
    expiresAt: k.expiresAt ?? null,
    createdAt: k.createdAt ?? null,
    owner: k.owner ? { id: k.owner.id, email: k.owner.email } : null,
  };
}

/** Shape of a user returned to the admin UI. Never leaks credentials. */
function publicUser(u: any) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    organization: u.organization ?? null,
    identitetRole: u.identitetRole ?? 'member',
    grants: (u.grants ?? {}) as Record<string, AccessLevel>,
    blocked: Boolean(u.blocked),
    confirmed: Boolean(u.confirmed),
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt ?? null,
  };
}

function requireRoot(ctx: Context): any | null {
  const user = ctx.state.user;
  if (!user) {
    ctx.unauthorized('You must be logged in');
    return null;
  }
  if (!isRoot(user)) {
    ctx.forbidden('Only the root account can manage access');
    return null;
  }
  return user;
}

/** Validates and normalises a grants object, dropping unknown keys. */
function sanitizeGrants(input: unknown): Record<string, AccessLevel> {
  const out: Record<string, AccessLevel> = {};
  if (!input || typeof input !== 'object') return out;
  const known = new Set(SERVICES.map((s) => s.key));
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!known.has(key)) continue;
    if (value === 'none' || value === 'read' || value === 'write') {
      out[key] = value;
    }
  }
  return out;
}

export default {
  /**
   * The current user's effective access plus the service catalogue, so the
   * frontend can build its nav and forms from the backend's own definition.
   */
  async me(ctx: Context) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in');
    const root = isRoot(user);
    ctx.body = {
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        identitetRole: root ? 'root' : 'member',
        isRoot: root,
        // Root's effective grants are 'write' everywhere; a member's are stored.
        grants: root
          ? Object.fromEntries(SERVICES.map((s) => [s.key, 'write']))
          : ((user.grants ?? {}) as Record<string, AccessLevel>),
        services: SERVICES,
      },
    };
  },

  /** The service catalogue and valid levels (for the grants editor). */
  async services(ctx: Context) {
    if (!requireRoot(ctx)) return;
    ctx.body = { data: { services: SERVICES, levels: LEVELS } };
  },

  /** List all users (root only). */
  async listUsers(ctx: Context) {
    if (!requireRoot(ctx)) return;
    const users = await strapi.db.query(USER).findMany({
      orderBy: { id: 'asc' },
    });
    ctx.body = { data: users.map(publicUser) };
  },

  /** Update a member's grants and/or blocked state (root only). */
  async updateUser(ctx: Context) {
    const root = requireRoot(ctx);
    if (!root) return;

    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) return ctx.badRequest('invalid user id');

    const target = await strapi.db.query(USER).findOne({ where: { id } });
    if (!target) return ctx.notFound('user not found');

    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    // The root account's own role and grants are asserted from the environment;
    // editing them here would be undone on next login and is confusing, so it
    // is refused outright.
    if (target.identitetRole === 'root') {
      if ('grants' in body || 'identitetRole' in body) {
        return ctx.badRequest(
          'The root account is defined by OBLAK_ROOT_EMAIL and cannot be edited here',
        );
      }
    }

    if ('grants' in body) {
      patch.grants = sanitizeGrants(body.grants);
    }
    if ('blocked' in body) {
      patch.blocked = Boolean(body.blocked);
    }

    if (Object.keys(patch).length === 0) {
      return ctx.badRequest('nothing to update');
    }

    const updated = await strapi.db
      .query(USER)
      .update({ where: { id }, data: patch });

    recordAuditFromContext(ctx, {
      action: 'identitet.user.update',
      resourceType: 'user',
      resourceName: target.email,
      details: { changed: Object.keys(patch) },
    });

    ctx.body = { data: publicUser(updated) };
  },

  /**
   * Create a member with an initial set of grants (root only). Password is
   * required and never returned. New users are members; the root account is
   * created by registering with the OBLAK_ROOT_EMAIL address, not here.
   */
  async createUser(ctx: Context) {
    const root = requireRoot(ctx);
    if (!root) return;

    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const username = String(body.username ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    if (!username || !email || !password) {
      return ctx.badRequest('username, email and password are required');
    }
    if (password.length < 6) {
      return ctx.badRequest('password must be at least 6 characters');
    }

    const existing = await strapi.db
      .query(USER)
      .findOne({ where: { email } });
    if (existing) return ctx.badRequest('a user with this email already exists');

    const authenticatedRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'authenticated' } });

    const grants =
      'grants' in body ? sanitizeGrants(body.grants) : { ...DEFAULT_MEMBER_GRANTS };

    // Hash the password through the users-permissions service so it matches the
    // login path exactly.
    const created = await strapi
      .plugin('users-permissions')
      .service('user')
      .add({
        username,
        email,
        password,
        confirmed: true,
        blocked: false,
        provider: 'local',
        role: authenticatedRole?.id,
        identitetRole: 'member',
        grants,
        organization: String(body.organization ?? 'Personal'),
      });

    recordAuditFromContext(ctx, {
      action: 'identitet.user.create',
      resourceType: 'user',
      resourceName: email,
      details: { grants: Object.keys(grants) },
    });

    ctx.status = 201;
    ctx.body = { data: publicUser(created) };
  },

  /** Delete a member (root only; the root account cannot be deleted here). */
  async deleteUser(ctx: Context) {
    const root = requireRoot(ctx);
    if (!root) return;

    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) return ctx.badRequest('invalid user id');
    if (id === root.id) return ctx.badRequest('you cannot delete your own account');

    const target = await strapi.db.query(USER).findOne({ where: { id } });
    if (!target) return ctx.notFound('user not found');
    if (target.identitetRole === 'root') {
      return ctx.badRequest('the root account cannot be deleted here');
    }

    await strapi.db.query(USER).delete({ where: { id } });

    recordAuditFromContext(ctx, {
      action: 'identitet.user.delete',
      resourceType: 'user',
      resourceName: target.email,
    });

    ctx.body = { data: { id, deleted: true } };
  },

  // ===========================================================================
  // API keys (self-service)
  //
  // Any authenticated user manages their own keys; root additionally sees all
  // keys with `?all=true`. A key authenticates as its owner and inherits the
  // owner's access, so it is never more powerful than the person who made it.
  // ===========================================================================

  async listKeys(ctx: Context) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in');

    const wantAll = ctx.query.all === 'true' && isRoot(user);
    const where = wantAll ? {} : { owner: user.id };
    const keys = await strapi.db
      .query(CREDENTIAL)
      .findMany({ where, orderBy: { id: 'desc' }, populate: { owner: true } });
    ctx.body = { data: keys.map(publicKey) };
  },

  async createKey(ctx: Context) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in');

    const body = (ctx.request.body ?? {}) as { name?: string; expiresInDays?: number };
    const name = String(body.name ?? '').trim();
    if (!name) return ctx.badRequest('name is required');

    let expiresAt: Date | null = null;
    if (body.expiresInDays != null) {
      const days = Number(body.expiresInDays);
      if (!Number.isFinite(days) || days <= 0) {
        return ctx.badRequest('expiresInDays must be a positive number');
      }
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const key = generateKey();
    const created = await strapi.db.query(CREDENTIAL).create({
      data: {
        name,
        keyId: key.keyId,
        keyHash: key.keyHash,
        owner: user.id,
        revoked: false,
        expiresAt,
      },
    });

    recordAuditFromContext(ctx, {
      action: 'identitet.key.create',
      resourceType: 'user',
      resourceName: name,
      details: { keyId: key.keyId, owner: user.id },
    });

    // The plaintext key is returned exactly once and never stored.
    ctx.status = 201;
    ctx.body = {
      data: {
        ...publicKey({ ...created, owner: { id: user.id, email: user.email } }),
        key: key.plaintext,
      },
    };
  },

  async deleteKey(ctx: Context) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized('You must be logged in');

    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) return ctx.badRequest('invalid key id');

    const cred = await strapi.db
      .query(CREDENTIAL)
      .findOne({ where: { id }, populate: { owner: true } });
    if (!cred) return ctx.notFound('key not found');

    // A member manages only its own keys; root manages any.
    if (!isRoot(user) && cred.owner?.id !== user.id) {
      return ctx.notFound('key not found');
    }

    await strapi.db.query(CREDENTIAL).delete({ where: { id } });

    recordAuditFromContext(ctx, {
      action: 'identitet.key.delete',
      resourceType: 'user',
      resourceName: cred.name,
      details: { keyId: cred.keyId },
    });

    ctx.body = { data: { id, deleted: true } };
  },
};
