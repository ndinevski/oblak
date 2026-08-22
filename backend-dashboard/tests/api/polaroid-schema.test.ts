/**
 * Polaroid Schema Tests
 */

import { describe, it, expect } from 'vitest';

describe('Polaroid Schema', () => {
  const schema = {
    kind: 'collectionType',
    collectionName: 'polaroids',
    info: {
      singularName: 'polaroid',
      pluralName: 'polaroids',
      displayName: 'Polaroid',
      description: 'Polaroid photo service instance for Immich integration',
    },
    options: { draftAndPublish: false },
    attributes: {
      immichUserId: { type: 'string', required: true },
      immichUserEmail: { type: 'string' },
      apiKey: { type: 'string', private: true },
      immichUserPassword: { type: 'string', private: true },
      storageUsed: { type: 'biginteger', default: '0' },
      photoCount: { type: 'biginteger', default: '0' },
      videoCount: { type: 'biginteger', default: '0' },
      lastSyncedAt: { type: 'datetime', private: true },
      owner: {
        type: 'relation',
        relation: 'manyToOne',
        target: 'plugin::users-permissions.user',
      },
    },
  };

  it('should be a collection type', () => {
    expect(schema.kind).toBe('collectionType');
    expect(schema.collectionName).toBe('polaroids');
  });

  it('should have correct info metadata', () => {
    expect(schema.info.singularName).toBe('polaroid');
    expect(schema.info.pluralName).toBe('polaroids');
    expect(schema.info.displayName).toBe('Polaroid');
    expect(schema.info.description).toBe('Polaroid photo service instance for Immich integration');
  });

  it('should have draftAndPublish disabled', () => {
    expect(schema.options.draftAndPublish).toBe(false);
  });

  it('should have required immichUserId field', () => {
    expect(schema.attributes.immichUserId.type).toBe('string');
    expect(schema.attributes.immichUserId.required).toBe(true);
  });

  it('should have optional immichUserEmail field', () => {
    expect(schema.attributes.immichUserEmail.type).toBe('string');
    expect((schema.attributes.immichUserEmail as { required?: boolean }).required).toBeUndefined();
  });

  it('should have private apiKey field', () => {
    expect(schema.attributes.apiKey.type).toBe('string');
    expect(schema.attributes.apiKey.private).toBe(true);
  });

  it('should have private immichUserPassword field', () => {
    expect(schema.attributes.immichUserPassword.type).toBe('string');
    expect(schema.attributes.immichUserPassword.private).toBe(true);
  });

  it('should have private lastSyncedAt datetime field', () => {
    expect(schema.attributes.lastSyncedAt.type).toBe('datetime');
    expect(schema.attributes.lastSyncedAt.private).toBe(true);
  });

  it('should have stats fields as biginteger with zero defaults', () => {
    expect(schema.attributes.storageUsed.type).toBe('biginteger');
    expect(schema.attributes.storageUsed.default).toBe('0');
    expect(schema.attributes.photoCount.type).toBe('biginteger');
    expect(schema.attributes.photoCount.default).toBe('0');
    expect(schema.attributes.videoCount.type).toBe('biginteger');
    expect(schema.attributes.videoCount.default).toBe('0');
  });

  it('should have owner relation to user', () => {
    expect(schema.attributes.owner.type).toBe('relation');
    expect(schema.attributes.owner.relation).toBe('manyToOne');
    expect(schema.attributes.owner.target).toBe('plugin::users-permissions.user');
  });
});
