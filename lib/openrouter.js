/**
 * OpenRouter Gateway Client with Automatic Model Fallback and Controlled Retries
 */

const { getFallbackChain } = require('./model-registry');

const DEFAULT_OPENROUTER_URL = 'https://openrouter.ai/api/v1';

/**
 * Execute a completion request against OpenRouter
 * @param {Object} options
 * @param {Array} options.messages
 * @param {string} [options.preferredModel]
 * @param {boolean} [options.requiresVision]
 * @param {number} [options.temperature]
 * @param {number} [options.maxTokens]
 * @returns {Promise<{ content: string, modelUsed: string, fallbackUsed: boolean, usage: Object }>}
 */
async function callOpenRouterWithFallback({
  messages,
  preferredModel = 'google/gemini-2.0-flash-exp:free',
  requiresVision = false,
  temperature = 0.7,
  maxTokens = 2048
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('OPENROUTER_API_KEY is not configured on the server environment');
  }

  const baseUrl = (process.env.OPENROUTER_URL || DEFAULT_OPENROUTER_URL).replace(/\/+$/, '');
  const fallbackList = getFallbackChain(preferredModel, requiresVision);

  let lastError = null;

  for (let i = 0; i < fallbackList.length; i++) {
    const currentModel = fallbackList[i];
    const isFallback = i > 0;

    try {
      const result = await makeSingleCompletionRequest({
        baseUrl,
        apiKey,
        model: currentModel,
        messages,
        temperature,
        maxTokens
      });

      return {
        content: result.content,
        modelUsed: currentModel,
        fallbackUsed: isFallback,
        usage: result.usage || {}
      };
    } catch (err) {
      console.warn(`[OpenRouter] Model "${currentModel}" failed (${err.message}). Trying fallback if available.`);
      lastError = err;
    }
  }

  throw new Error(`All candidate models failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Make a single completion call to OpenRouter with timeout
 */
async function makeSingleCompletionRequest({ baseUrl, apiKey, model, messages, temperature, maxTokens }) {
  const url = `${baseUrl}/chat/completions`;
  const timeoutMs = 12000; // 12s timeout for fast model rollback

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/neo-ai/neo-ai-floating',
        'X-Title': 'NEO AI Floating Assistant'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson = null;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        // raw text
      }
      const msg = errorJson?.error?.message || errorText || `HTTP ${response.status}`;
      throw new Error(`OpenRouter API error (${response.status}): ${msg}`);
    }

    const data = await response.json();
    const choice = data.choices && data.choices[0];
    if (!choice || !choice.message) {
      throw new Error('Received empty choices in OpenRouter response');
    }

    const content = choice.message.content || '';
    return {
      content,
      usage: data.usage
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  }
}

module.exports = {
  callOpenRouterWithFallback
};
