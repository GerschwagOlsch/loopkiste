// Checks that every slice named in dolly.wrapper.js appears byte-exact in
// public/engines/dolly.js, and that the whole DSP block (TR909_CORE_SOURCE +
// WORKLET_909_SOURCE) is identical to the source.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const SRC=process.argv[2]||resolve(root,'../nwb/NocturneWB/workbench/dollydrumz/dollydrumz.html');
const srcRaw=readFileSync(SRC,'utf8');
const src=srcRaw.split(/\r?\n/);
const eng=readFileSync(resolve(root,'public/engines/dolly.js'),'utf8');
const wrapper=readFileSync(resolve(here,'dolly.wrapper.js'),'utf8');
let ok=0,bad=0;
for(const m of wrapper.matchAll(/\/\/@@SLICE (\d+)(?:-(\d+))?@@/g)){
  const a=+m[1],b=m[2]?+m[2]:a;
  const text=src.slice(a-1,b).join('\n');
  if(eng.includes(text)){ok++;}else{bad++;console.log('MISSING slice',a,b);}
}
// DSP block by marker, independent of line numbers
const lf=srcRaw.replace(/\r\n/g,'\n');
const END="registerProcessor('tr909-outstage', TR909OutStageProcessor);\n`;";
const s0=lf.indexOf('const TR909_CORE_SOURCE = `'),s1=lf.indexOf(END);
const dsp=lf.slice(s0,s1+END.length);
const sha=x=>createHash('sha256').update(x).digest('hex').slice(0,16);
const inEng=eng.includes(dsp);
console.log(JSON.stringify({slicesOk:ok,slicesBad:bad,dspBlockBytes:dsp.length,dspSha:sha(dsp),dspVerbatimInEngine:inEng,
  sourceSha:createHash('sha256').update(srcRaw).digest('hex').slice(0,16)}));
process.exit(bad||!inEng?1:0);
