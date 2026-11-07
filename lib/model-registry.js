/**
 * Dynamic OpenRouter Model Registry & Free Model Validator
 */

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache
let cachedModels = null;
let lastFetchTime = 0;

// Curated verified free models with priority order and capabilities
const STATIC_FALLBACK_FREE_MODELS = [
  {
    id: 'nvidia/nemotron-3.5-super-vl:free',
    name: 'NVIDIA Nemotron 3.5 Super VL',
    provider: 'Nvidia',
    isFree: true,
    supportsVision: true,
    contextLength: 1000000,
    description: 'Powerful multimodal AI model with 1M context supporting diagrams and images.',
    recommendedFor: ['scan', 'vision', 'chat', 'math']
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    name: 'NVIDIA Nemotron 3.5 Lightning',
    provider: 'Nvidia',
    isFree: true,
    supportsVision: false,
    contextLength: 1000000,
    description: 'Ultra-fast high throughput reasoning model for mathematics and chat.',
    recommendedFor: ['chat', 'math', 'essay']
  },
  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Google Gemma 4 31B Instruct',
    provider: 'Google',
    isFree: true,
    supportsVision: true,
    contextLength: 262144,
    description: 'Instruction-tuned multimodal model from Google DeepMind.',
    recommendedFor: ['scan', 'chat']
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Google Gemma 4 26B Instruct',
    provider: 'Google',
    isFree: true,
    supportsVision: true,
    contextLength: 131072,
    description: 'Fast Google Gemma instruction model with vision support.',
    recommendedFor: ['scan', 'chat']
  },
  {
    id: 'openrouter/free',
    name: 'OpenRouter Free Auto-Router',
    provider: 'OpenRouter',
    isFree: true,
    supportsVision: true,
    contextLength: 200000,
    description: 'Dynamic free router automatically routing to the best operational free model.',
    recommendedFor: ['scan', 'chat', 'math', 'essay']
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
        'nvidia/nemotron-3.5-super-vl:free',
        'google/gemma-4-31b-it:free',
        'google/gemma-4-26b-a4b-it:free',
        'openrouter/free'
      ]
    : [
        'nvidia/nemotron-3.5-super-vl:free',
        'nvidia/nemotron-3.5-lightning:free',
        'google/gemma-4-31b-it:free',
        'google/gemma-4-26b-a4b-it:free',
        'liquid/lfm-2.5-2.6b:free',
        'liquid/lfm-3-1.7b:free',
        'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        'openrouter/free'
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
