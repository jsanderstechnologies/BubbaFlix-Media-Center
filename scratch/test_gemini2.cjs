const axios = require('axios');
const fs = require('fs');

async function run() {
  const q = 'Deadpool';
  const fallbackUrl = `https://www.nzbindex.nl/rss/?q=${encodeURIComponent(q)}&nzblink=1`;
  const rssRes = await axios.get(fallbackUrl, {
    timeout: 7000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const xml = rssRes.data;
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  let items = [];
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
    let title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim() : '';
    
    let cleanTitle = title;
    if (cleanTitle.startsWith('"') && cleanTitle.endsWith('"')) {
      cleanTitle = cleanTitle.substring(1, cleanTitle.length - 1);
    }
    cleanTitle = cleanTitle.replace(/^\[\d+\/\d+\]\s*(-\s*)?/, '');
    cleanTitle = cleanTitle.replace(/^\(\d+\/\d+\)\s*(-\s*)?/, '');
    cleanTitle = cleanTitle.replace(/\s*yenc\s*(\(\d+\/\d+\))?.*$/i, '');
    cleanTitle = cleanTitle.replace(/\s*yenc\s*.*$/i, '');
    cleanTitle = cleanTitle.replace(/^[^"]*"\s*/, '');
    cleanTitle = cleanTitle.replace(/"\s*$/, '');
    cleanTitle = cleanTitle.trim();
    
    items.push({ name: cleanTitle, title: cleanTitle });
  }

  const list = items.map((t, i) => `${i}: ${t.name || t.title}`).join('\n');
  const prompt = `I am searching for the TV show or Movie "Deadpool". I have the following list of file result names. Please filter out any results that do not definitively belong to this show/movie, for example if they belong to a different show with a similar name. Additionally, filter out any results that appear to be in a language other than English (e.g., look for tags indicating foreign languages or dubs like ITA, FRE, GER, SPANISH, RUS, HINDI, LATINO, etc). Return ONLY a valid JSON array of indices (0-indexed) of the results that are CORRECT matches. Do not include any markdown formatting, backticks, or other text. Just the JSON array.\n\nList:\n${list}`;

  // read settings.json for api key
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync('settings.json', 'utf8')); } catch (e) {}
  
  if (!settings.geminiApiKey) { console.log("NO API KEY"); return; }
  
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${settings.geminiApiKey}`,
    { contents: [{ parts: [{ text: prompt }] }] },
    { timeout: 60000, headers: { 'Content-Type': 'application/json' } }
  );
  
  const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  console.log("Gemini Response:");
  console.log(text);
}
run();
