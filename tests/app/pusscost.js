const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:8791/');
const r=await p.evaluate(async()=>{const m=await import('./engines/puss.js');const ac=new AudioContext();const eng=await m.default(ac,{out:ac.destination});await eng.ready;
 const mono=[],ch=[];for(let k=0;k<32;k++)mono.push({t:k*.25,midi:36+(k%4)*3,vel:.8,dur:.2});for(let k=0;k<8;k++)for(const n of [57,60,64])ch.push({t:k,midi:n,vel:.8,dur:.95});
 const res=[];const list=eng.presets();
 const t=async ev=>{const t0=performance.now();await eng.renderStem({sampleRate:48000,durationSec:8,events:ev});return (performance.now()-t0)/80};
 // idle
 let idle=0;{const t0=performance.now();await eng.renderStem({sampleRate:48000,durationSec:8,events:[]});idle=(performance.now()-t0)/80}
 for(const pr of list){eng.loadPreset(pr.id);const pt=eng.getPatch();res.push([+(await t(mono)).toFixed(1),+(await t(ch)).toFixed(1),pr.cat,pr.name,pt.synth&&pt.synth.poly])}
 res.sort((a,b)=>b[1]-a[1]);const med=i=>{const v=res.map(x=>x[i]).sort((a,b)=>a-b);return v[v.length>>1]};
 return {n:list.length,idle:+idle.toFixed(1),medianMono:med(0),medianChord:med(1),maxMono:Math.max(...res.map(x=>x[0])),top:res.slice(0,8),bottom:res.slice(-3)}});
console.log(JSON.stringify(r).replace(/\],\[/g,'],\n['));await b.close()})();
