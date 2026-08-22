import type { Core } from '@strapi/strapi';
import { ImmichClientError } from '../services/immich-client';

// =============================================================================
// Types
// =============================================================================

interface UploadedFile {
  size: number;
  filepath: string;
  newFilename: string;
  mimetype: string;
  originalFilename?: string;
  lastModifiedDate?: Date;
}

interface Context {
  state: {
    user?: { id: number };
  };
  request: {
    body?: unknown;
    query?: Record<string, unknown>;
    files?: Record<string, UploadedFile | UploadedFile[]>;
  };
  params: Record<string, string>;
  query: Record<string, unknown>;
  throw: (status: number, message: string) => never;
  body: unknown;
  status: number;
  set: (header: string, value: string) => void;
}

function getAuthenticatedUser(ctx: Context): { id: number } {
  if (!ctx.state.user) {
    ctx.throw(401, 'Authentication required');
  }
  return ctx.state.user;
}

function handleError(ctx: Context, error: unknown): void {
  if (error instanceof ImmichClientError) {
    ctx.status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502;
    ctx.body = { error: { message: error.message } };
    return;
  }

  if (error instanceof Error) {
    if (error.message.includes('not found')) {
      ctx.status = 404;
    } else {
      ctx.status = 400;
    }
    ctx.body = { error: { message: error.message } };
    return;
  }

  ctx.status = 500;
  ctx.body = { error: { message: 'Internal server error' } };
}

export default ({ strapi }: { strapi: Core.Strapi }) => {
  async function logPolaroidActivity(
    action: string,
    userId: number,
    details?: Record<string, unknown>,
    resourceName?: string
  ) {
    try {
      const activityService = strapi.service('api::activity-log.activity-log');
      if (activityService && typeof activityService.log === 'function') {
        await activityService.log({
          action,
          resourceType: 'polaroid',
          userId,
          details,
          resourceName,
          status: 'success',
        });
      }
    } catch {
      // Don't let activity logging break the main flow
    }
  }

  return {
  // ===========================================================================
  // Server
  // ===========================================================================

  async serverInfo(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getServerInfo(user.id);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async serverPing(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.serverPing(user.id);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Assets
  // ===========================================================================

  async getAssets(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getAssets(user.id, ctx.query);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async getAsset(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getAssetInfo(user.id, ctx.params.assetId);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async uploadAsset(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      // Strapi (koa-body) parses multipart uploads into ctx.request.files
      const files = ctx.request.files;
      const fileField = files?.assetData;
      const file = Array.isArray(fileField) ? fileField[0] : fileField;

      if (!file) {
        ctx.throw(400, 'No file provided. Send file as "assetData" field in multipart/form-data.');
      }

      const service = strapi.service('api::polaroid.polaroid');
      ctx.status = 201;
      const result = await service.uploadAsset(user.id, {
        filepath: file.filepath,
        originalFilename: file.originalFilename || file.newFilename,
        mimetype: file.mimetype,
      });
      await logPolaroidActivity('polaroid.upload', user.id, { filename: file.originalFilename || file.newFilename }, file.originalFilename || file.newFilename);
      ctx.body = result;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async deleteAssets(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const raw = ctx.request.body as Record<string, unknown>;
      const payload = (raw?.data ?? raw) as { ids: string[]; force?: boolean };
      const service = strapi.service('api::polaroid.polaroid');
      await service.deleteAssets(user.id, payload.ids, payload.force);
      await logPolaroidActivity('polaroid.delete', user.id, { ids: payload.ids, force: payload.force });
      ctx.status = 204;
      ctx.body = null;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async updateAsset(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      const result = await service.updateAsset(user.id, ctx.params.assetId, ctx.request.body as Parameters<typeof service.updateAsset>[2]);
      await logPolaroidActivity('polaroid.asset.update', user.id, { assetId: ctx.params.assetId });
      ctx.body = result;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async getAssetThumbnail(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      const size = ctx.query.size as 'thumbnail' | 'preview' | undefined;
      const response = await service.getAssetThumbnail(user.id, ctx.params.assetId, size);
      const fetchResp = response as Response;
      ctx.status = fetchResp.status;
      ctx.set('content-type', fetchResp.headers.get('content-type') || 'application/octet-stream');
      const arrayBuffer = await fetchResp.arrayBuffer();
      ctx.body = Buffer.from(arrayBuffer);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async downloadAsset(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      const response = await service.downloadAsset(user.id, ctx.params.assetId);
      const fetchResp = response as Response;
      ctx.status = fetchResp.status;
      ctx.set('content-type', fetchResp.headers.get('content-type') || 'application/octet-stream');
      const cd = fetchResp.headers.get('content-disposition');
      if (cd) {
        ctx.set('content-disposition', cd);
      }
      const arrayBuffer = await fetchResp.arrayBuffer();
      ctx.body = Buffer.from(arrayBuffer);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async getAssetStatistics(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getStatistics(user.id);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async checkExistingAssets(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const body = ctx.request.body as { deviceAssetIds: string[]; deviceId: string };
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.checkExistingAssets(user.id, body.deviceAssetIds, body.deviceId);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Timeline
  // ===========================================================================

  async getTimeBuckets(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getTimeline(user.id, ctx.query as Parameters<typeof service.getTimeline>[1]);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async getTimeBucket(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getTimeBucket(user.id, ctx.query as Parameters<typeof service.getTimeBucket>[1]);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Albums
  // ===========================================================================

  async getAlbums(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      const shared = ctx.query.shared !== undefined ? ctx.query.shared === 'true' : undefined;
      ctx.body = await service.getAlbums(user.id, shared);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async getAlbum(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getAlbum(user.id, ctx.params.albumId);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async createAlbum(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.status = 201;
      const album = await service.createAlbum(user.id, ctx.request.body as Parameters<typeof service.createAlbum>[1]);
      await logPolaroidActivity('polaroid.album.create', user.id, {}, (ctx.request.body as { albumName?: string })?.albumName);
      ctx.body = album;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async updateAlbum(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      const updatedAlbum = await service.updateAlbum(user.id, ctx.params.albumId, ctx.request.body as Parameters<typeof service.updateAlbum>[2]);
      await logPolaroidActivity('polaroid.album.update', user.id, { albumId: ctx.params.albumId });
      ctx.body = updatedAlbum;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async deleteAlbum(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      await service.deleteAlbum(user.id, ctx.params.albumId);
      await logPolaroidActivity('polaroid.album.delete', user.id, { albumId: ctx.params.albumId });
      ctx.status = 204;
      ctx.body = null;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async addAlbumAssets(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const body = ctx.request.body as { ids: string[] };
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.addAssetsToAlbum(user.id, ctx.params.albumId, body.ids);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async removeAlbumAssets(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const body = ctx.request.body as { ids: string[] };
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.removeAssetsFromAlbum(user.id, ctx.params.albumId, body.ids);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // People
  // ===========================================================================

  async getPeople(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getPeople(user.id, ctx.query as Parameters<typeof service.getPeople>[1]);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async getPerson(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getPerson(user.id, ctx.params.personId);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async updatePerson(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.updatePerson(user.id, ctx.params.personId, ctx.request.body as Parameters<typeof service.updatePerson>[2]);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async getPersonThumbnail(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      const response = await service.getPersonThumbnail(user.id, ctx.params.personId);
      const fetchResp = response as Response;
      ctx.status = fetchResp.status;
      ctx.set('content-type', fetchResp.headers.get('content-type') || 'application/octet-stream');
      const arrayBuffer = await fetchResp.arrayBuffer();
      ctx.body = Buffer.from(arrayBuffer);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async mergePeople(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const body = ctx.request.body as { ids: string[] };
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.mergePeople(user.id, ctx.params.personId, body.ids);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Search
  // ===========================================================================

  async searchMetadata(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.searchAssets(user.id, ctx.request.body as Parameters<typeof service.searchAssets>[1]);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async searchSmart(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const body = ctx.request.body as { query: string; [key: string]: unknown };
      const { query, ...params } = body;
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.searchSmart(user.id, query, params);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Map
  // ===========================================================================

  async getMapMarkers(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getMapMarkers(user.id, ctx.query as Parameters<typeof service.getMapMarkers>[1]);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async reverseGeocode(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const lat = Number(ctx.query.lat);
      const lng = Number(ctx.query.lng);
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.reverseGeocode(user.id, lat, lng);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Shared Links
  // ===========================================================================

  async getSharedLinks(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getSharedLinks(user.id);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async getSharedLink(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getSharedLink(user.id, ctx.params.linkId);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async createSharedLink(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.status = 201;
      const sharedLink = await service.createSharedLink(user.id, ctx.request.body as Parameters<typeof service.createSharedLink>[1]);
      await logPolaroidActivity('polaroid.share.create', user.id, {});
      ctx.body = sharedLink;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async updateSharedLink(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.updateSharedLink(user.id, ctx.params.linkId, ctx.request.body as Parameters<typeof service.updateSharedLink>[2]);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async deleteSharedLink(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      await service.deleteSharedLink(user.id, ctx.params.linkId);
      await logPolaroidActivity('polaroid.share.delete', user.id, { linkId: ctx.params.linkId });
      ctx.status = 204;
      ctx.body = null;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Tags
  // ===========================================================================

  async getTags(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getTags(user.id);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async createTag(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.status = 201;
      ctx.body = await service.createTag(user.id, ctx.request.body as Parameters<typeof service.createTag>[1]);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async updateTag(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.updateTag(user.id, ctx.params.tagId, ctx.request.body as Parameters<typeof service.updateTag>[2]);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async deleteTag(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      await service.deleteTag(user.id, ctx.params.tagId);
      ctx.status = 204;
      ctx.body = null;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async tagAssets(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const body = ctx.request.body as { ids: string[] };
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.tagAssets(user.id, ctx.params.tagId, body.ids);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async untagAssets(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const body = ctx.request.body as { ids: string[] };
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.untagAssets(user.id, ctx.params.tagId, body.ids);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // API Keys
  // ===========================================================================

  async getApiKeys(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getApiKeys(user.id);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async createApiKey(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const raw = ctx.request.body as Record<string, unknown>;
      const payload = (raw?.data ?? raw) as { name: string };
      const service = strapi.service('api::polaroid.polaroid');
      ctx.status = 201;
      ctx.body = await service.createApiKey(user.id, payload.name);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async deleteApiKey(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const service = strapi.service('api::polaroid.polaroid');
      await service.deleteApiKey(user.id, ctx.params.keyId);
      ctx.status = 204;
      ctx.body = null;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  // ===========================================================================
  // Jobs
  // ===========================================================================

  async runJob(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const body = ctx.request.body as { command?: string };
      const command = (body.command || 'start') as 'start' | 'pause' | 'resume' | 'empty';
      const service = strapi.service('api::polaroid.polaroid');
      const result = await service.runJob(user.id, ctx.params.jobName, command);
      await logPolaroidActivity('polaroid.job.run', user.id, { jobName: ctx.params.jobName, command });
      ctx.body = result;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async restoreAssets(ctx: Context) {
    const user = getAuthenticatedUser(ctx);
    try {
      const raw = ctx.request.body as Record<string, unknown>;
      const payload = (raw?.data ?? raw) as { ids?: string[] };
      const ids = payload?.ids;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        ctx.throw(400, 'Missing or empty ids array');
      }
      const service = strapi.service('api::polaroid.polaroid');
      await service.restoreAssets(user.id, ids);
      await logPolaroidActivity('polaroid.trash.restore', user.id, { count: ids.length });
      ctx.status = 204;
      ctx.body = null;
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async getSharedLinkByKey(ctx: Context) {
    try {
      const key = ctx.params.key;
      const password = (ctx.query.password as string) || undefined;
      if (!key) {
        ctx.throw(400, 'Share key is required');
      }
      const service = strapi.service('api::polaroid.polaroid');
      ctx.body = await service.getSharedLinkByKey(key, password);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async getSharedLinkAssetThumbnail(ctx: Context) {
    try {
      const { key, assetId } = ctx.params;
      const size = ctx.query.size as 'thumbnail' | 'preview' | undefined;
      const password = (ctx.query.password as string) || undefined;
      if (!key || !assetId) {
        ctx.throw(400, 'Share key and asset ID are required');
      }
      const service = strapi.service('api::polaroid.polaroid');
      const response = await service.getSharedLinkAssetThumbnail(key, assetId, size, password);
      const fetchResp = response as Response;
      ctx.status = fetchResp.status;
      ctx.set('content-type', fetchResp.headers.get('content-type') || 'application/octet-stream');
      const arrayBuffer = await fetchResp.arrayBuffer();
      ctx.body = Buffer.from(arrayBuffer);
    } catch (error) {
      handleError(ctx, error);
    }
  },

  async getSharedLinkAssetOriginal(ctx: Context) {
    try {
      const { key, assetId } = ctx.params;
      const password = (ctx.query.password as string) || undefined;
      if (!key || !assetId) {
        ctx.throw(400, 'Share key and asset ID are required');
      }
      const service = strapi.service('api::polaroid.polaroid');
      const response = await service.getSharedLinkAssetOriginal(key, assetId, password);
      const fetchResp = response as Response;
      ctx.status = fetchResp.status;
      ctx.set('content-type', fetchResp.headers.get('content-type') || 'application/octet-stream');
      const cd = fetchResp.headers.get('content-disposition');
      if (cd) {
        ctx.set('content-disposition', cd);
      }
      const arrayBuffer = await fetchResp.arrayBuffer();
      ctx.body = Buffer.from(arrayBuffer);
    } catch (error) {
      handleError(ctx, error);
    }
  },
  };
};
