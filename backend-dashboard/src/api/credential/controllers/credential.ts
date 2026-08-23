/**
 * credential controller.
 *
 * The credential store is internal (content-api disabled in the schema);
 * API keys are managed through the identitet API. This exists only to register
 * the model.
 */
import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::credential.credential');
