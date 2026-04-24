const fs = require('fs');
const path = require('path');

// Get API keys from environment variables (Netlify) or .env file (local)
let apiKeys = [];

// Try to get multiple keys from environment variables
for (let i = 1; i <= 5; i++) {
  const key = process.env[`OPENROUTER_API_KEY_${i}`] || process.env[`OPENROUTER_API_KEY`];
  if (key && !apiKeys.includes(key)) {
    apiKeys.push(key);
  }
}

// If no env vars, try to read from .env file (for local development)
if (apiKeys.length === 0) {
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
    
    // Try multiple keys from .env
    for (let i = 1; i <= 5; i++) {
      const key = envVars[`OPENROUTER_API_KEY_${i}`] || envVars[`OPENROUTER_API_KEY`];
      if (key && !apiKeys.includes(key)) {
        apiKeys.push(key);
      }
    }
  }
}

if (apiKeys.length === 0) {
  console.error('API key not found in environment variable or .env file');
  process.exit(1);
}

console.log(`Found ${apiKeys.length} API key(s)`);

// Read ai-client.js
const aiClientPath = path.join(__dirname, 'ai-client.js');
let aiClientContent = fs.readFileSync(aiClientPath, 'utf8');

// Replace process.env.OPENROUTER_API_KEYS with actual API keys array
const keysArray = JSON.stringify(apiKeys);
aiClientContent = aiClientContent.replace(
  /process\.env\.OPENROUTER_API_KEYS/g,
  keysArray
);

// Write back
fs.writeFileSync(aiClientPath, aiClientContent);
console.log('Build complete: API keys injected');
