const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:8791/');
const r=await p.evaluate(async()=>{const {encodeFlac,encodeWav,makeZip}=await import('./export.js');const sr=48000,n=sr*3+123;const buf=new AudioBuffer({numberOfChannels:2,length:n,sampleRate:sr});
 for(let c=0;c<2;c++){const d=buf.getChannelData(c);let ph=0;for(let i=0;i<n;i++){ph+=2*Math.PI*(c?330:220)/sr;d[i]=.6*Math.sin(ph)+.2*Math.sin(ph*7.01)+(Math.random()-.5)*.02*(i%9000<300?1:0)}}
 const t0=performance.now();const fl=await encodeFlac(buf,24);const ms=performance.now()-t0;const wav=new Blob([encodeWav(buf)]);
 const zip=await makeZip([{name:'a.flac',blob:fl},{name:'b/c.wav',blob:wav}]);
 const b64=x=>new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result.split(',')[1]);fr.readAsDataURL(x)});
 return {ms:Math.round(ms),flac:await b64(fl),wav:await b64(wav),zip:await b64(zip),flacBytes:fl.size,wavBytes:wav.size}});
fs.writeFileSync('/tmp/t.flac',Buffer.from(r.flac,'base64'));fs.writeFileSync('/tmp/t.wav',Buffer.from(r.wav,'base64'));fs.writeFileSync('/tmp/t.zip',Buffer.from(r.zip,'base64'));
console.log('encode ms',r.ms,'flac',r.flacBytes,'wav16',r.wavBytes);await b.close()})();
