/**
 * POST /api/chat - Chat completion endpoint
 */

const {
  setCorsHeaders,
  checkRateLimit,
  getClientIp,
  validateAppSecret,
  validateChatInput
} = require('../lib/security');
const { validateModelChoice } = require('../lib/model-registry');
const { callOpenRouterWithFallback } = require('../lib/openrouter');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // 1. Rate Limiting
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded. Please wait a moment.',
      retryAfterSeconds: rateLimit.resetInSeconds
    });
  }

  // 2. Secret Validation
  const auth = validateAppSecret(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }

  // 3. Input Validation
  const validation = validateChatInput(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const { messages, model, maxTokens, temperature } = validation.data;

  // 4. Model Selection & Fallback setup
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.OPENROUTER_URL;
  let preferredModel = model || 'google/gemini-2.0-flash-exp:free';

  if (model) {
    const modelCheck = await validateModelChoice(model, apiKey, baseUrl);
    if (!modelCheck.valid) {
      console.warn(`[Chat] Requested model ${model} not recognized as free, using default.`);
      preferredModel = 'google/gemini-2.0-flash-exp:free';
    }
  }

  // Inject default system persona if not already provided
  const preparedMessages = [...messages];
  const hasSystemPrompt = preparedMessages.some(m => m.role === 'system');
  if (!hasSystemPrompt) {
    preparedMessages.unshift({
      role: 'system',
      content: `You are NEO AI, a cutting-edge, friendly, and precise floating AI assistant.
You provide clear, accurate, and step-by-step explanations in Indonesian or English (matching the user's language).
Use clean Markdown formatting. Highlight key formulas, options, or insights.`
    });
  }

  try {
    const result = await callOpenRouterWithFallback({
      messages: preparedMessages,
      preferredModel,
      requiresVision: false,
      temperature,
      maxTokens
    });

    return res.status(200).json({
      success: true,
      message: {
        role: 'assistant',
        content: result.content
      },
      modelUsed: result.modelUsed,
      fallbackUsed: result.fallbackUsed,
      usage: result.usage
    });
  } catch (error) {
    console.error('[API /chat] Execution Error:', error);
    return res.status(502).json({
      success: false,
      error: 'Failed to process AI chat request: ' + error.message
    });
  }
};
