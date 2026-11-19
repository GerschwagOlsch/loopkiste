const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:8791/');
const r=await p.evaluate(async()=>{const m=await import('./engines/pierrette.js');const ac=new AudioContext();const eng=await m.default(ac,{out:ac.destination});await eng.ready;
 const ev=[];for(let k=0;k<32;k++)ev.push({t:k*.25,midi:36+(k%4)*3,vel:.8,dur:.2});
 const res=[];const list=eng.presets();
 for(const pr of list){eng.loadPreset(pr.id);const pt=eng.getPatch();const t0=performance.now();await eng.renderStem({sampleRate:48000,durationSec:8,events:ev});res.push([((performance.now()-t0)/80).toFixed(1),pr.cat,pr.name,pt.voice_mode,pt.poly_voices,pt.vintage_amount>0?'vint':''])}
 res.sort((a,b)=>b[0]-a[0]);return {n:list.length,top:res.slice(0,15),median:res[res.length>>1],min:res[res.length-1]}});
console.log(JSON.stringify(r,null,0).replace(/\],\[/g,'],\n['));await b.close()})();
