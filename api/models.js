/**
 * Models API Endpoint
 * Mengembalikan daftar seluruh model dari provider aktif
 */
const providerManager = require('../lib/adapters');
const { setCorsHeaders, checkRateLimit, getClientIp } = require('../lib/security');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Terlalu banyak permintaan. Silakan coba kembali dalam ${rateLimit.resetInSeconds} detik.`
      }
    });
  }

  try {
    const models = await providerManager.getAllActiveModels();
    const providers = providerManager.getProviderStatus();

    // Kelompokkan model berdasarkan nama provider untuk memudahkan UI
    const grouped = {};
    for (const m of models) {
      if (!grouped[m.provider]) {
        grouped[m.provider] = [];
      }
      grouped[m.provider].push(m);
    }

    res.status(200).json({
      total: models.length,
      models,
      grouped,
      activeProviders: providers
    });
  } catch (err) {
    console.error('[API Models Error]', err);
    res.status(500).json({
      error: {
        code: 'MODELS_FETCH_FAILED',
        message: 'Gagal mengambil daftar model AI: ' + err.message
      }
    });
  }
};
