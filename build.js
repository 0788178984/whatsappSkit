const fs = require('fs');
const path = require('path');

// Get API key from environment variable (Netlify) or .env file (local)
let apiKey = process.env.OPENROUTER_API_KEY || '';

// If no env var, try to read from .env file (for local development)
if (!apiKey) {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        envVars[key.trim()] = value.trim();
      }
    });
    apiKey = envVars.OPENROUTER_API_KEY || '';
  }
}

if (!apiKey) {
  console.error('API key not found in environment variable or .env file');
  process.exit(1);
}

// Read ai-client.js
const aiClientPath = path.join(__dirname, 'ai-client.js');
let aiClientContent = fs.readFileSync(aiClientPath, 'utf8');

// Replace process.env.OPENROUTER_API_KEY with actual API key
aiClientContent = aiClientContent.replace(
  /process\.env\.OPENROUTER_API_KEY/g,
  `'${apiKey}'`
);

// Write back
fs.writeFileSync(aiClientPath, aiClientContent);
console.log('Build complete: API key injected');
