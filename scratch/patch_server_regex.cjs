const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `        const nonVideoPatterns = [
          /\\.srt\\b/i, /\\.sub\\b/i, /\\.nfo\\b/i, /\\.txt\\b/i, /\\.jpg\\b/i, /\\.png\\b/i, 
          /\\.sfv\\b/i, /\\.par2\\b/i, /\\.nzb\\b/i, /\\.rar\\b/i, /\\.zip\\b/i, /\\.r\\d{2}\\b/i,
          /\\.mp3\\b/i, /\\.flac\\b/i, /\\.wav\\b/i, /\\.m4a\\b/i, /\\.exe\\b/i, /\\.iso\\b/i, /\\.dmg\\b/i
        ];`;

code = code.replace(/        const nonVideoPatterns = \[\s+\/\.srt\\b\/i.*?\s+\/\.sfv\\b\/i.*?\s+\];/s, replacement);

fs.writeFileSync('server.ts', code);
console.log("Patched server.ts successfully!");
