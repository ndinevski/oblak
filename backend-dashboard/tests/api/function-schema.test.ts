/**
 * Function schema tests
 */

import { describe, it, expect } from 'vitest';
import functionSchema from '../../src/api/function/content-types/function/schema.json';

describe('Function Schema', () => {
  it('should be a collectionType', () => {
    expect(functionSchema.kind).toBe('collectionType');
  });

  it('should have correct collection name', () => {
    expect(functionSchema.collectionName).toBe('functions');
  });

  it('should have draftAndPublish disabled', () => {
    expect(functionSchema.options.draftAndPublish).toBe(false);
  });

  describe('Attributes', () => {
    const attrs = functionSchema.attributes;

    describe('name', () => {
      it('should be required', () => {
        expect(attrs.name.required).toBe(true);
      });

      it('should be unique', () => {
        expect(attrs.name.unique).toBe(true);
      });

      it('should have min/max length', () => {
        expect(attrs.name.minLength).toBe(2);
        expect(attrs.name.maxLength).toBe(63);
      });

      it('should have regex pattern', () => {
        expect(attrs.name.regex).toBeDefined();
      });
    });

    describe('runtime', () => {
      it('should be required', () => {
        expect(attrs.runtime.required).toBe(true);
      });

      it('should be an enumeration', () => {
        expect(attrs.runtime.type).toBe('enumeration');
      });

      it('should have valid runtime options', () => {
        expect(attrs.runtime.enum).toContain('nodejs20');
        expect(attrs.runtime.enum).toContain('nodejs18');
        expect(attrs.runtime.enum).toContain('python312');
        expect(attrs.runtime.enum).toContain('python311');
      });

      it('should default to nodejs20', () => {
        expect(attrs.runtime.default).toBe('nodejs20');
      });
    });

    describe('handler', () => {
      it('should be required', () => {
        expect(attrs.handler.required).toBe(true);
      });

      it('should default to index.handler', () => {
        expect(attrs.handler.default).toBe('index.handler');
      });
    });

    describe('memoryMB', () => {
      it('should default to 128', () => {
        expect(attrs.memoryMB.default).toBe(128);
      });

      it('should have min of 64', () => {
        expect(attrs.memoryMB.min).toBe(64);
      });

      it('should have max of 3008', () => {
        expect(attrs.memoryMB.max).toBe(3008);
      });
    });

    describe('timeoutSec', () => {
      it('should default to 30', () => {
        expect(attrs.timeoutSec.default).toBe(30);
      });

      it('should have min of 1', () => {
        expect(attrs.timeoutSec.min).toBe(1);
      });

      it('should have max of 900', () => {
        expect(attrs.timeoutSec.max).toBe(900);
      });
    });

    describe('status', () => {
      it('should be an enumeration', () => {
        expect(attrs.status.type).toBe('enumeration');
      });

      it('should have valid status options', () => {
        expect(attrs.status.enum).toContain('active');
        expect(attrs.status.enum).toContain('inactive');
        expect(attrs.status.enum).toContain('error');
        expect(attrs.status.enum).toContain('deploying');
      });

      it('should default to inactive', () => {
        expect(attrs.status.default).toBe('inactive');
      });
    });

    describe('owner', () => {
      it('should be a relation', () => {
        expect(attrs.owner.type).toBe('relation');
      });

      it('should be manyToOne', () => {
        expect(attrs.owner.relation).toBe('manyToOne');
      });

      it('should target users-permissions user', () => {
        expect(attrs.owner.target).toBe('plugin::users-permissions.user');
      });
    });

    describe('externalId', () => {
      it('should be private', () => {
        expect(attrs.externalId.private).toBe(true);
      });
    });

    describe('invocationCount', () => {
      it('should be biginteger', () => {
        expect(attrs.invocationCount.type).toBe('biginteger');
      });

      it('should default to "0"', () => {
        expect(attrs.invocationCount.default).toBe('0');
      });
    });

    describe('environment', () => {
      it('should be json type', () => {
        expect(attrs.environment.type).toBe('json');
      });

      it('should default to empty object', () => {
        expect(attrs.environment.default).toEqual({});
      });
    });

    describe('tags', () => {
      it('should be json type', () => {
        expect(attrs.tags.type).toBe('json');
      });

      it('should default to empty array', () => {
        expect(attrs.tags.default).toEqual([]);
      });
    });
  });
});
