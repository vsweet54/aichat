/**
 * Base Provider Adapter Definition
 */
class BaseAdapter {
  constructor(name) {
    this.name = name;
  }

  isConfigured() {
    return false;
  }

  async getModels() {
    return [];
  }

  /**
   * Execute chat completion
   * @param {Object} options
   * @param {Array} options.messages
   * @param {string} options.model
   * @param {number} [options.temperature=0.7]
   * @param {number} [options.maxTokens=2048]
   * @param {boolean} [options.stream=false]
   * @param {Function} [options.onChunk]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<{ content: string, model: string, usage: Object }>}
   */
  async chatCompletion(_options) {
    throw new Error(`chatCompletion not implemented for ${this.name}`);
  }
}

module.exports = BaseAdapter;
