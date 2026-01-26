/**
 * Function service
 * Handles business logic for function operations with Impuls sync
 */

import { factories } from '@strapi/strapi';
import { createImpulsClient, ImpulsClient } from './impuls-client';

/**
 * Get configured Impuls client
 */
function getImpulsClient(): ImpulsClient {
  const baseUrl = process.env.IMPULS_URL || 'http://localhost:8080';
  const apiKey = process.env.IMPULS_API_KEY;

  return createImpulsClient({
    baseUrl,
    apiKey,
    timeout: 30000,
    retries: 3,
  });
}

export default factories.createCoreService('api::function.function', ({ strapi }) => ({
  /**
   * Create function with Impuls sync
   */
  async createWithSync(data: {
    name: string;
    description?: string;
    runtime: string;
    handler: string;
    code?: string;
    memoryMB?: number;
    timeoutSec?: number;
    environment?: Record<string, string>;
    owner: number;
  }) {
    const impulsClient = getImpulsClient();

    // Create function in Impuls
    let impulsFunction;
    try {
      impulsFunction = await impulsClient.createFunction({
        name: data.name,
        description: data.description,
        runtime: data.runtime,
        handler: data.handler,
        code: data.code || '',
        memory_mb: data.memoryMB || 128,
        timeout_sec: data.timeoutSec || 30,
        environment: data.environment,
      });
    } catch (error) {
      strapi.log.error('Failed to create function in Impuls:', error);
      throw new Error(`Failed to create function in Impuls: ${error.message}`);
    }

    // Create function record in Strapi
    const functionRecord = await strapi.entityService.create('api::function.function', {
      data: {
        name: data.name,
        description: data.description,
        runtime: data.runtime,
        handler: data.handler,
        code: data.code,
        memoryMB: data.memoryMB || 128,
        timeoutSec: data.timeoutSec || 30,
        environment: data.environment || {},
        externalId: impulsFunction.id,
        status: 'active',
        owner: data.owner,
        invocationCount: '0',
        tags: [],
      },
    });

    // Log activity
    await strapi.entityService.create('api::activity-log.activity-log', {
      data: {
        action: 'function.create',
        resourceType: 'function',
        resourceId: functionRecord.documentId,
        resourceName: data.name,
        status: 'success',
        user: data.owner,
      },
    }).catch(err => strapi.log.warn('Failed to log activity:', err));

    return functionRecord;
  },

  /**
   * Update function with Impuls sync
   */
  async updateWithSync(
    documentId: string,
    data: {
      description?: string;
      runtime?: string;
      handler?: string;
      code?: string;
      memoryMB?: number;
      timeoutSec?: number;
      environment?: Record<string, string>;
    },
    userId: number
  ) {
    // Get existing function
    const existing = await strapi.entityService.findOne('api::function.function', documentId);
    if (!existing) {
      throw new Error('Function not found');
    }

    const impulsClient = getImpulsClient();

    // Update in Impuls
    try {
      await impulsClient.updateFunction(existing.name, {
        description: data.description,
        runtime: data.runtime,
        handler: data.handler,
        code: data.code,
        memory_mb: data.memoryMB,
        timeout_sec: data.timeoutSec,
        environment: data.environment,
      });
    } catch (error) {
      strapi.log.error('Failed to update function in Impuls:', error);
      throw new Error(`Failed to update function in Impuls: ${error.message}`);
    }

    // Update in Strapi
    const updated = await strapi.entityService.update('api::function.function', documentId, {
      data: {
        ...data,
        status: 'active',
      },
    });

    // Log activity
    await strapi.entityService.create('api::activity-log.activity-log', {
      data: {
        action: 'function.update',
        resourceType: 'function',
        resourceId: documentId,
        resourceName: existing.name,
        status: 'success',
        user: userId,
        details: { updatedFields: Object.keys(data) },
      },
    }).catch(err => strapi.log.warn('Failed to log activity:', err));

    return updated;
  },

  /**
   * Delete function with Impuls sync
   */
  async deleteWithSync(documentId: string, userId: number) {
    // Get existing function
    const existing = await strapi.entityService.findOne('api::function.function', documentId);
    if (!existing) {
      throw new Error('Function not found');
    }

    const impulsClient = getImpulsClient();

    // Delete from Impuls
    try {
      await impulsClient.deleteFunction(existing.name);
    } catch (error) {
      strapi.log.error('Failed to delete function in Impuls:', error);
      // Continue with deletion in Strapi even if Impuls fails
    }

    // Delete from Strapi
    await strapi.entityService.delete('api::function.function', documentId);

    // Log activity
    await strapi.entityService.create('api::activity-log.activity-log', {
      data: {
        action: 'function.delete',
        resourceType: 'function',
        resourceId: documentId,
        resourceName: existing.name,
        status: 'success',
        user: userId,
      },
    }).catch(err => strapi.log.warn('Failed to log activity:', err));

    return { success: true, name: existing.name };
  },

  /**
   * Invoke function
   */
  async invoke(
    documentId: string,
    payload: Record<string, unknown>,
    userId: number,
    options: { local?: boolean } = {}
  ) {
    // Get function
    const fn = await strapi.entityService.findOne('api::function.function', documentId);
    if (!fn) {
      throw new Error('Function not found');
    }

    const impulsClient = getImpulsClient();

    // Invoke in Impuls
    let result;
    try {
      result = await impulsClient.invokeFunction(fn.name, {
        payload,
        local: options.local,
      });
    } catch (error) {
      // Log failed invocation
      await strapi.entityService.create('api::activity-log.activity-log', {
        data: {
          action: 'function.invoke',
          resourceType: 'function',
          resourceId: documentId,
          resourceName: fn.name,
          status: 'failure',
          errorMessage: error.message,
          user: userId,
        },
      }).catch(err => strapi.log.warn('Failed to log activity:', err));

      throw new Error(`Function invocation failed: ${error.message}`);
    }

    // Update invocation count and last invoked time
    const currentCount = BigInt(fn.invocationCount || '0');
    await strapi.entityService.update('api::function.function', documentId, {
      data: {
        invocationCount: (currentCount + 1n).toString(),
        lastInvokedAt: new Date().toISOString(),
      },
    });

    // Log successful invocation
    await strapi.entityService.create('api::activity-log.activity-log', {
      data: {
        action: 'function.invoke',
        resourceType: 'function',
        resourceId: documentId,
        resourceName: fn.name,
        status: 'success',
        user: userId,
        details: {
          executionTimeMs: result.execution_time_ms,
          memoryUsedMb: result.memory_used_mb,
        },
      },
    }).catch(err => strapi.log.warn('Failed to log activity:', err));

    return result;
  },

  /**
   * Find functions by owner
   */
  async findByOwner(ownerId: number, params: { page?: number; pageSize?: number } = {}) {
    const { page = 1, pageSize = 25 } = params;

    return strapi.entityService.findMany('api::function.function', {
      filters: { owner: ownerId },
      sort: { createdAt: 'desc' },
      populate: ['owner'],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
  },

  /**
   * Count functions by owner
   */
  async countByOwner(ownerId: number) {
    const result = await strapi.db.query('api::function.function').count({
      where: { owner: ownerId },
    });
    return result;
  },

  /**
   * Find function by name
   */
  async findByName(name: string) {
    const results = await strapi.entityService.findMany('api::function.function', {
      filters: { name },
      limit: 1,
    });
    return results[0] || null;
  },
}));
