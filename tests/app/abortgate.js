const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();p.on('console',m=>{if(!m.text().includes('TUNNEL'))console.log('C:',m.text().slice(0,200))});await p.goto('http://localhost:8791/');
const r=await p.evaluate(async()=>{const out={};
 for(const id of ['pierrette','puss','m1','sonique']){const m=await import('./engines/'+id+'.js');const ac=new AudioContext();const eng=await m.default(ac,{out:ac.destination});await eng.ready;
  const list=eng.presets();const pr=id==='pierrette'?list.find(x=>x.name==='Brumbibrumm'):list[3];eng.loadPreset(pr.id);
  const ev=[];for(let k=0;k<16;k++)ev.push({t:k*.25,midi:40+(k%4)*3,vel:.8,dur:.2});
  const a=await eng.renderStem({sampleRate:48000,durationSec:4,events:ev});
  let prog=[];const b2=await eng.renderStem({sampleRate:48000,durationSec:4,events:ev,signal:new AbortController().signal,onProgress:(t,ms)=>prog.push(+t.toFixed(3))});
  let md=0,rms=0;for(let c=0;c<2;c++){const x=a.getChannelData(c),y=b2.getChannelData(c);for(let i=0;i<x.length;i++){md=Math.max(md,Math.abs(x[i]-y[i]));rms+=x[i]*x[i]}}
  // abort timing
  const ctl=new AbortController();const t0=performance.now();const pr2=eng.renderStem({sampleRate:48000,durationSec:20,events:ev,signal:ctl.signal});setTimeout(()=>ctl.abort(),50);let res;try{await pr2;res='finished'}catch(e){res=e.name}
  out[id]={maxdiff:md,rms:+Math.sqrt(rms/a.length/2).toFixed(4),progressPts:prog.length,abort:res+' after '+Math.round(performance.now()-t0)+'ms'};ac.close()}
 return out});console.log(JSON.stringify(r,null,1));await b.close()})();
