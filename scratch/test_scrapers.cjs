const axios = require('axios');
const cheerio = require('cheerio');

async function testScrapers() {
  const query = "ubuntu";
  
  // 1. EZTV API
  try {
    // EZTV uses IMDB ID for its API. But let's test if their site search works.
    const eztvRes = await axios.get(`https://eztvx.to/search/${query}`, { timeout: 10000 });
    const $eztv = cheerio.load(eztvRes.data);
    const eztvMatches = [];
    $eztv('tr.forum_header_border').each((i, el) => {
      const magnet = $eztv(el).find('a.magnet').attr('href');
      const title = $eztv(el).find('a.epinfo').text().trim();
      if (magnet && title) {
        eztvMatches.push({ title, magnet: magnet.substring(0, 40) + '...' });
      }
    });
    console.log("EZTV Search:", eztvMatches.length, "results found.");
  } catch(e) { console.error("EZTV Error", e.message); }

  // 2. 1337X
  try {
    const xRes = await axios.get(`https://1337x.to/search/${query}/1/`, { timeout: 10000, headers: {'User-Agent': 'Mozilla/5.0'} });
    const $x = cheerio.load(xRes.data);
    const xMatches = [];
    $x('table.table-list tbody tr').each((i, el) => {
      const link = 'https://1337x.to' + $x(el).find('td.coll-1.name a:nth-child(2)').attr('href');
      const title = $x(el).find('td.coll-1.name a:nth-child(2)').text().trim();
      const size = $x(el).find('td.coll-4.size').text().trim();
      if (title) xMatches.push({ title, link, size });
    });
    console.log("1337X Search:", xMatches.length, "results found. (Note: Magnets require second request)");
  } catch(e) { console.error("1337X Error", e.message); }

  // 3. TorrentGalaxy
  try {
    const tgRes = await axios.get(`https://torrentgalaxy.to/torrents.php?search=${query}`, { timeout: 10000, headers: {'User-Agent': 'Mozilla/5.0'} });
    const $tg = cheerio.load(tgRes.data);
    const tgMatches = [];
    $tg('div.tgxtablerow').each((i, el) => {
      const title = $tg(el).find('a.txlight b').text().trim();
      const magnet = $tg(el).find('a[href^="magnet:"]').attr('href');
      const size = $tg(el).find('span.badge-secondary').first().text().trim();
      if (title && magnet) {
        tgMatches.push({ title, size, magnet: magnet.substring(0, 40) + '...' });
      }
    });
    console.log("TorrentGalaxy Search:", tgMatches.length, "results found.");
  } catch(e) { console.error("TorrentGalaxy Error", e.message); }

  // 4. LimeTorrents
  try {
    const limeRes = await axios.get(`https://www.limetorrents.lol/search/all/${query}/`, { timeout: 10000, headers: {'User-Agent': 'Mozilla/5.0'} });
    const $lime = cheerio.load(limeRes.data);
    const limeMatches = [];
    $lime('table.table2 tr').each((i, el) => {
      const title = $lime(el).find('div.tt-name a').last().text().trim();
      const dlLink = $lime(el).find('div.tt-name a.csprite_dl14').attr('href'); 
      const size = $lime(el).find('td.tdnormal').eq(1).text().trim();
      if (title && dlLink) {
        // LimeTorrents puts the infohash or magnet in some specific way? Usually the first link is the magnet or download link.
        limeMatches.push({ title, dlLink, size });
      }
    });
    console.log("LimeTorrents Search:", limeMatches.length, "results found.");
  } catch(e) { console.error("LimeTorrents Error", e.message); }

}

testScrapers();
