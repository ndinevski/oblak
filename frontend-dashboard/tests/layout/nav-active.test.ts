/**
 * Sidebar highlighting.
 *
 * React Router's own `isActive` marks a link active for every descendant path,
 * which lit up both "Observability" and "Logs" at the same time. These tests
 * pin the longest-match rule that replaced it: exactly one item highlights, a
 * parent never steals a child's highlight, and a child never leaves its parent
 * lit.
 */

import { describe, it, expect } from 'vitest';
import { resolveActiveHref, ALL_NAV_HREFS } from '@/layouts/DashboardLayout';

describe('resolveActiveHref', () => {
  it('highlights a child rather than its parent', () => {
    // The reported bug: Observability stayed selected on every sub-page.
    expect(resolveActiveHref('/observability/logs', ALL_NAV_HREFS)).toBe('/observability/logs');
    expect(resolveActiveHref('/observability/traces', ALL_NAV_HREFS)).toBe('/observability/traces');
    expect(resolveActiveHref('/observability/metrics', ALL_NAV_HREFS)).toBe('/observability/metrics');
    expect(resolveActiveHref('/observability/services', ALL_NAV_HREFS)).toBe('/observability/services');
    expect(resolveActiveHref('/observability/alerts', ALL_NAV_HREFS)).toBe('/observability/alerts');
  });

  it('highlights the parent on its own page', () => {
    expect(resolveActiveHref('/observability', ALL_NAV_HREFS)).toBe('/observability');
  });

  it('keeps a child highlighted on the child\'s own sub-routes', () => {
    // A trace detail page still belongs to Traces, not to Observability.
    expect(resolveActiveHref('/observability/traces/abc123', ALL_NAV_HREFS)).toBe(
      '/observability/traces'
    );
  });

  it('resolves exactly one item for every nav destination', () => {
    for (const href of ALL_NAV_HREFS) {
      expect(resolveActiveHref(href, ALL_NAV_HREFS)).toBe(href);
    }
  });

  it('highlights the dashboard only on the root path', () => {
    expect(resolveActiveHref('/', ALL_NAV_HREFS)).toBe('/');
    // Root must not swallow every other route via a prefix match.
    expect(resolveActiveHref('/functions', ALL_NAV_HREFS)).toBe('/functions');
    expect(resolveActiveHref('/storage', ALL_NAV_HREFS)).toBe('/storage');
  });

  it('gives the two Brod entries their own highlight', () => {
    // Brod has separate Containers and Images entries; neither must steal the
    // other's highlight.
    expect(resolveActiveHref('/containers', ALL_NAV_HREFS)).toBe('/containers');
    expect(resolveActiveHref('/images', ALL_NAV_HREFS)).toBe('/images');
  });

  it('keeps a service highlighted on its detail and create routes', () => {
    expect(resolveActiveHref('/functions/new', ALL_NAV_HREFS)).toBe('/functions');
    expect(resolveActiveHref('/functions/42', ALL_NAV_HREFS)).toBe('/functions');
    expect(resolveActiveHref('/storage/my-bucket', ALL_NAV_HREFS)).toBe('/storage');
  });

  it('keeps Tefter highlighted on an instance detail page', () => {
    expect(resolveActiveHref('/databases', ALL_NAV_HREFS)).toBe('/databases');
    expect(resolveActiveHref('/databases/orders', ALL_NAV_HREFS)).toBe('/databases');
    expect(resolveActiveHref('/databases/orders/backups', ALL_NAV_HREFS)).toBe('/databases');
  });

  it('highlights Vrata on the gateway page', () => {
    expect(resolveActiveHref('/gateway', ALL_NAV_HREFS)).toBe('/gateway');
  });

  it('keeps Settings highlighted on a sub-page that has no nav item of its own', () => {
    // Preserves the behaviour the old hand-rolled special case provided.
    expect(resolveActiveHref('/settings', ALL_NAV_HREFS)).toBe('/settings');
    expect(resolveActiveHref('/settings/profile', ALL_NAV_HREFS)).toBe('/settings');
  });

  it('gives the monitoring items under /settings their own highlight', () => {
    // These are separate nav entries, so Settings must not also light up.
    expect(resolveActiveHref('/settings/activity', ALL_NAV_HREFS)).toBe('/settings/activity');
    expect(resolveActiveHref('/settings/quota', ALL_NAV_HREFS)).toBe('/settings/quota');
  });

  it('does not match on a shared prefix that is not a path boundary', () => {
    // /storage must not light up for /storage-something-else.
    expect(resolveActiveHref('/storagex', ALL_NAV_HREFS)).toBe('/');
  });

  it('returns null when nothing matches and there is no root entry', () => {
    expect(resolveActiveHref('/nowhere', ['/functions', '/storage'])).toBeNull();
  });
});
