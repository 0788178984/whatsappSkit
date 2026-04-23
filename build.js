const fs = require('fs');
const path = require('path');

// Read .env file
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error('.env file not found');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    envVars[key.trim()] = value.trim();
  }
});

// Read ai-client.js
const aiClientPath = path.join(__dirname, 'ai-client.js');
let aiClientContent = fs.readFileSync(aiClientPath, 'utf8');

// Replace process.env.OPENROUTER_API_KEY with actual API key
const apiKey = envVars.OPENROUTER_API_KEY || '';

aiClientContent = aiClientContent.replace(
  /process\.env\.OPENROUTER_API_KEY/g,
  `'${apiKey}'`
);

// Write back
fs.writeFileSync(aiClientPath, aiClientContent);
console.log('Build complete: API key injected');
