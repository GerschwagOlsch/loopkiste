const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p2=await b.newPage();await p2.goto('http://localhost:8792/loopkiste/public/index.html');await p2.waitForTimeout(500);
const r=await p2.evaluate(async()=>{const m=await import('./engines/dolly.js');const ac=new AudioContext();const e=await m.default(ac,{out:ac.destination});await e.ready;return {lanes:e.lanes(),presets:e.presets(),macros:e.macros()}});
console.log(JSON.stringify(r,null,1));await b.close()})();
