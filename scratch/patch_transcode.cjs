const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `          } catch (err: any) {
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

    const audioLeveling`;

code = code.replace(/          \} catch \(err: any\) \{\r?\n            console\.warn\('\[FFmpeg-Proxy\] Codec auto-detection failed:', err\.message\);\r?\n\s*const audioLeveling/, replacement);

fs.writeFileSync('server.ts', code);
console.log("Patched server.ts transcode logic");
