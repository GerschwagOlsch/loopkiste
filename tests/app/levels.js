const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const p=await b.newPage();
await p.addInitScript(()=>localStorage.clear());await p.goto('http://localhost:8791/');await p.waitForTimeout(400);await p.click('#bootBtn');await p.waitForTimeout(3000);
await p.click('#menuBtn');await p.click('.opt:has-text("Demo laden")');await p.waitForTimeout(1500);
const r=await p.evaluate(async()=>{const {loudness}=await import('./export.js');const out={};const sc=__lk.P.scenes.A;
  const combos={drums:['dolly'],bass:['pierrette','puss','sonique','m1'],chords:['sonique','puss','pierrette','m1'],lead:['puss','sonique','pierrette','m1']};
  for(const [id,engs] of Object.entries(combos))for(const e of engs){__lk.P.tracks[id].engine=e;__lk.P.tracks[id].patch=null;__lk.P.tracks[id].preset=null;await __lk.ensureEngine(id);
    const sd=60/__lk.P.bpm/4,ev=[];for(let i=0;i<32;i++)for(const x of __lk.eventsForStep(__lk.P,sc,i,i*sd,sd,.1,t=>t===id))ev.push(id==='drums'?{t:x.t,lane:x.lane,vel:x.vel}:{t:x.t,midi:x.midi,vel:x.vel,dur:x.dur});
    const buf=await __lk.inst[id].eng.renderStem({sampleRate:48000,durationSec:32*sd+1,events:ev});let pk=0;const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)pk=Math.max(pk,Math.abs(d[i]));
    out[id+'/'+e+'/'+__lk.inst[id].eng.presets().find(x=>x.id===__lk.P.tracks[id].preset)?.name]={lufs:(await loudness(buf)).toFixed(1),peak:(20*Math.log10(pk)).toFixed(1)}}
  return out});
console.log(r);await b.close()})();
