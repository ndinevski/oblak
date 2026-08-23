import type { Core } from '@strapi/strapi';
import { recordAudit, type AuditResourceType } from './telemetry/audit';
import { startAlertEvaluator, stopAlertEvaluator } from './telemetry/alerting';
import { DEFAULT_ALERT_RULES } from './telemetry/default-alert-rules';
import { DEFAULT_MEMBER_GRANTS } from './identitet/authz';
import { apiKeyStrategy } from './identitet/credentials';

/**
 * Provisions Identitet fields on every existing user at boot, so access control does
 * not depend on each user logging in again first. The env-root is set to
 * 'root' and anyone else marked root is demoted; members with no grants yet get
 * the default set. Runs on every start and is cheap and idempotent.
 */
async function reconcileAllUsers(strapi: Core.Strapi): Promise<void> {
  const root = (process.env.OBLAK_ROOT_EMAIL ?? '').trim().toLowerCase();
  const users = await strapi.db
    .query('plugin::users-permissions.user')
    .findMany({ select: ['id', 'email', 'identitetRole', 'grants'] });

  for (const u of users) {
    const email = (u.email ?? '').trim().toLowerCase();
    const shouldBeRoot = root !== '' && email === root;
    const patch: Record<string, unknown> = {};

    const desiredRole = shouldBeRoot ? 'root' : u.identitetRole === 'root' ? 'member' : u.identitetRole ?? 'member';
    if (desiredRole !== u.identitetRole) patch.identitetRole = desiredRole;

    const hasGrants = u.grants && typeof u.grants === 'object' && Object.keys(u.grants).length > 0;
    if (!shouldBeRoot && !hasGrants) patch.grants = DEFAULT_MEMBER_GRANTS;

    if (Object.keys(patch).length > 0) {
      await strapi.db
        .query('plugin::users-permissions.user')
        .update({ where: { id: u.id }, data: patch });
    }
  }

  if (root === '') {
    strapi.log.warn(
      'OBLAK_ROOT_EMAIL is not set: no account has root access. Set it in .env and restart.',
    );
  }
}

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

/**
 * Seeds a starting set of alert rules.
 *
 * Runs only when there are no rules at all, so deleting a default rule makes it
 * stay deleted. The defaults carry no notification channel: a new install
 * should surface alerts in the dashboard, not start emailing someone.
 */
async function seedDefaultAlertRules(strapi: Core.Strapi): Promise<void> {
  // Idempotent by name: create any default rule that is not already present.
  // On a fresh install this seeds the whole set; on an upgrade it tops up rules
  // added since the last version (for example the Pristaniste/Tefter/Vrata rules)
  // without disturbing rules the operator has edited. A default the operator
  // deletes can reappear after an upgrade that ships new defaults; deleting it
  // again is a one-time cost, which is the price of getting new coverage
  // automatically.
  const existing = await strapi.db.query('api::alert-rule.alert-rule').findMany({});
  const existingNames = new Set(existing.map((r: { name: string }) => r.name));

  let created = 0;
  for (const rule of DEFAULT_ALERT_RULES) {
    if (existingNames.has(rule.name)) {
      continue;
    }
    await strapi.db.query('api::alert-rule.alert-rule').create({
      data: {
        ...rule,
        enabled: true,
        // Not evaluated yet, so showing them green would be a lie.
        state: 'unknown',
      },
    });
    created++;
  }

  if (created > 0) {
    strapi.log.info(`Seeded ${created} default alert rule(s)`);
  }
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
    'api::polaroid.polaroid.serverInfo',
    'api::polaroid.polaroid.serverPing',
    'api::polaroid.polaroid.getAssets',
    'api::polaroid.polaroid.getAsset',
    'api::polaroid.polaroid.uploadAsset',
    'api::polaroid.polaroid.deleteAssets',
    'api::polaroid.polaroid.updateAsset',
    'api::polaroid.polaroid.getAssetThumbnail',
    'api::polaroid.polaroid.downloadAsset',
    'api::polaroid.polaroid.getAssetStatistics',
    'api::polaroid.polaroid.checkExistingAssets',
    'api::polaroid.polaroid.getTimeBuckets',
    'api::polaroid.polaroid.getTimeBucket',
    'api::polaroid.polaroid.getAlbums',
    'api::polaroid.polaroid.getAlbum',
    'api::polaroid.polaroid.createAlbum',
    'api::polaroid.polaroid.updateAlbum',
    'api::polaroid.polaroid.deleteAlbum',
    'api::polaroid.polaroid.addAlbumAssets',
    'api::polaroid.polaroid.removeAlbumAssets',
    'api::polaroid.polaroid.getPeople',
    'api::polaroid.polaroid.getPerson',
    'api::polaroid.polaroid.updatePerson',
    'api::polaroid.polaroid.getPersonThumbnail',
    'api::polaroid.polaroid.mergePeople',
    'api::polaroid.polaroid.searchMetadata',
    'api::polaroid.polaroid.searchSmart',
    'api::polaroid.polaroid.getMapMarkers',
    'api::polaroid.polaroid.reverseGeocode',
    'api::polaroid.polaroid.getSharedLinks',
    'api::polaroid.polaroid.getSharedLink',
    'api::polaroid.polaroid.createSharedLink',
    'api::polaroid.polaroid.updateSharedLink',
    'api::polaroid.polaroid.deleteSharedLink',
    'api::polaroid.polaroid.getTags',
    'api::polaroid.polaroid.createTag',
    'api::polaroid.polaroid.updateTag',
    'api::polaroid.polaroid.deleteTag',
    'api::polaroid.polaroid.tagAssets',
    'api::polaroid.polaroid.untagAssets',
    'api::polaroid.polaroid.getApiKeys',
    'api::polaroid.polaroid.createApiKey',
    'api::polaroid.polaroid.deleteApiKey',
    'api::polaroid.polaroid.runJob',
    'api::polaroid.polaroid.restoreAssets',
    'api::virtual-machine.virtual-machine.console',
    'api::virtual-machine.virtual-machine.create',
    'api::virtual-machine.virtual-machine.createSnapshot',
    'api::virtual-machine.virtual-machine.delete',
    'api::virtual-machine.virtual-machine.deleteSnapshot',
    'api::virtual-machine.virtual-machine.find',
    'api::virtual-machine.virtual-machine.findOne',
    'api::virtual-machine.virtual-machine.listSnapshots',
    'api::virtual-machine.virtual-machine.pause',
    'api::virtual-machine.virtual-machine.reboot',
    'api::virtual-machine.virtual-machine.restoreSnapshot',
    'api::virtual-machine.virtual-machine.resume',
    'api::virtual-machine.virtual-machine.sizes',
    'api::virtual-machine.virtual-machine.start',
    'api::virtual-machine.virtual-machine.stats',
    'api::virtual-machine.virtual-machine.stop',
    'api::virtual-machine.virtual-machine.sync',
    'api::virtual-machine.virtual-machine.templates',
    'api::virtual-machine.virtual-machine.update',
    'api::quota.quota.getQuota',
    'api::quota.quota.getUsage',
    'api::quota.quota.getLimits',
    'api::telemetry.telemetry.health',
    'api::telemetry.telemetry.summary',
    'api::telemetry.telemetry.services',
    'api::telemetry.telemetry.serviceOverview',
    'api::telemetry.telemetry.serviceMap',
    'api::telemetry.telemetry.logs',
    'api::telemetry.telemetry.logHistogram',
    'api::telemetry.telemetry.logFields',
    'api::telemetry.telemetry.logFieldValues',
    'api::telemetry.telemetry.audit',
    'api::telemetry.telemetry.traces',
    'api::telemetry.telemetry.trace',
    'api::telemetry.telemetry.metrics',
    'api::telemetry.telemetry.metricQuery',
    'api::telemetry.telemetry.requestTimeseries',
    'api::telemetry.telemetry.endpoints',
    'api::telemetry.telemetry.containers',
    'api::telemetry.telemetry.storage',
    'api::alert-rule.alert-rule.types',
    'api::alert-rule.alert-rule.history',
    'api::alert-rule.alert-rule.evaluate',
    'api::alert-rule.alert-rule.test',
    'api::alert-rule.alert-rule.find',
    'api::alert-rule.alert-rule.findOne',
    'api::alert-rule.alert-rule.create',
    'api::alert-rule.alert-rule.update',
    'api::alert-rule.alert-rule.delete',
    'api::alert-rule.alert-rule.mute',
    'api::pristaniste.pristaniste.health',
    'api::pristaniste.pristaniste.registry',
    'api::pristaniste.pristaniste.listRepositories',
    'api::pristaniste.pristaniste.getRepository',
    'api::pristaniste.pristaniste.createRepository',
    'api::pristaniste.pristaniste.deleteRepository',
    'api::pristaniste.pristaniste.listImages',
    'api::pristaniste.pristaniste.deleteImage',
    'api::pristaniste.pristaniste.listContainers',
    'api::pristaniste.pristaniste.getContainer',
    'api::pristaniste.pristaniste.createContainer',
    'api::pristaniste.pristaniste.deleteContainer',
    'api::pristaniste.pristaniste.startContainer',
    'api::pristaniste.pristaniste.stopContainer',
    'api::pristaniste.pristaniste.restartContainer',
    'api::pristaniste.pristaniste.containerLogs',
    'api::pristaniste.pristaniste.containerStats',
    'api::tefter.tefter.health',
    'api::tefter.tefter.engines',
    'api::tefter.tefter.sizes',
    'api::tefter.tefter.listInstances',
    'api::tefter.tefter.getInstance',
    'api::tefter.tefter.createInstance',
    'api::tefter.tefter.deleteInstance',
    'api::tefter.tefter.startInstance',
    'api::tefter.tefter.stopInstance',
    'api::tefter.tefter.listReplicas',
    'api::tefter.tefter.createReplica',
    'api::tefter.tefter.replicationStatus',
    'api::tefter.tefter.promoteReplica',
    'api::tefter.tefter.listBackups',
    'api::tefter.tefter.listInstanceBackups',
    'api::tefter.tefter.createBackup',
    'api::tefter.tefter.getBackup',
    'api::tefter.tefter.deleteBackup',
    'api::tefter.tefter.restoreBackup',
    'api::vrata.vrata.health',
    'api::vrata.vrata.listRoutes',
    'api::vrata.vrata.getRoute',
    'api::vrata.vrata.createRoute',
    'api::vrata.vrata.deleteRoute',
    'api::indeks.indeks.health',
    'api::indeks.indeks.listTables',
    'api::indeks.indeks.getTable',
    'api::indeks.indeks.createTable',
    'api::indeks.indeks.deleteTable',
    'api::indeks.indeks.putItem',
    'api::indeks.indeks.getItem',
    'api::indeks.indeks.deleteItem',
    'api::indeks.indeks.query',
    'api::indeks.indeks.scan',
    'api::indeks.indeks.listBackups',
    'api::indeks.indeks.listTableBackups',
    'api::indeks.indeks.getBackup',
    'api::indeks.indeks.createBackup',
    'api::indeks.indeks.deleteBackup',
    'api::indeks.indeks.restoreBackup',
    'api::red.red.health',
    'api::red.red.listQueues',
    'api::red.red.getQueue',
    'api::red.red.createQueue',
    'api::red.red.updateQueue',
    'api::red.red.deleteQueue',
    'api::red.red.stats',
    'api::red.red.purge',
    'api::red.red.sendMessage',
    'api::red.red.receive',
    'api::red.red.deleteMessage',
    'api::red.red.listBackups',
    'api::red.red.listQueueBackups',
    'api::red.red.getBackup',
    'api::red.red.createBackup',
    'api::red.red.deleteBackup',
    'api::red.red.restoreBackup',
    'api::red.red.listSubscriptions',
    'api::red.red.createSubscription',
    'api::red.red.updateSubscription',
    'api::red.red.deleteSubscription',
    // Identitet: every authenticated user may call these; the controller restricts
    // management actions to the root account and `me` to the caller.
    'api::identitet.identitet.me',
    'api::identitet.identitet.services',
    'api::identitet.identitet.listUsers',
    'api::identitet.identitet.createUser',
    'api::identitet.identitet.updateUser',
    'api::identitet.identitet.deleteUser',
    'api::identitet.identitet.listKeys',
    'api::identitet.identitet.createKey',
    'api::identitet.identitet.deleteKey',
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

  // Demo activity is emitted as audit events so it lands in the telemetry
  // store alongside real activity. Unlike the old table-backed seed there is
  // nothing to count first: these records expire with the telemetry TTL, and
  // re-emitting them on each boot keeps the demo view populated.
  const activitySeeds: Array<{
    action: string;
    resourceType: AuditResourceType;
    resourceName: string;
  }> = [
    { action: 'user.login', resourceType: 'user', resourceName: DEMO_DEFAULTS.username },
    { action: 'function.create', resourceType: 'function', resourceName: 'demo-hello' },
    { action: 'vm.create', resourceType: 'virtual-machine', resourceName: 'demo-web-vm' },
    { action: 'bucket.create', resourceType: 'bucket', resourceName: 'demo-assets' },
    { action: 'polaroid.upload', resourceType: 'polaroid', resourceName: 'photo-upload' },
    { action: 'function.invoke', resourceType: 'function', resourceName: 'demo-hello' },
  ];

  for (const seed of activitySeeds) {
    recordAudit({
      ...seed,
      userId: ownerId,
      status: 'success',
      details: { source: 'bootstrap-seed' },
    });
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
  register({ strapi }: { strapi: Core.Strapi }) {
    // Register the API-key auth strategy alongside the users-permissions JWT
    // strategy, so a request bearing an `oblak_...` key authenticates as the
    // key's owner. Registered here (register phase) so it is in place before
    // any request is routed.
    try {
      strapi.get('auth').register('content-api', apiKeyStrategy(strapi));
    } catch (error) {
      strapi.log.error('Could not register the API-key auth strategy:', error);
    }
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

    try {
      await seedDefaultAlertRules(strapi);
    } catch (error) {
      strapi.log.warn('Could not seed default alert rules:', error);
    }

    try {
      await reconcileAllUsers(strapi);
    } catch (error) {
      strapi.log.warn('Could not reconcile Identitet roles:', error);
    }

    // Alert evaluation runs on a timer rather than per-request. Started last so
    // a failure here cannot stop the rest of bootstrap.
    try {
      startAlertEvaluator(strapi);
    } catch (error) {
      strapi.log.error('Could not start the alert evaluator:', error);
    }
  },

  /**
   * Called on shutdown, including every dev-mode reload.
   */
  destroy() {
    // Stop the evaluator before the connection pool closes, or a tick already
    // scheduled fires against a dead pool.
    stopAlertEvaluator();
  },
};
