const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const log=[];p.on('console',m=>{if(m.type()!=='warning'||!m.text().includes('TUNNEL'))log.push(m.type()+': '+m.text())});p.on('pageerror',e=>log.push('ERR '+e.message));
await p.addInitScript(()=>localStorage.clear());await p.goto('http://localhost:8791/');await p.waitForTimeout(500);
await p.click('#bootBtn');await p.waitForTimeout(3000);

await p.click('#menuBtn');await p.click('.opt:has-text("Demo laden")');await p.waitForTimeout(300);
const t0=Date.now();await p.click('#play');
for(let i=0;i<8;i++){await p.waitForTimeout(1000);console.log(((Date.now()-t0)/1000).toFixed(1)+'s playing='+await p.evaluate(()=>__lk.start&&document.body.classList.contains('playing')),JSON.stringify(await p.evaluate(()=>Object.fromEntries(Object.entries(__lk.FZ).map(([k,f])=>[k,f?(f.src?'play':'buf'):'-'])))))}
// edit the chords while playing -> live resume, then re-freeze
await p.click('.track:nth-child(3)');await p.waitForTimeout(200);await p.click('.palette button:nth-child(2)');await p.click('.barblock .cell[data-s="8"]');
for(let i=0;i<6;i++){await p.waitForTimeout(1000);console.log('after edit',JSON.stringify(await p.evaluate(()=>Object.fromEntries(Object.entries(__lk.FZ).map(([k,f])=>[k,f?(f.src?'play':'buf'):'-'])))))}
await p.click('#play');console.log(log.join('\n'));await b.close()})();
