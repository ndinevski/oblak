export default ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET', 'change-me-admin-jwt-secret'),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT', 'change-me-api-token-salt'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT', 'change-me-transfer-token-salt'),
    },
  },
  flags: {
    nps: env.bool('FLAG_NPS', true),
    promoteEE: env.bool('FLAG_PROMOTE_EE', true),
  },
});
