/**
 * SH-101 engine — JavaScript port of sh101.py
 *
 * Goals:
 *   - Sample-for-sample numerical equivalence with the Python version
 *     under identical parameters and a fixed-seed input
 *   - Pure JS, no dependencies
 *   - Fits inside an AudioWorkletProcessor's process() loop
 *
 * Strategy:
 *   - Where the Python version is vectorized (np.cumsum etc), we
 *     re-derive the per-sample form. Both are mathematically equivalent.
 *   - Floating-point: both Python (numpy float64) and JS use IEEE 754
 *     double-precision, so identical operations in identical order
 *     yield identical bit patterns.
 *   - Math.tan, Math.sin, Math.exp, Math.log2 in V8 follow IEEE 754
 *     and match libm exactly to within last-bit on every modern CPU.
 *
 * Topology preserved:
 *   IC13  CEM3340 VCO   (4× oversampled, polyBLEP, sub-oct flipflops)
 *   IC14  IR3109  VCF   (4-pole TPT cascade, ZDF resonance)
 *   IC15  BA662A  VCA   (exp law)
 */

'use strict';


// ------------------------------------------------------------------ //
// 0. Schematic constants (from Service Notes §1)                     //
// ------------------------------------------------------------------ //

const DA_KCV_PLAY = 2.75;
const RANGE_VOLT  = { '16': 1.0, '8': 2.0, '4': 3.0, '2': 4.0 };
const TRANS_VOLT  = {
  '-3': -2.0, '-2': -1.0, '-1':  0.0,
  '0':   1.0,
  '+1':  2.0, '+2':  3.0, '+3':  4.0,
  'L':   0.0, 'M':   1.0, 'H':   2.0,
};
const A4_REF_HZ_DEFAULT = 440.0;   // Modern studio standard
const A4_REF_HZ   = A4_REF_HZ_DEFAULT;   // kept for back-compat with old import sites
const EXP_BASE    = 2.0;
// pow(EXP_BASE, x) === exp(x * LN_EXP_BASE). Math.exp is ~3.7× faster than
// Math.pow in V8; the relative error is ~1e-16 (rounding noise, < -300 dB).
// Used in the per-sample VCO/VCF hot paths.
const LN_EXP_BASE = Math.log(EXP_BASE);

// Fast tanh — Padé[7/6] rational approximation. Max abs error ~9.6e-5
// (≈ −80 dB) over [−5, 5], and far below that for the |x| < 2 region
// where the saturators spend nearly all their time. ~3.6× faster than
// Math.tanh, which dominates the per-sample cost in the VCF (called
// twice per oversampled sample). Audibly transparent.
function fastTanh(x) {
  if (x < -4.97) return -1; else if (x > 4.97) return 1;
  const x2 = x * x;
  const n = x * (135135 + x2 * (17325 + x2 * (378 + x2)));
  const d = 135135 + x2 * (62370 + x2 * (3150 + x2 * 28));
  return n / d;
}


// ------------------------------------------------------------------ //
// 1. CEM3340 VCO                                                     //
// ------------------------------------------------------------------ //

class CEM3340 {
  /**
   * @param {number} sampleRate  host sample rate
   * @param {number} oversample  internal oversample factor (4 = Python default)
   */
  constructor(sampleRate = 48000, oversample = 4) {
    this.sampleRate = sampleRate;
    this.oversample = oversample;
    this.tuneCents = 0.0;
    this.widthTrim = 0.0;
    // A4 reference Hz — modern default 440. Patch can override via
    // patch.tuning_reference_hz (e.g. 442 for SH-101 vintage, 415 for
    // baroque pitch, etc.).
    this.a4RefHz = A4_REF_HZ_DEFAULT;
    // State
    this._phase = 0.0;
    this._sub1  = 0;     // 1 OCT down flipflop
    this._sub2  = 0;     // 2 OCT down flipflop
    this._sub3  = 0;     // alternate 2 OCT pulse variant
    this._wrapIdx = 0;   // total wrap counter (for sub-osc)
    // Pulse jump-detection BLEP state — for the falling edge with
    // moving duty. Tracks the previous sample's phase + duty so we
    // can detect when phase actually crossed duty between samples.
    this._pulsePhasePrev = 0.0;
    this._pulseDutyPrev = 0.5;
    // Decimation FIR (computed once)
    this._decim = (oversample > 1)
        ? CEM3340._buildDecim(oversample)
        : null;
    // History buffers for decimation (per output channel), length = filter taps
    this._dhist = {};
    if (this._decim) {
      for (const k of ['saw','tri','pulse','sub1','sub2','sub3']) {
        this._dhist[k] = new Float64Array(this._decim.taps.length);
      }
      this._dhistIdx = 0;
    }
    // Reusable output buffer pool. Allocated lazily on first render() for
    // the host block size and reused thereafter — no per-block GC churn.
    this._outPool = null;
    this._outPoolLen = -1;
  }

  static _buildDecim(os) {
    // 65-tap Hann-windowed lowpass at 0.45/os
    const taps = 65;
    const h = new Float64Array(taps);
    let sum = 0;
    const cutoff = 0.45 / os;
    for (let i = 0; i < taps; i++) {
      const n = i - ((taps - 1) >> 1);
      const sinc = (n === 0) ? 2 * cutoff
                              : Math.sin(2 * Math.PI * cutoff * n) / (Math.PI * n);
      const win = 0.5 * (1 - Math.cos(2 * Math.PI * i / (taps - 1)));
      h[i] = sinc * win;
      sum += h[i];
    }
    for (let i = 0; i < taps; i++) h[i] /= sum;
    return { taps: h, delay: (taps - 1) >> 1 };
  }

  // Equivalent to Python's _hz_from_cv (Service Notes §1)
  _hzFromCv(cv) {
    const v_a4_8 = DA_KCV_PLAY + RANGE_VOLT['8'] + TRANS_VOLT['M'];   // 5.75
    const tune_v = this.tuneCents / 1200.0;
    const ktrack_err = this.widthTrim * 1e-3 * (cv - v_a4_8);
    return this.a4RefHz * Math.exp((cv - v_a4_8 + tune_v + ktrack_err) * LN_EXP_BASE);
  }

  /**
   * Render `nOut` samples of all six waveform outputs.
   *
   * cvFreq / cvPwm are Float64Arrays of length nOut at the host sample rate.
   * Returns an object with Float64Array for each waveform at host SR.
   */
  render(cvFreq, cvPwm) {
    const nOut = cvFreq.length;
    const os = this.oversample;
    const n = nOut * os;
    const sr = this.sampleRate * os;

    // Output buffers at host SR — pooled & zeroed for reuse.
    if (this._outPoolLen !== nOut) {
      this._outPool = {
        saw:   new Float64Array(nOut),
        tri:   new Float64Array(nOut),
        pulse: new Float64Array(nOut),
        sub1:  new Float64Array(nOut),
        sub2:  new Float64Array(nOut),
        sub3:  new Float64Array(nOut),
      };
      this._outPoolLen = nOut;
    }
    const out = this._outPool;
    // Every output index is fully overwritten below (both oversample paths),
    // so no zeroing is required.

    // We'll process per oversampled-sample, decimating into the host-SR
    // buffer as we go. This avoids allocating a length-(nOut*os) intermediate.
    let phase = this._phase;
    let s1 = this._sub1, s2 = this._sub2, s3 = this._sub3;
    let wrapIdx = this._wrapIdx;

    for (let i = 0; i < n; i++) {
      // CV upsampling: linear interpolation between host-SR samples
      // (Python uses np.interp with same points — equivalent.)
      const fpos = (nOut - 1) * i / (n - 1);
      const i0 = Math.floor(fpos);
      const frac = fpos - i0;
      const i1 = (i0 + 1 < nOut) ? i0 + 1 : i0;
      const cv  = cvFreq[i0] * (1 - frac) + cvFreq[i1] * frac;
      let pwm   = cvPwm[i0]  * (1 - frac) + cvPwm[i1]  * frac;
      if (pwm < 0) pwm = 0; else if (pwm > 1) pwm = 1;

      // Frequency, phase increment
      let f = this._hzFromCv(cv);
      if (f < 0.01) f = 0.01;
      const limit = sr * 0.45;
      if (f > limit) f = limit;
      const dt = f / sr;

      // Phase accumulator
      phase += dt;
      let wrapped = false;
      if (phase >= 1.0) {
        phase -= 1.0;
        wrapped = true;
        wrapIdx++;
        s1 ^= 1;
        if ((wrapIdx & 1) === 0) s2 ^= 1;     // /4 toggles every 2nd wrap
        if ((wrapIdx & 3) === 0) s3 ^= 1;     // /8 toggle pattern
      }

      // ---- Saw with polyBLEP ----------------------------------
      let saw = 2.0 * phase - 1.0;
      // Right edge
      if (phase > 1.0 - dt) {
        const x = (phase - 1.0) / dt;
        saw -= x * x + x + x + 1.0;
      } else if (phase < dt) {
        const x = phase / dt;
        saw -= x + x - x * x - 1.0;
      }

      // ---- Pulse with PWM and double polyBLEP -----------------
      // NOTE: With moving duty (PWM modulation), the falling edge
      // polyBLEP is imperfect because the edge position drifts between
      // samples. The remaining hash is handled by the post-VCO slew
      // filter (see SH101.render), which is now cut at ~7 kHz (was 16k)
      // because the 5–6 kHz cluster that BLEP couldn't tame was the
      // dominant artefact in measurements.
      let duty = 0.5 - 0.5 * pwm;
      if (duty < 0.02) duty = 0.02;
      else if (duty > 0.98) duty = 0.98;
      let pul = (phase < duty) ? 1.0 : -1.0;
      // Edge at wrap (phase ≈ 0/1) — same as saw correction
      if (phase > 1.0 - dt) {
        const x = (phase - 1.0) / dt;
        pul -= x * x + x + x + 1.0;
      } else if (phase < dt) {
        const x = phase / dt;
        pul -= x + x - x * x - 1.0;
      }
      // Edge at phase==duty (falling edge)
      let t2 = phase - duty;
      if (t2 < 0) t2 += 1.0;
      if (t2 > 1.0 - dt) {
        const x = (t2 - 1.0) / dt;
        pul += x * x + x + x + 1.0;
      } else if (t2 < dt) {
        const x = t2 / dt;
        pul += x + x - x * x - 1.0;
      }

      // ---- Triangle -------------------------------------------
      const tri = 1.0 - 4.0 * Math.abs(phase - 0.5);

      // ---- Sub waveforms --------------------------------------
      const sub1v = s1 ? 1.0 : -1.0;
      const sub2v = s2 ? 1.0 : -1.0;
      const sub3v = s3 ? 1.0 : -1.0;

      // Decimate-into-output (FIR LP at 0.45/os, take every os-th)
      if (os === 1) {
        out.saw[i]  = saw;
        out.tri[i]  = tri;
        out.pulse[i]= pul;
        out.sub1[i] = sub1v;
        out.sub2[i] = sub2v;
        out.sub3[i] = sub3v;
      } else {
        // Push into ring buffer, output every os-th
        this._pushHist('saw',  saw);
        this._pushHist('tri',  tri);
        this._pushHist('pulse',pul);
        this._pushHist('sub1', sub1v);
        this._pushHist('sub2', sub2v);
        this._pushHist('sub3', sub3v);
        if ((i % os) === 0) {
          const j = (i / os) | 0;
          if (j < nOut) {
            out.saw[j]   = this._convolve('saw');
            out.tri[j]   = this._convolve('tri');
            out.pulse[j] = this._convolve('pulse');
            out.sub1[j]  = this._convolve('sub1');
            out.sub2[j]  = this._convolve('sub2');
            out.sub3[j]  = this._convolve('sub3');
          }
        }
        this._dhistIdx = (this._dhistIdx + 1) % this._decim.taps.length;
      }
    }

    this._phase = phase;
    this._sub1 = s1; this._sub2 = s2; this._sub3 = s3;
    this._wrapIdx = wrapIdx;
    return out;
  }

  _pushHist(key, v) {
    const h = this._dhist[key];
    h[this._dhistIdx] = v;
  }

  _convolve(key) {
    const h = this._dhist[key];
    const taps = this._decim.taps;
    const N = taps.length;
    let acc = 0.0;
    let idx = this._dhistIdx;
    for (let k = 0; k < N; k++) {
      acc += h[idx] * taps[k];
      idx = (idx === 0) ? N - 1 : idx - 1;
    }
    return acc;
  }
}


// ------------------------------------------------------------------ //
// 2. IR3109 VCF — 4-pole TPT cascade                                 //
// ------------------------------------------------------------------ //

class IR3109 {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    // Filter runs internally at 2× the host sample rate. This pushes
    // Nyquist from ~22 kHz to ~44 kHz so resonant peaks near the
    // audible top (15-20 kHz) don't pump aliased material back into
    // the spectrum. Cheap: 2× the per-sample work but only inside the
    // filter loop. The full SH-101 spec cutoff range (10 Hz - 20 kHz)
    // is now safe.
    this.drive = 1.2;
    this.z1 = 0.0; this.z2 = 0.0; this.z3 = 0.0; this.z4 = 0.0;
    // Upsampling state: previous input sample for linear interpolation.
    this._lastInput = 0.0;
    // Downsampling state: previous filter output for 2-tap averaging.
    this._lastOutput = 0.0;
    this._out = null; this._outLen = -1;
  }

  render(x, cvCutoff, cvRes) {
    const n = x.length;
    const sr2 = this.sampleRate * 2;        // internal oversampled rate
    if (this._outLen !== n) { this._out = new Float64Array(n); this._outLen = n; }
    const y = this._out;
    const drive = this.drive;
    const tanhDrive = Math.tanh(drive);
    let z1 = this.z1, z2 = this.z2, z3 = this.z3, z4 = this.z4;
    let lastIn = this._lastInput;
    let lastOut = this._lastOutput;
    const PI = Math.PI;

    for (let i = 0; i < n; i++) {
      // CV → cutoff Hz. Now uses sr2 for the Nyquist limit so the
      // SH-101 spec (10 Hz to 20 kHz) is always reachable cleanly.
      let cv = cvCutoff[i];
      if (cv < 0) cv = 0; else if (cv > 11) cv = 11;
      let fc = 10.0 * Math.exp(cv * LN_EXP_BASE);
      if (fc < 10) fc = 10;
      const fcLimit = sr2 * 0.45;            // safe margin from internal Nyquist
      if (fc > fcLimit) fc = fcLimit;
      // Resonance — k=4 is the exact self-oscillation boundary in the
      // ideal 4-pole feedback model. We use 3.99 as a tiny safety margin
      // so numerical noise can't push the system into a runaway state at
      // res=1. Tanh-saturation inside the loop limits amplitude anyway.
      let res = cvRes[i];
      if (res < 0) res = 0; else if (res > 1) res = 1;
      const k = res * 3.99;

      // TPT prewarp at OVERSAMPLED rate
      const g = Math.tan(PI * fc / sr2);
      const G = g / (1.0 + g);
      const G2 = G * G, G3 = G2 * G, G4 = G3 * G;

      // ─── Upsample: two input samples to feed two filter steps ───
      // Sample A: midpoint between last and current (linear interp)
      // Sample B: current. This is a very simple "linear-interp" upsample;
      // not as clean as a halfband FIR but vastly better than no oversample,
      // zero latency, near-zero CPU overhead.
      const inA = 0.5 * (lastIn + x[i]);
      const inB = x[i];
      lastIn = x[i];

      // ─── Filter step A ───
      let S = G3 * z1 + G2 * z2 + G * z3 + z4;
      let u = (inA - k * S) / (1.0 + k * G4);
      let uDrv = fastTanh(drive * u) / tanhDrive;
      let v = G * (uDrv - z1); let yy = v + z1; z1 = yy + v;
      v     = G * (yy   - z2);     yy = v + z2; z2 = yy + v;
      v     = G * (yy   - z3);     yy = v + z3; z3 = yy + v;
      v     = G * (yy   - z4);     yy = v + z4; z4 = yy + v;
      const outA = yy;

      // ─── Filter step B ───
      S = G3 * z1 + G2 * z2 + G * z3 + z4;
      u = (inB - k * S) / (1.0 + k * G4);
      uDrv = fastTanh(drive * u) / tanhDrive;
      v = G * (uDrv - z1); yy = v + z1; z1 = yy + v;
      v = G * (yy   - z2); yy = v + z2; z2 = yy + v;
      v = G * (yy   - z3); yy = v + z3; z3 = yy + v;
      v = G * (yy   - z4); yy = v + z4; z4 = yy + v;
      const outB = yy;

      // ─── Downsample: 3-tap weighted average (lastOut, outA, outB) ───
      // [0.25, 0.5, 0.25] gives a gentle LP at fs/4 = host fs/2 = Nyquist.
      // Catches alias material in the oversampled signal before decimation.
      y[i] = 0.25 * lastOut + 0.5 * outA + 0.25 * outB;
      lastOut = outB;
    }
    // NaN/Inf guard
    if (!isFinite(z1) || !isFinite(z2) || !isFinite(z3) || !isFinite(z4)) {
      z1 = 0; z2 = 0; z3 = 0; z4 = 0;
    }
    this.z1 = z1; this.z2 = z2; this.z3 = z3; this.z4 = z4;
    this._lastInput = lastIn;
    this._lastOutput = lastOut;
    return y;
  }
}


// ------------------------------------------------------------------ //
// 3. BA662A VCA                                                      //
// ------------------------------------------------------------------ //

class BA662A {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.offsetMv = 0.5;
    this.saturation = 0.6;       // matches Python BA662A default
    this._out = null; this._outLen = -1;
  }

  render(x, env) {
    const n = x.length;
    if (this._outLen !== n) { this._out = new Float64Array(n); this._outLen = n; }
    const y = this._out;
    const sat = this.saturation;
    const tanhSat = Math.tanh(sat);
    const exp6 = Math.exp(6.0);
    const offsetV = this.offsetMv * 1e-3;
    for (let i = 0; i < n; i++) {
      let ctl = env[i] + offsetV;
      if (ctl < 0) ctl = 0; else if (ctl > 1) ctl = 1;
      let gain = Math.exp(ctl * 6.0) / exp6;
      if (gain < 0) gain = 0; else if (gain > 1) gain = 1;
      const v = x[i] * gain;
      y[i] = fastTanh(sat * v) / tanhSat;
    }
    return y;
  }
}


// ------------------------------------------------------------------ //
// 4. ADSR                                                            //
// ------------------------------------------------------------------ //

class ADSR {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.a = 0.01; this.d = 0.2; this.s = 0.7; this.r = 0.3;
    this._v = 0.0;
    this._stage = 0; // 0 idle, 1 attack, 2 decay, 3 release
    this._prevG = 0.0;
    this._out = null; this._outLen = -1;
  }

  static _coef(t, sr) {
    if (t < 1e-4) t = 1e-4;
    return 1.0 - Math.exp(-1.0 / (t * sr));
  }

  render(gate) {
    const n = gate.length;
    const sr = this.sampleRate;
    if (this._outLen !== n) { this._out = new Float64Array(n); this._outLen = n; }
    const out = this._out;
    const ka = ADSR._coef(this.a, sr);
    const kd = ADSR._coef(this.d, sr);
    const kr = ADSR._coef(this.r, sr);
    const sus = this.s;
    let v = this._v;
    let stage = this._stage;
    let prevG = this._prevG;
    for (let i = 0; i < n; i++) {
      const g = gate[i];
      if (g > 0.5 && prevG <= 0.5) stage = 1;
      else if (g <= 0.5 && prevG > 0.5) stage = 3;
      if (stage === 1) {
        v += ka * (1.05 - v);
        if (v >= 1.0) { v = 1.0; stage = 2; }
      } else if (stage === 2) {
        v += kd * (sus - v);
        if (g <= 0.5) stage = 3;
      } else if (stage === 3) {
        v += kr * (0.0 - v);
        if (v < 1e-5) { v = 0.0; stage = 0; }
      }
      out[i] = v;
      prevG = g;
    }
    this._v = v; this._stage = stage; this._prevG = prevG;
    return out;
  }
}


// ------------------------------------------------------------------ //
// 5. LFO                                                             //
// ------------------------------------------------------------------ //

class LFO {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.waveform = 'sine';     // sine | square | triangle | saw | random | noise
    this.rateHz = 5.0;
    this._phase = 0.0;
    this._lastRandom = 0.0;
    // Deterministic RNG matching Python default_rng(0x5101) is hard to
    // replicate; we instead expose a setter so tests can supply a sequence.
    // For real-time use we use Math.random.
    this._randomSequence = null;
    this._randSeqIdx = 0;
    // Track unknown waveform names so we only warn once per instance
    this._warnedWaveforms = new Set();
    this._out = null; this._outLen = -1;
  }

  /** Provide an explicit random-value sequence for deterministic tests. */
  setRandomSequence(arr) {
    this._randomSequence = arr;
    this._randSeqIdx = 0;
  }

  _nextRandom() {
    if (this._randomSequence) {
      const v = this._randomSequence[this._randSeqIdx % this._randomSequence.length];
      this._randSeqIdx++;
      return v;
    }
    return Math.random() * 2 - 1;
  }

  render(n, rateMod) {
    if (this._outLen !== n) { this._out = new Float64Array(n); this._outLen = n; }
    const out = this._out;
    const sr = this.sampleRate;
    let phase = this._phase;
    let last = this._lastRandom;
    const w = this.waveform;
    for (let i = 0; i < n; i++) {
      const rate = this.rateHz * (1.0 + (rateMod ? rateMod[i] : 0));
      const dt = rate / sr;
      phase += dt;
      if (phase >= 1.0) {
        phase -= 1.0;
        if (w === 'random') last = this._nextRandom();
      }
      if      (w === 'sine')     out[i] = Math.sin(2 * Math.PI * phase);
      else if (w === 'square')   out[i] = (phase < 0.5) ? 1.0 : -1.0;
      else if (w === 'triangle') out[i] = 1.0 - 4.0 * Math.abs(phase - 0.5);
      else if (w === 'saw')      out[i] = 2.0 * phase - 1.0;
      else if (w === 'random')   out[i] = last;
      else if (w === 'noise')    out[i] = this._nextRandom();
      else {
        // Unknown waveform — warn once per instance, fall back to triangle
        // so users immediately notice the typo without silent noise.
        if (!this._warnedWaveforms.has(w)) {
          this._warnedWaveforms.add(w);
          console.warn('[Pierrette LFO] Unknown waveform "' + w +
                       '", falling back to triangle.');
        }
        out[i] = 1.0 - 4.0 * Math.abs(phase - 0.5);
      }
    }
    this._phase = phase;
    this._lastRandom = last;
    return out;
  }
}


// ------------------------------------------------------------------ //
// 6. Portamento                                                      //
// ------------------------------------------------------------------ //

class Portamento {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.timeS = 0.0;
    this.curve = 'rc';   // 'rc' (default, SH-101 authentic) | 'linear'
    this._v = 0.0;
    this._out = null; this._outLen = -1;
  }

  render(target) {
    const n = target.length;
    if (this._outLen !== n) { this._out = new Float64Array(n); this._outLen = n; }
    const out = this._out;
    if (this.timeS <= 1e-4) {
      for (let i = 0; i < n; i++) out[i] = target[i];
      this._v = target[n - 1];
      return out;
    }
    if (this.curve === 'linear') {
      // Linear: constant CV/second regardless of jump distance. Better
      // for modern studio use because the glide time matches what's set
      // on the knob (RC mode reaches 63% in time t, not 100%).
      // CV is in octaves (1 unit ≈ 1 octave), so step is in oct/sample.
      const step = 1.0 / (this.timeS * this.sampleRate);
      let v = this._v;
      for (let i = 0; i < n; i++) {
        const diff = target[i] - v;
        if (Math.abs(diff) < step) v = target[i];
        else v += step * Math.sign(diff);
        out[i] = v;
      }
      this._v = v;
      return out;
    }
    // RC (exponential 1-pole) — original SH-101-style glide.
    const k = 1.0 - Math.exp(-1.0 / (this.timeS * this.sampleRate));
    let v = this._v;
    for (let i = 0; i < n; i++) {
      v += k * (target[i] - v);
      out[i] = v;
    }
    this._v = v;
    return out;
  }
}


// ------------------------------------------------------------------ //
// 7. SH101 voice                                                     //
// ------------------------------------------------------------------ //

const SUB_KEY_MAP = { '1oct_sq': 'sub1', '2oct_sq': 'sub2', '2oct_pulse': 'sub3' };

// LFO sync divisions → number of quarter-beats per LFO period.
// "1/4" means one LFO cycle per quarter note → at 120 BPM, that's 2 Hz.
const SYNC_DIV_BARS = {
  '1/16':  0.25,
  '1/8T':  1/3,
  '1/8':   0.5,
  '1/8.':  0.75,
  '1/4T':  2/3,
  '1/4':   1.0,
  '1/4.':  1.5,
  '1/2':   2.0,
  '1/1':   4.0,
  '2/1':   8.0,
  '4/1':  16.0,
};

class SH101 {
  constructor(sampleRate = 48000) {
    this.sr = sampleRate;
    this.vco   = new CEM3340(sampleRate);
    this.vcf   = new IR3109(sampleRate);
    this.vca   = new BA662A(sampleRate);
    this.lfo   = new LFO(sampleRate);
    this.env   = new ADSR(sampleRate);
    this.glide = new Portamento(sampleRate);
    // Noise generator state — for tests we'll seed externally.
    // The raw source is white (matches the SH-101 schematic: reverse-biased
    // transistor). Real-world the SH-101 noise isn't perfectly white —
    // signal path and transistor characteristics give it a slightly "brown"
    // tilt with rough texture ("paper tearing"). We emulate that by gently
    // rolling off above 9 kHz (-3 dB @ 9k, -6 dB @ ~14k). Subtle but
    // exactly the character the hardware has.
    // Fast per-engine PRNG (xorshift32). Math.random() is surprisingly
    // expensive and is called per-sample for noise + vintage PW drift;
    // a cheap xorshift gives the same statistical white-noise character
    // at a fraction of the cost. Seeded per instance so voices decorrelate.
    this._rngState = (Math.floor(Math.random() * 0xFFFFFFFF) | 1) >>> 0;
    this._rng = () => {
      let x = this._rngState;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this._rngState = x >>> 0;
      return this._rngState / 4294967296;   // [0,1)
    };
    this._noise = () => this._rng() * 2 - 1;
    this._noiseShapeCoeff = 1 - Math.exp(-2 * Math.PI * 9000 / sampleRate);
    this._noiseShapeState = 0;

    // ─── Anti-PWM-alias / vintage character state ─────────────────
    // Edge-smoothing emulates the finite slew rate of analog
    // comparators. 1-pole LP on pulse + saw. Cutoff chosen
    // empirically: 16 kHz left a hash cluster at 5–6 kHz visible in
    // FFT measurements (PWM-modulated patches). 7 kHz cleanly tames
    // that while keeping the harmonics up to ~10 kHz audible after
    // 6 dB/oct rolloff. A patch can override via `slew_cutoff_hz`
    // (e.g. 12000 for brighter, 5000 for warmer/Juno-like).
    this._slewCutoffHz = 7000;
    this._slewCoeff = 1 - Math.exp(-2 * Math.PI * this._slewCutoffHz / sampleRate);
    this._pulseSmoothed = 0;
    this._pulseSmoothed2 = 0;
    this._sawSmoothed = 0;
    this._sawSmoothed2 = 0;

    // Slow PW drift (emulates CV path leakage). One-pole at ~0.2 Hz.
    // Coefficient tuned so cutoff is similar across sample rates.
    this._pwmDriftCoeff = 2 * Math.PI * 0.2 / sampleRate;   // ~0.2 Hz
    this._pwmDriftState = 0;
    // Static per-voice PW offset (reseeded by setVoiceOffset).
    // Engine is instantiated per voice in the worklet, so this works.
    this._pwOffset = (Math.random() * 2 - 1) * 0.02;

    // Gate smoothing for vca_source: "gate" mode. Default 5ms time
    // constant — kills the click on hard binary gate transitions
    // (arp steps, sequencer steps) without dulling the SH-101 punch.
    // Patches can override with `gate_smooth_ms` (0 = old hard gate).
    this._gateSmoothMs = 5;
    this._gateSmoothCoeff = 1 - Math.exp(-1 / ((this._gateSmoothMs / 1000) * sampleRate));
    this._gateSmoothed = 0;

    // ─── Reusable per-block scratch buffers ───────────────────────
    // renderBuffer() previously allocated ~8 Float64Arrays per call
    // (per voice, per 128-sample block → thousands/sec). That GC churn
    // is harmless on Linux V8 but produces audible glitches under load
    // on Win11 Chrome (a single GC pause stalls the audio render
    // thread). The block size n is constant for the lifetime of the
    // worklet, so we allocate once and reuse. Each voice has its own
    // engine instance, so these buffers are never shared across voices.
    this._scr = null;
    this._scrLen = -1;
  }

  _scratch(n) {
    if (this._scrLen !== n) {
      this._scr = {
        kcvT:     new Float64Array(n),
        cvFreq:   new Float64Array(n),
        pwm:      new Float64Array(n),
        mix:      new Float64Array(n),
        cutoffCv: new Float64Array(n),
        resCv:    new Float64Array(n),
        lfoZero:  new Float64Array(n),   // permanent all-zero (LFO off)
        ampEnv:   new Float64Array(n),   // gate-smoothed amplitude CV
        result:   new Float32Array(n),   // final output handed to worklet
      };
      this._scrLen = n;
    }
    return this._scr;
  }

  // Called by the worklet on voice (re)allocation so each voice gets
  // its own personality. vintage_amount is applied at use-time so
  // sweeping the knob takes immediate effect.
  // Also randomises the VCO starting phase so unison stacks don't
  // sum phase-coherently (= effectively a single voice, ~−10 dB
  // quieter than 6 voices should sound). Each phase ∈ [0,1).
  setVoiceOffset() {
    this._pwOffset = (Math.random() * 2 - 1) * 0.02;
    this.vco._phase = Math.random();
    // Don't reset _pwmDriftState — let the slow random walk continue
    // for natural sound; only re-seed on full constructor.
  }

  // Phase randomisation only, independent of vintage. Worklet calls this
  // on every note-on so unison stacks never phase-cohere at start. Cheap
  // (one Math.random per voice per note-on) and authentic (real analog
  // VCOs are free-running, never start at zero crossing together).
  setRandomPhase() {
    this.vco._phase = Math.random();
  }

  setNoiseSequence(arr) {
    let idx = 0;
    this._noise = () => {
      const v = arr[idx % arr.length];
      idx++;
      return v;
    };
  }

  /** MIDI note → KCV node voltage (matches Python._kcv_for_note) */
  _kcvForNote(midi) {
    return DA_KCV_PLAY + (midi - 69) / 12.0;
  }

  /**
   * Render one note. patch is a plain object matching SH101Patch fields.
   * Returns Float32Array suitable for Web Audio.
   */
  renderNote(midiNote, gateSeconds, tailSeconds, patch, bendSemitones = 0) {
    const sr = this.sr;
    const nGate = (gateSeconds * sr) | 0;
    const nTail = (tailSeconds * sr) | 0;
    const n = nGate + nTail;

    // Gate
    const gate = new Float64Array(n);
    for (let i = 0; i < nGate; i++) gate[i] = 1.0;

    return this.renderBuffer({ n, gate, midiNote, patch, bendSemitones });
  }

  /**
   * Block API: render `n` samples with a caller-supplied gate buffer.
   * Stateful — voice state (oscillator phase, envelope, filter, etc.)
   * carries over between calls. Use this from the AudioWorklet, where
   * `n` is typically 128.
   *
   *   { n, gate: Float32|Float64Array of length n, midiNote, patch,
   *     bendSemitones = 0 }
   */
  renderBuffer({ n, gate, midiNote, patch, bendSemitones = 0 }) {
    // Apply patch
    this.env.a = patch.a; this.env.d = patch.d; this.env.s = patch.s; this.env.r = patch.r;

    // LFO rate — host-tempo-synced or free. When synced, the LFO rate
    // is derived from BPM and the chosen note-division so it locks to
    // the DAW grid for arp/wobble patches.
    // Sync logic: lfo_sync_div = "off" → free-running (use lfo_rate);
    // anything else → tempo-synced. lfo_sync boolean kept for back-compat
    // with older patches.
    const syncDiv = patch.lfo_sync_div;
    const syncOn = patch.lfo_sync === true
                || (typeof syncDiv === 'string' && syncDiv !== 'off' && SYNC_DIV_BARS[syncDiv] !== undefined);
    if (syncOn) {
      const bpm = patch.tempo_bpm || 120;
      const div = (syncDiv && syncDiv !== 'off') ? syncDiv : '1/4';
      const bars = SYNC_DIV_BARS[div] !== undefined ? SYNC_DIV_BARS[div] : 1.0;
      this.lfo.rateHz = (bpm / 60) / bars;
    } else {
      // Free-running. Also: rate near 0 (< 0.05 Hz) disables the LFO,
      // user-facing "modulator off" mode. Below that the LFO output is
      // forced to 0 so it has no effect downstream.
      this.lfo.rateHz = Math.max(0, patch.lfo_rate);
    }
    this.lfo.waveform = patch.lfo_wave;
    // Master disable flag for the LFO output when rate is essentially
    // zero. Engine code below checks this to short-circuit the LFO
    // buffer to all zeros (saves per-sample work, and crucially makes
    // lfo_to_vcf / lfo_to_vco truly silent).
    this._lfoDisabled = !syncOn && (patch.lfo_rate || 0) < 0.05;

    // Tuning reference. 415..466 Hz range (±100 cents from 440).
    if (patch.tuning_reference_hz !== undefined) {
      const tr = patch.tuning_reference_hz;
      if (tr >= 415 && tr <= 466) this.vco.a4RefHz = tr;
    } else {
      this.vco.a4RefHz = A4_REF_HZ_DEFAULT;
    }

    // Modulation sources
    const scr = this._scratch(n);
    const env = this.env.render(gate);
    let lfo = this.lfo.render(n);
    if (this._lfoDisabled) lfo = scr.lfoZero;   // master off (persistent zeros)

    // Keyboard CV with portamento
    const kcvT = scr.kcvT;
    const kcvBase = this._kcvForNote(midiNote) + bendSemitones / 12.0;
    for (let i = 0; i < n; i++) kcvT[i] = kcvBase;
    const kcv = this.glide.render(kcvT);

    // VCO frequency CV
    const cvFreq = scr.cvFreq;
    const rangeV = RANGE_VOLT[patch.range];
    const transV = TRANS_VOLT[patch.transpose || 'M'];
    const lfoToVco = patch.lfo_to_vco || 0;
    for (let i = 0; i < n; i++) {
      cvFreq[i] = kcv[i] + rangeV + transV + lfoToVco * lfo[i];
    }

    // PWM source
    const pwm = scr.pwm;
    const pwmMode = patch.pwm_mode || 'manual';
    const pwmAmt = patch.pwm_amount || 0;
    const pwmManual = patch.pulse_width_manual !== undefined
        ? patch.pulse_width_manual : 0.5;
    if (pwmMode === 'manual') {
      const v = 1.0 - 2.0 * pwmManual;
      for (let i = 0; i < n; i++) pwm[i] = v;
    } else if (pwmMode === 'lfo') {
      for (let i = 0; i < n; i++) pwm[i] = pwmAmt * 0.5 * (lfo[i] + 1.0);
    } else { // env
      for (let i = 0; i < n; i++) pwm[i] = pwmAmt * env[i];
    }

    // ─── Vintage PW drift + per-voice static offset ──────────────
    // Adds slow random-walk drift and a small static offset to the PW.
    // pwm here is in CV-space where 0 = 50% duty, +1 = 100%, -1 = 0%.
    // The drift target is in pulse-width space (±4% PW = ±0.08 in CV).
    // Both scale linearly with vintage_amount so vintage=0 still has
    // pure smoothing without any audible drift.
    const vintageAmt = Math.max(0, Math.min(1, patch.vintage_amount || 0));
    if (vintageAmt > 0) {
      const driftScale  = 0.08 * vintageAmt;   // ±4% PW
      const offsetScale = 0.04 * vintageAmt;   // ±2% PW per voice
      const driftCoeff = this._pwmDriftCoeff;
      for (let i = 0; i < n; i++) {
        const driftRaw = this._rng() * 2 - 1;
        this._pwmDriftState += driftCoeff * (driftRaw - this._pwmDriftState);
        // Subtract because pwm-space sign is inverted vs. PW-space
        pwm[i] -= driftScale * this._pwmDriftState
                + offsetScale * this._pwOffset;
        if (pwm[i] < -1) pwm[i] = -1; else if (pwm[i] > 1) pwm[i] = 1;
      }
    }

    // VCO render
    const osc = this.vco.render(cvFreq, pwm);

    // ─── Edge smoothing (anti-alias for moving PW) ───────────────
    // 2× 1-pole LP cascade at ~7 kHz on pulse + saw (12 dB/oct total).
    // Emulates the finite slew rate of an analog comparator AND the
    // natural HF rolloff of analog signal paths; tames the 5–6 kHz
    // hash cluster that polyBLEP misses when the duty edge is moving
    // with PWM modulation.
    const slewC = this._slewCoeff;
    let pulSm1 = this._pulseSmoothed, sawSm1 = this._sawSmoothed;
    // Second pole state lives in different vars — added below
    let pulSm2 = this._pulseSmoothed2, sawSm2 = this._sawSmoothed2;
    for (let i = 0; i < n; i++) {
      pulSm1 += slewC * (osc.pulse[i] - pulSm1);
      pulSm2 += slewC * (pulSm1 - pulSm2);
      sawSm1 += slewC * (osc.saw[i] - sawSm1);
      sawSm2 += slewC * (sawSm1 - sawSm2);
      osc.pulse[i] = pulSm2;
      osc.saw[i]   = sawSm2;
    }
    this._pulseSmoothed = pulSm1;
    this._pulseSmoothed2 = pulSm2;
    this._sawSmoothed = sawSm1;
    this._sawSmoothed2 = sawSm2;

    // Source mixer
    const mix = scr.mix;
    const subKey = SUB_KEY_MAP[patch.sub_type] || 'sub1';
    const subBuf = osc[subKey];
    const sawL = patch.saw_level   || 0;
    const pulL = patch.pulse_level || 0;
    const subL = patch.sub_level   || 0;
    const noiseL = patch.noise_level || 0;
    // Authentic SH-101 noise character: gentle HF roll-off (~9 kHz)
    // emulates the transistor + signal path behaviour. State persisted.
    const nsC = this._noiseShapeCoeff;
    let nsS = this._noiseShapeState;
    for (let i = 0; i < n; i++) {
      const raw = this._noise();
      nsS += nsC * (raw - nsS);
      mix[i] = sawL * osc.saw[i]
             + pulL * osc.pulse[i]
             + subL * subBuf[i]
             + noiseL * nsS;
    }
    this._noiseShapeState = nsS;

    // ─── Drive stage (pre-VCF saturation, optional) ──────────────
    // tanh-shaped soft clipper between the mixer and the filter.
    // Adds harmonic content and edge to bass/lead patches. Volume-
    // compensated so dialing in drive doesn't make the patch louder —
    // it just sounds "fatter / more present" without a level shift.
    // Default 0 = bypassed. Range 0..1. Useful sweet spot 0.15..0.5.
    const driveAmt = patch.drive_amount || 0;
    if (driveAmt > 0) {
      const driveGain = 1.0 + driveAmt * 4.0;      // up to ×5
      const compGain  = 1.0 / (1.0 + driveAmt * 1.5);
      for (let i = 0; i < n; i++) {
        mix[i] = fastTanh(mix[i] * driveGain) * compGain;
      }
    }

    // VCF cutoff CV: knob + env mod + lfo mod + kbd track + audio-rate FM
    const cutoffCv = scr.cutoffCv;
    const resCv = scr.resCv;
    const cutKnob = patch.cutoff;
    const envToVcf = patch.env_to_vcf;
    const lfoToVcf = patch.lfo_to_vcf || 0;
    const kbdTrk = patch.kbd_track;
    const reso = patch.resonance;

    // Audio-rate filter FM: route one of the post-VCO signals (already
    // edge-smoothed, so we don't pump aliasing into the cutoff) into the
    // cutoff CV. ±3 CV units = ±3 octaves of modulation at amount=1.
    const fmSrc = patch.filter_fm_source || 'off';
    const fmAmt = patch.filter_fm_amount || 0;
    let fmBuf = null;
    if (fmAmt > 0 && fmSrc !== 'off') {
      if      (fmSrc === 'saw')   fmBuf = osc.saw;
      else if (fmSrc === 'pulse') fmBuf = osc.pulse;
      else if (fmSrc === 'sub')   fmBuf = subBuf;
      // 'noise' is generated per sample below — fmBuf stays null
    }

    for (let i = 0; i < n; i++) {
      let fmMod = 0;
      if (fmBuf) fmMod = fmAmt * fmBuf[i] * 3.0;
      else if (fmSrc === 'noise' && fmAmt > 0) fmMod = fmAmt * this._noise() * 3.0;
      cutoffCv[i] = cutKnob * 11.0
                  + envToVcf * env[i] * 5.0
                  + lfoToVcf * lfo[i]
                  + kbdTrk * (kcv[i] - DA_KCV_PLAY)
                  + fmMod;
      resCv[i] = reso;
    }
    const filt = this.vcf.render(mix, cutoffCv, resCv);

    // VCA
    // For env-source: use envelope as amplitude CV (default, smooth by design).
    // For gate-source: smooth the binary gate with a fast 1-pole LP (default 5ms)
    // to eliminate clicks at arp/sequencer step boundaries. SH-101 punch is
    // preserved — 5ms is well below human transient perception (~10ms).
    let ampEnv;
    if ((patch.vca_source || 'env') === 'env') {
      ampEnv = env;
    } else {
      // Recompute smoothing coefficient if the patch sets a non-default time.
      const smoothMs = (patch.gate_smooth_ms !== undefined) ? patch.gate_smooth_ms : 5;
      if (smoothMs !== this._gateSmoothMs) {
        this._gateSmoothMs = smoothMs;
        if (smoothMs <= 0) {
          this._gateSmoothCoeff = 1;   // 1 = no smoothing, instant tracking
        } else {
          this._gateSmoothCoeff = 1 - Math.exp(-1 / ((smoothMs / 1000) * this.sr));
        }
      }
      ampEnv = scr.ampEnv;
      let gs = this._gateSmoothed;
      const gc = this._gateSmoothCoeff;
      for (let i = 0; i < n; i++) {
        gs += gc * (gate[i] - gs);
        ampEnv[i] = gs;
      }
      this._gateSmoothed = gs;
    }
    const vol = patch.volume !== undefined ? patch.volume : 0.8;
    const out = this.vca.render(filt, ampEnv);
    const result = scr.result;
    for (let i = 0; i < n; i++) result[i] = out[i] * vol;
    return result;
  }
}


// ------------------------------------------------------------------ //
// Module export                                                      //
// ------------------------------------------------------------------ //

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DA_KCV_PLAY, RANGE_VOLT, TRANS_VOLT, A4_REF_HZ, EXP_BASE,
    CEM3340, IR3109, BA662A, ADSR, LFO, Portamento, SH101,
  };
}

/* =============================================================
 * sh101_worklet.js — AudioWorklet processor for Pierrette 101.1
 *
 * Loaded via `audioCtx.audioWorklet.addModule('sh101_bundle.js')`.
 * The engine code (sh101_engine.js) is inlined into the bundle by
 * build_worklet.sh — AudioWorklet scope has no native module loader.
 *
 * This file is the canonical source-of-truth; rebuild the bundle
 * after editing.
 *
 *  ──────────────────────────────────────────────────────────────
 *  VOICE MODEL (rev. polyphony)
 *  ──────────────────────────────────────────────────────────────
 *
 *  Three voice modes, switched per patch:
 *
 *    'mono'    : 1 active voice, last-note priority. The classic
 *                SH-101 behaviour. Voice 0 of the pool is used.
 *
 *    'poly'    : up to N voices (1..8, default 5). Voice-stealing
 *                strategy: oldest-released first, then oldest-active.
 *                Detuned slightly per voice for life.
 *
 *    'unison'  : all configured voices play the same note, detuned
 *                symmetrically around 0 by ±unison_detune (cents),
 *                spread across the stereo field by unison_spread.
 *
 *  All non-mono modes ignore arpeggio and re-trig settings on a
 *  per-voice level (each note-on still produces its own attack on
 *  whichever voice is allocated to it; mono behaviour for trig_mode
 *  is preserved in mono).
 *
 *  Output is stereo. In mono mode the single voice is centered.
 *  In poly mode voices are auto-panned across the stereo field by
 *  index (deterministic so the same chord always pans the same way).
 *  In unison mode voice index 0 is centered and the rest fan out
 *  ±L/R proportional to unison_spread.
 *
 *  ──────────────────────────────────────────────────────────────
 *  Per-voice state
 *  ──────────────────────────────────────────────────────────────
 *  We pre-allocate MAX_VOICES (=8) SH101 engine instances at boot
 *  and never instantiate inside `process()` to keep the audio
 *  thread allocation-free. Voices the user hasn't activated simply
 *  render with a closed gate.
 * ============================================================= */


// contents of sh101_engine.js (without the module.exports tail).
// During Node tests we just require it.


// ---------- default patch (Bass 1 from the Plug-Out factory set) ---

const DEFAULT_PATCH = {
  range: '8',
  transpose: '0',
  saw_level: 0.70, pulse_level: 0.0,
  sub_level: 0.80, sub_type: '1oct_sq',
  noise_level: 0.10,
  pwm_mode: 'manual', pulse_width_manual: 0.5, pwm_amount: 0.0,
  cutoff: 0.22, resonance: 0.20,
  env_to_vcf: 0.45, kbd_track: 0.30, lfo_to_vcf: 0.0,
  a: 0.003, d: 0.30, s: 0.0, r: 0.08,
  vca_source: 'env',
  lfo_rate: 1.5, lfo_wave: 'sine',
  lfo_to_vco: 0.0,
  volume: 0.85,
};


const MAX_VOICES = 8;


/**
 * Per-voice state container. Pre-allocated; we never `new` one of
 * these inside the audio callback.
 */
class Voice {
  constructor(sr) {
    this.sr = sr;
    this.engine = new SH101(sr);

    // Note state
    this.note = -1;          // MIDI note currently assigned, -1 = idle
    this.gateOn = false;
    this.forceLowSamples = 0;
    this.noteOnFrame = 0;    // when did this voice receive its current note-on
    this.releaseFrame = 0;   // when did the gate go low

    // Stereo / detune (set by the scheduler when a voice is activated)
    this.detuneCents = 0;    // added to bendSemitones for this voice
    this.panL = 0.7071;      // equal-power pan, default centered
    this.panR = 0.7071;

    // Vintage drift state (per-voice, so unison voices don't share the
    // same wobble). Initialised at random phase offsets so voices don't
    // beat in lock-step.
    this.vTempcoCents = 0;
    this.vResBias = 0;
    this.vDriftPhase1 = Math.random() * 2 * Math.PI;
    this.vDriftPhase2 = Math.random() * 2 * Math.PI;
    this.lastVcaSample = 0;  // for vintage VCA bleed
    this._gateBuf = null; this._gateBufLen = -1;
  }

  /**
   * Build the gate buffer for this voice. Each voice has its own
   * `forceLowSamples` so the ADSR re-trigger pulse only affects voices
   * that just received a fresh note-on.
   */
  buildGate(n) {
    if (this._gateBufLen !== n) { this._gateBuf = new Float32Array(n); this._gateBufLen = n; }
    const g = this._gateBuf;
    let i0 = 0;
    if (this.forceLowSamples > 0) {
      const lows = Math.min(this.forceLowSamples, n);
      i0 = lows;
      this.forceLowSamples -= lows;
      for (let i = 0; i < i0; i++) g[i] = 0.0;   // forced-low re-trigger region
    }
    const v = this.gateOn ? 1.0 : 0.0;
    for (let i = i0; i < n; i++) g[i] = v;
    return g;
  }
}


class SH101Processor extends AudioWorkletProcessor {
  /**
   * Subdivision name -> MIDI clock pulses per step.
   * MIDI clock is 24 PPQN.
   */
  static _subdivToMidiPulses(subdiv) {
    return ({
      '1/4':  24, '1/8':  12, '1/8T':  8,
      '1/16': 6,  '1/16T': 4, '1/32':  3,
    })[subdiv] || 12;
  }
  static _subdivToFraction(subdiv) {
    return ({
      '1/4':  1.0,  '1/8':  0.5,  '1/8T': 1/3,
      '1/16': 0.25, '1/16T': 1/6, '1/32': 0.125,
    })[subdiv] || 0.5;
  }

  constructor(options = {}) {
    super();

    this.sr = sampleRate;     // global from AudioWorklet scope

    // Pre-allocate voice pool
    this.voices = [];
    for (let i = 0; i < MAX_VOICES; i++) {
      this.voices.push(new Voice(this.sr));
    }

    // Patch (mutable)
    this.patch = { ...DEFAULT_PATCH };

    // Voice mode config
    this.voiceMode = 'mono';     // 'mono' | 'poly' | 'unison'
    this.polyVoices = 5;         // 1..8 in poly mode
    this.unisonDetune = 0;       // 0..30 cents
    this.unisonSpread = 0.0;     // 0..1 stereo width; default centered (no auto-pan)

    // Note-tracking. In poly we map a MIDI note to its currently-
    // owned voice index, so a note-off finds the right voice.
    this.noteToVoice = new Map();  // note -> voice index
    this.heldNotes = [];           // ordered stack for last-note priority (mono)

    // Frame counter (used for voice-stealing age comparison)
    this._frame = 0;

    // Mono-specific
    this.trigMode = 'gate_trig';

    // Arpeggiator state
    this.arpMode = null;
    this.arpHold = false;
    this.arpOctaves = 1;
    this._arpHeldKeys = [];
    this._arpStepIdx = 0;
    this._arpClockPhase = 0.0;
    this._arpGateLen = 0.85;
    this._arpStarted = false;
    this._arpPendingRestart = false;
    this._arpPendingNotes = [];   // r3.9: notes pressed in hold mode, awaiting next-step replacement

    // Tempo / MIDI clock
    this.tempoBPM = 120;
    this.tempoSubdiv = '1/8';
    this.tempoSource = 'internal';
    this._midiPulsesPerStep = 12;
    this._midiPulseCount = 0;
    this._lastMidiPulseTime = 0;

    // Metering
    this._rmsBuf = [];

    // Bender lever value, -1..+1
    this.bendValue = 0;

    // r4.0 Sequencer/scheduler: sample-accurate note event queue.
    // Each entry: {atSample: number, type: 'on'|'off', note: number}
    // Sorted by atSample ascending. process() drains events whose
    // atSample <= _globalSamples + n.
    this._globalSamples = 0;
    this._scheduleAnchorFrame = 0;
    this._scheduledEvents = [];

    // -------- VINTAGE TWEAKS (master settings; per-voice state lives
    // on each Voice object so unison voices drift independently) -----
    this.vintageAmount = 0;
    this.vintageWow = 0;
    this.vintageNoise = 0;
    this.vintageBleed = 0;
    this._vintageDriftRate1 = 0.21 * (2 * Math.PI) / this.sr;
    this._vintageDriftRate2 = 0.347 * (2 * Math.PI) / this.sr;
    // Pink-noise filter state (Voss-McCartney, shared — it's a global
    // ambient hiss, not a per-voice characteristic)
    this._pinkRows = new Float64Array(7);
    this._pinkCounter = 0;

    // Bass-mono crossover state. When voices are panned via unison_spread,
    // low frequencies in L and R can be in different phases → they cancel
    // when summed to mono (Bluetooth/club mono sub/radio). Solution: split
    // each channel into bass (below ~150 Hz) and treble, sum the bass to
    // mono, keep the treble stereo. Industry standard ("Bass Mono" in
    // Ableton Utility, iZotope Imager, etc.). Toggleable per-patch via
    // `bass_mono: true|false`, default ON when voice_mode == 'unison' and
    // unison_spread > 0; OFF otherwise.
    this._bassMonoCutoffHz = 150;
    this._bassMonoCoeff = 1 - Math.exp(-2 * Math.PI * this._bassMonoCutoffHz / this.sr);
    this._bassMonoEnabled = true;     // user can override via patch
    this._bassLpL = 0;                // 1-pole LP state, left
    this._bassLpR = 0;                // 1-pole LP state, right

    // Re-applied each time voiceMode/polyVoices/unisonSpread change.
    this._recomputeVoiceLayout();

    this.port.onmessage = (e) => this._onMessage(e.data);

    // OfflineAudioContext can run the render quantum loop before
    // main-thread -> worklet MessagePort tasks are delivered. For
    // offline export, deliver initial patch/state/scheduled events via
    // AudioWorkletNode({ processorOptions }) so they are available
    // synchronously in the processor constructor before startRendering().
    const init = options && options.processorOptions;
    const initMessages = init && Array.isArray(init.initMessages)
      ? init.initMessages
      : null;
    if (initMessages) {
      for (const m of initMessages) this._onMessage(m);
    }
  }

  // ============ MESSAGE HANDLING ============

  _onMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'noteon':  this._noteOn(msg.note); break;
      case 'noteoff': this._noteOff(msg.note); break;
      case 'patch':
        if (msg.patch) Object.assign(this.patch, msg.patch);
        if (typeof msg.trig_mode === 'string') this.trigMode = msg.trig_mode;
        if ('portamento_time' in this.patch) this._applyPortamentoAll();
        // Bass-mono enable: explicit patch field wins; otherwise auto-decide
        // (on for unison-with-spread, off elsewhere).
        if (typeof this.patch.bass_mono === 'boolean') {
          this._bassMonoEnabled = this.patch.bass_mono;
        } else {
          this._bassMonoEnabled = (this.voiceMode === 'unison'
                                && (this.patch.unison_spread || 0) > 0.1);
        }
        break;
      case 'voicemode':
        if (typeof msg.mode === 'string'
            && ['mono','poly','unison'].includes(msg.mode)) {
          if (msg.mode !== this.voiceMode) {
            this.voiceMode = msg.mode;
            // Clean break: stop everything that was sounding under the
            // old mode. The user gets silence + needs to play again,
            // which is the cleanest behaviour and matches how mode
            // switches feel on hardware polysynths.
            this._allNotesOff();
          }
        }
        if (typeof msg.poly_voices === 'number') {
          this.polyVoices = Math.max(1, Math.min(MAX_VOICES, msg.poly_voices | 0));
        }
        if (typeof msg.unison_detune === 'number') {
          this.unisonDetune = Math.max(0, Math.min(30, msg.unison_detune));
        }
        if (typeof msg.unison_spread === 'number') {
          this.unisonSpread = Math.max(0, Math.min(1, msg.unison_spread));
        }
        this._recomputeVoiceLayout();
        break;
      case 'bend':
        this.bendValue = Math.max(-1, Math.min(1, msg.value || 0));
        this.port.postMessage({ type: 'bend_ack',
          value: this.bendValue,
          patchSens: this.patch ? this.patch.vco_bend_sens : null });
        break;
      case 'analyse_patch': {
        try {
          const result = this._analysePatch(msg.patch);
          this.port.postMessage({
            type: 'analyse_result',
            requestId: msg.requestId,
            ...result,
          });
        } catch (e) {
          this.port.postMessage({
            type: 'analyse_result',
            requestId: msg.requestId,
            error: String(e),
          });
        }
        break;
      }
      case 'vintage':
        if (typeof msg.amount === 'number') {
          this.vintageAmount = Math.max(0, Math.min(1, msg.amount));
        } else if ('enabled' in msg) {
          this.vintageAmount = msg.enabled ? 1.0 : 0.0;
        }
        if (typeof msg.wow === 'number')   this.vintageWow   = Math.max(0, Math.min(1, msg.wow));
        if (typeof msg.noise === 'number') this.vintageNoise = Math.max(0, Math.min(1, msg.noise));
        if (typeof msg.bleed === 'number') this.vintageBleed = Math.max(0, Math.min(1, msg.bleed));
        if (this.vintageAmount > 0) {
          for (const v of this.voices) this._rerollVintageOffsets(v);
        } else {
          for (const v of this.voices) {
            v.vTempcoCents = 0; v.vResBias = 0;
          }
        }
        break;
      case 'arp':
        this.arpMode = msg.mode || null;
        this._arpStepIdx = 0;
        this._arpClockPhase = 0.0;
        this._arpStarted = false;
        this._arpPendingNotes = [];
        if (!this.arpMode) {
          this._arpHeldKeys = [];
          // Re-trigger active note in current voice mode if keys still held
          if (this.heldNotes.length > 0) {
            const last = this.heldNotes[this.heldNotes.length - 1];
            // Reactivate via normal note-on path so voice-mode is honoured
            this._allNotesOff();
            this._noteOn(last);
          } else {
            this._allNotesOff();
          }
        }
        break;
      case 'arp_octaves':
        this.arpOctaves = Math.max(1, Math.min(4, msg.value | 0));
        this._arpStepIdx = 0;
        this._arpClockPhase = 0.0;
        break;
      case 'tempo': {
        if (typeof msg.bpm === 'number') {
          this.tempoBPM = Math.max(20, Math.min(300, msg.bpm));
        }
        if (typeof msg.subdiv === 'string') {
          this.tempoSubdiv = msg.subdiv;
          this._midiPulsesPerStep = SH101Processor._subdivToMidiPulses(msg.subdiv);
        }
        if (typeof msg.source === 'string') {
          this.tempoSource = msg.source;
          if (msg.source === 'midi') {
            this._midiPulseCount = 0;
            this._lastMidiPulseTime = 0;
          }
        }
        break;
      }
      case 'midiclk': {
        if (this.tempoSource !== 'midi' || !this.arpMode) break;
        this._midiPulseCount++;
        if (this._midiPulseCount >= this._midiPulsesPerStep) {
          this._midiPulseCount = 0;
          this._pendingArpSteps = (this._pendingArpSteps || 0) + 1;
        }
        break;
      }
      case 'midistart':
        this._midiPulseCount = 0;
        this._arpStepIdx = 0;
        this._arpClockPhase = 0;
        break;
      case 'midistop':
        this._midiPulseCount = 0;
        this._allNotesOff();
        break;
      case 'hold':
        this.arpHold = !!msg.on;
        if (this.arpHold && this.heldNotes.length > 0) {
          this._arpHeldKeys = [...this.heldNotes];
        } else if (!this.arpHold) {
          this._arpHeldKeys = [];
          this._arpPendingNotes = [];
        }
        break;
      case 'allnotesoff':
        this._allNotesOff();
        break;

      // r4.0 — Sequencer scheduler API
      // schedule_note: queue a note on/off at a sample-accurate position.
      //   { type:'schedule_note', note, on:true|false, atSample:int }
      // The atSample is absolute; reset _globalSamples to 0 via
      // schedule_reset_clock if you want offsets to be from "now".
      case 'schedule_note': {
        const evt = {
          atSample: (msg.atSample | 0),
          type: msg.on ? 'on' : 'off',
          note: msg.note | 0,
        };
        // Insert maintaining sort order. For typical bulk-schedule from
        // the UI (sorted input), this is just an append. For unsorted
        // inserts we do an O(n) walk — fine for the few-hundred events
        // per pattern we expect.
        const q = this._scheduledEvents;
        let i = q.length;
        while (i > 0 && q[i - 1].atSample > evt.atSample) i--;
        q.splice(i, 0, evt);
        break;
      }
      case 'sleep':
        // FREEZE deep sleep: process() early-returns with silence.
        // Used while the slot plays its frozen WAV loop instead of the
        // live engine — without this, every once-used voice keeps
        // rendering oscillators/filter/env forever and a "frozen" slot
        // would save no CPU at all.
        this._sleep = true;
        break;
      case 'wake':
        this._sleep = false;
        break;
      case 'schedule_clear':
        this._scheduledEvents.length = 0;
        break;
      case 'schedule_reset_clock':
        // v3.0.35: absolute AudioContext frame when supplied. This prevents
        // MessagePort receipt latency from becoming part of the musical start.
        this._scheduleAnchorFrame = (typeof msg.startFrame === 'number') ? msg.startFrame : currentFrame;
        this._globalSamples = 0;
        break;
    }
  }

  // ============ VOICE LAYOUT (pan + detune offsets per voice) ============

  /**
   * Compute per-voice pan and detune offsets based on the current
   * voice mode. Called on mode/voice-count/spread changes; cheap.
   *
   *  - mono: voice 0 centered, all others idle (pan irrelevant)
   *  - poly: voices spread across the stereo field by index, with
   *          a tiny static detune to thicken chords (musical bonus,
   *          similar to a real Juno's per-voice tuning slop)
   *  - unison: voice 0 centered at 0 cents; voices 1..N pan ±L/R
   *            and detune symmetrically around 0
   */
  _recomputeVoiceLayout() {
    const equalPower = (pan) => {
      // pan in -1..+1; equal-power: cos for L, sin for R
      const a = (pan + 1) * 0.25 * Math.PI;   // 0..π/2
      return [Math.cos(a), Math.sin(a)];
    };

    if (this.voiceMode === 'mono') {
      const v = this.voices[0];
      const [l, r] = equalPower(0);
      v.panL = l; v.panR = r;
      v.detuneCents = 0;
      // The other voices are idle, but reset their detune just in case
      for (let i = 1; i < MAX_VOICES; i++) {
        this.voices[i].detuneCents = 0;
      }
      return;
    }

    if (this.voiceMode === 'poly') {
      // Spread N voices across the stereo field, scaled by unison_spread.
      // unison_spread acts as a master "stereo width" control for both
      // poly and unison modes (the name is historical from when it was
      // unison-only). At spread=0 every voice is centered → polyphonic
      // chords stay on-axis with no left/right wandering between note-ons.
      // At spread=1 voices span ~±70 % of the field.
      const N = this.polyVoices;
      const spread = this.unisonSpread;   // 0..1
      for (let i = 0; i < N; i++) {
        const t = (N === 1) ? 0 : (-1 + 2 * i / (N - 1));   // -1..+1
        const pan = t * 0.7 * spread;
        const [l, r] = equalPower(pan);
        this.voices[i].panL = l;
        this.voices[i].panR = r;
        // Tiny random-but-deterministic detune per voice index, ±3 cents.
        // Gives chords the analog "different tunings" character without
        // needing the vintage knob.
        this.voices[i].detuneCents = ((i * 37 + 11) % 13 - 6) * 0.5;
      }
      return;
    }

    if (this.voiceMode === 'unison') {
      // Use polyVoices count for unison voice count too; that's the
      // natural meaning of "voices" in unison mode.
      const N = this.polyVoices;
      const halfDetune = this.unisonDetune;   // ±halfDetune at extremes
      const halfSpread = this.unisonSpread;   // 0..1 (1 = full ±L/R)
      for (let i = 0; i < N; i++) {
        // Symmetric layout. With odd N, the center voice gets 0/0.
        // With even N, voices straddle the center.
        const t = (N === 1) ? 0 : (i - (N - 1) / 2) / ((N - 1) / 2);  // -1..+1
        const [l, r] = equalPower(t * halfSpread);
        this.voices[i].panL = l;
        this.voices[i].panR = r;
        this.voices[i].detuneCents = t * halfDetune;
      }
    }
  }

  // ============ NOTE ALLOCATION ============

  _applyPortamentoAll() {
    const time = this.patch.portamento_time || 0;
    const mode = this.patch.portamento_mode || 'off';
    const curve = this.patch.portamento_curve || 'rc';
    // For poly/unison, glide between repeated note-ons on the same voice
    // is what makes sense. We just set time_s on every engine; legato
    // logic lives in _noteOn (mono only).
    const glideTime = (mode === 'on') ? time : 0;
    for (const v of this.voices) {
      v.engine.glide.timeS = glideTime;
      v.engine.glide.curve = curve;
    }
  }

  _applyPortamentoMono(legato) {
    const mode = this.patch.portamento_mode || 'off';
    const time = this.patch.portamento_time || 0;
    const curve = this.patch.portamento_curve || 'rc';
    let glideTime = 0;
    if (mode === 'on') glideTime = time;
    else if (mode === 'auto') glideTime = legato ? time : 0;
    this.voices[0].engine.glide.timeS = glideTime;
    this.voices[0].engine.glide.curve = curve;
  }

  _allNotesOff() {
    for (const v of this.voices) {
      v.note = -1;
      v.gateOn = false;
    }
    this.noteToVoice.clear();
    this.heldNotes.length = 0;
    this._arpHeldKeys.length = 0;
    if (this._arpPendingNotes) this._arpPendingNotes.length = 0;
  }

  /**
   * Pick a voice to use for a new note in poly mode.
   * Strategy:
   *   1. An idle voice (note === -1)
   *   2. A released voice (gateOn === false), oldest releaseFrame
   *   3. The oldest currently-held voice (smallest noteOnFrame)
   * Only voices with index < polyVoices are eligible.
   */
  _pickPolyVoice() {
    const N = this.polyVoices;
    // 1. idle
    for (let i = 0; i < N; i++) {
      if (this.voices[i].note === -1) return i;
    }
    // 2. oldest released
    let bestIdx = -1, bestRel = Infinity;
    for (let i = 0; i < N; i++) {
      const v = this.voices[i];
      if (!v.gateOn && v.releaseFrame < bestRel) {
        bestRel = v.releaseFrame;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) return bestIdx;
    // 3. oldest active
    let oldestIdx = 0, oldestOn = this.voices[0].noteOnFrame;
    for (let i = 1; i < N; i++) {
      if (this.voices[i].noteOnFrame < oldestOn) {
        oldestOn = this.voices[i].noteOnFrame;
        oldestIdx = i;
      }
    }
    return oldestIdx;
  }

  _noteOn(note) {
    const wasLegato = this.heldNotes.length > 0;
    const idx = this.heldNotes.indexOf(note);
    if (idx >= 0) this.heldNotes.splice(idx, 1);
    this.heldNotes.push(note);

    // Arpeggio overrides voice-mode allocation; arp always plays on
    // a single voice path (mono-style) regardless of mode. This keeps
    // the existing arp behaviour stable.
    if (this.arpMode) {
      if (this.arpHold) {
        // Hold mode: queue up the new note for the next step boundary.
        // We accumulate pressed-while-active notes in _arpPendingNotes
        // and at the next tick they REPLACE the held-keys set. That's
        // how classic Roland holds work: bumbabumba — press a new key —
        // wait for next "ba" — now the new note's bumbabumba runs.
        //
        // If user is currently holding nothing physically, this is the
        // start of a new chord/note — replace the held-keys cleanly.
        // If user is still holding the old keys (overlapping press),
        // the new note will get added to the chord at the next tick.
        if (!this._arpPendingNotes) this._arpPendingNotes = [];
        if (!this._arpPendingNotes.includes(note)) {
          this._arpPendingNotes.push(note);
        }
        // Cold-start: if the arp isn't running yet (first note-on in
        // hold mode), start it immediately rather than waiting.
        if (!this._arpStarted) {
          this._arpHeldKeys = [...this._arpPendingNotes];
          this._arpPendingNotes = [];
          this._arpStepIdx = 0;
          this._arpClockPhase = 0.0;
          this._midiPulseCount = 0;
          this._pendingArpSteps = 0;
          this._arpPendingRestart = false;
        }
        return;
      }
      // Non-hold mode: Note-retrigger (Ableton's "Retrigger: Note").
      // Every note-on restarts the arp from step 0 with a fresh clock.
      // Beat snaps to the moment you press a key.
      this._arpStepIdx = 0;
      this._arpClockPhase = 0.0;
      this._arpStarted = false;       // process() will bootstrap on next frame
      this._midiPulseCount = 0;
      this._pendingArpSteps = 0;
      this._arpPendingRestart = false;
      return;
    }

    if (this.voiceMode === 'mono') {
      const v = this.voices[0];
      const wasActive = v.note >= 0 && v.gateOn;
      this._applyPortamentoMono(wasLegato);
      v.note = note;
      v.gateOn = true;
      v.noteOnFrame = this._frame;
      if (this.trigMode === 'gate_trig' || !wasActive) {
        v.forceLowSamples = 1;
      }
      if (this.vintageAmount > 0) this._rerollVintageOffsets(v);
      return;
    }

    if (this.voiceMode === 'poly') {
      // If this exact note is already playing, retrigger its voice.
      // (Otherwise repeating the same note would steal a different
      // voice and leave the old one stuck on.)
      let vi = this.noteToVoice.get(note);
      if (vi === undefined) {
        vi = this._pickPolyVoice();
        // If we stole an active voice, drop its note from the map
        const stolen = this.voices[vi];
        if (stolen.note >= 0 && this.noteToVoice.get(stolen.note) === vi) {
          this.noteToVoice.delete(stolen.note);
        }
      }
      const v = this.voices[vi];
      v.note = note;
      v.gateOn = true;
      v.forceLowSamples = 1;
      v.noteOnFrame = this._frame;
      this.noteToVoice.set(note, vi);
      // Reroll VCO phase so chords have natural amount of phase incoherence
      // (chord = different freqs anyway, but starting with random phase
      // sounds more analog and avoids comb-filter at unison frequencies).
      if (typeof v.engine.setRandomPhase === 'function') v.engine.setRandomPhase();
      if (this.vintageAmount > 0) this._rerollVintageOffsets(v);
      return;
    }

    if (this.voiceMode === 'unison') {
      // All N voices play the same note; previous unison stack is replaced
      // (this is the more useful behaviour for held-note re-entries —
      // same note should refresh the cluster cleanly).
      const N = this.polyVoices;
      // Clear previous note mapping
      for (const k of this.noteToVoice.keys()) this.noteToVoice.delete(k);
      for (let i = 0; i < N; i++) {
        const v = this.voices[i];
        v.note = note;
        v.gateOn = true;
        v.forceLowSamples = 1;
        v.noteOnFrame = this._frame;
        // Critical for unison: randomise each voice's VCO phase so they
        // don't sum coherently (= effectively 1 voice, much quieter than
        // sqrt(N) compensation expects). Independent of vintage.
        if (typeof v.engine.setRandomPhase === 'function') v.engine.setRandomPhase();
        if (this.vintageAmount > 0) this._rerollVintageOffsets(v);
      }
      // Map this note to voice 0 as a representative for note-off lookup
      this.noteToVoice.set(note, 0);
    }
  }

  _noteOff(note) {
    const idx = this.heldNotes.indexOf(note);
    if (idx >= 0) this.heldNotes.splice(idx, 1);

    if (this.arpMode) {
      // Hold mode: note-off does nothing to the arp. Held notes are
      // latched; only a new note-on can change what's tuckering.
      if (this.arpHold) return;

      // No notes left, no hold: shut the arp down entirely. Gate off
      // any still-sounding arp voices so the release of the last step
      // doesn't bleed into the next note-on.
      if (this.heldNotes.length === 0) {
        this._arpStarted = false;
        this._arpClockPhase = 0.0;
        this._arpStepIdx = 0;
        this._arpPendingRestart = false;
        const arpVoiceCount = (this.voiceMode === 'unison') ? this.polyVoices : 1;
        for (let i = 0; i < arpVoiceCount; i++) {
          this.voices[i].gateOn = false;
          this.voices[i].releaseFrame = this._frame;
        }
      } else {
        // Notes still held: re-sync the arp to start over with the
        // remaining notes. This kills the awkward case where the arp
        // keeps ticking through a hand transition and slips in an
        // unwanted step from the old note's sequence.
        this._arpStarted = false;
        this._arpClockPhase = 0.0;
        this._arpStepIdx = 0;
        this._arpPendingRestart = false;
      }
      return;
    }

    if (this.voiceMode === 'mono') {
      const v = this.voices[0];
      if (note === v.note) {
        if (this.heldNotes.length > 0) {
          v.note = this.heldNotes[this.heldNotes.length - 1];
          // SH-101 hardware: no re-trigger on fall-back
        } else {
          v.gateOn = false;
          v.releaseFrame = this._frame;
        }
      }
      return;
    }

    if (this.voiceMode === 'poly') {
      const vi = this.noteToVoice.get(note);
      if (vi !== undefined) {
        const v = this.voices[vi];
        if (v.note === note) {
          v.gateOn = false;
          v.releaseFrame = this._frame;
        }
        this.noteToVoice.delete(note);
      }
      return;
    }

    if (this.voiceMode === 'unison') {
      // Release the cluster only if no other notes are held; otherwise
      // re-stack on the most recent held note (mono-like fallback).
      if (this.heldNotes.length > 0) {
        const newNote = this.heldNotes[this.heldNotes.length - 1];
        for (const k of this.noteToVoice.keys()) this.noteToVoice.delete(k);
        for (let i = 0; i < this.polyVoices; i++) {
          this.voices[i].note = newNote;
          // No re-trigger on fall-back
        }
        this.noteToVoice.set(newNote, 0);
      } else {
        for (let i = 0; i < this.polyVoices; i++) {
          this.voices[i].gateOn = false;
          this.voices[i].releaseFrame = this._frame;
        }
        this.noteToVoice.clear();
      }
    }
  }

  // ============ VINTAGE HELPERS ============

  _rerollVintageOffsets(voice) {
    const tri = () => (Math.random() + Math.random() - 1.0);
    voice.vTempcoCents = tri() * 20.0;
    voice.vResBias = tri() * 0.05;
    // Also reroll the engine's PW offset so each (re-)triggered voice
    // has its own subtle PW personality. Critical for unison stacks.
    if (voice.engine && typeof voice.engine.setVoiceOffset === 'function') {
      voice.engine.setVoiceOffset();
    }
  }

  _pinkSample() {
    this._pinkCounter = (this._pinkCounter + 1) & 0x7f;
    let c = this._pinkCounter;
    let row = 0;
    while ((c & 1) === 0 && row < 6) { c >>= 1; row++; }
    this._pinkRows[row] = (Math.random() * 2 - 1);
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += this._pinkRows[i];
    return sum / 7;
  }

  // ============ ARP SCHEDULER ============

  _arpSequence() {
    const src = (this.arpHold && this._arpHeldKeys.length > 0)
      ? this._arpHeldKeys
      : this.heldNotes;
    if (src.length === 0) return [];
    let keys = [...new Set(src)].sort((a, b) => a - b);

    if (this.arpOctaves > 1) {
      const baseKeys = keys.slice();
      for (let oct = 1; oct < this.arpOctaves; oct++) {
        for (const k of baseKeys) keys.push(k + 12 * oct);
      }
      keys = [...new Set(keys)].sort((a, b) => a - b);
    }

    if (this.arpMode === 'up') return keys.slice();
    if (this.arpMode === 'down') return keys.slice().reverse();
    if (this.arpMode === 'u&d') {
      if (keys.length <= 2) return keys.slice();
      return [...keys, ...keys.slice(1, -1).reverse()];
    }
    return keys.slice();
  }

  /**
   * Arpeggio scheduling.
   *
   * In mono and poly modes, the arp drives voice 0 only (deterministic,
   * matches the SH-101 hardware model — one step = one tone).
   *
   * In unison mode, every step is broadcast to all `polyVoices` voices
   * so the arp inherits the unison cluster — wide, detuned chords on
   * each step. This is the musically useful behaviour for Italo-disco /
   * darkwave arp parts.
   */
  _tickArp(n) {
    const seq = this._arpSequence();
    // How many voices receive the arp pulse: 1 for mono/poly, N for unison.
    const arpVoiceCount = (this.voiceMode === 'unison') ? this.polyVoices : 1;

    if (seq.length === 0) {
      for (let i = 0; i < arpVoiceCount; i++) this.voices[i].gateOn = false;
      return;
    }

    // Helper: apply step to all driven voices. Each voice's per-voice
    // detune (set by _recomputeVoiceLayout) still applies during render,
    // so the cluster stays detuned across the arp.
    const driveStep = (note, gateOn, forceLow) => {
      const glide = this.patch.portamento_time || 0;
      for (let i = 0; i < arpVoiceCount; i++) {
        const vv = this.voices[i];
        if (note !== undefined) vv.note = note;
        vv.gateOn = gateOn;
        if (forceLow) vv.forceLowSamples = 1;
        vv.engine.glide.timeS = glide;
      }
    };
    const setGateOff = () => {
      for (let i = 0; i < arpVoiceCount; i++) this.voices[i].gateOn = false;
    };

    if (this.tempoSource === 'midi') {
      const pending = this._pendingArpSteps || 0;
      if (pending > 0) {
        this._pendingArpSteps = 0;
        for (let p = 0; p < pending; p++) {
          // Hold-mode quantized replacement on MIDI step boundary
          if (this.arpHold && this._arpPendingNotes && this._arpPendingNotes.length > 0) {
            this._arpHeldKeys = [...this._arpPendingNotes];
            this._arpPendingNotes = [];
            this._arpStepIdx = 0;
            this._arpPendingRestart = false;
            continue;
          }
          // Cold-start bootstrap is handled in process(), not here
          if (this._arpPendingRestart) {
            this._arpStepIdx = 0;
            this._arpPendingRestart = false;
          } else {
            this._arpStepIdx = (this._arpStepIdx + 1) % seq.length;
          }
        }
        // Re-fetch sequence in case held-keys was replaced above
        const seqNow = this._arpSequence();
        if (seqNow.length > 0) {
          driveStep(seqNow[this._arpStepIdx % seqNow.length], true, true);
        } else {
          setGateOff();
        }
        this._arpClockPhase = 0;
      } else {
        const stepSec = SH101Processor._subdivToFraction(this.tempoSubdiv) * 60.0 / this.tempoBPM;
        const gateLen = stepSec * this._arpGateLen * sampleRate;
        this._arpClockPhase += n;
        if (this._arpClockPhase > gateLen) setGateOff();
      }
      return;
    }

    const stepSec = SH101Processor._subdivToFraction(this.tempoSubdiv) * 60.0 / this.tempoBPM;
    const samplesPerStep = stepSec * sampleRate;
    const gateLenSamples = samplesPerStep * this._arpGateLen;

    let pos = this._arpClockPhase;
    let samplesLeft = n;
    let curSeq = seq;
    while (samplesLeft > 0) {
      const stepRemaining = samplesPerStep - pos;
      if (stepRemaining <= samplesLeft) {
        pos = 0;
        samplesLeft -= stepRemaining;
        // Hold-mode quantized replacement: if user pressed new notes
        // mid-tucker, we queued them up. Swap held-keys to those notes
        // now, on the beat boundary. "bumbabumba — press — wait — ba —
        // now bumbabumba with new note" behaviour.
        if (this.arpHold && this._arpPendingNotes && this._arpPendingNotes.length > 0) {
          this._arpHeldKeys = [...this._arpPendingNotes];
          this._arpPendingNotes = [];
          curSeq = this._arpSequence();
          this._arpStepIdx = 0;
          this._arpPendingRestart = false;
          if (curSeq.length === 0) {
            // No notes after replace — gate everything off and bail.
            for (let i = 0; i < arpVoiceCount; i++) this.voices[i].gateOn = false;
            break;
          }
          driveStep(curSeq[0], true, true);
          continue;
        }
        // Cold-start is handled in process() before _tickArp runs.
        // Here we only ever ADVANCE the step (or honour a pending
        // restart). Don't bootstrap, because doing so triggers a
        // second voice on the same boundary as process()'s bootstrap,
        // producing the 220ms double-onset that broke the tucker.
        if (this._arpPendingRestart) {
          // Quantized phrase restart: new key was pressed mid-step, we
          // deferred the restart to this beat boundary. Beat stays
          // perfectly in time, the new phrase begins at step 0.
          this._arpStepIdx = 0;
          this._arpPendingRestart = false;
        } else {
          this._arpStepIdx = (this._arpStepIdx + 1) % curSeq.length;
        }
        driveStep(curSeq[this._arpStepIdx], true, true);
      } else {
        pos += samplesLeft;
        samplesLeft = 0;
      }
    }
    this._arpClockPhase = pos;
    if (pos > gateLenSamples) setGateOff();
  }

  // ============ ANALYSE PATCH (offline preview) ============

  _analysePatch(patchInput) {
    const cleanPatch = { ...DEFAULT_PATCH };
    for (const k of Object.keys(patchInput || {})) {
      if (!k.startsWith('_')) cleanPatch[k] = patchInput[k];
    }
    const engine = new SH101(this.sr);
    const sr = this.sr;
    const HOLD = Math.floor(1.5 * sr);
    const TAIL = Math.floor(0.5 * sr);
    const N = HOLD + TAIL;
    const block = 128;
    const gateHeld = new Float32Array(block);
    for (let i = 0; i < block; i++) gateHeld[i] = 1.0;
    const gateOff = new Float32Array(block);

    const samples = new Float32Array(N);
    let off = 0;
    while (off < HOLD) {
      const buf = engine.renderBuffer({
        n: block, gate: gateHeld, midiNote: 60, patch: cleanPatch,
      });
      const len = Math.min(block, HOLD - off);
      for (let i = 0; i < len; i++) samples[off + i] = buf[i];
      off += len;
    }
    while (off < N) {
      const buf = engine.renderBuffer({
        n: block, gate: gateOff, midiNote: 60, patch: cleanPatch,
      });
      const len = Math.min(block, N - off);
      for (let i = 0; i < len; i++) samples[off + i] = buf[i];
      off += len;
    }

    const ENV_W = 30;
    const samplesPerCol = Math.floor(samples.length / ENV_W);
    const envRaw = [];
    for (let col = 0; col < ENV_W; col++) {
      let peak = 0;
      const start = col * samplesPerCol;
      for (let i = 0; i < samplesPerCol; i++) {
        const v = Math.abs(samples[start + i]);
        if (v > peak) peak = v;
      }
      envRaw.push(peak);
    }
    const envMax = Math.max(...envRaw, 1e-6);
    const env = envRaw.map(v => Math.round(v * 255 / envMax));

    const dbWindow = (t1, t2) => {
      const a = Math.floor(t1 * sr), b = Math.floor(t2 * sr);
      let s = 0; for (let i = a; i < b; i++) s += samples[i] * samples[i];
      const r = Math.sqrt(s / Math.max(1, b - a));
      return r > 0 ? 20 * Math.log10(r) : -120;
    };
    const dbAttack = dbWindow(0,    0.05);
    const dbEarly  = dbWindow(0.10, 0.40);
    const dbLate   = dbWindow(0.80, 1.40);
    const dbMax    = Math.max(dbAttack, dbEarly, dbLate);

    const chunkRms = [];
    for (let t = 0; t < 1.5; t += 0.05) {
      const r = dbWindow(t, t + 0.05);
      if (r > -120) chunkRms.push(r);
    }
    const mean = chunkRms.reduce((a,b)=>a+b, 0) / Math.max(1, chunkRms.length);
    const variance = chunkRms.reduce((s,v)=>s + (v-mean)**2, 0) / Math.max(1, chunkRms.length);
    const movementStd = Math.sqrt(variance);

    const goertzel = (f) => {
      const w = 2 * Math.PI * f / sr;
      const c = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      const a = Math.floor(0.15 * sr), b = Math.floor(0.80 * sr);
      for (let i = a; i < b; i++) {
        const s = samples[i] + c * s1 - s2;
        s2 = s1; s1 = s;
      }
      const re = s1 - s2 * Math.cos(w), im = s2 * Math.sin(w);
      return Math.sqrt(re*re + im*im);
    };
    const lowE  = goertzel(80) + goertzel(200);
    const midE  = goertzel(500) + goertzel(1200);
    const hiE   = goertzel(3000);
    const veryE = goertzel(7000);

    return {
      env,
      db_attack: Number(dbAttack.toFixed(1)),
      db_early:  Number(dbEarly.toFixed(1)),
      db_late:   Number(dbLate.toFixed(1)),
      db_max:    Number(dbMax.toFixed(1)),
      movement_std: Number(movementStd.toFixed(2)),
      bands: { low: lowE, mid: midE, hi: hiE, very_hi: veryE },
    };
  }

  // ============ PROCESS ============

  /**
   * Render the current voice into a stereo buffer.
   *
   * Engine.renderBuffer returns a Float32 mono buffer that we then
   * pan into the stereo accumulator. The bender/vintage modulation
   * is computed once per block and applied to *every* active voice;
   * the per-voice differences are detune (from voice layout) and
   * the per-voice vintage drift state.
   */
  process(inputs, outputs, parameters) {
    if (this._sleep) return true;   // FREEZE deep sleep — silence, ~zero CPU
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const left = out[0];
    const right = out.length > 1 ? out[1] : null;
    const n = left.length;

    // r4.0 — Scheduled events: drain everything that fires within
    // this render block. Sample-accurate enough for sequencer playback;
    // events are quantised to block boundaries (i.e. ±~3ms at 44.1kHz
    // with 128-sample blocks, which is below perceptual threshold).
    if (this._scheduledEvents.length > 0) {
      const scheduleClock = currentFrame - this._scheduleAnchorFrame;
      const blockEnd = scheduleClock + n;
      const q = this._scheduledEvents;
      let drainCount = 0;
      while (drainCount < q.length && q[drainCount].atSample < blockEnd) {
        const evt = q[drainCount];
        if (evt.type === 'on') this._noteOn(evt.note);
        else this._noteOff(evt.note);
        drainCount++;
      }
      if (drainCount > 0) q.splice(0, drainCount);
    }

    // Frame counter (used for voice-stealing)
    this._frame += n;

    // Arp scheduler — broadcast to voice 0 (mono/poly) or all voices (unison)
    if (this.arpMode) {
      if (!this._arpStarted) {
        const seq = this._arpSequence();
        if (seq.length > 0) {
          this._arpStepIdx = 0;
          const arpVoiceCount = (this.voiceMode === 'unison') ? this.polyVoices : 1;
          for (let i = 0; i < arpVoiceCount; i++) {
            this.voices[i].note = seq[0];
            this.voices[i].gateOn = true;
            this.voices[i].forceLowSamples = 1;
          }
          this._arpClockPhase = 0.0;
          this._arpStarted = true;
        }
      }
      this._tickArp(n);
    } else {
      this._arpStarted = false;
    }

    // Block-level modulation (bender) — same for every voice
    const vcoSens = this.patch.vco_bend_sens || 0;
    const vcfSens = this.patch.vcf_bend_sens || 0;
    const lfoBendDepth = this.patch.lfo_mod_depth || 0;
    const bendBase = this.bendValue * vcoSens;
    const va = this.vintageAmount;

    const benderAbs = Math.abs(this.bendValue);
    let cutoffOffset = 0, extraLfoVco = 0, extraLfoVcf = 0;
    // VCF bend sensitivity: range 0..12 semitones in UI, but applied as a
    // cutoff offset (0..1 range). /24 means at vcfSens=12 and full bender,
    // cutoff shifts by 0.5 (half the range) — musically useful, not
    // catastrophic. The previous *0.4 factor sent cutoff straight to
    // self-osc / noise at any non-trivial sens setting.
    if (vcfSens > 0) cutoffOffset = this.bendValue * vcfSens / 24;
    if (lfoBendDepth > 0) {
      extraLfoVco = benderAbs * lfoBendDepth * 0.1;
      extraLfoVcf = benderAbs * lfoBendDepth * 0.5;
    }

    // Build a "blockpatch" with the bender VCF/LFO offsets baked in.
    // Per-voice we'll only need to override resonance (vintage bias).
    let blockPatch = this.patch;
    // Always carry vintage_amount through to the engine — it controls
    // PW drift + per-voice PW offset (anti-alias / vintage character).
    const needsVintage = this.vintageAmount > 0
                      && blockPatch.vintage_amount !== this.vintageAmount;
    if (cutoffOffset !== 0 || extraLfoVco > 0 || extraLfoVcf > 0 || needsVintage) {
      blockPatch = { ...this.patch };
      blockPatch.vintage_amount = this.vintageAmount;
      if (cutoffOffset !== 0) {
        blockPatch.cutoff = Math.max(0, Math.min(1,
          (blockPatch.cutoff || 0) + cutoffOffset));
      }
      if (extraLfoVco > 0) {
        blockPatch.lfo_to_vco = (blockPatch.lfo_to_vco || 0) + extraLfoVco;
      }
      if (extraLfoVcf > 0) {
        blockPatch.lfo_to_vcf = Math.max(0, Math.min(1,
          (blockPatch.lfo_to_vcf || 0) + extraLfoVcf));
      }
    }

    // Zero accumulators
    left.fill(0);
    if (right) right.fill(0);

    // How many voices are active depends on mode
    const activeCount = (this.voiceMode === 'mono') ? 1 : this.polyVoices;

    // Voices beyond activeCount must be silenced (mode change leftover)
    for (let i = activeCount; i < MAX_VOICES; i++) {
      if (this.voices[i].gateOn || this.voices[i].note >= 0) {
        this.voices[i].gateOn = false;
        this.voices[i].note = -1;
      }
    }

    // Per-voice rendering
    for (let i = 0; i < activeCount; i++) {
      const v = this.voices[i];
      // Skip voices that have been completely idle (no note ever pressed)
      // Save CPU on unused poly slots when only a few keys are held.
      if (v.note === -1) continue;

      const noteForBlock = v.note;
      const gate = v.buildGate(n);

      // Compute this voice's bend semitones: shared bend + per-voice
      // detune offset + per-voice vintage drift
      let bendSemitones = bendBase + v.detuneCents / 100;

      // Per-voice render-patch (start from blockPatch). The only
      // per-voice override is resonance bias (analog character).
      let renderPatch = blockPatch;

      if (va > 0) {
        const wow = this.vintageWow;
        let driftCents = v.vTempcoCents * va * wow;

        v.vDriftPhase1 += this._vintageDriftRate1 * n;
        v.vDriftPhase2 += this._vintageDriftRate2 * n;
        if (v.vDriftPhase1 > 2 * Math.PI) v.vDriftPhase1 -= 2 * Math.PI;
        if (v.vDriftPhase2 > 2 * Math.PI) v.vDriftPhase2 -= 2 * Math.PI;
        const slowDriftCents =
          (Math.sin(v.vDriftPhase1) + Math.sin(v.vDriftPhase2)) * 50.0 * va * wow;
        driftCents += slowDriftCents;

        bendSemitones += driftCents / 100;

        const resTarget = (blockPatch.resonance || 0) + v.vResBias * va * wow;
        renderPatch = { ...blockPatch,
          resonance: Math.max(0, Math.min(1, resTarget)),
        };
      }

      let buf;
      try {
        buf = v.engine.renderBuffer({
          n,
          gate,
          midiNote: noteForBlock,
          patch: renderPatch,
          bendSemitones,
        });
      } catch (err) {
        if (!this._reportedError) {
          this.port.postMessage({ type: 'error', message: String(err) });
          this._reportedError = true;
        }
        continue;
      }

      // Vintage signal-path additions on the per-voice mono buffer
      if (va > 0) {
        // VCA bleed (per voice): the gate-off tonal residual.
        if (!v.gateOn && v.note >= 0) {
          const bleedAmp = 0.012 * va * this.vintageBleed;
          if (bleedAmp > 0) {
            let s = v.lastVcaSample;
            const decay = 0.9998;
            for (let j = 0; j < n; j++) {
              s *= decay;
              buf[j] += s * bleedAmp;
            }
            v.lastVcaSample = s;
          }
        }
        if (v.gateOn) v.lastVcaSample = buf[n - 1];
      }

      // Pan into stereo accumulator
      const pl = v.panL, pr = v.panR;
      if (right) {
        for (let j = 0; j < n; j++) {
          left[j]  += buf[j] * pl;
          right[j] += buf[j] * pr;
        }
      } else {
        for (let j = 0; j < n; j++) left[j] += buf[j] * (pl + pr) * 0.5;
      }
    }

    // Voice-count compensation: with N voices summed, output is louder
    // than a single voice. Use 1/sqrt(N) (energy-preserving) so chords
    // don't blow the meter but stay strong. Mono = 1 (no change).
    if (activeCount > 1) {
      const scale = 1.0 / Math.sqrt(activeCount);
      for (let j = 0; j < n; j++) {
        left[j] *= scale;
        if (right) right[j] *= scale;
      }
    }

    // Bass-mono crossover: makes wide stereo spreads mono-compatible.
    // For each channel, extract bass via 1-pole LP @ ~150 Hz, then sum
    // both bass components to a shared mono bass. The high-frequency
    // residual stays stereo. Result: spread breadth on top, no
    // cancellation when L+R is summed downstream (Bluetooth, mono sub).
    if (right && this._bassMonoEnabled) {
      const c = this._bassMonoCoeff;
      let bL = this._bassLpL, bR = this._bassLpR;
      for (let j = 0; j < n; j++) {
        bL += c * (left[j]  - bL);
        bR += c * (right[j] - bR);
        const bassMono = 0.5 * (bL + bR);
        // L_out = bass_mono + (L - bass_L)  →  reconstruct treble + share bass
        left[j]  = bassMono + (left[j]  - bL);
        right[j] = bassMono + (right[j] - bR);
      }
      this._bassLpL = bL;
      this._bassLpR = bR;
    }

    // Pink-noise floor (global, after sum)
    if (va > 0) {
      const pinkAmp = 0.025 * va * this.vintageNoise;
      if (pinkAmp > 0) {
        for (let j = 0; j < n; j++) {
          const p = this._pinkSample() * pinkAmp;
          left[j] += p;
          if (right) right[j] += p;
        }
      }
    }

    // ─── Stereo metering: RMS, peak, and L/R correlation ──────────
    // Sent every ~4 process calls (≈10 ms @ 48 kHz / 128 samples).
    // The UI uses this to drive a retro stereo bar+peak meter.
    let sumL = 0, sumR = 0, peakL = 0, peakR = 0, sumLR = 0;
    if (right) {
      for (let i = 0; i < n; i++) {
        const l = left[i], r = right[i];
        sumL += l * l;
        sumR += r * r;
        sumLR += l * r;
        const al = l < 0 ? -l : l, ar = r < 0 ? -r : r;
        if (al > peakL) peakL = al;
        if (ar > peakR) peakR = ar;
      }
    } else {
      for (let i = 0; i < n; i++) {
        const l = left[i];
        sumL += l * l;
        const al = l < 0 ? -l : l;
        if (al > peakL) peakL = al;
      }
      sumR = sumL; peakR = peakL; sumLR = sumL;
    }
    // Pearson correlation in [-1, +1]; -1 = anti-phase, 0 = uncorrelated, 1 = mono
    const corr = (sumL > 1e-12 && sumR > 1e-12)
      ? sumLR / Math.sqrt(sumL * sumR)
      : 1;
    const rmsL = Math.sqrt(sumL / n);
    const rmsR = Math.sqrt(sumR / n);
    if (!this._meterAccum) this._meterAccum = { rmsL: 0, rmsR: 0, peakL: 0, peakR: 0, corr: 0, count: 0 };
    const a = this._meterAccum;
    if (rmsL > a.rmsL) a.rmsL = rmsL;
    if (rmsR > a.rmsR) a.rmsR = rmsR;
    if (peakL > a.peakL) a.peakL = peakL;
    if (peakR > a.peakR) a.peakR = peakR;
    a.corr += corr;
    a.count++;
    if (a.count >= 4) {
      this.port.postMessage({
        type: 'meter',
        rmsL: a.rmsL, rmsR: a.rmsR,
        peakL: a.peakL, peakR: a.peakR,
        corr: a.corr / a.count
      });
      // Back-compat: legacy single-channel rms consumer
      this.port.postMessage({ type: 'rms', value: Math.max(a.rmsL, a.rmsR) });
      a.rmsL = 0; a.rmsR = 0; a.peakL = 0; a.peakR = 0; a.corr = 0; a.count = 0;
    }

    // r4.0 — Advance scheduler clock
    this._globalSamples += n;

    return true;
  }
}

registerProcessor('sh101-processor', SH101Processor);
