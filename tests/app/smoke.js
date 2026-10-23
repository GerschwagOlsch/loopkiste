const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const engines=JSON.parse(process.argv[2]||'{}');
await p.addInitScript(eng=>{localStorage.clear();window.__ENG=eng},engines);
await p.goto('http://localhost:8791/');await p.waitForTimeout(800);
if(Object.keys(engines).length)await p.evaluate(eng=>{for(const [k,v] of Object.entries(eng))__lk.P.tracks[k].engine=v},engines);
await p.click('#bootBtn');await p.waitForTimeout(4000);
const st=await p.evaluate(()=>Object.fromEntries(Object.entries(__lk.inst).map(([k,r])=>[k,{engine:r.engine,ok:!!r.eng}])));console.log('engines',JSON.stringify(st));
await p.screenshot({path:'tests/app/shot_lead.png'});
await p.click('#play');await p.waitForTimeout(2500);
for(const id of ['drums','bass','chords']){await p.click(`.track:nth-child(${['drums','bass','chords','lead'].indexOf(id)+1})`);await p.waitForTimeout(300);await p.screenshot({path:'tests/app/shot_'+id+'.png'})}
await p.click('#play');
// roll + pads views on lead
await p.click('.track:nth-child(4)');await p.click('.seg button:nth-child(2)');await p.waitForTimeout(300);await p.screenshot({path:'tests/app/shot_roll.png'});
await p.click('.seg button:nth-child(3)');await p.waitForTimeout(300);await p.screenshot({path:'tests/app/shot_pads.png'});
await p.click('.seg button:nth-child(1)');
// sound sheet
await p.click('.track:nth-child(4)');await p.waitForTimeout(600);await p.screenshot({path:'tests/app/shot_sound.png'});await p.click('.sheethead [data-close]');
// export wav via API
const r=await p.evaluate(async()=>{const L=__lk;const res=await L.exportAudio({P:L.P,segs:L.arrangement('scene1'),inst:L.inst,TRACKS:L.TRACKS,eventsForStep:L.eventsForStep,fade:true});return {dur:res.mix.duration,peak:res.peakDb,ev:Object.fromEntries(Object.entries(res.events).map(([k,v])=>[k,v.length]))}});
console.log('export',JSON.stringify(r));
await p.click('#menuBtn');await p.waitForTimeout(300);await p.screenshot({path:'tests/app/shot_menu.png'});
// horizontal overflow check
const ov=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));console.log('overflow',JSON.stringify(ov));
console.log('errors',errs.length?errs:'none');await b.close()})().catch(e=>{console.error('FAIL',e);process.exit(1)});
