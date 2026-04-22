/**
 * Skit Parser - Converts text scripts into WhatsApp message format
 * Supports multiple input formats for flexibility
 */

class SkitParser {
  constructor() {
    // Common time patterns
    this.timePattern = /^(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*/i;
    
    // Sender patterns
    this.senderPatterns = [
      { regex: /^(ME|I|SENDER|SELF):\s*/i, type: 'sent' },
      { regex: /^(THEM|OTHER|PERSON|YOU|FRIEND|CONTACT):\s*/i, type: 'received' },
      { regex: /^@([\w\s]+):\s*/, type: 'named' },
      { regex: /^([A-Z][a-z]+):\s*/, type: 'auto' }
    ];
    
    // Special directives
    this.directivePattern = /^--(\w+):\s*(.+)$/;
    
    // Date directive
    this.datePattern = /^DATE:\s*(.+)$/i;
    
    // Pause directive
    this.pausePattern = /^PAUSE:\s*(\d+)\s*(?:s|sec|seconds)?$/i;
  }

  /**
   * Main parse function
   * @param {string} script - Raw skit text
   * @returns {Object} Parsed skit data with messages array
   */
  parse(script) {
    const lines = script.split('\n').map(l => l.trim()).filter(l => l);
    
    const result = {
      date: 'Today',
      title: '',
      messages: [],
      metadata: {}
    };
    
    let currentSender = null;
    let senders = new Map();
    let senderCounter = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip empty lines and comments
      if (!line || line.startsWith('//') || line.startsWith('#')) continue;
      
      // Check for date directive
      const dateMatch = line.match(this.datePattern);
      if (dateMatch) {
        result.date = dateMatch[1].trim();
        continue;
      }
      
      // Check for title directive
      if (line.toUpperCase().startsWith('TITLE:')) {
        result.title = line.substring(6).trim();
        continue;
      }
      
      // Check for pause directive
      const pauseMatch = line.match(this.pausePattern);
      if (pauseMatch) {
        result.messages.push({
          type: 'pause',
          duration: parseInt(pauseMatch[1]) * 1000
        });
        continue;
      }
      
      // Check for special directives (reactions, etc.)
      const directiveMatch = line.match(this.directivePattern);
      if (directiveMatch) {
        const [_, directive, value] = directiveMatch;
        
        if (directive.toLowerCase() === 'reaction') {
          // Add reaction to last message
          if (result.messages.length > 0) {
            result.messages[result.messages.length - 1].reaction = value.trim();
          }
        }
        continue;
      }
      
      // Parse message line
      const message = this.parseMessageLine(line, currentSender, senders, senderCounter);
      
      if (message) {
        // Track senders for auto-detection
        if (message.senderType === 'sent') {
          currentSender = 'me';
        } else if (message.senderType === 'received') {
          if (!senders.has(message.senderName)) {
            senders.set(message.senderName, senderCounter++);
          }
          currentSender = message.senderName;
        }
        
        result.messages.push(message);
      }
    }
    
    // Auto-assign sender types for named senders
    this.assignSenderTypes(result.messages);
    
    return result;
  }

  /**
   * Parse a single message line
   */
  parseMessageLine(line, currentSender, senders, counter) {
    let time = null;
    let senderType = null;
    let senderName = null;
    let content = line;
    
    // Extract time
    const timeMatch = content.match(this.timePattern);
    if (timeMatch) {
      time = this.formatTime(timeMatch[1]);
      content = content.substring(timeMatch[0].length).trim();
    }
    
    // Extract sender
    for (const pattern of this.senderPatterns) {
      const match = content.match(pattern.regex);
      if (match) {
        senderType = pattern.type;
        senderName = match[1] || (pattern.type === 'sent' ? 'ME' : 'THEM');
        content = content.substring(match[0].length).trim();
        break;
      }
    }
    
    // If no explicit sender, use context
    if (!senderType && currentSender) {
      senderType = currentSender === 'me' ? 'sent' : 'received';
      senderName = currentSender === 'me' ? 'ME' : currentSender;
    }
    
    // If still no sender, skip
    if (!senderType) return null;
    
    return {
      type: 'message',
      s: senderType,
      senderName: senderName,
      t: content,
      time: time || this.getCurrentTime(),
      reaction: null
    };
  }

  /**
   * Format time to consistent format
   */
  formatTime(timeStr) {
    // Clean up the time string
    timeStr = timeStr.trim().toUpperCase();
    
    // Ensure it has proper spacing
    timeStr = timeStr.replace(/([AP])M/i, '$1M');
    
    return timeStr;
  }

  /**
   * Get current time formatted
   */
  getCurrentTime() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  }

  /**
   * Auto-assign sender types for named conversations
   */
  assignSenderTypes(messages) {
    const uniqueSenders = new Set();
    
    messages.forEach(msg => {
      if (msg.type === 'message' && msg.senderName && msg.senderName !== 'ME') {
        uniqueSenders.add(msg.senderName);
      }
    });
    
    // If we have exactly 2 senders (including ME), assign properly
    const senderArray = Array.from(uniqueSenders);
    if (senderArray.length === 1) {
      messages.forEach(msg => {
        if (msg.type === 'message' && msg.senderName === senderArray[0]) {
          msg.s = 'received';
        }
      });
    }
  }

  /**
   * Alternative: Parse from structured format (JSON-like)
   */
  parseStructured(data) {
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        return this.parse(data);
      }
    }
    
    return {
      date: data.date || 'Today',
      title: data.title || '',
      messages: (data.messages || []).map(m => ({
        type: 'message',
        s: m.s || m.sender || m.type || 'received',
        t: m.t || m.text || m.content || '',
        time: m.time || this.getCurrentTime(),
        reaction: m.reaction || null
      }))
    };
  }

  /**
   * Parse from simple dialogue format
   * Format:
   * John: Hey there
   * Mary: Hi!
   * John: How are you?
   */
  parseSimpleDialogue(script) {
    const lines = script.split('\n').map(l => l.trim()).filter(l => l);
    const messages = [];
    const senderMap = new Map();
    let senderIndex = 0;
    
    lines.forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const sender = line.substring(0, colonIndex).trim();
        const text = line.substring(colonIndex + 1).trim();
        
        if (!senderMap.has(sender)) {
          senderMap.set(sender, senderIndex++);
        }
        
        const senderIdx = senderMap.get(sender);
        // First sender is "ME" (sent), others are received
        const type = senderIdx === 0 ? 'sent' : 'received';
        
        messages.push({
          type: 'message',
          s: type,
          senderName: sender,
          t: text,
          time: this.getCurrentTime(),
          reaction: null
        });
      }
    });
    
    return {
      date: 'Today',
      title: '',
      messages: messages
    };
  }
}

// Create global instance
const skitParser = new SkitParser();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SkitParser;
}
