/**
 * Image Generation API Endpoint
 * Mendukung Pollinations AI (Gratis tanpa key) dan OpenAI DALL-E 3
 */
const { setCorsHeaders, checkRateLimit, getClientIp } = require('../lib/security');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Hanya metode POST yang didukung' }
    });
  }

  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Terlalu banyak permintaan gambar. Tunggu ${rateLimit.resetInSeconds} detik.`
      }
    });
  }

  const { prompt, width = 1024, height = 1024, seed, model = 'flux' } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    return res.status(400).json({
      error: { code: 'INVALID_PROMPT', message: 'Parameter "prompt" wajib diisi' }
    });
  }

  const safePrompt = prompt.trim();
  const safeSeed = seed || Math.floor(Math.random() * 1000000);

  // Jika OpenAI API Key terpasang dan model dipilih dall-e
  if (process.env.OPENAI_API_KEY && model.startsWith('dall-e')) {
    try {
      const openAiRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: safePrompt,
          n: 1,
          size: `${width}x${height}`
        })
      });

      if (openAiRes.ok) {
        const data = await openAiRes.json();
        const imageUrl = data.data?.[0]?.url;
        return res.status(200).json({
          imageUrl,
          prompt: safePrompt,
          provider: 'OpenAI DALL-E 3',
          seed: safeSeed
        });
      }
    } catch (err) {
      console.warn('[Image API] DALL-E gagal, beralih ke Pollinations:', err.message);
    }
  }

  // Default: Pollinations AI Generator (Kualitas tinggi, gratis, tanpa butuh API key)
  const encodedPrompt = encodeURIComponent(safePrompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${safeSeed}&nologo=true&enhance=true`;

  return res.status(200).json({
    imageUrl,
    prompt: safePrompt,
    provider: 'Pollinations AI (Flux)',
    seed: safeSeed,
    width,
    height
  });
};
