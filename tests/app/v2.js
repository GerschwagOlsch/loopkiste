const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.text())});
await p.addInitScript(()=>localStorage.clear());
await p.goto('http://localhost:8791/');await p.waitForTimeout(600);
await p.click('#bootBtn');await p.waitForTimeout(4000);
await p.screenshot({path:'tests/app/v2_lead.png'});
// bars stepper
await p.click('#barsPlus');await p.click('#barsPlus');await p.waitForTimeout(200);
console.log('bars',await p.evaluate(()=>__lk.P.scenes.A.bars),'blocks',await p.$$eval('.barblock',e=>e.length));
await p.click('#barsMinus');await p.click('#barsMinus');
// drums + card cycle
await p.click('.track:nth-child(1)');await p.waitForTimeout(300);await p.screenshot({path:'tests/app/v2_drums.png',fullPage:false});
const cards=await p.$$eval('.barblock:first-child button.card:not([disabled])',e=>e.map(x=>x.textContent));console.log('switchable cards',cards);
const before=await p.evaluate(()=>__lk.inst.drums.eng.lanes().map(l=>l.id+':'+l.engine).join(' '));
const btn=await p.$('.barblock button.card:not([disabled])');if(btn){await btn.click();await p.waitForTimeout(200)}
const after=await p.evaluate(()=>__lk.inst.drums.eng.lanes().map(l=>l.id+':'+l.engine).join(' '));console.log('lanes before',before,'\nlanes after ',after);
// chords voicing
await p.click('.track:nth-child(3)');await p.waitForTimeout(200);
const v=async()=>p.evaluate(()=>{const sc=__lk.P.scenes.A;const st=[...new Set(sc.chords.map(n=>n.s))].sort((a,b)=>a-b);return st.map(s=>sc.chords.filter(n=>n.s===s).map(n=>n.p).sort((a,b)=>a-b).join(',')).join(' | ')});
console.log('lead ',await v());
for(const lab of ['Grundstellung','Weit','Gleiche Lage']){await p.click(`text=${lab}`);await p.waitForTimeout(100);console.log(lab.padEnd(13),await v())}
await p.click('text=+ Bass');console.log('+Bass        ',await v());await p.click('text=+ Bass');
await p.click('.palette button:has-text("▲")');await p.click('.barblock .cell[data-s="0"]');console.log('▲ on step0   ',await v());
await p.screenshot({path:'tests/app/v2_chords.png'});
// bass step
await p.click('.track:nth-child(2)');await p.waitForTimeout(200);await p.screenshot({path:'tests/app/v2_bass.png'});
// play + freeze
await p.click('#play');await p.waitForTimeout(6000);
console.log('frozen',await p.evaluate(()=>Object.fromEntries(Object.entries(__lk.FZ).map(([k,f])=>[k,!!(f&&f.buf)+'/'+!!(f&&f.src)]))));
// mixer
await p.click('#mixBtn');await p.waitForTimeout(800);await p.screenshot({path:'tests/app/v2_mixer.png'});
await p.click('.strip:nth-child(1) .ms.solo');await p.waitForTimeout(300);
console.log('solo drums gains',await p.evaluate(()=>__lk.TRACKS.map(t=>t.id+'='+(__lk.P.tracks[t.id].solo?'S':'')).join(' ')));
await p.click('.strip:nth-child(1) .ms.solo');
await p.click('button.cta:has-text("Automix")');await p.waitForTimeout(8000);
console.log('automix',await p.textContent('#sheetBody .sec .note:last-child'));
console.log('vols',await p.evaluate(()=>__lk.TRACKS.map(t=>t.id+'='+__lk.P.tracks[t.id].vol).join(' ')));
await p.screenshot({path:'tests/app/v2_mixer2.png'});
await p.click('.sheethead [data-close]');await p.click('#play');
const ov=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));console.log('overflow',JSON.stringify(ov));
console.log('errors',errs.length?errs:'none');await b.close()})().catch(e=>{console.error('FAIL',e);process.exit(1)});
