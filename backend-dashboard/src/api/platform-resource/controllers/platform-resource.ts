/**
 * platform-resource controller.
 *
 * The ownership registry is internal (content-api disabled in the schema), so
 * this exists only to register the model. No actions are exposed.
 */
import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::platform-resource.platform-resource',
);
