/* Pure text/SSML helpers shared by the reading and dictation pages. */

export function norm(s){
  return (s||"").replace(/[\u064B-\u0652\u0670\u0640]/g,"")
    .replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه")
    .replace(/ؤ/g,"و").replace(/ئ/g,"ي")
    .replace(/[^\u0621-\u064A0-9a-zA-Z]/g,"").trim();
}

export function spellNorm(s){
  return (s||"").replace(/[\u064B-\u0652\u0670\u0640]/g,"")
    .replace(/[^\u0621-\u064A0-9]/g,"").trim();
}

export function sim(a,b){
  const aa=Array.from(a||''), bb=Array.from(b||'');
  if(!aa.length && !bb.length) return 1;
  if(!aa.length || !bb.length) return 0;
  const m=aa.length,n=bb.length,d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);
  for(let j=0;j<=n;j++) d[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(aa[i-1]===bb[j-1]?0:1));
  return 1-d[m][n]/Math.max(m,n);
}

export function accept(said,target){
  const t=norm(target), s=norm(said);
  if(!t) return true; if(!s) return false; if(s===t) return true;
  if(t.length>3 && s.includes(t)) return true;
  const th = t.length<=3 ? .95 : (t.length<=5 ? .75 : .68);
  return sim(s,t) >= th;
}

export function diff(a,b){
  const aa=Array.from(a||''), bb=Array.from(b||'');
  const m=aa.length,n=bb.length;
  const d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);
  for(let j=0;j<=n;j++) d[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(aa[i-1]===bb[j-1]?0:1));
  let i=m,j=n,out=[];
  while(i>0 || j>0){
    if(i>0 && j>0 && aa[i-1]===bb[j-1] && d[i][j]===d[i-1][j-1]){ out.unshift({c:bb[j-1],k:'g'}); i--; j--; }
    else if(i>0 && j>0 && d[i][j]===d[i-1][j-1]+1){ out.unshift({c:bb[j-1],k:'b'}); i--; j--; }
    else if(j>0 && d[i][j]===d[i][j-1]+1){ out.unshift({c:bb[j-1],k:'m'}); j--; }
    else { i--; }
  }
  return out;
}

export function buildAzureSSML(text, {voice='ar-JO-SanaNeural', rate=.9, stripTash=false, pausePreset='normal'}={}){
  const escapeXml=t=>String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const stripTashFn=t=>String(t||'').replace(/[\u064B-\u0652\u0670]/g,'');
  let clean=escapeXml(stripTash ? stripTashFn(text) : text);
  const pauseMap={short:{comma:110,end:250,colon:90},normal:{comma:170,end:360,colon:140},long:{comma:240,end:520,colon:200}};
  const pp=pauseMap[pausePreset]||pauseMap.normal;
  clean=clean.replace(/([،؛])/g,'$1<break time="'+pp.comma+'ms"/>').replace(/([.؟!])/g,'$1<break time="'+pp.end+'ms"/>').replace(/[:]/g,':<break time="'+pp.colon+'ms"/>');
  const clamped=Math.max(.65,Math.min(1.35,Number(rate||.9)));
  const delta=Math.round((clamped-1)*100);
  const rateStr=(delta>=0?'+':'')+delta+'%';
  return '<?xml version="1.0" encoding="utf-8"?><speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ar-JO"><voice name="'+escapeXml(voice)+'"><prosody rate="'+rateStr+'">'+clean+'</prosody></voice></speak>';
}
