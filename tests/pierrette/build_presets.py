#!/usr/bin/env python3
"""Build public/engines/pierrette_presets.json + pierrette_worklet.js from the
NWB Pierrette source tree (read-only).

- Preset data is copied verbatim (JSON round trip only strips whitespace;
  every field incl. tune_cents / _comment / _preview stays as-is).
- Factory presets are extracted from FACTORY_PRESETS in sh101_pierrette.html.
- Worklet = byte-identical copy of sh101_bundle.js (sha256 checked).

usage: python3 -I build_presets.py <NWB pierrette dir> <loopkiste public/engines dir>
"""
import hashlib, json, re, sys, gzip
from pathlib import Path

src = Path(sys.argv[1]); dst = Path(sys.argv[2])
CAT_ORDER = ['Init', 'Factory', 'Bass', 'Lead', 'Arp', 'Pluck', 'Stab', 'Pad',
             'Strings', 'Drum', 'Other', 'User']

def js_obj_to_json(s):
    s = re.sub(r"//[^\n]*", "", s)
    s = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1"\2":', s)
    s = s.replace("'", '"')
    s = re.sub(r",\s*([}\]])", r"\1", s)
    return json.loads(s)

items = []
items.append(dict(id='Init/Init', name='Init', cat='Init',
                  patch=json.loads((src / 'Init.json').read_text('utf-8'))))

html = (src / 'sh101_pierrette.html').read_text('utf-8')
m = re.search(r"const FACTORY_PRESETS = (\{.*?\n\});", html, re.S)
fac = js_obj_to_json(m.group(1))
for name in sorted(fac):
    items.append(dict(id='Factory/' + name, name=name, cat='Factory', patch=fac[name]))

pdir = src / 'presets'
for f in sorted(pdir.rglob('*.json')):
    rel = f.relative_to(pdir)
    cat = rel.parts[0] if len(rel.parts) == 2 else 'User'
    name = f.stem
    items.append(dict(id=cat + '/' + name, name=name, cat=cat,
                      patch=json.loads(f.read_text('utf-8'))))

items.sort(key=lambda it: (CAT_ORDER.index(it['cat']) if it['cat'] in CAT_ORDER else 99,
                           it['name'].lower()))
ids = [it['id'] for it in items]
assert len(ids) == len(set(ids)), 'duplicate preset ids'
out = {'format': 'loopkiste-pierrette-presets/1',
       'source': 'NocturneWB/pierrette (Init.json, FACTORY_PRESETS, presets/)',
       'categories': [c for c in CAT_ORDER if any(it['cat'] == c for it in items)],
       'presets': items}
raw = json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
(dst / 'pierrette_presets.json').write_bytes(raw)

b = (src / 'sh101_bundle.js').read_bytes()
(dst / 'pierrette_worklet.js').write_bytes(b)
h1 = hashlib.sha256(b).hexdigest(); h2 = hashlib.sha256((dst / 'pierrette_worklet.js').read_bytes()).hexdigest()
assert h1 == h2

from collections import Counter
c = Counter(it['cat'] for it in items)
flat = sum(1 for it in items if (it['patch'].get('tune_cents') or 0) != 0)
print(json.dumps({'total': len(items), 'per_cat': c, 'tune_cents_nonzero': flat,
                  'presets_json_bytes': len(raw), 'presets_json_gzip': len(gzip.compress(raw, 9)),
                  'worklet_bytes': len(b), 'worklet_sha256': h1}, indent=1))
