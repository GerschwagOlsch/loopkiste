const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p2=await b.newPage();await p2.goto('http://localhost:8792/loopkiste/public/index.html');await p2.waitForTimeout(500);
const r=await p2.evaluate(async()=>{const m=await import('./engines/sonique.js');const L=await m.__test.getLib();const p=L.banks.italo[6];return JSON.stringify(p,null,0)});
console.log(r);await b.close()})();
