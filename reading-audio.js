const readingAudioSettings={rate:0.7,stripTash:false,azureVoice:'ar-JO-SanaNeural',azureRegion:(window.READING_APP_CONFIG||{}).REGION || 'eastus'};
const readingAudioPlayers={azure:new Audio(),recording:new Audio(),azureObjectUrl:'',recordingObjectUrl:''};
readingAudioPlayers.azure.preload='auto';
readingAudioPlayers.recording.preload='auto';
const readingAzureState={generation:0,abort:null};


function loadAzureConfig(){
  try{ readingAudioSettings.azureVoice=localStorage.getItem('readingApp.azureVoice')||'ar-JO-SanaNeural'; }catch(e){}
  if($('azureVoiceSel')) $('azureVoiceSel').value=readingAudioSettings.azureVoice;
  if($('azureRegion')) $('azureRegion').value=readingAudioSettings.azureRegion;
}
function saveAzureConfig(){
  readingAudioSettings.azureVoice=$('azureVoiceSel')?.value || readingAudioSettings.azureVoice || 'ar-JO-SanaNeural';
  try{localStorage.setItem('readingApp.azureVoice',readingAudioSettings.azureVoice);}catch(e){}
}



function azureRate(r){return Math.max(.65,Math.min(1.35,Number(r||readingAudioSettings.rate||.9)));}
function escapeXml(t){return String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function stripTashFn(t){return String(t||'').replace(/[\u064B-\u0652\u0670]/g,'');}
function buildAzureSSML(text){
  let clean=escapeXml(readingAudioSettings.stripTash ? stripTashFn(text) : text);
  const pauseMap={short:{comma:110,end:250,colon:90},normal:{comma:170,end:360,colon:140},long:{comma:240,end:520,colon:200}};
  const pp=pauseMap[readingSession.pausePreset]||pauseMap.normal;
  clean=clean.replace(/([،؛])/g,'$1<break time="'+pp.comma+'ms"/>').replace(/([.؟!])/g,'$1<break time="'+pp.end+'ms"/>').replace(/[:]/g,':<break time="'+pp.colon+'ms"/>');
  const delta=Math.round((azureRate(readingAudioSettings.rate)-1)*100);
  const rateStr=(delta>=0?'+':'')+delta+'%';
  return '<?xml version="1.0" encoding="utf-8"?><speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ar-JO"><voice name="'+escapeXml(readingAudioSettings.azureVoice)+'"><prosody rate="'+rateStr+'">'+clean+'</prosody></voice></speak>';
}
function unlockAzureAudio(){
  try{
    if(!readingAudioPlayers.azure) return;
    if(!readingAudioPlayers.azure.paused) return;
    readingAudioPlayers.azure.src='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
    const p=readingAudioPlayers.azure.play();
    if(p&&p.then) p.then(()=>{try{readingAudioPlayers.azure.pause();readingAudioPlayers.azure.currentTime=0;}catch(e){}}).catch(()=>{});
  }catch(e){}
}
document.addEventListener('pointerdown',unlockAzureAudio,{once:false,passive:true});
document.addEventListener('touchstart',unlockAzureAudio,{once:false,passive:true});
async function azureSpeak(t,cb,options={}){
  const generation=++readingAzureState.generation;
  const text=String(t||'').trim();
  if(!text){cb&&cb();return;}
  try{
    saveAzureConfig();
    readingUi.setVoiceStatus('جارٍ تجهيز صوت Sana…');
    if(readingAzureState.abort){ try{readingAzureState.abort();}catch(e){} }
    readingAzureState.abort=new AbortController();
    const controller=readingAzureState.abort;
    const tokenData=await window.sanaSpeech.getToken(false);
    readingAudioSettings.azureRegion=tokenData.region || window.sanaSpeech.getRegion();
    readingAudioSettings.azureVoice=tokenData.voice || window.sanaSpeech.getVoice();
    const token=tokenData.token;
    if(generation!==readingAzureState.generation || controller.signal.aborted) return;
    if(!token) throw new Error('TOKEN_MISSING');
    const res=await fetch(`https://${readingAudioSettings.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,{
      method:'POST',
      headers:{
        'Authorization':'Bearer '+token,
        'Content-Type':'application/ssml+xml',
        'X-Microsoft-OutputFormat':'riff-24khz-16bit-mono-pcm'
      },
      body:buildAzureSSML(text),
      signal:controller.signal,
      cache:'no-store'
    });
    if(generation!==readingAzureState.generation || controller.signal.aborted) return;
    if(!res.ok){
      const e=new Error('TTS_HTTP_'+res.status);
      throw e;
    }
    const data=await res.arrayBuffer();
    if(generation!==readingAzureState.generation || controller.signal.aborted) return;
    if(!data || !data.byteLength) throw new Error('TTS_EMPTY_AUDIO');

    if(options.playWhenActive && (!readingPlaybackState.active || readingPlaybackState.paused)) return;
    if(readingAudioPlayers.azureObjectUrl){ try{URL.revokeObjectURL(readingAudioPlayers.azureObjectUrl);}catch(e){} }
    readingAudioPlayers.azureObjectUrl=URL.createObjectURL(new Blob([data],{type:'audio/wav'}));
    try{readingAudioPlayers.azure.pause();}catch(e){}
    try{readingAudioPlayers.azure.currentTime=0;}catch(e){}
    readingAudioPlayers.azure.src=readingAudioPlayers.azureObjectUrl;
    readingAudioPlayers.azure.playbackRate=1;
    await new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(ok,err)=>{ if(settled)return; settled=true; if(generation!==readingAzureState.generation) return resolve(); ok?resolve():reject(err||new Error('AUDIO_PLAY_FAILED')); };
      readingAudioPlayers.azure.onended=()=>{
        if(generation!==readingAzureState.generation) return finish(true);
        readingUi.setVoiceStatus('✓ تم تشغيل Sana');
        cb&&cb();
      };
      readingAudioPlayers.azure.onerror=()=>{
        if(generation===readingAzureState.generation) readingUi.setVoiceStatus('✕ تعذر تشغيل ملف Sana');
      };
      if(generation!==readingAzureState.generation || controller.signal.aborted) return;
      readingAudioPlayers.azure.play().then(()=>readingUi.setVoiceStatus('✓ Sana تعمل')).catch(err=>finish(false,err));
    });
  }catch(e){
    if(e?.name==='AbortError' || generation!==readingAzureState.generation) return;
    console.error('azureSpeak failed',e);
    readingUi.setVoiceStatus('✕ '+window.sanaSpeech.errorMessage(e));
    cb&&cb();
  }finally{
    if(generation===readingAzureState.generation) readingAzureState.abort=null;
  }
}
function revokeReadingObjectUrl(holder,key){
  const url=holder[key];
  if(!url)return;
  try{URL.revokeObjectURL(url);}catch(e){}
  holder[key]='';
}
function clearReadingAzurePlayer(){
  try{ readingAudioPlayers.azure.pause(); readingAudioPlayers.azure.currentTime=0; }catch(e){}
  revokeReadingObjectUrl(readingAudioPlayers,'azureObjectUrl');
  try{ readingAudioPlayers.azure.removeAttribute('src'); readingAudioPlayers.azure.load(); readingAudioPlayers.azure.ontimeupdate=null; readingAudioPlayers.azure.onplay=null; readingAudioPlayers.azure.onended=null; readingAudioPlayers.azure.onerror=null; readingAudioPlayers.azure.onloadedmetadata=null; readingAudioPlayers.azure.onloadeddata=null; readingAudioPlayers.azure.oncanplay=null; }catch(e){}
}

function cancelAzure(){
  readingAzureState.generation++;
  try{ if(readingAzureState.abort) readingAzureState.abort(); }catch(e){}
  readingAzureState.abort=null;
  clearReadingAzurePlayer();
}
async function testAzureSana(){
  readingUi.setVoiceStatus('🔎 فحص Sana…');
  try{
    saveAzureConfig();
    const tokenData=await window.sanaSpeech.getToken(true);
    readingAudioSettings.azureRegion=tokenData.region || window.sanaSpeech.getRegion();
    readingAudioSettings.azureVoice=tokenData.voice || window.sanaSpeech.getVoice();
    const token=tokenData.token;
    if(!token) throw new Error('TOKEN_MISSING');
    readingUi.setVoiceStatus('✓ Token يعمل — جارٍ اختبار الصوت…');
    await azureSpeak('مرحبًا، أنا سَنا. هذا اختبار للصوت العربي الواضح على جهازك.',null,{fallback:false,source:'test'});
  }catch(e){readingUi.setVoiceStatus('✕ '+window.sanaSpeech.errorMessage(e));}
}
window.sanaReadingAudio={speak:azureSpeak,cancel:cancelAzure,test:testAzureSana};


const readingRecordingState={full:{recorder:null,chunks:[],stream:null},word:{recorder:null,chunks:[],stream:null},set:new Set(),index:0};
const FULL_TEXT_KEY='__FULL_TEXT__';
const recNorm = value => norm(value);
const recGet = w => window.sanaRecordings.get(w, recNorm);
const recPut = (w,blob) => window.sanaRecordings.put(w,blob,recNorm);
const recDelete = w => window.sanaRecordings.remove(w,recNorm);
const recKeys = () => window.sanaRecordings.keys();
async function refreshRecSet(){
  readingRecordingState.set = new Set(await recKeys());
  document.querySelectorAll('.w').forEach((el,i)=>el.classList.toggle('rec', readingRecordingState.set.has(norm(readingLessonState.words[i]))));
  const d=$('rDone'); if(d) d.textContent = readingLessonState.words.filter(w=>readingRecordingState.set.has(norm(w))).length;
}
function hasRec(w){ return readingRecordingState.set.has(norm(w)); }
function testVoice(){ window.sanaReadingAudio.test(); }
function repeatCurrentWord(){ if(!readingLessonState.words[readingLessonState.idx])return; stopRead(); window.sanaReadingAudio.speak(readingLessonState.words[readingLessonState.idx],null,{source:'repeat-word',playWhenActive:false}); }
function pauseReading(){
  if(!readingPlaybackState.active){ readingUi.say('لا توجد قراءة جارية الآن.'); return; }
  if(readingPlaybackState.paused){
    readingPlaybackState.paused=false;
    $('pauseBtn').textContent='⏸ إيقاف مؤقت';
    try{ if(readingAudioPlayers.azure.src) readingAudioPlayers.azure.play().catch(()=>{}); }catch(e){}
    return;
  }
  readingPlaybackState.paused=true;
  $('pauseBtn').textContent='▶️ استئناف';
  try{ readingAudioPlayers.azure.pause(); }catch(e){}
}
let readingFullAudioCache={key:'',blob:null,text:'',duration:0,ready:false,loading:false,promise:null};
const FULL_AUDIO_DB='readingFullAudioCacheV1';
const FULL_AUDIO_STORE='audio';
function invalidateFullAudioCache(){
  readingFullAudioCache={key:'',blob:null,text:'',duration:0,ready:false,loading:false,promise:null};
}
function fullAudioKey(){
  return [sanaTextManager.current.id||'', readingLessonState.words.join(' '), readingAudioSettings.azureVoice, readingAudioSettings.rate, readingSession.pausePreset, readingAudioSettings.stripTash?'1':'0'].join('||');
}
function openFullAudioDB(){
  return new Promise((resolve,reject)=>{
    try{
      const r=indexedDB.open(FULL_AUDIO_DB,1);
      r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains(FULL_AUDIO_STORE)) r.result.createObjectStore(FULL_AUDIO_STORE); };
      r.onsuccess=()=>resolve(r.result);
      r.onerror=()=>reject(r.error||new Error('AUDIO_DB_OPEN_FAILED'));
    }catch(e){ reject(e); }
  });
}
async function fullAudioDBGet(key){
  try{
    const db=await openFullAudioDB();
    return await new Promise(resolve=>{
      const q=db.transaction(FULL_AUDIO_STORE,'readonly').objectStore(FULL_AUDIO_STORE).get(key);
      q.onsuccess=()=>resolve(q.result||null);
      q.onerror=()=>resolve(null);
    });
  }catch(e){ return null; }
}
async function fullAudioDBPut(key,blob){
  try{
    const db=await openFullAudioDB();
    await new Promise(resolve=>{
      const q=db.transaction(FULL_AUDIO_STORE,'readwrite').objectStore(FULL_AUDIO_STORE).put(blob,key);
      q.onsuccess=()=>resolve(); q.onerror=()=>resolve();
    });
  }catch(e){}
}
async function prepareFullAudio(showStatus=true){
  const text=readingLessonState.words.join(' ').trim();
  if(!text) return null;
  const key=fullAudioKey();
  if(readingFullAudioCache.key===key && readingFullAudioCache.ready && readingFullAudioCache.blob) return readingFullAudioCache;
  if(readingFullAudioCache.key===key && readingFullAudioCache.loading && readingFullAudioCache.promise) return readingFullAudioCache.promise;
  if(readingFullAudioCache.key!==key) invalidateFullAudioCache();
  const myKey=key;
  const promise=(async()=>{
    try{
      if(showStatus) readingUi.setVoiceStatus('☁️ التحقق من صوت النص المحفوظ…');
      const stored=await fullAudioDBGet(myKey);
      if(stored && stored.size>800){
        if(myKey!==fullAudioKey()) return null;
        readingFullAudioCache={key:myKey,blob:stored,text,duration:0,ready:true,loading:false,promise:null};
        if(showStatus) readingUi.setVoiceStatus('✓ الصوت المحفوظ جاهز — بدون إعادة تحميل');
        return readingFullAudioCache;
      }
      if(showStatus) readingUi.setVoiceStatus('☁️ تجهيز صوت النص الكامل لأول مرة…');
      saveAzureConfig();
      const tokenData=await window.sanaSpeech.getToken(false);
      readingAudioSettings.azureRegion=tokenData.region || window.sanaSpeech.getRegion();
      readingAudioSettings.azureVoice=tokenData.voice || window.sanaSpeech.getVoice();
      const token=tokenData.token;
      if(myKey!==fullAudioKey()) return null;
      const controller=new AbortController();
      const res=await fetch(`https://${readingAudioSettings.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,{
        method:'POST',
        headers:{'Authorization':'Bearer '+token,'Content-Type':'application/ssml+xml','X-Microsoft-OutputFormat':'riff-24khz-16bit-mono-pcm'},
        body:buildAzureSSML(text), signal:controller.signal, cache:'no-store'
      });
      if(!res.ok) throw new Error('TTS_HTTP_'+res.status);
      const data=await res.arrayBuffer();
      if(!data || !data.byteLength) throw new Error('TTS_EMPTY_AUDIO');
      if(myKey!==fullAudioKey()) return null;
      const blob=new Blob([data],{type:'audio/wav'});
      await fullAudioDBPut(myKey,blob);
      if(myKey!==fullAudioKey()) return null;
      readingFullAudioCache={key:myKey,blob,text,duration:0,ready:true,loading:false,promise:null};
      if(showStatus) readingUi.setVoiceStatus('✓ صوت النص الكامل جاهز ومحفوظ على الجهاز');
      return readingFullAudioCache;
    }catch(e){
      if(showStatus) readingUi.setVoiceStatus('✕ '+window.sanaSpeech.errorMessage(e));
      if(readingFullAudioCache.key===myKey) readingFullAudioCache.loading=false;
      throw e;
    }
  })();
  readingFullAudioCache={key,blob:null,text,duration:0,ready:false,loading:true,promise};
  return promise;
}

function readWordOnly(i){
  const text=readingLessonState.words[i]||'';
  if(!text){ stopRead(); return; }
  readingPlaybackState.index=i;
  hi(i);
  const done=()=>{ if(readingPlaybackState.active && !readingPlaybackState.paused) stopRead(); };
  window.sanaReadingAudio.speak(text,done,{source:'word',playWhenActive:true});
}

async function readFullTextAzure(){
  const text=readingLessonState.words.join(' ').trim();
  if(!text){ stopRead(); return; }
  readingPlaybackState.index=0;
  document.querySelectorAll('.w').forEach(el=>el.classList.remove('spk'));
  // مهم: لا نحرّك التأشير أثناء تجهيز الصوت.
  try{
    const cached=await prepareFullAudio(true);
    if(!readingPlaybackState.active || readingPlaybackState.paused || !cached || cached.key!==fullAudioKey()) return;
    revokeReadingObjectUrl(readingAudioPlayers,'azureObjectUrl');
    readingAudioPlayers.azureObjectUrl=URL.createObjectURL(cached.blob);
    try{readingAudioPlayers.azure.pause();}catch(e){}
    try{readingAudioPlayers.azure.currentTime=0;}catch(e){}
    readingAudioPlayers.azure.src=readingAudioPlayers.azureObjectUrl;
    readingAudioPlayers.azure.playbackRate=1;
    await new Promise((resolve,reject)=>{
      let settled=false;
      let metadataReady=false;
      const finish=(ok,err)=>{ if(settled)return; settled=true; ok?resolve():reject(err||new Error('AUDIO_PLAY_FAILED')); };
      const markReady=()=>{ metadataReady=true; readingFullAudioCache.duration=Number.isFinite(readingAudioPlayers.azure.duration)?readingAudioPlayers.azure.duration:0; };
      readingAudioPlayers.azure.onloadedmetadata=markReady;
      readingAudioPlayers.azure.onloadeddata=markReady;
      readingAudioPlayers.azure.oncanplay=markReady;
      readingAudioPlayers.azure.onerror=()=>finishReadingLesson(false,new Error('AUDIO_PLAY_FAILED'));
      // تتبع المؤشر من زمن الصوت الفعلي (currentTime)، وليس من مؤقتات مسبقة.
      // هذا يجعل حركة المؤشر مرتبطة بما تسمعينه فعليًا، سواء كان الصوت جديدًا أو محفوظًا.
      const totalChars=Math.max(1,text.length);
      const cumulative=[];
      let usedChars=0;
      readingLessonState.words.forEach(w=>{
        cumulative.push(usedChars/totalChars);
        usedChars += w.length+1;
      });
      const updateHighlight=()=>{
        if(!readingPlaybackState.active || readingPlaybackState.paused) return;
        const total=Number.isFinite(readingAudioPlayers.azure.duration) && readingAudioPlayers.azure.duration>0 ? readingAudioPlayers.azure.duration : 0;
        if(!total) return;
        const ratio=Math.max(0,Math.min(0.999999,readingAudioPlayers.azure.currentTime/total));
        let lo=0,hiIdx=readingLessonState.words.length-1,ans=0;
        while(lo<=hiIdx){
          const mid=(lo+hiIdx)>>1;
          if(cumulative[mid] <= ratio){ ans=mid; lo=mid+1; }
          else hiIdx=mid-1;
        }
        hi(ans);
      };
      readingAudioPlayers.azure.ontimeupdate=updateHighlight;
      readingAudioPlayers.azure.onplay=()=>{
        if(!readingPlaybackState.active || readingPlaybackState.paused) return;
        document.querySelectorAll('.w').forEach(el=>el.classList.remove('spk'));
        hi(0);
        updateHighlight();
      };
      readingAudioPlayers.azure.onended=()=>{ finishReadingLesson(true); if(readingPlaybackState.active && !readingPlaybackState.paused) stopRead(); };
      readingAudioPlayers.azure.play().then(()=>{ if(!metadataReady){} }).catch(err=>finishReadingLesson(false,err));
    });
  }catch(e){
    if(readingPlaybackState.active) readingUi.setVoiceStatus('✕ '+window.sanaSpeech.errorMessage(e));
    stopRead();
  }
}

async function readAloud(from){
  if(readingPlaybackState.active){ stopRead(); return; }

  // Stop any active recording before starting the single reader.
  clearReadingRecordingPlayer();

  stopMic();
  readingPlaybackState.paused=false;
  $('pauseBtn').textContent='⏸ إيقاف مؤقت';
  readingPlaybackState.active=true;
  $('readBtn').textContent='⏹ وقّف القراءة';
  readingPlaybackState.index=(readingSession.mode==='full') ? 0 : (from!==undefined ? from : readingLessonState.idx);

  if(readingSession.mode==='full'){
    await readFullTextAzure();
    return;
  }
  readWordOnly(readingPlaybackState.index);
}

function stopRead(){
  readingPlaybackState.active=false;
  readingPlaybackState.paused=false;
  cancelAzure();
  clearReadingRecordingPlayer();
  document.querySelectorAll('.w').forEach(el=>el.classList.remove('spk'));
  $('readBtn').textContent='📖 اقرأ لي النص';
  $('pauseBtn').textContent='⏸ إيقاف مؤقت';
  paintReadingLesson();
}
