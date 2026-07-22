const TorrentSearchApi = require('torrent-search-api');
TorrentSearchApi.enableProvider('1337x');
async function test() {
  const torrents = await TorrentSearchApi.search('ubuntu', 'All', 5);
  console.log("1337x:", torrents.length);
}
test();
