const https = require('https');
const http = require('http');

function get(url, extraHeaders = {}) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const opts = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', ...extraHeaders }, timeout: 10000 };
    const req = mod.get(url, opts, (res) => {
      // Follow redirects
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return get(res.headers.location, extraHeaders).then(resolve);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data.substring(0, 300) }); }
      });
    });
    req.on('error', (e) => resolve({ status: 'ERR', body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
  });
}

async function testAll() {
  const query = encodeURIComponent('breaking bad');

  // LimeTorrents with redirect follow
  let r = await get(`https://www.limetorrents.lol/search/all/breaking-bad/seeds/1/`);
  console.log(`LimeTorrents: ${r.status}`, typeof r.body === 'string' ? `HTML ${r.body.length} chars, snippet: ${r.body.substring(0, 100)}` : JSON.stringify(r.body).substring(0, 150));

  // TorrentCSV (RARBG data dump - a community-maintained CSV/API)
  r = await get(`https://torrentcsv.com/api/search?q=${query}&page=0`);
  console.log(`TorrentCSV: ${r.status}`, JSON.stringify(r.body).substring(0, 200));

  // iTorrents (info hash lookup)
  r = await get(`https://torrentproject.se/?t=${query}&s=0&out=json`);
  console.log(`TorrentProject.se: ${r.status}`, JSON.stringify(r.body).substring(0, 200));

  // Torznab / Jackett-based public proxy
  r = await get(`https://jackett.kyvn.net/api/v2.0/indexers/all/results?query=${query}&apikey=test`);
  console.log(`Jackett proxy: ${r.status}`, JSON.stringify(r.body).substring(0, 200));
  
  // TorrentGalaxy RSS feed (might bypass cloudflare)
  r = await get(`https://tgx.rs/rss.xml?q=${query}`);
  console.log(`TGX RSS: ${r.status}`, typeof r.body === 'string' ? `${r.body.length} chars, snippet: ${r.body.substring(0, 100)}` : JSON.stringify(r.body).substring(0,150));

  // 1337x RSS feed
  r = await get(`https://1337x.to/rss.xml`);
  console.log(`1337x RSS: ${r.status}`, typeof r.body === 'string' ? `${r.body.length} chars` : '');
}

testAll().then(() => console.log('Done'));
