const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');
let appCode = fs.readFileSync('src/App.tsx', 'utf8');
let modalCode = fs.readFileSync('src/components/MediaModal.tsx', 'utf8');

// 1. Add durationCache next to codecCache
code = code.replace(/const codecCache = new Map<string, boolean>\(\);/, `const codecCache = new Map<string, boolean>();\nconst durationCache = new Map<string, number>();`);

// 2. Modify /api/duration to use durationCache
code = code.replace(/console\.log\(\`\[FFprobe-Proxy\] Getting duration for: \$\{targetUrl\}\`\);/, `console.log(\`[FFprobe-Proxy] Getting duration for: \${targetUrl}\`);\n  if (durationCache.has(targetUrl)) {\n    console.log(\`[FFprobe-Proxy] Using cached duration: \${durationCache.get(targetUrl)}\`);\n    return res.json({ duration: durationCache.get(targetUrl) });\n  }`);

// 3. Modify /api/transcode/stream.mp4 to accept hevc query param and avoid internal fetch if provided
const hevcParseCode = `    const hevcQuery = req.query.hevc;
    let isHevc = hevcQuery === 'true' ? true : (hevcQuery === 'false' ? false : null);

    if (isHevc === null) {
      if (codecCache.has(targetUrl)) {
        isHevc = codecCache.get(targetUrl) as boolean;
      } else if (!isLive) {
        try {
          const infoUrl = \`http://localhost:\${process.env.PORT || 5150}/api/media-info?url=\${encodeURIComponent(resolvedUrl)}\`;
          const infoRes = await axios.get(infoUrl, { timeout: 15000 });
          const mediaInfo = infoRes.data;
          const videoStream = mediaInfo.streams?.find((s: any) => s.codec_type === 'video' && s.codec_name !== 'mjpeg' && s.codec_name !== 'png' && s.codec_name !== 'bmp');
          if (videoStream && (videoStream.codec_name !== 'h264' || (videoStream.pix_fmt && videoStream.pix_fmt.includes('10')) || (videoStream.width && videoStream.width > 2000))) {
            isHevc = true;
          }
          codecCache.set(targetUrl, isHevc);
        } catch (err: any) {
          console.warn('[FFmpeg-Proxy] Codec auto-detection failed:', err.message);
        }
      }
    }`;

code = code.replace(/    \/\/ Auto-detect HEVC and transcode via inline probe[\s\S]*?console\.warn\('\[FFmpeg-Proxy\] Codec auto-detection failed:', err\.message\);\s*\}\s*\}/, hevcParseCode);

// 4. Modify /api/transcode/stream.mp4 to parse stderr for duration and cache it
const stderrCode = `    let errorOutput = '';
    ffmpegProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      
      // Look for Duration: HH:MM:SS.ms
      if (!durationCache.has(targetUrl)) {
        const match = chunk.match(/Duration: (\\d{2}):(\\d{2}):(\\d{2})\\.\\d{2}/);
        if (match) {
          const hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const seconds = parseInt(match[3], 10);
          const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
          durationCache.set(targetUrl, totalSeconds);
          console.log(\`[FFmpeg-Proxy] Captured duration from stream: \${totalSeconds}s\`);
        }
      }
    });`;
code = code.replace(/    let errorOutput = '';\s*ffmpegProcess\.stderr\.on\('data', \(data\) => \{\s*errorOutput \+= data\.toString\(\);\s*\}\);/, stderrCode);

// Write back server.ts
fs.writeFileSync('server.ts', code);

// 5. Update MediaModal.tsx to pass isHevc
modalCode = modalCode.replace(/const context = \{ type: isSeries \? 'tv' : 'movie', id: movie\.id, season: selectedSeason, episode: selectedEpisode \};/g, `const isHevcMatch = typeof stream !== 'undefined' && stream.name ? /hevc|x265|h265/i.test(stream.name) : false;
      const context = { type: isSeries ? 'tv' : 'movie', id: movie.id, season: selectedSeason, episode: selectedEpisode, isHevc: isHevcMatch };`);
fs.writeFileSync('src/components/MediaModal.tsx', modalCode);

// 6. Update App.tsx to pass hevc query param and use direct torbox URL
appCode = appCode.replace(/src=\{\`\/api\/transcode\/stream\.mp4\?url=\$\{encodeURIComponent\(playingUrl\)\}&start=\$\{streamOffset\}/g, `src={\`/api/transcode/stream.mp4?url=\${encodeURIComponent(playingUrl)}&start=\${streamOffset}&hevc=\${playingContext?.isHevc === true}\``);
fs.writeFileSync('src/App.tsx', appCode);

console.log("Refactor script complete!");
