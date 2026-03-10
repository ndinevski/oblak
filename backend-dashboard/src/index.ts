import type { Core } from '@strapi/strapi';

const DEMO_DEFAULTS = {
  username: process.env.SEED_DEMO_USERNAME || 'demo',
  email: process.env.SEED_DEMO_EMAIL || 'demo@oblak.local',
  password: process.env.SEED_DEMO_PASSWORD || 'DemoPass123!',
  organization: process.env.SEED_DEMO_ORGANIZATION || 'Oblak Demo',
};

function shouldSeedDemoData(): boolean {
  if (process.env.SEED_DEMO_DATA === 'false') {
    return false;
  }

  if (process.env.SEED_DEMO_DATA === 'true') {
    return true;
  }

  return process.env.NODE_ENV !== 'production';
}

const ACTIVITY_CLEANUP_TIMER_SYMBOL = Symbol.for('__oblakActivityCleanupTimer__');

async function setupActivityLogRetentionCleanup(strapi: Core.Strapi): Promise<void> {
  const intervalMinutes = Math.max(
    5,
    Math.trunc(Number(process.env.ACTIVITY_LOG_CLEANUP_INTERVAL_MINUTES || 60))
  );
  const intervalMs = intervalMinutes * 60 * 1000;

  const runCleanup = async () => {
    try {
      const result = await strapi.service('api::activity-log.activity-log').runRetentionCleanup();
      strapi.log.debug(
        `Activity retention cleanup completed (retentionDays=${result.retentionDays}, deleted=${result.deleted})`
      );
    } catch (error) {
      strapi.log.error('Activity retention cleanup failed:', error);
    }
  };

  await runCleanup();

  const globalWithTimer = globalThis as typeof globalThis & {
    [ACTIVITY_CLEANUP_TIMER_SYMBOL]?: NodeJS.Timeout;
  };

  if (globalWithTimer[ACTIVITY_CLEANUP_TIMER_SYMBOL]) {
    clearInterval(globalWithTimer[ACTIVITY_CLEANUP_TIMER_SYMBOL]);
  }

  globalWithTimer[ACTIVITY_CLEANUP_TIMER_SYMBOL] = setInterval(() => {
    void runCleanup();
  }, intervalMs);
}

async function ensureAuthenticatedPermissions(strapi: Core.Strapi): Promise<void> {
  const authenticatedRole = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: 'authenticated' },
  });

  if (!authenticatedRole) {
    return;
  }

  const requiredActions = [
    'api::function.function.find',
    'api::function.function.findOne',
    'api::function.function.findByName',
    'api::function.function.create',
    'api::function.function.update',
    'api::function.function.delete',
    'api::function.function.invoke',
    'api::function.function.logs',
    'api::activity-log.activity-log.find',
    'api::activity-log.activity-log.findOne',
    'api::activity-log.activity-log.summary',
    'api::activity-log.activity-log.retention',
    'api::activity-log.activity-log.updateRetention',
    'api::bucket.bucket.find',
    'api::bucket.bucket.findOne',
    'api::bucket.bucket.create',
    'api::bucket.bucket.update',
    'api::bucket.bucket.delete',
    'api::bucket.bucket.stats',
    'api::bucket.bucket.sync',
    'api::bucket.bucket.quota',
    'api::bucket.object.list',
    'api::bucket.object.get',
    'api::bucket.object.upload',
    'api::bucket.object.delete',
    'api::bucket.object.deleteMany',
    'api::bucket.object.deleteFolder',
    'api::bucket.object.copy',
    'api::bucket.object.presignedUrl',
  ];

  for (const action of requiredActions) {
    const existingPermission = await strapi.db.query('plugin::users-permissions.permission').findOne({
      where: {
        action,
        role: authenticatedRole.id,
      },
    });

    if (existingPermission) {
      if (!existingPermission.enabled) {
        await strapi.db.query('plugin::users-permissions.permission').update({
          where: { id: existingPermission.id },
          data: { enabled: true },
        });
      }
      continue;
    }

    await strapi.db.query('plugin::users-permissions.permission').create({
      data: {
        action,
        role: authenticatedRole.id,
        enabled: true,
      },
    });
  }
}

async function ensurePublicInvokePermission(strapi: Core.Strapi): Promise<void> {
  const publicRole = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: 'public' },
  });

  if (!publicRole) {
    return;
  }

  const requiredActions = [
    'api::function.function.invoke',
    'api::function.function.invocationReport',
  ];

  for (const action of requiredActions) {
    const existingPermission = await strapi.db.query('plugin::users-permissions.permission').findOne({
      where: {
        action,
        role: publicRole.id,
      },
    });

    if (existingPermission) {
      if (!existingPermission.enabled) {
        await strapi.db.query('plugin::users-permissions.permission').update({
          where: { id: existingPermission.id },
          data: { enabled: true },
        });
      }
      continue;
    }

    await strapi.db.query('plugin::users-permissions.permission').create({
      data: {
        action,
        role: publicRole.id,
        enabled: true,
      },
    });
  }
}

async function seedDemoData(strapi: Core.Strapi): Promise<void> {
  const authenticatedRole = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: 'authenticated' },
  });

  if (!authenticatedRole) {
    strapi.log.warn('Skipping demo seed: authenticated role not found.');
    return;
  }

  const userService = strapi.plugin('users-permissions').service('user');

  let demoUser = await strapi.db.query('plugin::users-permissions.user').findOne({
    where: { email: DEMO_DEFAULTS.email },
  });

  if (!demoUser) {
    demoUser = await userService.add({
      username: DEMO_DEFAULTS.username,
      email: DEMO_DEFAULTS.email,
      password: DEMO_DEFAULTS.password,
      provider: 'local',
      confirmed: true,
      blocked: false,
      role: authenticatedRole.id,
      organization: DEMO_DEFAULTS.organization,
      quotas: {
        maxFunctions: 20,
        maxVMs: 10,
        maxBuckets: 20,
        maxStorageGB: 100,
      },
    });

    strapi.log.info(`Created demo user: ${DEMO_DEFAULTS.email}`);
  } else {
    await strapi.db.query('plugin::users-permissions.user').update({
      where: { id: demoUser.id },
      data: {
        blocked: false,
        confirmed: true,
        role: authenticatedRole.id,
        organization: DEMO_DEFAULTS.organization,
      },
    });

    if (process.env.SEED_RESET_DEMO_PASSWORD === 'true') {
      await userService.edit(demoUser.id, { password: DEMO_DEFAULTS.password });
      strapi.log.info(`Reset demo user password: ${DEMO_DEFAULTS.email}`);
    }

    strapi.log.info(`Reusing existing demo user: ${DEMO_DEFAULTS.email}`);
  }

  const ownerId = demoUser.id;

  const functionSeeds = [
    {
      name: 'demo-hello',
      description: 'Returns a hello message for demo usage.',
      runtime: 'nodejs20',
      handler: 'index.handler',
      code: "exports.handler = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'Hello from demo function!' }) });",
      memoryMB: 128,
      timeoutSec: 15,
      status: 'active',
      invocationCount: '42',
      environment: { STAGE: 'demo' },
      tags: ['demo', 'starter'],
    },
    {
      name: 'demo-image-resize',
      description: 'Simulates image resize processing.',
      runtime: 'python312',
      handler: 'index.handler',
      code: 'def handler(event, context):\n    return {"ok": True, "operation": "resize", "event": event}',
      memoryMB: 256,
      timeoutSec: 30,
      status: 'inactive',
      invocationCount: '7',
      environment: { BUCKET: 'demo-uploads' },
      tags: ['demo', 'image'],
    },
  ];

  for (const seed of functionSeeds) {
    const existing = await strapi.db.query('api::function.function').findOne({
      where: { name: seed.name },
    });

    if (!existing) {
      await strapi.db.query('api::function.function').create({
        data: {
          ...seed,
          owner: ownerId,
        },
      });
    }
  }

  const vmSeeds = [
    {
      name: 'demo-web-vm',
      description: 'Ubuntu VM serving a sample web app.',
      status: 'running',
      template: 'ubuntu-22.04',
      osType: 'linux',
      size: 'small',
      cores: 2,
      memoryMB: 4096,
      diskGB: 40,
      ipAddress: '10.10.0.21',
      network: 'vmbr0',
      tags: ['demo', 'web'],
      metadata: { cpuUsage: 14, memoryUsed: 1800, diskUsed: 12, uptime: 86400 },
    },
    {
      name: 'demo-worker-vm',
      description: 'Background processing worker VM.',
      status: 'stopped',
      template: 'debian-12',
      osType: 'linux',
      size: 'medium',
      cores: 4,
      memoryMB: 8192,
      diskGB: 80,
      network: 'vmbr0',
      tags: ['demo', 'worker'],
      metadata: { cpuUsage: 0, memoryUsed: 0, diskUsed: 18, uptime: 0 },
    },
  ];

  for (const seed of vmSeeds) {
    const existing = await strapi.db.query('api::virtual-machine.virtual-machine').findOne({
      where: {
        owner: ownerId,
        name: seed.name,
      },
    });

    if (!existing) {
      await strapi.db.query('api::virtual-machine.virtual-machine').create({
        data: {
          ...seed,
          owner: ownerId,
        },
      });
    }
  }

  const bucketSeeds = [
    {
      name: 'demo-assets',
      description: 'Public static assets for demo apps.',
      policy: 'public-read',
      versioning: true,
      objectCount: '128',
      totalSize: '73400320',
      tags: { project: 'demo', tier: 'public' },
    },
    {
      name: 'demo-backups',
      description: 'Private backup snapshots and archives.',
      policy: 'private',
      versioning: true,
      objectCount: '16',
      totalSize: '214748364',
      tags: { project: 'demo', tier: 'backup' },
    },
  ];

  for (const seed of bucketSeeds) {
    const existing = await strapi.db.query('api::bucket.bucket').findOne({
      where: { name: seed.name },
    });

    if (!existing) {
      await strapi.db.query('api::bucket.bucket').create({
        data: {
          ...seed,
          owner: ownerId,
        },
      });
    }
  }

  const activityCount = await strapi.db.query('api::activity-log.activity-log').count({
    where: { user: ownerId },
  });

  if (activityCount === 0) {
    const activitySeeds = [
      {
        action: 'user.login',
        resourceType: 'user',
        resourceName: DEMO_DEFAULTS.username,
        status: 'success',
      },
      {
        action: 'function.create',
        resourceType: 'function',
        resourceName: 'demo-hello',
        status: 'success',
      },
      {
        action: 'vm.create',
        resourceType: 'virtual-machine',
        resourceName: 'demo-web-vm',
        status: 'success',
      },
      {
        action: 'bucket.create',
        resourceType: 'bucket',
        resourceName: 'demo-assets',
        status: 'success',
      },
      {
        action: 'function.invoke',
        resourceType: 'function',
        resourceName: 'demo-hello',
        status: 'success',
      },
      {
        action: 'function.invoke',
        resourceType: 'function',
        resourceName: 'demo-hello',
        status: 'success',
      },
    ];

    for (const seed of activitySeeds) {
      await strapi.db.query('api::activity-log.activity-log').create({
        data: {
          ...seed,
          user: ownerId,
          details: {
            source: 'bootstrap-seed',
          },
        },
      });
    }
  }

  strapi.log.info(
    `Demo seed ready. Login with ${DEMO_DEFAULTS.email} / ${DEMO_DEFAULTS.password}`
  );
}

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {
    // Register custom services, hooks, etc.
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const contentApiSymbol = Symbol.for('__type__');

    // Ensure custom controller actions are marked as content-api
    // so Users & Permissions can list them under Roles.
    Object.values(strapi.apis).forEach((api: any) => {
      Object.values(api.controllers || {}).forEach((controller: any) => {
        Object.entries(controller || {}).forEach(([_, action]) => {
          if (typeof action === 'function') {
            const existing = (action as any)[contentApiSymbol];
            if (Array.isArray(existing)) {
              if (!existing.includes('content-api')) {
                existing.push('content-api');
              }
            } else {
              (action as any)[contentApiSymbol] = ['content-api'];
            }
          }
        });
      });
    });

    try {
      await ensureAuthenticatedPermissions(strapi);
    } catch (error) {
      strapi.log.warn('Failed to ensure authenticated API permissions:', error);
    }

    try {
      await ensurePublicInvokePermission(strapi);
    } catch (error) {
      strapi.log.warn('Failed to ensure public invoke permission:', error);
    }

    if (shouldSeedDemoData()) {
      try {
        await seedDemoData(strapi);
      } catch (error) {
        strapi.log.error('Demo seed failed:', error);
      }
    }

    await setupActivityLogRetentionCleanup(strapi);
  },
};
