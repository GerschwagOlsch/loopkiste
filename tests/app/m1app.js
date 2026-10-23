const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.addInitScript(()=>{if(!sessionStorage.getItem('t')){localStorage.clear();sessionStorage.setItem('t','1')}});await p.goto('http://localhost:8791/');await p.waitForTimeout(500);
await p.click('#bootBtn');await p.waitForTimeout(3500);
// switch chords to M1 via the sound sheet
await p.click('.track:nth-child(3)');await p.click('.track:nth-child(3)');await p.waitForTimeout(300);
await p.click('.sheetbody .opt:has-text("M1 PCM")');await p.waitForTimeout(3000);
await p.screenshot({path:'tests/app/m1_sheet.png'});
console.log('chords',await p.evaluate(()=>({engine:__lk.P.tracks.chords.engine,ok:!!__lk.inst.chords.eng,preset:__lk.P.tracks.chords.preset,cats:[...new Set(__lk.inst.chords.eng.presets().map(x=>x.cat))]})));
await p.click('.sheethead [data-close]');
await p.evaluate(async()=>{for(const id of ['bass','lead']){__lk.P.tracks[id].engine='m1';__lk.P.tracks[id].patch=null;await __lk.ensureEngine(id)}});
console.log('presets',await p.evaluate(()=>['bass','chords','lead'].map(id=>id+':'+__lk.inst[id].eng.presets().find(x=>x.id===__lk.P.tracks[id].preset)?.name)));
await p.click('#play');await p.waitForTimeout(12000);
console.log('frozen',await p.evaluate(()=>Object.fromEntries(Object.entries(__lk.FZ).map(([k,f])=>[k,f?(f.src?'play':'buf'):'-']))));
await p.click('#play');
const r=await p.evaluate(async()=>{const L=__lk;const res=await L.exportAudio({P:L.P,segs:L.arrangement('scene1'),inst:L.inst,TRACKS:L.TRACKS,eventsForStep:L.eventsForStep,fade:true});return {dur:res.mix.duration,peak:res.peakDb}});
console.log('export',JSON.stringify(r));
// reload: patch persistence
await p.waitForTimeout(600);console.log("patch keys",await p.evaluate(()=>{const x=__lk.P.tracks.chords.patch;return typeof x+" "+(x&&Object.keys(x).join(","))}));const pr=await p.evaluate(()=>JSON.stringify(__lk.inst.chords.eng.getPatch().program.osc1));
await p.evaluate(()=>{localStorage.setItem('loopkiste.current',JSON.stringify(__lk.P))});
await p.reload();await p.evaluate(()=>{});await p.waitForTimeout(500);await p.click('#bootBtn');await p.waitForTimeout(4000);
console.log('persist same',await p.evaluate(pr=>JSON.stringify(__lk.inst.chords.eng.getPatch().program.osc1)===pr,pr));
console.log('errors',errs.filter(e=>!e.includes('TUNNEL')).length?errs:'none');await b.close()})();
