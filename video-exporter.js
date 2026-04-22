/**
 * Video Exporter - Records WhatsApp chat and exports as MP4
 * Uses MediaRecorder API with canvas capture
 */

class VideoExporter {
  constructor(options = {}) {
    this.options = {
      fps: 30,
      resolution: '720', // 720, 1080, 480
      phoneSelector: '#phone',
      canvasSelector: '#captureCanvas',
      quality: 0.95,
      ...options
    };
    
    this.phone = document.querySelector(this.options.phoneSelector);
    this.canvas = document.querySelector(this.options.canvasSelector);
    this.ctx = this.canvas?.getContext('2d');
    
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.stream = null;
    this.captureInterval = null;
    this.captureInProgress = false;
    this.captureTimer = null;
    this.consecutiveFrameErrors = 0;
    this.ffmpeg = null;
    this.ffmpegLoaded = false;
    
    this.resolutions = {
      '1080': { width: 1080, height: 1920 },
      '720': { width: 720, height: 1280 },
      '480': { width: 480, height: 854 }
    };
  }

  /**
   * Initialize canvas with target resolution
   */
  initCanvas() {
    const res = this.resolutions[this.options.resolution] || this.resolutions['720'];
    this.canvas.width = res.width;
    this.canvas.height = res.height;
    this.canvas.style.width = res.width + 'px';
    this.canvas.style.height = res.height + 'px';
  }

  /**
   * Compute a capture scale that maps phone capture 1:1 to final draw size.
   * This avoids repeated downsampling blur and keeps export closer to preview.
   */
  getCaptureScale(resolution) {
    if (!this.phone) return 1;

    const rect = this.phone.getBoundingClientRect();
    if (!rect.width || !rect.height) return 1;

    const fitScale = Math.min(
      resolution.width / rect.width,
      resolution.height / rect.height
    );

    // Clamp to a practical range for performance + fidelity.
    return Math.max(1, Math.min(2.2, fitScale));
  }

  /**
   * Capture a single frame from the phone element using html2canvas
   */
  async captureFrame() {
    if (!this.phone || !this.canvas || !this.ctx) return;
    if (this.captureInProgress) return;
    
    const res = this.resolutions[this.options.resolution] || this.resolutions['720'];
    
    try {
      this.captureInProgress = true;
      // Use html2canvas library (faster for video capture)
      if (typeof html2canvas !== 'undefined') {
        const captureScale = this.getCaptureScale(res);
        const phoneCanvas = await html2canvas(this.phone, {
          scale: captureScale,
          backgroundColor: '#1a1a2e',
          logging: false,
          useCORS: true,
          allowTaint: true,
          imageTimeout: 0,
          removeContainer: true
        });
        
        // Clear and draw
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.imageSmoothingQuality = 'high';
        
        // Center the phone canvas on output canvas
        const phoneWidth = phoneCanvas.width;
        const phoneHeight = phoneCanvas.height;
        
        const scale = Math.min(
          res.width / phoneWidth,
          res.height / phoneHeight
        );
        
        const drawWidth = phoneWidth * scale;
        const drawHeight = phoneHeight * scale;
        const x = (res.width - drawWidth) / 2;
        const y = (res.height - drawHeight) / 2;
        
        this.ctx.drawImage(phoneCanvas, x, y, drawWidth, drawHeight);
        this.consecutiveFrameErrors = 0;
        
      } else {
        console.warn('html2canvas library not loaded. Please check internet connection.');
      }
    } catch (err) {
      console.error('Frame capture error:', err);
      this.consecutiveFrameErrors += 1;
      if (this.consecutiveFrameErrors >= 8) {
        console.warn('Frequent frame capture failures detected. Lowering capture load may help.');
      }
    } finally {
      this.captureInProgress = false;
    }
  }

  /**
   * Alternative capture using element screenshot API
   */
  async captureWithElementScreenshot() {
    // This is a placeholder for browser-specific screenshot APIs
    // Would need polyfill or library like html-to-image
    console.warn('No screenshot library available. Please include html-to-image or dom-to-image.');
  }

  /**
   * Start recording
   */
  async startRecording() {
    if (this.isRecording) return;

    // Wait for web fonts before first captured frame to avoid fallback text in exports
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch (err) {
        console.warn('Font readiness check failed:', err);
      }
    }
    
    this.initCanvas();
    this.recordedChunks = [];
    this.consecutiveFrameErrors = 0;
    
    // Prime first frame so recording doesn't start from blank canvas.
    await this.captureFrame();
    
    // Create canvas stream
    this.stream = this.canvas.captureStream(this.options.fps);
    
    // Try different MIME types for compatibility
    const mimeTypes = [
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp9',
      'video/webm'
    ];
    
    let selectedMimeType = '';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedMimeType = type;
        break;
      }
    }
    
    if (!selectedMimeType) {
      throw new Error('No supported video MIME type found');
    }
    
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: selectedMimeType,
      videoBitsPerSecond: this.getBitrate()
    });
    
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };
    
    this.mediaRecorder.start(250); // Collect frequent chunks for safer finalization
    this.isRecording = true;
    
    // Start frame capture loop
    this.startFrameCapture();
  }

  /**
   * Get appropriate bitrate based on resolution
   */
  getBitrate() {
    const bitrates = {
      '1080': 8000000,  // 8 Mbps
      '720': 5000000,   // 5 Mbps
      '480': 2500000    // 2.5 Mbps
    };
    return bitrates[this.options.resolution] || 5000000;
  }

  /**
   * Start continuous frame capture - uses interval for consistent timing
   */
  startFrameCapture() {
    const frameInterval = 1000 / this.options.fps;

    const runFrame = async () => {
      if (!this.isRecording) return;

      const started = performance.now();
      await this.captureFrame();
      const elapsed = performance.now() - started;
      const nextDelay = Math.max(0, frameInterval - elapsed);

      this.captureTimer = setTimeout(runFrame, nextDelay);
    };

    runFrame();
  }

  /**
   * Stop recording and get video blob
   */
  async stopRecording() {
    if (!this.isRecording) return null;
    
    this.isRecording = false;
    
    // Stop the capture interval
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
    if (this.captureTimer) {
      clearTimeout(this.captureTimer);
      this.captureTimer = null;
    }
    
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error || event);
        reject(event.error || new Error('MediaRecorder failed while stopping.'));
      };

      this.mediaRecorder.onstop = () => {
        if (!this.recordedChunks.length) {
          reject(new Error('No video chunks were captured. Recording output is empty.'));
          return;
        }

        const blob = new Blob(this.recordedChunks, { 
          type: this.mediaRecorder.mimeType 
        });

        // Stop stream tracks only after recorder has finalized output.
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
        }

        resolve(blob);
      };

      // Ask recorder to flush final pending chunk before stop.
      if (this.mediaRecorder.state === 'recording') {
        try {
          this.mediaRecorder.requestData();
        } catch (err) {
          console.warn('requestData failed before stop:', err);
        }
      }

      this.mediaRecorder.stop();
    });
  }

  /**
   * Convert webm blob to mp4 using FFmpeg.js
   */
  async convertToMp4(webmBlob) {
    const ffmpegGlobal = window.FFmpegWASM;
    const utilGlobal = window.FFmpegUtil;
    if (!ffmpegGlobal?.FFmpeg || !utilGlobal?.fetchFile) {
      throw new Error('FFmpeg wasm libraries are not available in this browser.');
    }

    if (!this.ffmpeg) {
      this.ffmpeg = new ffmpegGlobal.FFmpeg();
    }

    if (!this.ffmpegLoaded) {
      // Serve ffmpeg core assets locally to avoid cross-origin worker restrictions.
      const base = 'vendor/ffmpeg';
      const canBlobify = typeof utilGlobal.toBlobURL === 'function';
      const usingFileProtocol = window.location.protocol === 'file:';

      let coreURL = `${base}/ffmpeg-core.js`;
      let wasmURL = `${base}/ffmpeg-core.wasm`;

      // Under file://, convert assets to blob URLs for same-origin loading.
      if (canBlobify && usingFileProtocol) {
        coreURL = await utilGlobal.toBlobURL(coreURL, 'text/javascript');
        wasmURL = await utilGlobal.toBlobURL(wasmURL, 'application/wasm');
      }

      await this.ffmpeg.load({ coreURL, wasmURL });
      this.ffmpegLoaded = true;
    }

    const inputName = `input-${Date.now()}.webm`;
    const outputName = `output-${Date.now()}.mp4`;
    await this.ffmpeg.writeFile(inputName, await utilGlobal.fetchFile(webmBlob));

    try {
      // Prefer H.264 for TikTok compatibility.
      // Different ffmpeg wasm builds expose different encoder names, so try multiple.
      let converted = false;
      let lastError = null;
      const conversionProfiles = [
        [
          '-i', inputName,
          '-c:v', 'h264',
          '-preset', 'veryfast',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-an',
          outputName
        ],
        [
          '-i', inputName,
          '-c:v', 'libopenh264',
          '-preset', 'veryfast',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-an',
          outputName
        ],
        [
          '-i', inputName,
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-an',
          outputName
        ],
        [
          '-i', inputName,
          '-c:v', 'mpeg4',
          '-q:v', '2',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-an',
          outputName
        ]
      ];

      for (const profile of conversionProfiles) {
        try {
          await this.ffmpeg.exec(profile);
          converted = true;
          break;
        } catch (err) {
          lastError = err;
          console.warn('MP4 conversion profile failed, trying fallback:', err);
        }
      }

      if (!converted) {
        const reason = lastError?.message || String(lastError || 'unknown error');
        throw new Error(`All MP4 conversion profiles failed in this browser: ${reason}`);
      }

      const data = await this.ffmpeg.readFile(outputName);
      return new Blob([data.buffer], { type: 'video/mp4' });
    } finally {
      try { await this.ffmpeg.deleteFile(inputName); } catch (e) {}
      try { await this.ffmpeg.deleteFile(outputName); } catch (e) {}
    }
  }

  /**
   * Full export workflow
   */
  async export(renderer, messages, onProgress = null) {
    // Load messages
    renderer.loadMessages(messages);
    
    // Start recording
    await this.startRecording();
    
    // Wait a moment for initial frame
    await this.delay(500);
    
    // Play through messages with frame capture
    const totalMessages = messages.length;
    
    return new Promise((resolve) => {
      let lastMessageIndex = -1;
      
      const checkProgress = setInterval(() => {
        const currentIndex = renderer.messageIndex;
        
        if (currentIndex !== lastMessageIndex) {
          lastMessageIndex = currentIndex;
          if (onProgress) {
            onProgress(currentIndex / totalMessages);
          }
        }
        
        if (!renderer.isPlaying && currentIndex >= totalMessages - 1) {
          clearInterval(checkProgress);
          
          // Wait a moment for final frames
          setTimeout(async () => {
            const webmBlob = await this.stopRecording();
            
            // Try to convert to MP4
            try {
              const mp4Blob = await this.convertToMp4(webmBlob);
              resolve(mp4Blob);
            } catch (err) {
              console.warn('MP4 conversion failed, returning WebM:', err);
              resolve(webmBlob);
            }
          }, 1000);
        }
      }, 100);
      
      // Start playback
      renderer.play(0);
    });
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create download link for video
   */
  createDownloadUrl(blob) {
    return URL.createObjectURL(blob);
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.isRecording) {
      this.stopRecording();
    }
    
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
  }
}

// Alternative exporter using Screen Capture API (simpler but requires user permission)
class ScreenCaptureExporter {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
  }

  /**
   * Start recording from screen capture
   */
  async startRecording(element) {
    try {
      // Request screen capture of specific element
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'never',
          displaySurface: 'monitor'
        },
        audio: false
      });
      
      // Try to find supported MIME type
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
      ];
      
      let mimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }
      
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || 'video/webm',
        videoBitsPerSecond: 5000000
      });
      
      this.recordedChunks = [];
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };
      
      return new Promise((resolve) => {
        this.mediaRecorder.onstart = () => resolve(stream);
        this.mediaRecorder.start(100);
      });
      
    } catch (err) {
      console.error('Screen capture failed:', err);
      throw err;
    }
  }

  /**
   * Stop recording
   */
  async stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }
      
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { 
          type: this.mediaRecorder.mimeType 
        });
        resolve(blob);
      };
      
      this.mediaRecorder.stop();
    });
  }
}

// Create global instances
let videoExporter = null;
let screenCaptureExporter = null;

function initExporters(options) {
  videoExporter = new VideoExporter(options);
  screenCaptureExporter = new ScreenCaptureExporter();
  return { videoExporter, screenCaptureExporter };
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VideoExporter, ScreenCaptureExporter };
}
