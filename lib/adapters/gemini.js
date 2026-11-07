/**
 * Google Gemini Provider Adapter
 */
const BaseAdapter = require('./base');

const GEMINI_MODELS = [
  {
    id: 'gemini/gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'Google Gemini',
    isFree: false,
    supportsVision: true,
    supportsTools: true,
    contextLength: 1048576,
    description: 'Generasi terbaru Gemini dengan latensi ultra rendah dan penalaran multimodal.'
  },
  {
    id: 'gemini/gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'Google Gemini',
    isFree: false,
    supportsVision: true,
    supportsTools: true,
    contextLength: 1000000,
    description: 'Model multimodal cepat dan efisien dengan jendela konteks 1 juta token.'
  },
  {
    id: 'gemini/gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'Google Gemini',
    isFree: false,
    supportsVision: true,
    supportsTools: true,
    contextLength: 2000000,
    description: 'Model penalaran paling cerdas dari Google dengan konteks hingga 2 juta token.'
  }
];

class GeminiAdapter extends BaseAdapter {
  constructor() {
    super('Google Gemini');
  }

  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');
  }

  async getModels() {
    if (!this.isConfigured()) return [];
    return GEMINI_MODELS;
  }

  async chatCompletion({ messages, model = 'gemini/gemini-1.5-flash', temperature = 0.7, maxTokens = 2048, stream = false, onChunk, signal }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY tidak dikonfigurasi di server');
    }

    const rawModel = model.replace(/^gemini\//, '');
    const endpoint = stream ? 'streamGenerateContent?alt=sse&key=' : 'generateContent?key=';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${rawModel}:${endpoint}${apiKey}`;

    // Konversi messages OpenAI ke format Gemini contents
    const contents = [];
    let systemInstruction = null;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = {
          parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }]
        };
      } else {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        const parts = [];

        if (typeof msg.content === 'string') {
          parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.type === 'text') {
              parts.push({ text: item.text });
            } else if (item.type === 'image_url') {
              const urlStr = item.image_url?.url || '';
              if (urlStr.startsWith('data:image/')) {
                const match = urlStr.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
                if (match) {
                  parts.push({
                    inlineData: {
                      mimeType: `image/${match[1]}`,
                      data: match[2]
                    }
                  });
                }
              }
            }
          }
        }
        contents.push({ role, parts });
      }
    }

    const payload = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens
      }
    };
    if (systemInstruction) {
      payload.systemInstruction = systemInstruction;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 250)}`);
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
          if (!trimmed) continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (text) {
                fullContent += text;
                if (typeof onChunk === 'function') {
                  onChunk(text);
                }
              }
            } catch {
              // Parse parsial chunk
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
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return {
        content: text,
        model,
        usage: data.usageMetadata || { total_tokens: text.length / 4 }
      };
    }
  }
}

module.exports = {
  GeminiAdapter,
  GEMINI_MODELS
};
