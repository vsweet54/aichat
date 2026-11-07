/**
 * Text-to-Speech (TTS) API Endpoint
 * Menghasilkan audio pembacaan teks dalam Bahasa Indonesia dan Bahasa Inggris
 */
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
        message: `Batas kecepatan audio terlampaui. Tunggu ${rateLimit.resetInSeconds} detik.`
      }
    });
  }

  const text = req.method === 'POST' ? req.body?.text : req.query?.text;
  const lang = (req.method === 'POST' ? req.body?.lang : req.query?.lang) || 'id';

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({
      error: { code: 'INVALID_TEXT', message: 'Parameter "text" wajib diisi' }
    });
  }

  const cleanText = text.trim().slice(0, 500); // Batas aman 500 karakter per chunk audio
  const encodedText = encodeURIComponent(cleanText);
  const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${lang}&client=tw-ob`;

  try {
    const audioRes = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!audioRes.ok) {
      return res.status(200).json({
        audioUrl,
        text: cleanText,
        lang
      });
    }

    const buffer = await audioRes.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.byteLength);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.warn('[TTS API] Gagal streaming audio langsung, mengembalikan URL:', err.message);
    return res.status(200).json({
      audioUrl,
      text: cleanText,
      lang
    });
  }
};
