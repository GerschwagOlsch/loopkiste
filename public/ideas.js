// "Idee" helpers: one suggestion per tap, always undoable. Harmony deliberately avoids the
// minor-key leading-tone dominant (V→i) habit: progressions stay modal/diatonic.
import {chordInfo,scaleNotes} from './music.js';
const pick=a=>a[Math.floor(Math.random()*a.length)];
const lane=(L,steps,v=1)=>{const a=new Array(L).fill(0);for(const s of steps)if(s<L)a[s]=v;return a};
const rep=(steps,bars)=>{const o=[];for(let b=0;b<bars;b++)for(const s of steps)o.push(b*16+s);return o};

const GROOVES=[
  {name:'House',bd:[0,4,8,12],cp:[4,12],oh:[2,6,10,14],ch:[0,1,3,4,5,7,8,9,11,12,13,15]},
  {name:'Italo',bd:[0,4,8,12],sd:[4,12],ch:[0,2,4,6,8,10,12,14],oh:[2,6,10,14]},
  {name:'Electro',bd:[0,6,10],sd:[4,12],ch:[0,2,4,6,8,10,12,14],rs:[3,11]},
  {name:'Halftime',bd:[0,7,10],sd:[8],ch:[0,2,3,4,6,8,10,11,12,14],oh:[14]},
  {name:'Disco',bd:[0,4,8,12],sd:[4,12],cp:[4,12],oh:[2,6,10,14],ch:[1,3,5,7,9,11,13,15]},
  {name:'Synthpop',bd:[0,8,10],sd:[4,12],ch:[0,2,4,6,8,10,12,14],lt:[14],mt:[15]},
];
export function ideaDrums(bars){const g=pick(GROOVES),L=bars*16,d={};
  for(const k of ['bd','sd','cp','ch','oh','rs','lt','mt'])if(g[k])d[k]=lane(L,rep(g[k],bars));
  if(d.bd){d.bd[0]=2;if(bars>1)d.bd[16]=2}
  if(bars>1){const last=(bars-1)*16;const fill=pick([[12,13,14,15],[14,15],[10,13,14]]);const k=d.sd?'sd':'cp';d[k]=d[k]||new Array(L).fill(0);fill.forEach((s,i)=>d[k][last+s]=i===fill.length-1?2:1)}
  return d}

const PROGS={
  minor:[[0,5,2,6],[0,3,6,2],[0,6,5,6],[0,4,5,3],[5,6,0,0],[0,2,6,3],[3,4,0,0]],
  dorian:[[0,3,0,3],[0,3,6,0],[0,1,3,0],[0,6,3,3],[0,4,3,0]],
  phrygian:[[0,1,0,1],[0,1,6,0],[0,6,5,1]],
  major:[[0,4,5,3],[5,3,0,4],[0,5,3,4],[0,3,5,4],[3,0,4,5],[0,2,3,3],[0,3,1,4]],
  mixolydian:[[0,6,3,0],[0,3,6,3],[0,6,0,3]],
  lydian:[[0,1,0,1],[0,1,4,0],[0,6,1,0]],
};
export function ideaChords(scale,bars){const fam=PROGS[scale]||(scale==='pentmin'?PROGS.minor:PROGS.major);const p=pick(fam);
  const per=bars>=4?1:bars===2?0.5:0.25; // chords per bar
  const out=[];if(bars===1){p.forEach((d,i)=>out.push([i*4,d]))}else if(bars===2){p.forEach((d,i)=>out.push([i*8,d]))}else{for(let b=0;b<bars;b++)out.push([b*16,p[b%4]])}
  const rhythm=pick(['hold','hold','stab']);if(rhythm==='stab'){const extra=[];for(const [s,d] of out)extra.push([s+6,d]);out.push(...extra.filter(([s])=>s<bars*16))}
  return out.sort((a,b)=>a[0]-b[0])}

function rootAt(P,sc,chordAt,s){const c=chordAt(P,sc,s);if(c&&c.length){const lo=Math.min(...c.map(n=>n.p));return {pc:(lo%12+12)%12,deg:c[0].c}}return {pc:P.key,deg:0}}
export function ideaBass(P,sc,chordAt){const L=sc.bars*16,out=[];const st=P.tracks.bass;const base=12*((st.oct??2)+1);
  const style=pick(['offbeat','octave','drive','sync']);
  for(let s=0;s<L;s++){const r=rootAt(P,sc,chordAt,s);let p=base+((r.pc-base)%12+12)%12;if(p<28)p+=12;
    if(style==='offbeat'&&s%4===2)out.push({s,p,l:1,v:.85});
    if(style==='octave'&&s%2===0)out.push({s,p:p+((s/2)%2?12:0),l:1,v:(s/2)%2?.7:.9});
    if(style==='drive'&&s%2===0)out.push({s,p,l:2,v:s%4===0?.9:.7});
    if(style==='sync'&&[0,3,6,10,12].includes(s%16))out.push({s,p:p+([10].includes(s%16)?7:0),l:s%16===12?4:2,v:.85})}
  return out}
export function ideaLead(P,sc,chordAt,rows){const L=sc.bars*16;const all=scaleNotes(36,100,P.key,P.scale);const lo=Math.min(...rows),hi=Math.max(...rows);const pool=all.filter(m=>m>=lo&&m<=hi+5);
  // one-bar rhythm motif, repeated with a varied ending: A A' A B
  const cells=pick([[0,3,6,8,10],[0,2,4,7,10,12],[0,4,6,10,14],[2,4,8,11,14],[0,3,4,8,12,14]]);
  const out=[];let prev=pool[Math.floor(pool.length/2)];
  for(let b=0;b<Math.max(1,sc.bars);b++){const last=b===sc.bars-1&&sc.bars>1;const cs=last?cells.filter(s=>s<9).concat([12]):b%2?cells.map(s=>s):cells;
    cs.forEach((s0,i)=>{const s=b*16+s0;if(s>=L)return;const ch=chordAt(P,sc,s);const tones=ch?ch.map(n=>((n.p%12)+12)%12):[P.key];
      const strong=s0%4===0;let cand=pool.filter(m=>Math.abs(m-prev)<=7&&(!strong||tones.includes(m%12)));if(!cand.length)cand=pool;
      cand.sort((a,b)=>Math.abs(a-prev)-Math.abs(b-prev));const m=pick(cand.slice(0,Math.min(3,cand.length)));
      const nx=cs[i+1]!=null?cs[i+1]:16;out.push({s,p:m,l:Math.max(1,Math.min(nx-s0,last&&s0===12?4:3)),v:strong?.9:.78});prev=m})}
  return out}
