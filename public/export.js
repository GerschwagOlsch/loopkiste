// Offline export: every track is rendered by its own instrument engine (same DSP as live), then mixed
// through the same master chain as the live bus. Video = rendered mix + 9:16 canvas, recorded in real time.

export async function exportAudio({P,segs,inst,TRACKS,eventsForStep,fade=true,stems=false,progress=()=>{}}){
  const sr=48000,sd=60/P.bpm/4,ev={};TRACKS.forEach(t=>ev[t.id]=[]);
  let t=0;
  for(const seg of segs){const sc=P.scenes[seg.s];if(!sc)continue;const L=sc.bars*16;
    for(let r=0;r<seg.n;r++)for(let i=0;i<L;i++){for(const e of eventsForStep(P,sc,i,t,sd,P.swing,null))ev[e.track].push(e);t+=sd}}
  const total=t,tail=fade?0.05:2.5,dur=total+2.5,len=Math.ceil((total+tail)*sr);
  const rendered=[];const active=TRACKS.filter(tr=>!P.tracks[tr.id].mute&&ev[tr.id].length&&inst[tr.id]&&inst[tr.id].eng);
  let k=0;
  for(const tr of active){progress(k/(active.length+1),'Rendere '+tr.name+' …');
    const events=ev[tr.id].map(e=>tr.id==='drums'?{t:e.t,lane:e.lane,vel:e.vel}:{t:e.t,midi:e.midi,vel:e.vel,dur:e.dur});
    const buf=await inst[tr.id].eng.renderStem({sampleRate:sr,durationSec:dur,events,patch:P.tracks[tr.id].patch||undefined});
    rendered.push({id:tr.id,name:tr.name,buf,vol:P.tracks[tr.id].vol});k++}
  progress(k/(active.length+1),'Mische …');
  const off=new OfflineAudioContext(2,len,sr);
  const comp=off.createDynamicsCompressor();comp.threshold.value=-12;comp.knee.value=8;comp.ratio.value=3;comp.attack.value=.004;comp.release.value=.16;
  const lim=off.createDynamicsCompressor();lim.threshold.value=-1.5;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=.001;lim.release.value=.08;
  const master=off.createGain();master.gain.value=.9;comp.connect(lim);lim.connect(master);master.connect(off.destination);
  if(fade){const fl=Math.min(2,total*.25);master.gain.setValueAtTime(.9,Math.max(0,total-fl));master.gain.linearRampToValueAtTime(0,total)}
  for(const r of rendered){const s=off.createBufferSource();s.buffer=r.buf;const g=off.createGain();g.gain.value=r.vol;s.connect(g);g.connect(comp);s.start(0)}
  const mix=await off.startRendering();
  let peak=0;for(let c=0;c<mix.numberOfChannels;c++){const d=mix.getChannelData(c);for(let i=0;i<d.length;i++){const a=Math.abs(d[i]);if(a>peak)peak=a}}
  const out={mix,events:ev,total,peakDb:20*Math.log10(peak||1e-9),stems:[]};
  if(stems)for(const r of rendered){const b=new AudioBuffer({numberOfChannels:2,length:len,sampleRate:sr});for(let c=0;c<2;c++){const src=r.buf.getChannelData(Math.min(c,r.buf.numberOfChannels-1)).subarray(0,len);const dst=new Float32Array(len);for(let i=0;i<src.length;i++)dst[i]=src[i]*r.vol;b.copyToChannel(dst,c)}out.stems.push({name:r.name,buffer:b})}
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
    g.textAlign='right';g.font='800 24px Archivo, system-ui, sans-serif';g.fillStyle='#6c6480';g.fillText('Loopkiste · '+Math.round(P.bpm)+' BPM',W-60,1210);g.textAlign='center';
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
