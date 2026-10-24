// NWB Sonique itself: absolute tuning (A4) and level of pads, rendered by the NWB's own export path at its own rate
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const pg=await b.newPage();
await pg.goto('http://localhost:8792/nwb2/NocturneWB/workbench/sonique/sonique.html');await pg.waitForTimeout(2000);
const r=await pg.evaluate(async()=>{await window.__soniqueNwb.start();const SR=window.__soniqueNwb.getCtx().sampleRate;const out=[];
  const fft=(re,im)=>{const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}}for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let k=0;k<len/2;k++){const ur=re[i+k],ui=im[i+k],vr=re[i+k+len/2]*cr-im[i+k+len/2]*ci,vi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;re[i+k]=ur+vr;im[i+k]=ui+vi;re[i+k+len/2]=ur-vr;im[i+k+len/2]=ui-vi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t}}}};
  const peaks=(a,o,f0s)=>{const N=1<<18,re=new Float64Array(N),im=new Float64Array(N);for(let i=0;i<65536;i++)re[i]=a[i+o]*(0.5-0.5*Math.cos(2*Math.PI*i/65536));fft(re,im);const mag=k=>Math.hypot(re[k],im[k]);return f0s.map(f0=>{const k0=Math.round(f0*N/SR),w=Math.round(f0*0.07*N/SR);const found=[];for(let k=k0-w;k<=k0+w;k++){const m=mag(k);if(m>mag(k-1)&&m>=mag(k+1)&&m>mag(k0)*0.1){const x=mag(k-1),z=mag(k+1),pp=0.5*(x-z)/(x-2*m+z);found.push([(1200*Math.log2((k+pp)*SR/N/f0)),20*Math.log10(m)])}}found.sort((p,q)=>q[1]-p[1]);return found.slice(0,3).map(([c,d])=>c.toFixed(0)+'c('+d.toFixed(0)+'dB)').join(' ')})};
  for(const [bank,idx] of [['italo',6],['neon',7],['factory',3],['factory',28],['fctory1',25],['curated',27],['fctory5',5],['factory',0]]){
    factoryBankSel.value=bank;await loadBuiltInFactoryBank(bank);patchSel.value=String(idx);patchSel.onchange();await new Promise(r=>setTimeout(r,150));
    const r=await window.__soniqueNwb.renderEvents([{t:0,on:1,n:69,v:100},{t:2.9,on:0,n:69}],3,0,1);const L=r.left;let s=0;for(let i=SR;i<SR*2;i++)s+=L[i]*L[i];
    out.push(currentPatch().name.padEnd(10)+' A4-Spektrum: '+peaks(L,Math.round(SR*.5),[440]).join('')+' | RMS '+(20*Math.log10(Math.sqrt(s/SR))).toFixed(1)+' dBFS | Vol-Slider '+vol.value)}
  return out});
console.log(r.join('\n'));await b.close()})();
