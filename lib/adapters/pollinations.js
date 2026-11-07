/**
 * Pollinations AI Provider Adapter (Free, No API Key Required)
 */
const BaseAdapter = require('./base');

const POLLINATIONS_MODELS = [
  {
    id: 'pollinations/openai',
    name: 'Pollinations GPT-4o-Mini (Free)',
    provider: 'Pollinations',
    isFree: true,
    supportsVision: true,
    supportsTools: false,
    contextLength: 128000,
    description: 'Model GPT-4o-mini gratis tanpa kunci API melalui Pollinations AI.'
  },
  {
    id: 'pollinations/deepseek',
    name: 'Pollinations DeepSeek R1 (Free)',
    provider: 'Pollinations',
    isFree: true,
    supportsVision: false,
    supportsTools: false,
    contextLength: 64000,
    description: 'Model penalaran tingkat tinggi DeepSeek R1 gratis tanpa kunci API.'
  },
  {
    id: 'pollinations/mistral',
    name: 'Pollinations Mistral Nemo (Free)',
    provider: 'Pollinations',
    isFree: true,
    supportsVision: false,
    supportsTools: false,
    contextLength: 32000,
    description: 'Model cepat dan ringkas Mistral Nemo gratis tanpa kuota.'
  },
  {
    id: 'pollinations/qwen',
    name: 'Pollinations Qwen 2.5 72B (Free)',
    provider: 'Pollinations',
    isFree: true,
    supportsVision: false,
    supportsTools: false,
    contextLength: 32000,
    description: 'Model multibahasa berkecepatan tinggi Qwen 2.5.'
  }
];

class PollinationsAdapter extends BaseAdapter {
  constructor() {
    super('Pollinations');
  }

  isConfigured() {
    return true; // Selalu aktif karena gratis tanpa butuh API key
  }

  async getModels() {
    return POLLINATIONS_MODELS;
  }

  async chatCompletion({ messages, model = 'pollinations/openai', temperature = 0.7, maxTokens = 2048, stream = false, onChunk, signal }) {
    const rawModel = model.replace(/^pollinations\//, '');
    const url = 'https://text.pollinations.ai/openai';

    const formattedMessages = messages.map(m => {
      if (typeof m.content === 'string') {
        return { role: m.role, content: m.content };
      }
      return m;
    });

    const body = {
      model: rawModel === 'openai' ? 'openai' : rawModel,
      messages: formattedMessages,
      temperature,
      max_tokens: maxTokens,
      stream: Boolean(stream)
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Pollinations error (${res.status}): ${errText.slice(0, 200)}`);
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
              const parsed = JSON.parse(trimmed.slice(6));
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
                if (typeof onChunk === 'function') {
                  onChunk(delta);
                }
              }
            } catch {
              // Abaikan format parsial
            }
          }
        }
      }

      return {
        content: fullContent,
        model: model,
        usage: { total_tokens: fullContent.length / 4 }
      };
    } else {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      return {
        content,
        model: model,
        usage: data.usage || { total_tokens: content.length / 4 }
      };
    }
  }
}

module.exports = {
  PollinationsAdapter,
  POLLINATIONS_MODELS
};
