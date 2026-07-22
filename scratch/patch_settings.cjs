const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsPanel.tsx', 'utf8');

code = code.replace(/    const \[preferHEVC, setPreferHEVC\] = useState\(systemSettings\.preferHEVC === true\);\r?\n/, '');
code = code.replace(/        preferHEVC,\r?\n/, '');

const uiBlock = `              <div>
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
              </div>`;

code = code.replace(uiBlock, '');
fs.writeFileSync('src/components/SettingsPanel.tsx', code);
console.log("Patched SettingsPanel");
