# 📱 WhatsApp Skit Maker

Create realistic WhatsApp chat videos from skit stories. Perfect for TikTok, Instagram Reels, YouTube Shorts, and social media content.

![WhatsApp Skit Maker](preview.png)

## ✨ Features

- **Realistic WhatsApp Interface** - Pixel-perfect recreation of WhatsApp Android UI
- **Smart Story Parser** - Convert plain text stories into animated chats
- **Real-time Video Export** - Record and download MP4/WebM videos
- **Typing Animations** - Authentic typing indicators and message reveal
- **Reaction Support** - Add emoji reactions to messages
- **Customizable Contacts** - Change names, colors, and online status
- **Multiple Export Options** - Screen capture or canvas-based recording

## 🚀 Quick Start

1. **Open the app**: Open `index.html` in a modern browser (Chrome/Edge/Firefox)

2. **Write your skit** or load an example:
   ```
   ME: Hey there! 😊
   THEM: Hi! Who is this?
   ME: It's me, from yesterday
   ```

3. **Customize settings**: Contact name, colors, date, typing speed

4. **Export video**: Click "Preview & Export Video" to generate MP4

## 📝 Skit Script Format

### Basic Format
```
ME: Your message here
THEM: Their response here
ME: Your reply
```

### With Times
```
7:30 PM ME: Hey, are you free?
7:32 PM THEM: Yeah, what's up?
```

### With Reactions
```
ME: I have something to tell you
THEM: What is it? 🤔
THEM: Don't scare me 😰
--reaction: 😂
ME: I got the job! 🎉
--reaction: 🎊
```

### Advanced Features
```
DATE: Monday · The Confession
TITLE: Part 1

ME: I need to tell you something
PAUSE: 2
THEM: What is it?
ME: I like you ❤️
```

## 🎨 Script Syntax Reference

| Syntax | Description |
|--------|-------------|
| `ME:` or `SENDER:` | Sent message (green bubble, right) |
| `THEM:` or `OTHER:` | Received message (white bubble, left) |
| `7:30 PM` | Timestamp (auto-detected at start) |
| `--reaction: emoji` | Add reaction to previous message |
| `DATE: text` | Set date chip text |
| `TITLE: text` | Set skit title |
| `PAUSE: seconds` | Add pause in conversation |
| `// comment` | Comments (ignored) |

## 📐 Export Settings

### Resolutions
- **1080×1920** - Full HD vertical (TikTok/Instagram)
- **720×1280** - HD vertical (Recommended)
- **480×854** - Standard vertical

### Frame Rates
- **60 FPS** - Smooth motion
- **30 FPS** - Standard (Recommended)
- **24 FPS** - Cinematic

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `R` | Reset chat |
| `E` | Start export |

## 🔧 Technical Details

### Browser Compatibility
- Chrome 90+ (Recommended)
- Edge 90+
- Firefox 88+
- Safari 14+ (limited)

### Recording Methods
1. **Screen Capture** (Default): Uses `getDisplayMedia()` - highest quality
2. **Canvas Recording**: Uses `canvas.captureStream()` - requires html-to-image library

### Output Format
- Primary: **WebM** (VP9/VP8) - universally supported
- With FFmpeg.js: **MP4** (H.264/AAC) - converted from WebM

## 📦 Project Structure

```
whatsapp-skit-maker/
├── index.html           # Main application
├── styles.css           # WhatsApp UI styles
├── app.js              # Application logic
├── skit-parser.js      # Story parser
├── whatsapp-renderer.js # Chat animations
├── video-exporter.js   # Video recording
├── example-skits/      # Sample stories
│   ├── romance.txt
│   ├── comedy.txt
│   └── drama.txt
└── README.md
```

## 🎯 Tips for Best Results

1. **Keep it conversational** - Natural back-and-forth works best
2. **Use realistic timing** - Vary message lengths and pauses
3. **Add reactions** - They make chats feel authentic
4. **Preview before export** - Check the timing feels right
5. **Use screen capture** - Better quality than canvas recording

## 🐛 Troubleshooting

### Recording doesn't start
- Check browser permissions for screen capture
- Try refreshing the page
- Ensure you're on HTTPS or localhost

### Video quality is low
- Increase resolution to 1080p
- Use screen capture mode
- Close other browser tabs

### Export format is WebM not MP4
- Include FFmpeg.js for MP4 conversion
- WebM plays in most modern players
- Convert externally if needed

## 🔄 Future Enhancements

- [ ] Voice message support
- [ ] Image/media message support
- [ ] Group chat mode
- [ ] Custom themes
- [ ] Batch export
- [ ] Template library

## 📄 License

MIT License - Feel free to use for personal and commercial projects.

## 🙏 Credits

- WhatsApp UI design inspired by WhatsApp Messenger
- Built with vanilla JavaScript - no frameworks required

---

Made with ❤️ for content creators
