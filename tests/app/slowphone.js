const {chromium}=require('playwright');const F=+process.argv[2]||10;
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const log=[];p.on('console',m=>{if(!m.text().includes('TUNNEL'))log.push(m.text())});p.on('pageerror',e=>log.push('ERR '+e.message));
await p.addInitScript(()=>localStorage.clear());await p.goto('http://localhost:8791/');await p.waitForTimeout(500);await p.click('#bootBtn');await p.waitForTimeout(3000);
await p.click('#menuBtn');await p.click('.opt:has-text("Demo laden")');await p.waitForTimeout(300);
// simulate a phone F times slower at rendering
await p.evaluate(F=>{for(const id in __lk.inst){const e=__lk.inst[id].eng;if(!e||e.__slow)continue;const r=e.renderStem.bind(e);e.__slow=1;
  const on=e.noteOn.bind(e);window.__non=window.__non||{};e.noteOn=(...a)=>{__non[id]=(__non[id]||0)+1;return on(...a)};e.renderStem=async(o={})=>{const t0=performance.now();const op=o.onProgress;const buf=await r({...o,onProgress:op?(t,ms)=>op(t,ms*F):undefined});await new Promise((res,rej)=>{const tm=setTimeout(res,(performance.now()-t0)*(F-1));o.signal&&o.signal.addEventListener('abort',()=>{clearTimeout(tm);rej(new DOMException('a','AbortError'))})});return buf}}},F);
await p.click('#play');
const st=()=>p.evaluate(async()=>{const o={};for(const t of __lk.TRACKS){const s=__lk.SL[t.id],f=__lk.FZ[t.id];o[t.id]=(s?(s.asleep?'zz':'on'):'?')+'/'+(f?(f.stale?'STALE':f.src?'buf':'idle'):'LIVE')}
  let pk=0;const an=__lk.meter.bass,bb=new Float32Array(an.fftSize);for(let k=0;k<45;k++){an.getFloatTimeDomainData(bb);for(const v of bb)pk=Math.max(pk,Math.abs(v));await new Promise(r=>setTimeout(r,20))}
  const f=__lk.FZ.bass;o.non=(window.__non||{}).bass;o.patchVM=__lk.P.tracks.bass.patch&&__lk.P.tracks.bass.patch.voice_mode;o.vol=__lk.P.tracks.bass.vol;const dbg=f?('src='+!!f.src+' from='+(f.from||0).toFixed(1)+' until='+(f.until||0).toFixed(1)+' now='+__lk.ac.currentTime.toFixed(1)):'';return JSON.stringify(o)+' '+dbg+' bassPk='+pk.toFixed(3)+' '+document.querySelector('.track:nth-child(2) .te').textContent});
for(let i=0;i<4;i++){await p.waitForTimeout(1500);console.log('t',i,await st())}
await p.click('.track:nth-child(2)');await p.waitForTimeout(300);await p.click('.track:nth-child(2)');await p.waitForTimeout(800);await p.click('#sheet .opt:text-is("Bass")');await p.waitForTimeout(300);
const names=await p.locator('#sheet .plist button').allTextContents();
let window_n=0;const pick=['Brumbibrumm','PrettyGrowly','DARK BASS ST 06','Young Turks'].filter(n=>names.includes(n));pick.push(names.find(n=>!pick.includes(n)&&n!==names[0]));
for(const n of pick){await p.locator('#sheet .plist button',{hasText:n}).first().click();console.log('click',n,await st());await p.waitForTimeout(400)}
for(let i=0;i<30;i++){await p.waitForTimeout(10);const s=await st();console.log('after',i,s);if(i>3&&s.includes('"bass":"zz/buf"')&&++window_n>6)break}
console.log(log.filter(l=>/freeze|ERR|rror/.test(l)).join('\n'));await b.close()})();
