const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const log=[];p.on('console',m=>{if(!m.text().includes('TUNNEL'))log.push(m.type()+': '+m.text())});p.on('pageerror',e=>log.push('ERR '+e.message));
await p.addInitScript(()=>localStorage.clear());await p.goto('http://localhost:8791/');await p.waitForTimeout(500);
await p.click('#bootBtn');await p.waitForTimeout(3000);
const st=()=>p.evaluate(()=>{const o={};for(const t of __lk.TRACKS){const s=__lk.SL[t.id];const f=__lk.FZ[t.id];o[t.id]=(s?(s.asleep?'zz':'on'):'?')+'/'+(f?(f.src?'buf▶':'buf'):'live')+'/'+__lk.P.tracks[t.id].engine}return JSON.stringify(o)});
console.log('idle stopped',await st());await p.waitForTimeout(1500);console.log('idle +1.5s',await st());
await p.click('#menuBtn');await p.click('.opt:has-text("Demo laden")');await p.waitForTimeout(300);
await p.click('#play');
for(let i=0;i<10;i++){await p.waitForTimeout(1000);console.log('play '+i,await st())}
await p.click('.track:nth-child(3)');await p.waitForTimeout(200);await p.click('.palette button:nth-child(2)');await p.click('.barblock .cell[data-s="8"]');
for(let i=0;i<10;i++){await p.waitForTimeout(700);console.log('edit '+i,await st(),await p.evaluate(async()=>{let pk=0;const an=__lk.meter.chords,b=new Float32Array(an.fftSize);for(let k=0;k<6;k++){an.getFloatTimeDomainData(b);for(const v of b)pk=Math.max(pk,Math.abs(v));await new Promise(r=>setTimeout(r,20))}return 'chordsPeak='+pk.toFixed(4)}))}
await p.click('#play');await p.waitForTimeout(2000);console.log('stopped',await st());
console.log(log.filter(l=>!l.startsWith('info')).join('\n'));await b.close()})();
