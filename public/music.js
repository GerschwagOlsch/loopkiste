// Music theory helpers: scales, diatonic chords with voice leading, names.
export const NOTE=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
export const SCALES={
  minor:{name:'Moll',iv:[0,2,3,5,7,8,10]},
  dorian:{name:'Dorisch',iv:[0,2,3,5,7,9,10]},
  phrygian:{name:'Phrygisch',iv:[0,1,3,5,7,8,10]},
  major:{name:'Dur',iv:[0,2,4,5,7,9,11]},
  mixolydian:{name:'Mixolydisch',iv:[0,2,4,5,7,9,10]},
  lydian:{name:'Lydisch',iv:[0,2,4,6,7,9,11]},
  pentmin:{name:'Pentatonik Moll',iv:[0,3,5,7,10],parent:'minor'},
  pentmaj:{name:'Pentatonik Dur',iv:[0,2,4,7,9],parent:'major'},
};
export const midiName=m=>NOTE[((m%12)+12)%12]+(Math.floor(m/12)-1);
export const keyName=(key,scale)=>NOTE[key]+' '+SCALES[scale].name;
export function inScale(m,key,scale){return SCALES[scale].iv.includes(((m-key)%12+12)%12)}
export function scaleNotes(lo,hi,key,scale){const out=[];for(let m=lo;m<=hi;m++)if(inScale(m,key,scale))out.push(m);return out}
// the 7-note scale used for chords (pentatonics borrow from their parent mode)
function chordScale(scale){const s=SCALES[scale];return s.parent?SCALES[s.parent].iv:s.iv}
const ROMAN=['I','II','III','IV','V','VI','VII'];
export function chordInfo(deg,key,scale,seventh=false){
  const iv=chordScale(scale);const pc=k=>iv[(deg+k)%7]+12*Math.floor((deg+k)/7);
  const tones=[0,2,4].concat(seventh?[6]:[]).map(k=>pc(k)-pc(0));
  const third=tones[1],fifth=tones[2],sev=tones[3];
  let q=third===3?(fifth===6?'dim':'m'):(fifth===8?'aug':'');
  let name=NOTE[(key+iv[deg])%12];
  if(seventh){ if(q==='m')name+='m7'; else if(q==='dim')name+='m7♭5'; else name+=(sev===11?'maj7':'7'); }
  else name+=(q==='dim'?'°':q==='aug'?'+':q);
  const rn=(q==='m'||q==='dim')?ROMAN[deg].toLowerCase():ROMAN[deg];
  return {deg,root:(key+iv[deg])%12,tones,name,roman:rn+(q==='dim'?'°':'')};
}
// voice a chord near `center`, smallest movement from `prev`
export function voiceChord(info,center=60,prev=null){
  const base=center-12+((info.root-(center-12))%12+12)%12; // root at or just above center-12
  const cands=[];
  for(let oct=-1;oct<=1;oct++)for(let inv=0;inv<info.tones.length;inv++){
    const notes=info.tones.map((t,i)=>base+12*oct+t+(i<inv?12:0)).sort((a,b)=>a-b);
    cands.push(notes);
  }
  const score=n=>{const mid=(n[0]+n[n.length-1])/2;let s=Math.abs(mid-center)*0.6;if(prev&&prev.length){const p=[...prev].sort((a,b)=>a-b);for(let i=0;i<n.length;i++)s+=Math.abs(n[i]-(p[Math.min(i,p.length-1)]))}return s};
  cands.sort((a,b)=>score(a)-score(b));return cands[0];
}
export function fmtBpm(b){return Math.round(b)+' BPM'}
