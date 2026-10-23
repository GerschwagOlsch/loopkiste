// Generates public/engines/sonique.js from the NWB source (verbatim) + glue.template.js.
// Usage: node tests/sonique/build.mjs [outputGain]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { extract, SRC_DIR } from './extract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const { dsp, segments, workerTail } = extract();
const lib = segments.map(s => s.text).join('\n');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const info = {
  source: 'NocturneWB/workbench/sonique/sonique.html + sonique_bridge.js',
  sonique_html_sha256: sha(fs.readFileSync(path.join(SRC_DIR, 'sonique.html'))),
  bridge_sha256: sha(fs.readFileSync(path.join(SRC_DIR, 'sonique_bridge.js'))),
  dsp_sha256: sha(dsp),
  lib_segments: segments.map(s => ({ lines: s.from + '-' + s.to, sha256: sha(s.text) })),
  worker_tail_sha256: sha(workerTail),
};
const gain = process.argv[2] || process.env.OUTPUT_GAIN || '1';
let tpl = fs.readFileSync(path.join(here, 'glue.template.js'), 'utf8');
const rep = (k, v) => { if (!tpl.includes(k)) throw Error('marker ' + k); tpl = tpl.split(k).join(v); };
rep('/*@@DSP_SRC@@*/', JSON.stringify(dsp));
rep('/*@@LIB_SRC@@*/', JSON.stringify(lib));
rep('/*@@RENDER_WORKER_TAIL@@*/', JSON.stringify(workerTail));
rep('/*@@SOURCE_INFO@@*/', JSON.stringify(info, null, 2));
rep('/*@@OUTPUT_GAIN@@*/', String(+gain));
const out = path.join(root, 'public/engines/sonique.js');
fs.writeFileSync(out, tpl);
console.log('wrote', out, (tpl.length / 1024).toFixed(0) + ' KB', 'OUTPUT_GAIN=' + gain);
