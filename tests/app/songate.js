const {chromium}=require('playwright');
const PICK=['VOXPAD','ITALO STR','GLASSPD','BO STR','CELLOS','SINPAD','STRSEC','LOVSTR','MIAMIW','AHHHHS'];
const EV=[];[[0,62],[0,65],[0,69],[0,72]].forEach(([t,n])=>EV.push({t,on:1,n,v:100},{t:t+1.5,on:0,n}));[[2,55],[2,59],[2,62],[2,65]].forEach(([t,n])=>EV.push({t,on:1,n,v:100},{t:t+1.5,on:0,n}));
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:8792/nwb2/NocturneWB/workbench/sonique/sonique.html');await pg.waitForTimeout(2500);
const p2=await b.newPage();await p2.goto('http://localhost:8792/loopkiste/public/index.html');await p2.waitForTimeout(500);
const list=await p2.evaluate(async()=>{const m=await import('./engines/sonique.js');window.__S=m;const ac=new AudioContext({sampleRate:48000});window.__ac=ac;const e=await m.default(ac,{out:ac.destination});await e.ready;window.__E=e;return e.presets()});
await pg.evaluate(async()=>{await window.__soniqueNwb.start()});
const sr=await pg.evaluate(()=>window.__soniqueNwb.getCtx().sampleRate);console.log('orig sr',sr);
for(const name of PICK){const pr=list.find(p=>p.name===name);if(!pr){console.log('missing',name);continue}const [bank,idx]=pr.id.split(':');
  const ref=await pg.evaluate(async({bank,idx,EV})=>{factoryBankSel.value=bank;await loadBuiltInFactoryBank(bank);patchSel.value=String(idx);patchSel.onchange();await new Promise(r=>setTimeout(r,200));
    const r=await window.__soniqueNwb.renderEvents(EV,4,0,1);return {name:currentPatch().name,L:Array.from(r.left.subarray(0,48000*4))}},{bank,idx,EV});
  const mine=await p2.evaluate(async({id,EV,sr})=>{__E.loadPreset(id);const evs=[];const on={};for(const e of EV){if(e.on)on[e.n]=e.t;else evs.push({t:on[e.n],midi:e.n,vel:100/127,dur:e.t-on[e.n]})}
    const b=await __E.renderStem({sampleRate:sr,durationSec:4,events:evs});const G=(await import('./engines/sonique.js')).OUTPUT_GAIN;return Array.from(b.getChannelData(0).subarray(0,sr*4)).map(x=>x/G)},{id:pr.id,EV,sr});
  let md=0,pk=0;for(let i=0;i<ref.L.length;i++){md=Math.max(md,Math.abs(ref.L[i]-mine[i]));pk=Math.max(pk,Math.abs(ref.L[i]))}
  console.log(pr.id.padEnd(12),name.padEnd(10),'orig:',ref.name.padEnd(10),'peak',pk.toFixed(3),'maxDiff',md.toExponential(2))}
console.log('errors',errs.slice(0,3));await b.close()})();
