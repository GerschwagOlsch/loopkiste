const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const log=[];p.on('console',m=>{if(!m.text().includes('TUNNEL'))log.push(m.text())});p.on('pageerror',e=>log.push('ERR '+e.message));
await p.addInitScript(()=>localStorage.clear());await p.goto('http://localhost:8791/');await p.waitForTimeout(500);await p.click('#bootBtn');await p.waitForTimeout(3000);
await p.click('#menuBtn');await p.click('.opt:has-text("Demo laden")');await p.waitForTimeout(300);await p.click('#play');await p.waitForTimeout(5000);
const st=()=>p.evaluate(()=>{const o={};for(const t of __lk.TRACKS){const s=__lk.SL[t.id],f=__lk.FZ[t.id];o[t.id]=(s?(s.asleep?'zz':s.fading?'fade':'on'):'?')+'/'+(f?(f.stale?'STALE':f.src?'buf':'idle'):'LIVE')}return JSON.stringify(o)});
await p.click('.track:nth-child(2)');await p.waitForTimeout(300);await p.click('.track:nth-child(2)');await p.waitForTimeout(800);await p.click('#sheet .opt:text-is("Strings")');await p.waitForTimeout(300);
await p.locator('#sheet .plist button',{hasText:'Italo Strings - Adria01'}).first().click();
for(let i=0;i<20;i++){await p.waitForTimeout(1000);const s=await st();console.log('play',i,s);if(s.includes('"bass":"zz/buf"')&&i>2)break}
await p.click('[data-close]').catch(()=>{});await p.evaluate(()=>{document.querySelector('#sheet').hidden=true});
await p.click('#play');await p.waitForTimeout(500);console.log('stopped',await st());
// preview the bass sound while stopped
await p.evaluate(()=>__lk.inst.bass.eng.noteOn(48,.8,__lk.ac.currentTime+.01));await p.waitForTimeout(600);await p.evaluate(()=>__lk.inst.bass.eng.noteOff(48,__lk.ac.currentTime+.01));
for(let i=0;i<40;i++){await p.waitForTimeout(500);const s=await st();const r=await p.evaluate(()=>{const x=__lk.SL.bass;return (20*Math.log10(x.rms)).toFixed(1)+' q'+x.quiet});console.log('preview',i*0.5,s.match(/"bass":"[^"]*"/)[0],r);if(s.includes('"bass":"zz'))break}
console.log(log.filter(l=>/freeze|ERR|rror/.test(l)).join('\n'));await b.close()})();
