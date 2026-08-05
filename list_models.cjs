const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function test() {
  try {
    const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      console.log('No settings.json at', settingsPath);
      return;
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const apiKey = settings.geminiApiKey;

    if (!apiKey) {
      console.log('No API key found');
      return;
    }

    const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    console.log(res.data.models.map(m => m.name).join('\n'));
  } catch (err) {
    console.error(err.response?.status, err.response?.data);
  }
}

test();
