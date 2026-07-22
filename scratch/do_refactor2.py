import sys

with open('src/components/MediaModal.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# find exact boundaries
start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if '{streams.map(stream => {' in line:
        start_idx = i + 1
    if start_idx != -1 and i > start_idx and '})}' in line and '</div>' in lines[i+1]:
        end_idx = i
        break

print(f"Map body is {start_idx} to {end_idx}")

render_body = lines[start_idx:end_idx]

return_idx = -1
for i, line in enumerate(lines):
    if 'return (' in line and 'id="media-modal"' in lines[i+1]:
        return_idx = i
        break

print(f"Return is at {return_idx}")

new_render_func = ["  const renderStream = (stream: any) => {\n"] + render_body + ["  };\n\n"]

# Insert render_func right before return_idx
lines = lines[:return_idx] + new_render_func + lines[return_idx:]

# Update the replacement boundaries since we inserted lines
shift = len(new_render_func)

# We want to replace the old <div className="flex flex-col flex-1 min-h-0"> ... </div>
# Which originally started around 1111 and ended at 1426.
# Let's find it dynamically now.

div_start = -1
for i in range(return_idx + shift, len(lines)):
    if 'TorBox Voyager Sources' in lines[i]:
        # go up to the wrapping div
        for j in range(i, i-5, -1):
            if 'className="flex flex-col flex-1 min-h-0"' in lines[j]:
                div_start = j
                break
        break

div_end = -1
for i in range(div_start, len(lines)):
    if '{streams.map(stream => {' in lines[i]:
        # go down to the closing div
        for j in range(i, len(lines)):
            if '})}' in lines[j]:
                div_end = j + 3  # The closing div and another div maybe?
                break
        break

print(f"Div block is {div_start} to {div_end}")

new_jsx = """
                <div className="flex flex-col flex-1 min-h-0 gap-6">
                    {/* Instant Cached & Active Downloads Container */}
                    <div className="flex flex-col shrink-0">
                        <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
                            Ready to Play / Active <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        </h3>
                        <div className="flex flex-col gap-3">
                            {streams.filter(s => s.isCached || s.downloadState || s.downloadProgress !== undefined).length > 0 ? (
                                streams.filter(s => s.isCached || s.downloadState || s.downloadProgress !== undefined).map(stream => renderStream(stream))
                            ) : (
                                <div className="text-white/40 text-xs italic py-2">No active downloads or cached items found.</div>
                            )}
                        </div>
                    </div>

                    {/* Search Results Container */}
                    <div className="flex flex-col flex-1 min-h-0">
                        <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2 flex-shrink-0">
                            TorBox Voyager Search Results <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                        </h3>
                        {loading ? (
                            <div className="text-white/60 text-xs italic py-4 flex items-center gap-2 bg-white/[0.01] p-4 rounded-xl border border-white/5">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                              </span>
                              <span>Searching TorBox Voyager Indexers...</span>
                            </div>
                        ) : streams.filter(s => !s.isCached && !s.downloadState && s.downloadProgress === undefined).length === 0 ? (
                            <div className="text-white/60 text-xs italic py-4 bg-white/[0.01] p-4 rounded-xl border border-white/5">No indexed streams found. Ensure your TorBox Pro API key is configured.</div>
                        ) : (
                            <div className="flex flex-col gap-3 flex-1 overflow-y-auto custom-scrollbar pr-1 pb-4">
                                {streams.filter(s => !s.isCached && !s.downloadState && s.downloadProgress === undefined).map(stream => renderStream(stream))}
                            </div>
                        )}
                    </div>
                </div>
"""

lines = lines[:div_start] + [new_jsx] + lines[div_end+1:]

with open('src/components/MediaModal.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)
