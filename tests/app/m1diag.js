const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage();
await pg.goto('http://localhost:8792/nwb2/NocturneWB/workbench/m1/m1.html');await pg.waitForTimeout(1500);
const a=await pg.evaluate(()=>{selectProgram(1);return JSON.stringify({p:params,s:programState,w:[window._bendCents,window._aftertouchCents],dry:dryReference,mw:modWheel,cp:channelPressure})});
const p2=await b.newPage();await p2.goto('http://localhost:8792/loopkiste/public/index.html');await p2.waitForTimeout(500);
const m=await p2.evaluate(async()=>{const mod=await import('./engines/m1.js');const ac=new AudioContext();const eng=await mod.default(ac,{out:ac.destination});eng.loadPreset(1);return JSON.stringify(eng.getPatch())});
const A=JSON.parse(a),M=JSON.parse(m);console.log('ref params',JSON.stringify(A.p).slice(0,2000));console.log('w',A.w,A.dry,A.mw,A.cp);
const diff=(x,y,path='')=>{if(typeof x!=='object'||x===null){if(x!==y)console.log('DIFF',path,x,y);return}for(const k of new Set([...Object.keys(x),...Object.keys(y||{})]))diff(x[k],(y||{})[k],path+'.'+k)};
diff(A.s,M.program);await b.close()})();
