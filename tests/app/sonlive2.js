// Sonique live worklet (real AudioContext, captured with a ScriptProcessor) vs renderStem at the same rate.
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
for(const id of ['neon:7','italo:6','factory:3','curated:27']){const p=await b.newPage();await p.goto('http://localhost:8791/');await p.waitForTimeout(300);
const r=await p.evaluate(async(id)=>{const m=await import('./engines/sonique.js');const ac=new AudioContext({sampleRate:48000});await ac.resume();const SR=ac.sampleRate;
  const tap=ac.createGain();const e=await m.default(ac,{out:tap});await e.ready;e.loadPreset(id);
  const sp=ac.createScriptProcessor(4096,2,2);const chunks=[];sp.onaudioprocess=ev=>{chunks.push({t:ev.playbackTime,d:ev.inputBuffer.getChannelData(0).slice()})};tap.connect(sp);sp.connect(ac.destination);
  const notes=[[0,69]];await new Promise(r=>setTimeout(r,300));const t0=ac.currentTime+.5;
  for(const [t,n] of notes){e.noteOn(n,.8,t0+t);e.noteOff(n,t0+t+1.5)}
  await new Promise(r=>setTimeout(r,4800));sp.disconnect();
  const st=await e.renderStem({sampleRate:SR,durationSec:4,events:notes.map(([t,n])=>({t,midi:n,vel:.8,dur:1.5}))});const S=st.getChannelData(0);
  // assemble live from t0
  const L=new Float32Array(SR*4);for(const c of chunks){const off=Math.round((c.t-t0)*SR);for(let i=0;i<c.d.length;i++){const k=off+i;if(k>=0&&k<L.length)L[k]=c.d[i]}}
  // find best alignment lag within ±2048 samples
  let bestLag=0,bestC=-1;for(let lag=-2048;lag<=2048;lag+=1){let s=0,a=0,b2=0;for(let i=SR*0.2;i<SR*1.2;i+=1){const j=i+lag;if(j<0||j>=L.length)continue;s+=L[j]*S[i];a+=L[j]*L[j];b2+=S[i]*S[i]}const c=s/Math.sqrt(a*b2+1e-20);if(c>bestC){bestC=c;bestLag=lag}}
  let md=0;for(let i=SR*0.2;i<SR*3.5;i++){const j=i+bestLag;if(j>=0&&j<L.length)md=Math.max(md,Math.abs(L[j]-S[i]))}
  const rms=(a,o)=>{let s=0;for(let i=SR;i<SR*1.5;i++)s+=a[i+o]*a[i+o];return (20*Math.log10(Math.sqrt(s/(SR*.5))+1e-9)).toFixed(1)};
  const fft=(re,im)=>{const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}}for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let k=0;k<len/2;k++){const ur=re[i+k],ui=im[i+k],vr=re[i+k+len/2]*cr-im[i+k+len/2]*ci,vi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;re[i+k]=ur+vr;im[i+k]=ui+vi;re[i+k+len/2]=ur-vr;im[i+k+len/2]=ui-vi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t}}}};
  const pitch=(a,o)=>{const N=1<<18,re=new Float64Array(N),im=new Float64Array(N);for(let i=0;i<65536;i++)re[i]=a[i+o+SR*0.4]*(0.5-0.5*Math.cos(2*Math.PI*i/65536));fft(re,im);const mag=k=>Math.hypot(re[k],im[k]);const res=[];for(const f0 of [220,440,880]){const k0=Math.round(f0*N/SR),w=Math.round(f0*0.06*N/SR);let bk=k0,bm=0;for(let k=k0-w;k<=k0+w;k++)if(mag(k)>bm){bm=mag(k);bk=k}const x=mag(bk-1),y=mag(bk),z=mag(bk+1),pp=0.5*(x-z)/(x-2*y+z);res.push((1200*Math.log2((bk+pp)*SR/N/f0)).toFixed(1)+'c@'+(20*Math.log10(bm+1e-9)).toFixed(0)+'dB')}return res.join(' ')};
  return {id,pitchLive:pitch(L,Math.max(0,bestLag)),pitchStem:pitch(S,0),corr:bestC.toFixed(4),lag:bestLag,maxDiffAligned:md.toExponential(2),rmsLive:rms(L,bestLag),rmsStem:rms(S,0)}},id);
console.log(JSON.stringify(r));await p.close()}
await b.close()})();
