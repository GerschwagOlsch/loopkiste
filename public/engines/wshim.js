// AudioWorkletGlobalScope exposes sampleRate/currentFrame/currentTime as accessor properties on the global
// object; reading them per sample is a C++ call each time (measured: PuSS worklet ~5x slower than the same
// class on the main thread). This prefix shadows them with module-scoped bindings that are refreshed once per
// render quantum. The DSP source itself stays byte-identical; output is bit-identical (render-gate).
export const SHIM='const sampleRate=globalThis.sampleRate;let currentFrame=globalThis.currentFrame,currentTime=globalThis.currentTime;'+
 'const registerProcessor=(n,c)=>{const p=c.prototype.process;c.prototype.process=function(a,b,d){currentFrame=globalThis.currentFrame;currentTime=globalThis.currentTime;return p.call(this,a,b,d)};globalThis.registerProcessor(n,c)};\n';
