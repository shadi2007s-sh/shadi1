(() => {
  const cfg = window.READING_APP_CONFIG || {};
  const panel = document.getElementById("v10Panel");
  const stateKey = "readingCoachV10";
  const DEFAULT_STATE = {pronunciation:{sessions:0,words:0,bestAccuracy:0,hard:{}},history:[]};
  function normalizeState(raw){
    const x = raw && typeof raw === "object" ? raw : {};
    // Migrate the old V10 shape while keeping existing saved progress intact.
    const p = x.pronunciation && typeof x.pronunciation === "object" ? x.pronunciation : x;
    return {
      pronunciation:{
        sessions:Number(p.sessions)||0,
        words:Number(p.words)||0,
        bestAccuracy:Number(p.bestAccuracy)||0,
        hard:(p.hard && typeof p.hard === "object") ? p.hard : {}
      },
      history:Array.isArray(x.history) ? x.history : []
    };
  }
  let state;
  try{ state = normalizeState(JSON.parse(localStorage.getItem(stateKey) || "{}")); }
  catch(e){ state = normalizeState(DEFAULT_STATE); }

  function persist(){ localStorage.setItem(stateKey, JSON.stringify(state)); }
  function showPanel(title, body){
    panel.classList.remove("hide");
    panel.innerHTML =
      `<h3 style="display:flex;justify-content:space-between;align-items:center;gap:8px">
         <span>${window.sanaUtils.escapeHtml(title)}</span>
         <button type="button" id="v10ClosePanel" aria-label="إغلاق"
           style="flex:none;border:1px solid #d9cdb2;background:#fff;border-radius:10px;
                  padding:4px 11px;font:700 .85rem inherit;cursor:pointer;box-shadow:none">✕</button>
       </h3>${body}`;
    panel.querySelector("#v10ClosePanel")?.addEventListener("click", hidePanel);
  }
  function hidePanel(){ panel.classList.add("hide"); }

  function renderParentDashboard(){
    const summary = Object.assign({pronunciation:DEFAULT_STATE.pronunciation}, state);
    const totalHard = Object.entries(summary.pronunciation.hard || {})
      .filter(([_,v]) => v >= 1)
      .sort((a,b) => b[1] - a[1]);
    const lessons = document.getElementById("v9Lessons");
    const words = document.getElementById("v9Words");
    const best = document.getElementById("v9Best");
    const hard = document.getElementById("v9HardWords");
    if(lessons) lessons.textContent = summary.pronunciation.sessions || 0;
    if(words) words.textContent = summary.pronunciation.words || 0;
    if(best) best.textContent = Math.round(summary.pronunciation.bestAccuracy || 0) + "%";
    if(hard){
      hard.replaceChildren();
      if(totalHard.length){
        totalHard.slice(0,20).forEach(([w,n])=>{
          const chip=document.createElement('span');
          chip.className='v9-chip';
          chip.textContent=w+' ×'+n;
          hard.appendChild(chip);
        });
      }else{
        hard.textContent='لا توجد كلمات صعبة مسجلة بعد.';
      }
    }
  }

  function exportBackup(){
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reading-coach-progress.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  window.v10Voice={
    speak(text,mode){
      const t=String(text||'').trim(); if(!t)return;
      if(mode==="azure" && window.sanaReadingAudio && typeof window.sanaReadingAudio.speak === "function") {
        window.sanaReadingAudio.speak(t,null,{fallback:false});
        return;
      }
      const btn=document.getElementById("sayBtn");
      if(btn) btn.click();
    }
  };
  async function assessPronunciation(referenceText){
    const SDK = await window.sanaSpeech.loadSdk();
    const t = await window.sanaSpeech.getToken();
    const speechConfig = SDK.SpeechConfig.fromAuthorizationToken(t.token, t.region || cfg.REGION || "eastus");
    speechConfig.speechRecognitionLanguage = "ar-SA";
    const audioConfig = SDK.AudioConfig.fromDefaultMicrophoneInput();
    const rec = new SDK.SpeechRecognizer(speechConfig, audioConfig);
    const pac = new SDK.PronunciationAssessmentConfig(
      referenceText,
      SDK.PronunciationAssessmentGradingSystem.HundredMark,
      SDK.PronunciationAssessmentGranularity.Word,
      true
    );
    pac.applyTo(rec);

    return await new Promise((resolve, reject)=>{
      rec.recognizeOnceAsync(result=>{
        try{
          const json = result.properties.getProperty(
            SDK.PropertyId.SpeechServiceResponse_JsonResult
          );
          const data = JSON.parse(json || "{}");
          const pa = data.NBest?.[0]?.PronunciationAssessment || {};
          resolve({result, data, pa});
        }catch(e){ reject(e); }
        finally { rec.close(); }
      }, err=>{
        try{ rec.close(); }catch(e){}
        reject(new Error(err?.toString?.() || "Pronunciation assessment failed"));
      });
    });
  }

  async function runPron(){
    // Read current sentence/word from the existing reading page.
    const ref = (document.getElementById('bigword')?.textContent || '').trim();
    if(!ref){ showPanel("قيّم نطقي","لا توجد كلمة حالية."); return; }
    if(ref.split(/\s+/).length > 1){
      showPanel("قيّم نطقي","هذا الزر لتقييم كلمة واحدة. لتقييم النص كاملاً استخدم زر «🎤 اقرئي وقيّمي».");
      return;
    }
    showPanel("🎤 تقييم النطق", `<p>اقرأ: <strong>${window.sanaUtils.escapeHtml(ref)}</strong></p><p>ابدأ الكلام الآن…</p>`);
    try{
      const r = await assessPronunciation(ref);
      const score = Number(r.pa?.PronScore || r.pa?.AccuracyScore || 0);
      const heard = (r.result?.text || '').trim();
      const verdict = score >= 85 ? 'نطق ممتاز 🌟'
                    : score >= 70 ? 'جيد — كرّري الكلمة مرة أخرى'
                    : score > 0   ? 'تحتاج تدريبًا على هذه الكلمة'
                    : 'لم أسمع الكلمة بوضوح — اقتربي من الميكروفون وأعيدي المحاولة';
      showPanel("نتيجة النطق",
        `<div class="v10-row"><strong>${window.sanaUtils.escapeHtml(ref)}</strong><strong>${Math.round(score)}%</strong></div>
         <div class="v10-meter"><i style="width:${Math.max(0,Math.min(100,score))}%"></i></div>
         <p class="v10-small">${window.sanaUtils.escapeHtml(verdict)}${heard && heard!==ref ? ' · سمعت: ' + window.sanaUtils.escapeHtml(heard) : ''}</p>`);
      if(score > 0){
        state.pronunciation.sessions += 1;
        state.pronunciation.words += 1;
        state.pronunciation.bestAccuracy = Math.max(state.pronunciation.bestAccuracy, score);
        state.history.push({type:"pronunciation",at:new Date().toISOString(),word:ref,score});
        state.history = state.history.slice(-50);
        if(score < 85) state.pronunciation.hard[ref] = (state.pronunciation.hard[ref]||0)+1;
        persist();
        renderParentDashboard();
      }
    }catch(e){
      showPanel("تعذر التقييم", `<p>${window.sanaUtils.escapeHtml(e.message || e)}</p><p class="v10-small">تأكد من السماح بالمايك وبقاء اتصال الإنترنت.</p>`);
    }
  }

  async function runFullTextPron(){
    const ref = words.join(' ').trim();
    if(!ref){ showPanel("تقييم القراءة","لا يوجد نص حالي."); return; }

    // Stop any TTS/reading activity before opening the microphone.
    try{ if(typeof stopRead === 'function') stopRead(); }catch(e){}

    showPanel("🎤 تقييم قراءة النص الكامل",
      `<p>اقرئي النص كاملاً بصوتك الآن. اضغطي "خلصت — قيّمي قراءتي" عندما تنتهين.</p>
       <div id="fullPronLive" class="v10-small">جارٍ تجهيز المايك…</div>
       <button class="v10-btn" id="v10StopFullPron" disabled>⏳ تجهيز الاستماع…</button>`);

    let rec = null;
    let stopping = false;
    let wordScores = [];
    let recognizedPieces = [];

    const setLive = msg => {
      const el=document.getElementById('fullPronLive');
      if(el) el.textContent=msg;
    };

    const finishAssessment = () => {
      if(stopping || !rec) return;
      stopping = true;
      const btn=document.getElementById('v10StopFullPron');
      if(btn){ btn.disabled=true; btn.textContent='⏳ جارٍ حساب النتيجة…'; }
      try{
        rec.stopContinuousRecognitionAsync(
          () => finishResult(),
          err => finishError(err)
        );
      }catch(err){ finishError(err); }
    };

    const finishResult = () => {
      try{ rec && rec.close(); }catch(e){}
      const avg = wordScores.length
        ? Math.round(wordScores.reduce((a,w)=>a+w.score,0)/wordScores.length)
        : 0;
      const weakWords = wordScores.filter(w => w.score < 70);
      showPanel("نتيجة قراءة النص الكامل", `
        <div class="v10-row"><strong>الدقة العامة</strong><strong>${avg}%</strong></div>
        <div class="v10-meter"><i style="width:${Math.max(0,Math.min(100,avg))}%"></i></div>
        <p class="v10-small">النص المسموع: ${window.sanaUtils.escapeHtml(recognizedPieces.join(' ') || '—')}</p>
        ${wordScores.length ? `<p class="v10-small">تم تقييم ${wordScores.length} كلمة.</p>` : `<p class="v10-small">لم يتم الحصول على درجات للكلمات.</p>`}
        ${weakWords.length ? `<h4>🎯 كلمات تحتاج تدريب</h4>
          <div>${weakWords.map(w=>`<span class="v10-chip">${window.sanaUtils.escapeHtml(w.word)} (${Math.round(w.score)}%)</span>`).join('')}</div>` : ''}
      `);
      state.pronunciation.sessions += 1;
      state.pronunciation.words += wordScores.length;
      state.pronunciation.bestAccuracy = Math.max(state.pronunciation.bestAccuracy, avg);
      state.history.push({type:"reading-full",at:new Date().toISOString(),accuracy:avg,words:wordScores.length});
      state.history = state.history.slice(-50);
      weakWords.forEach(w => { state.pronunciation.hard[w.word] = (state.pronunciation.hard[w.word]||0)+1; });
      persist();
      renderParentDashboard();
    };

    const finishError = err => {
      try{ rec && rec.close(); }catch(e){}
      const msg = String(err?.message || err || 'تعذر إيقاف التقييم.');
      console.error('Full-text pronunciation stop error:', err);
      showPanel("تعذر التقييم", `<p>${window.sanaUtils.escapeHtml(msg)}</p>`);
    };

    try{
      const SDK = await window.sanaSpeech.loadSdk();
      const t = await window.sanaSpeech.getToken();
      if(!t || !t.token) throw new Error('لم يتم الحصول على Speech token.');

      const speechConfig = SDK.SpeechConfig.fromAuthorizationToken(
        t.token, t.region || cfg.REGION || "eastus"
      );
      // STT/Pronunciation Assessment uses ar-SA; TTS voice remains unchanged.
      speechConfig.speechRecognitionLanguage = "ar-SA";

      const audioConfig = SDK.AudioConfig.fromDefaultMicrophoneInput();
      rec = new SDK.SpeechRecognizer(speechConfig, audioConfig);

      const pac = new SDK.PronunciationAssessmentConfig(
        ref,
        SDK.PronunciationAssessmentGradingSystem.HundredMark,
        SDK.PronunciationAssessmentGranularity.Word,
        true
      );
      pac.applyTo(rec);

      rec.recognizing = (s,e) => {
        try{
          const live=document.getElementById('fullPronLive');
          if(live && e.result?.text) live.textContent='أسمع: '+e.result.text;
        }catch(err){}
      };

      rec.recognized = (s, e) => {
        try{
          const json=e.result?.properties?.getProperty(
            SDK.PropertyId.SpeechServiceResponse_JsonResult
          );
          const data=JSON.parse(json || '{}');
          const wordsResult=data.NBest?.[0]?.Words || [];
          if(e.result?.text) recognizedPieces.push(e.result.text);
          wordsResult.forEach(w=>{
            const wp=w.PronunciationAssessment;
            if(wp) wordScores.push({word:w.Word,score:Number(wp.AccuracyScore ?? 0)});
          });
          const live=document.getElementById('fullPronLive');
          if(live) live.textContent='سمعت حتى الآن: '+(recognizedPieces.join(' ')||'—');
        }catch(err){ console.error('recognized handler error:',err); }
      };

      rec.canceled = (s,e) => {
        console.error('Full-text pronunciation canceled:', e);
        if(!stopping){
          stopping=true;
          try{rec.close();}catch(x){}
          showPanel("تعذر التقييم", `<p>${window.sanaUtils.escapeHtml(e?.errorDetails || e?.reason || 'تم إيقاف التعرف على الكلام.')}</p>`);
        }
      };

      rec.sessionStopped = () => {
      };

      const btn=document.getElementById('v10StopFullPron');
      if(btn){ btn.disabled=false; btn.textContent='⏹ خلصت — قيّمي قراءتي'; btn.onclick=finishAssessment; }
      setLive('🎙 اقرئي النص كاملاً الآن…');

      rec.startContinuousRecognitionAsync(
        () => { setLive('🎙 أسمعك الآن… اقرئي النص كاملاً.'); },
        err => {
          console.error('Full-text pronunciation start error:',err);
          try{rec.close();}catch(x){}
          showPanel("تعذر التقييم", `<p>${window.sanaUtils.escapeHtml(err?.message || err || 'تعذر تشغيل المايك.')}</p>`);
        }
      );
    }catch(err){
      console.error('Full-text pronunciation setup error:',err);
      try{rec && rec.close();}catch(e){}
      showPanel("تعذر التقييم", `<p>${window.sanaUtils.escapeHtml(err?.message || err || 'تعذر تشغيل تقييم القراءة.')}</p>`);
    }
  }

  // Expose the function for the existing page-level button wiring.
  window.runFullTextPron = runFullTextPron;

  function renderProgress(){
    const hard = Object.entries(state.pronunciation.hard || {}).sort((a,b)=>b[1]-a[1]).slice(0,20);
    return `
      <div class="v10-row"><span>الجلسات: <b>${state.pronunciation.sessions}</b></span><span>الكلمات: <b>${state.pronunciation.words}</b></span></div>
      <p>أفضل دقة: <b>${Math.round(state.pronunciation.bestAccuracy)}%</b></p>
      <h4>🎯 نقاط الضعف</h4>
      ${hard.length ? hard.map(([w,n])=>`<span class="v10-chip">${window.sanaUtils.escapeHtml(w)} ×${n}</span>`).join("") : "لا توجد نقاط ضعف مسجلة بعد."}
    `;
  }

  function report(){
    const data = [
      "تقرير مدرّب القراءة",
      `التاريخ: ${new Date().toLocaleString("ar-JO")}`,
      `الجلسات: ${state.pronunciation.sessions}`,
      `الكلمات: ${state.pronunciation.words}`,
      `أفضل دقة: ${Math.round(state.pronunciation.bestAccuracy)}%`,
      "",
      "نقاط الضعف:",
      ...Object.entries(state.pronunciation.hard).sort((a,b)=>b[1]-a[1]).map(([w,n])=>`${w} ×${n}`)
    ].join("\\n");
    const blob = new Blob([data],{type:"text/plain;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="reading-coach-report.txt";
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  document.getElementById("v9ProgressBtn")?.addEventListener("click", () => {
    document.getElementById("v9ProgressPanel")?.classList.toggle("v9-hidden");
    renderParentDashboard();
  });
  if(!window.sanaBackup) document.getElementById("v9BackupBtn")?.addEventListener("click", exportBackup);
  window.addEventListener("storage", e => {
    if(e.key !== stateKey) return;
    try{
      state = normalizeState(JSON.parse(e.newValue || "{}"));
      renderParentDashboard();
    }catch(_e){}
  });
  renderParentDashboard();
  setInterval(renderParentDashboard, 3000);

  document.getElementById("v10Listen")?.addEventListener("click",()=>{
    const btn=document.getElementById("sayBtn"); if(btn) btn.click();
  });

  document.getElementById("v10ReadAlong")?.addEventListener("click",()=>{
    const btn=document.getElementById("readBtn"); if(btn) btn.click();
  });

  document.getElementById("v10Pron")?.addEventListener("click",runPron);

  // A result belongs to one word — drop it as soon as the child moves on.
  ["nextBtn","prevBtn","micBtn","readBtn","resetBtn"].forEach(id=>{
    document.getElementById(id)?.addEventListener("click",hidePanel);
  });
  document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",hidePanel));

  document.getElementById("v10Hard")?.addEventListener("click",()=>{
    const hard = Object.entries(state.pronunciation.hard).sort((a,b)=>b[1]-a[1]);
    showPanel("🎯 نقاط ضعفي", hard.length
      ? `<div>${hard.map(([w,n])=>`<span class="v10-chip">${window.sanaUtils.escapeHtml(w)} ×${n}</span>`).join("")}</div>
         <button class="v10-btn" id="v10TrainHard">🔁 ابدأ التدريب على الكلمات</button>`
      : "لم يتم تسجيل كلمات صعبة بعد.");
    document.getElementById("v10TrainHard")?.addEventListener("click",()=>{
      const hardWords = Object.keys(state.pronunciation.hard || {});
      if(!hardWords.length) return;
      if(window.sanaReadingLesson?.build) window.sanaReadingLesson.build(hardWords.join(" "));
      hidePanel();
    });
  });

  document.getElementById("v10Progress")?.addEventListener("click",()=>showPanel("📊 تقدمي",renderProgress()));
  document.getElementById("v10Report")?.addEventListener("click",report);

  // Export state for future integration with the embedded dictation section.
  window.readingCoachV10 = {
    addHardWord(word){ if(word){ state.pronunciation.hard[word]=(state.pronunciation.hard[word]||0)+1; persist(); renderParentDashboard(); } },
    getState(){ return JSON.parse(JSON.stringify(state)); },
    renderParentDashboard,
    exportBackup
  };
})();
