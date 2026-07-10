const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsPanel.tsx', 'utf8');

code = code.replace(
  "const [torboxApiKey, setTorboxApiKey] = useState(() => localStorage.getItem('torboxApiKey') || '');\n  const [torboxApiKey, setTorboxApiKey] = useState(() => localStorage.getItem('torboxApiKey') || '');",
  "const [torboxApiKey, setTorboxApiKey] = useState(() => localStorage.getItem('torboxApiKey') || '');"
);

code = code.replace(
  "localStorage.setItem('tmdbKey', tmdbKey);\n    localStorage.setItem('tmdbKey', tmdbKey);\n    localStorage.setItem('torboxApiKey', torboxApiKey);",
  "localStorage.setItem('tmdbKey', tmdbKey);\n    localStorage.setItem('torboxApiKey', torboxApiKey);"
);

// Remove the extra TorBox block that seems to be in the UI:
// Wait, I will just find the right block for TorBox and inject the UI there.
const uiToInject = `
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-white block">Prefer HEVC / H.265</label>
                <button
                  onClick={() => setPreferHEVC(!preferHEVC)}
                  className={\`relative inline-flex h-6 w-11 items-center rounded-full transition-colors \${preferHEVC ? 'bg-indigo-600' : 'bg-slate-700'}\`}
                >
                  <span className={\`inline-block h-4 w-4 transform rounded-full bg-white transition-transform \${preferHEVC ? 'translate-x-6' : 'translate-x-1'}\`} />
                </button>
              </div>
              <p className="text-xs text-white/80">If enabled, HEVC encoded streams will be prioritized over H.264.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">Max TorBox Stream Results</label>
              <input 
                type="number"
                value={maxResults}
                onChange={(e) => setMaxResults(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                placeholder="20"
                min="1"
                max="100"
              />
              <p className="text-xs text-white/80 mt-2">Maximum number of cached streams to fetch from TorBox (1-100).</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">Allowed Resolutions</label>
              <div className="flex gap-2">
                {['4K', '1080p', '720p', '480p'].map(res => (
                  <button
                    key={res}
                    onClick={() => {
                      setResolutions(prev => 
                        prev.includes(res) ? prev.filter(r => r !== res) : [...prev, res]
                      );
                    }}
                    className={\`flex-1 py-2 px-3 rounded-lg border transition-colors text-xs font-medium \${
                      resolutions.includes(res) 
                        ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400' 
                        : 'bg-black/20 border-white/10 text-white/50 hover:border-white/20'
                    }\`}
                  >
                    {res}
                  </button>
                ))}
              </div>
              <p className="text-xs text-white/80 mt-2">Only display streams matching these resolutions.</p>
            </div>
`;

// Insert the UI after the first occurrence of the torbox caching text.
const textToFind = '<p className="text-xs text-white/80 mt-2">Required to monitor TorBox download caching status in real-time.</p>\n            </div>';
code = code.replace(textToFind, textToFind + '\\n' + uiToInject);

// Remove the second TorBox API key block if it exists (I think the user duplicated it earlier by accident)
// Actually, earlier today `SettingsPanel.tsx` had multiple duplicate blocks for TorBox?
// Let's just write this to file.

fs.writeFileSync('src/components/SettingsPanel.tsx', code);
console.log('Fixed SettingsPanel.tsx');
