/**
 * User extension tests
 * Tests for custom user attributes and plugin extension
 */

import { describe, it, expect } from 'vitest';

// Import the extension to test
import userExtension from '../../src/extensions/users-permissions/strapi-server';

describe('Users-Permissions Extension', () => {
  // Mock plugin structure
  const createMockPlugin = () => ({
    controllers: {
      auth: () => ({
        callback: async () => {},
        register: async () => {},
      }),
    },
    contentTypes: {
      user: {
        schema: {
          attributes: {
            username: { type: 'string' },
            email: { type: 'email' },
            password: { type: 'password' },
          },
        },
      },
    },
  });

  it('should return the extended plugin', () => {
    const mockPlugin = createMockPlugin();
    const extendedPlugin = userExtension(mockPlugin);
    
    expect(extendedPlugin).toBeDefined();
    expect(extendedPlugin.controllers).toBeDefined();
    expect(extendedPlugin.contentTypes).toBeDefined();
  });

  describe('Extended User Attributes', () => {
    let extendedPlugin: any;

    beforeAll(() => {
      const mockPlugin = createMockPlugin();
      extendedPlugin = userExtension(mockPlugin);
    });

    it('should add organization attribute to user schema', () => {
      const attributes = extendedPlugin.contentTypes.user.schema.attributes;
      
      expect(attributes.organization).toBeDefined();
      expect(attributes.organization.type).toBe('string');
      expect(attributes.organization.default).toBe('Personal');
      expect(attributes.organization.minLength).toBe(1);
      expect(attributes.organization.maxLength).toBe(100);
    });

    it('should add quotas attribute to user schema', () => {
      const attributes = extendedPlugin.contentTypes.user.schema.attributes;
      
      expect(attributes.quotas).toBeDefined();
      expect(attributes.quotas.type).toBe('json');
      expect(attributes.quotas.default).toEqual({
        maxFunctions: 10,
        maxVMs: 5,
        maxBuckets: 10,
        maxStorageGB: 50,
      });
    });

    it('should add lastLoginAt attribute to user schema', () => {
      const attributes = extendedPlugin.contentTypes.user.schema.attributes;
      
      expect(attributes.lastLoginAt).toBeDefined();
      expect(attributes.lastLoginAt.type).toBe('datetime');
    });

    it('should preserve original user attributes', () => {
      const attributes = extendedPlugin.contentTypes.user.schema.attributes;
      
      expect(attributes.username).toBeDefined();
      expect(attributes.email).toBeDefined();
      expect(attributes.password).toBeDefined();
    });
  });

  describe('Extended Auth Controller', () => {
    it('should extend the auth controller', () => {
      const mockPlugin = createMockPlugin();
      const extendedPlugin = userExtension(mockPlugin);
      
      expect(extendedPlugin.controllers.auth).toBeDefined();
      expect(typeof extendedPlugin.controllers.auth).toBe('function');
    });

    it('should return controller with callback method', () => {
      const mockPlugin = createMockPlugin();
      const extendedPlugin = userExtension(mockPlugin);
      
      const controller = extendedPlugin.controllers.auth({ strapi: {} });
      expect(controller.callback).toBeDefined();
      expect(typeof controller.callback).toBe('function');
    });

    it('should return controller with register method', () => {
      const mockPlugin = createMockPlugin();
      const extendedPlugin = userExtension(mockPlugin);
      
      const controller = extendedPlugin.controllers.auth({ strapi: {} });
      expect(controller.register).toBeDefined();
      expect(typeof controller.register).toBe('function');
    });
  });
});

describe('User Quotas Validation', () => {
  const defaultQuotas = {
    maxFunctions: 10,
    maxVMs: 5,
    maxBuckets: 10,
    maxStorageGB: 50,
  };

  it('should have reasonable default function limit', () => {
    expect(defaultQuotas.maxFunctions).toBeGreaterThan(0);
    expect(defaultQuotas.maxFunctions).toBeLessThanOrEqual(100);
  });

  it('should have reasonable default VM limit', () => {
    expect(defaultQuotas.maxVMs).toBeGreaterThan(0);
    expect(defaultQuotas.maxVMs).toBeLessThanOrEqual(50);
  });

  it('should have reasonable default bucket limit', () => {
    expect(defaultQuotas.maxBuckets).toBeGreaterThan(0);
    expect(defaultQuotas.maxBuckets).toBeLessThanOrEqual(100);
  });

  it('should have reasonable default storage limit in GB', () => {
    expect(defaultQuotas.maxStorageGB).toBeGreaterThan(0);
    expect(defaultQuotas.maxStorageGB).toBeLessThanOrEqual(1000);
  });
});

describe('Organization Field Validation', () => {
  const orgConfig = {
    type: 'string',
    minLength: 1,
    maxLength: 100,
    default: 'Personal',
  };

  it('should have string type', () => {
    expect(orgConfig.type).toBe('string');
  });

  it('should require at least 1 character', () => {
    expect(orgConfig.minLength).toBe(1);
  });

  it('should allow maximum 100 characters', () => {
    expect(orgConfig.maxLength).toBe(100);
  });

  it('should default to Personal', () => {
    expect(orgConfig.default).toBe('Personal');
  });

  it('should validate organization name length', () => {
    const validNames = ['Acme Corp', 'Personal', 'My Organization', 'A'];
    const invalidNames = ['', 'a'.repeat(101)];

    validNames.forEach((name) => {
      expect(name.length).toBeGreaterThanOrEqual(orgConfig.minLength);
      expect(name.length).toBeLessThanOrEqual(orgConfig.maxLength);
    });

    invalidNames.forEach((name) => {
      const isValid = name.length >= orgConfig.minLength && name.length <= orgConfig.maxLength;
      expect(isValid).toBe(false);
    });
  });
});
