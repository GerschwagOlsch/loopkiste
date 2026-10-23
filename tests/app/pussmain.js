const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:8791/');
const src=fs.readFileSync('public/engines/puss.js','utf8');const W=JSON.parse(src.match(/const WORKLET=("(?:[^"\\]|\\.)*");/)[1]);
const r=await p.evaluate(async W=>{
 // main-thread run of the exact worklet class
 globalThis.sampleRate=48000;globalThis.currentFrame=0;globalThis.currentTime=0;globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){}}}};globalThis.registerProcessor=(n,c)=>{globalThis.__C=c};
 (0,eval)(W);const m=await import('./engines/puss.js');
 const P=new __C({});const ac=new AudioContext();const eng=await m.default(ac,{out:ac.destination});await eng.ready;eng.loadPreset('DEEP 30 BASS');const pt=eng.getPatch();
 P.msg({t:'cfg',mode:'turbo',poly:pt.synth.poly,s:{...pt.synth,unison:1}});
 const sd=60/112/4;for(let k=0;k<64;k++){const sl=k%8;P.msg({t:'loopOn',slot:sl,note:45,freq:110,p:{},vel:.9,when:k*2*sd});P.msg({t:'loopOff',slot:sl,when:k*2*sd+sd*1.8})}
 const o=[[new Float32Array(128),new Float32Array(128)]];const blocks=Math.floor(20*48000/128);const t0=performance.now();let act=0;
 for(let bl=0;bl<blocks;bl++){currentFrame=bl*128;currentTime=currentFrame/48000;P.process([],o);act+=P.loopV.filter(v=>v.active).length}
 return {rtPct:+((performance.now()-t0)/(20*10)).toFixed(2),avgVoices:+(act/blocks).toFixed(2)}},W);
console.log(JSON.stringify(r));await b.close()})();
