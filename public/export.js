// Offline export: every track is rendered by its own instrument engine (same DSP as live), then mixed
// through the same master chain as the live bus. The mix starts clean and rings out. Stems are bar-exact:
// each one is exactly the arrangement length; the tail that would ring past the end is folded back onto
// the start, so every stem loops seamlessly and all stems line up bar for bar.
export async function exportAudio({P,segs,inst,TRACKS,eventsForStep,fade=true,stems=false,audible=null,progress=()=>{}}){
  const sr=48000,sd=60/P.bpm/4,ev={};TRACKS.forEach(t=>ev[t.id]=[]);
  let t=0;
  for(const seg of segs){
    // seg.s = scene letter for all tracks; seg.s==null = each track on its own current scene (loops side by side)
    const scOf=seg.s?(()=>P.scenes[seg.s]):(id=>P.scenes[P.tracks[id].scene]);
    const L=seg.s?P.scenes[seg.s].bars*16:Math.max(16,...TRACKS.map(id=>scOf(id.id).bars*16));
    for(let r=0;r<seg.n;r++)for(let i=0;i<L;i++){for(const e of eventsForStep(P,scOf,i,t,sd,P.swing,null))ev[e.track].push(e);t+=sd}}
  const total=t,tailSec=2.5,len=Math.round(total*sr),lenTail=Math.ceil((total+tailSec)*sr);
  const rendered=[];const active=TRACKS.filter(tr=>(audible?audible(tr.id):!P.tracks[tr.id].mute)&&ev[tr.id].length&&inst[tr.id]&&inst[tr.id].eng);
  let k=0;
  for(const tr of active){progress(k/(active.length+1),'Rendere '+tr.name+' …');
    const events=ev[tr.id].map(e=>tr.role==='drums'?{t:e.t,lane:e.lane,vel:e.vel}:{t:e.t,midi:e.midi,vel:e.vel,dur:e.dur});
    const raw=await inst[tr.id].eng.renderStem({sampleRate:sr,durationSec:total+tailSec,events,patch:P.tracks[tr.id].patch||undefined});
    // fold the tail back onto the start (loop-wrap), result is exactly `len` samples
    const buf=new AudioBuffer({numberOfChannels:2,length:len,sampleRate:sr});
    for(let c=0;c<2;c++){const src=raw.getChannelData(Math.min(c,raw.numberOfChannels-1)),d=new Float32Array(len);d.set(src.subarray(0,len));for(let i=len;i<Math.min(src.length,len+len);i++)d[i-len]+=src[i];buf.copyToChannel(d,c)}
    rendered.push({id:tr.id,name:tr.name,buf,raw,vol:P.tracks[tr.id].vol});k++}
  progress(k/(active.length+1),'Mische …');
  const mixLen=fade?len:lenTail;
  const off=new OfflineAudioContext(2,mixLen,sr);
  const comp=off.createDynamicsCompressor();comp.threshold.value=-12;comp.knee.value=8;comp.ratio.value=3;comp.attack.value=.004;comp.release.value=.16;
  const lim=off.createDynamicsCompressor();lim.threshold.value=-1.5;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=.001;lim.release.value=.08;
  const master=off.createGain();master.gain.value=.9;comp.connect(lim);lim.connect(master);master.connect(off.destination);
  if(fade){const fl=Math.min(2,total*.25);master.gain.setValueAtTime(.9,Math.max(0,total-fl));master.gain.linearRampToValueAtTime(0,total)}
  // the mix starts clean and rings out naturally (raw render); the stems are the loop-wrapped bar-exact versions
  for(const r of rendered){const s=off.createBufferSource();s.buffer=r.raw;const g=off.createGain();g.gain.value=r.vol;s.connect(g);g.connect(comp);s.start(0)}
  const mix=await off.startRendering();
  let peak=0;for(let c=0;c<mix.numberOfChannels;c++){const d=mix.getChannelData(c);for(let i=0;i<d.length;i++){const a=Math.abs(d[i]);if(a>peak)peak=a}}
  const out={mix,events:ev,total,bars:Math.round(total/sd/16),peakDb:20*Math.log10(peak||1e-9),stems:[]};
  if(stems)for(const r of rendered){const b=new AudioBuffer({numberOfChannels:2,length:len,sampleRate:sr});for(let c=0;c<2;c++){const src=r.buf.getChannelData(c);const dst=new Float32Array(len);for(let i=0;i<len;i++)dst[i]=src[i]*r.vol;b.copyToChannel(dst,c)}out.stems.push({id:r.id,name:r.name,buffer:b})}
  progress(1,'Fertig');return out;
}

export function encodeWav(buf){
  const ch=Math.min(2,buf.numberOfChannels),n=buf.length,sr=buf.sampleRate,ab=new ArrayBuffer(44+n*ch*2),v=new DataView(ab);
  const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
  w(0,'RIFF');v.setUint32(4,36+n*ch*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);v.setUint32(24,sr,true);v.setUint32(28,sr*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*ch*2,true);
  const data=[...Array(ch)].map((_,c)=>buf.getChannelData(c));let o=44;
  for(let i=0;i<n;i++)for(let c=0;c<ch;c++){let x=Math.max(-1,Math.min(1,data[c][i]));v.setInt16(o,x<0?x*32768:x*32767,true);o+=2}
  return ab;
}

const COLORS={drums:'#ff7a5c',bass:'#f4b942',chords:'#3fd1c1',lead:'#ff62b0'};
const NAMES={drums:'Drums',bass:'Bass',chords:'Akkorde',lead:'Lead'};
export async function exportVideo({ac,buffer,P,picture,caption,events,progress=()=>{}}){
  const W=720,H=1280,cv=document.createElement('canvas');cv.width=W;cv.height=H;const g=cv.getContext('2d');
  const img=await new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=picture});
  try{await document.fonts.load('850 64px Archivo');await document.fonts.load('600 30px Archivo')}catch(_e){}
  const types=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1,mp4a','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  const mime=types.find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t));if(!mime)throw Error('Dieser Browser kann kein Video aufnehmen');
  const dest=ac.createMediaStreamDestination(),src=ac.createBufferSource(),an=ac.createAnalyser();an.fftSize=256;src.buffer=buffer;src.connect(an);an.connect(dest);an.connect(ac.destination);
  const stream=new MediaStream([...cv.captureStream(30).getVideoTracks(),...dest.stream.getAudioTracks()]);
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6_000_000,audioBitsPerSecond:192_000});const chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  const done=new Promise(r=>rec.onstop=r);
  const last={drums:-9,bass:-9,chords:-9,lead:-9},ptr={drums:0,bass:0,chords:0,lead:0},spec=new Uint8Array(an.frequencyBinCount);
  const dur=buffer.duration;
  const frame=tt=>{
    for(const id in events){const a=events[id];while(ptr[id]<a.length&&a[ptr[id]].t<=tt){last[id]=a[ptr[id]].t;ptr[id]++}}
    const kick=Math.exp(-(tt-last.drums)*9);
    g.fillStyle='#14111d';g.fillRect(0,0,W,H);
    const grd=g.createRadialGradient(W/2,430,40,W/2,430,620);grd.addColorStop(0,'rgba(255,98,176,'+(0.16+0.18*kick)+')');grd.addColorStop(1,'rgba(20,17,29,0)');g.fillStyle=grd;g.fillRect(0,0,W,H);
    if(img){const s=1+0.025*kick,maxW=W-80,maxH=560,r=Math.min(maxW/img.width,maxH/img.height)*s,w=img.width*r,hh=img.height*r;g.imageSmoothingEnabled=img.width>200;g.drawImage(img,(W-w)/2,150+(maxH-hh)/2,w,hh)}
    g.fillStyle='#f3eef8';g.textAlign='center';g.font='850 62px Archivo, system-ui, sans-serif';g.fillText((P.name||'Loop').slice(0,22),W/2,820);
    if(caption){g.font='600 30px Archivo, system-ui, sans-serif';g.fillStyle='#a69fb7';g.fillText(caption.slice(0,40),W/2,868)}
    an.getByteFrequencyData(spec);const bars=48,bw=(W-120)/bars;for(let i=0;i<bars;i++){const v=spec[Math.floor(i*spec.length/bars*0.85)]/255;const bh=6+v*120;g.fillStyle='rgba(243,238,248,'+(0.25+0.6*v)+')';g.fillRect(60+i*bw+2,1010-bh,bw-4,bh)}
    const ids=['drums','bass','chords','lead'];ids.forEach((id,i)=>{const x=60+i*((W-120)/4),w=(W-120)/4-14,e=Math.exp(-(tt-last[id])*7);
      g.fillStyle=COLORS[id];g.globalAlpha=0.25+0.75*e;g.fillRect(x,1040,w,14);g.globalAlpha=1;g.fillStyle='#a69fb7';g.font='600 22px Archivo, system-ui, sans-serif';g.textAlign='left';g.fillText(NAMES[id],x,1090)});
    g.fillStyle='#352d47';g.fillRect(60,1150,W-120,6);g.fillStyle='#f3eef8';g.fillRect(60,1150,(W-120)*Math.min(1,tt/dur),6);
    g.textAlign='right';g.font='800 24px Archivo, system-ui, sans-serif';g.fillStyle='#6c6480';g.fillText('Loopette · '+Math.round(P.bpm)+' BPM',W-60,1210);g.textAlign='center';
  };
  frame(0);rec.start(250);const t0=ac.currentTime+.25;src.start(t0);
  await new Promise(res=>{const loop=()=>{const tt=ac.currentTime-t0;frame(Math.max(0,tt));progress(Math.min(1,tt/dur));if(tt>=dur+.15){res();return}setTimeout(loop,1000/30)};loop()});
  rec.stop();await done;src.disconnect();
  const ext=mime.startsWith('video/mp4')?'mp4':'webm';return {blob:new Blob(chunks,{type:mime.split(';')[0]}),ext};
}

// MP3 via LAME (lamejs 1.2.1, LGPL, vendored unmodified in vendor/lame.min.js — https://lame.sourceforge.io)
let lameP=null;
function loadLame(){if(window.lamejs&&window.lamejs.Mp3Encoder)return Promise.resolve(window.lamejs);
  if(!lameP)lameP=new Promise((res,rej)=>{const s=document.createElement('script');s.src='vendor/lame.min.js';s.onload=()=>res(window.lamejs);s.onerror=()=>{lameP=null;rej(Error('MP3-Encoder konnte nicht geladen werden'))};document.head.append(s)});return lameP}
export async function encodeMp3(buf,kbps=256,progress=()=>{}){
  const lame=await loadLame();const sr=buf.sampleRate,ch=Math.min(2,buf.numberOfChannels);
  const enc=new lame.Mp3Encoder(ch,sr,kbps);const L=buf.getChannelData(0),R=ch>1?buf.getChannelData(1):L;
  const toI16=(f,a,b)=>{const o=new Int16Array(b-a);for(let i=a;i<b;i++){const x=Math.max(-1,Math.min(1,f[i]));o[i-a]=x<0?x*32768:x*32767}return o};
  const out=[],block=1152*64;
  for(let i=0;i<L.length;i+=block){const e=Math.min(L.length,i+block);const d=ch>1?enc.encodeBuffer(toI16(L,i,e),toI16(R,i,e)):enc.encodeBuffer(toI16(L,i,e));if(d.length)out.push(new Uint8Array(d));progress(e/L.length);await new Promise(r=>setTimeout(r,0))}
  const f=enc.flush();if(f.length)out.push(new Uint8Array(f));
  return new Blob(out,{type:'audio/mpeg'});
}

// Integrated loudness, BS.1770-style: K-weighting (high shelf ≈+4 dB above 1.5 kHz, high-pass ≈38 Hz),
// mean square over 400 ms blocks with absolute gate −70 LUFS and relative gate −10 LU.
export async function loudness(buf){
  const sr=buf.sampleRate,off=new OfflineAudioContext(buf.numberOfChannels,buf.length,sr);
  const s=off.createBufferSource();s.buffer=buf;
  const hs=off.createBiquadFilter();hs.type='highshelf';hs.frequency.value=1681;hs.gain.value=4;
  const hp=off.createBiquadFilter();hp.type='highpass';hp.frequency.value=38;hp.Q.value=.5;
  s.connect(hs);hs.connect(hp);hp.connect(off.destination);s.start();
  const k=await off.startRendering();const B=Math.round(.4*sr),H=Math.round(.1*sr),blocks=[];
  for(let a=0;a+B<=k.length;a+=H){let ms=0;for(let c=0;c<k.numberOfChannels;c++){const d=k.getChannelData(c);let q=0;for(let i=a;i<a+B;i++)q+=d[i]*d[i];ms+=q/B}blocks.push(ms)}
  if(!blocks.length)return -70;
  const L=m=>-0.691+10*Math.log10(m+1e-20);
  let g=blocks.filter(m=>L(m)>-70);if(!g.length)return -70;
  const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;const rel=L(mean(g))-10;g=g.filter(m=>L(m)>rel);
  return L(mean(g));
}

/* ---- FLAC (own encoder: FIXED predictors 0..4, Rice coding, 24 bit, independent channels) ---- */
class BitW{constructor(){this.b=new Uint8Array(1<<16);this.n=0;this.acc=0;this.bits=0}
  w(v,n){ // v < 2^n, n <= 32
    while(n>0){const take=Math.min(n,16);n-=take;const part=n?Math.floor(v/Math.pow(2,n))&((1<<take)-1):(v&((1<<take)-1));this.acc=((this.acc<<take)|part)>>>0;this.bits+=take;
      while(this.bits>=8){this.bits-=8;this.push((this.acc>>>this.bits)&255)}this.acc&=(1<<this.bits)-1}}
  zeros(n){while(n>0){const take=Math.min(n,16);n-=take;this.acc=(this.acc<<take)>>>0;this.bits+=take;while(this.bits>=8){this.bits-=8;this.push((this.acc>>>this.bits)&255)}this.acc&=(1<<this.bits)-1}}
  s(v,n){this.w(v<0?v+Math.pow(2,n):v,n)}
  push(x){if(this.n>=this.b.length){const nb=new Uint8Array(this.b.length*2);nb.set(this.b);this.b=nb}this.b[this.n++]=x}
  align(){if(this.bits)this.zeros(8-this.bits)}
  bytes(){this.align();return this.b.subarray(0,this.n)}}
function crc8(a,n){let c=0;for(let i=0;i<n;i++){c^=a[i];for(let k=0;k<8;k++)c=(c&0x80)?((c<<1)^0x07)&255:(c<<1)&255}return c}
function crc16(a,n){let c=0;for(let i=0;i<n;i++){c^=a[i]<<8;for(let k=0;k<8;k++)c=(c&0x8000)?((c<<1)^0x8005)&0xffff:(c<<1)&0xffff}return c}
// folded residuals (zigzag) are kept in a Uint32Array so the Rice search is integer-only
function partCost(u,from,to){let sum=0;for(let i=from;i<to;i++)sum+=u[i];const mean=sum/Math.max(1,to-from);let p=mean>1?Math.min(30,Math.floor(Math.log2(mean))):0;
  let bits=(to-from)*(p+1);for(let i=from;i<to;i++)bits+=u[i]>>>p;return [p,bits]}
function encodeSubframe(bw,x,n,bps,res,u){
  let best=null;
  for(let o=0;o<=Math.min(4,n-1);o++){
    for(let i=o;i<n;i++){let r;switch(o){case 0:r=x[i];break;case 1:r=x[i]-x[i-1];break;case 2:r=x[i]-2*x[i-1]+x[i-2];break;case 3:r=x[i]-3*x[i-1]+3*x[i-2]-x[i-3];break;default:r=x[i]-4*x[i-1]+6*x[i-2]-4*x[i-3]+x[i-4]}res[i]=r;u[i]=r>=0?r*2:-r*2-1}
    let bo=0,bbits=Infinity,bparams=null;
    for(let po=0;po<=5;po++){const parts=1<<po;if(n%parts)break;const ps=n/parts;if(ps<=o&&po>0)break;let bits=0;const params=[];
      for(let q=0;q<parts;q++){const [p,b]=partCost(u,q===0?o:q*ps,(q+1)*ps);params.push(p);bits+=b+5}
      if(bits<bbits){bbits=bits;bo=po;bparams=params}else if(po>bo+1)break}
    const tot=o*bps+bbits;if(!best||tot<best.tot)best={o,po:bo,params:bparams,tot}}
  const {o,po,params}=best;
  // recompute the winning residual
  for(let i=o;i<n;i++){let r;switch(o){case 0:r=x[i];break;case 1:r=x[i]-x[i-1];break;case 2:r=x[i]-2*x[i-1]+x[i-2];break;case 3:r=x[i]-3*x[i-1]+3*x[i-2]-x[i-3];break;default:r=x[i]-4*x[i-1]+6*x[i-2]-4*x[i-3]+x[i-4]}u[i]=r>=0?r*2:-r*2-1}
  bw.w(0,1);bw.w(0b001000|o,6);bw.w(0,1);
  for(let i=0;i<o;i++)bw.s(x[i],bps);
  bw.w(1,2);bw.w(po,4);const parts=1<<po,ps=n/parts;
  for(let q=0;q<parts;q++){const p=params[q];bw.w(p,5);const from=q===0?o:q*ps,to=(q+1)*ps;const mask=(1<<p)-1;
    for(let i=from;i<to;i++){const v=u[i];bw.zeros(v>>>p);bw.w(1,1);if(p)bw.w(v&mask,p)}}
}
export async function encodeFlac(buf,bps=24,progress=()=>{}){
  const sr=buf.sampleRate,ch=Math.min(2,buf.numberOfChannels),N=buf.length,BS=4096,scale=Math.pow(2,bps-1)-1;
  const chans=[];for(let c=0;c<ch;c++){const f=buf.getChannelData(c),a=new Int32Array(N);for(let i=0;i<N;i++)a[i]=Math.max(-scale-1,Math.min(scale,Math.round(f[i]*scale)));chans.push(a)}
  const out=new BitW();const str='fLaC';for(let i=0;i<4;i++)out.w(str.charCodeAt(i),8);
  out.w(1,1);out.w(0,7);out.w(34,24);                     // last metadata block, STREAMINFO, 34 bytes
  out.w(BS,16);out.w(BS,16);out.w(0,24);out.w(0,24);out.w(sr,20);out.w(ch-1,3);out.w(bps-1,5);out.w(0,4);out.w(N,32);for(let i=0;i<16;i++)out.w(0,8);  // total samples (36 bit), MD5 unset
  const srCode=sr===44100?9:sr===48000?10:sr===96000?11:sr===88200?8:sr===32000?7:sr===22050?6:sr===16000?5:0;
  const res=new Int32Array(BS),u=new Uint32Array(BS);let frame=0;
  for(let pos=0;pos<N;pos+=BS,frame++){const n=Math.min(BS,N-pos);const fw=new BitW();
    fw.w(0xFFF8,16);fw.w(7,4);fw.w(srCode,4);fw.w(ch===2?1:0,4);fw.w(bps===24?6:bps===16?4:bps===20?5:0,3);fw.w(0,1);
    if(frame<0x80)fw.w(frame,8);else if(frame<0x800){fw.w(0xC0|(frame>>6),8);fw.w(0x80|(frame&63),8)}else if(frame<0x10000){fw.w(0xE0|(frame>>12),8);fw.w(0x80|((frame>>6)&63),8);fw.w(0x80|(frame&63),8)}else{fw.w(0xF0|(frame>>18),8);fw.w(0x80|((frame>>12)&63),8);fw.w(0x80|((frame>>6)&63),8);fw.w(0x80|(frame&63),8)}
    fw.w(n-1,16);const hdr=fw.bytes().slice();fw.w(crc8(hdr,hdr.length),8);
    for(let c=0;c<ch;c++)encodeSubframe(fw,chans[c].subarray(pos,pos+n),n,bps,res,u);
    fw.align();const body=fw.bytes();const crc=crc16(body,body.length);for(let i=0;i<body.length;i++)out.push(body[i]);out.w(crc,16);
    if(frame%16===15){progress(pos/N);await new Promise(r=>setTimeout(r,0))}}
  return new Blob([out.bytes()],{type:'audio/flac'});
}

/* ---- ZIP (store only) ---- */
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(a){let c=0xFFFFFFFF;for(let i=0;i<a.length;i++)c=CRC_T[(c^a[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
export async function makeZip(files){ // [{name, blob}]
  const enc=new TextEncoder();const parts=[];const central=[];let off=0;
  const u16=v=>[v&255,(v>>8)&255],u32=v=>[v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255];
  for(const f of files){const data=new Uint8Array(await f.blob.arrayBuffer()),name=enc.encode(f.name),crc=crc32(data);
    const lh=new Uint8Array([0x50,0x4b,3,4,20,0,0,8,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),0,0,...name]);
    parts.push(lh,data);
    central.push(new Uint8Array([0x50,0x4b,1,2,20,0,20,0,0,8,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),0,0,0,0,0,0,0,0,0,0,0,0,...u32(off),...name]));
    off+=lh.length+data.length}
  const cs=central.reduce((a,c)=>a+c.length,0);
  const end=new Uint8Array([0x50,0x4b,5,6,0,0,0,0,...u16(files.length),...u16(files.length),...u32(cs),...u32(off),0,0]);
  return new Blob([...parts,...central,end],{type:'application/zip'});
}
