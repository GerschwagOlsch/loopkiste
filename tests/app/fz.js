const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const log=[];p.on('console',m=>log.push(m.type()+': '+m.text()));p.on('pageerror',e=>log.push('ERR '+e.message));
await p.addInitScript(()=>localStorage.clear());await p.goto('http://localhost:8791/');await p.waitForTimeout(500);
await p.click('#bootBtn');await p.waitForTimeout(3000);const t0=Date.now();await p.click('#play');
for(let i=0;i<10;i++){await p.waitForTimeout(2000);console.log(((Date.now()-t0)/1000).toFixed(0)+'s',JSON.stringify(await p.evaluate(()=>Object.fromEntries(Object.entries(__lk.FZ).map(([k,f])=>[k,f?(f.src?'play':'buf'):'-'])))))}
console.log(log.filter(l=>!l.includes('TUNNEL')).join('\n'));await b.close()})();
