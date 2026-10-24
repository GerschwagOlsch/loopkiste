const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p2=await b.newPage();await p2.goto('http://localhost:8792/loopkiste/public/index.html');await p2.waitForTimeout(500);
const r=await p2.evaluate(async()=>{const m=await import('./engines/sonique.js');const ac=new AudioContext({sampleRate:48000});const e=await m.default(ac,{out:ac.destination});await e.ready;
 const L=await m.__test.getLib();const out=[];
 for(const pr of e.presets()){if(!['PAD','STRINGS','VOICE'].includes(pr.cat))continue;const [bk,ix]=pr.id.split(':');const p=L.banks[bk][+ix];
  const osc=p.oscillators.map(o=>JSON.stringify({oct:o.octave,semi:o.semitone,fine:o.fine,wave:o.wave,lvl:o.level??o.dca?.level})).join(' ');
  // pitch: render note 69 for 1.2 s, autocorrelation on 0.6-1.0 s
  e.loadPreset(pr.id);const buf=await e.renderStem({sampleRate:48000,durationSec:1.2,events:[{t:0,midi:69,vel:.8,dur:1.1}]});const d=buf.getChannelData(0).subarray(28800,48000);
  let best=0,bl=0;for(let lag=40;lag<1000;lag++){let s=0;for(let i=0;i<d.length-lag;i++)s+=d[i]*d[i+lag];if(s>best){best=s;bl=lag}}
  out.push(pr.id+' '+pr.name+' f0≈'+(48000/bl).toFixed(1)+'Hz | '+osc)}
 return out});
console.log(r.join('\n'));await b.close()})();
