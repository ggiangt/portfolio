#!/usr/bin/env python3
"""Stamp each page's CSS and JS links with a short hash of the file's contents.

    python3 scripts/stamp-assets.py

Run it before committing. When a stylesheet or script changes, its links get a
new ?v=... so browsers fetch the fresh copy straight away instead of reusing an
old one from their cache; unchanged files keep their version and stay cached.
"""
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ['site.css', 'styles.css', 'case.css', 'pages.css', 'site.js']

versions = {
    name: hashlib.sha1((ROOT / name).read_bytes()).hexdigest()[:8]
    for name in ASSETS
    if (ROOT / name).exists()
}

pattern = re.compile(r'((?:href|src)="(?:\.\./)*)(' + '|'.join(map(re.escape, versions)) + r')(\?v=[0-9a-f]+)?"')

changed = 0
for page in sorted(ROOT.glob('*.html')) + sorted(ROOT.glob('*/index.html')):
    text = page.read_text()
    stamped = pattern.sub(lambda m: f'{m.group(1)}{m.group(2)}?v={versions[m.group(2)]}"', text)
    if stamped != text:
        page.write_text(stamped)
        changed += 1
        print(f'stamped {page.relative_to(ROOT)}')
print(f'{changed} page(s) updated; versions: ' + ', '.join(f'{k}={v}' for k, v in versions.items()))
