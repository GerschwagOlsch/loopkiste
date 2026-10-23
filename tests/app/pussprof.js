const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:8791/');
const r=await p.evaluate(async()=>{const m=await import('./engines/puss.js');const ac=new AudioContext();const eng=await m.default(ac,{out:ac.destination});await eng.ready;
 const out={};const ev=[];const sd=60/112/4;for(let i=0;i<128;i+=2)ev.push({t:i*sd,midi:[69,72,74,76][(i/2)%4],vel:.85,dur:sd*1.8});
 const dur=128*sd+1;
 for(const pre of ['BRASS BUS 87','DEEP 30 BASS','TRIPLE BBD STRINGS']){eng.loadPreset(pre);const pt=eng.getPatch();
   for(const [lab,mod] of [['as-is',{}],['unison1',{unison:1}],['noFX',{chorus:0,delayMix:0,hall:0}],['uni1+noFX',{unison:1,chorus:0,delayMix:0,hall:0}]]){
     const pp={...pt,synth:{...pt.synth,...mod}};const t0=performance.now();await eng.renderStem({sampleRate:48000,durationSec:dur,events:ev,patch:pp});out[pre+' '+lab]=+((performance.now()-t0)/(dur*10)).toFixed(1)}}
 return out});console.log(JSON.stringify(r,null,1));await b.close()})();
