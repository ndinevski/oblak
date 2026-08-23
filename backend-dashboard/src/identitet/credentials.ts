/**
 * API key credentials for the CLI and SDKs.
 *
 * A key authenticates as its owner and inherits the owner's access, so every
 * existing gate (users-permissions permissions, identitet grants, and
 * owner-isolation) applies unchanged: the key simply resolves to a user.
 *
 * Key format: `oblak_<keyId>_<secret>`
 *   - keyId  : 16 hex chars, stored in clear and used to look the key up.
 *   - secret : 48 hex chars of entropy, never stored; only its SHA-256 is kept.
 *
 * SHA-256 (not bcrypt) is appropriate here: the secret is 192 bits of random,
 * so there is nothing to brute-force, and lookups stay cheap.
 */

import crypto from 'crypto';
import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const CREDENTIAL = 'api::credential.credential' as const;
const USER = 'plugin::users-permissions.user' as const;
export const KEY_PREFIX = 'oblak_';

export interface GeneratedKey {
  keyId: string;
  secret: string;
  /** The full key string, shown to the user once and never stored. */
  plaintext: string;
  keyHash: string;
}

/** Mints a new key. The plaintext is returned once; only keyId + hash persist. */
export function generateKey(): GeneratedKey {
  const keyId = crypto.randomBytes(8).toString('hex'); // 16 hex chars
  const secret = crypto.randomBytes(24).toString('hex'); // 48 hex chars
  const plaintext = `${KEY_PREFIX}${keyId}_${secret}`;
  const keyHash = hashSecret(secret);
  return { keyId, secret, plaintext, keyHash };
}

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/** Constant-time compare so a timing side-channel cannot probe the hash. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Pulls a raw `oblak_...` key from the request, or null if none is present. */
export function extractKey(ctx: any): string | null {
  const auth = ctx.request?.header?.authorization ?? ctx.request?.headers?.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token.startsWith(KEY_PREFIX)) return token;
  }
  const headerKey = ctx.request?.header?.['x-api-key'] ?? ctx.request?.headers?.['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.startsWith(KEY_PREFIX)) return headerKey;
  return null;
}

/** Splits `oblak_<keyId>_<secret>` into its parts, or null if malformed. */
export function parseKey(raw: string): { keyId: string; secret: string } | null {
  if (!raw.startsWith(KEY_PREFIX)) return null;
  const rest = raw.slice(KEY_PREFIX.length);
  const sep = rest.indexOf('_');
  if (sep <= 0) return null;
  const keyId = rest.slice(0, sep);
  const secret = rest.slice(sep + 1);
  if (!keyId || !secret) return null;
  return { keyId, secret };
}

/**
 * Resolves a raw key to its owner user (with role populated), or null if the
 * key is unknown, malformed, revoked, expired, or the secret does not match.
 * Updates lastUsedAt at most once a minute to avoid a write per request.
 */
export async function resolveKeyToUser(
  strapi: Core.Strapi,
  raw: string,
): Promise<any | null> {
  const parts = parseKey(raw);
  if (!parts) return null;

  const cred = await strapi.db
    .query(CREDENTIAL)
    .findOne({ where: { keyId: parts.keyId }, populate: { owner: true } });
  if (!cred || cred.revoked) return null;

  if (cred.expiresAt && new Date(cred.expiresAt).getTime() < Date.now()) {
    return null;
  }

  if (!safeEqual(hashSecret(parts.secret), cred.keyHash)) return null;
  if (!cred.owner?.id) return null;

  // Load the owner the same way the JWT strategy does, so role and custom
  // fields (identitetRole, grants) are present.
  const user = await strapi
    .plugin('users-permissions')
    .service('user')
    .fetchAuthenticatedUser(cred.owner.id);
  if (!user || user.blocked) return null;

  // Throttled last-used stamp: skip if updated within the last minute.
  const last = cred.lastUsedAt ? new Date(cred.lastUsedAt).getTime() : 0;
  if (Date.now() - last > 60_000) {
    strapi.db
      .query(CREDENTIAL)
      .update({ where: { id: cred.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }

  return { user, credential: { id: cred.id, keyId: cred.keyId, name: cred.name } };
}

/**
 * A content-api authentication strategy backing API keys. Registered alongside
 * the users-permissions JWT strategy: if the request carries an `oblak_...`
 * key it authenticates as the owner and builds the same ability the JWT path
 * would; otherwise it declines so the JWT strategy can handle the request.
 */
export function apiKeyStrategy(strapi: Core.Strapi) {
  const upServices = () => strapi.plugin('users-permissions').service('permission');

  return {
    name: 'oblak-api-key',
    async authenticate(ctx: any) {
      const raw = extractKey(ctx);
      if (!raw) return { authenticated: false };

      const resolved = await resolveKeyToUser(strapi, raw);
      if (!resolved) return { authenticated: false };

      const { user, credential } = resolved;

      // Build the ability from the owner's role, exactly as the JWT strategy
      // does, so the users-permissions permission layer treats an API-key
      // request identically to a session request.
      const permission = upServices();
      const rolePerms = await permission.findRolePermissions(user.role.id);
      const permissions = rolePerms.map(permission.toContentAPIPermission);
      const ability = await strapi.contentAPI.permissions.engine.generateAbility(permissions);

      ctx.state.user = user;
      ctx.state.credential = credential;

      return { authenticated: true, credentials: user, ability };
    },
    verify(auth: any, config: any) {
      const { credentials: user, ability } = auth;
      if (!config.scope) {
        if (!user) throw new errors.UnauthorizedError();
        return;
      }
      if (!ability) throw new errors.UnauthorizedError();
      const scopes = Array.isArray(config.scope) ? config.scope : [config.scope];
      const allowed = scopes.every((s: string) => ability.can(s));
      if (!allowed) throw new errors.ForbiddenError();
    },
  };
}
