const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const p=await b.newPage();await p.goto('http://localhost:8791/');
const r=await p.evaluate(async()=>{const out={};const dur=10,sr=48000;
 for(const id of ['puss','sonique','pierrette','m1','drumrack']){try{const m=await import('./engines/'+id+'.js');
   for(const mode of ['connected','disconnected']){const off=new OfflineAudioContext(2,sr*dur,sr);const g=off.createGain();if(mode==='connected')g.connect(off.destination);
     const eng=await m.default(off,{out:g});await eng.ready;const t0=performance.now();await off.startRendering();out[id+' '+mode]=+((performance.now()-t0)/(dur*10)).toFixed(2)}}catch(e){out[id]='ERR '+e.message}}
 return out});console.log(JSON.stringify(r,null,1));await b.close()})();
