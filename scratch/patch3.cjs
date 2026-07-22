const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `        } catch (err: any) {
          console.warn('[FFmpeg-Proxy] Codec auto-detection failed:', err.message);
        }
      }
    }

    if (isHevc) {
      if (hwAccel) {
        const bestEncoder = detectBestH264Encoder();
        if (bestEncoder !== 'libx264') {
          console.log(\`[FFmpeg-Proxy] Detected HEVC/Dolby Vision. Transcoding to 1080p H.264 using \${bestEncoder} hardware acceleration.\`);
          args.push(
            '-c:v', bestEncoder,
            '-preset', 'fast',
            '-b:v', '5M',
            '-vf', 'scale=-2:1080'
          );
        } else {
          console.warn('[FFmpeg-Proxy] Hardware acceleration requested but no hardware encoder found. Falling back to software encoding (libx264).');
          args.push(
            '-c:v', 'libx264', 
            '-preset', 'ultrafast', 
            '-crf', '28', 
            '-vf', 'scale=-2:1080'
          );
        }
      } else {
        console.log('[FFmpeg-Proxy] Detected HEVC/Dolby Vision. Transcoding to 1080p H.264 for browser compatibility (Software).');
        args.push(
          '-c:v', 'libx264', 
          '-preset', 'ultrafast', 
          '-crf', '28', 
          '-vf', 'scale=-2:1080'
        );
      }
    } else {
      args.push('-c:v', 'copy');
    }

    const audioLeveling = req.query.audioLeveling === 'true';
    if (audioLeveling && !isLive) {
      console.log('[FFmpeg-Proxy] Enabling Dynamic Audio Leveling (dynaudnorm filter)');
      args.push('-af', 'dynaudnorm=f=150:g=15:p=0.95');
    }

    args.push('-c:a', 'aac');`;

const idx1 = code.indexOf("        } catch (err: any) {");
const idx2 = code.indexOf("    args.push('-c:a', 'aac');", idx1);
if (idx1 !== -1 && idx2 !== -1) {
    const before = code.substring(0, idx1);
    const after = code.substring(idx2 + "    args.push('-c:a', 'aac');".length);
    code = before + replacement + after;
    fs.writeFileSync('server.ts', code);
    console.log("Patched correctly!");
} else {
    console.error("Indexes not found!");
}
