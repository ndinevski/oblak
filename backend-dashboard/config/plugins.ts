export default ({ env }) => ({
  // Users & Permissions plugin configuration
  'users-permissions': {
    config: {
      jwt: {
        expiresIn: env('JWT_EXPIRES_IN', '7d'),
      },
      jwtSecret: env('JWT_SECRET', 'change-me-jwt-secret'),
      // Registration settings
      register: {
        allowedFields: ['username', 'email', 'password', 'organization'],
      },
      // Password validation
      password: {
        minLength: 8,
        maxLength: 128,
      },
      // Ratelimit for auth endpoints
      ratelimit: {
        interval: 60000, // 1 minute
        max: 10, // max requests per interval
      },
    },
  },

  // Email plugin configuration
  email: {
    config: {
      provider: env('EMAIL_PROVIDER', 'nodemailer'),
      providerOptions: {
        host: env('SMTP_HOST', 'localhost'),
        port: env.int('SMTP_PORT', 587),
        auth: {
          user: env('SMTP_USERNAME', ''),
          pass: env('SMTP_PASSWORD', ''),
        },
        secure: env.bool('SMTP_SECURE', false),
      },
      settings: {
        defaultFrom: env('EMAIL_FROM', 'noreply@oblak.local'),
        defaultReplyTo: env('EMAIL_REPLY_TO', 'support@oblak.local'),
      },
    },
  },

  // Graphql plugin (disabled for REST-only API)
  graphql: {
    enabled: false,
  },
});
