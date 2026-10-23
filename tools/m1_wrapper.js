// M1 PCM engine for Loopkiste. Engine code = NWB m1.html ("M1 Factory Program Player v12"), VERBATIM
// (see tools/build_m1.js). New here: the factory wrapper, the DOM stub the player's status/LCD calls
// write into, output routing, categories, macros and the offline render (same procedure as the NWB
// slot's capturePattern: fresh graph on an OfflineAudioContext, notes pre-scheduled, voices pruned).
/*@@DATA@@*/

const _el=()=>({textContent:'',value:'',innerHTML:'',disabled:false,style:{},classList:{toggle(){},add(){},remove(){}},appendChild(){},dispatchEvent(){},addEventListener(){},click(){}});
const DOC_STUB={getElementById:()=>_el(),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>_el()};

function makeCore(__PCM){
  const document=DOC_STUB, window={};
/*@@CORE@@*/
  PCM=__PCM;
  function loadProgram(i){ // = selectProgram(i) without its UI refresh
    currentProgram=(i+100)%100;programState=clone(FACTORY_PROGRAMS[currentProgram]);editOsc=1;
    loadGlobalProgramParams();loadOscToParams();deriveFxModel(programState.fx);panic(false);
    if(audio){rebuildFactoryFx();applyGlobals()}
  }
  function applyPatchObject(obj){ // = applyAiObject(obj) without its UI refresh
    const x=sanitizeAiPatch(obj);programState=x.program;Object.assign(params,x.performance);dryReference=false;
    programState.userPatch=true;programState.raw=null;editOsc=1;
    loadGlobalProgramParams();loadOscToParams();deriveFxModel(programState.fx);panic(false);
    if(audio){rebuildFactoryFx();applyGlobals()}
  }
  function setState(prog,perf,cur){programState=clone(prog);Object.assign(params,perf);currentProgram=cur;editOsc=1;loadGlobalProgramParams();loadOscToParams();deriveFxModel(programState.fx);if(audio){rebuildFactoryFx();applyGlobals()}}
  function prune(at){for(const [note,arr] of [...voices])for(const v of [...arr])if(v&&Number.isFinite(v._offlineEnd)&&v._offlineEnd<=at+.000001)detachVoice(note,v)}
  return {init:(ctx,o)=>initAudioGraph(ctx,o),get limiter(){return limiter},get audio(){return audio},
    get state(){return programState},get current(){return currentProgram},params,
    loadProgram,applyPatchObject,setState,exportPatch:makeAiExport,extractJsonText,
    noteOn,noteOff,panic,prune,setOffline(b){_m1OfflineScheduling=!!b},rebuild(){if(audio){rebuildFactoryFx();applyGlobals()}}};
}

let PCM_DATA=null;
async function loadPcm(){if(PCM_DATA)return PCM_DATA;const r=await fetch(new URL('./m1_pcm.bin',import.meta.url));if(!r.ok)throw Error('M1 PCM: HTTP '+r.status);PCM_DATA=new Int16Array(await r.arrayBuffer());return PCM_DATA}

const CATS=[['Piano & Orgel',[1,11,17,21,31,41,47,51,61,67,70,71,91]],['Bass',[6,16,26,36,46,56,66,76]],
  ['Flächen & Chor',[0,3,7,13,20,23,27,30,42,43,53,57,60,63,73,83,90,97,98]],['Bläser & Holz',[2,8,12,18,22,32,40,52,62,72,82,87,92,99]],
  ['Synth',[19,38,39,48,58,77,81,86,93,96]],['Glocken & Mallets',[5,10,15,25,28,33,35,37,45,50,55,65,68,75,78]],
  ['Gitarre & Zupf',[4,14,24,34,44,54,64,74,79,84,94]],['Effekte',[59,69,80,85,88,89,95]]];
const CAT_OF={};for(const [c,ids] of CATS)for(const i of ids)CAT_OF[i]=c;
const PRESETS=FACTORY_PROGRAMS.filter(p=>p.mode!==2).map(p=>({id:p.id,name:p.name,cat:CAT_OF[p.id]||'Synth'}))
  .sort((a,b)=>CATS.findIndex(c=>c[0]===a.cat)-CATS.findIndex(c=>c[0]===b.cat));
const MACROS=[{id:'tone',label:'Ton'},{id:'attack',label:'Anschlag'},{id:'release',label:'Ausklang'},{id:'fx',label:'Effekt'}];

export default async function create(ctx,{out}={}){
  const pcm=await loadPcm();const core=makeCore(pcm);
  core.init(ctx,{ui:false,immediate:true});core.limiter.disconnect();core.limiter.connect(out||ctx.destination);
  core.loadProgram(1);
  const pend=new Map(); // midi -> queue of noteOn promises (group ids) for matching noteOffs
  const oscs=()=>{const s=core.state;return s.mode===1?[s.osc1,s.osc2]:[s.osc1]};
  const macroVal=id=>{const s=core.state,o=s.osc1;
    if(id==='tone')return o.vdf.cutoff/99;if(id==='attack')return o.vda.attackTime/99;if(id==='release')return o.vda.releaseTime/99;
    if(id==='fx')return (s.fx.balance1L+s.fx.balance1R+s.fx.balance2L+s.fx.balance2R)/4/99;return 0};
  const eng={id:'m1',kind:'synth',ready:Promise.resolve(),
    presets:()=>PRESETS,
    loadPreset(id){core.loadProgram(Number(id))},
    // Export = the player's own M1-AI-PATCH/1 format (pastes into the original). The extra 'lk' marker lets
    // Loopkiste restore its own saves losslessly; foreign patches go through the player's own import path.
    getPatch:()=>({...core.exportPatch(),lk:1}),
    setPatch(p){const obj=typeof p==='string'?core.extractJsonText(p):p;if(!obj||obj.format!=='M1-AI-PATCH/1'&&!obj.program)throw Error('kein M1-Patch');if(obj.lk&&obj.program){core.setState(obj.program,obj.performance||{},obj.basedOn?.factoryId??1);return}core.applyPatchObject(obj)},
    macros:()=>MACROS.map(m=>({...m,value:macroVal(m.id)})),
    setMacro(id,v){const x=Math.round(Math.max(0,Math.min(1,v))*99),s=core.state;
      if(id==='tone')oscs().forEach(o=>o.vdf.cutoff=x);if(id==='attack')oscs().forEach(o=>o.vda.attackTime=x);if(id==='release')oscs().forEach(o=>o.vda.releaseTime=x);
      if(id==='fx'){s.fx.balance1L=s.fx.balance1R=s.fx.balance2L=s.fx.balance2R=x;core.rebuild()}},
    noteOn(m,vel=.8,t){const g=core.noteOn(m,Math.max(1,Math.min(127,Math.round(vel*127))),t);if(!pend.has(m))pend.set(m,[]);pend.get(m).push(g)},
    noteOff(m,t){const q=pend.get(m);if(!q||!q.length){core.noteOff(m,t);return}const g=q.shift();Promise.resolve(g).then(id=>core.noteOff(m,t,id))},
    lanes:()=>[],hit(){},
    allOff(){pend.clear();core.panic(true)},
    async renderStem({sampleRate=48000,durationSec,events=[]}={}){
      const off=new OfflineAudioContext(2,Math.ceil(durationSec*sampleRate),sampleRate);
      const c=makeCore(pcm);c.setState(core.state,{...core.params},core.current);c.setOffline(true);c.init(off,{ui:false,immediate:true});
      const ev=[...events].sort((a,b)=>a.t-b.t);
      for(const e of ev){c.prune(e.t);const vel=Math.max(1,Math.min(127,Math.round((e.vel??.8)*127)));
        const gid=await c.noteOn(e.midi,vel,e.t);if(c.state.mode!==2)c.noteOff(e.midi,e.t+Math.max(.01,e.dur),gid)}
      return off.startRendering()},
    dispose(){try{core.panic(true);core.limiter.disconnect()}catch(_e){}}};
  return eng;
}
