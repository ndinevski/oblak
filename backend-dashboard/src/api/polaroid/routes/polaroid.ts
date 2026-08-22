export default {
  routes: [
    // ==========================================================================
    // Server
    // ==========================================================================
    {
      method: 'GET',
      path: '/polaroid/server/info',
      handler: 'polaroid.serverInfo',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/polaroid/server/ping',
      handler: 'polaroid.serverPing',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },

    // ==========================================================================
    // Assets
    // ==========================================================================
    {
      method: 'GET',
      path: '/polaroid/assets',
      handler: 'polaroid.getAssets',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/polaroid/assets/statistics',
      handler: 'polaroid.getAssetStatistics',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/polaroid/assets/exist',
      handler: 'polaroid.checkExistingAssets',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/polaroid/assets/:assetId',
      handler: 'polaroid.getAsset',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/polaroid/assets/:assetId/thumbnail',
      handler: 'polaroid.getAssetThumbnail',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/polaroid/assets/:assetId/original',
      handler: 'polaroid.downloadAsset',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/polaroid/assets/upload',
      handler: 'polaroid.uploadAsset',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/polaroid/assets/delete',
      handler: 'polaroid.deleteAssets',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/polaroid/assets/:assetId',
      handler: 'polaroid.updateAsset',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },

    // ==========================================================================
    // Timeline
    // ==========================================================================
    {
      method: 'GET',
      path: '/polaroid/timeline/buckets',
      handler: 'polaroid.getTimeBuckets',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/polaroid/timeline/bucket',
      handler: 'polaroid.getTimeBucket',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },

    // ==========================================================================
    // Albums
    // ==========================================================================
    {
      method: 'GET',
      path: '/polaroid/albums',
      handler: 'polaroid.getAlbums',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/polaroid/albums',
      handler: 'polaroid.createAlbum',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/polaroid/albums/:albumId',
      handler: 'polaroid.getAlbum',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/polaroid/albums/:albumId',
      handler: 'polaroid.updateAlbum',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/polaroid/albums/:albumId',
      handler: 'polaroid.deleteAlbum',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/polaroid/albums/:albumId/assets',
      handler: 'polaroid.addAlbumAssets',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/polaroid/albums/:albumId/assets',
      handler: 'polaroid.removeAlbumAssets',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },

    // ==========================================================================
    // People
    // ==========================================================================
    {
      method: 'GET',
      path: '/polaroid/people',
      handler: 'polaroid.getPeople',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/polaroid/people/:personId',
      handler: 'polaroid.getPerson',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/polaroid/people/:personId',
      handler: 'polaroid.updatePerson',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/polaroid/people/:personId/thumbnail',
      handler: 'polaroid.getPersonThumbnail',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/polaroid/people/:personId/merge',
      handler: 'polaroid.mergePeople',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },

    // ==========================================================================
    // Search
    // ==========================================================================
    {
      method: 'POST',
      path: '/polaroid/search/metadata',
      handler: 'polaroid.searchMetadata',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/polaroid/search/smart',
      handler: 'polaroid.searchSmart',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },

    // ==========================================================================
    // Map
    // ==========================================================================
    {
      method: 'GET',
      path: '/polaroid/map/markers',
      handler: 'polaroid.getMapMarkers',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/polaroid/map/reverse-geocode',
      handler: 'polaroid.reverseGeocode',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },

    // ==========================================================================
    // Sharing
    // ==========================================================================
    {
      method: 'GET',
      path: '/polaroid/shared-links',
      handler: 'polaroid.getSharedLinks',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/polaroid/shared-links',
      handler: 'polaroid.createSharedLink',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/polaroid/shared-links/:linkId',
      handler: 'polaroid.getSharedLink',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/polaroid/shared-links/:linkId',
      handler: 'polaroid.updateSharedLink',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/polaroid/shared-links/:linkId',
      handler: 'polaroid.deleteSharedLink',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },

    // ==========================================================================
    // Tags
    // ==========================================================================
    {
      method: 'GET',
      path: '/polaroid/tags',
      handler: 'polaroid.getTags',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/polaroid/tags',
      handler: 'polaroid.createTag',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PATCH',
      path: '/polaroid/tags/:tagId',
      handler: 'polaroid.updateTag',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/polaroid/tags/:tagId',
      handler: 'polaroid.deleteTag',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/polaroid/tags/:tagId/assets',
      handler: 'polaroid.tagAssets',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/polaroid/tags/:tagId/assets',
      handler: 'polaroid.untagAssets',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },

    // ==========================================================================
    // API Keys
    // ==========================================================================
    {
      method: 'GET',
      path: '/polaroid/api-keys',
      handler: 'polaroid.getApiKeys',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/polaroid/api-keys',
      handler: 'polaroid.createApiKey',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'DELETE',
      path: '/polaroid/api-keys/:keyId',
      handler: 'polaroid.deleteApiKey',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },

    // ==========================================================================
    // Jobs
    // ==========================================================================
    {
      method: 'PUT',
      path: '/polaroid/jobs/:jobName',
      handler: 'polaroid.runJob',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },

    // ==========================================================================
    // Trash
    // ==========================================================================
    {
      method: 'POST',
      path: '/polaroid/trash/restore',
      handler: 'polaroid.restoreAssets',
      info: { type: 'content-api' },
      config: { policies: [], middlewares: [] },
    },

    // ==========================================================================
    // Public Shared Link Access (no auth required)
    // ==========================================================================
    {
      method: 'GET',
      path: '/polaroid/share/:key',
      handler: 'polaroid.getSharedLinkByKey',
      info: { type: 'content-api' },
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/polaroid/share/:key/assets/:assetId/thumbnail',
      handler: 'polaroid.getSharedLinkAssetThumbnail',
      info: { type: 'content-api' },
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/polaroid/share/:key/assets/:assetId/original',
      handler: 'polaroid.getSharedLinkAssetOriginal',
      info: { type: 'content-api' },
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
