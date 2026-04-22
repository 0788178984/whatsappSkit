/**
 * WhatsApp Renderer - Handles the realistic chat interface and animations
 */

class WhatsAppRenderer {
  constructor(options = {}) {
    this.options = {
      phoneSelector: '#phone',
      chatAreaSelector: '#chatArea',
      headerNameSelector: '#headerName',
      headerStatusSelector: '#headerStatus',
      headerAvatarSelector: '#headerAvatar',
      dateChipSelector: '#dateChip',
      onlineDotSelector: '#onlineDot',
      typingSpeed: 'normal',
      ...options
    };
    
    this.phone = document.querySelector(this.options.phoneSelector);
    this.chatArea = document.querySelector(this.options.chatAreaSelector);
    this.headerName = document.querySelector(this.options.headerNameSelector);
    this.headerStatus = document.querySelector(this.options.headerStatusSelector);
    this.headerAvatar = document.querySelector(this.options.headerAvatarSelector);
    this.dateChip = document.querySelector(this.options.dateChipSelector);
    this.onlineDot = document.querySelector(this.options.onlineDotSelector);
    this.chatWallpaper = this.chatArea?.querySelector('#chatWallpaper') || null;
    this.avatarImage = this.headerAvatar?.querySelector('#avatarImage') || null;
    this.inputBox = document.querySelector('#inputBox');
    this.inputText = document.querySelector('#inputText');
    this.keyboardOverlay = document.querySelector('#keyboardOverlay');
    this.composePreview = document.querySelector('#composePreview');
    
    this.isPlaying = false;
    this.timeouts = [];
    this.currentMessages = [];
    this.messageIndex = 0;
    
    this.typingSpeeds = {
      fast: { base: 800, perChar: 20, typing: 600 },
      normal: { base: 1200, perChar: 35, typing: 1100 },
      slow: { base: 1800, perChar: 50, typing: 1500 }
    };
    
    this.onMessageCallback = null;
    this.onCompleteCallback = null;
  }

  /**
   * Update contact settings
   */
  setContact(name, initial, colors, showOnline = true) {
    if (this.headerName) this.headerName.textContent = name;
    if (this.headerAvatar && initial) {
      const initialEl = this.headerAvatar.querySelector('#avatarInitial');
      if (initialEl) initialEl.textContent = initial;
    }
    if (this.headerAvatar && colors) {
      this.headerAvatar.style.background = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
    }
    if (this.onlineDot) {
      this.onlineDot.classList.toggle('hidden', !showOnline);
    }
  }

  /**
   * Set or clear custom avatar image
   */
  setAvatarImage(imageUrl = null) {
    if (!this.headerAvatar || !this.avatarImage) return;

    if (imageUrl) {
      this.avatarImage.src = imageUrl;
      this.headerAvatar.classList.add('has-image');
      return;
    }

    this.avatarImage.removeAttribute('src');
    this.headerAvatar.classList.remove('has-image');
  }

  /**
   * Update chat date/title
   */
  setDate(dateText) {
    if (this.dateChip) {
      this.dateChip.textContent = dateText;
    }
    // Hide e2e notice when custom date is set (user overrode default)
    const e2e = this.chatArea?.querySelector('.e2e-notice');
    if (e2e) {
      const isDefault = !dateText || dateText === this.formatCurrentDate();
      e2e.style.display = isDefault ? '' : 'none';
    }
  }

  /**
   * Format current date as WhatsApp-style (e.g. April 22, 2026)
   */
  formatCurrentDate() {
    const now = new Date();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  }

  /**
   * Clear all messages
   */
  clearChat() {
    // Keep only the date chip and e2e notice
    if (this.chatArea) {
      const dateChip = this.chatArea.querySelector('.date-chip');
      const e2eNotice = this.chatArea.querySelector('.e2e-notice');
      const wallpaper = this.chatArea.querySelector('.chat-wallpaper');
      this.chatArea.innerHTML = '';
      if (wallpaper) this.chatArea.appendChild(wallpaper);
      if (dateChip) this.chatArea.appendChild(dateChip);
      if (e2eNotice) this.chatArea.appendChild(e2eNotice);
    }
    
    this.clearTimeouts();
    this.messageIndex = 0;
    this.isPlaying = false;
    this.setKeyboardVisible(false);
    this.setComposePreview('');
    this.setInputText('');
  }

  /**
   * Clear all pending timeouts
   */
  clearTimeouts() {
    this.timeouts.forEach(t => clearTimeout(t));
    this.timeouts = [];
  }

  setKeyboardVisible(visible) {
    if (!this.keyboardOverlay) return;
    this.keyboardOverlay.classList.toggle('show', !!visible);
  }

  setComposePreview(text) {
    if (!this.composePreview) return;
    this.composePreview.textContent = text || '';
  }

  setInputText(text) {
    if (!this.inputText || !this.inputBox) return;
    this.inputText.textContent = text || '';
    this.inputBox.classList.toggle('typing', !!text);
  }

  flashKey(key) {
    const el = document.querySelector(`.kb-key[data-key="${key}"]`);
    if (!el) return;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 80);
  }

  normalizeKey(char) {
    const c = (char || '').toLowerCase();
    if (c >= 'a' && c <= 'z') return c;
    if (c === ' ') return 'space';
    if (c === '\n') return 'enter';
    return 'emoji';
  }

  simulateTypingIntoInput(text, totalMs) {
    return new Promise((resolve) => {
      const raw = String(text || '');
      const chars = Array.from(raw);
      const steps = Math.max(1, chars.length);
      const stepMs = Math.max(18, Math.floor(totalMs / steps));
      let i = 0;
      this.setInputText('');
      
      const interval = setInterval(() => {
        if (i >= chars.length) {
          clearInterval(interval);
          resolve();
          return;
        }
        const next = chars[i++];
        const current = (this.inputText?.textContent || '') + next;
        this.setInputText(current);
        this.flashKey(this.normalizeKey(next));
      }, stepMs);
      
      // ensure cleared when paused/stopped
      this.timeouts.push(interval);
    });
  }

  /**
   * Load messages and prepare for playback
   */
  loadMessages(messages) {
    this.currentMessages = messages;
    this.messageIndex = 0;
    this.clearChat();
  }

  /**
   * Start playing the chat animation
   */
  play(startIndex = 0, onMessage = null, onComplete = null) {
    if (this.isPlaying) return;
    
    this.isPlaying = true;
    this.messageIndex = startIndex;
    this.onMessageCallback = onMessage;
    this.onCompleteCallback = onComplete;
    
    this.processNextMessage();
  }

  /**
   * Pause playback
   */
  pause() {
    this.isPlaying = false;
    this.clearTimeouts();
  }

  /**
   * Resume playback
   */
  resume() {
    if (!this.isPlaying && this.messageIndex < this.currentMessages.length) {
      this.isPlaying = true;
      this.processNextMessage();
    }
  }

  /**
   * Stop and reset
   */
  stop() {
    this.pause();
    this.messageIndex = 0;
  }

  /**
   * Process the next message in queue
   */
  processNextMessage() {
    if (!this.isPlaying || this.messageIndex >= this.currentMessages.length) {
      this.isPlaying = false;
      if (this.onCompleteCallback) {
        this.onCompleteCallback();
      }
      return;
    }

    const msg = this.currentMessages[this.messageIndex];
    
    // Handle pause
    if (msg.type === 'pause') {
      const timeout = setTimeout(() => {
        this.messageIndex++;
        this.processNextMessage();
      }, msg.duration);
      this.timeouts.push(timeout);
      return;
    }

    const speed = this.typingSpeeds[this.options.typingSpeed] || this.typingSpeeds.normal;
    const typingDelay = speed.typing;
    const messageDelay = speed.base + (msg.t.length * speed.perChar);

    // Show typing indicator for received messages
    if (msg.s === 'received') {
      this.headerStatus.textContent = 'typing...';
      this.setKeyboardVisible(true);
      this.setComposePreview(msg.t);
      
      const typingWrapper = document.createElement('div');
      typingWrapper.className = 'typing-wrap';
      typingWrapper.innerHTML = `
        <div class="typing-bubble">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
      `;
      this.chatArea.appendChild(typingWrapper);
      this.scrollToBottom();
      
      // Animate typing appearance
      requestAnimationFrame(() => {
        typingWrapper.classList.add('show');
      });

      // Remove typing and show message
      const timeout1 = setTimeout(() => {
        typingWrapper.remove();
        this.headerStatus.textContent = 'online';
        this.setKeyboardVisible(false);
        this.setComposePreview('');
        this.showMessage(msg);
        
        // Notify callback
        if (this.onMessageCallback) {
          this.onMessageCallback(msg, this.messageIndex);
        }
        
        // Schedule next message
        const timeout2 = setTimeout(() => {
          this.messageIndex++;
          this.processNextMessage();
        }, messageDelay);
        this.timeouts.push(timeout2);
        
      }, typingDelay);
      this.timeouts.push(timeout1);
      
    } else {
      // Sent message - animate keyboard + input typing before sending
      this.setKeyboardVisible(true);
      this.setComposePreview('');

      this.simulateTypingIntoInput(msg.t, messageDelay).then(() => {
        this.setKeyboardVisible(false);
        this.setInputText('');
        this.showMessage(msg);

        if (this.onMessageCallback) {
          this.onMessageCallback(msg, this.messageIndex);
        }

        const timeout = setTimeout(() => {
          this.messageIndex++;
          this.processNextMessage();
        }, 300);
        this.timeouts.push(timeout);
      });
    }
  }

  /**
   * Show a message in the chat
   */
  showMessage(msg) {
    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrap ${msg.s}`;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `msg ${msg.s}`;
    
    const ticks = msg.s === 'sent' ? '<span class="ticks">✓✓</span>' : '';
    messageDiv.innerHTML = `
      <span class="msg-text">${this.escapeHtml(msg.t)}</span>
      <span class="msg-meta">${msg.time}${ticks}</span>
    `;
    
    wrapper.appendChild(messageDiv);
    
    // Add reaction if present
    if (msg.reaction) {
      const reaction = document.createElement('div');
      reaction.className = 'reaction';
      reaction.textContent = msg.reaction;
      wrapper.appendChild(reaction);
      
      // Animate reaction after message appears
      setTimeout(() => {
        reaction.classList.add('show');
      }, 300);
    }
    
    this.chatArea.appendChild(wrapper);
    this.scrollToBottom();
    
    // Animate message appearance
    requestAnimationFrame(() => {
      wrapper.classList.add('show');
    });
  }

  /**
   * Scroll chat to bottom
   */
  scrollToBottom() {
    if (this.chatArea) {
      this.chatArea.scrollTop = this.chatArea.scrollHeight;
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get current playback progress
   */
  getProgress() {
    if (!this.currentMessages.length) return 0;
    return this.messageIndex / this.currentMessages.length;
  }

  /**
   * Get estimated total duration
   */
  getEstimatedDuration() {
    const speed = this.typingSpeeds[this.options.typingSpeed] || this.typingSpeeds.normal;
    let duration = 0;
    
    this.currentMessages.forEach(msg => {
      if (msg.type === 'pause') {
        duration += msg.duration;
      } else {
        duration += speed.base + (msg.t.length * speed.perChar);
        if (msg.s === 'received') {
          duration += speed.typing;
        }
      }
    });
    
    return duration;
  }

  /**
   * Skip to a specific message index
   */
  skipTo(index) {
    this.clearTimeouts();
    
    // Clear chat and show all messages up to index
    const wallpaper = this.chatArea.querySelector('.chat-wallpaper');
    this.chatArea.innerHTML = '';
    if (wallpaper) {
      this.chatArea.appendChild(wallpaper);
    }

    const dateChip = document.createElement('div');
    dateChip.className = 'date-chip';
    dateChip.id = 'dateChip';
    dateChip.textContent = this.dateChip?.textContent || this.formatCurrentDate();
    this.chatArea.appendChild(dateChip);
    this.dateChip = dateChip;

    // Re-add e2e notice
    const e2eNotice = document.createElement('div');
    e2eNotice.className = 'e2e-notice';
    e2eNotice.id = 'e2eNotice';
    e2eNotice.innerHTML = '<svg class="e2e-lock" viewBox="0 0 10 12" width="10" height="12"><path d="M5 0C3.07 0 1.5 1.57 1.5 3.5V5H1a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-.5V3.5C8.5 1.57 6.93 0 5 0zm0 1.5c1.1 0 2 .9 2 2V5H3V3.5c0-1.1.9-2 2-2z" fill="#6B7C85"/></svg> Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.';
    this.chatArea.appendChild(e2eNotice);
    
    for (let i = 0; i <= index && i < this.currentMessages.length; i++) {
      const msg = this.currentMessages[i];
      if (msg.type === 'message') {
        this.showMessage(msg);
      }
    }
    
    this.messageIndex = index + 1;
  }

  /**
   * Take a screenshot of current state
   */
  captureCanvas() {
    return new Promise((resolve) => {
      // Use html2canvas or similar if available
      // For now, use the native canvas capture approach
      const canvas = document.createElement('canvas');
      const rect = this.phone.getBoundingClientRect();
      
      canvas.width = rect.width;
      canvas.height = rect.height;
      
      const ctx = canvas.getContext('2d');
      
      // This is a placeholder - actual implementation would use
      // html2canvas or DOM-to-image library
      resolve(canvas);
    });
  }
}

// Create global instance
let whatsappRenderer = null;

function initRenderer(options) {
  whatsappRenderer = new WhatsAppRenderer(options);
  return whatsappRenderer;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WhatsAppRenderer;
}
