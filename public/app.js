// Loopkiste — mobile loop studio for the Nocturne instruments (DollyDrumz, PuSS-30, Sonique 4x20, Pierrette 101).
import {NOTE,SCALES,midiName,keyName,inScale,scaleNotes,chordInfo,voiceChord} from './music.js';
import {exportAudio,encodeWav,encodeMp3,loudness} from './export.js';
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
};
export const TRACKS=[
  {id:'drums',name:'Drums',color:'var(--drums)',choices:['dolly'],role:'drums'},
  {id:'bass',name:'Bass',color:'var(--bass)',choices:['pierrette','puss','sonique'],role:'mono',range:[24,60],oct:2},
  {id:'chords',name:'Akkorde',color:'var(--chords)',choices:['sonique','puss','pierrette'],role:'chords',range:[40,84],oct:4},
  {id:'lead',name:'Lead',color:'var(--lead)',choices:['puss','sonique','pierrette'],role:'mono',range:[48,96],oct:4},
];
const TR=Object.fromEntries(TRACKS.map(t=>[t.id,t]));
const SCENE_IDS=['A','B','C','D'];
const MAX_BARS=8;
const PRESET_PREFS={bass:{pierrette:['ITALO BASS ROUND','ITALO BASS SAW','Moroder Pulse','#BASS'],puss:['DEEP 30 BASS','#BASS'],sonique:['TUBEBAS','#BASS']},
  chords:{sonique:['VOXPAD','PIANO1','#PAD','#STRINGS','#KEYS'],puss:['TRIPLE BBD STRINGS','#STRINGS'],pierrette:['Italo Strings','#Pad']},
  lead:{puss:['BRASS BUS 87','#REED','#BRASS'],sonique:['SUPERLEAD','#LEAD'],pierrette:['Italo Runner','Sunset Hero','#Lead']},drums:{dolly:[]}};
// automix target balance in LU relative to the drums (dance/pop convention: kick+bass carry, chords sit behind, lead on top of chords)
const MIX_TARGET={drums:0,bass:-1.5,chords:-7,lead:-3.5};

/* ───────────── project state ───────────── */
function newScene(bars=2){return {bars,drums:{},bass:[],chords:[],lead:[]}}
function demoProject(){
  const P={v:2,name:'Erster Loop',bpm:112,swing:0.1,key:2,scale:'dorian',cur:'A',song:{on:false,list:[{s:'A',n:2}]},
    tracks:{drums:{engine:'dolly',vol:.9,mute:false,solo:false,preset:null,patch:null},bass:{engine:'pierrette',vol:.8,mute:false,solo:false,view:'step',oct:2},
      chords:{engine:'sonique',vol:.62,mute:false,solo:false,view:'step',oct:4,hold:true,seventh:true,voicing:'lead',bassOct:false},lead:{engine:'puss',vol:.7,mute:false,solo:false,view:'step',oct:4}},
    scenes:{A:newScene(2),B:null,C:null,D:null}};
  const A=P.scenes.A,L=32,lane=(steps,v=1)=>{const a=new Array(L).fill(0);steps.forEach(s=>a[s]=v);return a};
  A.drums={bd:lane([0,4,8,12,16,20,24,28]),cp:lane([4,12,20,28]),ch:lane([1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31]),oh:lane([2,6,10,14,18,22,26,30])};
  A.drums.bd[0]=2;A.drums.bd[16]=2;
  A.bass=[2,6,10,14].map(s=>({s,p:38,l:1,v:.85})).concat([18,22,26,30].map(s=>({s,p:43,l:1,v:.85})));A.bass.push({s:15,p:50,l:1,v:.7});
  placeChord(P,A,0,0);placeChord(P,A,6,0);placeChord(P,A,16,3);placeChord(P,A,22,3);recalcHold(P,A);
  const mel=[[0,69,2],[3,72,1],[4,74,3],[8,72,1],[10,69,2],[14,67,2],[16,71,2],[19,74,1],[20,76,3],[24,74,1],[26,71,2],[30,69,2]];
  A.lead=mel.map(([s,p,l])=>({s,p,l,v:.85}));
  return P;
}
function migrate(P){if(!P)return P;for(const t of Object.values(P.tracks))if(t.solo==null)t.solo=false;const c=P.tracks.chords;if(!c.voicing)c.voicing='lead';P.v=2;return P}
let P=migrate(load('loopkiste.current'))||demoProject();
let sel='lead',undoStack=[];
function load(k){try{const t=localStorage.getItem(k);return t?JSON.parse(t):null}catch(_e){return null}}
function persist(){clearTimeout(persist.t);persist.t=setTimeout(()=>{try{localStorage.setItem('loopkiste.current',JSON.stringify(P))}catch(_e){}},400);freezeSoon()}
function snapshot(){undoStack.push(JSON.stringify(P));if(undoStack.length>60)undoStack.shift()}
function undo(){const s=undoStack.pop();if(!s)return toast('Nichts rückgängig zu machen');const old=P;P=JSON.parse(s);for(const t of TRACKS){if(old.tracks[t.id].engine!==P.tracks[t.id].engine)ensureEngine(t.id);applyTrackGain(t.id)}syncPatches();persist();renderAll()}
function scene(){return P.scenes[P.cur]}
function sceneLen(sc){return (sc||scene()).bars*16}

/* ───────────── chords & voicings ───────────── */
function chordAt(P,sc,step){const cs=sc.chords.filter(n=>n.c!=null&&n.s<=step);if(!cs.length)return null;const s=Math.max(...cs.map(n=>n.s));return cs.filter(n=>n.s===s)}
export function chordNotes(P,deg,inv=0,prev=null){
  const t=P.tracks.chords,info=chordInfo(deg,P.key,P.scale,!!t.seventh),center=12*((t.oct??4)+1);let notes;
  const mode=t.voicing||'lead';
  if(mode==='root'){const r=center-6+((info.root-(center-6))%12+12)%12;notes=info.tones.map(x=>r+x)}           // Grundstellung: folgt dem Grundton auf und ab
  else{notes=voiceChord(info,center,mode==='lead'?prev:null);if(mode==='wide'&&notes.length>=3){notes=[...notes].sort((a,b)=>a-b);notes[notes.length-2]-=12}} // weit = Drop-2
  notes=[...notes].sort((a,b)=>a-b);
  for(let k=0;k<inv;k++)notes.push(notes.shift()+12);for(let k=0;k<-inv;k++)notes.unshift(notes.pop()-12);
  notes.sort((a,b)=>a-b);
  if(t.bassOct){const lo=notes[0];const root=lo-((lo-info.root)%12+12)%12;notes.unshift(root-12)}
  return notes;
}
export function placeChord(P,sc,step,deg,inv=0){
  sc.chords=sc.chords.filter(n=>n.s!==step);
  const prevStep=Math.max(-1,...sc.chords.filter(n=>n.s<step&&n.c!=null).map(n=>n.s));
  const prev=prevStep>=0?sc.chords.filter(n=>n.s===prevStep&&!n.bo).map(n=>n.p):null;
  const bo=!!P.tracks.chords.bassOct;chordNotes(P,deg,inv,prev).forEach((p,i)=>sc.chords.push({s:step,p,l:2,v:.8,c:deg,inv,bo:bo&&i===0?1:undefined}));
}
export function recalcHold(P,sc){
  if(!P.tracks.chords.hold)return;const starts=[...new Set(sc.chords.map(n=>n.s))].sort((a,b)=>a-b);const L=sceneLen(sc);
  for(const n of sc.chords){const nx=starts.find(s=>s>n.s);n.l=(nx??L)-n.s}
}
function revoiceChords(sc){const steps=[...new Set(sc.chords.filter(n=>n.c!=null).map(n=>n.s))].sort((a,b)=>a-b);
  const info=steps.map(s=>{const n=sc.chords.find(x=>x.s===s);return {s,c:n.c,inv:n.inv||0,l:n.l}});
  sc.chords=sc.chords.filter(n=>n.c==null);info.forEach(i=>{placeChord(P,sc,i.s,i.c,i.inv);sc.chords.filter(n=>n.s===i.s).forEach(n=>n.l=i.l)});recalcHold(P,sc)}

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
  fxNodes={filt,tape,tapeGain,echoIn,echo,efb};
  for(const t of TRACKS){const g=ac.createGain();g.connect(bus);trackGain[t.id]=g;const an=ac.createAnalyser();an.fftSize=1024;g.connect(an);meter[t.id]=an;applyTrackGain(t.id)}
}
const anySolo=()=>TRACKS.some(t=>P.tracks[t.id].solo);
const audible=id=>{const t=P.tracks[id];return !t.mute&&(!anySolo()||t.solo)};
function applyTrackGain(id){const g=trackGain[id];if(!g||!ac)return;g.gain.setTargetAtTime(audible(id)?P.tracks[id].vol:0,ac.currentTime,.015)}
function applyAllGains(){TRACKS.forEach(t=>applyTrackGain(t.id))}
async function ensureEngine(id){
  const t=P.tracks[id];const want=t.engine;const cur=inst[id];
  if(cur&&cur.engine===want)return cur.ready;
  if(cur){try{cur.eng&&cur.eng.dispose()}catch(_e){}}
  const rec={engine:want,eng:null};inst[id]=rec;fzDrop(id);
  rec.ready=(async()=>{try{const mod=await ENGINES[want].load();const eng=await mod.default(ac,{out:trackGain[id]});await eng.ready;if(inst[id]!==rec){eng.dispose();return}
    rec.eng=eng;
    if(t.patch){try{eng.setPatch(t.patch)}catch(e){console.warn(e)}}
    else{const pid=pickPreset(eng,id,want);if(pid!=null){eng.loadPreset(pid);t.preset=pid;t.patch=eng.getPatch()}}
    if(t.macros)for(const [k,v] of Object.entries(t.macros))eng.setMacro(k,v);
    renderTracks();if(sel===id)renderEditor();freezeSoon();
  }catch(e){console.error(e);toast(ENGINES[want].name+' konnte nicht geladen werden');}})();
  return rec.ready;
}
function pickPreset(eng,tid,engId){const list=eng.presets();if(!list.length)return null;const prefs=(PRESET_PREFS[tid]||{})[engId]||[];
  for(const p of prefs){if(p.startsWith('#')){const c=p.slice(1).toUpperCase();const hit=list.find(x=>String(x.cat||'').toUpperCase()===c);if(hit)return hit.id}else{const hit=list.find(x=>x.name.toUpperCase().includes(p.toUpperCase()));if(hit)return hit.id}}
  return list[0].id}
function syncPatches(){for(const t of TRACKS){const r=inst[t.id];if(r&&r.eng&&P.tracks[t.id].patch){try{r.eng.setPatch(P.tracks[t.id].patch)}catch(_e){}}}}

/* ───────────── freeze: each track's loop is rendered offline and played back as audio ─────────────
   Live synthesis of four instruments at once overloads a phone's audio thread. As in the Nocturne
   Workbench, a track whose loop is rendered (same engine, same DSP) plays from the buffer; after an
   edit it plays live until the new render is ready. */
const FZ={};const fzCache=new Map();let fzBusy=false,fzTimer=null;const lastEdit={};
function fzSig(id,sc=scene()){const t=P.tracks[id];return JSON.stringify([t.engine,t.patch,t.macros||null,id==='drums'?sc.drums:sc[id],sc.bars,Math.round(P.bpm*100),P.swing,ac?ac.sampleRate:0])}
function freezeSoon(){clearTimeout(fzTimer);fzTimer=setTimeout(fzWork,650)}
function fzDrop(id){const f=FZ[id];if(f&&f.src){try{f.src.stop()}catch(_e){}}FZ[id]=null}
async function fzWork(){
  if(fzBusy||!ac)return;
  const sc=scene();
  for(const t of TRACKS){const id=t.id,r=inst[id];if(!r||!r.eng)continue;const sig=fzSig(id,sc);
    if(FZ[id]&&FZ[id].sig===sig)continue;
    if(FZ[id]&&FZ[id].sig!==sig)fzRelease(id);
    const cached=fzCache.get(sig);if(cached){FZ[id]={sig,buf:cached,src:null,from:0};fzEngage(id);continue}
    if(Date.now()-(lastEdit[id]||0)<600){freezeSoon();return}
    fzBusy=true;try{const t0=performance.now();const buf=await fzRender(id,sc);console.info('freeze '+id+' '+Math.round(performance.now()-t0)+' ms');if(fzSig(id,sc)===sig&&scene()===sc){fzCache.set(sig,buf);if(fzCache.size>24)fzCache.delete(fzCache.keys().next().value);FZ[id]={sig,buf,src:null,from:0};fzEngage(id)}}
    catch(e){console.warn('freeze',id,e)}finally{fzBusy=false}
    freezeSoon();return}
  renderTracks();
}
async function fzRender(id,sc){const sd=stepDur(),L=sceneLen(sc),sr=ac.sampleRate,loopSec=L*sd;const ev=[];
  const hasNotes=id==='drums'?Object.values(sc.drums).some(a=>a.some(v=>v)):sc[id].length>0;
  const n=Math.round(loopSec*sr);if(!hasNotes)return new AudioBuffer({numberOfChannels:2,length:n,sampleRate:sr});
  for(let rep=0;rep<2;rep++)for(let i=0;i<L;i++)for(const e of eventsForStep(P,sc,i,(rep*L+i)*sd,sd,P.swing,x=>x===id))ev.push(id==='drums'?{t:e.t,lane:e.lane,vel:e.vel}:{t:e.t,midi:e.midi,vel:e.vel,dur:e.dur});
  const stem=await inst[id].eng.renderStem({sampleRate:sr,durationSec:2*loopSec+.05,events:ev});
  // second pass = steady state: tails of the previous pass are already inside, so the loop is seamless
  const out=new AudioBuffer({numberOfChannels:2,length:n,sampleRate:sr});const a=Math.round(loopSec*sr);
  for(let c=0;c<2;c++){const src=stem.getChannelData(Math.min(c,stem.numberOfChannels-1));out.copyToChannel(src.subarray(a,a+n),c)}
  return out}
function fzEngage(id){const f=FZ[id];if(!f||!playing||f.src||stutter)return;const t=nextT;const sd=stepDur();const off=((t-loopT0)%(sceneLen()*sd)+sceneLen()*sd)%(sceneLen()*sd);fzStart(id,t,off)}
function fzStart(id,t,offset){const f=FZ[id];if(!f)return;const loopSec=sceneLen()*stepDur();const s=ac.createBufferSource();s.buffer=f.buf;s.connect(trackGain[id]);s.start(t,offset);s.stop(t+loopSec-offset);f.src=s;f.from=t;f.until=t+loopSec-offset;s.onended=()=>{if(f.src===s)f.src=null}}
function fzRelease(id){const f=FZ[id];if(!f)return;if(f.src){try{f.src.stop(playing?nextT:0)}catch(_e){}}f.src=null;FZ[id]=null;f.cut=nextT}
const isFrozenAt=(id,t)=>{const f=FZ[id];return !!(f&&f.src&&t>=f.from-1e-6)};
function markEdit(id){lastEdit[id]=Date.now();const f=FZ[id];if(f){const cut=playing?nextT:0;if(f.src){try{f.src.stop(cut)}catch(_e){}}FZ[id]=null}}

/* ───────────── sequencer ───────────── */
let playing=false,timer=null,nextT=0,stepIdx=0,loopT0=0,queued=null,songIdx=0,songRep=0;
let stutter=null;
const stepDur=()=>60/P.bpm/4;
const visQ=[];
function start(){initAudio();ac.resume();if(playing)return;playing=true;document.body.classList.add('playing');
  stepIdx=0;nextT=ac.currentTime+.08;loopT0=nextT;songIdx=0;songRep=0;if(P.song.on&&P.song.list.length&&P.scenes[P.song.list[0].s]){P.cur=P.song.list[0].s;renderScenes()}
  timer=setInterval(tick,25);tick();requestAnimationFrame(draw);freezeSoon()}
function stop(){playing=false;document.body.classList.remove('playing');clearInterval(timer);for(const t of TRACKS){const r=inst[t.id];r&&r.eng&&r.eng.allOff&&r.eng.allOff();const f=FZ[t.id];if(f&&f.src){try{f.src.stop()}catch(_e){}f.src=null}}visQ.length=0;drawPlayhead(-1)}
function tick(){const ahead=ac.currentTime+.15;while(nextT<ahead){scheduleStep(stepIdx,nextT);advance()}}
function sceneChanged(){for(const t of TRACKS){const f=FZ[t.id];if(f&&f.src){try{f.src.stop(nextT)}catch(_e){}}FZ[t.id]=null}freezeSoon();fzWork()}
function advance(){nextT+=stepDur();stepIdx++;const L=sceneLen();
  if(queued&&stepIdx%16===0){P.cur=queued;queued=null;stepIdx=stepIdx%sceneLen();loopT0=nextT-stepIdx*stepDur();sceneChanged();renderScenes();renderEditor();return}
  if(stepIdx>=L){stepIdx=0;loopT0=nextT;
    if(P.song.on&&P.song.list.length){songRep++;const it=P.song.list[songIdx%P.song.list.length];if(songRep>=it.n){songRep=0;songIdx=(songIdx+1)%P.song.list.length;const nx=P.song.list[songIdx].s;if(P.scenes[nx]&&nx!==P.cur){P.cur=nx;sceneChanged();renderScenes();renderEditor()}}}}}
export function eventsForStep(P,sc,i,t,sd,swing,trackFilter){
  const out=[];const s=i;const tt=t+((s%2)?swing*sd*.5:0);
  for(const tdef of TRACKS){const id=tdef.id;if(trackFilter&&!trackFilter(id))continue;
    if(id==='drums'){for(const [lane,arr] of Object.entries(sc.drums||{})){const v=arr[s];if(v)out.push({track:id,t:tt,lane,vel:v===2?1:.72})}}
    else for(const n of sc[id]||[])if(n.s===s)out.push({track:id,t:tt,midi:n.p,vel:n.v??.8,dur:Math.max(.02,n.l*sd-.006)})}
  return out;
}
function scheduleStep(i,t){
  const sc=scene(),sd=stepDur(),L=sceneLen(sc);let s=i;if(stutter){s=stutter.from+((i-stutter.base)%stutter.len+stutter.len)%stutter.len}
  // frozen tracks: a new buffer pass at every loop start
  if(!stutter&&i===0)for(const tdef of TRACKS){const f=FZ[tdef.id];if(f&&(!f.src||f.until<=t+1e-4)){if(f.src&&f.until>t+1e-4)continue;fzStart(tdef.id,t,0)}}
  if(stutter&&(i-stutter.base)%stutter.len===0)for(const tdef of TRACKS){const f=FZ[tdef.id];if(!f||!f.buf)continue;const g=ac.createBufferSource();g.buffer=f.buf;g.connect(trackGain[tdef.id]);g.start(t,(s%L)*sd,stutter.len*sd);visQ.push({t,track:tdef.id})}
  const ev=eventsForStep(P,sc,s%L,t,sd,P.swing,id=>!(FZ[id]&&FZ[id].buf&&(stutter||isFrozenAt(id,t))));
  for(const e of ev){const r=inst[e.track];if(!r||!r.eng)continue;
    if(e.track==='drums')r.eng.hit(e.lane,e.vel,e.t);else{const d=stutter?Math.min(e.dur,stutter.len*sd-.006):e.dur;r.eng.noteOn(e.midi,e.vel,e.t);r.eng.noteOff(e.midi,e.t+d)}}
  for(const e of eventsForStep(P,sc,s%L,t,sd,P.swing,null))visQ.push({t:e.t,track:e.track});
  visQ.push({t,step:i});
}
function draw(){if(!playing)return;const now=ac.currentTime;
  while(visQ.length&&visQ[0].t<=now){const v=visQ.shift();if(v.track){if(audible(v.track))flash(v.track)}else if(v.step!=null)drawPlayhead(v.step)}
  if(!$('#sheet').hidden&&mixerOpen)drawMeters();
  requestAnimationFrame(draw)}
function flash(id){const el=actLamp[id];if(!el)return;el.classList.add('on');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('on'),90)}
let curPlayStep=-1;
function drawPlayhead(step){curPlayStep=step;document.querySelectorAll('.cell.ph').forEach(c=>c.classList.remove('ph'));
  if(step<0)return;document.querySelectorAll('#edbody .cell[data-s="'+step+'"]').forEach(c=>c.classList.add('ph'));
  const ph=document.querySelector('.rph');if(ph)ph.style.left=(38+step*RCOL)+'px'}

/* ───────────── live play ───────────── */
function playNow(id,midi,vel=.85,len=.25){initAudio();ac.resume();const r=inst[id];if(!r||!r.eng)return;const t=ac.currentTime+.005;r.eng.noteOn(midi,vel,t);if(len)r.eng.noteOff(midi,t+len);flash(id)}
function hitNow(lane,vel=.9){initAudio();ac.resume();const r=inst.drums;if(!r||!r.eng)return;r.eng.hit(lane,vel,ac.currentTime+.005);flash('drums')}

/* ───────────── rendering ───────────── */
function renderAll(){renderTop();renderScenes();renderTracks();renderEditor()}
function renderTop(){$('#bpmBtn').textContent=Math.round(P.bpm)+' BPM';$('#keyBtn').textContent=keyName(P.key,P.scale)}
function renderScenes(){const box=$('#scenes');box.innerHTML='';
  for(const id of SCENE_IDS){const has=!!P.scenes[id];box.append(h('button',{class:'scene'+(has?' has':'')+(id===P.cur?' cur':'')+(queued===id?' queued':''),onclick:()=>chooseScene(id),'aria-label':'Szene '+id},id))}
  $('#barsOut').textContent=scene().bars}
function chooseScene(id){
  if(!P.scenes[id]){snapshot();P.scenes[id]=newScene(scene().bars);toast('Szene '+id+' angelegt (leer)')}
  if(playing&&id!==P.cur){queued=id;renderScenes();return}
  P.cur=id;persist();sceneChanged();renderScenes();renderEditor()}
function renderTracks(){const box=$('#tracks');box.innerHTML='';
  for(const t of TRACKS){const st=P.tracks[t.id];const lamp=h('i',{class:'act'});actLamp[t.id]=lamp;const fz=FZ[t.id]&&FZ[t.id].buf;
    const b=h('button',{class:'track'+(sel===t.id?' sel':'')+(!audible(t.id)?' muted':''),style:'--c:'+t.color,onclick:()=>{if(sel===t.id){openSound(t.id);return}sel=t.id;renderTracks();renderEditor()}},
      lamp,h('span',{class:'tn'},t.name),h('span',{class:'te'},ENGINES[st.engine].short+(st.solo?' · solo':st.mute?' · stumm':'')));
    box.append(b)}
  document.querySelector('.editor').style.setProperty('--tc',TR[sel].color)}

function renderEditor(){
  const head=$('#edhead'),body=$('#edbody');const keep=body.scrollTop;head.innerHTML='';body.innerHTML='';const t=TR[sel],st=P.tracks[sel];
  document.querySelector('.editor').style.setProperty('--tc',t.color);
  head.append(h('b',{class:'brand',style:'font-size:17px'},t.name));
  if(t.role!=='drums'){const seg=h('div',{class:'seg'});for(const [v,l] of [['step','Step'],['roll','Roll'],['pads','Pads']])seg.append(h('button',{class:st.view===v?'on':'',onclick:()=>{st.view=v;persist();renderEditor()}},l));head.append(seg)}
  head.append(h('span',{class:'grow'}));
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

/* bar blocks: every bar is its own block, stacked; beats are visibly grouped */
const BEAT_GAP='8px';
function beatCols(label){return (label?label+' ':'')+'repeat(4,minmax(0,1fr))'}
function barHeader(b,id){const sc=scene();return h('div',{class:'barhead'},h('b',{},'Takt '+(b+1)),
  h('span',{class:'grow'}),
  h('button',{class:'mini',onclick:()=>{barClip={id,data:copyBar(id,b)};toast('Takt '+(b+1)+' kopiert')}},'Kopieren'),
  barClip&&barClip.id===id?h('button',{class:'mini',onclick:()=>{snapshot();pasteBar(id,b,barClip.data);markEdit(id);persist();renderEditor()}},'Einfügen'):null,
  h('button',{class:'mini',onclick:()=>{snapshot();clearBar(id,b);markEdit(id);persist();renderEditor()}},'Leeren'))}
let barClip=null;
function copyBar(id,b){const sc=scene();if(id==='drums'){const o={};for(const [k,a] of Object.entries(sc.drums))o[k]=a.slice(b*16,b*16+16);return o}return sc[id].filter(n=>n.s>=b*16&&n.s<b*16+16).map(n=>({...n,s:n.s-b*16}))}
function clearBar(id,b){const sc=scene();if(id==='drums'){for(const a of Object.values(sc.drums))for(let i=0;i<16;i++)a[b*16+i]=0;return}sc[id]=sc[id].filter(n=>n.s<b*16||n.s>=b*16+16);if(id==='chords')recalcHold(P,sc)}
function pasteBar(id,b,data){const sc=scene(),L=sceneLen(sc);clearBar(id,b);if(id==='drums'){for(const [k,a] of Object.entries(data)){const arr=sc.drums[k]||(sc.drums[k]=new Array(L).fill(0));for(let i=0;i<16;i++)arr[b*16+i]=a[i]}return}
  for(const n of data)sc[id].push({...n,s:n.s+b*16});if(id==='chords')recalcHold(P,sc)}
function beatNums(lab){const r=h('div',{class:'beatrow nums'});for(let q=0;q<4;q++)r.append(h('div',{class:'bn'},String(q+1)));return lab?h('div',{class:'lanerow'},h('div',{}),r):h('div',{class:'lanerow nolab'},r)}
// a row of 16 cells grouped as 4 beats; mk(i) builds one cell
function stepRow(mk){const row=h('div',{class:'beatrow'});for(let q=0;q<4;q++){const g=h('div',{class:'beat'});for(let k=0;k<4;k++)g.append(mk(q*4+k));row.append(g)}return row}

/* drums */
const LANE_ORDER=['bd','sd','cp','ch','oh','rs','lt','mt','ht','crash','ride'];
const LANE_DE={bd:'Kick',sd:'Snare',cp:'Clap',ch:'Hat',oh:'Open',rs:'Rim',lt:'Tom L',mt:'Tom M',ht:'Tom H',crash:'Crash',ride:'Ride'};
const CARD_LABEL={'909':'909','sds-v':'SDS-V','sds7':'SDS7'};
let showAllLanes=false;
function drumLanes(){const r=inst.drums;let lanes=r&&r.eng?r.eng.lanes():LANE_ORDER.map(id=>({id,name:id.toUpperCase(),engine:'909',cards:['909']}));
  const idx=id=>{const i=LANE_ORDER.indexOf(id);return i<0?99:i};lanes=[...lanes].sort((a,b)=>idx(a.id)-idx(b.id));
  const used=new Set(Object.keys(scene().drums).filter(k=>scene().drums[k].some(v=>v)));
  return showAllLanes?lanes:lanes.filter((l,i)=>i<6||used.has(l.id))}
function renderDrums(body){
  const sc=scene(),L=sceneLen(sc),lanes=drumLanes();
  const legend=h('div',{class:'cardlegend'},h('span',{class:'small'},'Klangkarte je Spur antippen:'),h('i',{class:'card c909'},'909'),h('i',{class:'card csdsv'},'SDS-V'),h('i',{class:'card csds7'},'SDS7'));
  body.append(legend);
  let paint=null;
  for(let b=0;b<sc.bars;b++){const block=h('div',{class:'barblock'});block.append(barHeader(b,'drums'),beatNums(true));
    for(const ln of lanes){const card=ln.engine||'909';
      const lab=h('div',{class:'lanelab'},h('button',{class:'lname',onclick:()=>hitNow(ln.id)},LANE_DE[ln.id]||ln.name||ln.id),
        h('button',{class:'card c'+card.replace('-',''),title:'Klangkarte: '+(ln.cards||['909']).map(c=>CARD_LABEL[c]).join(' / '),disabled:(ln.cards||[]).length<2,onclick:()=>cycleCard(ln)},CARD_LABEL[card]||card));
      const row=stepRow(i=>{const s=b*16+i;const v=(sc.drums[ln.id]||[])[s]||0;return h('div',{class:'cell'+(v===1?' on':'')+(v===2?' acc':''),'data-s':s,'data-lane':ln.id})});
      block.append(h('div',{class:'lanerow'},lab,row))}
    body.append(block)}
  const setCell=(c,val)=>{const lane=c.dataset.lane,s=+c.dataset.s;const arr=sc.drums[lane]||(sc.drums[lane]=new Array(L).fill(0));while(arr.length<L)arr.push(0);arr[s]=val;c.classList.toggle('on',val===1);c.classList.toggle('acc',val===2)};
  body.onpointerdown=e=>{const c=e.target.closest('.cell');if(!c||!c.dataset.lane)return;e.preventDefault();snapshot();const cur=(sc.drums[c.dataset.lane]||[])[+c.dataset.s]||0;const nv=cur===0?1:cur===1?2:0;paint={lane:c.dataset.lane,val:nv===2?1:nv,first:c};setCell(c,nv);if(nv)hitNow(c.dataset.lane,nv===2?1:.72);markEdit('drums');body.setPointerCapture(e.pointerId)};
  body.onpointermove=e=>{if(!paint)return;const el=document.elementFromPoint(e.clientX,e.clientY);const c=el&&el.closest&&el.closest('.cell');if(!c||c===paint.first||c.dataset.lane!==paint.lane)return;const cur=(sc.drums[paint.lane]||[])[+c.dataset.s]||0;if((paint.val?1:0)!==(cur?1:0))setCell(c,paint.val)};
  body.onpointerup=()=>{if(paint){paint=null;markEdit('drums');persist()}};
  body.append(h('div',{class:'tools'},
    h('button',{class:'chip ghost',onclick:()=>{showAllLanes=!showAllLanes;renderEditor()}},showAllLanes?'Weniger Spuren':'Alle Spuren'),
    h('span',{class:'small'},'Tippen: an · nochmal: Akzent · nochmal: aus. Ziehen malt. Spurname antippen = vorhören.')));
}
function cycleCard(ln){const cards=ln.cards||['909'];if(cards.length<2)return;const r=inst.drums;if(!r||!r.eng||!r.eng.setLaneEngine)return;snapshot();
  const nx=cards[(cards.indexOf(ln.engine||'909')+1)%cards.length];r.eng.setLaneEngine(ln.id,nx);P.tracks.drums.patch=r.eng.getPatch();P.tracks.drums.preset=null;markEdit('drums');persist();hitNow(ln.id,1);renderEditor();toast((LANE_DE[ln.id]||ln.id)+': '+CARD_LABEL[nx])}

/* mono step grid (scale-locked): one block per bar */
function windowRows(id){const st=P.tracks[id];const all=scaleNotes(12,108,P.key,P.scale);const root=12*((st.oct??TR[id].oct)+1)+P.key;let i=all.findIndex(m=>m>=root);if(i<0)i=0;return all.slice(i,i+8).reverse()}
function renderMonoSteps(body){
  const sc=scene(),id=sel,st=P.tracks[id],rows=windowRows(id);
  body.append(h('div',{class:'tools',style:'margin:0 0 6px'},
    h('button',{class:'chip',onclick:()=>{st.oct=(st.oct??TR[id].oct)-1;persist();renderEditor()}},'Oktave −'),
    h('button',{class:'chip',onclick:()=>{st.oct=(st.oct??TR[id].oct)+1;persist();renderEditor()}},'Oktave +'),
    h('span',{class:'small'},'Tippen setzt · nach rechts ziehen = länger · nochmal tippen löscht')));
  for(let b=0;b<sc.bars;b++){const block=h('div',{class:'barblock'});block.append(barHeader(b,id),beatNums(true));
    for(const p of rows){const row=stepRow(i=>{const s=b*16+i;const start=sc[id].find(n=>n.s===s&&n.p===p);const cover=!start&&sc[id].find(n=>n.p===p&&n.s<s&&n.s+n.l>s);
        return h('div',{class:'cell'+(start?' on':'')+(cover?' tie':'')+(((p-P.key)%12+12)%12===0?' root':''),'data-s':s,'data-p':p})});
      block.append(h('div',{class:'lanerow'},h('div',{class:'lanelab'},h('button',{class:'lname mono',onclick:()=>playNow(id,p)},midiName(p))),row))}
    const out=sc[id].filter(n=>n.s>=b*16&&n.s<b*16+16&&!rows.includes(n.p)).length;if(out)block.append(h('div',{class:'small',style:'margin-top:4px'},out+' Note(n) in diesem Takt liegen außerhalb – Oktave wechseln oder Roll nutzen'));
    body.append(block)}
  let drag=null;
  body.onpointerdown=e=>{const c=e.target.closest('.cell');if(!c||c.dataset.p==null)return;e.preventDefault();snapshot();const s=+c.dataset.s,p=+c.dataset.p;const notes=sc[id];const ex=notes.find(n=>n.s===s&&n.p===p);
    markEdit(id);
    if(ex){sc[id]=notes.filter(n=>n!==ex);persist();renderEditor();return}
    sc[id]=notes.filter(n=>n.s!==s);for(const n of sc[id])if(n.s<s&&n.s+n.l>s)n.l=s-n.s;
    const nx=sc[id].filter(n=>n.s>s).map(n=>n.s);const lim=(nx.length?Math.min(...nx):sceneLen(sc))-s;
    const n={s,p,l:1,v:.85};sc[id].push(n);drag={n,lim,x0:e.clientX,cw:c.getBoundingClientRect().width+2,c};c.classList.add('on');playNow(id,p);body.setPointerCapture(e.pointerId)};
  body.onpointermove=e=>{if(!drag)return;const L=clamp(1+Math.floor((e.clientX-drag.x0)/drag.cw+.4),1,drag.lim);if(L!==drag.n.l){drag.n.l=L;refreshMono(body,sc,id)}};
  body.onpointerup=()=>{if(drag){drag=null;markEdit(id);persist();renderEditor()}};
}
function refreshMono(body,sc,id){body.querySelectorAll('.cell[data-p]').forEach(c=>{const s=+c.dataset.s,p=+c.dataset.p;const start=sc[id].find(n=>n.s===s&&n.p===p);const cover=!start&&sc[id].find(n=>n.p===p&&n.s<s&&n.s+n.l>s);c.classList.toggle('on',!!start);c.classList.toggle('tie',!!cover)})}

/* chords: palette brush, one row per bar */
let chordBrush=0;
const VOICINGS=[['lead','Gleiche Lage','Akkorde bleiben nah beieinander'],['root','Grundstellung','springt mit dem Grundton auf und ab'],['wide','Weit','offen gesetzt'],];
function renderChordSteps(body){
  const sc=scene(),st=P.tracks.chords;
  const pal=h('div',{class:'palette'});
  for(let d=0;d<7;d++){const ci=chordInfo(d,P.key,P.scale,!!st.seventh);pal.append(h('button',{class:chordBrush===d?'on':'',onclick:()=>{chordBrush=d;playChord(d);renderEditor()}},ci.roman,h('small',{},ci.name)))}
  pal.append(h('button',{class:chordBrush==='up'?'on':'',onclick:()=>{chordBrush='up';renderEditor()},title:'Antippen eines Akkords: eine Umkehrung höher'},'▲',h('small',{},'höher')),
    h('button',{class:chordBrush==='down'?'on':'',onclick:()=>{chordBrush='down';renderEditor()},title:'Antippen eines Akkords: eine Umkehrung tiefer'},'▼',h('small',{},'tiefer')),
    h('button',{class:chordBrush==='off'?'on':'',onclick:()=>{chordBrush='off';renderEditor()}},'Aus',h('small',{},'löschen')));
  body.append(pal);
  const voi=h('div',{class:'row',style:'margin-bottom:8px'},h('span',{class:'small'},'Lage:'));
  for(const [k,l,tip] of VOICINGS)voi.append(h('button',{class:'chip'+((st.voicing||'lead')===k?' on':''),title:tip,onclick:()=>{snapshot();st.voicing=k;revoiceChords(sc);markEdit('chords');persist();renderEditor();playChord(chordBrush>=0?chordBrush:0)}},l));
  voi.append(h('button',{class:'chip'+(st.bassOct?' on':''),title:'Grundton eine Oktave tiefer dazu',onclick:()=>{snapshot();st.bassOct=!st.bassOct;revoiceChords(sc);markEdit('chords');persist();renderEditor()}},'+ Bass'));
  body.append(voi);
  for(let b=0;b<sc.bars;b++){const block=h('div',{class:'barblock'});block.append(barHeader(b,'chords'),beatNums(false));
    const row=stepRow(i=>{const s=b*16+i;const here=sc.chords.find(n=>n.s===s&&n.c!=null);const cover=!here&&sc.chords.find(n=>n.s<s&&n.s+n.l>s);
      const inv=here?(here.inv||0):0;
      return h('div',{class:'cell tall'+(here?' on':'')+(cover?' tie':''),'data-s':s,'data-chord':1},here?h('span',{class:'tx'},chordInfo(here.c,P.key,P.scale,!!st.seventh).roman+(inv>0?'↑'.repeat(Math.min(inv,3)):inv<0?'↓'.repeat(Math.min(-inv,3)):'')):null)});
    block.append(h('div',{class:'lanerow nolab'},row));body.append(block)}
  body.onpointerdown=e=>{const c=e.target.closest('.cell[data-chord]');if(!c)return;e.preventDefault();snapshot();const s=+c.dataset.s;const here=sc.chords.find(n=>n.s===s&&n.c!=null);
    if(chordBrush==='up'||chordBrush==='down'){if(!here)return toast('Hier liegt kein Akkord');const inv=(here.inv||0)+(chordBrush==='up'?1:-1);const l=here.l;placeChord(P,sc,s,here.c,inv);sc.chords.filter(n=>n.s===s).forEach(n=>n.l=l);playChordNotes(sc.chords.filter(n=>n.s===s).map(n=>n.p))}
    else if(chordBrush==='off'||(here&&here.c===chordBrush&&(here.inv||0)===0)){sc.chords=sc.chords.filter(n=>n.s!==s)}
    else{placeChord(P,sc,s,chordBrush,0);playChordNotes(sc.chords.filter(n=>n.s===s).map(n=>n.p))}
    recalcHold(P,sc);markEdit('chords');persist();renderEditor()};
  body.onpointermove=null;body.onpointerup=null;
  body.append(h('div',{class:'tools'},
    h('button',{class:'chip'+(st.seventh?' on':''),onclick:()=>{snapshot();st.seventh=!st.seventh;revoiceChords(sc);markEdit('chords');persist();renderEditor()}},'7er-Akkorde'),
    h('button',{class:'chip'+(st.hold?' on':''),onclick:()=>{snapshot();st.hold=!st.hold;if(!st.hold)sc.chords.forEach(n=>n.l=Math.min(n.l,2));recalcHold(P,sc);markEdit('chords');persist();renderEditor()}},'Halten'),
    h('button',{class:'chip',onclick:()=>{st.oct=(st.oct??4)-1;revoiceChords(sc);markEdit('chords');persist();renderEditor()}},'Alle tiefer'),
    h('button',{class:'chip',onclick:()=>{st.oct=(st.oct??4)+1;revoiceChords(sc);markEdit('chords');persist();renderEditor()}},'Alle höher'),
    h('span',{class:'small'},'Akkord wählen, dann Schritte antippen. ▲/▼ verschiebt einen einzelnen Akkord.')));
}
function playChordNotes(notes){notes.forEach(p=>playNow('chords',p,.75,.5))}
function playChord(d){playChordNotes(chordNotes(P,d,0,null))}

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
      pads.append(padEl(ci.roman+(up?'′':''),ci.name,()=>chordNotes(P,deg,up?(st.seventh?4:3):0,null),deg===0,deg))}}
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
  const pos=((t0-loopT0)/sd);let s=((Math.round(pos)%L)+L)%L;const l=clamp(Math.round((t1-t0)/sd),1,16);
  if(TR[id].role==='mono')sc[id]=sc[id].filter(n=>n.s!==s);
  for(const p of notes){sc[id]=sc[id].filter(n=>!(n.s===s&&n.p===p));const n={s,p,l,v:.85};if(id==='chords'&&chordDeg!=null){n.c=chordDeg;n.inv=0}sc[id].push(n)}
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
  if(kind==='stutter'&&playing){const cur=Math.floor(stepIdx/2)*2;stutter={from:cur%sceneLen(),base:stepIdx,len:2};for(const tr of TRACKS){const f=FZ[tr.id];if(f&&f.src){try{f.src.stop(nextT)}catch(_e){}f.src=null}}}
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
  })}
function previewSound(id){if(playing)return;if(id==='drums'){hitNow('bd',1);setTimeout(()=>hitNow('sd',.9),220);return}const st=P.tracks[id];const r=12*((st.oct??TR[id].oct)+1)+P.key;
  if(id==='chords'){playChord(0);return}playNow(id,r,.85,.35);setTimeout(()=>playNow(id,r+7,.8,.3),260)}

/* mixer */
function openMixer(){openSheet('Mixer',b=>{mixerOpen=true;document.querySelector('.sheetbox').style.setProperty('--tc','var(--fg)');
  for(const t of TRACKS){const st=P.tracks[t.id];
    const fader=h('input',{type:'range',min:0,max:100,value:Math.round(Math.sqrt(st.vol/1.25)*100),id:'mix_'+t.id,'aria-label':t.name+' Lautstärke'});
    const out=h('output',{class:'mono'},dbStr(st.vol));
    fader.addEventListener('pointerdown',snapshot,{once:true});
    fader.addEventListener('input',()=>{const x=fader.value/100;st.vol=+(x*x*1.25).toFixed(4);out.textContent=dbStr(st.vol);applyTrackGain(t.id);persist()});
    const m=h('button',{class:'ms'+(st.mute?' on':''),onclick:()=>{snapshot();st.mute=!st.mute;applyAllGains();persist();openMixer()}},'M');
    const s=h('button',{class:'ms solo'+(st.solo?' on':''),onclick:()=>{snapshot();st.solo=!st.solo;applyAllGains();persist();openMixer()}},'S');
    const bar=h('div',{class:'meter'},h('i',{id:'mt_'+t.id}));
    b.append(h('div',{class:'strip'+(audible(t.id)?'':' off'),style:'--c:'+t.color},h('div',{class:'sname'},h('b',{},t.name),h('span',{class:'small'},ENGINES[st.engine].short)),m,s,h('div',{class:'sfader'},fader,bar),out))}
  const res=h('p',{class:'note',id:'amres'},automixMsg);
  b.append(h('div',{class:'sec'},h('h3',{},'Automix'),h('p',{class:'note'},'Misst die Lautheit jeder Spur in der aktuellen Szene und stellt ein ausgewogenes Verhältnis ein: Drums als Bezug, Bass knapp darunter, Lead darüber, Akkorde dahinter. Mit „↶" zurück.'),
    h('div',{class:'row'},h('button',{class:'cta',onclick:async e=>{e.target.disabled=true;res.textContent='Messe …';try{automixMsg=await automix()}catch(err){automixMsg='Automix fehlgeschlagen: '+err.message}e.target.disabled=false;openMixer()}},'Automix'),
      h('button',{class:'opt',onclick:()=>{snapshot();for(const t of TRACKS){P.tracks[t.id].mute=false;P.tracks[t.id].solo=false}applyAllGains();persist();openMixer()}},'Alle an')),res));
})}
function drawMeters(){for(const t of TRACKS){const an=meter[t.id],el=document.getElementById('mt_'+t.id);if(!an||!el)continue;const d=new Float32Array(an.fftSize);an.getFloatTimeDomainData(d);let s=0;for(const x of d)s+=x*x;const db=10*Math.log10(s/d.length+1e-12);el.style.width=clamp((db+60)/60*100,0,100)+'%'}}
async function automix(){
  initAudio();await Promise.all(TRACKS.map(t=>ensureEngine(t.id)));snapshot();
  const sc=scene(),meas={};
  for(const t of TRACKS){const id=t.id;const has=id==='drums'?Object.values(sc.drums).some(a=>a.some(v=>v)):sc[id].length>0;if(!has||!inst[id].eng)continue;
    let buf=FZ[id]&&FZ[id].buf&&FZ[id].sig===fzSig(id,sc)?FZ[id].buf:await fzRender(id,sc);meas[id]=await loudness(buf)}
  const ids=Object.keys(meas);if(!ids.length)throw Error('keine Noten in dieser Szene');
  const want={};for(const id of ids)want[id]=MIX_TARGET[id]-meas[id];const top=Math.max(...ids.map(id=>want[id]));
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
  b.append(h('div',{class:'sec knob'},h('label',{for:'swing'},'Swing',so),sw))})}
function openKey(){openSheet('Tonart',b=>{
  const keys=h('div',{class:'row'});NOTE.forEach((n,k)=>keys.append(h('button',{class:'opt'+(P.key===k?' on':''),onclick:()=>{snapshot();let d=((k-P.key)%12+12)%12;if(d>6)d-=12;transposeAll(d);persist();openKey();renderTop()}},n)));
  const sc=h('div',{class:'row'});for(const [k,v] of Object.entries(SCALES))sc.append(h('button',{class:'opt'+(P.scale===k?' on':''),onclick:()=>{snapshot();P.scale=k;snapAll();persist();openKey();renderTop()}},v.name));
  b.append(h('div',{class:'sec'},h('h3',{},'Grundton'),keys),h('div',{class:'sec'},h('h3',{},'Skala'),sc),h('p',{class:'note'},'Vorhandene Noten wandern mit: beim Grundton werden sie verschoben, bei der Skala auf den nächsten passenden Ton gelegt. Akkorde werden neu gebaut.'))})}
function transposeAll(d){P.key=((P.key+d)%12+12)%12;for(const id of SCENE_IDS){const sc=P.scenes[id];if(!sc)continue;for(const k of ['bass','lead'])sc[k].forEach(n=>n.p+=d);revoiceChords(sc)}}
function snapAll(){for(const id of SCENE_IDS){const sc=P.scenes[id];if(!sc)continue;for(const k of ['bass','lead'])sc[k].forEach(n=>{if(!inScale(n.p,P.key,P.scale)){for(const d of [-1,1,-2,2])if(inScale(n.p+d,P.key,P.scale)){n.p+=d;break}}});revoiceChords(sc)}}

function openMenu(){openSheet('Projekt & Export',b=>{
  document.querySelector('.sheetbox').style.setProperty('--tc','var(--lead)');
  const name=h('input',{type:'text',value:P.name,id:'pname'});name.addEventListener('change',()=>{P.name=name.value.trim()||'Loop';persist()});
  let len=P.exportLen||'scene2';
  const lens=[['scene1','Szene ×1'],['scene2','Szene ×2'],['scene4','Szene ×4'],['song','Song']];
  const lenRow=h('div',{class:'row'});const fillLen=()=>{lenRow.innerHTML='';for(const [k,l] of lens)lenRow.append(h('button',{class:'opt'+(len===k?' on':''),onclick:()=>{len=k;P.exportLen=k;persist();fillLen();info()}},l))};fillLen();
  const fade=h('input',{type:'checkbox',id:'fade'});fade.checked=P.exportFade!==false;fade.addEventListener('change',()=>{P.exportFade=fade.checked;persist()});
  const prog=h('div',{class:'progress'},h('i',{}));const status=h('p',{class:'note'});const result=h('div',{class:'row'});
  const info=()=>{const segs=arrangement(len);const bars=segs.reduce((a,s)=>a+P.scenes[s.s].bars*s.n,0);status.textContent=bars+' Takte · '+(bars*4*60/P.bpm).toFixed(1)+' s'};info();
  const progress=(f,msg)=>{prog.firstChild.style.width=Math.round(f*100)+'%';if(msg)status.textContent=msg};
  const run=async btn=>{btn.disabled=true;result.innerHTML='';try{
      if(playing)stop();initAudio();await ac.resume();await Promise.all(TRACKS.map(t=>ensureEngine(t.id)));
      const res=await exportAudio({P,segs:arrangement(len),inst,TRACKS,eventsForStep,fade:fade.checked,audible,progress});
      const base=(P.name||'loopkiste').replace(/[^\wäöüÄÖÜß-]+/g,'_');
      progress(.95,'MP3 wird kodiert …');const mp3=await encodeMp3(res.mix,256);offerFile(result,new File([mp3],base+'.mp3',{type:'audio/mpeg'}));
      status.textContent='Fertig: MP3 256 kbit/s · '+res.mix.duration.toFixed(1)+' s · '+(mp3.size/1e6).toFixed(1)+' MB · Spitze '+res.peakDb.toFixed(1)+' dBFS';progress(1)}
    catch(e){console.error(e);status.textContent='Export fehlgeschlagen: '+e.message}btn.disabled=false};
  b.append(h('div',{class:'sec'},h('h3',{},'Export'),lenRow,h('label',{class:'row small',for:'fade'},fade,'Am Ende ausblenden'),h('div',{class:'row'},h('button',{class:'cta',onclick:e=>run(e.target)},'MP3 exportieren')),h('div',{style:'height:8px'}),prog,status,result));
  const songBox=h('div',{class:'sec'});const fillSong=()=>{songBox.innerHTML='';songBox.append(h('h3',{},'Song (Szenen nacheinander)'));
    songBox.append(h('div',{class:'row'},h('button',{class:'opt'+(P.song.on?' on':''),onclick:()=>{P.song.on=!P.song.on;persist();fillSong()}},P.song.on?'Song-Modus an':'Song-Modus aus')));
    const list=h('div',{class:'row'});P.song.list.forEach((it,i)=>list.append(h('button',{class:'opt',title:'Tippen: Wiederholungen ändern',onclick:()=>{it.n=it.n>=8?1:it.n*2;persist();fillSong();info()}},it.s+' ×'+it.n),h('button',{class:'opt',onclick:()=>{P.song.list.splice(i,1);persist();fillSong();info()},'aria-label':'entfernen'},'×')));songBox.append(list);
    const add=h('div',{class:'row'},h('span',{class:'small'},'Anhängen:'));SCENE_IDS.filter(s=>P.scenes[s]).forEach(s=>add.append(h('button',{class:'opt',onclick:()=>{P.song.list.push({s,n:2});persist();fillSong();info()}},s)));songBox.append(add)};fillSong();b.append(songBox);
  const projs=load('loopkiste.projects')||{};
  const plist=h('div',{class:'row'});for(const k of Object.keys(projs))plist.append(h('button',{class:'opt',onclick:()=>{snapshot();P=migrate(deep(projs[k]));loadProject()}},k));
  const code=h('textarea',{id:'projcode',placeholder:'Projekt-Code hier einfügen'});
  b.append(h('div',{class:'sec'},h('h3',{},'Projekt'),name,h('div',{style:'height:6px'}),h('div',{class:'row'},
    h('button',{class:'opt',onclick:()=>{projs[P.name]=deep(P);try{localStorage.setItem('loopkiste.projects',JSON.stringify(projs))}catch(_e){}toast('Gespeichert: '+P.name);openMenu()}},'Speichern'),
    h('button',{class:'opt',onclick:()=>{snapshot();const keep=deep(P.tracks);P={...demoProject(),name:'Neuer Loop',scenes:{A:newScene(2),B:null,C:null,D:null}};P.tracks=keep;for(const t of Object.values(P.tracks)){t.mute=false;t.solo=false}loadProject()}},'Neu (leer)'),
    h('button',{class:'opt',onclick:()=>{snapshot();P=demoProject();loadProject()}},'Demo laden'),
    h('button',{class:'opt',onclick:async()=>{const t=JSON.stringify(P);try{await navigator.clipboard.writeText(t);toast('Projekt-Code kopiert')}catch(_e){code.value=t;code.select();toast('Text markiert – bitte kopieren')}}},'Code kopieren'),
    h('button',{class:'opt',onclick:()=>{try{const o=JSON.parse(code.value.trim());if(!o.scenes||!o.tracks)throw Error('kein Loopkiste-Projekt');snapshot();P=migrate(o);loadProject();toast('Projekt geladen')}catch(e){toast('Code nicht lesbar: '+e.message)}}},'Code laden')),
    Object.keys(projs).length?h('div',{},h('div',{class:'small',style:'margin:8px 0 4px'},'Gespeicherte Projekte:'),plist):null,h('div',{style:'height:6px'}),code));
})}
function arrangement(len){if(len==='song'&&P.song.list.length)return P.song.list.filter(it=>P.scenes[it.s]).map(it=>({s:it.s,n:it.n}));const n=len==='scene1'?1:len==='scene4'?4:2;return [{s:P.cur,n}]}
function offerFile(box,file){const url=URL.createObjectURL(file);box.append(h('a',{class:'cta alt',href:url,download:file.name,style:'display:inline-grid;place-items:center;text-decoration:none'},'Speichern: '+file.name));
  if(navigator.canShare&&navigator.canShare({files:[file]}))box.append(h('button',{class:'cta',onclick:()=>navigator.share({files:[file],title:P.name}).catch(()=>{})},'Teilen …'))}
function loadProject(){P.scenes.A=P.scenes.A||newScene(2);if(!P.scenes[P.cur])P.cur='A';for(const t of TRACKS){ensureEngine(t.id);applyTrackGain(t.id)}syncPatches();sceneChanged();persist();closeSheet()}

/* ───────────── ideas (helpers, never automatic) ───────────── */
function doIdea(id){snapshot();const sc=scene();
  if(id==='drums')sc.drums=ideaDrums(sc.bars);
  if(id==='chords'){const prog=ideaChords(P.scale,sc.bars);sc.chords=[];prog.forEach(([s,d])=>placeChord(P,sc,s,d));recalcHold(P,sc)}
  if(id==='bass')sc.bass=ideaBass(P,sc,chordAt);
  if(id==='lead')sc.lead=ideaLead(P,sc,chordAt,windowRows('lead'));
  markEdit(id);persist();renderEditor();toast('Vorschlag gesetzt – „↶" nimmt ihn zurück')}

/* ───────────── bars ───────────── */
function setBars(nb){const sc=scene();nb=clamp(nb,1,MAX_BARS);if(nb===sc.bars)return;snapshot();const L=nb*16,oldL=sc.bars*16;
  if(nb>sc.bars){for(const k in sc.drums){const a=sc.drums[k];const old=a.slice(0,oldL);while(a.length<L)a.push(old[a.length%oldL]||0)}
    for(const id of ['bass','chords','lead']){const src=sc[id].slice();for(let off=oldL;off<L;off+=oldL)for(const n of src)if(n.s+off<L)sc[id].push({...n,s:n.s+off})}}
  else{for(const k in sc.drums)sc.drums[k].length=L;for(const id of ['bass','chords','lead']){sc[id]=sc[id].filter(n=>n.s<L);sc[id].forEach(n=>n.l=Math.min(n.l,L-n.s))}}
  sc.bars=nb;recalcHold(P,sc);if(playing&&stepIdx>=L){stepIdx=stepIdx%L}TRACKS.forEach(t=>markEdit(t.id));persist();renderScenes();renderEditor()}

/* ───────────── misc ───────────── */
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2400)}
$('#play').addEventListener('click',()=>playing?stop():start());
$('#bpmBtn').addEventListener('click',openTempo);$('#keyBtn').addEventListener('click',openKey);$('#menuBtn').addEventListener('click',openMenu);$('#mixBtn').addEventListener('click',openMixer);
$('#undoBtn').addEventListener('click',undo);
$('#barsMinus').addEventListener('click',()=>setBars(scene().bars-1));$('#barsPlus').addEventListener('click',()=>setBars(scene().bars+1));
$('#sceneCopy').addEventListener('click',()=>{const free=SCENE_IDS.find(s=>!P.scenes[s]);if(!free)return toast('Alle vier Szenen belegt');snapshot();P.scenes[free]=deep(scene());chooseScene(free);toast('Szene kopiert')});
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea'))return;if(e.code==='Space'){e.preventDefault();playing?stop():start()}if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo()}});
$('#bootBtn').addEventListener('click',async()=>{initAudio();await ac.resume();$('#boot').hidden=true;await Promise.all(TRACKS.map(t=>ensureEngine(t.id)));freezeSoon()});
setupFx();renderAll();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
window.__lk={get P(){return P},inst,FZ,start,stop,get ac(){return ac},ensureEngine,arrangement,exportAudio,eventsForStep,TRACKS,automix,setBars,fzWork};
