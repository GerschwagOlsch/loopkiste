// Loopette — mobile loop studio for the Nocturne instruments (DollyDrumz, PuSS-30, Sonique 4x20, Pierrette 101).
import {NOTE,SCALES,midiName,keyName,inScale,scaleNotes,chordInfo,voiceChord} from './music.js';
import {exportAudio,encodeWav,encodeMp3,encodeFlac,makeZip,loudness} from './export.js';
import {ideaDrums,ideaBass,ideaChords,ideaLead} from './ideas.js';

const $=s=>document.querySelector(s);
const h=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs||{})){if(v==null||v===false)continue;if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(k==='html')e.innerHTML=v;else e.setAttribute(k,v===true?'':v)}for(const c of kids.flat()){if(c==null||c===false)continue;e.append(c.nodeType?c:document.createTextNode(String(c)))}return e};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const deep=o=>JSON.parse(JSON.stringify(o));
const dbStr=g=>g<=0.0001?'−∞':(20*Math.log10(g)>=0?'+':'')+(20*Math.log10(g)).toFixed(1)+' dB';

/* ───────────── instruments & tracks ───────────── */
export const ENGINES={
  dolly:{name:'DollyDrumz',short:'Dolly',img:'img/dolly.webp',kind:'drums',load:()=>import('./engines/dolly.js')},
  puss:{name:'PuSS-30',short:'PuSS-30',img:'img/puss.webp',kind:'synth',load:()=>import('./engines/puss.js')},
  sonique:{name:'Sonique 4x20',short:'Sonique',img:'img/sonique.webp',kind:'synth',load:()=>import('./engines/sonique.js')},
  pierrette:{name:'Pierrette 101',short:'Pierrette',img:'img/pierrette.webp',kind:'synth',load:()=>import('./engines/pierrette.js')},
  m1:{name:'M1 PCM',short:'M1',img:'img/m1.svg',kind:'synth',load:()=>import('./engines/m1.js')},
};
/* Track types. A project holds any number of tracks (P.order); each track has a type. */
export const TYPES={
  drums:{name:'Drums',color:'var(--drums)',choices:['dolly'],role:'drums'},
  bass:{name:'Bass',color:'var(--bass)',choices:['pierrette','puss','sonique','m1'],role:'mono',range:[24,60],oct:2},
  chords:{name:'Akkorde',color:'var(--chords)',choices:['sonique','puss','pierrette','m1'],role:'chords',range:[40,84],oct:4},
  lead:{name:'Lead',color:'var(--lead)',choices:['puss','sonique','pierrette','m1'],role:'mono',range:[48,96],oct:4},
};
const EXTRA_COLORS=['#9d7bff','#5ec8ff','#b6e36b','#ffb86b','#ff8fd6','#7bf0d0'];
export let TRACKS=[];let TR={};
function rebuildTracks(){const seen={};TRACKS=(P.order||Object.keys(P.tracks)).filter(id=>P.tracks[id]).map((id,i)=>{const t=P.tracks[id],ty=TYPES[t.type||id]||TYPES.lead;const n=(seen[ty.name]=(seen[ty.name]||0)+1);
    return {id,...ty,type:t.type||id,name:t.name||(n>1?ty.name+' '+n:ty.name),color:n>1?EXTRA_COLORS[(i+n)%EXTRA_COLORS.length]:ty.color}});TR=Object.fromEntries(TRACKS.map(t=>[t.id,t]))}
const typeOf=id=>TR[id]?TR[id].type:(P.tracks[id]&&P.tracks[id].type)||id;
const chordTracks=()=>TRACKS.filter(t=>t.role==='chords').map(t=>t.id);
const mainChords=()=>chordTracks()[0]||null;
const LANE_ORDER=['bd','sd','cp','ch','oh','rs','lt','mt','ht','crash','ride'];
const LANE_DE={bd:'Kick',sd:'Snare',cp:'Clap',ch:'Hi-Hat',oh:'Open Hat',rs:'Rim',lt:'Tom L',mt:'Tom M',ht:'Tom H',crash:'Crash',ride:'Ride'};
const CARD_LABEL={'909':'909','sds-v':'SDS-V','sds7':'SDS7'};
const SCENE_IDS=['A','B','C','D'];
const MAX_BARS=8;
const PRESET_PREFS={bass:{pierrette:['ITALO BASS ROUND','ITALO BASS SAW','Moroder Pulse','#BASS'],puss:['DEEP 30 BASS','#BASS'],sonique:['TUBEBAS','#BASS'],m1:['SynthBass1','#Bass']},
  chords:{sonique:['VOXPAD','PIANO1','#PAD','#STRINGS','#KEYS'],puss:['TRIPLE BBD STRINGS','#STRINGS'],pierrette:['Italo Strings','#Pad'],m1:["Piano 16'",'#Piano & Orgel']},
  lead:{puss:['BRASS BUS 87','#REED','#BRASS'],sonique:['SUPERLEAD','#LEAD'],pierrette:['Italo Runner','Sunset Hero','#Lead'],m1:['Solo Synth','#Synth']},drums:{dolly:[]}};
// automix target balance in LU relative to the drums (dance/pop convention: kick+bass carry, chords sit behind, lead on top of chords)
const MIX_TARGET={drums:0,bass:-1.5,chords:-5,lead:-3.5};
const SLOT_RE=/^(.+)@(.+)$/;const slotLane=k=>{const m=SLOT_RE.exec(k);return m?m[1]:k};const slotCard=k=>{const m=SLOT_RE.exec(k);return m?m[2]:'909'};

/* ───────────── project state ───────────── */
function newScene(bars=1,ids=null){const sc={bars};for(const id of ids||P.order)sc[id]=(P.tracks[id]&&P.tracks[id].type||id)==='drums'?{}:[];return sc}
const ARP0={on:false,mode:'up',rate:1,oct:1,gate:.8};
function newTrack(type,engine){const b={type,engine,vol:.8,mute:false,solo:false,preset:null,patch:null,scene:'A'};
  if(type==='drums')return {...b,vol:.9,lanes:[]};
  if(type==='chords')return {...b,vol:.62,view:'step',oct:4,hold:true,seventh:false,voicing:'lead',bassOct:false,len:4,arp:{...ARP0}};
  return {...b,vol:type==='bass'?.8:.7,view:'step',oct:type==='bass'?2:4,len:1,arp:{...ARP0}}}
function baseTracks(){return {drums:newTrack('drums','dolly'),bass:newTrack('bass','pierrette'),chords:newTrack('chords','sonique'),lead:newTrack('lead','puss')}}
function emptyProject(){const ids=['drums','bass','chords','lead'];return {v:4,name:'Neuer Loop',bpm:120,swing:0,key:2,scale:'dorian',launch:'bar',song:{on:false,list:[{s:'A',n:2}]},order:ids,tracks:baseTracks(),scenes:{A:{bars:1,drums:{},bass:[],chords:[],lead:[]},B:null,C:null,D:null}}}
function demoProject(){
  const P={...emptyProject(),name:'Demo',bpm:112,swing:0.1};P.tracks.chords.seventh=true;P.tracks.drums.lanes=['bd@909','cp@909','ch@909','oh@909'];P.scenes.A.bars=2;
  const A=P.scenes.A,L=32,lane=(steps,v=1)=>{const a=new Array(L).fill(0);steps.forEach(s=>a[s]=v);return a};
  A.drums={'bd@909':lane([0,4,8,12,16,20,24,28]),'cp@909':lane([4,12,20,28]),'ch@909':lane([1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31]),'oh@909':lane([2,6,10,14,18,22,26,30])};
  A.drums['bd@909'][0]=2;A.drums['bd@909'][16]=2;
  A.bass=[2,6,10,14].map(s=>({s,p:38,l:1,v:.85})).concat([18,22,26,30].map(s=>({s,p:43,l:1,v:.85})));A.bass.push({s:15,p:50,l:1,v:.7});
  placeChord(P,A,0,0);placeChord(P,A,6,0);placeChord(P,A,16,3);placeChord(P,A,22,3);recalcHold(P,A);
  const mel=[[0,69,2],[3,72,1],[4,74,3],[8,72,1],[10,69,2],[14,67,2],[16,71,2],[19,74,1],[20,76,3],[24,74,1],[26,71,2],[30,69,2]];
  A.lead=mel.map(([s,p,l])=>({s,p,l,v:.85}));
  return P;
}
function migrate(P){if(!P)return P;
  if(!P.order)P.order=Object.keys(P.tracks);if(!P.launch)P.launch='bar';for(const t of Object.values(P.tracks))if(!t.scene)t.scene=P.cur||'A';
  for(const [id,t] of Object.entries(P.tracks)){if(!t.type)t.type=TYPES[id]?id:'lead';if(t.solo==null)t.solo=false;
    if(t.type!=='drums'){if(!t.arp)t.arp={...ARP0};if(t.len==null)t.len=t.type==='chords'?4:1}
    if(t.type==='chords'&&!t.voicing)t.voicing='lead';
    if(t.type==='drums'){if(!Array.isArray(t.lanes)){const used=new Set();for(const sc of Object.values(P.scenes))if(sc)for(const [k,a] of Object.entries(sc[id]||{}))if(a.some(v=>v))used.add(k);t.lanes=LANE_ORDER.filter(k=>used.has(k))}
      // v4: drum lanes are "<lane>@<machine>" so several machines can share a drum type
      t.lanes=t.lanes.map(k=>SLOT_RE.test(k)?k:k+'@909');
      for(const sc of Object.values(P.scenes))if(sc&&sc[id])for(const k of Object.keys(sc[id]))if(!SLOT_RE.test(k)){sc[id][k+'@909']=sc[id][k];delete sc[id][k]}}}
  for(const sc of Object.values(P.scenes))if(sc)for(const id of P.order)if(sc[id]==null)sc[id]=P.tracks[id].type==='drums'?{}:[];
  P.v=4;return P}
// Start empty. The old built-in demo (v<3, name "Erster Loop") is kept as a saved project instead of being the start screen.
function boot(){const st=load('loopkiste.current');if(!st)return emptyProject();
  if((st.v||0)<3&&st.name==='Erster Loop'){const pr=load('loopkiste.projects')||{};pr['Erster Loop (alt)']=st;try{localStorage.setItem('loopkiste.projects',JSON.stringify(pr))}catch(_e){}return emptyProject()}
  return migrate(st)}
let P=boot();rebuildTracks();
let sel='drums',undoStack=[];
function load(k){try{const t=localStorage.getItem(k);return t?JSON.parse(t):null}catch(_e){return null}}
function persist(){clearTimeout(persist.t);persist.t=setTimeout(()=>{try{localStorage.setItem('loopkiste.current',JSON.stringify(P))}catch(_e){}},400);freezeSoon()}
function snapshot(){undoStack.push(JSON.stringify(P));if(undoStack.length>60)undoStack.shift()}
function undo(){const s=undoStack.pop();if(!s)return toast('Nichts rückgängig zu machen');const old=P;P=JSON.parse(s);rebuildTracks();if(!TR[sel])sel=TRACKS[0].id;for(const t of TRACKS){ensureTrackNodes(t.id);if(!old.tracks[t.id]||old.tracks[t.id].engine!==P.tracks[t.id].engine)ensureEngine(t.id);applyTrackGain(t.id)}for(const id of Object.keys(old.tracks))if(!P.tracks[id])dropTrackRuntime(id);syncPatches();persist();renderAll()}
function scOf(id){const t=P.tracks[id];if(!P.scenes[t.scene||'A'])t.scene=Object.keys(P.scenes).find(k=>P.scenes[k])||'A';return P.scenes[t.scene]}
function scene(){return scOf(sel)}
function sceneLen(sc){return (sc||scene()).bars*16}

/* ───────────── chords & voicings ───────────── */
function chordAt(P,sc,step,tid=mainChords()){if(tid&&P.tracks[tid]&&P.scenes[P.tracks[tid].scene])sc=P.scenes[P.tracks[tid].scene];const cs=(tid&&sc[tid]||[]).filter(n=>n.c!=null&&n.s<=step%(sc.bars*16));if(!cs.length)return null;const s=Math.max(...cs.map(n=>n.s));return cs.filter(n=>n.s===s)}
export function chordNotes(P,deg,inv=0,prev=null,tid='chords'){
  const t=P.tracks[tid],info=chordInfo(deg,P.key,P.scale,!!t.seventh),center=12*((t.oct??4)+1);let notes;
  const mode=t.voicing||'lead';
  if(mode==='root'){const r=center-6+((info.root-(center-6))%12+12)%12;notes=info.tones.map(x=>r+x)}           // Grundstellung: folgt dem Grundton auf und ab
  else{notes=voiceChord(info,center,mode==='lead'?prev:null);if(mode==='wide'&&notes.length>=3){notes=[...notes].sort((a,b)=>a-b);notes[notes.length-2]-=12}} // weit = Drop-2
  notes=[...notes].sort((a,b)=>a-b);
  for(let k=0;k<inv;k++)notes.push(notes.shift()+12);for(let k=0;k<-inv;k++)notes.unshift(notes.pop()-12);
  notes.sort((a,b)=>a-b);
  if(t.bassOct){const lo=notes[0];const root=lo-((lo-info.root)%12+12)%12;notes.unshift(root-12)}
  return notes;
}
export function placeChord(P,sc,step,deg,inv=0,tid='chords'){
  sc[tid]=sc[tid].filter(n=>n.s!==step);
  const prevStep=Math.max(-1,...sc[tid].filter(n=>n.s<step&&n.c!=null).map(n=>n.s));
  const prev=prevStep>=0?sc[tid].filter(n=>n.s===prevStep&&!n.bo).map(n=>n.p):null;
  const bo=!!P.tracks[tid].bassOct;chordNotes(P,deg,inv,prev,tid).forEach((p,i)=>sc[tid].push({s:step,p,l:2,v:.8,c:deg,inv,bo:bo&&i===0?1:undefined}));
}
export function recalcHold(P,sc,tid='chords'){
  if(!P.tracks[tid].hold)return;const starts=[...new Set(sc[tid].map(n=>n.s))].sort((a,b)=>a-b);const L=sceneLen(sc);
  for(const n of sc[tid]){const nx=starts.find(s=>s>n.s);n.l=(nx??L)-n.s}
}
function revoiceChords(sc,tid='chords'){const steps=[...new Set(sc[tid].filter(n=>n.c!=null).map(n=>n.s))].sort((a,b)=>a-b);
  const info=steps.map(s=>{const n=sc[tid].find(x=>x.s===s);return {s,c:n.c,inv:n.inv||0,l:n.l}});
  sc[tid]=sc[tid].filter(n=>n.c==null);info.forEach(i=>{placeChord(P,sc,i.s,i.c,i.inv,tid);sc[tid].filter(n=>n.s===i.s).forEach(n=>n.l=i.l)});recalcHold(P,sc,tid)}

/* ───────────── audio ───────────── */
let ac=null,bus=null,master=null,fxNodes=null;const inst={};const trackGain={};const meter={};const actLamp={};
function initAudio(){
  if(ac)return;
  ac=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'playback'});
  bus=ac.createGain();
  const filt=ac.createBiquadFilter();filt.type='lowpass';filt.frequency.value=20000;filt.Q.value=.7;
  const tape=ac.createDelay(4);tape.delayTime.value=0;const tapeGain=ac.createGain();
  const echoIn=ac.createGain();echoIn.gain.value=0;const echo=ac.createDelay(2);const efb=ac.createGain();efb.gain.value=.5;const elp=ac.createBiquadFilter();elp.type='lowpass';elp.frequency.value=3800;
  bus.connect(filt);bus.connect(echoIn);echoIn.connect(echo);echo.connect(elp);elp.connect(efb);efb.connect(echo);elp.connect(filt);
  filt.connect(tape);tape.connect(tapeGain);
  const comp=ac.createDynamicsCompressor();comp.threshold.value=-12;comp.knee.value=8;comp.ratio.value=3;comp.attack.value=.004;comp.release.value=.16;
  const lim=ac.createDynamicsCompressor();lim.threshold.value=-1.5;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=.001;lim.release.value=.08;
  master=ac.createGain();master.gain.value=.9;tapeGain.connect(comp);comp.connect(lim);lim.connect(master);master.connect(ac.destination);
  const man=ac.createAnalyser();man.fftSize=2048;comp.connect(man);meter.master=man;
  fxNodes={filt,tape,tapeGain,echoIn,echo,efb};
  for(const t of TRACKS)ensureTrackNodes(t.id);
}
function ensureTrackNodes(id){if(!ac||trackGain[id])return;const g=ac.createGain();g.connect(bus);trackGain[id]=g;const an=ac.createAnalyser();an.fftSize=1024;g.connect(an);meter[id]=an;applyTrackGain(id)}
function dropTrackRuntime(id){const r=inst[id];if(r&&r.eng)try{r.eng.dispose()}catch(_e){}delete inst[id];fzDrop(id);if(trackGain[id]){try{trackGain[id].disconnect()}catch(_e){}delete trackGain[id];delete meter[id]}}
const anySolo=()=>TRACKS.some(t=>P.tracks[t.id].solo);
const audible=id=>{const t=P.tracks[id];return !t.mute&&(!anySolo()||t.solo)};
function applyTrackGain(id){const g=trackGain[id];if(!g||!ac)return;g.gain.setTargetAtTime(audible(id)?P.tracks[id].vol:0,ac.currentTime,.015)}
function applyAllGains(){TRACKS.forEach(t=>applyTrackGain(t.id))}
async function ensureEngine(id){
  const t=P.tracks[id];const want=t.engine;const cur=inst[id];
  if(cur&&cur.engine===want)return cur.ready;
  if(cur){try{cur.eng&&cur.eng.dispose()}catch(_e){}}
  const rec={engine:want,eng:null};inst[id]=rec;fzDrop(id);
  rec.ready=(async()=>{try{const mod=await (want==='dolly'?import('./engines/drumrack.js'):ENGINES[want].load());const eng=await mod.default(ac,{out:trackGain[id]});await eng.ready;if(inst[id]!==rec){eng.dispose();return}
    rec.eng=eng;
    if(t.patch){try{eng.setPatch(t.patch)}catch(e){console.warn(e)}}
    else{const pid=pickPreset(eng,id,want);if(pid!=null){eng.loadPreset(pid);t.preset=pid;t.patch=eng.getPatch()}}
    if(t.macros)for(const [k,v] of Object.entries(t.macros))eng.setMacro(k,v);
    renderTracks();if(sel===id)renderEditor();freezeSoon();
  }catch(e){console.error(e);toast(ENGINES[want].name+' konnte nicht geladen werden');}})();
  return rec.ready;
}
function pickPreset(eng,tid,engId){const list=eng.presets();if(!list.length)return null;const prefs=(PRESET_PREFS[typeOf(tid)]||{})[engId]||[];
  for(const p of prefs){if(p.startsWith('#')){const c=p.slice(1).toUpperCase();const hit=list.find(x=>String(x.cat||'').toUpperCase()===c);if(hit)return hit.id}else{const hit=list.find(x=>x.name.toUpperCase().includes(p.toUpperCase()));if(hit)return hit.id}}
  return list[0].id}
function syncPatches(){for(const t of TRACKS){const r=inst[t.id];if(r&&r.eng&&P.tracks[t.id].patch){try{r.eng.setPatch(P.tracks[t.id].patch)}catch(_e){}}}}

/* ───────────── freeze: each track's loop is rendered offline and played back as audio ─────────────
   Live synthesis of four instruments at once overloads a phone's audio thread. As in the Nocturne
   Workbench, a track whose loop is rendered (same engine, same DSP) plays from the buffer; after an
   edit it plays live until the new render is ready. */
const FZ={};const fzCache=new Map();const fzInflight={};let fzTimer=null;const lastEdit={};const liveNotes={};const resumeLive={};
function fzSig(id,sc=scOf(id)){const t=P.tracks[id];return JSON.stringify([t.engine,t.patch,t.macros||null,t.arp&&t.arp.on?t.arp:0,sc[id],sc.bars,Math.round(P.bpm*100),P.swing,ac?ac.sampleRate:0])}
function freezeSoon(){clearTimeout(fzTimer);fzTimer=setTimeout(fzWork,650)}
function fzDrop(id){const f=FZ[id];if(f&&f.src){try{f.src.stop()}catch(_e){}}FZ[id]=null}
const hasNotes=(id,sc)=>typeOf(id)==='drums'?Object.values(sc[id]||{}).some(a=>a.some(v=>v)):(sc[id]||[]).length>0;
// All stale tracks render at the same time (the engines render in Workers / offline contexts, so a phone's cores share the work).
function fzWork(){
  if(!ac)return Promise.resolve();
  const jobs=[];
  for(const t of TRACKS){const id=t.id,r=inst[id];if(!r||!r.eng)continue;const sc=scOf(id),sig=fzSig(id,sc);
    if(FZ[id]&&FZ[id].sig===sig)continue;
    if(FZ[id]&&FZ[id].sig!==sig)fzRelease(id);
    const cached=fzCache.get(sig);if(cached){FZ[id]={sig,buf:cached,src:null,from:0};fzEngage(id);continue}
    if(fzInflight[id]){jobs.push(fzInflight[id]);continue}
    if(Date.now()-(lastEdit[id]||0)<600){freezeSoon();continue}
    const job=(async()=>{try{const t0=performance.now();const buf=await fzRender(id,sc);console.info('freeze '+id+' '+Math.round(performance.now()-t0)+' ms');
        if(fzSig(id)===sig){fzCache.set(sig,buf);if(fzCache.size>24)fzCache.delete(fzCache.keys().next().value);FZ[id]={sig,buf,src:null,from:0};fzEngage(id)}else freezeSoon()}
      catch(e){console.warn('freeze',id,e)}finally{delete fzInflight[id];renderTracks()}})();
    fzInflight[id]=job;jobs.push(job)}
  return Promise.all(jobs);
}
async function fzRender(id,sc){const sd=stepDur(),L=sceneLen(sc),sr=ac.sampleRate,loopSec=L*sd;const ev=[];
  const n=Math.round(loopSec*sr);if(!hasNotes(id,sc))return new AudioBuffer({numberOfChannels:2,length:n,sampleRate:sr});
  for(let rep=0;rep<2;rep++)for(let i=0;i<L;i++)for(const e of eventsForStep(P,()=>sc,i,(rep*L+i)*sd,sd,P.swing,x=>x===id))ev.push(typeOf(id)==='drums'?{t:e.t,lane:e.lane,vel:e.vel}:{t:e.t,midi:e.midi,vel:e.vel,dur:e.dur});
  const stem=await inst[id].eng.renderStem({sampleRate:sr,durationSec:2*loopSec+.05,events:ev});
  // second pass = steady state: tails of the previous pass are already inside, so the loop is seamless
  const out=new AudioBuffer({numberOfChannels:2,length:n,sampleRate:sr});const a=Math.round(loopSec*sr);
  for(let c=0;c<2;c++){const src=stem.getChannelData(Math.min(c,stem.numberOfChannels-1));out.copyToChannel(src.subarray(a,a+n),c)}
  return out}
const trackLen=id=>sceneLen(scOf(id));
function fzEngage(id){const f=FZ[id];if(!f||!playing||f.src||stutter)return;const t=nextT;fzStart(id,t,(stepIdx%trackLen(id))*stepDur());liveSilence(id,t)}
// live notes of a track that would still sound after `t` are released there (the frozen buffer takes over)
function liveSilence(id,t){const r=inst[id],arr=liveNotes[id]||[];if(r&&r.eng)for(const n of arr)if(n.off>t+1e-4){if(typeOf(id)==='drums')continue;r.eng.noteOff(n.midi,t)}liveNotes[id]=[]}
function fzStart(id,t,offset){const f=FZ[id];if(!f)return;const loopSec=trackLen(id)*stepDur();if(offset>=loopSec-1e-6)return;const s=ac.createBufferSource();s.buffer=f.buf;s.connect(trackGain[id]);s.start(t,offset);s.stop(t+loopSec-offset);f.src=s;f.from=t;f.until=t+loopSec-offset;s.onended=()=>{if(f.src===s)f.src=null}}
function fzRelease(id){const f=FZ[id];if(!f)return;if(f.src){try{f.src.stop(playing?nextT:0)}catch(_e){}}f.src=null;FZ[id]=null;f.cut=nextT}
const isFrozenAt=(id,t)=>{const f=FZ[id];return !!(f&&f.src&&t>=f.from-1e-6)};
function markEdit(id){lastEdit[id]=Date.now();const f=FZ[id];if(f){const cut=playing?nextT:0;if(f.src){try{f.src.stop(cut)}catch(_e){}}FZ[id]=null;if(playing)resumeLive[id]=true}}

/* ───────────── sequencer ─────────────
   One step clock for all tracks. Every track plays its own scene (clip) and loops at that scene's length,
   so tracks with 1, 2 and 4 bars run side by side; the global step counter just keeps counting. */
let playing=false,starting=false,timer=null,nextT=0,stepIdx=0,startT=0,queued=null,songIdx=0,songRep=0;
let stutter=null;
const stepDur=()=>60/P.bpm/4;
const visQ=[];
const maxLen=()=>Math.max(16,...TRACKS.map(t=>trackLen(t.id)));
async function start(){initAudio();ac.resume();if(playing||starting)return;
  if(P.song.on&&P.song.list.length&&P.scenes[P.song.list[0].s])for(const t of TRACKS)P.tracks[t.id].scene=P.song.list[0].s;
  // Before the first bar every track should play from its rendered loop: several live synths overload a phone.
  const need=TRACKS.filter(t=>inst[t.id]&&inst[t.id].eng&&hasNotes(t.id,scOf(t.id))&&!(FZ[t.id]&&FZ[t.id].sig===fzSig(t.id)));
  if(need.length){starting=true;document.body.classList.add('starting');toast('Spuren werden vorbereitet …');try{await Promise.race([fzWork(),new Promise(r=>setTimeout(r,8000))])}finally{starting=false;document.body.classList.remove('starting')}}
  if(playing)return;playing=true;document.body.classList.add('playing');
  stepIdx=0;nextT=ac.currentTime+.08;startT=nextT;songIdx=0;songRep=0;renderScenes();
  timer=setInterval(tick,25);tick();requestAnimationFrame(draw);freezeSoon()}
function stop(){playing=false;document.body.classList.remove('playing');clearInterval(timer);for(const t of TRACKS){const r=inst[t.id];r&&r.eng&&r.eng.allOff&&r.eng.allOff();const f=FZ[t.id];if(f&&f.src){try{f.src.stop()}catch(_e){}f.src=null}}visQ.length=0;drawPlayhead(-1)}
function tick(){const ahead=ac.currentTime+.15;while(nextT<ahead){scheduleStep(stepIdx,nextT);advance()}}
function sceneChanged(ids=TRACKS.map(t=>t.id)){for(const id of ids){const f=FZ[id];if(f&&f.src){try{f.src.stop(nextT)}catch(_e){}}FZ[id]=null;if(playing)resumeLive[id]=true}freezeSoon();fzWork()}
function advance(){nextT+=stepDur();stepIdx++;
  if(queued){const L=P.launch==='loop'?Math.max(16,...queued.ids.map(id=>trackLen(id))):16;if(stepIdx%L===0){switchScene(queued.s,queued.ids);return}}
  if(P.song.on&&P.song.list.length&&stepIdx%maxLen()===0){songRep++;const it=P.song.list[songIdx%P.song.list.length];if(songRep>=it.n){songRep=0;songIdx=(songIdx+1)%P.song.list.length;const nx=P.song.list[songIdx].s;if(P.scenes[nx])switchScene(nx,TRACKS.map(t=>t.id))}}}
/* Arpeggiator: a pure function of the step, so live play, freeze and export produce the same notes.
   The held notes at a step form the chord; the pattern restarts whenever a new note/chord begins. */
export const ARP_MODES=[['up','Auf'],['down','Ab'],['updown','Auf & ab'],['order','Gespielt'],['random','Zufall']];
export function arpStep(P,sc,id,s,sd){const a=P.tracks[id].arp,rate=a.rate||1;
  const held=(sc[id]||[]).filter(n=>n.s<=s&&s<n.s+n.l);if(!held.length)return [];
  const g0=Math.max(...held.map(n=>n.s));if((s-g0)%rate)return [];const k=(s-g0)/rate;
  let base=a.mode==='order'?[...held].sort((x,y)=>x.s-y.s||x.p-y.p).map(n=>n.p):[...held].map(n=>n.p).sort((x,y)=>x-y);base=[...new Set(base)];
  let seq=[];for(let o=0;o<(a.oct||1);o++)for(const p of base)seq.push(p+12*o);
  if(a.mode==='down')seq.reverse();else if(a.mode==='updown'&&seq.length>2)seq=seq.concat(seq.slice(1,-1).reverse());
  let idx=k%seq.length;if(a.mode==='random'){let x=(s*2654435761+g0*40503+seq.length*97)>>>0;x^=x>>>15;x=Math.imul(x,2246822519)>>>0;x^=x>>>13;idx=x%seq.length}
  const vel=Math.max(...held.map(n=>n.v??.8));return [{midi:seq[idx],vel,dur:Math.max(.02,rate*sd*(a.gate??.8)-.004)}]}
/* events of global step i; scOf(id) gives each track's scene (a scene object is accepted too) */
export function eventsForStep(P,scOf,i,t,sd,swing,trackFilter){
  const out=[];const tt=t+((i%2)?swing*sd*.5:0);const sf=typeof scOf==='function'?scOf:()=>scOf;
  for(const tdef of TRACKS){const id=tdef.id;if(trackFilter&&!trackFilter(id))continue;const sc=sf(id);if(!sc)continue;const s=i%(sc.bars*16);
    if(tdef.role==='drums'){for(const [lane,arr] of Object.entries(sc[id]||{})){const v=arr[s];if(v)out.push({track:id,t:tt,lane,vel:v===2?1:.72})}}
    else if(P.tracks[id].arp&&P.tracks[id].arp.on){for(const e of arpStep(P,sc,id,s,sd))out.push({track:id,t:tt,...e})}
    else for(const n of sc[id]||[])if(n.s===s)out.push({track:id,t:tt,midi:n.p,vel:n.v??.8,dur:Math.max(.02,n.l*sd-.006)})}
  return out;
}
function scheduleStep(i,t){
  const sd=stepDur();let s=i;if(stutter){s=stutter.from+((i-stutter.base)%stutter.len+stutter.len)%stutter.len}
  // frozen tracks: a new buffer pass at every loop start of that track
  if(!stutter)for(const tdef of TRACKS){const f=FZ[tdef.id];if(f&&i%trackLen(tdef.id)===0&&(!f.src||f.until<=t+1e-4))fzStart(tdef.id,t,0)}
  if(stutter&&(i-stutter.base)%stutter.len===0)for(const tdef of TRACKS){const f=FZ[tdef.id];if(!f||!f.buf)continue;const g=ac.createBufferSource();g.buffer=f.buf;g.connect(trackGain[tdef.id]);g.start(t,(s%trackLen(tdef.id))*sd,stutter.len*sd);visQ.push({t,track:tdef.id})}
  const ev=eventsForStep(P,scOf,s,t,sd,P.swing,id=>!(FZ[id]&&FZ[id].buf&&(stutter||isFrozenAt(id,t))));
  // a track that just left its frozen buffer: notes already sounding at this step are started live for their remaining length
  if(!stutter)for(const tdef of TRACKS){const id=tdef.id;if(!resumeLive[id])continue;resumeLive[id]=false;if(tdef.role==='drums'||(P.tracks[id].arp&&P.tracks[id].arp.on))continue;
    const sc=scOf(id),st=s%trackLen(id);for(const n of sc[id]||[])if(n.s<st&&st<n.s+n.l)ev.push({track:id,t,midi:n.p,vel:n.v??.8,dur:Math.max(.02,(n.s+n.l-st)*sd-.006)})}
  for(const e of ev){const r=inst[e.track];if(!r||!r.eng)continue;
    if(TR[e.track].role==='drums')r.eng.hit(e.lane,e.vel,e.t);else{const d=stutter?Math.min(e.dur,stutter.len*sd-.006):e.dur;r.eng.noteOn(e.midi,e.vel,e.t);r.eng.noteOff(e.midi,e.t+d);
      const arr=liveNotes[e.track]||(liveNotes[e.track]=[]);arr.push({midi:e.midi,off:e.t+d});if(arr.length>64)arr.splice(0,arr.length-64)}}
  for(const e of eventsForStep(P,scOf,s,t,sd,P.swing,null))visQ.push({t:e.t,track:e.track});
  visQ.push({t,step:s});
}
function draw(){if(!playing)return;const now=ac.currentTime;
  while(visQ.length&&visQ[0].t<=now){const v=visQ.shift();if(v.track){if(audible(v.track))flash(v.track)}else if(v.step!=null)drawPlayhead(v.step%trackLen(sel))}
  if(!$('#sheet').hidden&&mixerOpen)drawMeters();
  requestAnimationFrame(draw)}
function flash(id){const el=actLamp[id];if(!el)return;el.classList.add('on');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('on'),90)}
let curPlayStep=-1;
function drawPlayhead(step){curPlayStep=step;document.querySelectorAll('.cell.ph').forEach(c=>c.classList.remove('ph'));
  if(step<0)return;document.querySelectorAll('#edbody .cell[data-s="'+step+'"]').forEach(c=>c.classList.add('ph'));
  const ph=document.querySelector('.rph');if(ph)ph.style.left=(38+step*RCOL)+'px'}

/* ───────────── live play ───────────── */
function playNow(id,midi,vel=.85,len=.25){initAudio();ac.resume();const r=inst[id];if(!r||!r.eng)return;const t=ac.currentTime+.005;r.eng.noteOn(midi,vel,t);if(len)r.eng.noteOff(midi,t+len);flash(id)}
function hitNow(lane,vel=.9,tid=drumTrack()){initAudio();ac.resume();const r=inst[tid];if(!r||!r.eng)return;r.eng.hit(lane,vel,ac.currentTime+.005);flash(tid)}
const drumTrack=()=>TR[sel]&&TR[sel].role==='drums'?sel:(TRACKS.find(t=>t.role==='drums')||{}).id;

/* ───────────── rendering ───────────── */
function renderAll(){renderTop();renderScenes();renderTracks();renderEditor()}
function renderTop(){$('#bpmBtn').textContent=Math.round(P.bpm)+' BPM';$('#keyBtn').textContent=keyName(P.key,P.scale)}
function renderScenes(){const box=$('#scenes');box.innerHTML='';
  for(const id of SCENE_IDS){const has=!!P.scenes[id];const on=TRACKS.filter(t=>P.tracks[t.id].scene===id).length;const st=on===TRACKS.length?' cur':on?' part':'';
    box.append(h('button',{class:'scene'+(has?' has':'')+st+(queued&&queued.s===id?' queued':''),onclick:()=>chooseScene(id),title:'Alle Spuren auf Szene '+id,'aria-label':'Szene '+id},id))}
  $('#barsOut').textContent=scene().bars;$('#barsLbl').textContent=scene().bars===1?'Takt':'Takte'}
const LAUNCH=[['bar','Nächster Takt'],['loop','Loop-Ende'],['now','Sofort']];
/* launch scene `id` for all tracks (scene row) or for some (per-track clip chips) */
function chooseScene(id,ids=TRACKS.map(t=>t.id)){
  if(!P.scenes[id]){snapshot();P.scenes[id]=newScene(scene().bars);toast('Szene '+id+' angelegt (leer)')}
  const change=ids.filter(t=>P.tracks[t].scene!==id);
  if(playing&&change.length){if(P.launch==='now'){switchScene(id,change);return}queued={s:id,ids:change};renderScenes();renderEditor();return}
  for(const t of ids)P.tracks[t].scene=id;persist();sceneChanged(ids);renderScenes();renderEditor()}
function switchScene(id,ids){for(const t of ids)P.tracks[t].scene=id;queued=null;sceneChanged(ids);persist();renderScenes();renderEditor()}
function renderTracks(){const box=$('#tracks');box.innerHTML='';box.classList.toggle('many',TRACKS.length>4);
  for(const t of TRACKS){const st=P.tracks[t.id];const lamp=h('i',{class:'act'});actLamp[t.id]=lamp;
    const b=h('button',{class:'track'+(sel===t.id?' sel':'')+(!audible(t.id)?' muted':''),style:'--c:'+t.color,onclick:()=>{if(sel===t.id){openSound(t.id);return}sel=t.id;renderTracks();renderEditor();b.scrollIntoView({inline:'nearest',block:'nearest'})}},
      lamp,h('span',{class:'tn'},t.name),h('span',{class:'te'},ENGINES[st.engine].short+(st.solo?' · solo':st.mute?' · stumm':'')));
    box.append(b)}
  box.append(h('button',{class:'track add',title:'Spur hinzufügen',onclick:openAddTrack},h('span',{class:'tn'},'+'),h('span',{class:'te'},'Spur')));
  document.querySelector('.editor').style.setProperty('--tc',TR[sel].color)}
function openAddTrack(){openSheet('Spur hinzufügen',b=>{document.querySelector('.sheetbox').style.setProperty('--tc','var(--fg)');
  b.append(h('p',{class:'note'},'Jede Spur hat ihr eigenes Instrument und ihren eigenen Klang. Eine zweite Drum-Spur geht auch, z. B. für Percussion.'));
  for(const [type,ty] of Object.entries(TYPES)){const row=h('div',{class:'row'});
    for(const e of ty.choices)row.append(h('button',{class:'opt',onclick:()=>addTrack(type,e)},ENGINES[e].name));
    b.append(h('div',{class:'sec'},h('h3',{},ty.name),row))}})}
function addTrack(type,engine){snapshot();let n=2;while(P.tracks[type+n])n++;const id=type===TYPES[type]&&!P.tracks[type]?type:(P.tracks[type]?type+n:type);
  P.tracks[id]=newTrack(type,engine);P.order.push(id);for(const sc of Object.values(P.scenes))if(sc)sc[id]=type==='drums'?{}:[];
  rebuildTracks();ensureTrackNodes(id);ensureEngine(id);sel=id;persist();closeSheet();toast(TR[id].name+' hinzugefügt')}
function removeTrack(id){if(TRACKS.length<=1)return toast('Die letzte Spur bleibt');snapshot();delete P.tracks[id];P.order=P.order.filter(x=>x!==id);for(const sc of Object.values(P.scenes))if(sc)delete sc[id];
  dropTrackRuntime(id);rebuildTracks();if(sel===id)sel=TRACKS[0].id;persist();closeSheet();toast('Spur entfernt – „↶“ holt sie zurück')}

function renderEditor(){
  const head=$('#edhead'),body=$('#edbody');const keep=body.scrollTop;head.innerHTML='';body.innerHTML='';const t=TR[sel],st=P.tracks[sel];
  document.querySelector('.editor').style.setProperty('--tc',t.color);
  head.append(h('b',{class:'brand',style:'font-size:17px'},t.name));
  const clip=h('div',{class:'seg clips'});for(const sid of SCENE_IDS){const q=queued&&queued.s===sid&&queued.ids.includes(sel);clip.append(h('button',{class:(st.scene===sid?'on':'')+(q?' queued':'')+(P.scenes[sid]?'':' empty'),title:'Diese Spur auf Szene '+sid,onclick:()=>chooseScene(sid,[sel])},sid))}head.append(clip);
  if(t.role!=='drums'){const seg=h('div',{class:'seg'});for(const [v,l] of [['step','Step'],['roll','Roll'],['pads','Pads']])seg.append(h('button',{class:st.view===v?'on':'',onclick:()=>{st.view=v;persist();renderEditor()}},l));head.append(seg)}
  head.append(h('span',{class:'grow'}));
  if(t.role!=='drums')head.append(h('button',{class:'chip'+(st.arp&&st.arp.on?' on':''),onclick:()=>openArp(sel),title:'Arpeggiator'},st.arp&&st.arp.on?'Arp an':'Arp'));
  head.append(h('button',{class:'chip ghost',onclick:()=>doIdea(sel),title:'Vorschlag für diese Spur'},'Idee'));
  head.append(h('button',{class:'chip',onclick:()=>openSound(sel)},'Klang'));
  if(t.role==='drums')renderDrums(body);
  else if(st.view==='roll')renderRoll(body);
  else if(st.view==='pads')renderPads(body);
  else if(t.role==='chords')renderChordSteps(body);
  else renderMonoSteps(body);
  body.scrollTop=keep;
  if(playing)drawPlayhead(curPlayStep);
}

/* bar blocks: every bar is its own block, stacked; beats are visibly grouped.
   On narrow screens a bar is shown as two halves (beats 1–2, 3–4) so the cells are twice as wide. */
let wideCells=null;  // null = automatic (phones), true/false = user choice
const halvesMode=()=>wideCells==null?window.innerWidth<560:wideCells;
const halves=()=>halvesMode()?[0,1]:[null];
function barHeader(b,id,half){const r=h('div',{class:'barhead'},h('b',{},'Takt '+(b+1)+(half==null?'':half?' · 3–4':' · 1–2')),h('span',{class:'grow'}));
  if(!half){r.append(h('button',{class:'mini',onclick:()=>{barClip={id,data:copyBar(id,b)};toast('Takt '+(b+1)+' kopiert')}},'Kopieren'));
    if(barClip&&barClip.id===id)r.append(h('button',{class:'mini',onclick:()=>{snapshot();pasteBar(id,b,barClip.data);markEdit(id);persist();renderEditor()}},'Einfügen'));
    r.append(h('button',{class:'mini',onclick:()=>{snapshot();clearBar(id,b);markEdit(id);persist();renderEditor()}},'Leeren'))}
  return r}
let barClip=null;
function copyBar(id,b){const sc=scene();if(typeOf(id)==='drums'){const o={};for(const [k,a] of Object.entries(sc[id]))o[k]=a.slice(b*16,b*16+16);return o}return sc[id].filter(n=>n.s>=b*16&&n.s<b*16+16).map(n=>({...n,s:n.s-b*16}))}
function clearBar(id,b){const sc=scene();if(typeOf(id)==='drums'){for(const a of Object.values(sc[id]))for(let i=0;i<16;i++)a[b*16+i]=0;return}sc[id]=sc[id].filter(n=>n.s<b*16||n.s>=b*16+16);if(typeOf(id)==='chords')recalcHold(P,sc,id)}
function pasteBar(id,b,data){const sc=scene(),L=sceneLen(sc);clearBar(id,b);if(typeOf(id)==='drums'){for(const [k,a] of Object.entries(data)){const arr=sc[id][k]||(sc[id][k]=new Array(L).fill(0));for(let i=0;i<16;i++)arr[b*16+i]=a[i]}return}
  for(const n of data)sc[id].push({...n,s:n.s+b*16});if(typeOf(id)==='chords')recalcHold(P,sc,id)}
const beatsOf=half=>half==null?[0,1,2,3]:[half*2,half*2+1];
function beatNums(lab,half){const r=h('div',{class:'beatrow nums'+(half==null?'':' half')});for(const q of beatsOf(half))r.append(h('div',{class:'bn'},String(q+1)));return lab?h('div',{class:'lanerow'},h('div',{}),r):h('div',{class:'lanerow nolab'},r)}
// a row of cells grouped by beat; mk(i) builds the cell for step i within the bar
function stepRow(mk,half){const row=h('div',{class:'beatrow'+(half==null?'':' half')});for(const q of beatsOf(half)){const g=h('div',{class:'beat'});for(let k=0;k<4;k++)g.append(mk(q*4+k));row.append(g)}return row}
function wideToggle(){return h('button',{class:'chip ghost',onclick:()=>{wideCells=!halvesMode();renderEditor()}},halvesMode()?'Ganze Takte':'Breite Zellen')}

/* drums: a rack of DollyDrumz machines. Each lane is one drum sound on one machine ("bd@909", "bd@sds-v", …). */
const LANE_HINT={bd:'Bassdrum',sd:'Snare',cp:'Handclap',ch:'geschlossen',oh:'offen',rs:'Rimshot',lt:'tief',mt:'mittel',ht:'hoch',crash:'Becken',ride:'Becken'};
function drumLanes(id){const t=P.tracks[id],sc=scene();const want=[...(t.lanes||[])];for(const [k,a] of Object.entries(sc[id]||{}))if(a.some(v=>v)&&!want.includes(k))want.push(k);
  return want.map(k=>({id:k,lane:slotLane(k),card:slotCard(k)}))}
function laneLabel(ln){const same=P.tracks[drumTrack()].lanes.filter(k=>slotLane(k)===ln.lane).length;return (LANE_DE[ln.lane]||ln.lane)}
function renderDrums(body){
  const id=sel,sc=scene(),L=sceneLen(sc),lanes=drumLanes(id);
  if(!lanes.length){body.onpointerdown=body.onpointermove=body.onpointerup=null;
    body.append(h('div',{class:'empty'},h('p',{},'Noch keine Drums. Füg die Sounds hinzu, die du brauchst – jeden auf der Maschine, die du willst. Eine 909-Kick und eine Simmons-Kick nebeneinander gehen auch.'),
      h('button',{class:'cta',onclick:()=>openDrumPicker()},'+ Sound hinzufügen')));return}
  let paint=null;
  for(let b=0;b<sc.bars;b++)for(const half of halves()){const block=h('div',{class:'barblock'});block.append(barHeader(b,id,half),beatNums(true,half));
    for(const ln of lanes){
      const lab=h('div',{class:'lanelab'},h('button',{class:'lname',onclick:()=>hitNow(ln.id)},laneLabel(ln)),
        h('button',{class:'card c'+ln.card.replace('-',''),title:'Sounds und Maschinen ändern',onclick:()=>openDrumPicker(ln.lane)},CARD_LABEL[ln.card]||ln.card));
      const row=stepRow(i=>{const s=b*16+i;const v=(sc[id][ln.id]||[])[s]||0;return h('div',{class:'cell'+(v===1?' on':'')+(v===2?' acc':''),'data-s':s,'data-lane':ln.id})},half);
      block.append(h('div',{class:'lanerow'},lab,row))}
    body.append(block)}
  const setCell=(c,val)=>{const lane=c.dataset.lane,s=+c.dataset.s;const arr=sc[id][lane]||(sc[id][lane]=new Array(L).fill(0));while(arr.length<L)arr.push(0);arr[s]=val;c.classList.toggle('on',val===1);c.classList.toggle('acc',val===2)};
  body.onpointerdown=e=>{const c=e.target.closest('.cell');if(!c||!c.dataset.lane)return;e.preventDefault();snapshot();const cur=(sc[id][c.dataset.lane]||[])[+c.dataset.s]||0;const nv=cur===0?1:cur===1?2:0;paint={lane:c.dataset.lane,val:nv===2?1:nv,first:c};setCell(c,nv);if(nv)hitNow(c.dataset.lane,nv===2?1:.72);markEdit(id);body.setPointerCapture(e.pointerId)};
  body.onpointermove=e=>{if(!paint)return;const el=document.elementFromPoint(e.clientX,e.clientY);const c=el&&el.closest&&el.closest('.cell');if(!c||c===paint.first||c.dataset.lane!==paint.lane)return;const cur=(sc[id][paint.lane]||[])[+c.dataset.s]||0;if((paint.val?1:0)!==(cur?1:0))setCell(c,paint.val)};
  body.onpointerup=()=>{if(paint){paint=null;markEdit(id);persist()}};
  body.append(h('div',{class:'tools'},
    h('button',{class:'chip',onclick:()=>openDrumPicker()},'+ Sound'),wideToggle(),
    h('span',{class:'small'},'Tippen: an · nochmal: Akzent · nochmal: aus. Ziehen malt. Name antippen = vorhören.')));
}
function openDrumPicker(focus){if(typeof focus!=='string')focus=null;const id=drumTrack(),r=inst[id];
  openSheet(focus?(LANE_DE[focus]||focus)+' · Maschinen':'Drum-Sounds',b=>{
    document.querySelector('.sheetbox').style.setProperty('--tc','var(--drums)');
    if(!r||!r.eng){b.append(h('p',{class:'note'},'DollyDrumz lädt …'));r&&r.ready&&r.ready.then(()=>{if(!$('#sheet').hidden)openDrumPicker(focus)});return}
    b.append(h('p',{class:'note'},'Antippen fügt den Sound auf dieser Maschine als Spur hinzu und spielt ihn an. Nochmal antippen entfernt die Spur samt Noten („↶“ holt sie zurück). 909 = Roland TR-909, SDS-V und SDS7 = Simmons. Mehrere Maschinen für denselben Sound sind erlaubt.'));
    const lanes=P.tracks[id].lanes||(P.tracks[id].lanes=[]);
    for(const ln of r.eng.laneDefs().sort((x,y)=>LANE_ORDER.indexOf(x.id)-LANE_ORDER.indexOf(y.id))){if(focus&&ln.id!==focus)continue;
      const row=h('div',{class:'dpick'},h('div',{class:'dname'},h('b',{},LANE_DE[ln.id]||ln.id),h('span',{class:'small'},LANE_HINT[ln.id]||'')));
      const btns=h('div',{class:'row'});
      for(const c of ln.cards||['909']){const slot=ln.id+'@'+c;const on=lanes.includes(slot)||Object.values(P.scenes).some(sc=>sc&&((sc[id]||{})[slot]||[]).some(v=>v));
        btns.append(h('button',{class:'opt mach c'+c.replace('-','')+(on?' on':''),onclick:async()=>{snapshot();
          if(on){P.tracks[id].lanes=lanes.filter(x=>x!==slot);for(const sc of Object.values(P.scenes))if(sc&&sc[id])delete sc[id][slot];toast((LANE_DE[ln.id]||ln.id)+' '+CARD_LABEL[c]+' entfernt')}
          else{await r.eng.prepare(c);lanes.push(slot);hitNow(slot,1,id)}
          markEdit(id);persist();openDrumPicker(focus)}},CARD_LABEL[c]))}
      row.append(btns);b.append(row)}
    b.append(h('div',{class:'row'},h('button',{class:'cta',onclick:closeSheet},'Fertig')));
  })}

/* mono step grid (scale-locked): one block per bar */
function windowRows(id){const st=P.tracks[id];const all=scaleNotes(12,108,P.key,P.scale);const root=12*((st.oct??TR[id].oct)+1)+P.key;let i=all.findIndex(m=>m>=root);if(i<0)i=0;return all.slice(i,i+8).reverse()}
const LENS=[[1,'1/16'],[2,'1/8'],[4,'1/4'],[8,'1/2'],[16,'1 Takt']];
function lenChips(st,label='Länge'){const r=h('div',{class:'lenrow'},h('span',{class:'small'},label+':'));
  for(const [v,l] of LENS)r.append(h('button',{class:'chip len'+((st.len||1)===v?' on':''),onclick:()=>{st.len=v;persist();renderEditor()}},l));return r}
let accentMode=false;
function renderMonoSteps(body){
  const sc=scene(),id=sel,st=P.tracks[id],rows=windowRows(id);
  body.append(h('div',{class:'tools',style:'margin:0 0 6px'},
    h('button',{class:'chip',onclick:()=>{st.oct=(st.oct??TR[id].oct)-1;persist();renderEditor()}},'Oktave −'),
    h('button',{class:'chip',onclick:()=>{st.oct=(st.oct??TR[id].oct)+1;persist();renderEditor()}},'Oktave +'),
    h('button',{class:'chip'+(accentMode?' on':''),title:'Noten antippen schaltet Akzent (lauter) an/aus',onclick:()=>{accentMode=!accentMode;renderEditor()}},'Akzent'),wideToggle()),
    lenChips(st),
    h('p',{class:'small',style:'margin:2px 0 6px'},accentMode?'Akzent-Modus: Note antippen = lauter/leiser.':'Tippen setzt eine Note in der gewählten Länge · nach rechts ziehen = länger · im Notenschwanz tippen = dort kürzen · Notenanfang tippen = löschen'));
  for(let b=0;b<sc.bars;b++)for(const half of halves()){const block=h('div',{class:'barblock'});block.append(barHeader(b,id,half),beatNums(true,half));
    for(const p of rows){const row=stepRow(i=>{const s=b*16+i;return h('div',{class:'cell'+(((p-P.key)%12+12)%12===0?' root':''),'data-s':s,'data-p':p})},half);
      block.append(h('div',{class:'lanerow'},h('div',{class:'lanelab'},h('button',{class:'lname mono',onclick:()=>playNow(id,p)},midiName(p))),row))}
    const out=half?0:sc[id].filter(n=>n.s>=b*16&&n.s<b*16+16&&!rows.includes(n.p)).length;if(out)block.append(h('div',{class:'small',style:'margin-top:4px'},out+' Note(n) in diesem Takt liegen außerhalb – Oktave wechseln oder Roll nutzen'));
    body.append(block)}
  refreshMono(body,sc,id);
  let drag=null;
  body.onpointerdown=e=>{const c=e.target.closest('.cell');if(!c||c.dataset.p==null)return;e.preventDefault();const s=+c.dataset.s,p=+c.dataset.p;const notes=sc[id];
    const ex=notes.find(n=>n.s===s&&n.p===p),cover=!ex&&notes.find(n=>n.p===p&&n.s<s&&n.s+n.l>s);
    if(accentMode){const t=ex||cover;if(!t)return;snapshot();t.v=(t.v??.85)>=.95?.8:1;markEdit(id);persist();refreshMono(body,sc,id);playNow(id,p,t.v);return}
    snapshot();markEdit(id);
    if(ex){sc[id]=notes.filter(n=>n!==ex);persist();refreshMono(body,sc,id);return}
    if(cover){cover.l=s-cover.s;persist();refreshMono(body,sc,id);return}
    sc[id]=notes.filter(n=>n.s!==s);for(const n of sc[id])if(n.s<s&&n.s+n.l>s)n.l=s-n.s;
    const nx=sc[id].filter(n=>n.s>s).map(n=>n.s);const lim=(nx.length?Math.min(...nx):sceneLen(sc))-s;
    const n={s,p,l:Math.min(st.len||1,lim),v:.85};sc[id].push(n);drag={n,lim,x0:e.clientX,cw:c.getBoundingClientRect().width+2,base:n.l,moved:false};refreshMono(body,sc,id);playNow(id,p,.85,Math.min(1,n.l*stepDur()));body.setPointerCapture(e.pointerId)};
  body.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x0;if(Math.abs(dx)<drag.cw*.6&&!drag.moved)return;drag.moved=true;const L=clamp(1+Math.floor(dx/drag.cw+.4),1,drag.lim);if(L!==drag.n.l){drag.n.l=L;refreshMono(body,sc,id)}};
  body.onpointerup=()=>{if(drag){if(drag.moved)st.len=drag.n.l;drag=null;markEdit(id);persist();renderEditor()}};
}
function refreshMono(body,sc,id){body.querySelectorAll('.cell[data-p]').forEach(c=>{const s=+c.dataset.s,p=+c.dataset.p;const start=sc[id].find(n=>n.s===s&&n.p===p);const cover=!start&&sc[id].find(n=>n.p===p&&n.s<s&&n.s+n.l>s);const nn=start||cover;
  c.classList.toggle('on',!!start);c.classList.toggle('tie',!!cover);c.classList.toggle('acc',!!(start&&(start.v??.85)>=.95));c.classList.toggle('cont',!!(nn&&s<nn.s+nn.l-1))})}

/* chords: palette brush, one row per bar */
let chordBrush=0;
const VOICINGS=[['lead','Gleiche Lage','Akkorde bleiben nah beieinander'],['root','Grundstellung','springt mit dem Grundton auf und ab'],['wide','Weit','offen gesetzt'],];
function renderChordSteps(body){
  const sc=scene(),id=sel,st=P.tracks[id];
  const pal=h('div',{class:'palette'});
  for(let d=0;d<7;d++){const ci=chordInfo(d,P.key,P.scale,!!st.seventh);pal.append(h('button',{class:chordBrush===d?'on':'',onclick:()=>{chordBrush=d;playChord(d,id);renderEditor()}},ci.roman,h('small',{},ci.name)))}
  pal.append(h('button',{class:chordBrush==='up'?'on':'',onclick:()=>{chordBrush='up';renderEditor()},title:'Antippen eines Akkords: eine Umkehrung höher'},'▲',h('small',{},'höher')),
    h('button',{class:chordBrush==='down'?'on':'',onclick:()=>{chordBrush='down';renderEditor()},title:'Antippen eines Akkords: eine Umkehrung tiefer'},'▼',h('small',{},'tiefer')),
    h('button',{class:chordBrush==='off'?'on':'',onclick:()=>{chordBrush='off';renderEditor()}},'Aus',h('small',{},'löschen')));
  body.append(pal);
  const voi=h('div',{class:'row',style:'margin-bottom:8px'},h('span',{class:'small'},'Lage:'));
  for(const [k,l,tip] of VOICINGS)voi.append(h('button',{class:'chip'+((st.voicing||'lead')===k?' on':''),title:tip,onclick:()=>{snapshot();st.voicing=k;revoiceChords(sc,id);markEdit(id);persist();renderEditor();playChord(chordBrush>=0?chordBrush:0,id)}},l));
  voi.append(h('button',{class:'chip'+(st.bassOct?' on':''),title:'Grundton eine Oktave tiefer dazu',onclick:()=>{snapshot();st.bassOct=!st.bassOct;revoiceChords(sc,id);markEdit(id);persist();renderEditor()}},'+ Bass'));
  body.append(voi);
  if(!st.hold)body.append(h('div',{style:'margin-bottom:8px'},lenChips(st,'Akkordlänge')));
  for(let b=0;b<sc.bars;b++)for(const half of halves()){const block=h('div',{class:'barblock'});block.append(barHeader(b,id,half),beatNums(false,half));
    const row=stepRow(i=>{const s=b*16+i;const here=sc[id].find(n=>n.s===s&&n.c!=null);const cover=!here&&sc[id].find(n=>n.s<s&&n.s+n.l>s);
      const inv=here?(here.inv||0):0;
      return h('div',{class:'cell tall'+(here?' on':'')+(cover?' tie':''),'data-s':s,'data-chord':1},here?h('span',{class:'tx'},chordInfo(here.c,P.key,P.scale,!!st.seventh).roman+(inv>0?'↑'.repeat(Math.min(inv,3)):inv<0?'↓'.repeat(Math.min(-inv,3)):'')):null)},half);
    block.append(h('div',{class:'lanerow nolab'},row));body.append(block)}
  body.onpointerdown=e=>{const c=e.target.closest('.cell[data-chord]');if(!c)return;e.preventDefault();snapshot();const s=+c.dataset.s;const here=sc[id].find(n=>n.s===s&&n.c!=null);
    if(chordBrush==='up'||chordBrush==='down'){if(!here)return toast('Hier liegt kein Akkord');const inv=(here.inv||0)+(chordBrush==='up'?1:-1);const l=here.l;placeChord(P,sc,s,here.c,inv,id);sc[id].filter(n=>n.s===s).forEach(n=>n.l=l);playChordNotes(sc[id].filter(n=>n.s===s).map(n=>n.p),id)}
    else if(chordBrush==='off'||(here&&here.c===chordBrush&&(here.inv||0)===0)){sc[id]=sc[id].filter(n=>n.s!==s)}
    else{placeChord(P,sc,s,chordBrush,0,id);if(!st.hold){const nx=Math.min(sceneLen(sc),...sc[id].filter(n=>n.s>s).map(n=>n.s));sc[id].filter(n=>n.s===s).forEach(n=>n.l=Math.max(1,Math.min(st.len||4,nx-s)))}playChordNotes(sc[id].filter(n=>n.s===s).map(n=>n.p),id)}
    recalcHold(P,sc,id);markEdit(id);persist();renderEditor()};
  body.onpointermove=null;body.onpointerup=null;
  body.append(h('div',{class:'tools'},
    h('button',{class:'chip'+(st.seventh?' on':''),onclick:()=>{snapshot();st.seventh=!st.seventh;revoiceChords(sc,id);markEdit(id);persist();renderEditor()}},'7er-Akkorde'),
    h('button',{class:'chip'+(st.hold?' on':''),title:'An: jeder Akkord klingt bis zum nächsten. Aus: feste Länge',onclick:()=>{snapshot();st.hold=!st.hold;if(!st.hold)sc[id].forEach(n=>n.l=Math.min(n.l,st.len||4));recalcHold(P,sc,id);markEdit(id);persist();renderEditor()}},'Halten'),
    h('button',{class:'chip',onclick:()=>{st.oct=(st.oct??4)-1;revoiceChords(sc,id);markEdit(id);persist();renderEditor()}},'Alle tiefer'),
    h('button',{class:'chip',onclick:()=>{st.oct=(st.oct??4)+1;revoiceChords(sc,id);markEdit(id);persist();renderEditor()}},'Alle höher'),
    wideToggle(),h('span',{class:'small'},'Akkord wählen, dann Schritte antippen. ▲/▼ verschiebt einen einzelnen Akkord.')));
}
function playChordNotes(notes,id=sel){notes.forEach(p=>playNow(id,p,.75,.5))}
function playChord(d,id=sel){playChordNotes(chordNotes(P,d,0,null,id),id)}

/* piano roll */
const RCOL=26,RROW=22;
function renderRoll(body){
  body.onpointerdown=body.onpointermove=body.onpointerup=null;
  const sc=scene(),id=sel,st=P.tracks[id],L=sceneLen(sc);const [lo,hi]=TR[id].range;const onlyScale=st.rollScale!==false;
  const rows=[];for(let m=hi;m>=lo;m--)if(!onlyScale||inScale(m,P.key,P.scale))rows.push(m);
  const W=38+L*RCOL,H=rows.length*RROW;
  const roll=h('div',{class:'roll'});const inner=h('div',{class:'rollin',style:`width:${W}px;height:${H}px`});roll.append(inner);
  const keys=h('div',{class:'rkeys',style:`height:${H}px`});inner.append(keys);
  rows.forEach((m,r)=>{const pc=((m%12)+12)%12;inner.append(h('div',{class:'rrow'+([1,3,6,8,10].includes(pc)?' black':'')+(!onlyScale&&inScale(m,P.key,P.scale)?' inscale':''),style:`top:${r*RROW}px;height:${RROW}px`}));
    keys.append(h('div',{class:'rkey'+(pc===P.key?' c':''),style:`top:${r*RROW}px;height:${RROW}px`,onpointerdown:()=>playNow(id,m)},midiName(m)))});
  for(let s=0;s<=L;s++)inner.append(h('div',{class:'rbeat'+(s%16===0?' bar':s%4===0?' beat':' six'),style:`left:${38+s*RCOL}px`}));
  for(let b=0;b<sc.bars;b++)inner.append(h('div',{class:'rbarno',style:`left:${38+b*16*RCOL+4}px`},'Takt '+(b+1)));
  inner.append(h('div',{class:'rph',style:'left:-10px'}));
  const rowOf=m=>rows.indexOf(m);
  const drawNotes=()=>{inner.querySelectorAll('.rnote').forEach(e=>e.remove());for(const n of sc[id]){const r=rowOf(n.p);if(r<0)continue;const el=h('div',{class:'rnote',style:`left:${38+n.s*RCOL+1}px;top:${r*RROW+2}px;width:${n.l*RCOL-2}px;height:${RROW-4}px`},h('i',{class:'h'}));el._n=n;inner.append(el)}};
  drawNotes();
  let op=null;const lastLen=st.lastLen||2;
  inner.addEventListener('pointerdown',e=>{if(e.target.closest('.rkey'))return;const rect=inner.getBoundingClientRect();const x=e.clientX-rect.left,y=e.clientY-rect.top;if(x<38)return;
    const ne=e.target.closest('.rnote');
    if(ne){snapshot();op={n:ne._n,mode:e.target.classList.contains('h')?'len':'move',x0:x,y0:y,s0:ne._n.s,p0:ne._n.p,l0:ne._n.l,moved:false};inner.setPointerCapture(e.pointerId);e.preventDefault();return}
    op={add:true,x0:x,y0:y,cx:e.clientX,cy:e.clientY}});
  inner.addEventListener('pointermove',e=>{if(!op)return;const rect=inner.getBoundingClientRect();const x=e.clientX-rect.left,y=e.clientY-rect.top;
    if(op.add){if(Math.hypot(e.clientX-op.cx,e.clientY-op.cy)>8)op=null;return}
    const ds=Math.round((x-op.x0)/RCOL),dr=Math.round((y-op.y0)/RROW);if(ds||dr)op.moved=true;
    if(op.mode==='len'){op.n.l=clamp(op.l0+ds,1,L-op.n.s)}else{op.n.s=clamp(op.s0+ds,0,L-op.n.l);const r=clamp(rowOf(op.p0)+dr,0,rows.length-1);if(rows[r]!==op.n.p){op.n.p=rows[r];playNow(id,op.n.p,.7,.12)}}
    drawNotes()});
  inner.addEventListener('pointerup',()=>{if(!op)return;
    if(op.add){snapshot();const s=Math.floor((op.x0-38)/RCOL),r=Math.floor(op.y0/RROW);if(s>=0&&s<L&&r>=0&&r<rows.length){const p=rows[r];const n={s,p,l:Math.min(lastLen,L-s),v:.85};sc[id].push(n);playNow(id,p);markEdit(id);persist();drawNotes()}op=null;return}
    if(!op.moved&&op.mode==='move'){sc[id]=sc[id].filter(n=>n!==op.n)}else{st.lastLen=op.n.l}
    op=null;markEdit(id);persist();drawNotes()});
  body.append(h('div',{style:'display:grid;grid-template-rows:1fr auto;gap:8px;height:100%'},roll,h('div',{class:'tools'},
    h('button',{class:'chip'+(onlyScale?' on':''),onclick:()=>{st.rollScale=!onlyScale;persist();renderEditor()}},'Nur Tonart'),
    h('button',{class:'chip ghost',onclick:()=>{snapshot();sc[id]=[];markEdit(id);persist();renderEditor()}},'Spur leeren'),
    h('span',{class:'small'},'Tippen setzt · Note ziehen verschiebt · rechten Rand ziehen = Länge · Note antippen löscht'))));
  requestAnimationFrame(()=>{const ns=sc[id];const mid=ns.length?ns.reduce((a,n)=>a+n.p,0)/ns.length:(lo+hi)/2;let r=0,bd=1e9;rows.forEach((m,i)=>{if(Math.abs(m-mid)<bd){bd=Math.abs(m-mid);r=i}});roll.scrollTop=Math.max(0,r*RROW-roll.clientHeight/2)});
}

/* pads + recording */
let recOn=false;
function renderPads(body){
  body.onpointerdown=body.onpointermove=body.onpointerup=null;
  const id=sel,st=P.tracks[id],t=TR[id];const pads=h('div',{class:'pads'});
  if(t.role==='chords'){for(let d=0;d<8;d++){const deg=d%7;const ci=chordInfo(deg,P.key,P.scale,!!st.seventh);const up=d===7?1:0;
      pads.append(padEl(ci.roman+(up?'′':''),ci.name,()=>chordNotes(P,deg,up?(st.seventh?4:3):0,null,id),deg===0,deg))}}
  else{const all=scaleNotes(12,108,P.key,P.scale);const root=12*((st.oct??t.oct)+1)+P.key;let i=all.findIndex(m=>m>=root);const ns=all.slice(i,i+16);
    const order=[12,13,14,15,8,9,10,11,4,5,6,7,0,1,2,3];for(const k of order){const m=ns[k];if(m==null)continue;pads.append(padEl(midiName(m),'',()=>[m],((m-P.key)%12+12)%12===0))}}
  body.append(h('div',{style:'display:grid;grid-template-rows:auto 1fr;gap:8px;height:100%'},h('div',{class:'tools',style:'margin:0'},
    h('button',{class:'chip recbtn'+(recOn?' on':''),onclick:()=>{recOn=!recOn;if(recOn&&!playing)start();renderEditor()}},recOn?'● Aufnahme läuft':'● Aufnehmen'),
    h('button',{class:'chip',onclick:()=>{st.oct=(st.oct??t.oct)-1;persist();renderEditor()}},'Oktave −'),
    h('button',{class:'chip',onclick:()=>{st.oct=(st.oct??t.oct)+1;persist();renderEditor()}},'Oktave +'),
    h('span',{class:'small'},recOn?'Spiel einfach mit – wird aufs 16tel-Raster gelegt.':'Spielen. Mit „Aufnehmen" landet es im Loop.')),pads));
}
function padEl(label,sub,notesFn,isRoot,chordDeg){
  const id=sel;const el=h('div',{class:'pad'+(isRoot?' root':'')},h('div',{},label,sub?h('small',{},sub):null));
  let held=null;
  el.addEventListener('pointerdown',e=>{e.preventDefault();initAudio();ac.resume();el.classList.add('down');const r=inst[id];const notes=notesFn();const t=ac.currentTime+.003;
    if(r&&r.eng)notes.forEach(m=>r.eng.noteOn(m,.85,t));flash(id);held={notes,t0:ac.currentTime};el.setPointerCapture(e.pointerId)});
  const up=()=>{if(!held)return;el.classList.remove('down');const r=inst[id];const t=ac.currentTime+.003;if(r&&r.eng)held.notes.forEach(m=>r.eng.noteOff(m,t));
    if(recOn&&playing)recordNotes(id,held.notes,held.t0,ac.currentTime,chordDeg);held=null};
  el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);return el}
function recordNotes(id,notes,t0,t1,chordDeg){const sc=scene(),L=sceneLen(sc),sd=stepDur();
  const pos=((t0-startT)/sd);let s=((Math.round(pos)%L)+L)%L;const l=clamp(Math.round((t1-t0)/sd),1,16);
  if(TR[id].role==='mono')sc[id]=sc[id].filter(n=>n.s!==s);
  for(const p of notes){sc[id]=sc[id].filter(n=>!(n.s===s&&n.p===p));const n={s,p,l,v:.85};if(TR[id].role==='chords'&&chordDeg!=null){n.c=chordDeg;n.inv=0}sc[id].push(n)}
  markEdit(id);persist()}

/* ───────────── hold FX ───────────── */
function setupFx(){
  document.querySelectorAll('.fx').forEach(btn=>{const kind=btn.dataset.fx;
    btn.addEventListener('pointerdown',e=>{e.preventDefault();initAudio();btn.classList.add('on');btn.setPointerCapture(e.pointerId);fxOn(kind,e)});
    btn.addEventListener('pointermove',e=>{if(kind==='filter'&&btn.classList.contains('on'))fxFilterMove(e)});
    const off=()=>{if(!btn.classList.contains('on'))return;btn.classList.remove('on');fxOff(kind)};btn.addEventListener('pointerup',off);btn.addEventListener('pointercancel',off)})}
function fxFilterMove(e){const x=clamp(e.clientX/window.innerWidth,0,1);const f=180*Math.pow(16000/180,x);fxNodes.filt.frequency.setTargetAtTime(f,ac.currentTime,.02);fxNodes.filt.Q.setTargetAtTime(6,ac.currentTime,.05)}
function fxOn(kind,e){const t=ac.currentTime,F=fxNodes;
  if(kind==='filter'){fxFilterMove(e)}
  if(kind==='echo'){const sd=stepDur();F.echo.delayTime.setValueAtTime(sd*3,t);F.echoIn.gain.setTargetAtTime(1,t,.01);F.efb.gain.setTargetAtTime(.55,t,.01)}
  if(kind==='stutter'&&playing){const cur=Math.floor(stepIdx/2)*2;stutter={from:cur,base:stepIdx,len:2};for(const tr of TRACKS){const f=FZ[tr.id];if(f&&f.src){try{f.src.stop(nextT)}catch(_e){}f.src=null}}}
  if(kind==='tape'){const T=1.1,N=64,curve=new Float32Array(N);for(let i=0;i<N;i++){const tt=T*i/(N-1);curve[i]=tt*tt/(2*T)}F.tape.delayTime.cancelScheduledValues(t);F.tape.delayTime.setValueCurveAtTime(curve,t,T);F.tapeGain.gain.cancelScheduledValues(t);F.tapeGain.gain.setValueAtTime(1,t);F.tapeGain.gain.setTargetAtTime(0,t+T*.75,.08)}}
function fxOff(kind){const t=ac.currentTime,F=fxNodes;
  if(kind==='filter'){F.filt.frequency.setTargetAtTime(20000,t,.06);F.filt.Q.setTargetAtTime(.7,t,.06)}
  if(kind==='echo'){F.echoIn.gain.setTargetAtTime(0,t,.01);F.efb.gain.setTargetAtTime(.35,t+.4,.6)}
  if(kind==='stutter'){stutter=null;if(playing)for(const tr of TRACKS)fzEngage(tr.id)}
  if(kind==='tape'){F.tapeGain.gain.cancelScheduledValues(t);F.tapeGain.gain.setValueAtTime(F.tapeGain.gain.value,t);F.tapeGain.gain.linearRampToValueAtTime(0,t+.015);F.tape.delayTime.cancelScheduledValues(t+.016);F.tape.delayTime.setValueAtTime(0,t+.017);F.tapeGain.gain.setValueAtTime(0,t+.018);F.tapeGain.gain.linearRampToValueAtTime(1,t+.04)}}

/* ───────────── sheets ───────────── */
let mixerOpen=false,automixMsg='';
function openSheet(title,build){mixerOpen=false;if(title!=='Mixer')automixMsg='';$('#sheetTitle').textContent=title;const b=$('#sheetBody');b.innerHTML='';build(b);$('#sheet').hidden=false}
function closeSheet(){$('#sheet').hidden=true;mixerOpen=false;renderAll()}
document.querySelectorAll('[data-close]').forEach(e=>e.addEventListener('click',closeSheet));

function openSound(id){const t=TR[id],st=P.tracks[id];
  openSheet(t.name+' · Klang',b=>{
    document.querySelector('.sheetbox').style.setProperty('--tc',t.color);
    const rec=inst[id];const eng=rec&&rec.eng;
    const nm=h('input',{type:'text',value:t.name,id:'tname_'+id,maxlength:'18',placeholder:TYPES[t.type].name,'aria-label':'Spurname'});
    nm.addEventListener('change',()=>{snapshot();st.name=nm.value.trim()||null;rebuildTracks();persist();renderTracks();renderEditor();$('#sheetTitle').textContent=TR[id].name+' · Klang'});
    b.append(h('div',{class:'row'},h('span',{class:'small'},'Name:'),nm));
    b.append(h('img',{src:ENGINES[st.engine].img,alt:ENGINES[st.engine].name,class:'cover'+(st.engine==='pierrette'?' pix':'')}));
    if(t.choices.length>1){const row=h('div',{class:'row'});for(const e of t.choices)row.append(h('button',{class:'opt'+(st.engine===e?' on':''),onclick:async()=>{if(st.engine===e)return;snapshot();st.engine=e;st.patch=null;st.preset=null;st.macros=null;markEdit(id);persist();toast(ENGINES[e].name+' wird geladen…');await ensureEngine(id);openSound(id)}},ENGINES[e].name));b.append(h('div',{class:'sec'},h('h3',{},'Instrument'),row))}
    if(!eng){b.append(h('p',{class:'note'},'Instrument lädt …'));rec&&rec.ready&&rec.ready.then(()=>{if(!$('#sheet').hidden)openSound(id)});return}
    const list=eng.presets();const cats=[...new Set(list.map(p=>p.cat||'—'))];let cat=st.presetCat&&cats.includes(st.presetCat)?st.presetCat:(list.find(p=>p.id===st.preset)?.cat||cats[0]);
    const catRow=h('div',{class:'row'}),plist=h('div',{class:'plist'});
    const fill=()=>{catRow.innerHTML='';plist.innerHTML='';for(const c of cats)catRow.append(h('button',{class:'opt'+(c===cat?' on':''),onclick:()=>{cat=c;st.presetCat=c;fill()}},c));
      for(const p of list.filter(p=>(p.cat||'—')===cat))plist.append(h('button',{class:p.id===st.preset?'on':'',title:p.name,onclick:()=>{snapshot();eng.loadPreset(p.id);st.preset=p.id;st.macros=null;st.patch=eng.getPatch();markEdit(id);persist();fill();renderKnobs();previewSound(id)}},p.name))};
    fill();
    b.append(h('div',{class:'sec'},h('h3',{},'Klänge'),catRow,h('div',{style:'height:6px'}),plist));
    const knobs=h('div',{class:'knobs'});
    const renderKnobs=()=>{knobs.innerHTML='';for(const m of eng.macros()){const out=h('output',{},Math.round(m.value*100));const inp=h('input',{type:'range',min:0,max:100,value:Math.round(m.value*100),id:'k_'+id+'_'+m.id});
      inp.addEventListener('input',()=>{eng.setMacro(m.id,inp.value/100);out.textContent=inp.value;st.macros={...(st.macros||{}),[m.id]:inp.value/100};st.patch=eng.getPatch();markEdit(id);persist()});
      inp.addEventListener('change',()=>previewSound(id));knobs.append(h('div',{class:'knob'},h('label',{for:inp.id},m.label,out),inp))}};
    renderKnobs();
    b.append(h('div',{class:'sec'},h('h3',{},'Regler'),knobs));
    const ta=h('textarea',{placeholder:'Patch aus der Nocturne Workbench hier einfügen (JSON oder ganze KI-Antwort)',id:'paste_'+id});
    b.append(h('div',{class:'sec'},h('h3',{},'Patch tauschen'),h('div',{class:'row'},
      h('button',{class:'opt',onclick:async()=>{const txt=JSON.stringify(eng.getPatch(),null,2);try{await navigator.clipboard.writeText(txt);toast('Patch kopiert')}catch(_e){ta.value=txt;ta.select();toast('Text markiert – bitte kopieren')}}},'Patch kopieren'),
      h('button',{class:'opt',onclick:()=>{try{snapshot();eng.setPatch(ta.value);st.patch=eng.getPatch();st.preset=null;st.macros=null;markEdit(id);persist();renderKnobs();toast('Patch übernommen');previewSound(id)}catch(e){toast('Patch nicht lesbar: '+e.message)}}},'Einfügen übernehmen')),h('div',{style:'height:6px'}),ta));
    b.append(h('p',{class:'note'},'Lautstärke, Stumm und Solo: im Mixer (Taste „Mix" oben).'));
    b.append(h('div',{class:'row'},h('button',{class:'opt ghost',onclick:()=>removeTrack(id)},'Spur entfernen')));
  })}
function previewSound(id){if(playing)return;if(TR[id].role==='drums'){const ls=P.tracks[id].lanes||[];hitNow(ls[0]||'bd@909',1,id);if(ls[1])setTimeout(()=>hitNow(ls[1],.9,id),220);return}const st=P.tracks[id];const r=12*((st.oct??TR[id].oct)+1)+P.key;
  if(TR[id].role==='chords'){playChord(0,id);return}playNow(id,r,.85,.35);setTimeout(()=>playNow(id,r+7,.8,.3),260)}

/* arpeggiator sheet */
function openArp(id){const st=P.tracks[id],a=st.arp||(st.arp={...ARP0});const t=TR[id];
  openSheet(t.name+' · Arpeggiator',b=>{document.querySelector('.sheetbox').style.setProperty('--tc',t.color);
    const upd=()=>{markEdit(id);persist();openArp(id)};
    b.append(h('p',{class:'note'},'Gehaltene Noten bzw. Akkorde werden nacheinander gespielt. Am besten mit langen Noten oder „Halten“ bei den Akkorden.'));
    b.append(h('div',{class:'row'},h('button',{class:'cta'+(a.on?'':' alt'),onclick:()=>{snapshot();a.on=!a.on;upd()}},a.on?'Arp ist an':'Arp einschalten')));
    const sec=(title,items,key)=>{const r=h('div',{class:'row'});for(const [v,l] of items)r.append(h('button',{class:'opt'+(a[key]===v?' on':''),onclick:()=>{snapshot();a[key]=v;upd()}},l));return h('div',{class:'sec'},h('h3',{},title),r)};
    b.append(sec('Muster',ARP_MODES,'mode'),sec('Tempo',[[1,'1/16'],[2,'1/8'],[4,'1/4']],'rate'),sec('Oktaven',[[1,'1'],[2,'2'],[3,'3']],'oct'));
    const g=h('input',{type:'range',min:15,max:100,value:Math.round((a.gate??.8)*100),id:'arpgate'});const go=h('output',{},Math.round((a.gate??.8)*100)+' %');
    g.addEventListener('pointerdown',snapshot,{once:true});g.addEventListener('input',()=>{a.gate=g.value/100;go.textContent=g.value+' %';markEdit(id);persist()});
    b.append(h('div',{class:'sec knob'},h('label',{for:'arpgate'},'Notenlänge',go),g));
  })}

/* mixer */
function openMixer(){openSheet('Mixer',b=>{mixerOpen=true;document.querySelector('.sheetbox').style.setProperty('--tc','var(--fg)');
  for(const t of TRACKS){const st=P.tracks[t.id];
    const fader=h('input',{type:'range',min:0,max:1000,value:Math.round(volToFader(st.vol)*1000),id:'mix_'+t.id,'aria-label':t.name+' Lautstärke'});
    const out=h('output',{class:'mono'},dbStr(st.vol));
    fader.addEventListener('pointerdown',snapshot,{once:true});
    fader.addEventListener('input',()=>{st.vol=+faderToVol(fader.value/1000).toFixed(5);out.textContent=dbStr(st.vol);applyTrackGain(t.id);persist()});
    fader.addEventListener('dblclick',()=>{st.vol=1;fader.value=Math.round(volToFader(1)*1000);out.textContent=dbStr(1);applyTrackGain(t.id);persist()});
    const m=h('button',{class:'ms'+(st.mute?' on':''),onclick:()=>{snapshot();st.mute=!st.mute;applyAllGains();persist();openMixer()}},'M');
    const s=h('button',{class:'ms solo'+(st.solo?' on':''),onclick:()=>{snapshot();st.solo=!st.solo;applyAllGains();persist();openMixer()}},'S');
    const bar=h('div',{class:'meter'},h('i',{id:'mt_'+t.id}),h('b',{id:'mp_'+t.id}));
    b.append(h('div',{class:'strip'+(audible(t.id)?'':' off'),style:'--c:'+t.color},h('div',{class:'sname'},h('b',{},t.name),h('span',{class:'small'},ENGINES[st.engine].short)),m,s,h('div',{class:'sfader'},fader,bar),out))}
  b.prepend(h('div',{class:'strip master'},h('div',{class:'sname'},h('b',{},'Summe'),h('span',{class:'small'},'vor Limiter')),h('div',{}),h('div',{}),h('div',{class:'sfader'},h('div',{class:'meter'},h('i',{id:'mt_master'}),h('b',{id:'mp_master'}))),h('output',{class:'mono',id:'mo_master'},'')));
  b.append(h('p',{class:'note'},'Regler: −60 … +12 dB, Doppeltipp = 0 dB. Anzeige: grün = Spitze unter −6 dBFS, gelb = bis −1 dBFS, rot = darüber (Übersteuerung; der Limiter fängt es ab, aber es verzerrt).'));
  const res=h('p',{class:'note',id:'amres'},automixMsg);
  b.append(h('div',{class:'sec'},h('h3',{},'Automix'),h('p',{class:'note'},'Misst die Lautheit jeder Spur in der aktuellen Szene und stellt ein ausgewogenes Verhältnis ein: Drums als Bezug, Bass knapp darunter, Lead darüber, Akkorde dahinter. Mit „↶" zurück.'),
    h('div',{class:'row'},h('button',{class:'cta',onclick:async e=>{e.target.disabled=true;res.textContent='Messe …';try{automixMsg=await automix()}catch(err){automixMsg='Automix fehlgeschlagen: '+err.message}e.target.disabled=false;openMixer()}},'Automix'),
      h('button',{class:'opt',onclick:()=>{snapshot();for(const t of TRACKS){P.tracks[t.id].mute=false;P.tracks[t.id].solo=false}applyAllGains();persist();openMixer()}},'Alle an')),res));
})}
/* fader law: 0..1 -> -60..+12 dB, linear in dB (0 dB at 5/6); 0 = off */
const volToFader=v=>v<=0.001?0:clamp((20*Math.log10(v)+60)/72,0,1);
const faderToVol=x=>x<=0?0:Math.pow(10,(x*72-60)/20);
const peakHold={};
function drawMeters(){const now=performance.now();
  const one=(key,an)=>{const el=document.getElementById('mt_'+key),pk=document.getElementById('mp_'+key);if(!an||!el)return;const d=new Float32Array(an.fftSize);an.getFloatTimeDomainData(d);let p=0;for(const x of d){const a=Math.abs(x);if(a>p)p=a}
    const db=20*Math.log10(p+1e-9);el.style.width=clamp((db+60)/60*100,0,100)+'%';el.className=db>-1?'red':db>-6?'yellow':'';
    const hp=peakHold[key]||{db:-99,t:0};if(db>=hp.db||now-hp.t>1500){hp.db=db;hp.t=now}peakHold[key]=hp;if(pk){pk.style.left=clamp((hp.db+60)/60*100,0,100)+'%';pk.className=hp.db>-1?'red':hp.db>-6?'yellow':''}
    if(key==='master'){const o=document.getElementById('mo_master');if(o)o.textContent=hp.db<-80?'':hp.db.toFixed(1)+' dBFS'}};
  for(const t of TRACKS)one(t.id,meter[t.id]);one('master',meter.master)}
async function automix(){
  initAudio();await Promise.all(TRACKS.map(t=>ensureEngine(t.id)));snapshot();
  const meas={};
  for(const t of TRACKS){const id=t.id,sc=scOf(id);if(!hasNotes(id,sc)||!inst[id].eng)continue;
    let buf=FZ[id]&&FZ[id].buf&&FZ[id].sig===fzSig(id,sc)?FZ[id].buf:await fzRender(id,sc);meas[id]=await loudness(buf)}
  const ids=Object.keys(meas);if(!ids.length)throw Error('keine Noten in dieser Szene');
  const want={};for(const id of ids)want[id]=MIX_TARGET[typeOf(id)]-meas[id];const top=Math.max(...ids.map(id=>want[id]));
  for(const id of ids){P.tracks[id].vol=+Math.pow(10,(want[id]-top)/20).toFixed(4);P.tracks[id].mute=false;P.tracks[id].solo=false}
  applyAllGains();persist();
  return 'Gesetzt: '+ids.map(id=>TR[id].name+' '+dbStr(P.tracks[id].vol)).join(' · ');
}

function openTempo(){openSheet('Tempo',b=>{
  const val=h('div',{class:'brand big mono',style:'font-family:var(--mono)'},Math.round(P.bpm));
  const sl=h('input',{type:'range',min:60,max:180,value:P.bpm,id:'bpmSlider'});sl.addEventListener('input',()=>{P.bpm=+sl.value;val.textContent=sl.value;persist();renderTop()});
  const taps=[];b.append(val,sl,h('div',{class:'row'},
    h('button',{class:'opt',onclick:()=>{P.bpm=clamp(P.bpm-1,60,180);sl.value=P.bpm;val.textContent=P.bpm;persist();renderTop()}},'−1'),
    h('button',{class:'opt',onclick:()=>{P.bpm=clamp(P.bpm+1,60,180);sl.value=P.bpm;val.textContent=P.bpm;persist();renderTop()}},'+1'),
    h('button',{class:'opt',onclick:()=>{const n=performance.now();taps.push(n);while(taps.length>5)taps.shift();if(taps.length>1){const d=(taps[taps.length-1]-taps[0])/(taps.length-1);if(d>250&&d<1500){P.bpm=Math.round(60000/d);sl.value=P.bpm;val.textContent=P.bpm;persist();renderTop()}}}},'Tippen (Tap)')));
  const sw=h('input',{type:'range',min:0,max:60,value:Math.round(P.swing*100),id:'swing'});const so=h('output',{},Math.round(P.swing*100)+' %');sw.addEventListener('input',()=>{P.swing=sw.value/100;so.textContent=sw.value+' %';persist()});
  b.append(h('div',{class:'sec knob'},h('label',{for:'swing'},'Swing',so),sw));
  const lr=h('div',{class:'row'});for(const [k,l] of LAUNCH)lr.append(h('button',{class:'opt'+((P.launch||'bar')===k?' on':''),onclick:()=>{P.launch=k;persist();openTempo()}},l));
  b.append(h('div',{class:'sec'},h('h3',{},'Szenenwechsel beim Abspielen'),lr,h('p',{class:'note'},'Wann eine angetippte Szene übernimmt: zum nächsten Takt (wie Ableton), erst am Ende des Loops, oder sofort.')))})}
function openKey(){openSheet('Tonart',b=>{
  const keys=h('div',{class:'row'});NOTE.forEach((n,k)=>keys.append(h('button',{class:'opt'+(P.key===k?' on':''),onclick:()=>{snapshot();let d=((k-P.key)%12+12)%12;if(d>6)d-=12;transposeAll(d);persist();openKey();renderTop()}},n)));
  const sc=h('div',{class:'row'});for(const [k,v] of Object.entries(SCALES))sc.append(h('button',{class:'opt'+(P.scale===k?' on':''),onclick:()=>{snapshot();P.scale=k;snapAll();persist();openKey();renderTop()}},v.name));
  b.append(h('div',{class:'sec'},h('h3',{},'Grundton'),keys),h('div',{class:'sec'},h('h3',{},'Skala'),sc),h('p',{class:'note'},'Vorhandene Noten wandern mit: beim Grundton werden sie verschoben, bei der Skala auf den nächsten passenden Ton gelegt. Akkorde werden neu gebaut.'))})}
function transposeAll(d){P.key=((P.key+d)%12+12)%12;for(const id of SCENE_IDS){const sc=P.scenes[id];if(!sc)continue;for(const t of TRACKS){if(t.role==='mono')sc[t.id].forEach(n=>n.p+=d);if(t.role==='chords')revoiceChords(sc,t.id)}}}
function snapAll(){for(const id of SCENE_IDS){const sc=P.scenes[id];if(!sc)continue;for(const t of TRACKS){if(t.role==='mono')sc[t.id].forEach(n=>{if(!inScale(n.p,P.key,P.scale)){for(const d of [-1,1,-2,2])if(inScale(n.p+d,P.key,P.scale)){n.p+=d;break}}});if(t.role==='chords')revoiceChords(sc,t.id)}}}

function openMenu(){openSheet('Projekt & Export',b=>{
  document.querySelector('.sheetbox').style.setProperty('--tc','var(--lead)');
  const name=h('input',{type:'text',value:P.name,id:'pname'});name.addEventListener('change',()=>{P.name=name.value.trim()||'Loop';persist()});
  let len=P.exportLen||'scene2';
  const lens=[['scene1','Szene ×1'],['scene2','Szene ×2'],['scene4','Szene ×4'],['song','Song']];
  const lenRow=h('div',{class:'row'});const fillLen=()=>{lenRow.innerHTML='';for(const [k,l] of lens)lenRow.append(h('button',{class:'opt'+(len===k?' on':''),onclick:()=>{len=k;P.exportLen=k;persist();fillLen();info()}},l))};fillLen();
  const fade=h('input',{type:'checkbox',id:'fade'});fade.checked=P.exportFade!==false;fade.addEventListener('change',()=>{P.exportFade=fade.checked;persist()});
  const prog=h('div',{class:'progress'},h('i',{}));const status=h('p',{class:'note'});const result=h('div',{class:'row'});
  const info=()=>{const segs=arrangement(len);const bars=segs.reduce((a,s)=>a+(s.s?P.scenes[s.s].bars:maxLen()/16)*s.n,0);status.textContent=bars+' Takte · '+(bars*4*60/P.bpm).toFixed(1)+' s'};info();
  const progress=(f,msg)=>{prog.firstChild.style.width=Math.round(f*100)+'%';if(msg)status.textContent=msg};
  const run=async(btn,withStems)=>{btn.disabled=true;result.innerHTML='';try{
      if(playing)stop();initAudio();await ac.resume();await Promise.all(TRACKS.map(t=>ensureEngine(t.id)));
      const res=await exportAudio({P,segs:arrangement(len),inst,TRACKS,eventsForStep,fade:fade.checked&&!withStems,stems:withStems,audible,progress});
      const base=(P.name||'loopette').replace(/[^\wäöüÄÖÜß-]+/g,'_');
      progress(.8,'MP3 wird kodiert …');const mp3=await encodeMp3(res.mix,256);
      if(!withStems){offerFile(result,new File([mp3],base+'.mp3',{type:'audio/mpeg'}));status.textContent='Fertig: MP3 256 kbit/s · '+res.mix.duration.toFixed(1)+' s · '+(mp3.size/1e6).toFixed(1)+' MB · Spitze '+res.peakDb.toFixed(1)+' dBFS';progress(1);return}
      const files=[{name:base+'/'+base+'_Mix.mp3',blob:mp3}];let k=0;
      for(const st of res.stems){progress(.8+.2*(k/res.stems.length),'FLAC: '+st.name+' …');const fl=await encodeFlac(st.buffer,24,f=>progress(.8+.2*((k+f)/res.stems.length)));files.push({name:base+'/Spuren/'+String(k+1).padStart(2,'0')+'_'+st.name.replace(/[^\wäöüÄÖÜß-]+/g,'_')+'.flac',blob:fl});k++}
      const zip=await makeZip(files);offerFile(result,new File([zip],base+'.zip',{type:'application/zip'}));
      status.textContent='Fertig: ZIP mit Mix (MP3) und '+res.stems.length+' Spuren (FLAC 24 bit, je exakt '+res.bars+' Takte = '+res.total.toFixed(2)+' s) · '+(zip.size/1e6).toFixed(1)+' MB';progress(1)}
    catch(e){console.error(e);status.textContent='Export fehlgeschlagen: '+e.message}btn.disabled=false};
  b.append(h('div',{class:'sec'},h('h3',{},'Export'),lenRow,h('label',{class:'row small',for:'fade'},fade,'Am Ende ausblenden'),h('div',{class:'row'},h('button',{class:'cta',onclick:e=>run(e.target,false)},'MP3 exportieren'),h('button',{class:'cta alt',onclick:e=>run(e.target,true)},'MP3 + Spuren (ZIP)')),h('p',{class:'note'},'Mit Spuren: jede Spur als FLAC, alle exakt gleich lang und taktgenau ab Takt 1; Hall- und Ausklang-Reste sind an den Anfang gelegt, so laufen die Spuren als Loop nahtlos. Ohne Ausblenden.'),h('div',{style:'height:8px'}),prog,status,result));
  const songBox=h('div',{class:'sec'});const fillSong=()=>{songBox.innerHTML='';songBox.append(h('h3',{},'Song (Szenen nacheinander)'));
    songBox.append(h('div',{class:'row'},h('button',{class:'opt'+(P.song.on?' on':''),onclick:()=>{P.song.on=!P.song.on;persist();fillSong()}},P.song.on?'Song-Modus an':'Song-Modus aus')));
    const list=h('div',{class:'row'});P.song.list.forEach((it,i)=>list.append(h('button',{class:'opt',title:'Tippen: Wiederholungen ändern',onclick:()=>{it.n=it.n>=8?1:it.n*2;persist();fillSong();info()}},it.s+' ×'+it.n),h('button',{class:'opt',onclick:()=>{P.song.list.splice(i,1);persist();fillSong();info()},'aria-label':'entfernen'},'×')));songBox.append(list);
    const add=h('div',{class:'row'},h('span',{class:'small'},'Anhängen:'));SCENE_IDS.filter(s=>P.scenes[s]).forEach(s=>add.append(h('button',{class:'opt',onclick:()=>{P.song.list.push({s,n:2});persist();fillSong();info()}},s)));songBox.append(add)};fillSong();b.append(songBox);
  const projs=load('loopkiste.projects')||{};
  const plist=h('div',{class:'row'});for(const k of Object.keys(projs))plist.append(h('button',{class:'opt',onclick:()=>{snapshot();P=migrate(deep(projs[k]));loadProject()}},k));
  const code=h('textarea',{id:'projcode',placeholder:'Projekt-Code hier einfügen'});
  b.append(h('div',{class:'sec'},h('h3',{},'Projekt'),name,h('div',{style:'height:6px'}),h('div',{class:'row'},
    h('button',{class:'opt',onclick:()=>{projs[P.name]=deep(P);try{localStorage.setItem('loopkiste.projects',JSON.stringify(projs))}catch(_e){}toast('Gespeichert: '+P.name);openMenu()}},'Speichern'),
    h('button',{class:'opt',onclick:()=>{snapshot();const keep=deep(P.tracks);P=emptyProject();for(const k of Object.keys(P.tracks))P.tracks[k]={...P.tracks[k],engine:keep[k].engine,patch:keep[k].patch,preset:keep[k].preset,macros:keep[k].macros,vol:keep[k].vol};for(const t of Object.values(P.tracks)){t.mute=false;t.solo=false}loadProject()}},'Neu (leer)'),
    h('button',{class:'opt',onclick:()=>{snapshot();P=demoProject();loadProject()}},'Demo laden'),
    h('button',{class:'opt',onclick:async()=>{const t=JSON.stringify(P);try{await navigator.clipboard.writeText(t);toast('Projekt-Code kopiert')}catch(_e){code.value=t;code.select();toast('Text markiert – bitte kopieren')}}},'Code kopieren'),
    h('button',{class:'opt',onclick:()=>{try{const o=JSON.parse(code.value.trim());if(!o.scenes||!o.tracks)throw Error('kein Loopette-Projekt');snapshot();P=migrate(o);loadProject();toast('Projekt geladen')}catch(e){toast('Code nicht lesbar: '+e.message)}}},'Code laden')),
    Object.keys(projs).length?h('div',{},h('div',{class:'small',style:'margin:8px 0 4px'},'Gespeicherte Projekte:'),plist):null,h('div',{style:'height:6px'}),code));
})}
function arrangement(len){if(len==='song'&&P.song.list.length)return P.song.list.filter(it=>P.scenes[it.s]).map(it=>({s:it.s,n:it.n}));const n=len==='scene1'?1:len==='scene4'?4:2;return [{s:null,n}]}  // s:null = the current combination of per-track scenes
function offerFile(box,file){const url=URL.createObjectURL(file);box.append(h('a',{class:'cta alt',href:url,download:file.name,style:'display:inline-grid;place-items:center;text-decoration:none'},'Speichern: '+file.name));
  if(navigator.canShare&&navigator.canShare({files:[file]}))box.append(h('button',{class:'cta',onclick:()=>navigator.share({files:[file],title:P.name}).catch(()=>{})},'Teilen …'))}
function loadProject(){rebuildTracks();if(!TR[sel])sel=TRACKS[0].id;P.scenes.A=P.scenes.A||newScene(1);for(const t of TRACKS)scOf(t.id);for(const k of Object.keys(inst))if(!P.tracks[k])dropTrackRuntime(k);for(const t of TRACKS){ensureTrackNodes(t.id);ensureEngine(t.id);applyTrackGain(t.id)}syncPatches();sceneChanged();persist();closeSheet()}

/* ───────────── ideas (helpers, never automatic) ───────────── */
function doIdea(id){snapshot();const sc=scene();
  const ty=typeOf(id);
  if(ty==='drums'){const d=ideaDrums(sc.bars);const lanes=P.tracks[id].lanes||(P.tracks[id].lanes=[]);const out={};
    for(const [k,a] of Object.entries(d)){const slot=lanes.find(x=>slotLane(x)===k)||k+'@909';if(!lanes.includes(slot))lanes.push(slot);out[slot]=a}sc[id]=out;
    const r=inst[id];if(r&&r.eng)for(const k of Object.keys(out))r.eng.prepare(slotCard(k))}
  if(ty==='chords'){const prog=ideaChords(P.scale,sc.bars);sc[id]=[];prog.forEach(([s,d])=>placeChord(P,sc,s,d,0,id));recalcHold(P,sc,id)}
  if(ty==='bass')sc[id]=ideaBass(P,sc,chordAt);
  if(ty==='lead')sc[id]=ideaLead(P,sc,chordAt,windowRows(id));
  markEdit(id);persist();renderEditor();toast('Vorschlag gesetzt – „↶" nimmt ihn zurück')}

/* ───────────── bars ───────────── */
function setBars(nb){const sc=scene();nb=clamp(nb,1,MAX_BARS);if(nb===sc.bars)return;snapshot();const L=nb*16,oldL=sc.bars*16;
  const dr=TRACKS.filter(t=>t.role==='drums').map(t=>t.id),sy=TRACKS.filter(t=>t.role!=='drums').map(t=>t.id);
  if(nb>sc.bars){for(const d of dr)for(const k in sc[d]){const a=sc[d][k];const old=a.slice(0,oldL);while(a.length<L)a.push(old[a.length%oldL]||0)}
    for(const id of sy){const src=sc[id].slice();for(let off=oldL;off<L;off+=oldL)for(const n of src)if(n.s+off<L)sc[id].push({...n,s:n.s+off})}}
  else{for(const d of dr)for(const k in sc[d])sc[d][k].length=L;for(const id of sy){sc[id]=sc[id].filter(n=>n.s<L);sc[id].forEach(n=>n.l=Math.min(n.l,L-n.s))}}
  sc.bars=nb;for(const c of chordTracks())recalcHold(P,sc,c);TRACKS.forEach(t=>markEdit(t.id));persist();renderScenes();renderEditor()}

/* ───────────── misc ───────────── */
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2400)}
$('#play').addEventListener('click',()=>playing?stop():start());
$('#bpmBtn').addEventListener('click',openTempo);$('#keyBtn').addEventListener('click',openKey);$('#menuBtn').addEventListener('click',openMenu);$('#mixBtn').addEventListener('click',openMixer);
$('#undoBtn').addEventListener('click',undo);
$('#barsMinus').addEventListener('click',()=>setBars(scene().bars-1));$('#barsPlus').addEventListener('click',()=>setBars(scene().bars+1));
$('#sceneCopy').addEventListener('click',()=>{const free=SCENE_IDS.find(s=>!P.scenes[s]);if(!free)return toast('Alle vier Szenen belegt');snapshot();const ns={bars:scene().bars};for(const t of TRACKS)ns[t.id]=deep(scOf(t.id)[t.id]);P.scenes[free]=ns;chooseScene(free);toast('Szene kopiert')});
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea'))return;if(e.code==='Space'){e.preventDefault();playing?stop():start()}if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo()}});
$('#bootBtn').addEventListener('click',async()=>{initAudio();await ac.resume();$('#boot').hidden=true;await Promise.all(TRACKS.map(t=>ensureEngine(t.id)));freezeSoon()});
setupFx();renderAll();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
window.__lk={get P(){return P},inst,FZ,start,stop,get ac(){return ac},ensureEngine,arrangement,exportAudio,eventsForStep,get TRACKS(){return TRACKS},automix,setBars,fzWork,addTrack,removeTrack,chooseScene};
let rsT=null;window.addEventListener('resize',()=>{if(wideCells!=null)return;clearTimeout(rsT);rsT=setTimeout(()=>renderEditor(),150)});
