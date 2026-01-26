/**
 * Activity Log schema tests
 */

import { describe, it, expect } from 'vitest';
import activityLogSchema from '../../src/api/activity-log/content-types/activity-log/schema.json';

describe('Activity Log Schema', () => {
  it('should be a collectionType', () => {
    expect(activityLogSchema.kind).toBe('collectionType');
  });

  it('should have correct collection name', () => {
    expect(activityLogSchema.collectionName).toBe('activity_logs');
  });

  it('should have draftAndPublish disabled', () => {
    expect(activityLogSchema.options.draftAndPublish).toBe(false);
  });

  describe('Attributes', () => {
    const attrs = activityLogSchema.attributes;

    describe('action', () => {
      it('should be required', () => {
        expect(attrs.action.required).toBe(true);
      });

      it('should be an enumeration', () => {
        expect(attrs.action.type).toBe('enumeration');
      });

      it('should have valid action options', () => {
        const expectedActions = [
          'function.create', 'function.update', 'function.delete', 'function.invoke',
          'vm.create', 'vm.start', 'vm.stop', 'vm.delete',
          'bucket.create', 'bucket.delete',
          'object.upload', 'object.download', 'object.delete'
        ];
        expectedActions.forEach(action => {
          expect(attrs.action.enum).toContain(action);
        });
      });
    });

    describe('resourceType', () => {
      it('should be required', () => {
        expect(attrs.resourceType.required).toBe(true);
      });

      it('should be an enumeration', () => {
        expect(attrs.resourceType.type).toBe('enumeration');
      });

      it('should have valid resource types', () => {
        expect(attrs.resourceType.enum).toContain('function');
        expect(attrs.resourceType.enum).toContain('virtual-machine');
        expect(attrs.resourceType.enum).toContain('bucket');
        expect(attrs.resourceType.enum).toContain('object');
        expect(attrs.resourceType.enum).toContain('user');
      });
    });

    describe('resourceId', () => {
      it('should be a string', () => {
        expect(attrs.resourceId.type).toBe('string');
      });
    });

    describe('resourceName', () => {
      it('should be a string', () => {
        expect(attrs.resourceName.type).toBe('string');
      });
    });

    describe('status', () => {
      it('should be an enumeration', () => {
        expect(attrs.status.type).toBe('enumeration');
      });

      it('should have success, failure, pending options', () => {
        expect(attrs.status.enum).toContain('success');
        expect(attrs.status.enum).toContain('failure');
        expect(attrs.status.enum).toContain('pending');
      });

      it('should default to success', () => {
        expect(attrs.status.default).toBe('success');
      });
    });

    describe('details', () => {
      it('should be json type', () => {
        expect(attrs.details.type).toBe('json');
      });
    });

    describe('ipAddress', () => {
      it('should be a string', () => {
        expect(attrs.ipAddress.type).toBe('string');
      });
    });

    describe('userAgent', () => {
      it('should be string type', () => {
        expect(attrs.userAgent.type).toBe('string');
      });
    });

    describe('user', () => {
      it('should be a relation', () => {
        expect(attrs.user.type).toBe('relation');
      });

      it('should be manyToOne', () => {
        expect(attrs.user.relation).toBe('manyToOne');
      });

      it('should target users-permissions user', () => {
        expect(attrs.user.target).toBe('plugin::users-permissions.user');
      });
    });
  });
});
