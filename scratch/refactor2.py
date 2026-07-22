import sys

with open('src/components/MediaModal.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if '{streams.map(stream => {' in line:
        print(f'Start: {i}')
    if 'return (' in line:
        if i+1 < len(lines) and 'id="media-modal"' in lines[i+1]:
            print(f'Return start: {i}')
