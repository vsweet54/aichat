/**
 * Web Search API Endpoint
 */
const { performWebSearch } = require('../lib/web-search');
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
        message: `Terlalu banyak permintaan pencarian. Coba lagi dalam ${rateLimit.resetInSeconds} detik.`
      }
    });
  }

  const query = req.method === 'POST' ? req.body?.query : req.query?.q;
  const maxResults = parseInt((req.method === 'POST' ? req.body?.max_results : req.query?.limit) || '5', 10);

  if (!query || typeof query !== 'string' || query.trim() === '') {
    return res.status(400).json({
      error: { code: 'EMPTY_QUERY', message: 'Parameter pencarian "query" tidak boleh kosong' }
    });
  }

  try {
    const results = await performWebSearch(query, maxResults);
    return res.status(200).json({
      query: query.trim(),
      total: results.length,
      results
    });
  } catch (err) {
    console.error('[Search API Error]', err);
    return res.status(500).json({
      error: { code: 'SEARCH_FAILED', message: 'Gagal melakukan pencarian web: ' + err.message }
    });
  }
};
