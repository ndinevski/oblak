export default ({ env }) => ({
  // Users & Permissions plugin configuration
  'users-permissions': {
    config: {
      jwt: {
        expiresIn: '7d',
      },
      jwtSecret: env('JWT_SECRET', 'change-me-jwt-secret'),
    },
  },
});
