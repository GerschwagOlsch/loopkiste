// Drum rack for Loopette: several DollyDrumz instances, one per drum machine (909 / SDS-V / SDS7),
// so a loop can hold e.g. a 909 kick AND a Simmons kick side by side. A rack lane is "<lane>@<card>".
// Each instance is the unmodified DollyDrumz engine (dolly.js); this file only routes between them.
import createDolly from './dolly.js';

export const CARDS=['909','sds-v','sds7'];
export const splitSlot=s=>{const i=String(s).indexOf('@');return i<0?{lane:s,card:'909'}:{lane:s.slice(0,i),card:s.slice(i+1)}};
export const slotId=(lane,card)=>lane+'@'+card;

export default async function create(ctx,{out}={}){
  const units={};           // card -> dolly engine (created on demand)
  let patch=null,preset=null;const macros={};let disposed=false;
  const first=await createDolly(ctx,{out});await first.ready;units['909']=first;
  const base=first;         // lane list / presets / macro definitions come from the real instrument

  async function unit(card){
    if(units[card])return units[card];
    const e=await createDolly(ctx,{out});await e.ready;
    if(patch)try{e.setPatch(patch)}catch(_e){}else if(preset)e.loadPreset(preset);
    for(const [k,v] of Object.entries(macros))e.setMacro(k,v);
    for(const l of e.lanes())if(l.cards.includes(card))e.setLaneEngine(l.id,card);
    units[card]=e;return e;
  }
  // every instance plays all of its lanes on its own card
  function routeAll(){for(const [card,e] of Object.entries(units))for(const l of e.lanes())if(l.cards.includes(card)&&l.engine!==card)e.setLaneEngine(l.id,card)}
  routeAll();

  const api={
    id:'dolly',kind:'drums',ready:Promise.resolve(),
    presets:()=>base.presets(),
    loadPreset(id){preset=id;patch=null;for(const e of Object.values(units))e.loadPreset(id);routeAll()},
    getPatch:()=>({...base.getPatch(),lkRack:1}),
    setPatch(obj){const o=typeof obj==='string'?JSON.parse(obj):obj;for(const e of Object.values(units))e.setPatch(o);patch=base.getPatch();preset=null;routeAll()},
    macros:()=>base.macros(),
    setMacro(id,v){macros[id]=v;for(const e of Object.values(units))e.setMacro(id,v)},
    // rack lanes: every (lane, card) combination the instrument offers
    lanes(){const out=[];for(const l of base.lanes())for(const card of l.cards)out.push({id:slotId(l.id,card),lane:l.id,card,name:l.name,role:l.role,engine:card,cards:l.cards});return out},
    laneDefs:()=>base.lanes(),
    /* make sure the instance for a card exists (call before the first hit on a new card) */
    prepare:card=>unit(card),
    hasUnit:card=>!!units[card],
    hit(slot,vel=1,time){const {lane,card}=splitSlot(slot);const e=units[card];if(e)e.hit(lane,vel,time);else unit(card).then(u=>u.hit(lane,vel))},
    noteOn(){},noteOff(){},
    allOff(t){for(const e of Object.values(units))e.allOff(t)},
    async renderStem({sampleRate,durationSec,events=[],patch:p}={}){
      const groups={};for(const ev of events){const {lane,card}=splitSlot(ev.lane);(groups[card]||(groups[card]=[])).push({...ev,lane})}
      const sr=sampleRate||ctx.sampleRate,n=Math.max(1,Math.round(durationSec*sr));const mix=new AudioBuffer({numberOfChannels:2,length:n,sampleRate:sr});
      for(const [card,evs] of Object.entries(groups)){const e=await unit(card);const b=await e.renderStem({sampleRate:sr,durationSec,events:evs,patch:p});
        for(let c=0;c<2;c++){const d=mix.getChannelData(c),s=b.getChannelData(Math.min(c,b.numberOfChannels-1));for(let i=0;i<Math.min(n,s.length);i++)d[i]+=s[i]}}
      return mix},
    dispose(){disposed=true;for(const e of Object.values(units))try{e.dispose()}catch(_e){}},
  };
  return api;
}
