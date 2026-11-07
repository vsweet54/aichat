/**
 * Security and Validation Utilities for NEO AI Backend
 */

// In-memory rate limiter: IP -> { count, resetTime }
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // 30 requests per minute

// Cleanup stale rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref?.();

/**
 * Check rate limit for a client IP
 * @param {string} ip
 * @returns {{ allowed: boolean, remaining: number, resetInSeconds: number }}
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    });
    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_WINDOW - 1,
      resetInSeconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
    };
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.max(1, Math.ceil((record.resetTime - now) / 1000))
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - record.count,
    resetInSeconds: Math.max(1, Math.ceil((record.resetTime - now) / 1000))
  };
}

/**
 * Extract client IP from request headers or socket
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Validate incoming request app secret if APP_SECRET is configured
 */
function validateAppSecret(req) {
  const serverSecret = process.env.APP_SECRET;
  if (!serverSecret || serverSecret.trim() === '') {
    // Secret verification disabled on server
    return { valid: true };
  }

  const clientSecret = req.headers['x-app-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (!clientSecret || clientSecret.trim() !== serverSecret.trim()) {
    return {
      valid: false,
      error: 'Invalid or missing app secret authentication header (x-app-secret)'
    };
  }

  return { valid: true };
}

/**
 * Validate Chat payload
 */
function validateChatInput(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a valid JSON object' };
  }

  const { messages, model, maxTokens, temperature } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { valid: false, error: 'Field "messages" must be a non-empty array' };
  }

  if (messages.length > 50) {
    return { valid: false, error: 'Maximum messages per request exceeded (max 50)' };
  }

  let totalChars = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg !== 'object') {
      return { valid: false, error: `Invalid message format at index ${i}` };
    }
    if (!['system', 'user', 'assistant'].includes(msg.role)) {
      return { valid: false, error: `Invalid role "${msg.role}" at index ${i}` };
    }
    if (typeof msg.content !== 'string' && !Array.isArray(msg.content)) {
      return { valid: false, error: `Message content must be string or array at index ${i}` };
    }
    const len = typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length;
    totalChars += len;
  }

  if (totalChars > 30000) {
    return { valid: false, error: 'Total message content length exceeds limit (30,000 chars)' };
  }

  return {
    valid: true,
    data: {
      messages,
      model: typeof model === 'string' && model.trim() ? model.trim() : null,
      maxTokens: Number.isInteger(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, 4096) : 2048,
      temperature: typeof temperature === 'number' ? Math.max(0, Math.min(temperature, 1.5)) : 0.7
    }
  };
}

/**
 * Validate Scan payload
 */
function validateScanInput(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a valid JSON object' };
  }

  const { imageBase64, ocrText, prompt, model, language } = body;

  const hasImage = typeof imageBase64 === 'string' && imageBase64.trim().length > 0;
  const hasOcr = typeof ocrText === 'string' && ocrText.trim().length > 0;

  if (!hasImage && !hasOcr) {
    return { valid: false, error: 'At least one of "imageBase64" or "ocrText" must be provided' };
  }

  if (hasImage) {
    // Base64 size check (approx 4MB maximum = ~5.5MB base64 string)
    const MAX_BASE64_LENGTH = 5.5 * 1024 * 1024;
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return { valid: false, error: 'Image size exceeds maximum limit of 4MB' };
    }
  }

  if (hasOcr && ocrText.length > 20000) {
    return { valid: false, error: 'OCR text exceeds 20,000 character limit' };
  }

  return {
    valid: true,
    data: {
      imageBase64: hasImage ? imageBase64.trim() : null,
      ocrText: hasOcr ? ocrText.trim() : '',
      prompt: typeof prompt === 'string' && prompt.trim() ? prompt.trim() : '',
      model: typeof model === 'string' && model.trim() ? model.trim() : null,
      language: language === 'en' ? 'en' : 'id' // default Indonesian
    }
  };
}

/**
 * Set standard security & CORS headers
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-app-secret');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
}

module.exports = {
  checkRateLimit,
  getClientIp,
  validateAppSecret,
  validateChatInput,
  validateScanInput,
  setCorsHeaders
};
