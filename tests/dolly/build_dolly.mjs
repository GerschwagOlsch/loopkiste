// Builds public/engines/dolly.js = dolly.wrapper.js with every //@@SLICE a-b@@
// marker replaced by the exact source lines a..b of dollydrumz.html (CRLF → LF).
// usage: node tests/dolly/build_dolly.mjs [path/to/dollydrumz.html]
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const SRC=process.argv[2]||resolve(root,'../nwb/NocturneWB/workbench/dollydrumz/dollydrumz.html');
const src=readFileSync(SRC,'utf8').split(/\r?\n/);
const wrapper=readFileSync(resolve(here,'dolly.wrapper.js'),'utf8');
let n=0;
const outText=wrapper.replace(/^[ \t]*\/\/@@SLICE (\d+)(?:-(\d+))?@@[ \t]*$/gm,(_,a,b)=>{
  a=+a;b=b?+b:a;n++;
  return src.slice(a-1,b).join('\n');
});
writeFileSync(resolve(root,'public/engines/dolly.js'),outText);
console.log('dolly.js written,',n,'verbatim slices,',outText.length,'bytes');
