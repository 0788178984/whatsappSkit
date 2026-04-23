/**
 * AI Client for OpenRouter API
 * Provides script generation and organization using free AI models
 */

// OpenRouter API configuration
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Free models to try (fallback chain)
const FREE_MODELS = [
  'openrouter/free', // Smart router that selects free models
  'huggingface/zephyr-7b-beta:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'microsoft/wizardlm-2-8x22b:free',
  'mistralai/mistral-7b-instruct:free'
];

class AIClient {
  constructor() {
    this.apiKey = '' || '';
    this.currentModel = FREE_MODELS[0]; // Start with smart router
    this.rateLimitDelay = 1000; // 1 second between requests
    this.lastRequestTime = 0;
  }

  async makeRequest(endpoint, data) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();

    const response = await fetch(`${OPENROUTER_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'WhatsApp Skit Maker'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(error.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  async generateScript(prompt, context = '') {
    const systemPrompt = `You are a WhatsApp chat script writer. Create natural, flowing conversations in WhatsApp format.

Format rules:
- Use "ME:" for sent messages, "THEM:" for received messages
- Add timestamps occasionally (like "8:45 PM") for realism
- Include emojis naturally in messages
- Add reactions with "--reaction: emoji" after relevant messages
- Keep conversations realistic and engaging
- Focus on dialogue that tells a story

${context ? `Additional context: ${context}` : ''}

Generate a complete, natural WhatsApp conversation based on the user's request.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];

    try {
      const response = await this.makeRequest('/chat/completions', {
        model: this.currentModel,
        messages: messages,
        max_tokens: 2000,
        temperature: 0.7
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      // Try fallback models if the current one fails
      if (this.currentModel !== FREE_MODELS[FREE_MODELS.length - 1]) {
        const currentIndex = FREE_MODELS.indexOf(this.currentModel);
        this.currentModel = FREE_MODELS[currentIndex + 1];
        console.log(`Switching to fallback model: ${this.currentModel}`);
        return this.generateScript(prompt, context);
      }
      throw error;
    }
  }

  async organizeScript(rawText) {
    const systemPrompt = `You are a WhatsApp chat organizer. Take raw conversation text and format it into proper WhatsApp script format.

Format rules:
- Convert to "ME:" for sent messages, "THEM:" for received messages
- Add realistic timestamps occasionally
- Add appropriate emojis to messages
- Add reactions with "--reaction: emoji" where they fit naturally
- Clean up and improve the conversation flow
- Make it look like a real WhatsApp chat

Input: Raw conversation text that may be messy or unformatted
Output: Clean, properly formatted WhatsApp script`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Please organize this conversation into WhatsApp format:\n\n${rawText}` }
    ];

    try {
      const response = await this.makeRequest('/chat/completions', {
        model: this.currentModel,
        messages: messages,
        max_tokens: 2000,
        temperature: 0.3 // Lower temperature for more consistent formatting
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      // Try fallback models
      if (this.currentModel !== FREE_MODELS[FREE_MODELS.length - 1]) {
        const currentIndex = FREE_MODELS.indexOf(this.currentModel);
        this.currentModel = FREE_MODELS[currentIndex + 1];
        console.log(`Switching to fallback model: ${this.currentModel}`);
        return this.organizeScript(rawText);
      }
      throw error;
    }
  }

  getCurrentModel() {
    return this.currentModel;
  }
}

// Global AI client instance
window.AIClient = new AIClient();
