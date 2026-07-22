const https = require('https');
const http = require('http');

function get(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data.substring(0, 200) }); }
      });
    });
    req.on('error', (e) => resolve({ status: 'ERR', body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
  });
}

async function testAll() {
  const query = encodeURIComponent('breaking bad');

  // BitSearch
  let r = await get(`https://bitsearch.info/api/v1/search?q=${query}&page=1`);
  console.log(`BitSearch: ${r.status}`, Array.isArray(r.body?.data) ? `${r.body.data.length} results` : JSON.stringify(r.body).substring(0, 150));

  // Torrent-Api (vercel, proxies 1337x, TorrentGalaxy, etc.)
  r = await get(`https://torrents-api.vercel.app/api/v1/search?query=${query}&site=1337x&limit=5`);
  console.log(`TorrentAPI-1337x: ${r.status}`, JSON.stringify(r.body).substring(0, 150));

  r = await get(`https://torrents-api.vercel.app/api/v1/search?query=${query}&site=torrentgalaxy&limit=5`);
  console.log(`TorrentAPI-TorGalaxy: ${r.status}`, JSON.stringify(r.body).substring(0, 150));

  // EZTV JSON API (uses imdb id - let's test with known imdb id for breaking bad tt0903747)
  r = await get(`https://eztvx.to/api/get-torrents?limit=5&imdb_id=903747`);
  console.log(`EZTV: ${r.status}`, Array.isArray(r.body?.torrents) ? `${r.body.torrents.length} results` : JSON.stringify(r.body).substring(0, 150));

  // Snowfl (aggregator)
  r = await get(`https://snowfl.com/b.py?q=${query}&p=0&token=undefined`);
  console.log(`Snowfl: ${r.status}`, JSON.stringify(r.body).substring(0, 150));

  // TorrentProject
  r = await get(`https://torrentproject2.com/?t=${query}&s=0&out=json`);
  console.log(`TorrentProject: ${r.status}`, JSON.stringify(r.body).substring(0, 150));

  // RARBG dump (torrentapi.org - RARBG api clone)
  r = await get(`https://torrentapi.org/pubapi_v2.php?mode=search&search_string=${query}&ranked=0&limit=10&token=null&format=json_extended&app_id=bubbaflix`);
  console.log(`TorrentAPI(RARBG): ${r.status}`, JSON.stringify(r.body).substring(0, 150));

  // Lime Torrents (cheerio scrape)
  r = await get(`https://www.limetorrents.lol/search/all/${encodeURIComponent('breaking bad')}/seeds/1/`);
  console.log(`LimeTorrents: ${r.status}`, typeof r.body === 'string' ? `HTML ${r.body.length} chars` : JSON.stringify(r.body).substring(0, 150));

  // ext.to (check if it has API or at least responds)
  r = await get(`https://ext.to/api/search?q=${query}`);
  console.log(`ext.to API: ${r.status}`, JSON.stringify(r.body).substring(0, 150));
  
  r = await get(`https://ext.to/en/search/?q=${query}`);
  console.log(`ext.to HTML: ${r.status}`, typeof r.body === 'string' ? `HTML ${r.body.length} chars` : JSON.stringify(r.body).substring(0, 100));
}

testAll().then(() => console.log('Done'));
