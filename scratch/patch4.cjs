const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `  async function filterWithGemini(query: string, items: any[], settings: any): Promise<any[]> {
    if (!settings.geminiApiKey || items.length === 0) return items;
    
    try {
      const list = items.map((t, i) => \`\${i}: \${t.name || t.title}\`).join('\\n');
      
      let hwFilterInstruction = '';
      if (detectBestH264Encoder() === 'libx264') {
        hwFilterInstruction = '\\n\\nCRITICAL HARDWARE CONSTRAINT: This server does not support hardware transcoding. You MUST strictly filter out and exclude any video files encoded with HEVC, x265, H.265, or 10-bit (10bit). Only allow standard H.264 / x264 video streams.';
      }

      const prompt = \`I am searching for the TV show or Movie "\${query}". I have the following list of file result names. Please filter out any results that do not definitively belong to this show/movie, for example if they belong to a different show with a similar name.\\n\\nCRITICAL: Results may be Usenet archives (.rar, .par2, .nzb), video files (.mkv, .mp4), or contain scene release group names. These ARE VALID matches if the underlying title matches the query. Do not filter out results just because they are archives or split into parts.\\n\\nAdditionally, filter out any results that appear to be in a language other than English (e.g., look for tags indicating foreign languages or dubs like ITA, FRE, GER, SPANISH, RUS, HINDI, LATINO, etc).\${hwFilterInstruction} Return ONLY a valid JSON array of indices (0-indexed) of the results that are CORRECT matches. Do not include any markdown formatting, backticks, or other text. Just the JSON array.\\n\\nList:\\n\${list}\`;

      const res = await axios.post(
        \`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=\${settings.geminiApiKey}\`,`;

const idx1 = code.indexOf("  async function filterWithGemini(query: string, items: any[], settings: any): Promise<any[]> {");
const idx2 = code.indexOf("      const res = await axios.post(", idx1);
if (idx1 !== -1 && idx2 !== -1) {
    const before = code.substring(0, idx1);
    const after = code.substring(idx2 + "      const res = await axios.post(".length);
    code = before + replacement + after;
    fs.writeFileSync('server.ts', code);
    console.log("Patched correctly!");
} else {
    console.error("Indexes not found!");
}
