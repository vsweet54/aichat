/**
 * Unified Provider Registry and AI Orchestrator
 */
const { PollinationsAdapter } = require('./pollinations');
const { GeminiAdapter } = require('./gemini');
const { GroqAdapter } = require('./groq');
const { OpenAIAdapter } = require('./openai');
const { OpenRouterAdapter } = require('./openrouter');

class ProviderManager {
  constructor() {
    this.adapters = {
      pollinations: new PollinationsAdapter(),
      gemini: new GeminiAdapter(),
      groq: new GroqAdapter(),
      openai: new OpenAIAdapter(),
      openrouter: new OpenRouterAdapter()
    };
  }

  /**
   * Mendapatkan status konfigurasi seluruh provider
   */
  getProviderStatus() {
    const status = {};
    for (const [key, adapter] of Object.entries(this.adapters)) {
      status[key] = {
        name: adapter.name,
        active: adapter.isConfigured()
      };
    }
    return status;
  }

  /**
   * Mengambil semua model dari seluruh provider yang aktif
   */
  async getAllActiveModels() {
    const allModels = [];

    for (const adapter of Object.values(this.adapters)) {
      if (adapter.isConfigured()) {
        try {
          const models = await adapter.getModels();
          allModels.push(...models);
        } catch (err) {
          console.warn(`[ProviderManager] Gagal memuat model dari ${adapter.name}:`, err.message);
        }
      }
    }

    return allModels;
  }

  /**
   * Menentukan adapter mana yang menangani modelId tertentu
   */
  resolveAdapterForModel(modelId = '') {
    const m = (modelId || '').toLowerCase();

    if (m.startsWith('gemini/') || m.includes('gemini-1.5') || m.includes('gemini-2.0')) {
      if (this.adapters.gemini.isConfigured()) return this.adapters.gemini;
    }
    if (m.startsWith('groq/') || m.includes('llama-3.3') || m.includes('llama-3.1')) {
      if (this.adapters.groq.isConfigured()) return this.adapters.groq;
    }
    if (m.startsWith('openai/') || m.includes('gpt-4o') || m.includes('o3-mini')) {
      if (this.adapters.openai.isConfigured()) return this.adapters.openai;
    }
    if (m.startsWith('openrouter/') || m.includes('claude-3.5') || m.includes(':free')) {
      if (this.adapters.openrouter.isConfigured()) return this.adapters.openrouter;
    }
    if (m.startsWith('pollinations/')) {
      return this.adapters.pollinations;
    }

    // Default ke provider yang aktif atau Pollinations gratis
    if (this.adapters.gemini.isConfigured()) return this.adapters.gemini;
    if (this.adapters.groq.isConfigured()) return this.adapters.groq;
    if (this.adapters.openrouter.isConfigured()) return this.adapters.openrouter;
    if (this.adapters.openai.isConfigured()) return this.adapters.openai;
    return this.adapters.pollinations;
  }

  /**
   * Menjalankan chat completion dengan auto-fallback jika gagal
   */
  async chatWithFallback({ messages, model, temperature, maxTokens, stream = false, onChunk, signal }) {
    const primaryAdapter = this.resolveAdapterForModel(model);
    const candidateAdapters = [primaryAdapter];

    // Tambahkan fallback adapter lain yang aktif
    for (const adapter of Object.values(this.adapters)) {
      if (adapter.isConfigured() && !candidateAdapters.includes(adapter)) {
        candidateAdapters.push(adapter);
      }
    }
    // Pastikan Pollinations ada di urutan terakhir sebagai pengaman absolut
    if (!candidateAdapters.includes(this.adapters.pollinations)) {
      candidateAdapters.push(this.adapters.pollinations);
    }

    let lastError = null;

    for (let i = 0; i < candidateAdapters.length; i++) {
      const adapter = candidateAdapters[i];
      const isFallback = i > 0;
      let effectiveModel = model;

      if (isFallback) {
        // Ambil default model untuk adapter fallback
        const models = await adapter.getModels();
        if (models.length > 0) {
          effectiveModel = models[0].id;
        }
      }

      try {
        const result = await adapter.chatCompletion({
          messages,
          model: effectiveModel,
          temperature,
          maxTokens,
          stream,
          onChunk,
          signal
        });

        return {
          ...result,
          provider: adapter.name,
          fallbackUsed: isFallback
        };
      } catch (err) {
        console.warn(`[Auto-Fallback] Adapter ${adapter.name} gagal (${err.message}). Mencoba fallback...`);
        lastError = err;
      }
    }

    throw new Error(`Semua provider AI gagal memproses permintaan. Detail error terakhir: ${lastError?.message || 'Tidak diketahui'}`);
  }
}

module.exports = new ProviderManager();
