const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage();
await pg.goto('http://localhost:8792/nwb2/NocturneWB/workbench/m1/m1.html');await pg.waitForTimeout(1500);
const r=await pg.evaluate(async()=>{const EV=[{t:.025,midi:60,vel:.85,dur:.5},{t:.5,midi:64,vel:.85,dur:.5}];const runs=[];
  for(let k=0;k<3;k++){selectProgram(k<2?1:1);const off=new OfflineAudioContext(2,48000*2,48000);voices.clear();held.clear();_m1OfflineScheduling=true;initAudioGraph(off,{ui:false,immediate:true});
    for(const e of EV){const g=await noteOn(e.midi,108,e.t);noteOff(e.midi,e.t+e.dur,g)}const x=await off.startRendering();_m1OfflineScheduling=false;runs.push(x.getChannelData(0))}
  let d=0;for(let i=0;i<runs[0].length;i++)d=Math.max(d,Math.abs(runs[0][i]-runs[1][i]),Math.abs(runs[0][i]-runs[2][i]));
  // same with FX bypass (dry)
  return d});
console.log('ref vs ref maxDiff',r);await b.close()})();
