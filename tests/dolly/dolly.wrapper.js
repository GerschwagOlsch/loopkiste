/* ═══════════════════════════════════════════════════════════════════════
   Loopkiste engine · DollyDrumz  (id 'dolly', kind 'drums')
   TR-909 circuit model + Simmons SDS-V / SDS7 voice cards.

   GENERATED FILE — built by tests/dolly/build_dolly.mjs from
     tests/dolly/dolly.wrapper.js  (the new control layer)
   + verbatim slices of NocturneWB/workbench/dollydrumz/dollydrumz.html
     (DSP core, worklets, ROMs, voice tables, kit/AI format code).
   Every "VERBATIM" block below is a byte-exact copy of the source lines
   named in its header (CRLF → LF, which is what the browser's HTML parser
   hands to the original script anyway). tests/dolly/verify_verbatim.mjs
   checks this. Do not edit the DSP here — edit the source and rebuild.

   Live path : AudioWorklet 'tr909-machine' (16 lane outs) → lane gains →
               AudioWorklet 'tr909-outstage' (909 mix-bus amp) → output gain → out
   Offline   : exactly what dollydrumz.html does for its own WAV export
               (TR909DK.prepareOffline/trigger/finalizeOffline used by
               nwbRenderPattern): the SAME TR909_CORE_SOURCE is instantiated
               on the main thread, rendered in 128-frame blocks, lane gains,
               TR909OutStage on the summed bus, then played through a master
               gain into an OfflineAudioContext. No MessagePort is involved,
               so there is no event/rendering race.
   ═══════════════════════════════════════════════════════════════════════ */

/* ───────────── VERBATIM dollydrumz.html 363-366 (ROMs) ───────────── */
//@@SLICE 363-366@@

/* ───────────── VERBATIM dollydrumz.html 368-1903 (DSP core + worklets) ───────────── */
//@@SLICE 368-1903@@

/* ───────────── VERBATIM dollydrumz.html 1906-1949 (voice metadata, defaults, specs) ───────────── */
//@@SLICE 1906-1949@@
const FACTORY_DEFAULTS=DEFAULTS;

/* ───────────── VERBATIM dollydrumz.html 1974-1975 (ROM decode) ───────────── */
let romCache=null;
//@@SLICE 1974-1975@@

/* ───────────── VERBATIM dollydrumz.html 2452 (lane roles) ───────────── */
//@@SLICE 2452@@
/* ───────────── VERBATIM dollydrumz.html 2712 / 2774 ───────────── */
//@@SLICE 2712@@
//@@SLICE 2774@@

/* ───────────── VERBATIM dollydrumz.html 3064-3100 (dollydrumz-kit/v1 tables + parsers) ───────────── */
//@@SLICE 3064-3100@@
/* ───────────── VERBATIM dollydrumz.html 3242-3248 ───────────── */
//@@SLICE 3242-3248@@

/* ═════════════════════════ NEW CONTROL LAYER ═════════════════════════ */

// Same mechanism as offlineClasses() in the source: the worklet's core source,
// instantiated on the main thread for the offline render.
let OfflineClasses=null;
function offlineClasses(){
  if(!OfflineClasses)OfflineClasses=new Function(TR909_CORE_SOURCE+'\nreturn {TR909Core:TR909Core,TR909OutStage:TR909OutStage};')();
  return OfflineClasses;
}

/* One machine = the TR909DK parameter / lane registry of the source, but per
   engine instance instead of page-global (two Dolly engines must not share
   knobs). The function bodies are VERBATIM; only the scope is new. */
function makeMachine(){
  const DEFAULTS={...FACTORY_DEFAULTS};   // registerLane() extends it per lane, as in the source
  /* VERBATIM dollydrumz.html 1950-1968 */
//@@SLICE 1950-1968@@
  /* VERBATIM dollydrumz.html 1973 */
//@@SLICE 1973@@
  /* VERBATIM dollydrumz.html 2384-2387 */
//@@SLICE 2384-2387@@
  /* VERBATIM dollydrumz.html 2396-2407 */
//@@SLICE 2396-2407@@
  // Event object exactly as TR909DK.trigger() (source 2261-2268) builds it.
  function makeEvent(voice,slot,t,accent){
    const x=clamp01(accent);
    const base=laneBase(voice),meta=LANE_META.get(voice);
    const indivEligible = base==='bd'||base==='sd'||base==='lt'||base==='mt'||base==='ht'||base==='ch';
    const pex={...params};
    if(meta&&meta.role==='tom'&&Number.isFinite(meta.tomIndex))pex.tomIndex=meta.tomIndex;
    return {type:'trigger',slot,id:voice,base,time:t,accentCV:{total:x,individual:(x>0&&indivEligible)?1:0},params:pex};
  }
  return {VOICES,DEFAULTS,MAX_SLOTS,registerLane,unregisterLane,lanes,laneBase,setLaneTomIndex,
    setParams,setParam,getParams,resetParams,cardsFor,hasEngineSwitch,engineOf,spec,voiceMeta,makeEvent};
}

/* One kit = lanes + machine + the dollydrumz-kit/v1 reader/writer of the
   source's AI panel, without the DOM. */
function makeKit(){
  const TR909DK=makeMachine();
  /* VERBATIM dollydrumz.html 2453 */
//@@SLICE 2453@@
  /* VERBATIM dollydrumz.html 2456-2458 */
//@@SLICE 2456-2458@@
  /* VERBATIM dollydrumz.html 2671-2675 */
//@@SLICE 2671-2675@@
  /* VERBATIM dollydrumz.html 2723-2724 */
//@@SLICE 2723-2724@@
  /* VERBATIM dollydrumz.html 3103 */
//@@SLICE 3103@@
  /* VERBATIM dollydrumz.html 3143-3240 */
//@@SLICE 3143-3240@@
  // UI state that the source keeps in DOM controls / closure variables:
  // BPM slider 124, MASTER -1.72 dB, ACCENT .85, TOM LINK on (source 288-290, 2744).
  let tomLink=true;
  const trackMute={},trackSolo={};
  const transport={bpm:124,master_db:-1.72,accent:.85};
  refreshLaneIndex();

  // port of aiApplyKit (source 3322-3353) + the lane part of rebuildKit()
  function applyKit(plan){
    for(const l of LANES.slice())TR909DK.unregisterLane(l.id);
    const next=plan.lanes.map(l=>{const meta={id:l.id,base:l.base,role:l.role,name:l.name,label:l.label};TR909DK.registerLane(meta);return meta;});
    LANES=next;
    if(plan.base==='defaults')TR909DK.resetParams();
    if(plan.nameToms){LANES=next;renameToms();}
    for(const l of plan.lanes)if(TR909DK.hasEngineSwitch(l.id))TR909DK.setParam(l.id+'Engine',ENGINE_VAL[l.engine]);
    for(const l of plan.lanes){
      const maps={};
      for(const [card,label,v] of l.knobs){
        if(!maps[card])maps[card]=new Map(TR909DK.spec(l.id,card).map(([lb,k])=>[aiNorm(lb),k]));
        const key=maps[card].get(label);
        if(key)TR909DK.setParam(key,v);
      }
    }
    for(const [k,v] of plan.machine)TR909DK.setParam(k,v);
    if(plan.toms.character!==undefined)TR909DK.setParam('tomCharacter',plan.toms.character);
    if(plan.toms.lock!==undefined)TR909DK.setParam('tomNoteLock',plan.toms.lock?1:0);
    if(plan.toms.root!==undefined)TR909DK.setParam('tomRoot',plan.toms.root);
    if(plan.toms.spacing!==undefined)TR909DK.setParam('tomSpacing',plan.toms.spacing);
    if(plan.raw)TR909DK.setParams(plan.raw);
    if(plan.toms.link!==undefined)tomLink=plan.toms.link;
    Object.keys(trackMute).forEach(k=>delete trackMute[k]);
    Object.keys(trackSolo).forEach(k=>delete trackSolo[k]);
    for(const l of plan.lanes){trackMute[l.id]=!!l.mute;trackSolo[l.id]=!!l.solo;}
    if(plan.transport.bpm!==undefined)transport.bpm=plan.transport.bpm;
    if(plan.transport.master!==undefined)transport.master_db=plan.transport.master;
    if(plan.transport.accent!==undefined)transport.accent=plan.transport.accent;
    refreshLaneIndex();
  }
  // port of aiExportKit (source 3104-3127)
  function exportKit(opt){
    opt=opt||{};const p=TR909DK.getParams();
    const lanes=LANES.map(l=>{
      const e=TR909DK.engineOf(l.id),o={id:l.id,role:l.role,name:l.name,label:l.label,engine:AI_ENGINE_OUT[e]};
      o.knobs=aiKnobs(l.id,e,p);
      if(TR909DK.hasEngineSwitch(l.id)){const c={};for(const k of TR909DK.cardsFor(l.id))if(k!==e)c[AI_ENGINE_OUT[k]]=aiKnobs(l.id,k,p);o.cards=c;}
      if(trackMute[l.id])o.mute=true;
      if(trackSolo[l.id])o.solo=true;
      return o;
    });
    const machine={};for(const [label,key] of AI_MACHINE)machine[label]=aiPct(p[key]);
    const kit={
      format:AI_FMT.kit,
      name:opt.name||'DollyDrumz kit',
      base:'defaults',
      transport:{bpm:transport.bpm,master_db:+(+transport.master_db).toFixed(2),accent:Math.round(transport.accent*100)},
      machine:machine,
      toms:{'TOM CHARACTER':aiPct(p.tomCharacter),note_lock:p.tomNoteLock>=.5,
        root_note:midiName(tomRootMidiFromParam()),spacing_semitones:tomSpacingFromParam(),link:!!tomLink},
      lanes:lanes
    };
    if(opt.lossless){const raw={};for(const k of Object.keys(p))raw[k]=Math.round(aiClamp(p[k])*1e6)/1e6;kit.raw=raw;}
    return kit;
  }
  // text/object in → applied, or throws with the source's own error list (nothing applied)
  function importKit(src){
    if(typeof src==='string'){try{src=JSON.parse(src)}catch(e){throw new Error('dolly: JSON syntax: '+e.message)}}
    const R=aiRun();
    if(!src||typeof src!=='object')throw new Error('dolly: expected a dollydrumz-kit/v1 object');
    const f=aiNorm(src.format);
    if(f.indexOf('set')>=0&&src.kit)src=src.kit;          // a dollydrumz-set/v1 carries the kit inside
    else if(f&&f.indexOf('kit')<0)throw new Error('dolly: format "'+src.format+'" is not a dollydrumz kit');
    const plan=aiReadKit(R,src);
    if(R.err.length||!plan)throw new Error('dolly: kit refused — '+R.err.join(' | '));
    applyKit(plan);
    return {warn:R.warn.slice(),info:['kit: '+plan.lanes.length+' lanes — '+plan.lanes.map(l=>l.name+'/'+AI_ENGINE_OUT[l.engine]).join(', ')]};
  }
  function audible(id){const anySolo=LANES.some(l=>trackSolo[l.id]);return !trackMute[id]&&(!anySolo||trackSolo[id]);}
  return {TR909DK,transport,get lanes(){return LANES},laneOf,audible,exportKit,importKit,
    get tomLink(){return tomLink}};
}

/* ───────────── presets: only data that exists in the source ───────────── */
const TOMS=['lt','mt','ht'];
function variantKit(name,engines){
  // factory lanes (VOICES), factory knobs (DEFAULTS); only the engine card per lane changes.
  return {format:AI_FMT.kit,name,base:'defaults',
    lanes:VOICES.map(v=>({id:v.id,role:v.role,name:v.name,label:v.label,engine:engines[v.id]||'909'}))};
}
const PRESETS=[
  {id:'factory',name:'909 Factory',cat:'909',
    kit:()=>variantKit('909 Factory',{})},
  {id:'909-sdsv-toms',name:'909 + SDS-V Toms',cat:'hybrid',
    kit:()=>variantKit('909 + SDS-V Toms',{lt:'sds-v',mt:'sds-v',ht:'sds-v'})},
  {id:'909-sds7-toms',name:'909 + SDS7 Toms',cat:'hybrid',
    kit:()=>variantKit('909 + SDS7 Toms',{lt:'sds7',mt:'sds7',ht:'sds7'})},
  {id:'sdsv-kit',name:'SDS-V Kit',cat:'simmons',
    // every lane that has an SDS-V card gets it; clap / crash / ride are 909-only
    kit:()=>variantKit('SDS-V Kit',{bd:'sds-v',sd:'sds-v',lt:'sds-v',mt:'sds-v',ht:'sds-v',rs:'sds-v',ch:'sds-v',oh:'sds-v'})},
  {id:'sds7-kit',name:'SDS7 Kit',cat:'simmons',
    // SDS7 cards exist for kick, snare, toms; hats/rim/cymbals stay 909 (source: "SDS7 hats were EPROM samples")
    kit:()=>variantKit('SDS7 Kit',{bd:'sds7',sd:'sds7',lt:'sds7',mt:'sds7',ht:'sds7'})},
  {id:'brief-example',name:'909 BD + SDS7 SD',cat:'hybrid',
    // the KIT EXAMPLE of the source's AI brief (dollydrumz.html 3447-3451) on the full factory lane set
    kit:()=>{const k=variantKit('909 BD + SDS7 SD',{sd:'sds7'});
      k.transport={bpm:124,master_db:-1.7,accent:85};
      k.machine={'ACCENT DEPTH':50,'SWEEP TIME':50,'ENV SHAPE':50,'PCM CLOCK':50,'OH CHOKE':50};
      k.toms={'TOM CHARACTER':50,note_lock:false,root_note:'F2',spacing_semitones:4,link:true};
      k.lanes[0].knobs={TUNE:44,'PITCH EXT':50,SWEEP:62,ATTACK:40,DECAY:70,DRIVE:58,LEVEL:88};
      k.lanes[1].knobs={'N PITCH':60,ATTACK:30,DECAY:48,BODY:40,NOISE:80,'N HOLD':25,FILTER:70,SWEEP:50,'FILT Q':20,CLICK:15,LEVEL:78};
      return k;}}
];

/* ───────────── macros: beginner controls on real knobs ───────────── */
// per card: the knob each macro drives on the first lane of that role.
const MACRO_DEFS=[
  {id:'kick_pitch',label:'Kick Pitch',role:'kick',keys:{tr909:'Pitch',sdsv:'SvPitch',sds7:'S7Pitch'}},
  {id:'kick_decay',label:'Kick Decay',role:'kick',keys:{tr909:'Decay',sdsv:'SvDecay',sds7:'S7Decay'}},
  {id:'snare_snappy',label:'Snare Snappy',role:'snare',keys:{tr909:'Snappy',sdsv:'SvNoise',sds7:'S7Noise'}},
  {id:'hat_decay',label:'Hat Decay',role:'hats'},
  {id:'metal_tune',label:'Metal Tune',global:'pcmClock'},
  {id:'accent',label:'Accent',global:'accentDepth'}
];

/* ───────────── worklet module: once per AudioContext ───────────── */
const moduleLoads=new WeakMap();
function loadWorklet(ctx){
  let p=moduleLoads.get(ctx);
  if(!p){
    p=(async()=>{
      const url=URL.createObjectURL(new Blob([WORKLET_909_SOURCE],{type:'application/javascript'}));
      try{await ctx.audioWorklet.addModule(url);}finally{try{URL.revokeObjectURL(url)}catch(_){}}
    })();
    moduleLoads.set(ctx,p);
    p.catch(()=>moduleLoads.delete(ctx));
  }
  return p;
}
function dbToGain(db){return Math.pow(10,db/20)}

// Engine-internal output trim (contract: typical preset loop peaks −10…−6 dBFS).
// The DSP and the source's MASTER (-1.72 dB) are untouched; this only scales the result.
const OUT_TRIM_DB=-6;

export default async function create(ctx,{out}={}){
  if(!ctx)throw new Error('dolly: AudioContext required');
  let K=makeKit();
  let presetId='factory';
  let outTrim=dbToGain(OUT_TRIM_DB);
  let node=null,stage=null,laneGains=[],disposed=false;
  const pending=[];
  const outGain=ctx.createGain();
  if(out)outGain.connect(out);
  const outLevel=()=>dbToGain(K.transport.master_db)*outTrim;
  outGain.gain.value=outLevel();

  function post(msg,transfer){if(node)node.port.postMessage(msg,transfer||[]);else pending.push(msg);}
  function route(){
    outGain.gain.setValueAtTime(outLevel(),ctx.currentTime);
    if(!node)return;
    const lanes=K.lanes.slice(0,MAX_SLOTS);
    try{node.disconnect()}catch(_){}
    while(laneGains.length<lanes.length){const g=ctx.createGain();g.connect(stage);laneGains.push(g);}
    lanes.forEach((l,i)=>{laneGains[i].gain.value=K.audible(l.id)?1:0;node.connect(laneGains[i],i,0);});
    for(let i=lanes.length;i<laneGains.length;i++)laneGains[i].gain.value=0;
    node.port.postMessage({type:'slots',slots:lanes.map((l,i)=>({slot:i,voice:l.id}))});
  }
  const ready=(async()=>{
    await loadWorklet(ctx);
    if(disposed)return;
    stage=new AudioWorkletNode(ctx,'tr909-outstage',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
    stage.connect(outGain);
    node=new AudioWorkletNode(ctx,'tr909-machine',{numberOfInputs:0,numberOfOutputs:MAX_SLOTS,outputChannelCount:new Array(MAX_SLOTS).fill(1)});
    // sendPCM() of the source
    const R=roms(),msg={type:'pcm',sourceRate:ROM909_SR},transfer=[];
    for(const k of ['hatOpen','hatClosed','crash','ride']){const a=new Float32Array(R[k]);msg[k]=a;transfer.push(a.buffer);}
    node.port.postMessage(msg,transfer);
    route();
    for(const m of pending.splice(0))node.port.postMessage(m);
  })();

  function laneIndex(kit,id){return kit.lanes.findIndex(l=>l.id===id);}
  function accentFor(kit,vel){return vel>=0.9?kit.transport.accent:0;}

  function macroKeys(def){
    const T=K.TR909DK;
    if(def.global)return [[def.global,0]];
    if(def.role==='hats'){
      // CH DECAY drives, OH DECAY follows with its factory offset (like TOM LINK's laneOffset)
      const ch=K.lanes.find(l=>l.role==='hh_closed'),oh=K.lanes.find(l=>l.role==='hh_open');
      const keys=[];
      const dk=(l)=>{const e=T.engineOf(l.id);return e==='sdsv'?l.id+'SvDecay':l.id+'Decay';};
      if(ch)keys.push([dk(ch),0]);
      if(oh){const k=dk(oh);const ref=keys[0]?keys[0][0]:null;
        const off=ref?((T.DEFAULTS[k]??0)-(T.DEFAULTS[ref]??0)):0;keys.push([k,off]);}
      return keys;
    }
    const l=K.lanes.find(x=>x.role===def.role);if(!l)return [];
    return [[l.id+def.keys[T.engineOf(l.id)],0]];
  }

  const engine={
    id:'dolly',kind:'drums',ready,

    presets:()=>PRESETS.map(p=>({id:p.id,name:p.name,cat:p.cat})),
    loadPreset(id){
      const p=PRESETS.find(x=>x.id===id);if(!p)throw new Error('dolly: unknown preset '+id);
      K.importKit(p.kit());presetId=id;route();
    },
    getPatch:()=>K.exportKit({lossless:true,name:(PRESETS.find(p=>p.id===presetId)||{}).name}),
    setPatch(obj){const r=K.importKit(obj);presetId=null;route();return r;},
    macros:()=>MACRO_DEFS.map(d=>{const ks=macroKeys(d),p=K.TR909DK.getParams();return {id:d.id,label:d.label,value:ks.length?p[ks[0][0]]:0};}),
    setMacro(id,v){
      const d=MACRO_DEFS.find(x=>x.id===id);if(!d)return;
      const x=Math.max(0,Math.min(1,Number(v)||0));
      for(const [k,off] of macroKeys(d))K.TR909DK.setParam(k,Math.max(0,Math.min(1,x+off)));
    },
    macroMap:()=>MACRO_DEFS.map(d=>({id:d.id,label:d.label,keys:macroKeys(d).map(([k,o])=>o?k+' (+'+o.toFixed(2)+')':k)})),

    noteOn(){},noteOff(){},
    lanes:()=>K.lanes.map(l=>({id:l.id,name:l.name,role:l.role})),
    hit(laneId,vel=1,time){
      if(disposed)return;
      const v=Number(vel);if(!(v>0))return;
      const slot=laneIndex(K,laneId);if(slot<0||slot>=MAX_SLOTS)return;
      const t=Number.isFinite(time)?time:ctx.currentTime;
      post(K.TR909DK.makeEvent(laneId,slot,t,accentFor(K,v)));
    },
    allOff(time){
      const t=Number.isFinite(time)?time:ctx.currentTime;
      post({type:'cancelFrom',time:t});
      post({type:'releaseAll',time:t,ramp:.005});
    },

    async renderStem({sampleRate,durationSec,events,patch}={}){
      const kit=patch?makeKit():K;
      if(patch)kit.importKit(patch);
      const sr=Number(sampleRate)||ctx.sampleRate||48000;
      const length=Math.max(1,Math.round((Number(durationSec)||0)*sr));
      const off=new OfflineAudioContext(2,length,sr);
      const master=off.createGain();
      master.gain.value=dbToGain(kit.transport.master_db)*outTrim;
      master.connect(off.destination);
      const lanes=kit.lanes.slice(0,MAX_SLOTS);
      // lane faders as AudioParams, so their float32 values match the source's dest.gain.value
      const faders=lanes.map(l=>{const g=off.createGain();g.gain.value=kit.audible(l.id)?1:0;return g;});
      const evs=[];
      for(const e of (events||[])){
        const v=Number(e&&e.vel);if(!(v>0))continue;
        const slot=laneIndex(kit,e.lane);if(slot<0||slot>=MAX_SLOTS)continue;
        evs.push(kit.TR909DK.makeEvent(e.lane,slot,Math.max(0,Number(e.t)||0),accentFor(kit,v)));
      }
      if(lanes.length&&evs.length){
        // ── finalizeOffline() of the source (2338-2370) ──
        const R=roms();
        const {TR909Core,TR909OutStage}=offlineClasses();
        const core=new TR909Core({
          sampleRate:sr,
          sourceRate:ROM909_SR,
          pcm:{hatOpen:R.hatOpen,hatClosed:R.hatClosed,crash:R.crash,ride:R.ride},
          slots:lanes.map((l,i)=>({slot:i,voice:l.id})),
          events:evs.slice().sort((a,b)=>a.time-b.time)
        });
        const bufs=lanes.map(()=>new Float32Array(length));
        const views=new Array(MAX_SLOTS).fill(null);
        for(let o=0;o<length;o+=128){
          const n=Math.min(128,length-o);
          for(let i=0;i<lanes.length;i++)views[i]=bufs[i].subarray(o,o+n);
          core.render(views,n);
        }
        const mix=new Float32Array(length);
        for(let i=0;i<lanes.length;i++){
          const gain=Number(faders[i].gain.value);
          const g=Number.isFinite(gain)?gain:1;
          const lane=bufs[i];
          for(let k=0;k<length;k++)mix[k]+=lane[k]*g;
        }
        const stg=new TR909OutStage({sampleRate:sr});
        stg.process(mix,length);
        const b=off.createBuffer(1,length,sr);
        b.copyToChannel(mix,0);
        const src=off.createBufferSource();
        src.buffer=b;src.connect(master);src.start(0);
      }
      return await off.startRendering();
    },

    /* extras (not in the contract) */
    setOutputTrim(db){outTrim=dbToGain(Number(db)||0);outGain.gain.setValueAtTime(outLevel(),ctx.currentTime);},
    get output(){return outGain},
    _kit:()=>K,

    dispose(){
      disposed=true;
      try{node&&node.port.postMessage({type:'panic'})}catch(_){}
      try{node&&node.disconnect()}catch(_){}
      for(const g of laneGains)try{g.disconnect()}catch(_){}
      try{stage&&stage.disconnect()}catch(_){}
      try{outGain.disconnect()}catch(_){}
      node=null;stage=null;laneGains=[];
    }
  };
  return engine;
}
