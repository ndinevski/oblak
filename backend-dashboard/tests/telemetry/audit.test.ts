/**
 * Tests for the audit emitter.
 *
 * Audit records replaced the Strapi `activity_logs` table, so the important
 * guarantees are: the right attributes are produced, emission never throws
 * into the caller, and payloads cannot grow without bound.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const emit = vi.fn();

vi.mock('@opentelemetry/api-logs', () => ({
  logs: { getLogger: () => ({ emit }) },
  SeverityNumber: { DEBUG: 5, INFO: 9, ERROR: 17 },
}));

const getActiveSpan = vi.fn();
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: () => getActiveSpan(),
  },
}));

import { recordAudit, recordAuditFromContext } from '../../src/telemetry/audit';

describe('recordAudit', () => {
  beforeEach(() => {
    emit.mockClear();
    getActiveSpan.mockReset();
    getActiveSpan.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits the action as the log body', () => {
    recordAudit({ action: 'bucket.create', resourceType: 'bucket' });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].body).toBe('bucket.create');
  });

  it('namespaces audit attributes so they are separable from app logs', () => {
    recordAudit({
      action: 'bucket.create',
      resourceType: 'bucket',
      resourceId: 42,
      resourceName: 'demo-assets',
      userId: 7,
    });

    const { attributes } = emit.mock.calls[0][0];
    expect(attributes['oblak.audit.event']).toBe(true);
    expect(attributes['oblak.audit.action']).toBe('bucket.create');
    expect(attributes['oblak.audit.resource_type']).toBe('bucket');
    // Ids are stringified: the telemetry store's attribute map is string-keyed
    // and string-valued, so mixed types would be lossy.
    expect(attributes['oblak.audit.resource_id']).toBe('42');
    expect(attributes['oblak.audit.user_id']).toBe('7');
    expect(attributes['oblak.audit.resource_name']).toBe('demo-assets');
  });

  it('maps failure status to ERROR severity', () => {
    recordAudit({
      action: 'vm.create',
      resourceType: 'virtual-machine',
      status: 'failure',
      errorMessage: 'proxmox unreachable',
    });

    const record = emit.mock.calls[0][0];
    expect(record.severityText).toBe('ERROR');
    expect(record.attributes['error.message']).toBe('proxmox unreachable');
    expect(record.attributes['oblak.audit.status']).toBe('failure');
  });

  it('defaults to success when no status is given', () => {
    recordAudit({ action: 'user.login', resourceType: 'user' });
    expect(emit.mock.calls[0][0].attributes['oblak.audit.status']).toBe('success');
    expect(emit.mock.calls[0][0].severityText).toBe('INFO');
  });

  it('attaches trace and span ids so audit rows link to their request', () => {
    getActiveSpan.mockReturnValue({
      spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) }),
    });

    recordAudit({ action: 'object.upload', resourceType: 'object' });

    const { attributes } = emit.mock.calls[0][0];
    expect(attributes.trace_id).toBe('a'.repeat(32));
    expect(attributes.span_id).toBe('b'.repeat(16));
  });

  it('flattens nested details into dotted attribute keys', () => {
    recordAudit({
      action: 'vm.create',
      resourceType: 'virtual-machine',
      details: { size: 'small', spec: { cores: 2, memoryMB: 2048 } },
    });

    const { attributes } = emit.mock.calls[0][0];
    expect(attributes['oblak.audit.detail.size']).toBe('small');
    expect(attributes['oblak.audit.detail.spec.cores']).toBe(2);
    expect(attributes['oblak.audit.detail.spec.memoryMB']).toBe(2048);
  });

  it('summarises arrays rather than exploding them into many attributes', () => {
    recordAudit({
      action: 'object.deleteMany',
      resourceType: 'object',
      details: { keys: Array.from({ length: 250 }, (_, i) => `file-${i}.txt`) },
    });

    const { attributes } = emit.mock.calls[0][0];
    expect(attributes['oblak.audit.detail.keys.count']).toBe(250);
    // The full list must not be inlined, or one bulk delete would produce a
    // 250-value attribute.
    expect(attributes['oblak.audit.detail.keys']).toBeUndefined();
  });

  it('inlines short scalar arrays, which are useful in the log view', () => {
    recordAudit({
      action: 'object.deleteMany',
      resourceType: 'object',
      details: { keys: ['a.txt', 'b.txt'] },
    });

    const { attributes } = emit.mock.calls[0][0];
    expect(attributes['oblak.audit.detail.keys']).toBe('a.txt,b.txt');
    expect(attributes['oblak.audit.detail.keys.count']).toBe(2);
  });

  it('truncates oversized strings so one payload cannot bloat a record', () => {
    recordAudit({
      action: 'function.create',
      resourceType: 'function',
      details: { code: 'x'.repeat(5000) },
    });

    const value = emit.mock.calls[0][0].attributes['oblak.audit.detail.code'] as string;
    expect(value.length).toBeLessThan(1100);
    expect(value.endsWith('...[truncated]')).toBe(true);
  });

  it('caps recursion depth on deeply nested details', () => {
    recordAudit({
      action: 'function.create',
      resourceType: 'function',
      details: { a: { b: { c: { d: { e: 'too deep' } } } } },
    });

    const { attributes } = emit.mock.calls[0][0];
    expect(attributes['oblak.audit.detail.a.b.c.d']).toBe('[truncated]');
  });

  it('never throws into the caller when the logger fails', () => {
    emit.mockImplementationOnce(() => {
      throw new Error('exporter down');
    });

    // An audit failure must not fail the user action that triggered it.
    expect(() => recordAudit({ action: 'user.login', resourceType: 'user' })).not.toThrow();
  });

  it('omits absent optional fields rather than emitting empty strings', () => {
    recordAudit({ action: 'user.logout', resourceType: 'user' });

    const { attributes } = emit.mock.calls[0][0];
    expect(attributes).not.toHaveProperty('oblak.audit.resource_id');
    expect(attributes).not.toHaveProperty('oblak.audit.user_id');
    expect(attributes).not.toHaveProperty('error.message');
  });
});

describe('recordAuditFromContext', () => {
  beforeEach(() => {
    emit.mockClear();
    getActiveSpan.mockReset();
    getActiveSpan.mockReturnValue(undefined);
  });

  it('derives user and request metadata from the Koa context', () => {
    recordAuditFromContext(
      {
        state: { user: { id: 3, email: 'demo@oblak.local' } },
        request: { ip: '10.0.0.5', header: { 'user-agent': 'oblak-test/1.0' } },
      },
      { action: 'bucket.delete', resourceType: 'bucket', resourceName: 'old-bucket' }
    );

    const { attributes } = emit.mock.calls[0][0];
    expect(attributes['oblak.audit.user_id']).toBe('3');
    expect(attributes['oblak.audit.user_email']).toBe('demo@oblak.local');
    expect(attributes['client.address']).toBe('10.0.0.5');
    expect(attributes['user_agent.original']).toBe('oblak-test/1.0');
  });

  it('tolerates a null context, which happens for background jobs', () => {
    expect(() =>
      recordAuditFromContext(null, { action: 'user.login', resourceType: 'user' })
    ).not.toThrow();
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
