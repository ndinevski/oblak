/**
 * Bucket routes configuration
 * Integrates with Spomen storage service
 */

export default {
  routes: [
    // ==========================================================================
    // Bucket CRUD Operations
    // ==========================================================================
    {
      method: 'GET',
      path: '/buckets',
      handler: 'bucket.find',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'List all buckets for the current user',
        tags: ['Bucket'],
      },
    },
    {
      method: 'GET',
      path: '/buckets/:id',
      handler: 'bucket.findOne',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Get bucket details',
        tags: ['Bucket'],
      },
    },
    {
      method: 'POST',
      path: '/buckets',
      handler: 'bucket.create',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Create a new bucket',
        tags: ['Bucket'],
      },
    },
    {
      method: 'PUT',
      path: '/buckets/:id',
      handler: 'bucket.update',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Update bucket settings',
        tags: ['Bucket'],
      },
    },
    {
      method: 'DELETE',
      path: '/buckets/:id',
      handler: 'bucket.delete',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Delete a bucket',
        tags: ['Bucket'],
      },
    },

    // ==========================================================================
    // Bucket Statistics
    // ==========================================================================
    {
      method: 'GET',
      path: '/buckets/:id/stats',
      handler: 'bucket.stats',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Get bucket statistics',
        tags: ['Bucket'],
      },
    },

    // ==========================================================================
    // Object Operations
    // ==========================================================================
    {
      method: 'GET',
      path: '/buckets/:id/objects',
      handler: 'object.list',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'List objects in a bucket',
        tags: ['Object'],
      },
    },
    {
      method: 'GET',
      path: '/buckets/:id/objects/:objectKey',
      handler: 'object.get',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Get object details or download',
        tags: ['Object'],
      },
    },
    {
      method: 'POST',
      path: '/buckets/:id/objects',
      handler: 'object.upload',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Upload an object',
        tags: ['Object'],
      },
    },
    {
      method: 'DELETE',
      path: '/buckets/:id/objects/:objectKey',
      handler: 'object.delete',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Delete an object',
        tags: ['Object'],
      },
    },
    {
      method: 'POST',
      path: '/buckets/:id/objects/delete-many',
      handler: 'object.deleteMany',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Delete multiple objects',
        tags: ['Object'],
      },
    },

    // ==========================================================================
    // Object Copy/Move
    // ==========================================================================
    {
      method: 'POST',
      path: '/buckets/:id/objects/copy',
      handler: 'object.copy',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Copy an object',
        tags: ['Object'],
      },
    },

    // ==========================================================================
    // Presigned URLs
    // ==========================================================================
    {
      method: 'POST',
      path: '/buckets/:id/presigned-url',
      handler: 'object.presignedUrl',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Generate a presigned URL for upload or download',
        tags: ['Object'],
      },
    },

    // ==========================================================================
    // Bucket Sync
    // ==========================================================================
    {
      method: 'POST',
      path: '/buckets/:id/sync',
      handler: 'bucket.sync',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
        description: 'Sync bucket metadata from Spomen',
        tags: ['Bucket'],
      },
    },
  ],
};
