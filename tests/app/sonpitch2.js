const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p2=await b.newPage();await p2.goto('http://localhost:8792/loopkiste/public/index.html');await p2.waitForTimeout(500);
const r=await p2.evaluate(async()=>{const m=await import('./engines/sonique.js');const ac=new AudioContext({sampleRate:48000});const e=await m.default(ac,{out:ac.destination});await e.ready;
 const L=await m.__test.getLib();const out=[JSON.stringify(L.banks.fctory1[25].oscillators[0])];
 // precise pitch via zero-padded DFT peak search around expected harmonics: use a single-osc-friendly approach: find peak bin near 440 with parabolic interp on 2^17 FFT of 2 s
 const fft=(re,im)=>{const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}}for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let k=0;k<len/2;k++){const ur=re[i+k],ui=im[i+k],vr=re[i+k+len/2]*cr-im[i+k+len/2]*ci,vi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;re[i+k]=ur+vr;im[i+k]=ui+vi;re[i+k+len/2]=ur-vr;im[i+k+len/2]=ui-vi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t}}}};
 for(const id of ['italo:6','neon:7','factory:3','factory:28','fctory1:25','fctory1:35','curated:11','fctory5:5','fctory5:6','fctory3:27']){e.loadPreset(id);
  const buf=await e.renderStem({sampleRate:48000,durationSec:3,events:[{t:0,midi:69,vel:.8,dur:2.9}]});const d=buf.getChannelData(0).subarray(24000,24000+65536);
  const N=1<<18,re=new Float64Array(N),im=new Float64Array(N);for(let i=0;i<d.length;i++)re[i]=d[i]*(0.5-0.5*Math.cos(2*Math.PI*i/d.length));fft(re,im);
  const mag=k=>Math.hypot(re[k],im[k]);const peaks=[];for(const f0 of [110,220,440,880]){const k0=Math.round(f0*N/48000),w=Math.round(f0*0.06*N/48000);let bk=k0,bm=0;for(let k=k0-w;k<=k0+w;k++)if(mag(k)>bm){bm=mag(k);bk=k}
   const a=mag(bk-1),b2=mag(bk),c=mag(bk+1),p=0.5*(a-c)/(a-2*b2+c);const f=(bk+p)*48000/N;peaks.push(f.toFixed(2)+'Hz('+(1200*Math.log2(f/f0)).toFixed(0)+'c,'+(20*Math.log10(bm+1e-9)).toFixed(0)+'dB)')}
  out.push(id+' '+L.presetList.find(p=>p.id===id).name+' : '+peaks.join(' '))}
 return out});
console.log(r.join('\n'));await b.close()})();
