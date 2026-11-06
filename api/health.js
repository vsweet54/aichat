/**
 * GET /api/health - Health check endpoint
 */

const { setCorsHeaders, checkRateLimit, getClientIp } = require('../lib/security');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Too many requests. Please slow down.',
      retryAfterSeconds: rateLimit.resetInSeconds
    });
  }

  const hasApiKey = Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim());
  const hasAppSecret = Boolean(process.env.APP_SECRET && process.env.APP_SECRET.trim());

  return res.status(200).json({
    status: 'healthy',
    service: 'NEO AI Floating Assistant Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    gateway: 'OpenRouter',
    configured: {
      openRouterKey: hasApiKey,
      appSecretRequired: hasAppSecret
    }
  });
};
