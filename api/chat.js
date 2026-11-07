/**
 * Chat Completion API Endpoint (SSE Streaming & Parallel Compare)
 */
const providerManager = require('../lib/adapters');
const { performWebSearch } = require('../lib/web-search');
const { setCorsHeaders, checkRateLimit, getClientIp, validateChatInput } = require('../lib/security');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Hanya metode POST yang diizinkan' }
    });
  }

  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Batas kecepatan terlampaui. Coba lagi dalam ${rateLimit.resetInSeconds} detik.`
      }
    });
  }

  const validation = validateChatInput(req.body);
  if (!validation.valid) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: validation.error }
    });
  }

  const { messages, model, maxTokens, temperature } = validation.data;
  const webSearch = Boolean(req.body.web_search || req.body.webSearch);
  const compareModels = Array.isArray(req.body.compare_models) ? req.body.compare_models : null;
  const isStream = req.body.stream !== false; // Default true untuk SSE streaming

  // Jika Web Search diaktifkan, lakukan pencarian dari pesan terakhir pengguna
  let finalMessages = [...messages];
  if (webSearch) {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const query = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
    if (query) {
      try {
        const searchResults = await performWebSearch(query, 4);
        if (searchResults.length > 0) {
          const searchContext = searchResults
            .map((r, idx) => `[Sumber ${idx + 1}]: ${r.title}\n${r.snippet}\nLink: ${r.link}`)
            .join('\n\n');

          finalMessages.unshift({
            role: 'system',
            content: `Gunakan informasi hasil pencarian web terkini berikut jika relevan dengan pertanyaan pengguna:\n\n${searchContext}`
          });
        }
      } catch (err) {
        console.warn('[Chat] Gagal menyisipkan pencarian web:', err.message);
      }
    }
  }

  // MODE 1: Mode Bandingkan Multi-Model Paralel (2-3 model berdampingan)
  if (compareModels && compareModels.length > 1) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const tasks = compareModels.slice(0, 3).map(async (targetModel, index) => {
      try {
        await providerManager.chatWithFallback({
          messages: finalMessages,
          model: targetModel,
          temperature,
          maxTokens,
          stream: true,
          onChunk: (delta) => {
            const payload = JSON.stringify({
              compare: true,
              modelIndex: index,
              modelId: targetModel,
              delta,
              done: false
            });
            res.write(`data: ${payload}\n\n`);
          }
        });

        const finishPayload = JSON.stringify({
          compare: true,
          modelIndex: index,
          modelId: targetModel,
          done: true
        });
        res.write(`data: ${finishPayload}\n\n`);
      } catch (err) {
        const errorPayload = JSON.stringify({
          compare: true,
          modelIndex: index,
          modelId: targetModel,
          error: err.message,
          done: true
        });
        res.write(`data: ${errorPayload}\n\n`);
      }
    });

    await Promise.allSettled(tasks);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  // MODE 2: Mode Single Model SSE Streaming
  if (isStream) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const result = await providerManager.chatWithFallback({
        messages: finalMessages,
        model,
        temperature,
        maxTokens,
        stream: true,
        onChunk: (delta) => {
          const payload = JSON.stringify({ delta, done: false });
          res.write(`data: ${payload}\n\n`);
        }
      });

      const finishPayload = JSON.stringify({
        done: true,
        modelUsed: result.model,
        provider: result.provider,
        fallbackUsed: result.fallbackUsed
      });
      res.write(`data: ${finishPayload}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (err) {
      const errorPayload = JSON.stringify({
        error: { code: 'CHAT_GENERATION_FAILED', message: err.message },
        done: true
      });
      res.write(`data: ${errorPayload}\n\n`);
      return res.end();
    }
  }

  // MODE 3: Non-Streaming JSON Response
  try {
    const result = await providerManager.chatWithFallback({
      messages: finalMessages,
      model,
      temperature,
      maxTokens,
      stream: false
    });

    return res.status(200).json({
      content: result.content,
      modelUsed: result.model,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      usage: result.usage
    });
  } catch (err) {
    return res.status(500).json({
      error: { code: 'CHAT_COMPLETION_ERROR', message: err.message }
    });
  }
};
