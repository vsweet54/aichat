/**
 * Groq Provider Adapter (Ultra High-Speed Inference)
 */
const BaseAdapter = require('./base');

const GROQ_MODELS = [
  {
    id: 'groq/llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    provider: 'Groq',
    isFree: false,
    supportsVision: false,
    supportsTools: true,
    contextLength: 128000,
    description: 'Model Llama 3.3 70B dengan kecepatan inferensi hingga 300+ token per detik.'
  },
  {
    id: 'groq/llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    provider: 'Groq',
    isFree: false,
    supportsVision: false,
    supportsTools: true,
    contextLength: 128000,
    description: 'Model respons instan super cepat untuk chat dan tugas sehari-hari.'
  },
  {
    id: 'groq/deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 Distill Llama 70B',
    provider: 'Groq',
    isFree: false,
    supportsVision: false,
    supportsTools: true,
    contextLength: 128000,
    description: 'Model penalaran matematika dan coding berbasis DeepSeek R1 di LPU Groq.'
  }
];

class GroqAdapter extends BaseAdapter {
  constructor() {
    super('Groq');
  }

  isConfigured() {
    return Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== '');
  }

  async getModels() {
    if (!this.isConfigured()) return [];
    return GROQ_MODELS;
  }

  async chatCompletion({ messages, model = 'groq/llama-3.3-70b-versatile', temperature = 0.7, maxTokens = 2048, stream = false, onChunk, signal }) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY tidak dikonfigurasi di server');
    }

    const rawModel = model.replace(/^groq\//, '');
    const url = 'https://api.groq.com/openai/v1/chat/completions';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: rawModel,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: Boolean(stream)
      }),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq API error (${res.status}): ${errText.slice(0, 250)}`);
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
              // Parse parsial
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
  GroqAdapter,
  GROQ_MODELS
};
