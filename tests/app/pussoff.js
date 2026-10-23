const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:8791/');
const src=fs.readFileSync('public/engines/puss.js','utf8');const W=JSON.parse(src.match(/const WORKLET=("(?:[^"\\]|\\.)*");/)[1]);
const r=await p.evaluate(async W=>{const url=URL.createObjectURL(new Blob([W],{type:'text/javascript'}));const m=await import('./engines/puss.js');const ac=new AudioContext();const eng=await m.default(ac,{});await eng.ready;eng.loadPreset('DEEP 30 BASS');const s={...eng.getPatch().synth,unison:1};
 const sd=60/112/4;const pre=[{t:'cfg',mode:'turbo',poly:s.poly,s}];for(let k=0;k<64;k++){const sl=k%8;pre.push({t:'loopOn',slot:sl,note:45,freq:110,p:{},vel:.9,when:k*2*sd});pre.push({t:'loopOff',slot:sl,when:k*2*sd+sd*1.8})}
 const out={};for(const n of [1,2]){const off=new OfflineAudioContext(2,48000*20,48000);await off.audioWorklet.addModule(url);const node=new AudioWorkletNode(off,'pss30-turbo',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{preload:pre}});node.connect(off.destination);const t0=performance.now();await off.startRendering();out['bareNode'+n]=+((performance.now()-t0)/200).toFixed(2)}
 const off=new OfflineAudioContext(2,48000*20,48000);const t0=performance.now();await off.startRendering();out.empty=+((performance.now()-t0)/200).toFixed(2);return out},W);
console.log(JSON.stringify(r));await b.close()})();
