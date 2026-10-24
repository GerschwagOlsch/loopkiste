// Sonique: live worklet path (as the app plays before freeze) vs renderStem (what freeze/export use)
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8791/');await p.waitForTimeout(400);
for(const id of ['neon:7','italo:6','factory:3','curated:27','fctory1:25']){await p.reload();await p.waitForTimeout(300);const r=await p.evaluate(async(id)=>{const m=await import('./engines/sonique.js');const out={};{
    const SR=48000,DUR=4;const notes=[[0,62],[0,65],[0,69],[2,55],[2,59],[2,62]];
    const off=new OfflineAudioContext(2,SR*DUR,SR);const e=await m.default(off,{out:off.destination});await e.ready;e.loadPreset(id);
    for(const [t,n] of notes){e.noteOn(n,.8,t+.1);e.noteOff(n,t+1.6)}
    const live=await off.startRendering();
    const ac=new AudioContext({sampleRate:SR});const e2=await m.default(ac,{out:ac.destination});await e2.ready;e2.loadPreset(id);
    const st=await e2.renderStem({sampleRate:SR,durationSec:DUR,events:notes.map(([t,n])=>({t:t+.1,midi:n,vel:.8,dur:1.5}))});
    const L=live.getChannelData(0),S=st.getChannelData(0);let md=0,pl=0,ps=0,first=-1;for(let i=0;i<L.length;i++){const d=Math.abs(L[i]-S[i]);if(d>md)md=d;if(d>1e-4&&first<0)first=i;pl=Math.max(pl,Math.abs(L[i]));ps=Math.max(ps,Math.abs(S[i]))}
    const rms=a=>{let s=0;for(let i=SR;i<SR*1.5;i++)s+=a[i]*a[i];return 20*Math.log10(Math.sqrt(s/(SR*.5))+1e-9)};
    const ex=live.getChannelData(0);out[id]={maxDiff:md,firstDiffSec:first/SR,peakLive:pl,peakStem:ps,rmsLive:rms(L).toFixed(1),rmsStem:rms(S).toFixed(1),ctxRate:ac.sampleRate}}
  return out},id);console.log(JSON.stringify(r));}console.log(errs);await b.close()})();
