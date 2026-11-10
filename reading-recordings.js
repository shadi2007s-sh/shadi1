/* Sana Reading — recording & microphone subsystem */
const mobileMicState={stream:null,recorder:null,chunks:[],timer:0,ctx:null,sourceNode:null,analyser:null,silenceTimer:0,monitorTimer:0,sawSpeech:false,startedAt:0};

function stopMobileMicTracks(){
  clearTimeout(mobileMicState.timer);
  clearTimeout(mobileMicState.silenceTimer);
  clearTimeout(mobileMicState.monitorTimer);
  try{mobileMicState.sourceNode?.disconnect();}catch(e){}
  try{mobileMicState.analyser?.disconnect();}catch(e){}
  try{mobileMicState.ctx?.close();}catch(e){}
  try{mobileMicState.stream?.getTracks().forEach(t=>t.stop());}catch(e){}
  Object.assign(mobileMicState,{stream:null,recorder:null,chunks:[],timer:0,ctx:null,sourceNode:null,analyser:null,silenceTimer:0,monitorTimer:0,sawSpeech:false,startedAt:0});
}

function startMobileSpeechMonitor(stream, recorder, token){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC || !stream) return false;
  try{
    const ctx=new AC();
    const source=ctx.createMediaStreamSource(stream);
    const analyser=ctx.createAnalyser();
    analyser.fftSize=1024;
    analyser.smoothingTimeConstant=0.15;
    source.connect(analyser);
    mobileMicState.ctx=ctx;
    mobileMicState.sourceNode=source;
    mobileMicState.analyser=analyser;
    mobileMicState.sawSpeech=false;
    mobileMicState.startedAt=Date.now();
    const data=new Uint8Array(analyser.fftSize);
    const check=()=>{
      if(token!==readingAudioTokens.mic || !readingMicState.active || mobileMicState.recorder!==recorder) return;
      analyser.getByteTimeDomainData(data);
      let sum=0;
      for(let i=0;i<data.length;i++){ const x=(data[i]-128)/128; sum+=x*x; }
      const rms=Math.sqrt(sum/data.length);
      const elapsed=Date.now()-mobileMicState.startedAt;
      const speaking=rms>0.035;
      if(speaking){
        mobileMicState.sawSpeech=true;
        clearTimeout(mobileMicState.silenceTimer);
        mobileMicState.silenceTimer=0;
      }else if(mobileMicState.sawSpeech && elapsed>1100 && !mobileMicState.silenceTimer){
        mobileMicState.silenceTimer=setTimeout(()=>{
          if(token!==readingAudioTokens.mic || !readingMicState.active || mobileMicState.recorder!==recorder) return;
          try{if(recorder.state!=='inactive') recorder.stop();}catch(e){}
        },650);
      }
      mobileMicState.monitorTimer=setTimeout(check,120);
    };
    ctx.resume().catch(()=>{});
    check();
    return true;
  }catch(e){ return false; }
}

function chooseRecordMime(){
  const types=['audio/ogg;codecs=opus','audio/webm;codecs=opus','audio/webm','audio/mp4'];
  return types.find(t=>window.MediaRecorder?.isTypeSupported?.(t))||'';
}

async function blobToWav16kMono(blob){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC) throw new Error('AUDIO_CONTEXT_UNSUPPORTED');
  const ctx=new AC();
  try{
    await ctx.resume().catch(()=>{});
    const buf=await blob.arrayBuffer();
    const decoded=await ctx.decodeAudioData(buf.slice(0));
    const targetRate=16000;
    const frames=Math.max(1,Math.ceil(decoded.duration*targetRate));
    const offline=new OfflineAudioContext(1,frames,targetRate);
    const src=offline.createBufferSource(); src.buffer=decoded; src.connect(offline.destination); src.start(0);
    const rendered=await offline.startRendering();
    const ch=rendered.getChannelData(0), dataLen=ch.length*2;
    // Find peak amplitude and normalize so quiet recordings are boosted
    let peak=0;
    for(let i=0;i<ch.length;i++){ const v=Math.abs(ch[i]); if(v>peak) peak=v; }
    const gain = peak > 0.01 ? Math.min(3, 0.9/peak) : 1; // cap boost at 3x
    const out=new ArrayBuffer(44+dataLen),dv=new DataView(out);
    const write=(o,str)=>{for(let i=0;i<str.length;i++)dv.setUint8(o+i,str.charCodeAt(i));};
    write(0,'RIFF');dv.setUint32(4,36+dataLen,true);write(8,'WAVE');write(12,'fmt ');
    dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,targetRate,true);
    dv.setUint32(28,targetRate*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);write(36,'data');dv.setUint32(40,dataLen,true);
    let off=44;for(let i=0;i<ch.length;i++){const x=Math.max(-1,Math.min(1,ch[i]*gain));dv.setInt16(off,x<0?x*0x8000:x*0x7fff,true);off+=2;}
    return new Blob([out],{type:'audio/wav'});
  }finally{try{await ctx.close();}catch(e){}}
}

async function transcribeWavWithAzure(wav,token){
  const url=`https://${readingAudioSettings.azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=ar-SA&format=detailed`;
  const res=await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'audio/wav; codecs=audio/pcm; samplerate=16000','Accept':'application/json'},body:wav,cache:'no-store'});
  const body=await res.text();
  if(!res.ok) throw new Error('STT_HTTP_'+res.status+(body?' '+body.slice(0,180):''));
  let data={};try{data=JSON.parse(body||'{}');}catch(e){throw new Error('STT_BAD_JSON');}
  // Use DisplayText/Display only — Lexical can return Latin-script
  // phonetic transliterations, which we don't want here.
  let text=(data.DisplayText||data.NBest?.[0]?.Display||'').trim();
  // Reject any result that contains Latin letters — treat as no match
  // rather than accepting/showing an English word.
  if(text && /[A-Za-z]/.test(text)){
    text='';
  }
  return {text,data};
}

async function startMic(){
  const token=++readingAudioTokens.mic;
  if(!window.isSecureContext){readingUi.say('🔒 يجب فتح الموقع عبر HTTPS حتى يعمل المايك.');return;}
  if(readingMicState.active)return;
  stopRead();stopMobileMicTracks();
  try{
    if(!navigator.mediaDevices?.getUserMedia) throw new Error('MIC_UNSUPPORTED');
    if(!window.MediaRecorder) throw new Error('RECORDER_UNSUPPORTED');
    readingUi.say('🎤 جاري فتح المايك…');
    const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    if(token!==readingAudioTokens.mic){stream.getTracks().forEach(t=>t.stop());return;}
    const mime=chooseRecordMime();
    const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
    mobileMicState.stream=stream;mobileMicState.recorder=recorder;mobileMicState.chunks=[];
    recorder.ondataavailable=e=>{if(e.data?.size)mobileMicState.chunks.push(e.data);};
    recorder.onerror=e=>{if(token===readingAudioTokens.mic){readingUi.say('⚠️ حدث خطأ أثناء تسجيل الصوت.');stopMic();}};
    recorder.onstop=async()=>{
      const myToken=token;
      const chunks=mobileMicState.chunks.slice();
      const mimeType=recorder.mimeType||mime||'audio/webm';
      const blob=new Blob(chunks,{type:mimeType});
      stopMobileMicTracks();
      if(myToken!==readingAudioTokens.mic)return;
      readingMicState.active=false;$('micBtn').classList.remove('on');$('micBtn').textContent='🎤 ابدئي القراءة';
      if(blob.size<1000){readingUi.say('🎤 لم يتم تسجيل صوت واضح.');return;}
      try{
        readingUi.say('☁️ أجهّز الصوت للتعرّف…');
        const tokenData=await window.sanaSpeech.getToken(false);if(myToken!==readingAudioTokens.mic)return;
        readingAudioSettings.azureRegion=tokenData.region || window.sanaSpeech.getRegion();
        readingAudioSettings.azureVoice=tokenData.voice || window.sanaSpeech.getVoice();
        const speechToken=tokenData.token;
        const wav=await blobToWav16kMono(blob);if(myToken!==readingAudioTokens.mic)return;
        if(wav.size<5000){readingUi.say('🎤 التسجيل قصير جدًا. جرّبي أن تبدئي الكلام بعد ظهور الرسالة مباشرة.');return;}
        readingUi.say('☁️ أتعرّف على الكلمة…');
        const r=await transcribeWavWithAzure(wav,speechToken);if(myToken!==readingAudioTokens.mic)return;
        if(r.text){
          handleT(r.text);
        }else{
          readingUi.say('🎤 لم أفهم الكلمة بوضوح. جرّبي تحكيها ببطء وبصوت أعلى قليلاً.');
        }
      }catch(e){
        console.error('Azure mobile STT',e);
        if(myToken===readingAudioTokens.mic){
          const m=String(e?.message||e||'');
          if(m==='STT_BAD_JSON')readingUi.say('⚠️ Azure أرسل استجابة غير متوقعة.');
          else if(m.startsWith('STT_HTTP_401'))readingUi.say('⚠️ رمز Azure غير صالح لهذا التعرف.');
          else if(m.startsWith('STT_HTTP_403'))readingUi.say('⚠️ Azure رفض طلب التعرف على الصوت.');
          else if(m.startsWith('STT_HTTP_400'))readingUi.say('⚠️ Azure رفض التسجيل الصوتي.');
          else if(m==='AUDIO_CONTEXT_UNSUPPORTED')readingUi.say('⚠️ المتصفح لا يدعم تحويل التسجيل الصوتي.');
          else readingUi.say('⚠️ تعذر التعرف على الكلام: '+m);
        }
      }
    };
    recorder.start();
    readingMicState.active=true;$('micBtn').classList.add('on');$('micBtn').textContent='⏹ إيقاف التسجيل';
    readingUi.say('🎙 اقرئي الكلمة الآن: '+(readingLessonState.words[readingLessonState.idx]||''));
    // Smart mobile capture: up to 3800ms, but stop earlier after a detected
    // spoken word followed by a short silence. Falls back to the full window
    // on browsers where the analyser is unavailable.
    startMobileSpeechMonitor(stream,recorder,token);
    mobileMicState.timer=setTimeout(()=>{
      if(token!==readingAudioTokens.mic)return;
      try{if(recorder.state!=='inactive')recorder.stop();}catch(e){}
    },3800);
  }catch(e){
    console.error('mobile mic start failed',e);readingMicState.active=false;stopMobileMicTracks();$('micBtn').classList.remove('on');$('micBtn').textContent='🎤 ابدئي القراءة';
    if(e?.name==='NotAllowedError')readingUi.say('🎤 اسمحي للمتصفح باستخدام المايك ثم اضغطي مرة أخرى.');
    else readingUi.say('⚠️ تعذر تشغيل المايك: '+(e?.message||e));
  }
}

function stopMic(){
  ++readingAudioTokens.mic;
  readingMicState.active=false;
  try{if(mobileMicState.recorder && mobileMicState.recorder.state!=='inactive') mobileMicState.recorder.stop();}catch(e){}
  stopMobileMicTracks();
  $('micBtn').classList.remove('on'); $('micBtn').textContent='🎤 ابدئي القراءة';
}

function stopAll(){stopMic();stopRead();}
async function createReadingRecorderCapture(){
  if(!navigator.mediaDevices || !window.MediaRecorder) throw new Error('RECORDER_UNSUPPORTED');
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const mime=chooseRecordMime();
  const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
  const chunks=[];
  recorder.ondataavailable=e=>{ if(e.data && e.data.size) chunks.push(e.data); };
  return {stream,recorder,chunks};
}

function stopReadingRecorderCapture(capture){
  if(!capture)return;
  try{ if(capture.recorder && capture.recorder.state!=='inactive') capture.recorder.stop(); }catch(e){}
  try{ capture.stream && capture.stream.getTracks().forEach(t=>t.stop()); }catch(e){}
}

async function refreshFullRecording(){
  const b = await recGet(FULL_TEXT_KEY);
  $('fState').textContent = b ? '✅ مسجّل — النص كامل جاهز' : '— مش مسجّل بعد';
}
async function startFullRecording(ev){
  ev.preventDefault();
  const token=++readingAudioTokens.full;
  if(!navigator.mediaDevices || !window.MediaRecorder){ $('fState').textContent='المتصفح ما بيدعم التسجيل'; return; }
  try{
    const capture=await createReadingRecorderCapture();
    readingRecordingState.full.stream=capture.stream; readingRecordingState.full.recorder=capture.recorder; readingRecordingState.full.chunks=capture.chunks;
    if(token!==readingAudioTokens.full){ stopReadingRecorderCapture(capture); return; }
    readingRecordingState.full.recorder.onstop = async ()=>{
      const blob = new Blob(readingRecordingState.full.chunks, {type: (readingRecordingState.full.recorder && readingRecordingState.full.recorder.mimeType) || 'audio/webm'});
      if(blob.size > 800) await recPut(FULL_TEXT_KEY, blob);
      try{ readingRecordingState.full.stream.getTracks().forEach(t=>t.stop()); }catch(e){}
      $('fRec').textContent='⏺ اضغطي واقرئي النص كامل';
      await refreshFullRecording();
    };
    readingRecordingState.full.recorder.start();
    $('fRec').textContent='🔴 بسجّل… اقرئي النص، ارفعي إصبعك لما تخلّصي';
    $('fState').textContent='بسجّل الآن 🎙';
  }catch(e){ $('fState').textContent='المايك مرفوض ⛔'; }
}
function stopFullRecording(){ ++readingAudioTokens.full; try{ if(readingRecordingState.full.recorder && readingRecordingState.full.recorder.state!=='inactive') readingRecordingState.full.recorder.stop(); }catch(e){} try{ readingRecordingState.full.stream && readingRecordingState.full.stream.getTracks().forEach(t=>t.stop()); }catch(e){} }
function clearReadingRecordingPlayer(){
  try{ readingAudioPlayers.recording.pause(); readingAudioPlayers.recording.currentTime=0; }catch(e){}
  revokeReadingObjectUrl(readingAudioPlayers,'recordingObjectUrl');
  try{ readingAudioPlayers.recording.removeAttribute('src'); readingAudioPlayers.recording.load(); readingAudioPlayers.recording.onended=null; readingAudioPlayers.recording.onerror=null; }catch(e){}
}
async function playFullRecording(){
  const b = await recGet(FULL_TEXT_KEY);
  if(!b){ $('fState').textContent='ما في تسجيل بعد'; return; }
  clearReadingRecordingPlayer();
  readingAudioPlayers.recordingObjectUrl=URL.createObjectURL(b);
  readingAudioPlayers.recording.src=readingAudioPlayers.recordingObjectUrl;
  const cleanup=()=>clearReadingRecordingPlayer();
  readingAudioPlayers.recording.onended=cleanup;
  readingAudioPlayers.recording.onerror=cleanup;
  try{ await readingAudioPlayers.recording.play(); }catch(e){ cleanup(); }
}
function renderWordRecording(){
  $('rWord').textContent = readingLessonState.words[readingRecordingState.index] || '';
  $('rNow').textContent = Math.min(readingRecordingState.index+1, readingLessonState.words.length);
  $('rTot').textContent = readingLessonState.words.length;
  $('rDone').textContent = readingLessonState.words.filter(w=>readingRecordingState.set.has(norm(w))).length;
  $('rState').textContent = hasRec(readingLessonState.words[readingRecordingState.index]) ? '✅ مسجّلة' : '— مش مسجّلة';
}
async function startWordRecording(ev){
  ev.preventDefault();
  const token=++readingAudioTokens.word;
  if(!navigator.mediaDevices || !window.MediaRecorder){ $('rState').textContent='المتصفح ما بيدعم التسجيل'; return; }
  try{
    const capture=await createReadingRecorderCapture();
    readingRecordingState.word.stream=capture.stream; readingRecordingState.word.recorder=capture.recorder; readingRecordingState.word.chunks=capture.chunks;
    if(token!==readingAudioTokens.word){ stopReadingRecorderCapture(capture); return; }
    readingRecordingState.word.recorder.onstop = async ()=>{
      const blob = new Blob(readingRecordingState.word.chunks, {type: (readingRecordingState.word.recorder && readingRecordingState.word.recorder.mimeType) || 'audio/webm'});
      if(blob.size > 500){ await recPut(readingLessonState.words[readingRecordingState.index], blob); await refreshRecSet(); }
      try{ readingRecordingState.word.stream.getTracks().forEach(t=>t.stop()); }catch(e){}
      $('rRec').textContent='⏺ اضغطي واقرأي';
      renderWordRecording();
      if(readingRecordingState.index < readingLessonState.words.length-1){ readingRecordingState.index++; setTimeout(renderWordRecording, 350); }
    };
    readingRecordingState.word.recorder.start();
    $('rRec').textContent='🔴 بسجّل… ارفعي إصبعك';
    $('rState').textContent='اقرأي الكلمة الآن';
  }catch(e){ $('rState').textContent='المايك مرفوض ⛔'; }
}
function stopWordRecording(){ ++readingAudioTokens.word; try{ if(readingRecordingState.word.recorder && readingRecordingState.word.recorder.state!=='inactive') readingRecordingState.word.recorder.stop(); }catch(e){} try{ readingRecordingState.word.stream && readingRecordingState.word.stream.getTracks().forEach(t=>t.stop()); }catch(e){} }
function recordingBlobToDataUrl(blob){ return new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(blob); }); }
async function exportRecordings(){
  const keys = await recKeys(); const out={};
  for(const k of keys){ const b=await recGet(k); if(b) out[k]= await recordingBlobToDataUrl(b); }
  const blob = new Blob([JSON.stringify(out)], {type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='my-recordings.json'; a.click();
}
async function importRecordings(file){
  try{
    const obj = JSON.parse(await file.text());
    for(const k in obj){
      const r = await fetch(obj[k]); const b = await r.blob();
      await window.sanaRecordings.put(k,b);
    }
    await refreshRecSet(); renderWordRecording(); $('rState').textContent='✅ تم الاسترجاع';
  }catch(e){ $('rState').textContent='الملف مش مظبوط'; }
}
