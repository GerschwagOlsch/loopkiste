const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p2=await b.newPage();await p2.goto('http://localhost:8792/loopkiste/public/index.html');await p2.waitForTimeout(500);
const r=await p2.evaluate(async()=>{const mod=await import('./engines/m1.js');const ac=new AudioContext();const eng=await mod.default(ac,{out:ac.destination});const out=[];
 for(const id of eng.presets().map(p=>p.id)){eng.loadPreset(id);const a=eng.getPatch();eng.setPatch(JSON.stringify(a));const c=eng.getPatch();
  const d=[];const diff=(x,y,p)=>{if(typeof x!=='object'||x===null){if(x!==y)d.push(p+':'+x+'→'+y);return}for(const k of new Set([...Object.keys(x),...Object.keys(y||{})]))diff(x[k],(y||{})[k],p+'.'+k)};diff(a.program,c.program,'');
  const dd=d.filter(s=>!/^\.(userPatch|originFactory|name):/.test(s));if(dd.length)out.push(id+' '+dd.join(' '))}
 return out});
console.log(r.length?r.join('\n'):'roundtrip identical (except userPatch/originFactory)');await b.close()})();
