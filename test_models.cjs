const axios = require('axios');
async function test() {
  const model = 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=invalid_api_key_12345\n`;
  try {
    await axios.post(url, { contents: [{ parts: [{ text: 'Hello' }] }] });
  } catch (err) {
    console.log("Status:", err.response?.status, "Data:", JSON.stringify(err.response?.data));
  }
}
test();
