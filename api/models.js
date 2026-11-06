/**
 * GET /api/models - Dynamic Free Model List Endpoint
 */

const { setCorsHeaders, checkRateLimit, getClientIp } = require('../lib/security');
const { getAvailableFreeModels } = require('../lib/model-registry');

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
      error: 'Rate limit exceeded.',
      retryAfterSeconds: rateLimit.resetInSeconds
    });
  }

  // Check if admin is requesting a forced cache refresh
  const query = req.query || {};
  const authHeader = req.headers['authorization'] || '';
  const adminToken = process.env.ADMIN_TOKEN;
  const isAuthorizedAdmin = adminToken && (
    authHeader === `Bearer ${adminToken}` ||
    query.token === adminToken
  );

  const forceRefresh = Boolean(query.refresh === 'true' && isAuthorizedAdmin);

  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.OPENROUTER_URL;

  try {
    const models = await getAvailableFreeModels(apiKey, baseUrl, forceRefresh);

    return res.status(200).json({
      success: true,
      count: models.length,
      defaultModel: 'google/gemini-2.0-flash-exp:free',
      data: models
    });
  } catch (error) {
    console.error('[API /models] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve available models: ' + error.message
    });
  }
};
