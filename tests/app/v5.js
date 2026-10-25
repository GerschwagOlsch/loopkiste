const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('TUNNEL'))errs.push(m.text())});
await p.addInitScript(()=>{if(!sessionStorage.getItem('t')){localStorage.clear();sessionStorage.setItem('t','1')}});
await p.goto('http://localhost:8791/');await p.waitForTimeout(500);await p.click('#bootBtn');await p.waitForTimeout(3500);
await p.click('#menuBtn');await p.click('.opt:has-text("Demo laden")');await p.waitForTimeout(1500);
// rename lead
await p.evaluate(()=>{document.querySelectorAll('.track')[3].click()});await p.evaluate(()=>{document.querySelectorAll('.track')[3].click()});await p.waitForTimeout(300);
await p.fill('#tname_lead','Melodie');await p.press('#tname_lead','Enter');await p.waitForTimeout(200);
console.log('name',await p.evaluate(()=>__lk.TRACKS[3].name+' / '+document.querySelectorAll('.track .tn')[3].textContent));await p.click('.sheethead [data-close]');
// per-track scene: bass -> B (new), others stay A; B gets 1 bar
await p.evaluate(()=>{const t=document.querySelectorAll('.track')[1];if(!t.classList.contains('sel'))t.click()});await p.waitForTimeout(200);
await p.click('.seg.clips button:has-text("B")');await p.waitForTimeout(200);
console.log('scenes',await p.evaluate(()=>__lk.TRACKS.map(t=>t.id+':'+__lk.P.tracks[t.id].scene).join(' ')+' | B bars '+__lk.P.scenes.B.bars));
await p.click('#barsMinus');await p.waitForTimeout(200);
await p.click('.chip.len:has-text("1/4")');const cells=await p.$$('.cell[data-s="0"][data-p]');await cells[7].click();await p.waitForTimeout(100);
console.log('B',await p.evaluate(()=>JSON.stringify({bars:__lk.P.scenes.B.bars,bass:__lk.P.scenes.B.bass,Abars:__lk.P.scenes.A.bars})));
await p.screenshot({path:'tests/app/v5_clips.png',clip:{x:0,y:0,width:390,height:420}});
// play: polymeter (A=2 bars drums, B=1 bar bass)
await p.click('#play');await p.waitForTimeout(7000);
console.log('frozen',await p.evaluate(()=>Object.fromEntries(Object.entries(__lk.FZ).map(([k,f])=>[k,f?(f.src?'play':'buf'):'-']))));
// launch scene A for all at next bar
await p.evaluate(()=>__lk.chooseScene('A'));await p.waitForTimeout(2500);console.log('after launch',await p.evaluate(()=>__lk.TRACKS.map(t=>__lk.P.tracks[t.id].scene).join('')));
// mixer
await p.click('#mixBtn');await p.waitForTimeout(600);await p.screenshot({path:'tests/app/v5_mixer.png'});
console.log('fader',await p.evaluate(()=>{const f=document.getElementById('mix_chords');const o=f.parentElement.parentElement.querySelector('output');return f.value+' '+o.textContent}));
await p.evaluate(()=>{const f=document.getElementById('mix_chords');f.value=1000;f.dispatchEvent(new Event('input'))});console.log('max vol',await p.evaluate(()=>__lk.P.tracks.chords.vol.toFixed(3)));
await p.evaluate(()=>{const f=document.getElementById('mix_chords');f.value=833;f.dispatchEvent(new Event('input'))});console.log('0dB vol',await p.evaluate(()=>__lk.P.tracks.chords.vol.toFixed(3)));
await p.click('.sheethead [data-close]');await p.click('#play');
// export with stems
await p.click('#menuBtn');await p.waitForTimeout(200);await p.click('.cta.alt:has-text("Spuren")');
await p.waitForFunction(()=>document.querySelector('#sheetBody .progress i').style.width==='100%',{timeout:120000});await p.waitForTimeout(300);
console.log('export',await p.evaluate(()=>[...document.querySelectorAll('#sheetBody .note')].map(n=>n.textContent).find(t=>t.startsWith('Fertig'))));
const href=await p.$eval('#sheetBody a[download]',a=>a.href);const name=await p.$eval('#sheetBody a[download]',a=>a.download);
const data=await p.evaluate(async u=>{const r=await fetch(u);const b=await r.arrayBuffer();return Array.from(new Uint8Array(b))},href);fs.writeFileSync('/tmp/lp.zip',Buffer.from(data));console.log('zip',name,data.length);
console.log('errors',errs.length?errs:'none');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
