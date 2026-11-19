const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:8791/');
const r=await p.evaluate(async()=>{const m=await import('./engines/pierrette.js');const ac=new AudioContext();const eng=await m.default(ac,{out:ac.destination});await eng.ready;
 const out=[];for(const name of ['Init','GrimBass_-_01 [mid]','Italo Strings - Adria01','Zabbaione Bone Strings','Brumbibrumm','DARK BASS ST 06','Noble Pian']){const pr=eng.presets().find(x=>x.name===name);if(!pr){out.push(name+' ?');continue}eng.loadPreset(pr.id);const pt=eng.getPatch();
  const ev=[{t:.1,midi:48,vel:.8,dur:.5}];const t0=performance.now();const buf=await eng.renderStem({sampleRate:48000,durationSec:10,events:ev});const ms=performance.now()-t0;
  // tail level in last 2 s, and idle cost with no notes at all
  const d=buf.getChannelData(0);let pk=0;for(let i=d.length-96000;i<d.length;i++)pk=Math.max(pk,Math.abs(d[i]));
  const t1=performance.now();await eng.renderStem({sampleRate:48000,durationSec:10,events:[]});const idle=(performance.now()-t1)/100;
  out.push([name,pt.voice_mode,'1note10s %RT',(ms/100).toFixed(1),'idle %RT',idle.toFixed(1),'tailPeak dBFS',(20*Math.log10(pk||1e-12)).toFixed(0),'vint',pt.vintage_amount,pt.vintage_noise,'rel',pt.release??pt.env_release])}
 return out});console.log(r.map(x=>JSON.stringify(x)).join('\n'));await b.close()})();
