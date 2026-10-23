import {SHIM} from './wshim.js';
// Loopkiste engine: Pierrette 101.1 (Roland SH-101 circuit emulation)
// ---------------------------------------------------------------------------
// DSP: ./pierrette_worklet.js is a byte-identical copy of NWB
// pierrette/sh101_bundle.js (= sh101_engine.js + "\n" + sh101_worklet.js,
// AudioWorkletProcessor 'sh101-processor'). Nothing in it is changed.
// This file is only the wrapper: preset library, patch messages, macros,
// note scheduling and the offline stem renderer.
//
// The wrapper reproduces exactly what the NWB host does:
//   - patch load      = sh101_pierrette.html loadPreset(): {...PATCH_DEFAULTS, ...preset
//                       without "_" keys} then sendFullPatchTo() (patch, arp_octaves,
//                       tempo, vintage, voicemode messages, in that order)
//   - live notes      = 'schedule_note' messages with absolute atSample
//                       (anchor set once via 'schedule_reset_clock' startFrame:0)
//   - offline render  = workbench.html renderPierretteForSlot(): OfflineAudioContext +
//                       the same worklet, all state + events passed synchronously via
//                       processorOptions.initMessages (no MessagePort race).
//
// Note on timing: the worklet drains scheduled events at the start of the
// 128-frame render quantum that contains them (worklet behaviour, unchanged),
// so an event at `time` sounds 0..127 frames early.
// ---------------------------------------------------------------------------

const WORKLET_FILE = new URL('./pierrette_worklet.js', import.meta.url).href;
let WORKLET_URL_P=null;function workletUrl(){if(!WORKLET_URL_P)WORKLET_URL_P=fetch(WORKLET_FILE).then(r=>r.text()).then(t=>URL.createObjectURL(new Blob([SHIM,t],{type:'text/javascript'})));return WORKLET_URL_P}
const PRESETS_URL = new URL('./pierrette_presets.json', import.meta.url).href;
const PROCESSOR = 'sh101-processor';

// --- verbatim from sh101_pierrette.html (PATCH_DEFAULTS / ENGINE_FIELDS) ----
const PATCH_DEFAULTS = {
  range: '8', transpose: '0',
  saw_level: 0.70, pulse_level: 0.0,
  sub_level: 0.80, sub_type: '1oct_sq',
  noise_level: 0.10,
  pwm_mode: 'manual', pulse_width_manual: 0.5, pwm_amount: 0.0,
  cutoff: 0.22, resonance: 0.20,
  env_to_vcf: 0.45, kbd_track: 0.30, lfo_to_vcf: 0.0,
  drive_amount: 0.0,
  filter_fm_source: 'off', filter_fm_amount: 0.0,
  a: 0.003, d: 0.30, s: 0.0, r: 0.08,
  vca_source: 'env',
  lfo_rate: 4.0, lfo_wave: 'triangle',
  lfo_to_vco: 0.0,
  lfo_sync: false, lfo_sync_div: '1/4', tempo_bpm: 120,
  volume: 0.85,
  tune_cents: 0,
  portamento_time: 0,
  portamento_mode: 'off',
  vco_bend_sens: 2,
  vcf_bend_sens: 0,
  lfo_mod_depth: 0,
  trig_mode: 'gate_trig',
  arp_octaves: 1,
  tempo_subdiv: '1/8',
  vintage_amount: 0,
  vintage_wow: 0,
  vintage_noise: 0,
  vintage_bleed: 0,
  voice_mode: 'mono',
  poly_voices: 5,
  unison_detune: 0,
  unison_spread: 0.5,
};

const ENGINE_FIELDS = [
  'range', 'transpose', 'saw_level', 'pulse_level', 'sub_level', 'sub_type',
  'noise_level', 'pwm_mode', 'pulse_width_manual', 'pwm_amount',
  'cutoff', 'resonance', 'env_to_vcf', 'kbd_track', 'lfo_to_vcf',
  'drive_amount',
  'filter_fm_source', 'filter_fm_amount',
  'a', 'd', 's', 'r', 'vca_source',
  'lfo_rate', 'lfo_wave', 'lfo_to_vco', 'volume',
  'lfo_sync', 'lfo_sync_div', 'tempo_bpm',
  'tune_cents',
  'tuning_reference_hz',
  'gate_smooth_ms',
  'bass_mono',
  'portamento_time', 'portamento_mode', 'portamento_curve',
  'vco_bend_sens', 'vcf_bend_sens', 'lfo_mod_depth',
];

// Same message list as sendFullPatchTo() in sh101_pierrette.html.
function patchMessages(patch) {
  const p = {};
  for (const k of ENGINE_FIELDS) p[k] = patch[k];
  return [
    { type: 'patch', patch: p, trig_mode: patch.trig_mode },
    { type: 'arp_octaves', value: patch.arp_octaves | 0 },
    { type: 'tempo', bpm: patch.tempo_bpm, subdiv: patch.tempo_subdiv, source: 'internal' },
    { type: 'vintage', amount: patch.vintage_amount || 0, wow: patch.vintage_wow,
      noise: patch.vintage_noise, bleed: patch.vintage_bleed },
    { type: 'voicemode',
      mode: patch.voice_mode || 'mono',
      poly_voices: patch.poly_voices != null ? (patch.poly_voices | 0) : 5,
      unison_detune: patch.unison_detune != null ? patch.unison_detune : 0,
      unison_spread: patch.unison_spread != null ? patch.unison_spread : 0.5 },
  ];
}

// = loadPreset() in sh101_pierrette.html: defaults + preset minus "_" keys.
function normalizePatch(obj) {
  const p = { ...PATCH_DEFAULTS };
  for (const k of Object.keys(obj || {})) if (!k.startsWith('_')) p[k] = obj[k];
  return p;
}

// --- macros: beginner controls mapped onto real patch fields ---------------
const clamp01 = (v) => Math.max(0, Math.min(1, +v || 0));
const MACROS = [
  { id: 'cutoff', label: 'Cutoff',
    set: (p, v) => ({ cutoff: v }), get: (p) => p.cutoff },
  { id: 'resonance', label: 'Resonance',
    set: (p, v) => ({ resonance: v }), get: (p) => p.resonance },
  { id: 'envmod', label: 'Env → VCF',
    set: (p, v) => ({ env_to_vcf: v }), get: (p) => p.env_to_vcf },
  { id: 'decay', label: 'Decay',            // d: 10 ms .. 2 s, exponential
    set: (p, v) => ({ d: +(0.01 * Math.pow(200, v)).toFixed(4) }),
    get: (p) => Math.log(Math.max(0.01, p.d) / 0.01) / Math.log(200) },
  { id: 'glide', label: 'Glide',            // portamento_time 0..0.5 s (quadratic)
    set: (p, v) => {
      const o = { portamento_time: +(0.5 * v * v).toFixed(4) };
      // SH-101 style: switch an "off" patch to AUTO (glide on legato only).
      if (v > 0 && (p.portamento_mode || 'off') === 'off') o.portamento_mode = 'auto';
      return o;
    },
    get: (p) => ((p.portamento_mode || 'off') === 'off') ? 0
      : Math.sqrt(Math.max(0, p.portamento_time || 0) / 0.5) },
  { id: 'drive', label: 'Drive',
    set: (p, v) => ({ drive_amount: v }), get: (p) => p.drive_amount || 0 },
];

// --- shared resources -------------------------------------------------------
const _moduleLoads = new WeakMap();          // BaseAudioContext -> Promise
function ensureWorklet(ctx) {
  let p = _moduleLoads.get(ctx);
  if (!p) {
    p = workletUrl().then(u=>ctx.audioWorklet.addModule(u));
    _moduleLoads.set(ctx, p);
    p.catch(() => _moduleLoads.delete(ctx));
  }
  return p;
}
let _presetLib = null;
function loadPresetLib() {
  if (!_presetLib) {
    _presetLib = fetch(PRESETS_URL).then((r) => {
      if (!r.ok) throw new Error('pierrette presets: HTTP ' + r.status);
      return r.json();
    });
    _presetLib.catch(() => { _presetLib = null; });
  }
  return _presetLib;
}

// Events {t, midi, vel, dur} -> sorted schedule_note messages (offs before ons
// on the same frame, so a repeated note retriggers instead of hanging).
function eventsToSchedule(events, sr) {
  const list = [];
  let seq = 0;
  for (const e of events || []) {
    const midi = e.midi | 0;
    const on = Math.round(e.t * sr);
    const off = Math.max(on + 1, Math.round((e.t + Math.max(0, e.dur || 0)) * sr));
    list.push({ at: on, on: true, midi, seq: seq++ });
    list.push({ at: off, on: false, midi, seq: seq++ });
  }
  list.sort((a, b) => (a.at - b.at) || (a.on - b.on) || (a.seq - b.seq));
  return list.map((x) => ({ type: 'schedule_note', note: x.midi, on: x.on, atSample: x.at }));
}

export const OUTPUT_GAIN_DEFAULT = 1.0;

export default async function create(ctx, { out } = {}) {
  let patch = normalizePatch({});
  let presetIndex = [];                       // [{id,name,cat,tuneCents,source}]
  let presetMap = new Map();
  let node = null, outGain = null, disposed = false;
  let outputGain = OUTPUT_GAIN_DEFAULT;
  const active = new Map();                   // midi -> open noteOn count (wrapper side)

  const post = (m) => { if (node && !disposed) node.port.postMessage(m); };
  const sendFull = () => { for (const m of patchMessages(patch)) post(m); };
  const toFrame = (time) => {
    const t = (time == null || !isFinite(time)) ? ctx.currentTime : time;
    return Math.max(0, Math.round(t * ctx.sampleRate));
  };

  const ready = (async () => {
    const [lib] = await Promise.all([loadPresetLib(), ensureWorklet(ctx)]);
    for (const it of lib.presets) {
      const tc = +(it.patch.tune_cents || 0);
      const entry = { id: it.id, name: it.name, cat: it.cat, tuneCents: tc,
                      source: it.patch._source || null };
      presetIndex.push(entry);
      presetMap.set(it.id, it.patch);
    }
    if (disposed) return;
    node = new AudioWorkletNode(ctx, PROCESSOR, {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
    });
    node.port.onmessage = (e) => {
      const d = e.data;
      if (d && d.type === 'error') console.warn('[pierrette worklet]', d.message);
    };
    outGain = ctx.createGain();
    outGain.gain.value = outputGain;
    node.connect(outGain);
    if (out) outGain.connect(out);
    // Absolute frame clock: atSample == AudioContext frame (time * sampleRate).
    post({ type: 'schedule_reset_clock', startFrame: 0 });
    api.loadPreset('Init/Init');
  })();

  const api = {
    id: 'pierrette',
    kind: 'synth',
    ready,

    // ---- sounds -----------------------------------------------------------
    // Extra fields: tuneCents (stored value; 64 TAL-BassLine conversions carry -50),
    // source ('tal-bassline' | … | null).
    presets() { return presetIndex.map((p) => ({ ...p })); },

    // opts.raw = true loads tune_cents exactly as stored. Default: tune_cents
    // forced to 0 (concert pitch, Loopkiste mixes Pierrette with other engines).
    loadPreset(id, opts = {}) {
      const src = presetMap.get(id);
      if (!src) throw new Error('pierrette: unknown preset ' + id);
      const p = normalizePatch(src);
      if (!opts.raw) p.tune_cents = 0;
      patch = p;
      sendFull();               // like the original: no note kill, queued events stay
    },

    getPatch() { return JSON.parse(JSON.stringify(patch)); },

    // Native Pierrette patch JSON (NWB clipboard format). Partial patches allowed;
    // missing fields take PATCH_DEFAULTS, "_" keys are ignored. Loaded raw.
    setPatch(obj) {
      if (typeof obj === 'string') obj = JSON.parse(obj);
      patch = normalizePatch(obj);
      sendFull();
    },

    macros() {
      return MACROS.map((m) => ({ id: m.id, label: m.label, value: clamp01(m.get(patch)) }));
    },

    setMacro(id, v) {
      const m = MACROS.find((x) => x.id === id);
      if (!m) return;
      const changes = m.set(patch, clamp01(v));
      Object.assign(patch, changes);
      // = setPatchValue() for ENGINE_FIELDS: one partial 'patch' message.
      post({ type: 'patch', patch: changes });
    },

    // Extra (not in the contract): host tempo for lfo_sync patches.
    setTempo(bpm) {
      if (!(bpm > 0)) return;
      patch.tempo_bpm = bpm;
      post({ type: 'tempo', bpm });
      post({ type: 'patch', patch: { tempo_bpm: bpm } });
    },

    // ---- realtime ------------------------------------------------------------
    // vel is accepted but ignored: the SH-101 has no velocity (original behaviour).
    noteOn(midi, vel, time) {
      midi = midi | 0;
      active.set(midi, (active.get(midi) || 0) + 1);
      post({ type: 'schedule_note', note: midi, on: true, atSample: toFrame(time) });
    },

    noteOff(midi, time) {
      midi = midi | 0;
      const c = active.get(midi) || 0;
      if (c <= 1) active.delete(midi); else active.set(midi, c - 1);
      post({ type: 'schedule_note', note: midi, on: false, atSample: toFrame(time) });
    },

    // No time / time <= now: drop the queue + immediate all-notes-off.
    // Future time: schedule note-offs for every note still open at that frame.
    allOff(time) {
      if (time != null && time > ctx.currentTime + 0.003) {
        const at = toFrame(time);
        for (const midi of active.keys()) post({ type: 'schedule_note', note: midi, on: false, atSample: at });
        active.clear();
        return;
      }
      active.clear();
      post({ type: 'schedule_clear' });
      post({ type: 'allnotesoff' });
    },

    lanes() { return []; },
    hit() {},

    // ---- offline -------------------------------------------------------------
    // Same DSP as live: OfflineAudioContext + the identical worklet; state and
    // events go in via processorOptions.initMessages (as NWB workbench.html does),
    // so nothing depends on MessagePort delivery timing.
    async renderStem({ sampleRate, durationSec, events, patch: p, bpm, raw = false } = {}) {
      const sr = sampleRate || ctx.sampleRate || 48000;
      const length = Math.max(1, Math.ceil((durationSec || 0) * sr));
      const rp = p ? normalizePatch(p) : { ...patch };
      if (bpm > 0) rp.tempo_bpm = bpm;
      const off = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate: sr });
      await off.audioWorklet.addModule(await workletUrl());
      const initMessages = [
        ...patchMessages(rp),
        { type: 'arp', mode: null },
        { type: 'hold', on: false },
        { type: 'schedule_clear' },
        { type: 'schedule_reset_clock' },
        ...eventsToSchedule(events, sr),
      ];
      const n = new AudioWorkletNode(off, PROCESSOR, {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
        processorOptions: { initMessages },
      });
      n.port.onmessage = () => {};
      const g = raw ? 1 : outputGain;
      if (g !== 1) {
        const gn = off.createGain();
        gn.gain.value = g;
        n.connect(gn).connect(off.destination);
      } else {
        n.connect(off.destination);
      }
      return off.startRendering();
    },

    // Extra: wrapper output gain (DSP untouched). Applies live and to renderStem.
    setOutputGain(g) {
      outputGain = Math.max(0, +g || 0);
      if (outGain) outGain.gain.setValueAtTime(outputGain, ctx.currentTime);
    },
    get outputGain() { return outputGain; },
    get node() { return node; },

    dispose() {
      if (disposed) return;
      try { post({ type: 'schedule_clear' }); post({ type: 'allnotesoff' }); post({ type: 'sleep' }); } catch (_) {}
      disposed = true;
      try { node && node.disconnect(); } catch (_) {}
      try { outGain && outGain.disconnect(); } catch (_) {}
      try { node && (node.port.onmessage = null, node.port.close()); } catch (_) {}
      node = null; outGain = null;
    },
  };

  await ready;
  return api;
}
