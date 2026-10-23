const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:8791/');
const r=await p.evaluate(async()=>{const out={};const dur=20;
 // baseline: empty offline context with a gain node
 let t0=performance.now();let off=new OfflineAudioContext(2,48000*dur,48000);const o=off.createOscillator();o.connect(off.destination);o.start();await off.startRendering();out.baselineOsc=+((performance.now()-t0)/(dur*10)).toFixed(2);
 for(const id of ['puss','sonique','pierrette','dolly']){const m=await import('./engines/'+id+'.js');const ac=new AudioContext();const eng=await m.default(ac,{out:ac.destination});await eng.ready;
   t0=performance.now();await eng.renderStem({sampleRate:48000,durationSec:dur,events:[]});out[id+' idle']=+((performance.now()-t0)/(dur*10)).toFixed(2);
   const ev=id==='dolly'?[{t:.1,lane:'bd',vel:1}]:[{t:.1,midi:60,vel:.8,dur:.3}];t0=performance.now();await eng.renderStem({sampleRate:48000,durationSec:dur,events:ev});out[id+' 1note']=+((performance.now()-t0)/(dur*10)).toFixed(2);ac.close()}
 return out});console.log(JSON.stringify(r,null,1));await b.close()})();
