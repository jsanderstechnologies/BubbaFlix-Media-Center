const axios = require('axios');
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
    const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
    let title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim() : '';
    let link = linkMatch ? linkMatch[1] : '';
    
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
    
    items.push({ orig: title, clean: cleanTitle });
  }
  console.log("Found", items.length, "items.");
  for (let i = 0; i < Math.min(5, items.length); i++) {
    console.log("Original:", items[i].orig);
    console.log("Cleaned:", items[i].clean);
  }
}
run();
