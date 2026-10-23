
// ───────────────────────── Loopkiste wrapper (new code) ─────────────────────────
const CLOCK_HZ=607000;
function dividerFreq(midi){const ideal=440*Math.pow(2,(midi-69)/12);const N=Math.max(2,Math.round(CLOCK_HZ/ideal));return CLOCK_HZ/N}
const VOICE='Clarinet';           // NWB slot default core voice (only its perc flag matters in MAXMOD/turbo mode)
const SLOTS=8;                    // pattern voices of the PSS30Turbo processor (loopV)
const PANEL_VOL=96;               // NWB slot default volume step
const MACROS=[['macroTone','Ton'],['macroReso','Reso'],['macroPunch','Punch'],['macroDecay','Ausklang'],['macroEnsemble','Chorus'],['macroSpace','Raum']];
const ENUMS={circuit:['STACK','SLEW','STRING','FORMANT','VOWEL','THROAT','REED','HARPSI','MALLET','RESON','TRANSIENT','ORGAN','LOGIC','BBDSTRING','SCANFILTER','BITPLANE','RHYTHMEX','HETERODYNE','HARMROUTER','EPROMSCAN'],filterMode:['LP4','LP2','BP','HP','NOTCH'],ensembleMode:['CHORUS','ENSEMBLE','DIMENSION','FLANGE']};
let urlCache=null;
function workletURL(){if(!urlCache)urlCache=URL.createObjectURL(new Blob([WORKLET],{type:'text/javascript'}));return urlCache}
const loaded=new WeakMap();
async function ensureModule(ctx){if(!loaded.has(ctx))loaded.set(ctx,ctx.audioWorklet.addModule(workletURL()));return loaded.get(ctx)}

function patchFromAny(o){
  if(typeof o==='string'){const m=o.match(/```(?:json)?\s*([\s\S]*?)```/i);const t=(m?m[1]:o).trim();const a=t.indexOf('{'),b=t.lastIndexOf('}');o=JSON.parse(t.slice(a,b+1))}
  if(Array.isArray(o))o=o[0];
  if(o&&o.patch&&o.patch.synth)o=o.patch;             // NWB session slot state {app:'puss30',patch:{…}}
  const src=o.synth||o.p||o;const synth={};
  for(const [k,v] of Object.entries(src)){if(!(k in BASE_SYNTH))continue;
    if(ENUMS[k]){const u=String(v).toUpperCase();if(ENUMS[k].includes(u))synth[k]=u;continue}
    let n=+v;if(!Number.isFinite(n))continue;synth[k]=n}
  return {format:'PSS30-PATCH/1',name:String(o.name||o.program||'PATCH').toUpperCase().slice(0,40),cat:String(o.cat||'USER').toUpperCase(),oct:Number.isFinite(+o.oct)?+o.oct:0,synth:{...BASE_SYNTH,...synth}};
}
function buildOutput(ctx,node){
  const tg=ctx.createGain();tg.gain.value=1;
  const fx=buildChain(node,tg,ctx);
  const body=ctx.createBiquadFilter();body.type='lowshelf';body.frequency.value=105;body.gain.value=2.2;
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-7;comp.knee.value=16;comp.ratio.value=1.8;comp.attack.value=.018;comp.release.value=.24;
  const lim=ctx.createDynamicsCompressor();lim.threshold.value=-1;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=.001;lim.release.value=.09;
  const master=ctx.createGain();master.gain.value=volumeGain(PANEL_VOL);
  tg.connect(body);body.connect(comp);comp.connect(lim);lim.connect(master);
  return {fx,master};
}
class SlotAlloc{constructor(){this.s=Array.from({length:SLOTS},()=>({midi:-1,on:-1,off:Infinity}))}
  on(midi,t){let best=0,bt=Infinity;for(let i=0;i<SLOTS;i++){const x=this.s[i];if(x.off<=t){if(x.off<bt){bt=x.off;best=i}}}
    if(bt===Infinity){let o=Infinity;for(let i=0;i<SLOTS;i++)if(this.s[i].on<o){o=this.s[i].on;best=i}}
    this.s[best]={midi,on:t,off:Infinity};return best}
  off(midi,t){let hit=-1,o=-1;for(let i=0;i<SLOTS;i++){const x=this.s[i];if(x.midi===midi&&x.off===Infinity&&x.on>o){o=x.on;hit=i}}if(hit>=0)this.s[hit].off=t;return hit}
  reset(){this.s.forEach(x=>{x.midi=-1;x.on=-1;x.off=-Infinity})}}

export default async function create(ctx,{out}={}){
  let patch=patchFromAny({name:'DEEP 30 BASS',...PROGRAMS['DEEP 30 BASS'],cat:'BASS'});
  let node=null,graph=null;const alloc=new SlotAlloc();const outGain=ctx.createGain();outGain.gain.value=1;if(out)outGain.connect(out);
  const ready=(async()=>{await ensureModule(ctx);node=new AudioWorkletNode(ctx,'pss30-turbo',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});graph=buildOutput(ctx,node);graph.master.connect(outGain);sendCfg()})();
  function sendCfg(){if(!node)return;node.port.postMessage({t:'cfg',mode:'turbo',poly:patch.synth.poly,s:patch.synth});applyFxTo(graph.fx,patch.synth,true)}
  const macroVal={};MACROS.forEach(([id])=>macroVal[id]=clamp01(macroDefs[id].get(patch.synth)));
  const api={
    id:'puss',kind:'synth',name:'PuSS-30',ready,output:outGain,
    presets(){return Object.keys(PROGRAMS).map(name=>({id:name,name,cat:FACTORY_CAT[name]||'MISC'}))},
    loadPreset(id){const pr=PROGRAMS[id];if(!pr)return;patch=patchFromAny({name:id,...pr,cat:FACTORY_CAT[id]||'MISC'});MACROS.forEach(([k])=>macroVal[k]=clamp01(macroDefs[k].get(patch.synth)));sendCfg()},
    getPatch(){return JSON.parse(JSON.stringify(patch))},
    setPatch(o){patch=patchFromAny(o);MACROS.forEach(([k])=>macroVal[k]=clamp01(macroDefs[k].get(patch.synth)));sendCfg()},
    macros(){return MACROS.map(([id,label])=>({id,label,value:macroVal[id]}))},
    setMacro(id,v){if(!macroDefs[id])return;v=clamp01(+v);macroVal[id]=v;macroDefs[id].set(patch.synth,v);sendCfg()},
    noteOn(midi,vel,time){if(!node)return;const t=Math.max(ctx.currentTime,time??ctx.currentTime);const slot=alloc.on(midi,t);node.port.postMessage({t:'loopOn',slot,note:midi,freq:dividerFreq(midi),p:CORE[VOICE],vel:Math.max(.22,Math.min(1,vel??.8)),when:t})},
    noteOff(midi,time){if(!node)return;const t=Math.max(ctx.currentTime,time??ctx.currentTime);const slot=alloc.off(midi,t);if(slot>=0)node.port.postMessage({t:'loopOff',slot,when:t})},
    allOff(){if(!node)return;node.port.postMessage({t:'loopAllOff',flush:true});alloc.reset()},
    async renderStem({sampleRate=48000,durationSec,events=[],patch:pp}={}){
      const p=pp?patchFromAny(pp):patch;
      const off=new OfflineAudioContext(2,Math.ceil(durationSec*sampleRate),sampleRate);await ensureModule(off);
      const sorted=[...events].sort((a,b)=>a.t-b.t),al=new SlotAlloc(),pre=[{t:'cfg',mode:'turbo',poly:p.synth.poly,s:p.synth}],offs=[];
      for(const e of sorted){while(offs.length&&offs[0].t<=e.t){const o=offs.shift();const sl=al.off(o.midi,o.t);if(sl>=0)pre.push({t:'loopOff',slot:sl,when:o.t})}
        const slot=al.on(e.midi,e.t);pre.push({t:'loopOn',slot,note:e.midi,freq:dividerFreq(e.midi),p:CORE[VOICE],vel:Math.max(.22,Math.min(1,e.vel??.8)),when:e.t});
        offs.push({t:e.t+Math.max(.01,e.dur||.1),midi:e.midi});offs.sort((a,b)=>a.t-b.t)}
      for(const o of offs){const sl=al.off(o.midi,o.t);if(sl>=0)pre.push({t:'loopOff',slot:sl,when:o.t})}
      const n=new AudioWorkletNode(off,'pss30-turbo',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{preload:pre}});
      const g=buildOutput(off,n);applyFxTo(g.fx,p.synth,true);g.master.connect(off.destination);
      return off.startRendering()},
    dispose(){try{node&&node.disconnect();outGain.disconnect()}catch(_e){}}
  };
  return api;
}
