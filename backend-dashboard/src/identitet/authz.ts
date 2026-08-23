/**
 * Identitet: roles, service-scoped access, and per-resource ownership.
 *
 * The model is deliberately coarse ("the shape of Identitet, not the detail"):
 *
 *  - Every user is either `root` or a `member`. Root bypasses every check.
 *  - A member carries a `grants` map: for each service, an access level of
 *    `none` | `read` | `write` (write implies read). This gates a member out of
 *    a whole service.
 *  - Within a service that owns resources, a member additionally sees and
 *    touches only the resources they created (owner-isolation). Root sees all.
 *
 * Owner-isolation for the platform services (Pristaniste, Tefter, Indeks, Red) is kept
 * in a small ownership registry here in Strapi, because those Go services have
 * no user model of their own. The already-owned Strapi resources (functions,
 * VMs, buckets, photos) keep their existing `owner` relation and only gain the
 * service-level gate and the root bypass.
 */

import type { Core } from '@strapi/strapi';

export type AccessLevel = 'none' | 'read' | 'write';
export type Action = 'read' | 'write';

export interface ServiceMeta {
  /** Stable key stored in a user's grants map. */
  key: string;
  /** Human label shown in the admin UI and error messages. */
  label: string;
  /**
   * Whether the service isolates resources per owner. Shared infrastructure
   * (the gateway, observability) is gated by service level only.
   */
  owned: boolean;
}

/**
 * The access-scoped services. Keys are stable identifiers stored in each
 * member's grants map; renaming one is a data migration.
 */
export const SERVICES: ServiceMeta[] = [
  { key: 'functions', label: 'Functions', owned: true },
  { key: 'vms', label: 'Virtual machines', owned: true },
  { key: 'storage', label: 'Object storage', owned: true },
  { key: 'photos', label: 'Photos', owned: true },
  { key: 'containers', label: 'Containers (Pristaniste)', owned: true },
  { key: 'databases', label: 'Databases (Tefter)', owned: true },
  { key: 'keyvalue', label: 'Key/value (Indeks)', owned: true },
  { key: 'queues', label: 'Queues (Red)', owned: true },
  { key: 'gateway', label: 'Gateway (Vrata)', owned: false },
  { key: 'observability', label: 'Observability', owned: false },
];

const SERVICE_KEYS = new Set(SERVICES.map((s) => s.key));
const SERVICE_LABEL = new Map(SERVICES.map((s) => [s.key, s.label]));

/**
 * Grants applied to a newly created member. Least-privilege by default: a new
 * account (including a self-signup) has no access to any service until root
 * grants it. This is what keeps a stranger who registers from seeing or
 * touching anything. Change this one constant to shift the default posture.
 */
export const DEFAULT_MEMBER_GRANTS: Record<string, AccessLevel> = Object.fromEntries(
  SERVICES.map((s) => [s.key, 'none']),
);

export function isRoot(user: any): boolean {
  // `identitetRole`, not `role`: the Strapi user already has a `role` relation to the
  // users-permissions role, which must not be shadowed.
  return Boolean(user) && user.identitetRole === 'root';
}

/** A user's access level for one service, defaulting to none when unset. */
export function serviceLevel(user: any, service: string): AccessLevel {
  if (!user) return 'none';
  const grants = (user.grants ?? {}) as Record<string, AccessLevel>;
  const level = grants[service];
  return level === 'read' || level === 'write' ? level : 'none';
}

function levelAllows(level: AccessLevel, action: Action): boolean {
  if (level === 'write') return true;
  if (level === 'read') return action === 'read';
  return false;
}

/**
 * Enforces the service-level gate for the current request. Returns the user on
 * success; on failure it sets the response (401/403) and returns null, so the
 * caller does `const user = requireAccess(ctx, 'queues', 'write'); if (!user) return;`.
 */
export function requireAccess(ctx: any, service: string, action: Action): any | null {
  const user = ctx.state?.user;
  if (!user) {
    ctx.unauthorized('You must be logged in');
    return null;
  }
  if (isRoot(user)) return user;
  if (!SERVICE_KEYS.has(service)) {
    // An unknown service key is a programming error; fail closed for members.
    ctx.forbidden('Access denied');
    return null;
  }
  const level = serviceLevel(user, service);
  if (!levelAllows(level, action)) {
    ctx.forbidden(`You do not have ${action} access to ${SERVICE_LABEL.get(service) ?? service}`);
    return null;
  }
  return user;
}

// ---------------------------------------------------------------------------
// Ownership registry (platform services only)
// ---------------------------------------------------------------------------

const REGISTRY = 'api::platform-resource.platform-resource' as const;

/**
 * Records that `user` owns a platform resource. Idempotent: a repeated create
 * (or a name reused after deletion) updates the existing row rather than
 * duplicating it.
 */
export async function recordOwnership(
  strapi: Core.Strapi,
  service: string,
  resourceType: string,
  name: string,
  userId: number,
): Promise<void> {
  const existing = await strapi.db
    .query(REGISTRY)
    .findOne({ where: { service, name } });
  if (existing) {
    await strapi.db
      .query(REGISTRY)
      .update({ where: { id: existing.id }, data: { resourceType, owner: userId } });
    return;
  }
  await strapi.db
    .query(REGISTRY)
    .create({ data: { service, resourceType, name, owner: userId } });
}

/** Removes an ownership record, e.g. when the resource is deleted. */
export async function dropOwnership(
  strapi: Core.Strapi,
  service: string,
  name: string,
): Promise<void> {
  await strapi.db.query(REGISTRY).deleteMany({ where: { service, name } });
}

/** The owner id of a platform resource, or null if unrecorded (legacy). */
export async function ownerOf(
  strapi: Core.Strapi,
  service: string,
  name: string,
): Promise<number | null> {
  const row = await strapi.db
    .query(REGISTRY)
    .findOne({ where: { service, name }, populate: { owner: true } });
  return row?.owner?.id ?? null;
}

/** Names of the resources in a service that the user owns. */
export async function listOwnedNames(
  strapi: Core.Strapi,
  service: string,
  userId: number,
): Promise<string[]> {
  const rows = await strapi.db
    .query(REGISTRY)
    .findMany({ where: { service, owner: userId }, select: ['name'] });
  return rows.map((r: any) => r.name);
}

/**
 * Enforces ownership of one named platform resource. Root always passes; a
 * member passes only for a resource it owns. Resources with no ownership record
 * (created before Identitet, or created directly against the Go service) are treated
 * as not owned by any member, so they are visible to root only. Returns true if
 * access is allowed; on denial it sets ctx.forbidden and returns false.
 */
export async function requireOwnership(
  strapi: Core.Strapi,
  ctx: any,
  user: any,
  service: string,
  name: string,
): Promise<boolean> {
  if (isRoot(user)) return true;
  const owner = await ownerOf(strapi, service, name);
  if (owner !== null && owner === user.id) return true;
  ctx.forbidden('You do not have access to this resource');
  return false;
}

/**
 * Filters a list of resource names to those the user may see: everything for
 * root, only owned names for a member.
 */
export async function filterOwned(
  strapi: Core.Strapi,
  user: any,
  service: string,
  names: string[],
): Promise<Set<string>> {
  if (isRoot(user)) return new Set(names);
  const owned = await listOwnedNames(strapi, service, user.id);
  return new Set(owned);
}
