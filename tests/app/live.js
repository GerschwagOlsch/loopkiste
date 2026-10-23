const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const p=await b.newPage();const log=[];
p.on('pageerror',e=>log.push('PE '+e.message));p.on('console',m=>{if(['error','warning'].includes(m.type()))log.push('C '+m.text())});
await p.addInitScript(()=>{localStorage.clear();const O=window.AudioWorkletNode;window.AudioWorkletNode=class extends O{constructor(c,n,o){super(c,n,o);this.addEventListener('processorerror',e=>console.error('PROCESSORERROR '+n+' '+(e.message||'')))}}});
await p.goto('http://localhost:8791/');await p.click('#bootBtn');await p.waitForTimeout(4000);
const r=await p.evaluate(async()=>{const L=__lk;const out={};const sd=60/L.P.bpm/4;
 for(const t of L.TRACKS){const eng=L.inst[t.id].eng;const ev=[];const sc=L.P.scenes.A;for(let rep=0;rep<4;rep++)for(let i=0;i<32;i++)for(const e of L.eventsForStep(L.P,sc,i,(rep*32+i)*sd,sd,0,null))if(e.track===t.id)ev.push(t.id==='drums'?{t:e.t,lane:e.lane,vel:e.vel}:{t:e.t,midi:e.midi,vel:e.vel,dur:e.dur});
   const dur=128*sd+1;const t0=performance.now();const buf=await eng.renderStem({sampleRate:48000,durationSec:dur,events:ev});const ms=performance.now()-t0;let pk=0;const d=buf.getChannelData(0);for(const x of d)pk=Math.max(pk,Math.abs(x));out[t.id]={engine:L.inst[t.id].engine,rtPct:+(ms/(dur*1000)*100).toFixed(1),peak:+pk.toFixed(3),events:ev.length}}
 return out});
console.log(JSON.stringify(r,null,1));
await p.click('#play');await p.waitForTimeout(8000);await p.click('#play');
console.log(log.filter(x=>!/TUNNEL|fonts/.test(x)).join('\n')||'no errors');await b.close()})().catch(e=>{console.error('FAIL',e);process.exit(1)});
