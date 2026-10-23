const {chromium}=require('playwright');
const EV=[[0,60,.5],[0,64,.5],[0,67,.5],[.5,62,.25],[.75,65,.6],[1.5,48,1]].map(([t,m,d])=>({t:t+.025,midi:m,vel:.85,dur:d}));
(async()=>{const b=await chromium.launch();
const pg=await b.newPage();await pg.goto('http://localhost:8792/nwb2/NocturneWB/workbench/m1/m1.html');await pg.waitForTimeout(1500);
const ref=await pg.evaluate(async EV=>{const runs=[];for(let k=0;k<3;k++){selectProgram(1);const off=new OfflineAudioContext(2,48000*5,48000);voices.clear();held.clear();_m1OfflineScheduling=true;initAudioGraph(off,{ui:false,immediate:true});
  for(const e of EV){const g=await noteOn(e.midi,108,e.t);noteOff(e.midi,e.t+e.dur,g)}runs.push((await off.startRendering()).getChannelData(0));_m1OfflineScheduling=false}
  let d=0;for(let i=0;i<runs[0].length;i++)d=Math.max(d,Math.abs(runs[0][i]-runs[1][i]),Math.abs(runs[0][i]-runs[2][i]));return d},EV);
const p2=await b.newPage();await p2.goto('http://localhost:8792/loopkiste/public/index.html');await p2.waitForTimeout(500);
const mine=await p2.evaluate(async EV=>{const mod=await import('./engines/m1.js');const ac=new AudioContext();const eng=await mod.default(ac,{out:ac.destination});eng.loadPreset(1);const runs=[];
  for(let k=0;k<3;k++)runs.push((await eng.renderStem({sampleRate:48000,durationSec:5,events:EV})).getChannelData(0));
  let d=0;for(let i=0;i<runs[0].length;i++)d=Math.max(d,Math.abs(runs[0][i]-runs[1][i]),Math.abs(runs[0][i]-runs[2][i]));return d},EV);
console.log('ref-ref',ref,'mine-mine',mine);await b.close()})();
