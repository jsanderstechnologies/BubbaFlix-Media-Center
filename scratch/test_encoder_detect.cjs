const { execSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

let bestH264Encoder = null;
function detectBestH264Encoder() {
  if (bestH264Encoder !== null) return bestH264Encoder;
  const encoders = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox'];
  for (const enc of encoders) {
    try {
      execSync(`"${ffmpegPath}" -f lavfi -i nullsrc=s=1280x720 -c:v ${enc} -t 1 -f null -`, {stdio: 'ignore'});
      bestH264Encoder = enc;
      console.log(`[FFmpeg-Proxy] Hardware encoding support found: ${enc}`);
      return enc;
    } catch (e) {
      // ignore
    }
  }
  bestH264Encoder = 'libx264';
  console.log('[FFmpeg-Proxy] No hardware encoding support found. Falling back to libx264 (CPU).');
  return 'libx264';
}

console.log(detectBestH264Encoder());
