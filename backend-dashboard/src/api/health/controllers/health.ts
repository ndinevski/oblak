// Health check API controller
export default {
  async index(ctx) {
    ctx.body = {
      status: 'healthy',
      service: 'oblak-dashboard',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  },
};
