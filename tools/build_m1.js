// Builds public/engines/m1.js + m1_pcm.bin from the NWB M1 slot (m1.html, "Factory Program Player v12").
// The M1 engine script is taken VERBATIM, line ranges only:
//   data  = script lines 3..8 (SAMPLE_RATE, SOUNDS, DRUM_SOUNDS, DRUM_KITS, FACTORY_PROGRAMS, FX_NAMES)
//   PCM   = line 9 (PCM_B64) → decoded byte-identically into m1_pcm.bin (Int16, same bytes atob() yields)
//   core  = lines 10..1602 minus 1277/1278 (window key listeners) — wrapped in a factory so every
//           instance (live, each offline render) gets its own state, exactly like a fresh page.
//   UI bindings (1603..) are not taken.
const fs=require('fs');
const [SRC,OUTDIR]=process.argv.slice(2);
const s=fs.readFileSync(SRC,'utf8');const i=s.indexOf('<script>'),j=s.indexOf('</script>',i);
const L=s.slice(i+8,j).split('\n');
const expect=(n,start)=>{if(!L[n].startsWith(start))throw Error('line '+n+' changed: '+L[n].slice(0,60))};
expect(3,'const SAMPLE_RATE');expect(8,'const FX_NAMES');expect(9,'const PCM_B64');expect(11,'const params');
expect(1277,'window.addEventListener("keydown"');expect(1278,'window.addEventListener("keyup"');
const data=L.slice(3,9).join('\n');
const b64=L[9].slice(L[9].indexOf('"')+1,L[9].lastIndexOf('"'));
fs.writeFileSync(OUTDIR+'/m1_pcm.bin',Buffer.from(b64,'base64'));
const core=L.slice(10,1603).filter((_,k)=>k+10!==1277&&k+10!==1278).join('\n');
const wrap=fs.readFileSync(__dirname+'/m1_wrapper.js','utf8');
const out=wrap.replace('/*@@DATA@@*/',()=>data).replace('/*@@CORE@@*/',()=>'const PCM_B64=null; // PCM is injected from m1_pcm.bin\n'+core);
fs.writeFileSync(OUTDIR+'/m1.js',out);
console.log('m1.js',out.length,'bytes; pcm',Buffer.from(b64,'base64').length,'bytes');
