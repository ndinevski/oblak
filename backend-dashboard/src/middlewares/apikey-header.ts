/**
 * Lets an API key be presented via the `X-API-Key` header in addition to
 * `Authorization: Bearer oblak_...`.
 *
 * The auth layer tries the users-permissions strategy first, and its
 * public-permission fallback authenticates any request that carries no
 * Authorization header, so a key sent only as X-API-Key would never reach the
 * API-key strategy. Promoting it into an Authorization Bearer header before
 * routing funnels both header styles through the same (working) path.
 */
import type { Core } from '@strapi/strapi';

export default (_config: unknown, { strapi: _strapi }: { strapi: Core.Strapi }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    const headers = ctx.request.header;
    const apiKey = headers['x-api-key'];
    if (!headers.authorization && typeof apiKey === 'string' && apiKey.startsWith('oblak_')) {
      ctx.request.header.authorization = `Bearer ${apiKey}`;
    }
    await next();
  };
};
