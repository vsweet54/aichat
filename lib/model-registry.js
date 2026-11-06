/**
 * Dynamic OpenRouter Model Registry & Free Model Validator
 */

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache
let cachedModels = null;
let lastFetchTime = 0;

// Curated verified free models with priority order and capabilities
const STATIC_FALLBACK_FREE_MODELS = [
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash (Experimental)',
    provider: 'Google',
    isFree: true,
    supportsVision: true,
    contextLength: 1048576,
    description: 'High-speed multimodal AI by Google with 1M context and vision support.',
    recommendedFor: ['scan', 'chat', 'vision', 'math']
  },
  {
    id: 'google/gemini-2.0-flash-thinking-exp:free',
    name: 'Gemini 2.0 Flash Thinking (Experimental)',
    provider: 'Google',
    isFree: true,
    supportsVision: true,
    contextLength: 32768,
    description: 'Reasoning model showing internal thinking process for complex problems.',
    recommendedFor: ['math', 'essay', 'scan']
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B Instruct',
    provider: 'Meta',
    isFree: true,
    supportsVision: false,
    contextLength: 131072,
    description: 'State-of-the-art 70B open model for deep text reasoning and comprehension.',
    recommendedFor: ['chat', 'essay']
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct:free',
    name: 'Qwen 2.5 Coder 32B',
    provider: 'Alibaba',
    isFree: true,
    supportsVision: false,
    contextLength: 32768,
    description: 'Specialized in coding, mathematics, and logic puzzle solving.',
    recommendedFor: ['math', 'chat']
  },
  {
    id: 'mistralai/mistral-small-24b-instruct-2501:free',
    name: 'Mistral Small 24B',
    provider: 'Mistral',
    isFree: true,
    supportsVision: false,
    contextLength: 32768,
    description: 'Efficient, fast, multilingual European AI model.',
    recommendedFor: ['chat']
  },
  {
    id: 'meta-llama/llama-3.2-11b-vision-instruct:free',
    name: 'Llama 3.2 11B Vision',
    provider: 'Meta',
    isFree: true,
    supportsVision: true,
    contextLength: 131072,
    description: 'Multimodal vision model by Meta for analyzing images and diagrams.',
    recommendedFor: ['scan', 'vision']
  }
];

/**
 * Checks if a model name/id/modality indicates visual support
 */
function checkVisionSupport(modelData) {
  const id = (modelData.id || '').toLowerCase();
  const name = (modelData.name || '').toLowerCase();
  const desc = (modelData.description || '').toLowerCase();
  const modality = (modelData.architecture?.modality || '').toLowerCase();

  if (modality.includes('image') || modality.includes('multimodal')) {
    return true;
  }

  const visionKeywords = ['vision', 'gemini', 'pixtral', 'vl', 'florence', 'internvl'];
  return visionKeywords.some(keyword => id.includes(keyword) || name.includes(keyword) || desc.includes('multimodal vision'));
}

/**
 * Fetch and filter free models from OpenRouter
 * @param {string} apiKey
 * @param {string} baseUrl
 * @param {boolean} forceRefresh
 * @returns {Promise<Array>}
 */
async function getAvailableFreeModels(apiKey, baseUrl = 'https://openrouter.ai/api/v1', forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedModels && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedModels;
  }

  try {
    const url = `${baseUrl.replace(/\/+$/, '')}/models`;
    const headers = {
      'HTTP-Referer': 'https://github.com/neo-ai/neo-ai-floating',
      'X-Title': 'NEO AI Floating Assistant'
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      console.warn(`[ModelRegistry] OpenRouter returned status ${response.status}. Using fallback models.`);
      return cachedModels || STATIC_FALLBACK_FREE_MODELS;
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.data)) {
      return cachedModels || STATIC_FALLBACK_FREE_MODELS;
    }

    // Filter strictly for models that have :free suffix or pricing zero
    const freeModels = data.data.filter(model => {
      const isFreeSuffix = typeof model.id === 'string' && model.id.endsWith(':free');
      const isZeroCost = model.pricing && 
        parseFloat(model.pricing.prompt || '0') === 0 && 
        parseFloat(model.pricing.completion || '0') === 0;
      return isFreeSuffix || isZeroCost;
    });

    const parsedModels = freeModels.map(m => {
      const supportsVision = checkVisionSupport(m);
      const parts = (m.id || '').split('/');
      const provider = parts.length > 1 ? parts[0] : 'Unknown';

      return {
        id: m.id,
        name: m.name || m.id,
        provider: provider.charAt(0).toUpperCase() + provider.slice(1),
        isFree: true,
        supportsVision,
        contextLength: m.context_length || 8192,
        description: m.description ? m.description.slice(0, 160) + '...' : 'OpenRouter Free Model'
      };
    });

    // Ensure fallback models are included if not present
    for (const fallback of STATIC_FALLBACK_FREE_MODELS) {
      if (!parsedModels.some(m => m.id === fallback.id)) {
        parsedModels.push(fallback);
      }
    }

    // Sort: prioritize models with vision and high context length
    parsedModels.sort((a, b) => {
      if (a.supportsVision && !b.supportsVision) return -1;
      if (!a.supportsVision && b.supportsVision) return 1;
      return (b.contextLength || 0) - (a.contextLength || 0);
    });

    cachedModels = parsedModels;
    lastFetchTime = now;
    return parsedModels;
  } catch (error) {
    console.warn('[ModelRegistry] Failed to fetch dynamic models from OpenRouter:', error.message);
    return cachedModels || STATIC_FALLBACK_FREE_MODELS;
  }
}

/**
 * Validate if a requested model ID is a valid free model
 */
async function validateModelChoice(modelId, apiKey, baseUrl) {
  const models = await getAvailableFreeModels(apiKey, baseUrl);
  const found = models.find(m => m.id === modelId);
  if (found) {
    return { valid: true, model: found };
  }
  // If not found in dynamic list, check if it has :free suffix
  if (typeof modelId === 'string' && modelId.endsWith(':free')) {
    return {
      valid: true,
      model: {
        id: modelId,
        name: modelId,
        provider: 'OpenRouter',
        isFree: true,
        supportsVision: checkVisionSupport({ id: modelId }),
        contextLength: 8192
      }
    };
  }
  return { valid: false, error: `Model "${modelId}" is not a recognized free model` };
}

/**
 * Get ordered fallback chain for a given model
 */
function getFallbackChain(preferredModelId, requiresVision = false) {
  const fallbacks = requiresVision
    ? [
        'google/gemini-2.0-flash-exp:free',
        'google/gemini-2.0-flash-thinking-exp:free',
        'meta-llama/llama-3.2-11b-vision-instruct:free'
      ]
    : [
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'qwen/qwen-2.5-coder-32b-instruct:free',
        'mistralai/mistral-small-24b-instruct-2501:free'
      ];

  const chain = preferredModelId ? [preferredModelId, ...fallbacks.filter(id => id !== preferredModelId)] : fallbacks;
  return [...new Set(chain)]; // remove duplicates
}

module.exports = {
  STATIC_FALLBACK_FREE_MODELS,
  getAvailableFreeModels,
  validateModelChoice,
  checkVisionSupport,
  getFallbackChain
};
