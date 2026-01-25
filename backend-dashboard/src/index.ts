import { Strapi } from '@strapi/strapi';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/* { strapi }: { strapi: Strapi } */) {
    // Register custom services, hooks, etc.
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   */
  bootstrap(/* { strapi }: { strapi: Strapi } */) {
    // Bootstrap logic - seed data, etc.
  },
};
