// Progress and cancellation for an engine's OfflineAudioContext render. Hülle only: suspend/resume does not
// touch the DSP, the rendered samples stay identical. Progress reports (audio seconds done, wall ms) let the
// app measure what a sound costs on this device. On abort the engine's graph is cut from the destination,
// so the remaining render costs next to nothing, and the returned promise rejects at once.
export function runOffline(off, durationSec, { signal, onProgress, cut } = {}) {
  const q = 128 / off.sampleRate, step = Math.max(1, Math.round(0.5 / q)) * q; // checkpoint every ~0.5 s of audio
  const t0 = performance.now(); let dead = false;
  const kill = () => { if (dead) return; dead = true; try { cut && cut(); } catch (_e) {} };
  if (signal || onProgress) {
    for (let k = 1; k * step < durationSec - q; k++) {
      const t = k * step;
      off.suspend(t).then(() => {
        if (signal && signal.aborted) kill();
        else if (onProgress) { try { onProgress(t, performance.now() - t0); } catch (_e) {} }
        off.resume();
      }).catch(() => {});
    }
  }
  const r = off.startRendering();
  if (!signal) return r;
  return new Promise((res, rej) => {
    const ab = () => { kill(); rej(new DOMException('render aborted', 'AbortError')); };
    if (signal.aborted) { ab(); return; }
    signal.addEventListener('abort', ab, { once: true });
    r.then(res, rej);
  });
}
