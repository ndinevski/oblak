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
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/virtual-machines/:id',
      handler: 'virtual-machine.findOne',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines',
      handler: 'virtual-machine.create',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/virtual-machines/:id',
      handler: 'virtual-machine.update',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/virtual-machines/:id',
      handler: 'virtual-machine.delete',
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
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines/:id/stop',
      handler: 'virtual-machine.stop',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines/:id/reboot',
      handler: 'virtual-machine.reboot',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines/:id/pause',
      handler: 'virtual-machine.pause',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines/:id/resume',
      handler: 'virtual-machine.resume',
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
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines/:id/snapshots',
      handler: 'virtual-machine.createSnapshot',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/virtual-machines/:id/snapshots/:snapshotName/restore',
      handler: 'virtual-machine.restoreSnapshot',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/virtual-machines/:id/snapshots/:snapshotName',
      handler: 'virtual-machine.deleteSnapshot',
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
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/virtual-machines/sizes',
      handler: 'virtual-machine.sizes',
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
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
