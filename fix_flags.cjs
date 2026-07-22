const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');
content = content.replace(/'-reconnect_streamed',\s*'1',\s*'-reconnect_delay_max',\s*'10',/g, "'-reconnect_streamed', '1',\n      '-reconnect_on_network_error', '1',\n      '-reconnect_on_http_error', '4xx,5xx',\n      '-reconnect_delay_max', '10',");
fs.writeFileSync('server.ts', content);
