const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>localStorage.clear());await p.goto('http://localhost:8791/');await p.waitForTimeout(500);
await p.evaluate(()=>{__lk.P.tracks.bass.engine='puss';__lk.P.tracks.chords.engine='puss'});
await p.click('#bootBtn');await p.waitForTimeout(3000);
// roll screenshot after fix
await p.click('.seg button:nth-child(2)');await p.waitForTimeout(300);await p.screenshot({path:'tests/app/shot_roll2.png'});
// tap-add a note in roll at visible empty spot, then delete it
const before=await p.evaluate(()=>__lk.P.scenes.A.lead.length);
const box=await (await p.$('.rollin')).boundingBox();const roll=await (await p.$('.roll')).boundingBox();
await p.mouse.click(roll.x+38+26*5+10,roll.y+40);await p.waitForTimeout(200);
const after=await p.evaluate(()=>__lk.P.scenes.A.lead.length);console.log('roll add',before,'->',after);
await p.click('.seg button:nth-child(1)');
// step edit: tap empty cell
const n0=await p.evaluate(()=>__lk.P.scenes.A.lead.length);const cell=await p.$('.grid .cell[data-st="6"]');await cell.click();const n1=await p.evaluate(()=>__lk.P.scenes.A.lead.length);console.log('step add',n0,'->',n1);
// video export
await p.click('#menuBtn');await p.click('text=Szene ×1');const t0=Date.now();await p.click('text=Video 9:16');
await p.waitForSelector('a.cta[download]',{timeout:60000});const a=await p.$eval('a.cta[download]',e=>e.getAttribute('download'));
const st=await p.$eval('.sheetbody .note',e=>e.textContent);console.log('video',a,st,((Date.now()-t0)/1000).toFixed(1)+'s');
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('a.cta[download]')]);await dl.saveAs('tests/app/out.'+a.split('.').pop());await p.screenshot({path:'tests/app/shot_export.png'});
console.log('errors',errs.length?errs:'none');await b.close()})().catch(e=>{console.error('FAIL',e);process.exit(1)});
