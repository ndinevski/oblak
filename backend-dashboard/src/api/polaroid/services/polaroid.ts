import { randomBytes } from 'crypto';
import {
  createImmichClient,
  ImmichClient,
  ImmichClientError,
  type ImmichAssetsParams,
  type ImmichTimeBucketsParams,
  type ImmichTimeBucketParams,
  type ImmichCreateAlbumRequest,
  type ImmichUpdateAlbumRequest,
  type ImmichUpdateAssetRequest,
  type ImmichPeopleParams,
  type ImmichUpdatePersonRequest,
  type ImmichSearchMetadataRequest,
  type ImmichMapMarkersParams,
  type ImmichCreateSharedLinkRequest,
  type ImmichUpdateSharedLinkRequest,
  type ImmichCreateTagRequest,
  type ImmichUpdateTagRequest,
  type ImmichReassignFacesRequest,
} from './immich-client';

const IMMICH_BASE_URL = process.env.POLAROID_URL || 'http://localhost:2283';

function getAdminClient(): ImmichClient {
  const apiKey = process.env.POLAROID_API_KEY || '';
  return createImmichClient({ baseUrl: IMMICH_BASE_URL, apiKey });
}

const userClientCache = new Map<number, ImmichClient>();

// Debounced ML job trigger — safety net for Immich versions that don't auto-process
// on external API uploads. Debounces so batch uploads trigger only once.
const ML_JOBS = [
  'thumbnailGeneration',
  'metadataExtraction',
  'smartSearch',
  'faceDetection',
  'facialRecognition',
] as const;

let mlJobTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleMLJobs(strapi: Strapi.Strapi): void {
  if (mlJobTimer) clearTimeout(mlJobTimer);
  mlJobTimer = setTimeout(async () => {
    mlJobTimer = null;
    try {
      const adminClient = getAdminClient();
      await Promise.allSettled(
        ML_JOBS.map((job) => adminClient.runJob(job, 'start')),
      );
    } catch (err) {
      strapi.log.error('Polaroid: failed to trigger ML jobs after upload', err);
    }
  }, 2000);
}

export default ({ strapi }: { strapi: Strapi.Strapi }) => {
  async function provisionImmichUser(
    strapiUser: { email: string; username?: string | null },
    existing?: { immichUserId?: string | null } | null,
  ) {
    const adminClient = getAdminClient();
    const password = randomBytes(32).toString('hex');
    const name = strapiUser.username || strapiUser.email;

    if (existing?.immichUserId && existing.immichUserId !== 'demo-immich-user') {
      try {
        const immichUser = await adminClient.updateAdminUser(existing.immichUserId, {
          email: strapiUser.email,
          name,
          password,
          shouldChangePassword: false,
        });

        return { immichUserId: immichUser.id, password };
      } catch (error) {
        if (!(error instanceof ImmichClientError) || error.statusCode !== 404) {
          throw error;
        }
      }
    }

    try {
      const immichUser = await adminClient.adminCreateUser({
        email: strapiUser.email,
        password,
        name,
        shouldChangePassword: false,
      });

      return { immichUserId: immichUser.id, password };
    } catch (error) {
      if (!(error instanceof ImmichClientError) || error.statusCode !== 409) {
        throw error;
      }

      const users = await adminClient.getAdminUsers();
      const existingUser = users.find(
        (user) => user.email.toLowerCase() === strapiUser.email.toLowerCase(),
      );

      if (!existingUser) {
        throw error;
      }

      const immichUser = await adminClient.updateAdminUser(existingUser.id, {
        email: strapiUser.email,
        name,
        password,
        shouldChangePassword: false,
      });

      return { immichUserId: immichUser.id, password };
    }
  }

  async function createUserApiKey(email: string, password: string) {
    const adminClient = getAdminClient();
    const loginResponse = await adminClient.loginUser(email, password);
    const apiKey = await adminClient.createApiKeyWithToken(
      loginResponse.accessToken,
      'oblak-dashboard',
    );

    return { apiKey: apiKey.secret, userId: loginResponse.userId };
  }

  async function findOrCreateInstance(userId: number) {
    const existing = await strapi.db.query('api::polaroid.polaroid').findOne({
      where: { owner: userId },
    });

    if (existing && existing.apiKey) {
      return existing;
    }

    const strapiUser = await strapi.db
      .query('plugin::users-permissions.user')
      .findOne({ where: { id: userId } });

    if (!strapiUser?.email) {
      throw new Error(`Polaroid provisioning failed: user ${userId} was not found`);
    }

    const provisionedUser = await provisionImmichUser(strapiUser, existing);
    const userApiKey = await createUserApiKey(
      strapiUser.email,
      provisionedUser.password,
    );

    const data = {
      immichUserId: provisionedUser.immichUserId || userApiKey.userId,
      immichUserEmail: strapiUser.email,
      immichUserPassword: provisionedUser.password,
      apiKey: userApiKey.apiKey,
      owner: userId,
    };

    if (existing) {
      return strapi.db.query('api::polaroid.polaroid').update({
        where: { id: existing.id },
        data,
      });
    }

    return strapi.db.query('api::polaroid.polaroid').create({
      data,
    });
  }

  async function getUserClient(userId: number): Promise<ImmichClient> {
    const cached = userClientCache.get(userId);
    if (cached) return cached;

    const instance = await findOrCreateInstance(userId);
    const client = createImmichClient({ baseUrl: IMMICH_BASE_URL, apiKey: instance.apiKey });

    try {
      await client.getMyUser();
    } catch (error) {
      if (
        error instanceof ImmichClientError &&
        (error.statusCode === 401 || error.statusCode === 403)
      ) {
        await strapi.db.query('api::polaroid.polaroid').update({
          where: { id: instance.id },
          data: { apiKey: null },
        });

        const reprovisioned = await findOrCreateInstance(userId);
        const repairedClient = createImmichClient({
          baseUrl: IMMICH_BASE_URL,
          apiKey: reprovisioned.apiKey,
        });

        await repairedClient.getMyUser();
        userClientCache.set(userId, repairedClient);
        return repairedClient;
      }

      throw error;
    }

    userClientCache.set(userId, client);
    return client;
  }

  return {
    findOrCreateInstance,

    async getServerInfo(userId: number) {
      const client = await getUserClient(userId);
      const stats = await client.getAssetStatistics();
      return {
        photos: stats.images,
        videos: stats.videos,
        usage: 0, // per-user usage not available from this endpoint
        usageByUser: [],
      };
    },

    async serverPing(userId: number) {
      const client = await getUserClient(userId);
      return client.ping();
    },

    async getAssets(userId: number, params: ImmichAssetsParams) {
      const client = await getUserClient(userId);
      return client.getAssets(params);
    },

    async getAssetInfo(userId: number, assetId: string) {
      const client = await getUserClient(userId);
      return client.getAssetInfo(assetId);
    },

    async uploadAsset(userId: number, file: { filepath: string; originalFilename: string; mimetype: string }) {
      const client = await getUserClient(userId);
      const result = await client.uploadAsset(file);
      scheduleMLJobs(strapi);
      return result;
    },

    async updateAsset(userId: number, assetId: string, data: ImmichUpdateAssetRequest) {
      const client = await getUserClient(userId);
      return client.updateAsset(assetId, data);
    },

    async deleteAssets(userId: number, ids: string[], force?: boolean) {
      const client = await getUserClient(userId);
      return client.deleteAssets(ids, force);
    },

    async getAssetThumbnail(userId: number, assetId: string, size?: 'thumbnail' | 'preview') {
      const client = await getUserClient(userId);
      return client.getAssetThumbnail(assetId, size);
    },

    async downloadAsset(userId: number, assetId: string) {
      const client = await getUserClient(userId);
      return client.downloadAsset(assetId);
    },

    async getStatistics(userId: number) {
      const client = await getUserClient(userId);
      return client.getAssetStatistics();
    },

    async checkExistingAssets(userId: number, deviceAssetIds: string[], deviceId: string) {
      const client = await getUserClient(userId);
      return client.checkExistingAssets(deviceAssetIds, deviceId);
    },

    async getTimeline(userId: number, params: ImmichTimeBucketsParams) {
      const client = await getUserClient(userId);
      return client.getTimeBuckets(params);
    },

    async getTimeBucket(userId: number, params: ImmichTimeBucketParams) {
      const client = await getUserClient(userId);
      return client.getTimeBucket(params);
    },

    async getAlbums(userId: number, shared?: boolean) {
      const client = await getUserClient(userId);
      return client.getAlbums(shared);
    },

    async getAlbum(userId: number, albumId: string) {
      const client = await getUserClient(userId);
      return client.getAlbum(albumId);
    },

    async createAlbum(userId: number, data: ImmichCreateAlbumRequest) {
      const client = await getUserClient(userId);
      return client.createAlbum(data);
    },

    async updateAlbum(userId: number, albumId: string, data: ImmichUpdateAlbumRequest) {
      const client = await getUserClient(userId);
      return client.updateAlbum(albumId, data);
    },

    async deleteAlbum(userId: number, albumId: string) {
      const client = await getUserClient(userId);
      return client.deleteAlbum(albumId);
    },

    async addAssetsToAlbum(userId: number, albumId: string, assetIds: string[]) {
      const client = await getUserClient(userId);
      return client.addAssetsToAlbum(albumId, assetIds);
    },

    async removeAssetsFromAlbum(userId: number, albumId: string, assetIds: string[]) {
      const client = await getUserClient(userId);
      return client.removeAssetsFromAlbum(albumId, assetIds);
    },

    async getPeople(userId: number, params?: ImmichPeopleParams) {
      const client = await getUserClient(userId);
      return client.getPeople(params);
    },

    async getPerson(userId: number, personId: string) {
      const client = await getUserClient(userId);
      return client.getPerson(personId);
    },

    async updatePerson(userId: number, personId: string, data: ImmichUpdatePersonRequest) {
      const client = await getUserClient(userId);
      return client.updatePerson(personId, data);
    },

    async getPersonThumbnail(userId: number, personId: string) {
      const client = await getUserClient(userId);
      return client.getPersonThumbnail(personId);
    },

    async mergePeople(userId: number, personId: string, mergeIds: string[]) {
      const client = await getUserClient(userId);
      return client.mergePeople(personId, mergeIds);
    },

    async reassignFaces(userId: number, personId: string, data: ImmichReassignFacesRequest) {
      const client = await getUserClient(userId);
      return client.reassignFaces(personId, data);
    },

    async searchAssets(userId: number, query: ImmichSearchMetadataRequest) {
      const client = await getUserClient(userId);
      return client.searchAssets(query);
    },

    async searchSmart(userId: number, query: string, params?: Record<string, unknown>) {
      const client = await getUserClient(userId);
      return client.searchSmart(query, params as Parameters<typeof client.searchSmart>[1]);
    },

    async getMapMarkers(userId: number, params?: ImmichMapMarkersParams) {
      const client = await getUserClient(userId);
      return client.getMapMarkers(params);
    },

    async reverseGeocode(userId: number, lat: number, lng: number) {
      const client = await getUserClient(userId);
      return client.reverseGeocode(lat, lng);
    },

    async getSharedLinks(userId: number) {
      const client = await getUserClient(userId);
      return client.getSharedLinks();
    },

    async getSharedLink(userId: number, linkId: string) {
      const client = await getUserClient(userId);
      return client.getSharedLink(linkId);
    },

    async createSharedLink(userId: number, data: ImmichCreateSharedLinkRequest) {
      const client = await getUserClient(userId);
      return client.createSharedLink(data);
    },

    async updateSharedLink(userId: number, linkId: string, data: ImmichUpdateSharedLinkRequest) {
      const client = await getUserClient(userId);
      return client.updateSharedLink(linkId, data);
    },

    async deleteSharedLink(userId: number, linkId: string) {
      const client = await getUserClient(userId);
      return client.deleteSharedLink(linkId);
    },

    async getTags(userId: number) {
      const client = await getUserClient(userId);
      return client.getTags();
    },

    async createTag(userId: number, data: ImmichCreateTagRequest) {
      const client = await getUserClient(userId);
      return client.createTag(data);
    },

    async updateTag(userId: number, tagId: string, data: ImmichUpdateTagRequest) {
      const client = await getUserClient(userId);
      return client.updateTag(tagId, data);
    },

    async deleteTag(userId: number, tagId: string) {
      const client = await getUserClient(userId);
      return client.deleteTag(tagId);
    },

    async tagAssets(userId: number, tagId: string, assetIds: string[]) {
      const client = await getUserClient(userId);
      return client.tagAssets(tagId, assetIds);
    },

    async untagAssets(userId: number, tagId: string, assetIds: string[]) {
      const client = await getUserClient(userId);
      return client.untagAssets(tagId, assetIds);
    },

    async getApiKeys(userId: number) {
      const client = await getUserClient(userId);
      return client.getApiKeys();
    },

    async createApiKey(userId: number, name: string) {
      const client = await getUserClient(userId);
      return client.createApiKey(name);
    },

    async deleteApiKey(userId: number, keyId: string) {
      const client = await getUserClient(userId);
      return client.deleteApiKey(keyId);
    },

    async runJob(userId: number, jobName: string, command: 'start' | 'pause' | 'resume' | 'empty') {
      const client = getAdminClient();
      return client.runJob(jobName, command);
    },

    async restoreAssets(userId: number, assetIds: string[]) {
      const client = await getUserClient(userId);
      return client.restoreAssets(assetIds);
    },

    // =========================================================================
    // Public Shared Links (no user auth required)
    // =========================================================================

    async getSharedLinkByKey(key: string, password?: string) {
      const client = getAdminClient();
      return client.getSharedLinkByKey(key, password);
    },

    async getSharedLinkAssetThumbnail(key: string, assetId: string, size?: 'thumbnail' | 'preview', password?: string) {
      const client = getAdminClient();
      return client.getSharedLinkAssetThumbnail(key, assetId, size, password);
    },

    async getSharedLinkAssetOriginal(key: string, assetId: string, password?: string) {
      const client = getAdminClient();
      return client.getSharedLinkAssetOriginal(key, assetId, password);
    },
  };
};
