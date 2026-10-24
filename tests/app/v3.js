const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.addInitScript(()=>{if(!sessionStorage.getItem('t')){localStorage.clear();
  // simulate an old saved demo (v2) to check it is moved aside
  localStorage.setItem('loopkiste.current',JSON.stringify({v:2,name:'Erster Loop',bpm:112,swing:.1,key:2,scale:'dorian',cur:'A',song:{on:false,list:[]},tracks:{drums:{engine:'dolly',vol:.9},bass:{engine:'pierrette',vol:.8},chords:{engine:'sonique',vol:.6},lead:{engine:'puss',vol:.7}},scenes:{A:{bars:2,drums:{bd:[2]},bass:[],chords:[],lead:[]}}}));
  sessionStorage.setItem('t','1')}});
await p.goto('http://localhost:8791/');await p.waitForTimeout(500);await p.click('#bootBtn');await p.waitForTimeout(3500);
console.log('start',await p.evaluate(()=>({name:__lk.P.name,notes:JSON.stringify(__lk.P.scenes.A).length,saved:Object.keys(JSON.parse(localStorage.getItem('loopkiste.projects')||'{}'))})));
await p.screenshot({path:'tests/app/v3_empty.png'});
await p.click('.empty .cta');await p.waitForTimeout(400);await p.screenshot({path:'tests/app/v3_picker.png'});
await p.click('.dpick:has-text("Kick") .opt.mach:has-text("SDS-V")');await p.waitForTimeout(300);
await p.click('.dpick:has-text("Snare") .opt.mach:has-text("909")');await p.waitForTimeout(300);
await p.click('.dpick:has-text("Hi-Hat") .opt.mach:has-text("909")');await p.waitForTimeout(300);
await p.click('.sheetbody .cta:has-text("Fertig")');await p.waitForTimeout(300);
for(const s of [0,4,8,12])await p.click(`.cell[data-lane="bd"][data-s="${s}"]`);
await p.click('.cell[data-lane="sd"][data-s="4"]');
console.log('drums',await p.evaluate(()=>({lanes:__lk.P.tracks.drums.lanes,bd:__lk.inst.drums.eng.lanes().find(l=>l.id==='bd').engine,sum:__lk.P.scenes.A.drums.bd.filter(Boolean).length})));
await p.screenshot({path:'tests/app/v3_drums.png'});
// bass: length 1/4
await p.click('.track:nth-child(2)');await p.waitForTimeout(200);
await p.click('.chip.len:has-text("1/4")');
const cell=async(s,i)=>(await p.$$(`.cell[data-s="${s}"][data-p]`))[i];
await (await cell(0,7)).click();await (await cell(8,5)).click();
console.log('bass after 2 taps',await p.evaluate(()=>JSON.stringify(__lk.P.scenes.A.bass)));
await (await cell(2,7)).click(); // tap in tail -> shorten to 2
console.log('bass after cut',await p.evaluate(()=>JSON.stringify(__lk.P.scenes.A.bass)));
await p.click('.chip:has-text("Akzent")');await (await cell(8,5)).click();await p.click('.chip:has-text("Akzent")');
console.log('bass accent',await p.evaluate(()=>JSON.stringify(__lk.P.scenes.A.bass)));
await p.screenshot({path:'tests/app/v3_bass.png'});
// chords: hold off, length 1/2
await p.click('.track:nth-child(3)');await p.waitForTimeout(200);
await p.click('.palette button:first-child');await p.click('.barblock .cell[data-s="0"]');
await p.click('.chip:has-text("Halten")');await p.click('.chip.len:has-text("1/2")');
await p.click('.palette button:nth-child(4)');await p.click('.barblock .cell[data-s="16"]');
console.log('chords',await p.evaluate(()=>{const c=__lk.P.scenes.A.chords;return [...new Set(c.map(n=>n.s+':'+n.l))].join(' ')}));
// arp on chords
await p.click('.edhead .chip:has-text("Arp")');await p.waitForTimeout(200);await p.click('.sheetbody .cta');await p.click('.sheetbody .opt:has-text("Auf & ab")');await p.click('.sheetbody .opt:has-text("1/8")');await p.click('.sheetbody .opt:text-is("2")');
await p.screenshot({path:'tests/app/v3_arp.png'});await p.click('.sheethead [data-close]');
console.log('arp events',await p.evaluate(()=>{const L=__lk,sc=L.P.scenes.A,out=[];for(let i=16;i<32;i++)for(const e of L.eventsForStep(L.P,sc,i,0,.1,0,x=>x==='chords'))out.push(i+':'+e.midi);return out.join(' ')}));
await p.screenshot({path:'tests/app/v3_chords.png'});
await p.click('#play');await p.waitForTimeout(9000);
console.log('frozen',await p.evaluate(()=>Object.fromEntries(Object.entries(__lk.FZ).map(([k,f])=>[k,f?(f.src?'play':'buf'):'-']))));await p.click('#play');
const r=await p.evaluate(async()=>{const L=__lk;const res=await L.exportAudio({P:L.P,segs:L.arrangement('scene1'),inst:L.inst,TRACKS:L.TRACKS,eventsForStep:L.eventsForStep,fade:true});return {dur:res.mix.duration,peak:res.peakDb,ev:Object.fromEntries(Object.entries(res.events).map(([k,v])=>[k,v.length]))}});
console.log('export',JSON.stringify(r));
const ov=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));console.log('overflow',JSON.stringify(ov));
console.log('errors',errs.filter(e=>!e.includes('TUNNEL')).length?errs:'none');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
