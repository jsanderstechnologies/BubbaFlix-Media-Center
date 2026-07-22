const TorrentSearchApi = require('torrent-search-api');

TorrentSearchApi.enableProvider('1337x');
TorrentSearchApi.enableProvider('Rarbg');
TorrentSearchApi.enableProvider('Eztv');
TorrentSearchApi.enableProvider('Limetorrents');
// TorrentGalaxy // TorrentGalaxy is not a default provider in torrent-search-api, we'll see if it exists.

async function test() {
  const providers = TorrentSearchApi.getActiveProviders();
  console.log("Providers enabled:", providers.map(p => p.name));

  try {
    const torrents = await TorrentSearchApi.search('ubuntu', 'All', 5);
    console.log("Search results:", torrents.length);
    for (let i = 0; i < Math.min(3, torrents.length); i++) {
        const t = torrents[i];
        console.log(`- ${t.provider}: ${t.title}`);
        if (!t.magnet) {
           const magnet = await TorrentSearchApi.getMagnet(t);
           console.log(`  Magnet: ${magnet ? 'Success' : 'Fail'}`);
        } else {
           console.log(`  Magnet: Success (Inline)`);
        }
    }
  } catch(e) {
    console.error("Error:", e);
  }
}

test();
