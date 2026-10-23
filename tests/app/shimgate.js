const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();p.on('pageerror',e=>console.log('PE',e.message));await p.goto('http://localhost:8791/');
const r=await p.evaluate(async()=>{const out={};const sd=60/112/4;
 for(const id of ['puss','pierrette','dolly','sonique']){const res={};
  for(const ver of ['_before','engines']){const m=await import('./'+ver+'/'+id+'.js');const ac=new AudioContext();const eng=await m.default(ac,{});await eng.ready;
    const ev=[];for(let i=0;i<64;i++){if(id==='dolly'){ev.push({t:i*sd,lane:'ch',vel:.7});if(i%4===0)ev.push({t:i*sd,lane:'bd',vel:1});if(i%8===4)ev.push({t:i*sd,lane:'sd',vel:.9})}else if(i%2===0)ev.push({t:i*sd,midi:[57,60,64,67][(i/2)%4],vel:.85,dur:sd*1.8})}
    const t0=performance.now();const buf=await eng.renderStem({sampleRate:48000,durationSec:64*sd+1,events:ev});res[ver]={ms:performance.now()-t0,L:buf.getChannelData(0).slice(),R:buf.getChannelData(1).slice()};ac.close()}
  let md=0;const a=res._before,c=res.engines;for(let i=0;i<a.L.length;i++)md=Math.max(md,Math.abs(a.L[i]-c.L[i]),Math.abs(a.R[i]-c.R[i]));
  const dur=(64*sd+1)*1000;out[id]={maxDiff:md,beforePct:+(a.ms/dur*100).toFixed(1),afterPct:+(c.ms/dur*100).toFixed(1)}}
 return out});console.log(JSON.stringify(r,null,1));await b.close()})();
