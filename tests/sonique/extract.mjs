// Extracts the verbatim DSP + instrument-logic segments from the NWB Sonique source.
// Nothing is rewritten: segments are copied byte-for-byte by anchor lines.
import fs from 'node:fs';
import path from 'node:path';

export const SRC_DIR = process.env.SONIQUE_SRC ||
  '/tmp/claude-0/-home-claude/1ac03698-16f5-5d58-990a-c8fc13239e07/scratchpad/nwb/NocturneWB/workbench/sonique';

export function extract() {
  const html = fs.readFileSync(path.join(SRC_DIR, 'sonique.html'), 'utf8');
  const bridge = fs.readFileSync(path.join(SRC_DIR, 'sonique_bridge.js'), 'utf8');

  // 1) DSP: exact textContent of <script id="dsp"> (what the original feeds to addModule / Worker).
  const open = '<script id="dsp">';
  const a = html.indexOf(open);
  const b = html.indexOf('</script>', a);
  if (a < 0 || b < 0) throw Error('dsp script not found');
  const dsp = html.slice(a + open.length, b);

  // 2) Main-script segments, by anchor line (inclusive start, exclusive end).
  const lines = html.split('\n');
  const find = (re, from = 0) => {
    for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i;
    throw Error('anchor not found: ' + re);
  };
  const seg = (startRe, endRe) => {
    const s = find(startRe);
    const e = find(endRe, s + 1);
    return { from: s + 1, to: e, text: lines.slice(s, e).join('\n') };
  };
  const segments = [
    seg(/^\/\* Original SQ-80 Wave-ROMs/, /^async function romsFromFiles/),              // ROM/bank b64, trims, CRC/SHA verify
    seg(/^const SQ80_MOD_NAMES=/, /^let audioCtx=null/),                                 // SysEx parser, banks, house programs
    seg(/^\/\* -+ Pegelabgleich -+ \*\//, /^\/\* -+ engine transport/),               // auto level, MACRO, applyMacros, patchForEngine
    seg(/^const FACTORY_WAVE_NAMES=/, /^$/),                                            // wave names
    seg(/^const PATCH_FORMAT=/, /^\/\* -{60,} \*$/),                                     // patch exchange (patchToText/FromText/Spec)
    seg(/^const MOD_SRC=/, /^const P=\(\)=>currentPatch/),                              // MOD_SRC, MOD_LABEL, LFO_WAV, LFO_LABEL
    seg(/^const VOL_RANGE_DB=60;/, /^function volLabel/),                               // volume curve
    seg(/^function runSQ80MathSelfTests\(\)\{/, /^try\{runSQ80MathSelfTests\(\);\}/),     // static self tests
  ];
  // sanity: every segment line must occur verbatim in the html
  for (const s of segments) if (!html.includes(s.text)) throw Error('segment not verbatim');

  // 3) Offline render worker tail from sonique_bridge.js (template literal, no interpolation).
  const m = bridge.match(/new Blob\(\[document\.getElementById\('dsp'\)\.textContent,`([\s\S]*?)`\],\{type:'text\/javascript'\}\)/);
  if (!m) throw Error('render worker template not found');
  if (m[1].includes('${')) throw Error('unexpected interpolation');
  const workerTail = Function('return `' + m[1] + '`')();

  return { dsp, segments, workerTail };
}
