/**
 * OpenRouter Provider Adapter
 */
const BaseAdapter = require('./base');

const OPENROUTER_CURATED_MODELS = [
  {
    id: 'openrouter/auto',
    name: 'OpenRouter Auto Router',
    provider: 'OpenRouter',
    isFree: false,
    supportsVision: true,
    supportsTools: true,
    contextLength: 200000,
    description: 'Secara cerdas merutekan permintaan ke model terbaik dengan harga optimal.'
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic (via OpenRouter)',
    isFree: false,
    supportsVision: true,
    supportsTools: true,
    contextLength: 200000,
    description: 'Model terdepan industri untuk penulisan kode, analisis dokumen, dan penalaran.'
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B Instruct (Free)',
    provider: 'Meta (via OpenRouter)',
    isFree: true,
    supportsVision: false,
    supportsTools: false,
    contextLength: 128000,
    description: 'Model open-source terkuat dari Meta gratis di OpenRouter.'
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash Exp (Free)',
    provider: 'Google (via OpenRouter)',
    isFree: true,
    supportsVision: true,
    supportsTools: false,
    contextLength: 1048576,
    description: 'Model Gemini 2.0 Flash eksperimental gratis dengan dukungan multimodal.'
  },
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1 (Free)',
    provider: 'DeepSeek (via OpenRouter)',
    isFree: true,
    supportsVision: false,
    supportsTools: false,
    contextLength: 64000,
    description: 'Model penalaran rantai pemikiran (CoT) mendalam gratis.'
  }
];

class OpenRouterAdapter extends BaseAdapter {
  constructor() {
    super('OpenRouter');
  }

  isConfigured() {
    return Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim() !== '');
  }

  async getModels() {
    if (!this.isConfigured()) return [];
    return OPENROUTER_CURATED_MODELS;
  }

  async chatCompletion({ messages, model = 'google/gemini-2.0-flash-exp:free', temperature = 0.7, maxTokens = 2048, stream = false, onChunk, signal }) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY tidak dikonfigurasi di server');
    }

    const cleanModel = model.replace(/^openrouter\//, '');
    const url = 'https://openrouter.ai/api/v1/chat/completions';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/neo-ai/neo-ai',
        'X-Title': 'NEOAI Assistant'
      },
      body: JSON.stringify({
        model: cleanModel,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: Boolean(stream)
      }),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter API error (${res.status}): ${errText.slice(0, 250)}`);
    }

    if (stream && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const delta = json.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
                if (typeof onChunk === 'function') {
                  onChunk(delta);
                }
              }
            } catch {
              // Ignore partial JSON
            }
          }
        }
      }

      return {
        content: fullContent,
        model,
        usage: { total_tokens: fullContent.length / 4 }
      };
    } else {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      return {
        content,
        model,
        usage: data.usage || { total_tokens: content.length / 4 }
      };
    }
  }
}

module.exports = {
  OpenRouterAdapter,
  OPENROUTER_CURATED_MODELS
};
