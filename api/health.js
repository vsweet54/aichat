/**
 * Health Check API Endpoint
 * Menampilkan status server, provider yang aktif, dan latensi sistem.
 */
const providerManager = require('../lib/adapters');
const { setCorsHeaders } = require('../lib/security');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const providers = providerManager.getProviderStatus();
  const activeCount = Object.values(providers).filter(p => p.active).length;

  res.status(200).json({
    status: 'ok',
    app: 'NEOAI Backend Serverless API',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    providers: {
      total: Object.keys(providers).length,
      activeCount,
      details: providers
    }
  });
};
