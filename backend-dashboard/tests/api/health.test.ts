/**
 * Health Controller Tests
 * 
 * Tests for the health check endpoint
 */

import { describe, it, expect } from 'vitest';

describe('Health Controller', () => {
  describe('GET /api/health', () => {
    it('should return healthy status', async () => {
      // Mock context
      const ctx = {
        body: null as any,
      };

      // Import controller
      const healthController = (await import('../../src/api/health/controllers/health')).default;
      
      // Execute
      await healthController.index(ctx);

      // Assert
      expect(ctx.body).toBeDefined();
      expect(ctx.body.status).toBe('healthy');
      expect(ctx.body.service).toBe('oblak-dashboard');
      expect(ctx.body.timestamp).toBeDefined();
      expect(ctx.body.uptime).toBeDefined();
      expect(typeof ctx.body.uptime).toBe('number');
    });

    it('should include valid timestamp', async () => {
      const ctx = { body: null as any };
      const healthController = (await import('../../src/api/health/controllers/health')).default;
      
      await healthController.index(ctx);

      const timestamp = new Date(ctx.body.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});

describe('Health Routes', () => {
  it('should have correct route configuration', async () => {
    const routes = (await import('../../src/api/health/routes/health')).default;
    
    expect(routes.routes).toBeDefined();
    expect(routes.routes).toHaveLength(1);
    
    const healthRoute = routes.routes[0];
    expect(healthRoute.method).toBe('GET');
    expect(healthRoute.path).toBe('/health');
    expect(healthRoute.handler).toBe('health.index');
    expect(healthRoute.config.auth).toBe(false);
  });
});
