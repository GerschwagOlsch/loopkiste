const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('TUNNEL'))errs.push(m.text())});
await p.addInitScript(()=>{if(!sessionStorage.getItem('t')){localStorage.clear();sessionStorage.setItem('t','1')}});
await p.goto('http://localhost:8791/');await p.waitForTimeout(500);await p.click('#bootBtn');await p.waitForTimeout(3500);
console.log('defaults',await p.evaluate(()=>({bpm:__lk.P.bpm,bars:__lk.P.scenes.A.bars,order:__lk.P.order,launch:__lk.P.launch})));
// drums: 909 kick + sds-v kick
await p.click('.empty .cta');await p.waitForTimeout(400);
await p.click('.dpick:has-text("Kick") .opt.mach:has-text("909")');await p.waitForTimeout(600);
await p.click('.dpick:has-text("Kick") .opt.mach:has-text("SDS-V")');await p.waitForTimeout(1500);
await p.click('.dpick:has-text("Snare") .opt.mach:has-text("SDS7")');await p.waitForTimeout(1500);
await p.screenshot({path:'tests/app/v4_picker.png'});await p.click('.sheetbody .cta:has-text("Fertig")');await p.waitForTimeout(300);
for(const s of [0,8])await p.click(`.cell[data-lane="bd@909"][data-s="${s}"]`);
for(const s of [4,12])await p.click(`.cell[data-lane="bd@sds-v"][data-s="${s}"]`);
await p.click(`.cell[data-lane="sd@sds7"][data-s="4"]`);
console.log('drums',await p.evaluate(()=>({lanes:__lk.P.tracks.drums.lanes,units:['909','sds-v','sds7'].map(c=>__lk.inst.drums.eng.hasUnit(c))})));
await p.screenshot({path:'tests/app/v4_drums.png'});
// add a second lead (M1) and a second chords track
await p.evaluate(()=>{__lk.addTrack('lead','m1');__lk.addTrack('chords','puss')});await p.waitForTimeout(3000);
console.log('tracks',await p.evaluate(()=>__lk.TRACKS.map(t=>t.id+':'+t.name+':'+t.type+':'+__lk.P.tracks[t.id].engine+':'+(!!__lk.inst[t.id].eng)).join(' ')));
await p.screenshot({path:'tests/app/v4_tracks.png',clip:{x:0,y:0,width:390,height:260}});
// chords on the new chords track
await p.evaluate(()=>{const t=document.querySelectorAll('.track')[5];if(!t.classList.contains('sel'))t.click()});await p.waitForTimeout(300);
await p.click('.palette button:first-child');await p.click('.barblock .cell[data-s="0"]');
console.log('chords2',await p.evaluate(()=>JSON.stringify(__lk.P.scenes.A.chords2.map(n=>n.p))));
await p.screenshot({path:'tests/app/v4_chords2.png'});
// bass half-bar view: tap step 12 (second half block)
await p.evaluate(()=>{const t=document.querySelectorAll('.track')[1];if(!t.classList.contains('sel'))t.click()});await p.waitForTimeout(300);
const cells=await p.$$('.cell[data-s="12"][data-p]');await cells[3].click();console.log('bass',await p.evaluate(()=>JSON.stringify(__lk.P.scenes.A.bass)),'blocks',await p.$$eval('.barblock',e=>e.length));
await p.screenshot({path:'tests/app/v4_bass.png'});
// scene launch now
await p.click('#play');await p.waitForTimeout(5000);
await p.evaluate(()=>{__lk.P.launch='now'});await p.evaluate(()=>__lk.chooseScene('B'));await p.waitForTimeout(500);
console.log('scene',await p.evaluate(()=>__lk.P.cur),'frozen',await p.evaluate(()=>Object.fromEntries(Object.entries(__lk.FZ).map(([k,f])=>[k,f?(f.src?'play':'buf'):'-']))));
await p.evaluate(()=>__lk.chooseScene('A'));await p.waitForTimeout(4000);await p.click('#play');
const r=await p.evaluate(async()=>{const L=__lk;const res=await L.exportAudio({P:L.P,segs:L.arrangement('scene1'),inst:L.inst,TRACKS:L.TRACKS,eventsForStep:L.eventsForStep,fade:true});return {dur:res.mix.duration,peak:res.peakDb,ev:Object.fromEntries(Object.entries(res.events).map(([k,v])=>[k,v.length]))}});
console.log('export',JSON.stringify(r));
// remove track + undo
await p.evaluate(()=>__lk.removeTrack('lead2'));console.log('after remove',await p.evaluate(()=>__lk.P.order.join(',')));await p.click('#undoBtn');console.log('after undo',await p.evaluate(()=>__lk.P.order.join(',')+' '+JSON.stringify(__lk.P.scenes.A.chords2.length)));
// reload persistence
await p.reload();await p.waitForTimeout(500);await p.click('#bootBtn');await p.waitForTimeout(3000);console.log('reload',await p.evaluate(()=>__lk.P.order.join(',')+' bd909='+__lk.P.scenes.A.drums['bd@909'].filter(Boolean).length));
const ov=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));console.log('overflow',JSON.stringify(ov));
console.log('errors',errs.length?errs:'none');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
