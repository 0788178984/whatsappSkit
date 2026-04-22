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
  }

  /**
   * Clear all messages
   */
  clearChat() {
    // Keep only the date chip
    if (this.chatArea) {
      const dateChip = this.chatArea.querySelector('.date-chip');
      const wallpaper = this.chatArea.querySelector('.chat-wallpaper');
      this.chatArea.innerHTML = '';
      if (wallpaper) this.chatArea.appendChild(wallpaper);
      if (dateChip) this.chatArea.appendChild(dateChip);
    }
    
    this.clearTimeouts();
    this.messageIndex = 0;
    this.isPlaying = false;
  }

  /**
   * Clear all pending timeouts
   */
  clearTimeouts() {
    this.timeouts.forEach(t => clearTimeout(t));
    this.timeouts = [];
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
      // Sent message - no typing indicator
      this.showMessage(msg);
      
      if (this.onMessageCallback) {
        this.onMessageCallback(msg, this.messageIndex);
      }
      
      const timeout = setTimeout(() => {
        this.messageIndex++;
        this.processNextMessage();
      }, messageDelay);
      this.timeouts.push(timeout);
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
    dateChip.textContent = this.dateChip?.textContent || 'Today';
    this.chatArea.appendChild(dateChip);
    this.dateChip = dateChip;
    
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
