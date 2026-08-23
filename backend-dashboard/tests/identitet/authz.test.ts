/**
 * Tests for the IAM authorization core.
 *
 * The properties that matter: root bypasses every gate, a member is held to its
 * per-service level (write implies read), an unknown service fails closed for a
 * member, and an unauthenticated request is refused. These are the checks every
 * proxied controller relies on.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isRoot,
  serviceLevel,
  requireAccess,
  SERVICES,
  DEFAULT_MEMBER_GRANTS,
} from '../../src/identitet/authz';

function makeCtx(user: unknown) {
  return {
    state: { user },
    unauthorized: vi.fn(function (this: any) {
      this._status = 401;
    }),
    forbidden: vi.fn(function (this: any) {
      this._status = 403;
    }),
  } as any;
}

const root = { id: 1, identitetRole: 'root' };
const member = (grants: Record<string, string>) => ({ id: 2, identitetRole: 'member', grants });

describe('isRoot', () => {
  it('is true only for the root role', () => {
    expect(isRoot(root)).toBe(true);
    expect(isRoot(member({}))).toBe(false);
    expect(isRoot(null)).toBe(false);
    expect(isRoot(undefined)).toBe(false);
  });
});

describe('serviceLevel', () => {
  it('reads the grant, defaulting missing to none', () => {
    const u = member({ queues: 'write', functions: 'read' });
    expect(serviceLevel(u, 'queues')).toBe('write');
    expect(serviceLevel(u, 'functions')).toBe('read');
    expect(serviceLevel(u, 'vms')).toBe('none');
  });

  it('treats a garbage value as none', () => {
    expect(serviceLevel(member({ queues: 'admin' as any }), 'queues')).toBe('none');
  });
});

describe('requireAccess', () => {
  it('refuses an unauthenticated request', () => {
    const ctx = makeCtx(undefined);
    expect(requireAccess(ctx, 'queues', 'read')).toBeNull();
    expect(ctx.unauthorized).toHaveBeenCalled();
  });

  it('lets root do anything', () => {
    const ctx = makeCtx(root);
    expect(requireAccess(ctx, 'queues', 'write')).toBe(root);
    expect(ctx.forbidden).not.toHaveBeenCalled();
  });

  it('allows a member at or above the required level', () => {
    const u = member({ queues: 'write', functions: 'read' });
    expect(requireAccess(makeCtx(u), 'queues', 'write')).toBe(u);
    expect(requireAccess(makeCtx(u), 'queues', 'read')).toBe(u);
    expect(requireAccess(makeCtx(u), 'functions', 'read')).toBe(u);
  });

  it('forbids a member below the required level', () => {
    const u = member({ functions: 'read' });
    const ctx = makeCtx(u);
    expect(requireAccess(ctx, 'functions', 'write')).toBeNull();
    expect(ctx.forbidden).toHaveBeenCalled();
  });

  it('forbids a member with no grant for the service', () => {
    const u = member({ queues: 'write' });
    const ctx = makeCtx(u);
    expect(requireAccess(ctx, 'databases', 'read')).toBeNull();
    expect(ctx.forbidden).toHaveBeenCalled();
  });

  it('fails closed for a member on an unknown service key', () => {
    const u = member({ nonsense: 'write' });
    const ctx = makeCtx(u);
    expect(requireAccess(ctx, 'nonsense', 'write')).toBeNull();
    expect(ctx.forbidden).toHaveBeenCalled();
  });
});

describe('defaults', () => {
  it('grants no access on any service by default (least privilege)', () => {
    for (const s of SERVICES) {
      expect(DEFAULT_MEMBER_GRANTS[s.key]).toBe('none');
    }
  });
});
