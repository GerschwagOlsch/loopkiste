// Render gate: Loopkiste m1.js renderStem vs. the original NWB m1.html engine (same offline procedure).
const {chromium}=require('playwright');
const PROGS=[0,1,2,7,17,27,36,56,76,96,60,92];
const EV=[];const seq=[[0,60,.5],[0,64,.5],[0,67,.5],[.5,62,.25],[.75,65,.6],[1.5,48,1],[1.5,55,1],[1.5,72,.3],[2,36,.2],[2.25,36,.2],[2.5,43,.4]];
for(const [t,m,d] of seq)EV.push({t:t+.025,midi:m,vel:.85,dur:d});
(async()=>{const b=await chromium.launch();const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:8792/nwb2/NocturneWB/workbench/m1/m1.html');await pg.waitForTimeout(1500);
const ref=await pg.evaluate(async({PROGS,EV})=>{const out={};
  for(const id of PROGS){selectProgram(id);const SR=48000,off=new OfflineAudioContext(2,SR*5,SR);
    voices.clear();held.clear();_m1OfflineScheduling=true;const prune=at=>{for(const [n,arr] of [...voices])for(const v of [...arr])if(v&&Number.isFinite(v._offlineEnd)&&v._offlineEnd<=at+.000001)detachVoice(n,v)};
    initAudioGraph(off,{ui:false,immediate:true});
    for(const e of EV){prune(e.t);const g=await noteOn(e.midi,Math.round(e.vel*127),e.t);if(programState.mode!==2)noteOff(e.midi,e.t+e.dur,g)}
    const r=await off.startRendering();voices.clear();held.clear();_m1OfflineScheduling=false;
    out[id]=[Array.from(r.getChannelData(0)),Array.from(r.getChannelData(1))]}
  return out},{PROGS,EV});
const p2=await b.newPage();p2.on('pageerror',e=>errs.push(e.message));await p2.goto('http://localhost:8792/loopkiste/public/index.html');await p2.waitForTimeout(800);
const mine=await p2.evaluate(async({PROGS,EV})=>{const mod=await import('./engines/m1.js');const ac=new AudioContext();const eng=await mod.default(ac,{out:ac.destination});const out={};
  for(const id of PROGS){eng.loadPreset(id);const r=await eng.renderStem({sampleRate:48000,durationSec:5,events:EV});out[id]=[Array.from(r.getChannelData(0)),Array.from(r.getChannelData(1))]}
  // patch roundtrip
  eng.loadPreset(27);const p=eng.getPatch();eng.loadPreset(1);eng.setPatch(JSON.stringify(p));const back=eng.getPatch();
  return {out,rt:JSON.stringify(p.program)===JSON.stringify(back.program),cpu:0}},{PROGS,EV});
for(const id of PROGS){const a=ref[id],m=mine.out[id];let md=0,pk=0;for(let c=0;c<2;c++)for(let i=0;i<a[c].length;i++){md=Math.max(md,Math.abs(a[c][i]-m[c][i]));pk=Math.max(pk,Math.abs(a[c][i]))}
  let first=-1;for(let i=0;i<a[0].length;i++)if(Math.abs(a[0][i]-m[0][i])>1e-9){first=i;break}
  console.log(String(id).padStart(2),'peak',pk.toFixed(3),'maxDiff',md.toExponential(2),'firstDiff@',(first/48000).toFixed(4)+'s')}
console.log('patch roundtrip',mine.rt);console.log('errors',errs.length?errs:'none');await b.close()})();
