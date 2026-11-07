/**
 * OpenAI Provider Adapter
 */
const BaseAdapter = require('./base');

const OPENAI_MODELS = [
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o (Omni)',
    provider: 'OpenAI',
    isFree: false,
    supportsVision: true,
    supportsTools: true,
    contextLength: 128000,
    description: 'Model flagship multimodal OpenAI dengan penalaran tinggi dan kecepatan respons cepat.'
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    isFree: false,
    supportsVision: true,
    supportsTools: true,
    contextLength: 128000,
    description: 'Model hemat biaya berkecepatan tinggi dengan kemampuan multimodal.'
  },
  {
    id: 'openai/o3-mini',
    name: 'OpenAI o3-mini',
    provider: 'OpenAI',
    isFree: false,
    supportsVision: false,
    supportsTools: true,
    contextLength: 128000,
    description: 'Model penalaran penalaran mendalam (reasoning) untuk matematika, sains, dan pemrograman.'
  }
];

class OpenAIAdapter extends BaseAdapter {
  constructor() {
    super('OpenAI');
  }

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== '');
  }

  async getModels() {
    if (!this.isConfigured()) return [];
    return OPENAI_MODELS;
  }

  async chatCompletion({ messages, model = 'openai/gpt-4o-mini', temperature = 0.7, maxTokens = 2048, stream = false, onChunk, signal }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY tidak dikonfigurasi di server');
    }

    const rawModel = model.replace(/^openai\//, '');
    const url = 'https://api.openai.com/v1/chat/completions';

    const payload = {
      model: rawModel,
      messages,
      max_tokens: maxTokens,
      stream: Boolean(stream)
    };
    // Model reasoning o-series tidak selalu mendukung temperature kustom
    if (!rawModel.startsWith('o1') && !rawModel.startsWith('o3')) {
      payload.temperature = temperature;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${errText.slice(0, 250)}`);
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
  OpenAIAdapter,
  OPENAI_MODELS
};
