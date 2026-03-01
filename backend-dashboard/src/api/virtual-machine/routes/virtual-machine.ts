/**
 * Virtual Machine routes configuration
 * Defines API routes for VM operations including CRUD and actions
 */

export default {
  routes: [
    // Standard CRUD routes
    {
      method: 'GET',
      path: '/virtual-machines',
      handler: 'virtual-machine.find',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/virtual-machines/:id',
      handler: 'virtual-machine.findOne',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines',
      handler: 'virtual-machine.create',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/virtual-machines/:id',
      handler: 'virtual-machine.update',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/virtual-machines/:id',
      handler: 'virtual-machine.delete',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // VM actions
    {
      method: 'POST',
      path: '/virtual-machines/:id/start',
      handler: 'virtual-machine.start',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines/:id/stop',
      handler: 'virtual-machine.stop',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines/:id/reboot',
      handler: 'virtual-machine.reboot',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines/:id/pause',
      handler: 'virtual-machine.pause',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines/:id/resume',
      handler: 'virtual-machine.resume',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // Console access
    {
      method: 'GET',
      path: '/virtual-machines/:id/console',
      handler: 'virtual-machine.console',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // VM stats
    {
      method: 'GET',
      path: '/virtual-machines/:id/stats',
      handler: 'virtual-machine.stats',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // Snapshots
    {
      method: 'GET',
      path: '/virtual-machines/:id/snapshots',
      handler: 'virtual-machine.listSnapshots',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines/:id/snapshots',
      handler: 'virtual-machine.createSnapshot',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines/:id/snapshots/:snapshotName/restore',
      handler: 'virtual-machine.restoreSnapshot',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/virtual-machines/:id/snapshots/:snapshotName',
      handler: 'virtual-machine.deleteSnapshot',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // Templates and sizes
    {
      method: 'GET',
      path: '/virtual-machines/templates',
      handler: 'virtual-machine.templates',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/virtual-machines/sizes',
      handler: 'virtual-machine.sizes',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
    // Sync with Izvor
    {
      method: 'POST',
      path: '/virtual-machines/:id/sync',
      handler: 'virtual-machine.sync',
      info: { type: 'content-api' },
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
