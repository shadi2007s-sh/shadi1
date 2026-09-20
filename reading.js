import { norm, sim, accept, buildAzureSSML } from './sana-text.js';

(() => {
  const KEY = 'readingAppErrors';
  const MAX = 60;

  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(_) { return []; }
  };
  const write = list => {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch(_) {}
  };

  let entries = read();
  let badge = null;

  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function record(level, message, where){
    entries.push({
      level,
      message: String(message).slice(0, 500),
      where: String(where || '').slice(0, 200),
      at: new Date().toISOString(),
      url: location.pathname
    });
    entries = entries.slice(-MAX);
    write(entries);
    showBadge();
  }

  function showBadge(){
    const errors = entries.filter(e => e.level === 'error').length;
    if(!entries.length) return;
    if(!badge){
      badge = document.createElement('button');
      badge.type = 'button';
      badge.setAttribute('aria-label', 'عرض الأخطاء المسجّلة');
      badge.style.cssText =
        'position:fixed;left:10px;bottom:10px;z-index:99999;' +
        'background:#b3261e;color:#fff;border:0;border-radius:999px;' +
        'padding:8px 14px;font:700 .8rem system-ui,sans-serif;' +
        'box-shadow:0 3px 10px rgba(0,0,0,.3);cursor:pointer;' +
        'max-width:60vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      badge.addEventListener('click', openViewer);
      (document.body || document.documentElement).appendChild(badge);
    }
    badge.textContent = '⚠ ' + (errors || entries.length) + ' خطأ — اضغط للعرض';
    badge.style.background = errors ? '#b3261e' : '#8a5a00';
  }

  function openViewer(){
    const existing = document.getElementById('__errViewer');
    if(existing){ existing.remove(); return; }

    const box = document.createElement('div');
    box.id = '__errViewer';
    box.style.cssText =
      'position:fixed;inset:6% 4%;z-index:100000;background:#131c26;color:#c9d6e2;' +
      'border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);display:flex;' +
      'flex-direction:column;font:400 .8rem ui-monospace,monospace;overflow:hidden';

    const head = document.createElement('div');
    head.style.cssText =
      'padding:12px 14px;background:#1c2733;display:flex;gap:8px;align-items:center;' +
      'justify-content:space-between;flex:none;font-family:system-ui,sans-serif';
    const headTitle = document.createElement('b');
    headTitle.style.fontSize = '.95rem';
    headTitle.textContent = 'سجلّ الأخطاء (' + entries.length + ')';
    head.appendChild(headTitle);

    const tools = document.createElement('div');
    tools.style.cssText = 'display:flex;gap:6px';

    const mk = (label, bg, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText =
        'background:' + bg + ';color:#fff;border:0;border-radius:8px;padding:7px 12px;' +
        'font:600 .78rem system-ui,sans-serif;cursor:pointer';
      b.addEventListener('click', fn);
      return b;
    };

    tools.appendChild(mk('نسخ', '#2b5f9e', async () => {
      const text = entries.map(e =>
        '[' + e.level.toUpperCase() + '] ' + e.at + ' ' + e.message +
        (e.where ? ' @ ' + e.where : '')).join('\n');
      const payload = 'READING APP ERRORS\nUA: ' + navigator.userAgent + '\n\n' + text;
      try { await navigator.clipboard.writeText(payload); alert('نُسخ التقرير'); }
      catch(_){ alert('تعذّر النسخ — حدّد النص يدويًا'); }
    }));

    tools.appendChild(mk('مسح', '#5d7183', () => {
      entries = []; write(entries);
      if(badge){ badge.remove(); badge = null; }
      box.remove();
    }));

    tools.appendChild(mk('إغلاق', '#3a4a5a', () => box.remove()));
    head.appendChild(tools);

    const body = document.createElement('div');
    body.style.cssText = 'overflow:auto;padding:0;direction:ltr;text-align:left;flex:1';
    body.innerHTML = entries.slice().reverse().map(e =>
      '<div style="padding:10px 14px;border-bottom:1px solid #1e2a36;border-right:3px solid ' +
      (e.level === 'error' ? '#ff6b5e' : '#ffc247') +
      ';white-space:pre-wrap;overflow-wrap:anywhere">' +
      '<span style="color:#5d7183">' + esc(e.at.slice(11, 19)) + '</span>  ' +
      esc(e.message) +
      (e.where ? '<div style="color:#7d93a8;font-size:.74rem;margin-top:3px">' + esc(e.where) + '</div>' : '') +
      '</div>').join('') || '<div style="padding:16px;color:#5d7183">لا توجد أخطاء.</div>';

    box.appendChild(head);
    box.appendChild(body);
    document.body.appendChild(box);
  }

  // --- listeners -------------------------------------------------
  window.addEventListener('error', e => {
    if(e.target && e.target !== window && (e.target.src || e.target.href)){
      record('error', 'فشل تحميل: ' + (e.target.src || e.target.href), e.target.tagName);
      return;
    }
    record('error', e.message, (e.filename || '') + ':' + (e.lineno || 0));
  }, true);

  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    record('error', 'وعد مرفوض: ' + (r && r.message ? r.message : r),
      r && r.stack ? String(r.stack).split('\n')[1] || '' : '');
  });

  ['error', 'warn'].forEach(fn => {
    const orig = console[fn].bind(console);
    console[fn] = (...args) => {
      record(fn, args.map(a => {
        if(a instanceof Error) return a.message;
        if(typeof a === 'object'){ try { return JSON.stringify(a); } catch(_){ return String(a); } }
        return String(a);
      }).join(' '), 'console.' + fn);
      orig(...args);
    };
  });

  // Show the badge on load if previous sessions left errors behind.
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', showBadge);
  } else {
    showBadge();
  }

})();

// APIs shared بين أجزاء التطبيق بعد فصل الملف إلى وحدة واحدة.
const readingApi = Object.create(null);

const load = () => SanaProgress.getCoachState();
  function render(){
    const state = Object.assign({sessions:0,words:0,bestAccuracy:0,hard:{}}, load());
    const totalHard = Object.entries(state.hard||{})
      .filter(([_,v]) => v >= 1)
      .sort((a,b)=>b[1]-a[1]);
    const lessons = document.getElementById("coachLessons");
    const words = document.getElementById("coachWords");
    const best = document.getElementById("coachBest");
    const hard = document.getElementById("coachHardWords");
    if(lessons) lessons.textContent = state.sessions||0;
    if(words) words.textContent = state.words||0;
    if(best) best.textContent = Math.round(state.bestAccuracy||0) + "%";
    if(hard){
      hard.textContent = '';
    if(totalHard.length){
      totalHard.slice(0,20).forEach(([w,n])=>{
        const chip=document.createElement('span');
        chip.className='coach-chip';
        chip.textContent=w+' ×'+n;
        hard.appendChild(chip);
      });
    }else{
      hard.textContent='لا توجد كلمات صعبة مسجلة بعد.';
    }
    }
  }
  function exportBackup(){
    const state = load();
    const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reading-coach-progress.json";
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  readingApi.coachRender = render;
  document.getElementById("coachProgressBtn")?.addEventListener("click", () => {
    document.getElementById("coachProgressPanel")?.classList.toggle("coach-hidden");
  });
  document.getElementById("coachBackupBtn")?.addEventListener("click", exportBackup);
  window.addEventListener("storage", e => { if(e.key===SanaProgress.STORAGE_KEY) render(); });
  window.addEventListener("sana:progresschange", render);
  render();

const cfg = window.READING_APP_CONFIG || {};
  const panel = document.getElementById("toolsPanel");
  let state = SanaProgress.getCoachState();

  function persist(){ SanaProgress.saveCoachState(state); state = SanaProgress.getCoachState(); }
  function showPanel(title, body){
    panel.classList.remove("hide");
    panel.innerHTML =
      `<h3 style="display:flex;justify-content:space-between;align-items:center;gap:8px">
         <span>${SanaCore.escapeHtml(title)}</span>
         <button type="button" id="toolsClosePanel" aria-label="إغلاق"
           style="flex:none;border:1px solid #d9cdb2;background:#fff;border-radius:10px;
                  padding:4px 11px;font:700 .85rem inherit;cursor:pointer;box-shadow:none">✕</button>
       </h3>${body}`;
    panel.querySelector("#toolsClosePanel")?.addEventListener("click", hidePanel);
  }
  function hidePanel(){ panel.classList.add("hide"); }

  async function assessPronunciation(referenceText){
    const SDK = await SanaCore.loadSdk();
    const t = await SanaCore.getToken();
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
    showPanel("🎤 تقييم النطق", `<p>اقرأ: <strong>${SanaCore.escapeHtml(ref)}</strong></p><p>ابدأ الكلام الآن…</p>`);
    try{
      const r = await assessPronunciation(ref);
      const score = Number(r.pa?.PronScore || r.pa?.AccuracyScore || 0);
      const heard = (r.result?.text || '').trim();
      const verdict = score >= 85 ? 'نطق ممتاز 🌟'
                    : score >= 70 ? 'جيد — كرّري الكلمة مرة أخرى'
                    : score > 0   ? 'تحتاج تدريبًا على هذه الكلمة'
                    : 'لم أسمع الكلمة بوضوح — اقتربي من الميكروفون وأعيدي المحاولة';
      showPanel("نتيجة النطق",
        `<div class="tools-row"><strong>${SanaCore.escapeHtml(ref)}</strong><strong>${Math.round(score)}%</strong></div>
         <div class="tools-meter"><i style="width:${Math.max(0,Math.min(100,score))}%"></i></div>
         <p class="tools-small">${SanaCore.escapeHtml(verdict)}${heard && heard!==ref ? ' · سمعت: ' + SanaCore.escapeHtml(heard) : ''}</p>`);
      if(score > 0){
        state.sessions += 1;
        state.words += 1;
        state.bestAccuracy = Math.max(state.bestAccuracy, score);
        state.history.push({type:"pronunciation",at:new Date().toISOString(),word:ref,score});
        state.history = state.history.slice(-50);
        if(score < 85) state.hard[ref] = (state.hard[ref]||0)+1;
        persist();
      }
    }catch(e){
      showPanel("تعذر التقييم", `<p>${SanaCore.escapeHtml(e.message || e)}</p><p class="tools-small">تأكد من السماح بالمايك وبقاء اتصال الإنترنت.</p>`);
    }
  }

  async function runFullTextPron(){
    const ref = words.join(' ').trim();
    if(!ref){ showPanel("تقييم القراءة","لا يوجد نص حالي."); return; }

    // Stop any TTS/reading activity before opening the microphone.
    try{ if(typeof stopRead === 'function') stopRead(); }catch(e){}

    showPanel("🎤 تقييم قراءة النص الكامل",
      `<p>اقرئي النص كاملاً بصوتك الآن. اضغطي "خلصت — قيّمي قراءتي" عندما تنتهين.</p>
       <div id="fullPronLive" class="tools-small">جارٍ تجهيز المايك…</div>
       <button class="tools-btn" id="stopFullPron" disabled>⏳ تجهيز الاستماع…</button>`);

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
      const btn=document.getElementById('stopFullPron');
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
        <div class="tools-row"><strong>الدقة العامة</strong><strong>${avg}%</strong></div>
        <div class="tools-meter"><i style="width:${Math.max(0,Math.min(100,avg))}%"></i></div>
        <p class="tools-small">النص المسموع: ${SanaCore.escapeHtml(recognizedPieces.join(' ') || '—')}</p>
        ${wordScores.length ? `<p class="tools-small">تم تقييم ${wordScores.length} كلمة.</p>` : `<p class="tools-small">لم يتم الحصول على درجات للكلمات.</p>`}
        ${weakWords.length ? `<h4>🎯 كلمات تحتاج تدريب</h4>
          <div>${weakWords.map(w=>`<span class="tools-chip">${SanaCore.escapeHtml(w.word)} (${Math.round(w.score)}%)</span>`).join('')}</div>` : ''}
      `);
      state.sessions += 1;
      state.words += wordScores.length;
      state.bestAccuracy = Math.max(state.bestAccuracy, avg);
      state.history.push({type:"reading-full",at:new Date().toISOString(),accuracy:avg,words:wordScores.length});
      state.history = state.history.slice(-50);
      weakWords.forEach(w => { state.hard[w.word] = (state.hard[w.word]||0)+1; });
      persist();
    };

    const finishError = err => {
      try{ rec && rec.close(); }catch(e){}
      const msg = String(err?.message || err || 'تعذر إيقاف التقييم.');
      console.error('Full-text pronunciation stop error:', err);
      showPanel("تعذر التقييم", `<p>${SanaCore.escapeHtml(msg)}</p>`);
    };

    try{
      const SDK = await SanaCore.loadSdk();
      const t = await SanaCore.getToken();
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
          console.log('Full-text pronunciation response:', data);
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
          showPanel("تعذر التقييم", `<p>${SanaCore.escapeHtml(e?.errorDetails || e?.reason || 'تم إيقاف التعرف على الكلام.')}</p>`);
        }
      };

      rec.sessionStopped = () => {
        console.log('Full-text pronunciation session stopped.');
      };

      const btn=document.getElementById('stopFullPron');
      if(btn){ btn.disabled=false; btn.textContent='⏹ خلصت — قيّمي قراءتي'; btn.onclick=finishAssessment; }
      setLive('🎙 اقرئي النص كاملاً الآن…');

      rec.startContinuousRecognitionAsync(
        () => { setLive('🎙 أسمعك الآن… اقرئي النص كاملاً.'); },
        err => {
          console.error('Full-text pronunciation start error:',err);
          try{rec.close();}catch(x){}
          showPanel("تعذر التقييم", `<p>${SanaCore.escapeHtml(err?.message || err || 'تعذر تشغيل المايك.')}</p>`);
        }
      );
    }catch(err){
      console.error('Full-text pronunciation setup error:',err);
      try{rec && rec.close();}catch(e){}
      showPanel("تعذر التقييم", `<p>${SanaCore.escapeHtml(err?.message || err || 'تعذر تشغيل تقييم القراءة.')}</p>`);
    }
  }

  // Expose the function for the existing page-level button wiring.
  readingApi.runFullTextPron = runFullTextPron;

  function renderProgress(){
    const hard = Object.entries(state.hard).sort((a,b)=>b[1]-a[1]).slice(0,20);
    return `
      <div class="tools-row"><span>الجلسات: <b>${state.sessions}</b></span><span>الكلمات: <b>${state.words}</b></span></div>
      <p>أفضل دقة: <b>${Math.round(state.bestAccuracy)}%</b></p>
      <h4>🎯 نقاط الضعف</h4>
      ${hard.length ? hard.map(([w,n])=>`<span class="tools-chip">${SanaCore.escapeHtml(w)} ×${n}</span>`).join("") : "لا توجد نقاط ضعف مسجلة بعد."}
    `;
  }

  function report(){
    const data = [
      "تقرير مدرّب القراءة",
      `التاريخ: ${new Date().toLocaleString("ar-JO")}`,
      `الجلسات: ${state.sessions}`,
      `الكلمات: ${state.words}`,
      `أفضل دقة: ${Math.round(state.bestAccuracy)}%`,
      "",
      "نقاط الضعف:",
      ...Object.entries(state.hard).sort((a,b)=>b[1]-a[1]).map(([w,n])=>`${w} ×${n}`)
    ].join("\\n");
    const blob = new Blob([data],{type:"text/plain;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="reading-coach-report.txt";
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  window.addEventListener("sana:progresschange",()=>{ state=SanaProgress.getCoachState(); });
  window.addEventListener("storage",e=>{ if(e.key===SanaProgress.STORAGE_KEY) state=SanaProgress.getCoachState(); });

  document.getElementById("toolsListen")?.addEventListener("click",()=>{
    const btn=document.getElementById("sayBtn"); if(btn) btn.click();
  });

  document.getElementById("toolsReadAlong")?.addEventListener("click",()=>{
    const btn=document.getElementById("readBtn"); if(btn) btn.click();
  });

  document.getElementById("toolsPron")?.addEventListener("click",runPron);

  // A result belongs to one word — drop it as soon as the child moves on.
  ["nextBtn","prevBtn","micBtn","readBtn","resetBtn"].forEach(id=>{
    document.getElementById(id)?.addEventListener("click",hidePanel);
  });
  document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",hidePanel));

  document.getElementById("toolsHard")?.addEventListener("click",()=>{
    const hard = Object.entries(state.hard).sort((a,b)=>b[1]-a[1]);
    showPanel("🎯 نقاط ضعفي", hard.length
      ? `<div>${hard.map(([w,n])=>`<span class="tools-chip">${SanaCore.escapeHtml(w)} ×${n}</span>`).join("")}</div>
         <button class="tools-btn" id="toolsTrainHard">🔁 ابدأ التدريب على الكلمات</button>`
      : "لم يتم تسجيل كلمات صعبة بعد.");
    document.getElementById("toolsTrainHard")?.addEventListener("click",()=>{
      const hardWords = Object.keys(state.hard);
      if(!hardWords.length) return;
      if(typeof build === "function") build(hardWords.join(" "));
      hidePanel();
    });
  });

  document.getElementById("toolsProgress")?.addEventListener("click",()=>showPanel("📊 تقدمي",renderProgress()));
  document.getElementById("toolsReport")?.addEventListener("click",report);

  // Export state for future integration with the embedded dictation section.
  readingApi.coachTools = {
    addHardWord(word){ if(word){ state.hard[word]=(state.hard[word]||0)+1; persist(); } },
    getState(){ return JSON.parse(JSON.stringify(state)); }
  };

function azureConfigured(){
  return !!(window.READING_APP_CONFIG && window.READING_APP_CONFIG.TOKEN_ENDPOINT
    && !String(window.READING_APP_CONFIG.TOKEN_ENDPOINT).includes('YOUR-FUNCTION-APP'));
}
const gAudio = new Audio();

const DEFAULT_TEXT = "تدوينُ رؤوسِ الأقلامِ إحدى التقنياتِ التي دعتِ الحاجةُ إليها، نظرًا لكثرةِ وسائلِ الاتصالِ، فلمَ لا تبادرُ إلى استخدامِ هذه التقنية في دراسِتك؟";
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let words=[], idx=0, score=0, listening=false, rec=null;
let reading=false;
/*
 * TextManager: كل ما يخصّ النصوص المحفوظة (القائمة، النص الحالي، والحفظ في
 * localStorage) في مكان واحد بدل متغيّرين منفصلين (savedTexts, currentText)
 * كانا يُعدَّلان مباشرة من عشر دوال مختلفة عبر الملف.
 */
const TextManager = {
  STORAGE_KEY: 'readingSavedTextsV1',
  SELECTED_KEY: 'readingSelectedTextV1',
  list: [],
  current: {id:'', name:'', text: DEFAULT_TEXT},
  load(){
    try{ this.list = JSON.parse(localStorage.getItem(this.STORAGE_KEY)||'[]'); if(!Array.isArray(this.list)) this.list=[]; }
    catch(e){ this.list=[]; }
    if(!this.list.length){ this.list=[{id:uid(), name:'النص الافتراضي', text: DEFAULT_TEXT}]; }
    let selected=''; try{ selected = localStorage.getItem(this.SELECTED_KEY)||''; }catch(e){}
    this.current = this.list.find(x=>x.id===selected) || this.list[0];
    try{
      window.sanaTextSync?.publish(this.current.text, {name:this.current.name, textId:this.current.id});
    }catch(e){}
  },
  save(){
    try{
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.list));
      localStorage.setItem(this.SELECTED_KEY, this.current.id);
      window.sanaTextSync?.publish(this.current.text, {name:this.current.name, textId:this.current.id});
    }catch(e){}
  },
  findIndex(id){ return this.list.findIndex(x=>x.id===id); },
  select(id){
    const t=this.list.find(x=>x.id===id); if(!t) return null;
    this.current=t; this.save(); return t;
  },
  create(name, text){
    const t={id:uid(), name, text};
    this.list.push(t); this.current=t; this.save();
    return t;
  },
  update(id, patch){
    const i=this.findIndex(id); if(i<0) return null;
    this.list[i]={...this.list[i], ...patch}; this.current=this.list[i]; this.save();
    return this.list[i];
  },
  remove(id){
    if(this.list.length<=1) return null;
    const i=this.findIndex(id); if(i<0) return null;
    const removed=this.list[i];
    this.list.splice(i,1);
    this.current=this.list[Math.max(0,i-1)];
    this.save();
    return removed;
  },
  // يُستخدم لحفظ نص جديد/معدَّل قد لا يكون له id بعد (useManagedText) أو
  // لدمج نص مستورَد بنفس الاسم (importTexts).
  upsert(entry){
    const i = entry.id ? this.findIndex(entry.id) : -1;
    if(i>=0){ this.list[i]=entry; }
    else { if(!entry.id) entry.id=uid(); this.list.push(entry); }
    this.current=entry; this.save();
    return entry;
  }
};
let appState = {correct:0, wrong:0, streak:0, best:0, startedAt:null, mistakes:{}, attempts:0, finished:false, wordCount:0};
let progressHistory=[];
let readingMode='word';
let pausedReading=false;
let activeReadIndex=0;
let readSessionStartedAt=null;
let pausePreset='normal';
function loadState(){
  const saved=SanaProgress.getLessonState();
  if(saved && typeof saved==='object') appState={...appState,...saved,mistakes:saved.mistakes||{}};
  const history=SanaProgress.getHistory();
  progressHistory=Array.isArray(history)?history:[];
}
function saveState(){ SanaProgress.saveLessonState(appState,progressHistory); }
window.addEventListener('sana:progresschange',()=>{ loadState(); renderDashboard(); });
window.addEventListener('storage',e=>{ if(e.key===SanaProgress.STORAGE_KEY){ loadState(); renderDashboard(); } });
function uid(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
function loadTexts(){ TextManager.load(); renderTextSelector(); }
function saveTexts(){ TextManager.save(); }
function renderTextMeta(){
  const el=$('textMeta'); if(!el)return;
  const wc=words.length; const chars=(TextManager.current.text||'').length;
  const hist=progressHistory.filter(h=>h.textId===TextManager.current.id);
  const last=hist.length?hist[hist.length-1]:null;
  el.textContent=`📖 ${TextManager.current.name||'نص'} · ${wc} كلمة · ${chars} حرف` + (last?` · آخر دقة ${last.accuracy}%`:'');
}
function renderDashboard(){
  $('score').textContent=score; $('prog').textContent=words.length?Math.round(idx/words.length*100):0;
  const acc=accuracy(); const wordsRead=appState.wordCount||appState.correct||0;
  const s=$('pTextName'); if(s)s.textContent=TextManager.current.name||'النص الحالي';
  if($('pAcc'))$('pAcc').textContent=acc+'%'; if($('pBest'))$('pBest').textContent=appState.best||0; if($('pAttempts'))$('pAttempts').textContent=appState.attempts||0; if($('pWords'))$('pWords').textContent=wordsRead;
  const list=$('historyList'); if(list){
    list.textContent='';
    const hist=progressHistory.filter(h=>h.textId===TextManager.current.id).slice().reverse().slice(0,12);
    hist.forEach(h=>{
      const d=document.createElement('div');
      d.className='history-item';
      const time=document.createElement('span');
      time.textContent=new Date(h.at).toLocaleString('ar-JO',{dateStyle:'short',timeStyle:'short'});
      const result=document.createElement('b');
      result.textContent=`${h.accuracy}% · ${h.correct}/${h.total}`;
      d.append(time,result);
      list.appendChild(d);
    });
    if(!hist.length){
      const empty=document.createElement('div');
      empty.className='history-item';
      empty.textContent='لا توجد محاولات محفوظة بعد.';
      list.appendChild(empty);
    }
  }
  renderMistakes(); renderTextMeta();
}
function renderTextSelector(){
  const sel=$('savedTextSel'); if(!sel)return;
  sel.textContent='';
  TextManager.list.forEach(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=t.name;sel.appendChild(o);});
  if(TextManager.current?.id) sel.value=TextManager.current.id;
  const c=$('savedCount'); if(c)c.textContent = TextManager.list.length===1 ? 'نص واحد محفوظ' : `${TextManager.list.length} نصوص محفوظة`;
}
function selectSavedText(id, autoStart=true){
  const t=TextManager.select(id); if(!t)return;
  renderTextSelector();
  stopAll(); build(t.text); resetLessonStats(); say('📖 النص المختار: '+t.name);
  const ta=$('ta'),name=$('textName'); if(ta)ta.value=t.text; if(name)name.value=t.name;
}
function openTextManager(){
  const ta=$('ta'),name=$('textName'); if(ta)ta.value=TextManager.current.text; if(name)name.value=TextManager.current.name;
  $('dlg').showModal();
}
function createSavedText(){
  const name=($('textName').value||'').trim()||`نص ${TextManager.list.length+1}`;
  const text=($('ta').value||'').trim();
  if(!text){say('اكتبي نصًا أولًا.');return;}
  const t=TextManager.create(name, text);
  renderTextSelector(); build(t.text); resetLessonStats(); say('✅ تم حفظ النص: '+name);
}
function updateSavedText(){
  const text=($('ta').value||'').trim();
  if(!text){say('اكتبي نصًا أولًا.');return;}
  const name=($('textName').value||'').trim()||TextManager.current.name||'نص بدون اسم';
  const t=TextManager.update(TextManager.current.id, {name, text});
  if(!t)return;
  renderTextSelector(); invalidateFullAudioCache(); build(text); resetLessonStats(); say('✅ تم تحديث النص: '+name);
}
function deleteSavedText(){
  if(TextManager.list.length<=1){say('يجب أن يبقى نص واحد على الأقل.');return;}
  const name=TextManager.current.name;
  const removed=TextManager.remove(TextManager.current.id); if(!removed)return;
  renderTextSelector(); build(TextManager.current.text); resetLessonStats(); say('🗑 تم حذف: '+name); $('dlg').close();
}
function useManagedText(){
  const text=($('ta').value||'').trim(); if(!text){say('اكتبي نصًا أولًا.');return;}
  const entry={...TextManager.current, name:(($('textName').value||'').trim()||TextManager.current.name||'نص جديد'), text};
  TextManager.upsert(entry);
  renderTextSelector(); build(text); resetLessonStats(); say('📖 تم استخدام النص: '+TextManager.current.name); $('dlg').close();
}
function recordWrong(target){appState.wrong++;appState.attempts++;appState.streak=0;appState.wordCount=(appState.wordCount||0)+1; const k=norm(target); appState.mistakes[k]=(appState.mistakes[k]||0)+1;saveState();}
function recordCorrect(target){appState.correct++;appState.attempts++;appState.streak++;appState.wordCount=(appState.wordCount||0)+1;appState.best=Math.max(appState.best,appState.streak);saveState();}
function renderMistakes(){const box=$('mistakesBox'),list=$('mistakeList'); if(!box||!list)return; const entries=Object.entries(appState.mistakes||{}).sort((a,b)=>b[1]-a[1]).slice(0,12); box.classList.toggle('show',entries.length>0); list.textContent=''; entries.forEach(([k,n])=>{const b=document.createElement('button');b.className='mistake-chip';b.textContent=k+' ×'+n;b.onclick=()=>{const i=words.findIndex(w=>norm(w)===k);if(i>=0){idx=i;paint();say('🎯 تدرّبي على: '+words[i]);}};list.appendChild(b);});}
function accuracy(){ const total=(appState.correct||0)+(appState.wrong||0); return total?Math.round((appState.correct||0)/total*100):0; }
function elapsedMs(){ return appState.startedAt ? Math.max(0,Date.now()-appState.startedAt) : 0; }
function fmtTime(ms){ const sec=Math.floor((ms||0)/1000), m=Math.floor(sec/60), s=sec%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
function resetLessonStats(){ appState={correct:0,wrong:0,streak:0,best:0,startedAt:Date.now(),mistakes:{},attempts:0,finished:false,wordCount:0}; pausedReading=false; activeReadIndex=0; readSessionStartedAt=Date.now(); saveState(); }
function restoreDashboard(){loadState();renderDashboard();}
let micStartToken=0, fullRecToken=0, wordRecToken=0;
const $ = id => document.getElementById(id);
const say = h => $('heard').textContent = h;

function handleT(said){
  const heard=String(said||'').trim();
  const target=words[idx]||'';
  if(!target) return;
  const heardEl=$('heard');
  heardEl.textContent='';
  if(heard){
    heardEl.append('سمعت: ');
    const strong=document.createElement('b');
    strong.textContent=heard;
    heardEl.appendChild(strong);
  }else{
    heardEl.textContent='استمع…';
  }
  if(accept(heard,target) || norm(heard).includes(norm(target))){
    score++;
    recordCorrect(target);
    $('bigword').classList.add('ok','pop');
    setTimeout(()=>$('bigword').classList.remove('pop','ok'),450);
    beep(880,.12);
    idx++;
    stopMic();
    if(idx>=words.length){paint();finish();}
    else {paint();say('✅ ممتاز! الكلمة التالية: '+words[idx]);}
  }
}
function build(txt){
  invalidateFullAudioCache();
  const box=$('text'); box.textContent="";
  words = txt.trim().split(/\s+/).filter(Boolean);
  words.forEach((w,i)=>{
    const el=document.createElement('span');
    el.className='w'; el.textContent=w; el.onclick=()=>{idx=i;paint();};
    box.appendChild(el); box.appendChild(document.createTextNode(' '));
  });
  idx=0; score=0; pausedReading=false; activeReadIndex=0; readSessionStartedAt=Date.now(); paint(); refreshRecSet();
  renderDashboard();
  // جهّز صوت النص الكامل في الخلفية واحفظه على الجهاز. لا يبدأ التشغيل أو التأشير هنا.
  setTimeout(()=>{ if(readingMode==='full') prepareFullAudio(false).catch(()=>{}); },120);
}
function paint(){
  document.querySelectorAll('.w').forEach((el,i)=>{
    el.classList.toggle('done',i<idx);
    el.classList.toggle('now',i===idx && !reading);
  });
  $('bigword').textContent = words[idx] || '🎉';
  $('bigword').className = 'bigword';
  $('prevw').textContent = idx>0 ? words[idx-1] : '';
  $('nextw').textContent = idx<words.length-1 ? words[idx+1] : '';
  $('cnow').textContent = Math.min(idx+1, words.length);
  $('ctot').textContent = words.length;
  const pct = words.length ? Math.round(idx/words.length*100) : 0;
  $('fill').style.width=pct+'%';
  const progressBar=$('fill').closest('.bar');
  if(progressBar) progressBar.setAttribute('aria-valuenow', String(pct));
  $('prog').textContent=pct; $('score').textContent=score;
  const cur=document.querySelector('.w.now');
  if(cur && !$('fullView').classList.contains('hide')) cur.scrollIntoView({block:'center',behavior:'smooth'});
}
let ac;
function beep(f,d){
  try{ ac = ac || new (window.AudioContext||window.webkitAudioContext)();
    const o=ac.createOscillator(),g=ac.createGain(); o.frequency.value=f;
    g.gain.setValueAtTime(.001,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.22,ac.currentTime+.02);
    g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+d);
  }catch(e){}
}
function allVoices(){ return speechSynthesis.getVoices(); }
function arVoices(){ return allVoices().filter(v=>/^ar/i.test(v.lang)||/arab/i.test(v.name)); }
let chosenVoice=null, rate=0.7, stripTash=false, warned=false;
function checkVoice(){
  const bn=$('banner');
  if(bn) bn.classList.add('hide');
}let engine='azure';
const azureAudio = new Audio(); azureAudio.preload='auto';
let azureVoice='ar-JO-SanaNeural';
let azureRegion=(window.READING_APP_CONFIG||{}).REGION || 'eastus';
let azureSpeakGeneration=0;
azureAudio.preload='auto';
let azureAudioUrl='';


function loadAzureConfig(){
  try{ azureVoice=localStorage.getItem('readingApp.azureVoice')||'ar-JO-SanaNeural'; }catch(e){}
  if($('azureVoiceSel')) $('azureVoiceSel').value=azureVoice;
  if($('azureRegion')) $('azureRegion').value=azureRegion;
}
function saveAzureConfig(){
  azureVoice=$('azureVoiceSel')?.value || azureVoice || 'ar-JO-SanaNeural';
  try{localStorage.setItem('readingApp.azureVoice',azureVoice);}catch(e){}
}
function setAzureStatus(msg){
  const x=document.getElementById('voiceStatus'); if(x) x.textContent=msg;
  const y=document.getElementById('azureSecureStatus'); if(y && msg) y.textContent='☁️ '+msg;
}
function azureUserError(e){
  const m=String(e?.message||e||'');
  const map={
    TOKEN_NETWORK_OR_CORS:'تعذر الوصول إلى خادم Token. تحقق من الإنترنت وCORS في Azure.',
    TOKEN_HTTP_401:'Token: رفض الطلب 401. تأكد أن Function Authorization = Anonymous.',
    TOKEN_HTTP_403:'Token: رفض الطلب 403. راجع صلاحيات Function/CORS.',
    TOKEN_HTTP_404:'Token: الرابط غير صحيح (404).',
    TOKEN_MISSING:'Token: الخادم لم يُرجع Speech token.',
    TOKEN_BAD_JSON:'Token: الاستجابة ليست JSON صحيحة.',
    SDK_LOAD_FAILED:'Speech SDK: تعذر تحميل المكتبة.',
    SDK_LOAD_TIMEOUT:'Speech SDK: التحميل استغرق وقتًا طويلًا.',
    SDK_LOAD_EMPTY:'Speech SDK: تم التحميل لكن SpeechSDK غير موجود.',
    TTS_HTTP_400:'Azure TTS: الطلب مرفوض (400).',
    TTS_HTTP_401:'Azure TTS: التوكن غير صالح أو المنطقة غير مطابقة (401).',
    TTS_HTTP_403:'Azure TTS: رفضت الخدمة الطلب (403).',
    TTS_HTTP_404:'Azure TTS: نقطة الخدمة غير صحيحة (404).',
    TTS_HTTP_429:'Azure TTS: تم تجاوز الحد مؤقتًا (429).',
    TTS_NETWORK_OR_CORS:'Azure TTS: تعذر الوصول إلى خدمة الصوت (شبكة/CORS).',
    AUDIO_PLAY_BLOCKED:'المتصفح منع تشغيل الصوت. اضغط زر اختبار Sana مرة أخرى.',
    TTS_EMPTY_AUDIO:'Azure TTS: لم يصل ملف صوتي.'
  };
  return map[m] || m || 'تعذر تشغيل Azure.';
}
function azureRate(r){return Math.max(.65,Math.min(1.35,Number(r||rate||.9)));}
let azureAudioUnlocked=false;
function unlockAzureAudio(){
  if(azureAudioUnlocked) return;
  try{
    const unlockAudio=new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=');
    unlockAudio.volume=0;
    const p=unlockAudio.play();
    if(p&&p.then) p.then(()=>{ azureAudioUnlocked=true; }).catch(()=>{});
    else azureAudioUnlocked=true;
  }catch(e){}
}
document.addEventListener('pointerdown',unlockAzureAudio,{once:true,passive:true});
let azureSpeakAbort=null;
async function azureSpeak(t,cb,options={}){
  const generation=++azureSpeakGeneration;
  const text=String(t||'').trim();
  if(!text){cb&&cb();return;}
  try{
    saveAzureConfig();
    setAzureStatus('جارٍ تجهيز صوت Sana…');
    if(azureSpeakAbort){ try{azureSpeakAbort.abort();}catch(e){} }
    azureSpeakAbort=new AbortController();
    const controller=azureSpeakAbort;
    const tokenData=await SanaCore.getToken(false);
    const token=tokenData.token;
    azureRegion=String(tokenData.region || (window.READING_APP_CONFIG||{}).REGION || azureRegion || 'eastus').trim().toLowerCase();
    azureVoice=tokenData.voice || azureVoice || 'ar-JO-SanaNeural';
    if(generation!==azureSpeakGeneration || controller.signal.aborted) return;
    if(!token) throw new Error('TOKEN_MISSING');
    const res=await fetch(`https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,{
      method:'POST',
      headers:{
        'Authorization':'Bearer '+token,
        'Content-Type':'application/ssml+xml',
        'X-Microsoft-OutputFormat':'riff-24khz-16bit-mono-pcm'
      },
      body:buildAzureSSML(text,{voice:azureVoice,rate,pausePreset,stripTash}),
      signal:controller.signal,
      cache:'no-store'
    });
    if(generation!==azureSpeakGeneration || controller.signal.aborted) return;
    if(!res.ok){
      const e=new Error('TTS_HTTP_'+res.status);
      throw e;
    }
    const data=await res.arrayBuffer();
    if(generation!==azureSpeakGeneration || controller.signal.aborted) return;
    if(!data || !data.byteLength) throw new Error('TTS_EMPTY_AUDIO');

    if(options.playWhenActive && (!reading || pausedReading)) return;
    if(azureAudioUrl){ try{URL.revokeObjectURL(azureAudioUrl);}catch(e){} }
    azureAudioUrl=URL.createObjectURL(new Blob([data],{type:'audio/wav'}));
    try{azureAudio.pause();}catch(e){}
    try{azureAudio.currentTime=0;}catch(e){}
    azureAudio.src=azureAudioUrl;
    azureAudio.playbackRate=1;
    await new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(ok,err)=>{ if(settled)return; settled=true; if(generation!==azureSpeakGeneration) return resolve(); ok?resolve():reject(err||new Error('AUDIO_PLAY_FAILED')); };
      azureAudio.onended=()=>{
        if(generation!==azureSpeakGeneration) return finish(true);
        setAzureStatus('✓ تم تشغيل Sana');
        cb&&cb();
        finish(true);
      };
      azureAudio.onerror=()=>{
        if(generation===azureSpeakGeneration) setAzureStatus('✕ تعذر تشغيل ملف Sana');
        finish(false,new Error('AUDIO_PLAY_FAILED'));
      };
      if(generation!==azureSpeakGeneration || controller.signal.aborted) return finish(true);
      azureAudio.play().then(()=>setAzureStatus('✓ Sana تعمل')).catch(err=>finish(false,err));
    });
  }catch(e){
    if(e?.name==='AbortError' || generation!==azureSpeakGeneration) return;
    console.error('azureSpeak failed',e);
    setAzureStatus('✕ '+azureUserError(e));
    cb&&cb();
  }finally{
    if(generation===azureSpeakGeneration) azureSpeakAbort=null;
  }
}
function cancelAzure(){
  azureSpeakGeneration++;
  try{ if(azureSpeakAbort) azureSpeakAbort.abort(); }catch(e){}
  azureSpeakAbort=null;
  try{azureAudio.pause();azureAudio.currentTime=0;}catch(e){}
  try{if(azureAudioUrl){URL.revokeObjectURL(azureAudioUrl);azureAudioUrl='';}}catch(e){}
  try{azureAudio.removeAttribute('src');azureAudio.load();}catch(e){}
  try{azureAudio.onended=null;azureAudio.onerror=null;}catch(e){}
}
async function testAzureSana(){
  setAzureStatus('🔎 فحص Sana…');
  try{
    saveAzureConfig();
    const tokenData=await SanaCore.getToken(true);
    const token=tokenData.token;
    azureRegion=String(tokenData.region || (window.READING_APP_CONFIG||{}).REGION || azureRegion || 'eastus').trim().toLowerCase();
    azureVoice=tokenData.voice || azureVoice || 'ar-JO-SanaNeural';
    if(!token) throw new Error('TOKEN_MISSING');
    setAzureStatus('✓ Token يعمل — جارٍ اختبار الصوت…');
    await azureSpeak('مرحبًا، أنا سَنا. هذا اختبار للصوت العربي الواضح على جهازك.',null,{fallback:false,source:'test'});
  }catch(e){setAzureStatus('✕ '+azureUserError(e));}
}
readingApi.testAzureSana=testAzureSana;
readingApi.azureSpeak=azureSpeak;
function arVoice(){ return chosenVoice || arVoices()[0] || null; }

const recAudio = new Audio();
let recSet = new Set(), recIdx = 0, mr=null, mrChunks=[], mrStream=null;
function idb(){
  return new Promise((res,rej)=>{
    const r = indexedDB.open('readingRecs',1);
    r.onupgradeneeded = ()=> r.result.createObjectStore('recs');
    r.onsuccess = ()=> res(r.result);
    r.onerror = ()=> rej(r.error);
  });
}
async function recGet(w){
  try{ const d=await idb(); return await new Promise(res=>{
    const q=d.transaction('recs').objectStore('recs').get(norm(w));
    q.onsuccess=()=>res(q.result||null); q.onerror=()=>res(null); }); }catch(e){ return null; }
}
const FULL_KEY='__FULL_TEXT__';
async function recPut(w,blob){
  try{ const d=await idb(); await new Promise(res=>{
    const q=d.transaction('recs','readwrite').objectStore('recs').put(blob,norm(w));
    q.onsuccess=res; q.onerror=res; }); }catch(e){}
}
async function recDelete(w){
  try{ const d=await idb(); await new Promise(res=>{
    const q=d.transaction('recs','readwrite').objectStore('recs').delete(norm(w));
    q.onsuccess=res; q.onerror=res; }); }catch(e){}
}
async function recKeys(){
  try{ const d=await idb(); return await new Promise(res=>{
    const q=d.transaction('recs').objectStore('recs').getAllKeys();
    q.onsuccess=()=>res(q.result||[]); q.onerror=()=>res([]); }); }catch(e){ return []; }
}
async function refreshRecSet(){
  recSet = new Set(await recKeys());
  document.querySelectorAll('.w').forEach((el,i)=>el.classList.toggle('rec', recSet.has(norm(words[i]))));
  const d=$('rDone'); if(d) d.textContent = words.filter(w=>recSet.has(norm(w))).length;
}
function hasRec(w){ return recSet.has(norm(w)); }
async function speak(t, r, cb){
  return azureSpeak(t, cb, {fallback:false, source:'reading', playWhenActive:true});
}
function testVoice(){ testAzureSana(); }
function repeatCurrentWord(){ if(!words[idx])return; stopRead(); azureSpeak(words[idx],null,{source:'repeat-word',playWhenActive:false}); }
function pauseReading(){
  if(!reading){ say('لا توجد قراءة جارية الآن.'); return; }
  if(pausedReading){
    pausedReading=false;
    $('pauseBtn').textContent='⏸ إيقاف مؤقت';
    try{ if(azureAudio.src) azureAudio.play().catch(()=>{}); }catch(e){}
    return;
  }
  pausedReading=true;
  $('pauseBtn').textContent='▶️ استئناف';
  try{ azureAudio.pause(); }catch(e){}
}



function correct(){
  const target=words[idx]||''; const b=$('bigword'); b.classList.add('ok','pop'); setTimeout(()=>b.classList.remove('pop'),450);
  beep(880,.12); setTimeout(()=>beep(1320,.14),90); score++; recordCorrect(target); idx++;
  if(idx>=words.length){ paint(); finish(); return; }
  setTimeout(paint,180);
}
function wrong(){
  const target=words[idx]||''; const b=$('bigword'); b.classList.add('miss'); setTimeout(()=>b.classList.remove('miss'),350); recordWrong(target);
}
function finish(){
  stopAll();
  appState.finished=true;
  const entry={at:Date.now(),textId:TextManager.current.id,textName:TextManager.current.name,accuracy:accuracy(),correct:score,total:words.length,elapsed:elapsedMs()};
  progressHistory.push(entry); saveState();
  $('resAccuracy').textContent=entry.accuracy+'%'; $('resTime').textContent=fmtTime(entry.elapsed); $('resWords').textContent=score+'/'+words.length;
  $('winMsg').textContent='قرأتِ '+words.length+' كلمة وجمعتِ '+score+' نجمة ⭐ — ممتاز!';
  $('win').classList.add('show');
  [523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,.25),i*140));
  for(let i=0;i<60;i++) confetti();
}
function confetti(){
  const c=document.createElement('div'); c.className='confetti';
  c.style.left=Math.random()*100+'vw';
  c.style.background=['#e2725b','#f0b429','#2f8f5b','#5aa9d6','#fff'][Math.floor(Math.random()*5)];
  document.body.appendChild(c);
  c.animate([{transform:'translateY(0) rotate(0)'},{transform:'translateY(105vh) rotate(720deg)'}],
    {duration:2200+Math.random()*1600,easing:'ease-in'}).onfinish=()=>c.remove();
}
function restart(){ $('win').classList.remove('show'); stopAll(); build(TextManager.current.text); resetLessonStats(); say('📖 بدأنا من البداية: '+TextManager.current.name); }
function hi(i){
  document.querySelectorAll('.w').forEach((el,k)=>el.classList.toggle('spk',k===i));
  if(words[i]!==undefined){
    $('bigword').textContent=words[i]; $('cnow').textContent=i+1;
    $('prevw').textContent=i>0?words[i-1]:''; $('nextw').textContent=i<words.length-1?words[i+1]:'';
  }
}
let readTimers=[];
let fullAudioCache={key:'',blob:null,text:'',duration:0,ready:false,loading:false,promise:null};
const FULL_AUDIO_DB='readingFullAudioCacheV1';
const FULL_AUDIO_STORE='audio';
function clearReadTimers(){ readTimers.forEach(t=>clearTimeout(t)); readTimers=[]; }
function invalidateFullAudioCache(){
  fullAudioCache={key:'',blob:null,text:'',duration:0,ready:false,loading:false,promise:null};
}
function fullAudioKey(){
  return [TextManager.current.id||'', words.join(' '), azureVoice, rate, pausePreset, stripTash?'1':'0'].join('||');
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
  const text=words.join(' ').trim();
  if(!text) return null;
  const key=fullAudioKey();
  if(fullAudioCache.key===key && fullAudioCache.ready && fullAudioCache.blob) return fullAudioCache;
  if(fullAudioCache.key===key && fullAudioCache.loading && fullAudioCache.promise) return fullAudioCache.promise;
  if(fullAudioCache.key!==key) invalidateFullAudioCache();
  const myKey=key;
  const promise=(async()=>{
    try{
      if(showStatus) setAzureStatus('☁️ التحقق من صوت النص المحفوظ…');
      const stored=await fullAudioDBGet(myKey);
      if(stored && stored.size>800){
        if(myKey!==fullAudioKey()) return null;
        fullAudioCache={key:myKey,blob:stored,text,duration:0,ready:true,loading:false,promise:null};
        if(showStatus) setAzureStatus('✓ الصوت المحفوظ جاهز — بدون إعادة تحميل');
        return fullAudioCache;
      }
      if(showStatus) setAzureStatus('☁️ تجهيز صوت النص الكامل لأول مرة…');
      saveAzureConfig();
      const tokenData=await SanaCore.getToken(false);
      const token=tokenData.token;
      azureRegion=String(tokenData.region || (window.READING_APP_CONFIG||{}).REGION || azureRegion || 'eastus').trim().toLowerCase();
      azureVoice=tokenData.voice || azureVoice || 'ar-JO-SanaNeural';
      if(myKey!==fullAudioKey()) return null;
      const controller=new AbortController();
      const res=await fetch(`https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,{
        method:'POST',
        headers:{'Authorization':'Bearer '+token,'Content-Type':'application/ssml+xml','X-Microsoft-OutputFormat':'riff-24khz-16bit-mono-pcm'},
        body:buildAzureSSML(text,{voice:azureVoice,rate,pausePreset,stripTash}), signal:controller.signal, cache:'no-store'
      });
      if(!res.ok) throw new Error('TTS_HTTP_'+res.status);
      const data=await res.arrayBuffer();
      if(!data || !data.byteLength) throw new Error('TTS_EMPTY_AUDIO');
      if(myKey!==fullAudioKey()) return null;
      const blob=new Blob([data],{type:'audio/wav'});
      await fullAudioDBPut(myKey,blob);
      if(myKey!==fullAudioKey()) return null;
      fullAudioCache={key:myKey,blob,text,duration:0,ready:true,loading:false,promise:null};
      if(showStatus) setAzureStatus('✓ صوت النص الكامل جاهز ومحفوظ على الجهاز');
      return fullAudioCache;
    }catch(e){
      if(showStatus) setAzureStatus('✕ '+azureUserError(e));
      if(fullAudioCache.key===myKey) fullAudioCache.loading=false;
      throw e;
    }
  })();
  fullAudioCache={key,blob:null,text,duration:0,ready:false,loading:true,promise};
  return promise;
}

function readWordOnly(i){
  const text=words[i]||'';
  if(!text){ stopRead(); return; }
  activeReadIndex=i;
  hi(i);
  const done=()=>{ if(reading && !pausedReading) stopRead(); };
  azureSpeak(text,done,{source:'word',playWhenActive:true});
}

async function readFullTextAzure(){
  const text=words.join(' ').trim();
  if(!text){ stopRead(); return; }
  clearReadTimers();
  activeReadIndex=0;
  document.querySelectorAll('.w').forEach(el=>el.classList.remove('spk'));
  // مهم: لا نحرّك التأشير أثناء تجهيز الصوت.
  try{
    const cached=await prepareFullAudio(true);
    if(!reading || pausedReading || !cached || cached.key!==fullAudioKey()) return;
    if(azureAudioUrl){ try{URL.revokeObjectURL(azureAudioUrl);}catch(e){} }
    azureAudioUrl=URL.createObjectURL(cached.blob);
    try{azureAudio.pause();}catch(e){}
    try{azureAudio.currentTime=0;}catch(e){}
    azureAudio.src=azureAudioUrl;
    azureAudio.playbackRate=1;
    await new Promise((resolve,reject)=>{
      let settled=false;
      let metadataReady=false;
      const finish=(ok,err)=>{ if(settled)return; settled=true; ok?resolve():reject(err||new Error('AUDIO_PLAY_FAILED')); };
      const markReady=()=>{ metadataReady=true; fullAudioCache.duration=Number.isFinite(azureAudio.duration)?azureAudio.duration:0; };
      azureAudio.onloadedmetadata=markReady;
      azureAudio.onloadeddata=markReady;
      azureAudio.oncanplay=markReady;
      azureAudio.onerror=()=>finish(false,new Error('AUDIO_PLAY_FAILED'));
      // تتبع المؤشر من زمن الصوت الفعلي (currentTime)، وليس من مؤقتات مسبقة.
      // هذا يجعل حركة المؤشر مرتبطة بما تسمعينه فعليًا، سواء كان الصوت جديدًا أو محفوظًا.
      const totalChars=Math.max(1,text.length);
      const cumulative=[];
      let usedChars=0;
      words.forEach(w=>{
        cumulative.push(usedChars/totalChars);
        usedChars += w.length+1;
      });
      const updateHighlight=()=>{
        if(!reading || pausedReading) return;
        const total=Number.isFinite(azureAudio.duration) && azureAudio.duration>0 ? azureAudio.duration : 0;
        if(!total) return;
        const ratio=Math.max(0,Math.min(0.999999,azureAudio.currentTime/total));
        let lo=0,hiIdx=words.length-1,ans=0;
        while(lo<=hiIdx){
          const mid=(lo+hiIdx)>>1;
          if(cumulative[mid] <= ratio){ ans=mid; lo=mid+1; }
          else hiIdx=mid-1;
        }
        hi(ans);
      };
      azureAudio.ontimeupdate=updateHighlight;
      azureAudio.onplay=()=>{
        if(!reading || pausedReading) return;
        document.querySelectorAll('.w').forEach(el=>el.classList.remove('spk'));
        hi(0);
        updateHighlight();
      };
      azureAudio.onended=()=>{ clearReadTimers(); finish(true); if(reading && !pausedReading) stopRead(); };
      azureAudio.play().then(()=>{ if(!metadataReady){} }).catch(err=>finish(false,err));
    });
  }catch(e){
    if(reading) setAzureStatus('✕ '+azureUserError(e));
    stopRead();
  }
}

async function readAloud(from){
  if(reading){ stopRead(); return; }

  // Hard-stop every other browser audio engine before starting the single reader.
  try{ speechSynthesis.cancel(); }catch(e){}
  try{ recAudio.pause(); recAudio.currentTime=0; }catch(e){}

  stopMic();
  pausedReading=false;
  clearReadTimers();
  $('pauseBtn').textContent='⏸ إيقاف مؤقت';
  reading=true;
  $('readBtn').textContent='⏹ وقّف القراءة';
  readSessionStartedAt=Date.now();
  activeReadIndex=(readingMode==='full') ? 0 : (from!==undefined ? from : idx);

  if(readingMode==='full'){
    await readFullTextAzure();
    return;
  }
  readWordOnly(activeReadIndex);
}

function stopRead(){
  reading=false;
  pausedReading=false;
  clearReadTimers();
  cancelAzure();
  try{ speechSynthesis.cancel(); }catch(e){}
  try{ recAudio.pause(); recAudio.currentTime=0; }catch(e){}
  try{ azureAudio.pause(); azureAudio.currentTime=0; azureAudio.src=''; azureAudio.ontimeupdate=null; }catch(e){}
  document.querySelectorAll('.w').forEach(el=>el.classList.remove('spk'));
  $('readBtn').textContent='📖 اقرأ لي النص';
  $('pauseBtn').textContent='⏸ إيقاف مؤقت';
  paint();
}

let mobileMicState={stream:null,recorder:null,chunks:[],timer:0,token:0,ctx:null,sourceNode:null,analyser:null,silenceTimer:0,monitorTimer:0,sawSpeech:false,startedAt:0};

function stopMobileMicTracks(){
  clearTimeout(mobileMicState.timer);
  clearTimeout(mobileMicState.silenceTimer);
  clearTimeout(mobileMicState.monitorTimer);
  try{mobileMicState.sourceNode?.disconnect();}catch(e){}
  try{mobileMicState.analyser?.disconnect();}catch(e){}
  try{mobileMicState.ctx?.close();}catch(e){}
  try{mobileMicState.stream?.getTracks().forEach(t=>t.stop());}catch(e){}
  mobileMicState={stream:null,recorder:null,chunks:[],timer:0,token:mobileMicState.token,ctx:null,sourceNode:null,analyser:null,silenceTimer:0,monitorTimer:0,sawSpeech:false,startedAt:0};
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
      if(token!==micStartToken || !listening || mobileMicState.recorder!==recorder) return;
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
          if(token!==micStartToken || !listening || mobileMicState.recorder!==recorder) return;
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
  const url=`https://${azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=ar-SA&format=detailed`;
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
  const token=++micStartToken;
  if(!window.isSecureContext){say('🔒 يجب فتح الموقع عبر HTTPS حتى يعمل المايك.');return;}
  if(listening)return;
  stopRead();stopMobileMicTracks();
  try{
    if(!navigator.mediaDevices?.getUserMedia) throw new Error('MIC_UNSUPPORTED');
    if(!window.MediaRecorder) throw new Error('RECORDER_UNSUPPORTED');
    say('🎤 جاري فتح المايك…');
    const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    if(token!==micStartToken){stream.getTracks().forEach(t=>t.stop());return;}
    const mime=chooseRecordMime();
    const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
    mobileMicState.stream=stream;mobileMicState.recorder=recorder;mobileMicState.chunks=[];mobileMicState.token=token;
    recorder.ondataavailable=e=>{if(e.data?.size)mobileMicState.chunks.push(e.data);};
    recorder.onerror=e=>{if(token===micStartToken){say('⚠️ حدث خطأ أثناء تسجيل الصوت.');stopMic();}};
    recorder.onstop=async()=>{
      const myToken=token;
      const chunks=mobileMicState.chunks.slice();
      const mimeType=recorder.mimeType||mime||'audio/webm';
      const blob=new Blob(chunks,{type:mimeType});
      stopMobileMicTracks();
      if(myToken!==micStartToken)return;
      listening=false;$('micBtn').classList.remove('on');$('micBtn').textContent='🎤 ابدئي القراءة';
      if(blob.size<1000){say('🎤 لم يتم تسجيل صوت واضح.');return;}
      try{
        say('☁️ أجهّز الصوت للتعرّف…');
        const speechTokenData=await SanaCore.getToken(false);const speechToken=speechTokenData.token;if(myToken!==micStartToken)return;
        const wav=await blobToWav16kMono(blob);if(myToken!==micStartToken)return;
        if(wav.size<5000){say('🎤 التسجيل قصير جدًا. جرّبي أن تبدئي الكلام بعد ظهور الرسالة مباشرة.');return;}
        say('☁️ أتعرّف على الكلمة…');
        const r=await transcribeWavWithAzure(wav,speechToken);if(myToken!==micStartToken)return;
        if(r.text){
          handleT(r.text);
        }else{
          say('🎤 لم أفهم الكلمة بوضوح. جرّبي تحكيها ببطء وبصوت أعلى قليلاً.');
        }
      }catch(e){
        console.error('Azure mobile STT',e);
        if(myToken===micStartToken){
          const m=String(e?.message||e||'');
          if(m==='STT_BAD_JSON')say('⚠️ Azure أرسل استجابة غير متوقعة.');
          else if(m.startsWith('STT_HTTP_401'))say('⚠️ رمز Azure غير صالح لهذا التعرف.');
          else if(m.startsWith('STT_HTTP_403'))say('⚠️ Azure رفض طلب التعرف على الصوت.');
          else if(m.startsWith('STT_HTTP_400'))say('⚠️ Azure رفض التسجيل الصوتي.');
          else if(m==='AUDIO_CONTEXT_UNSUPPORTED')say('⚠️ المتصفح لا يدعم تحويل التسجيل الصوتي.');
          else say('⚠️ تعذر التعرف على الكلام: '+m);
        }
      }
    };
    recorder.start();
    listening=true;$('micBtn').classList.add('on');$('micBtn').textContent='⏹ إيقاف التسجيل';
    say('🎙 اقرئي الكلمة الآن: '+(words[idx]||''));
    // Smart mobile capture: up to 3800ms, but stop earlier after a detected
    // spoken word followed by a short silence. Falls back to the full window
    // on browsers where the analyser is unavailable.
    startMobileSpeechMonitor(stream,recorder,token);
    mobileMicState.timer=setTimeout(()=>{
      if(token!==micStartToken)return;
      try{if(recorder.state!=='inactive')recorder.stop();}catch(e){}
    },3800);
  }catch(e){
    console.error('mobile mic start failed',e);listening=false;stopMobileMicTracks();$('micBtn').classList.remove('on');$('micBtn').textContent='🎤 ابدئي القراءة';
    if(e?.name==='NotAllowedError')say('🎤 اسمحي للمتصفح باستخدام المايك ثم اضغطي مرة أخرى.');
    else say('⚠️ تعذر تشغيل المايك: '+(e?.message||e));
  }
}

function stopMic(){
  ++micStartToken;
  listening=false;
  try{if(mobileMicState.recorder && mobileMicState.recorder.state!=='inactive') mobileMicState.recorder.stop();}catch(e){}
  stopMobileMicTracks();
  $('micBtn').classList.remove('on'); $('micBtn').textContent='🎤 ابدئي القراءة';
}

function stopAll(){stopMic();reading=false;$('readBtn').textContent='📖 اقرأ لي النص'; try{speechSynthesis.cancel();}catch(e){} }
async function exportTexts(){
  const payload={version:1,exportedAt:new Date().toISOString(),texts:TextManager.list,selectedId:TextManager.current.id};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='reading-texts-backup.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  say('⬇️ تم تصدير النصوص المحفوظة.');
}
async function importTexts(file){
  try{
    const obj=JSON.parse(await file.text()); if(!Array.isArray(obj.texts))throw new Error('bad');
    const byName=new Map(TextManager.list.map(t=>[t.name,t]));
    obj.texts.forEach(t=>{
      if(t&&t.text){
        if(byName.has(t.name)){ const old=byName.get(t.name); old.text=t.text; }
        else{ TextManager.list.push({id:uid(),name:t.name,text:t.text}); }
      }
    });
    TextManager.current=TextManager.list[0];
    TextManager.save(); renderTextSelector(); build(TextManager.current.text); resetLessonStats(); say('✅ تم استرجاع النصوص.');
  }catch(e){say('❌ ملف النصوص غير صالح.');}
}
function shareCurrentText(){
  const text=`${TextManager.current.name}\n\n${TextManager.current.text}`;
  if(navigator.share){navigator.share({title:TextManager.current.name||'نص قراءة',text}).catch(()=>{});}else if(navigator.clipboard){navigator.clipboard.writeText(text).then(()=>say('📋 تم نسخ النص للمشاركة.')).catch(()=>say('انسخي النص من إدارة النصوص.'));}else say('📋 انسخي النص من إدارة النصوص لمشاركته.');
}
function exportProgress(){ const payload={version:1,exportedAt:new Date().toISOString(),history:progressHistory, current:appState}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='reading-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
readingApi.getReadingReference=()=> readingMode==='full' ? words.join(' ') : (words[idx]||'');
$('micBtn').onclick=async()=>{
  if(listening){ stopMic(); say('⏹ توقّف الاستماع.'); return; }
  stopRead();
  await startMic();
};
$('sayBtn').onclick=()=>{ if(words[idx]){ stopRead(); azureSpeak(words[idx],null,{source:'single-word',playWhenActive:false}); } };
$('okBtn').onclick=()=> idx<words.length && correct();
$('prevBtn').onclick=()=>{ if(idx>0){ idx--; paint(); } };
$('nextBtn').onclick=()=>{ if(idx<words.length){ wrong(); idx++; paint(); if(idx>=words.length) finish(); } };
$('readBtn').onclick=()=> readAloud();
$('resetBtn').onclick=()=>{ invalidateFullAudioCache(); stopAll(); restart(); };
$('editBtn').onclick=openTextManager;
$('manageTextsBtn').onclick=openTextManager;
$('savedTextSel').onchange=e=>{ invalidateFullAudioCache(); selectSavedText(e.target.value); };
$('saveNewTextBtn').onclick=createSavedText;
$('updateTextBtn').onclick=updateSavedText;
$('deleteTextBtn').onclick=deleteSavedText;
$('useTextBtn').onclick=useManagedText;
$('progressBtn').onclick=()=>{renderDashboard();$('progressDlg').showModal();};
$('backupTextsBtn').onclick=exportTexts;
$('shareBtn').onclick=shareCurrentText;
$('moreToolsBtn').onclick=()=>{
  const panel=$('moreToolsPanel');
  const btn=$('moreToolsBtn');
  const showing=panel.classList.toggle('hide')===false;
  btn.textContent = showing ? '⬆ إخفاء الأدوات' : '⚙️ المزيد من الأدوات';
};
$('coachPanelsBtn').onclick=()=>{
  const a=$('coachDashboard'), b=$('toolsWrap'), btn=$('coachPanelsBtn');
  const nowHidden=a.classList.toggle('hide');
  b.classList.toggle('hide', nowHidden);
  btn.textContent = nowHidden ? '📊 لوحة المتابعة (للأهل)' : '⬆ إخفاء لوحة المتابعة';
  if(!nowHidden && readingApi.coachRender) readingApi.coachRender();
};
$('exportProgressBtn').onclick=exportProgress;
$('repeatBtn').onclick=repeatCurrentWord;
$('pauseBtn').onclick=pauseReading;
$('readAndAssessBtn').onclick=()=>{ if(typeof readingApi.runFullTextPron === 'function') readingApi.runFullTextPron(); };
$('exportTextsBtn2').onclick=exportTexts;
$('importTextsBtn').onclick=()=>$('textsFile').click();
$('textsFile').onchange=e=>{if(e.target.files[0])importTexts(e.target.files[0]);};
document.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{
  if(reading) stopRead();
  readingMode=btn.dataset.mode==='full' ? 'full' : 'word';
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b===btn));
  if(readingMode==='full'){
    $('fullView').classList.remove('hide');
    $('cardView').classList.add('hide');
    // نبدأ تجهيز الصوت في الخلفية؛ عند الضغط على التشغيل يكون غالبًا جاهزًا.
    prepareFullAudio(false).catch(()=>{});
    $('readAndAssessBtn').classList.remove('hide');
  }else{
    $('cardView').classList.remove('hide');
    $('fullView').classList.add('hide');
    $('readAndAssessBtn').classList.add('hide');
  }
  paint();
}));
$('diagBtn').onclick=()=>{ $('diag').textContent='جارٍ الفحص…'; $('diagDlg').showModal(); runDiag(); };
let fmr=null, fmrChunks=[], fmrStream=null;
async function refreshFull(){
  const b = await recGet(FULL_KEY);
  $('fState').textContent = b ? '✅ مسجّل — النص كامل جاهز' : '— مش مسجّل بعد';
}
async function fmrStart(ev){
  ev.preventDefault();
  const token=++fullRecToken;
  if(!navigator.mediaDevices || !window.MediaRecorder){ $('fState').textContent='المتصفح ما بيدعم التسجيل'; return; }
  try{
    fmrStream = await navigator.mediaDevices.getUserMedia({audio:true});
    if(token!==fullRecToken){ fmrStream.getTracks().forEach(t=>t.stop()); return; }
    fmrChunks = [];
    fmr = new MediaRecorder(fmrStream);
    fmr.ondataavailable = e=>{ if(e.data && e.data.size) fmrChunks.push(e.data); };
    fmr.onstop = async ()=>{
      const blob = new Blob(fmrChunks, {type: (fmr && fmr.mimeType) || 'audio/webm'});
      if(blob.size > 800) await recPut(FULL_KEY, blob);
      try{ fmrStream.getTracks().forEach(t=>t.stop()); }catch(e){}
      $('fRec').textContent='⏺ اضغطي واقرئي النص كامل';
      await refreshFull();
    };
    fmr.start();
    $('fRec').textContent='🔴 بسجّل… اقرئي النص، ارفعي إصبعك لما تخلّصي';
    $('fState').textContent='بسجّل الآن 🎙';
  }catch(e){ $('fState').textContent='المايك مرفوض ⛔'; }
}
function fmrStop(){ ++fullRecToken; try{ if(fmr && fmr.state!=='inactive') fmr.stop(); }catch(e){} try{ fmrStream && fmrStream.getTracks().forEach(t=>t.stop()); }catch(e){} }
async function playFull(){
  const b = await recGet(FULL_KEY);
  if(!b){ $('fState').textContent='ما في تسجيل بعد'; return; }
  const u = URL.createObjectURL(b);
  recAudio.src = u; recAudio.onended = ()=> URL.revokeObjectURL(u);
  try{ await recAudio.play(); }catch(e){}
}
function renderRec(){
  $('rWord').textContent = words[recIdx] || '';
  $('rNow').textContent = Math.min(recIdx+1, words.length);
  $('rTot').textContent = words.length;
  $('rDone').textContent = words.filter(w=>recSet.has(norm(w))).length;
  $('rState').textContent = hasRec(words[recIdx]) ? '✅ مسجّلة' : '— مش مسجّلة';
}
async function mrStart(ev){
  ev.preventDefault();
  const token=++wordRecToken;
  if(!navigator.mediaDevices || !window.MediaRecorder){ $('rState').textContent='المتصفح ما بيدعم التسجيل'; return; }
  try{
    mrStream = await navigator.mediaDevices.getUserMedia({audio:true});
    if(token!==wordRecToken){ mrStream.getTracks().forEach(t=>t.stop()); return; }
    mrChunks = [];
    mr = new MediaRecorder(mrStream);
    mr.ondataavailable = e=>{ if(e.data && e.data.size) mrChunks.push(e.data); };
    mr.onstop = async ()=>{
      const blob = new Blob(mrChunks, {type: (mr && mr.mimeType) || 'audio/webm'});
      if(blob.size > 500){ await recPut(words[recIdx], blob); await refreshRecSet(); }
      try{ mrStream.getTracks().forEach(t=>t.stop()); }catch(e){}
      $('rRec').textContent='⏺ اضغطي واقرأي';
      renderRec();
      if(recIdx < words.length-1){ recIdx++; setTimeout(renderRec, 350); }
    };
    mr.start();
    $('rRec').textContent='🔴 بسجّل… ارفعي إصبعك';
    $('rState').textContent='اقرأي الكلمة الآن';
  }catch(e){ $('rState').textContent='المايك مرفوض ⛔'; }
}
function mrStop(){ ++wordRecToken; try{ if(mr && mr.state!=='inactive') mr.stop(); }catch(e){} try{ mrStream && mrStream.getTracks().forEach(t=>t.stop()); }catch(e){} }
function b64(blob){ return new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(blob); }); }
async function exportRecs(){
  const keys = await recKeys(); const out={};
  for(const k of keys){ const b=await recGet(k); if(b) out[k]= await b64(b); }
  const blob = new Blob([JSON.stringify(out)], {type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='my-recordings.json'; a.click();
}
async function importRecs(file){
  try{
    const obj = JSON.parse(await file.text());
    for(const k in obj){
      const r = await fetch(obj[k]); const b = await r.blob();
      const d = await idb();
      await new Promise(res=>{ const q=d.transaction('recs','readwrite').objectStore('recs').put(b,k); q.onsuccess=res; q.onerror=res; });
    }
    await refreshRecSet(); renderRec(); $('rState').textContent='✅ تم الاسترجاع';
  }catch(e){ $('rState').textContent='الملف مش مظبوط'; }
}
$('recBtn').onclick = async ()=>{ recIdx = idx; await refreshRecSet(); renderRec(); await refreshFull(); $('recDlg').showModal(); };
$('fRec').addEventListener('pointerdown', fmrStart);
$('fRec').addEventListener('pointerup', fmrStop);
$('fRec').addEventListener('pointercancel', fmrStop);
$('fRec').addEventListener('pointerleave', fmrStop);
$('fPlay').onclick = playFull;
$('fDel').onclick = async ()=>{ await recDelete(FULL_KEY); await refreshFull(); };
const rr = $('rRec');
rr.addEventListener('pointerdown', mrStart);
rr.addEventListener('pointerup', mrStop);
rr.addEventListener('pointercancel', mrStop);
rr.addEventListener('pointerleave', mrStop);
$('rPlay').onclick = ()=> { if(words[recIdx]) azureSpeak(words[recIdx],null,{source:'rec-preview',playWhenActive:false}); };
$('rPrev').onclick = ()=>{ if(recIdx>0){ recIdx--; renderRec(); } };
$('rNext').onclick = ()=>{ if(recIdx<words.length-1){ recIdx++; renderRec(); } };
$('rDel').onclick = async ()=>{ await recDelete(words[recIdx]); await refreshRecSet(); renderRec(); };
$('rExp').onclick = exportRecs;
$('rImp').onclick = ()=> $('rFile').click();
$('rFile').onchange = e=>{ if(e.target.files[0]) importRecs(e.target.files[0]); };

$('voiceBtn').onclick=()=>{ $('voiceDlg').showModal(); };
$('rateSel').oninput=e=>{ rate=parseFloat(e.target.value); $('rateVal').textContent=rate.toFixed(2); };
document.querySelectorAll('[data-speed]').forEach(btn=>btn.addEventListener('click',()=>{const v=parseFloat(btn.dataset.speed);rate=v;$('rateSel').value=v;$('rateVal').textContent=v.toFixed(2);}));
$('noTash').onchange=e=>{ stripTash=e.target.checked; invalidateFullAudioCache(); };
$('azureVoiceSel').onchange=e=>{azureVoice=e.target.value;saveAzureConfig();};

$('pausePreset').onchange=e=>{pausePreset=e.target.value;};
loadAzureConfig();
engine='azure';
loadTexts();
build(TextManager.current.text);
$('reviewBtn').onclick=()=>{ $('win').classList.remove('show'); renderMistakes(); const first=Object.keys(appState.mistakes||{})[0]; if(first){const i=words.findIndex(w=>norm(w)===first); if(i>=0){idx=i;paint();}} };

// Replaced the old inline onclick handlers so reading.html stays markup-only.
document.querySelectorAll('[data-reading-action]').forEach(el=>{
  const action=el.dataset.readingAction;
  if(action==='restart') el.addEventListener('click',restart);
  else if(action==='close-dlg') el.addEventListener('click',()=>document.getElementById('dlg')?.close());
  else if(action==='close-rec-dlg') el.addEventListener('click',()=>document.getElementById('recDlg')?.close());
  else if(action==='test-voice') el.addEventListener('click',testVoice);
  else if(action==='close-voice-dlg') el.addEventListener('click',()=>document.getElementById('voiceDlg')?.close());
  else if(action==='close-progress-dlg') el.addEventListener('click',()=>document.getElementById('progressDlg')?.close());
  else if(action==='close-diag-dlg') el.addEventListener('click',()=>document.getElementById('diagDlg')?.close());
});

window.addEventListener('beforeunload',saveState);
restoreDashboard();
renderDashboard();
renderTextMeta();

function setupResponsiveReadingLayout(){
    const section=document.getElementById('v8ReadSection');
    const wrap=section?.querySelector(':scope > .wrap');
    if(!section || !wrap || document.getElementById('readingResponsiveLayout')) return;

    const morePanel=document.getElementById('moreToolsPanel');
    const tools=document.getElementById('toolsWrap');
    const moreBtn=document.getElementById('moreToolsBtn');
    const moreRow=moreBtn?.closest('.more-toggle-row');
    const coach=document.getElementById('coachPanelsBtn');
    const dashboard=document.getElementById('coachDashboard');

    // The central reading area keeps only the learning/reading experience.
    const center=document.createElement('div');
    center.id='readingCenter';

    const layout=document.createElement('div');
    layout.id='readingResponsiveLayout';

    const left=document.createElement('aside');
    left.id='readingLeftSidebar';
    left.className='reading-sidebar';
    left.innerHTML=`
      <div class="reading-sidebar-title">
        <span><span class="side-icon">📚</span> النصوص</span>
        <button type="button" class="side-toggle" aria-expanded="false">فتح القائمة</button>
      </div>
      <div class="reading-sidebar-content" id="readingLeftContent"></div>`;

    const right=document.createElement('aside');
    right.id='readingRightSidebar';
    right.className='reading-sidebar';
    right.innerHTML=`
      <div class="reading-sidebar-title">
        <span><span class="side-icon">⚙️</span> الإعدادات والأدوات</span>
        <button type="button" class="side-toggle" aria-expanded="false">فتح القائمة</button>
      </div>
      <div class="reading-sidebar-content" id="readingRightContent"></div>`;

    const leftContent=left.querySelector('#readingLeftContent');
    const rightContent=right.querySelector('#readingRightContent');

    if(morePanel){
      morePanel.classList.remove('hide');
      morePanel.style.removeProperty('display');
      if(moreRow) moreRow.style.display='none';

      // Left rail: saved texts only.
      const textManager=morePanel.querySelector('.text-manager');
      if(textManager) leftContent.appendChild(textManager);
      const savedCount=morePanel.querySelector('#savedCount');
      // savedCount lives inside text-manager; keep this guard for future markup changes.

      // Right rail: progress, sharing and reading tools.
      const topActions=morePanel.querySelector('.top-actions');
      if(topActions) rightContent.appendChild(topActions);
      const textMeta=morePanel.querySelector('#textMeta');
      if(textMeta) rightContent.appendChild(textMeta);
      Array.from(morePanel.children).forEach(child=>{
        if(child===textManager || child===topActions || child===textMeta) return;
        // The remaining .row contains recording, voice, diagnostics and edit actions.
        rightContent.appendChild(child);
      });
      morePanel.remove();
    }

    // Advanced/parent tools stay in the right rail and keep their existing behavior.
    if(tools){ rightContent.appendChild(tools); }
    if(coach){
      const coachWrap=document.createElement('div');
      coachWrap.className='side-card';
      coachWrap.appendChild(coach);
      rightContent.prepend(coachWrap);
    }
    if(dashboard){
      rightContent.appendChild(dashboard);
    }

    // Move the actual reading content into the center column.
    const centerIds=['cardView','fullView','fill','mode-strip','pause-bar','heard','azureSecureStatus','mistakesBox','v8ReadControlsWrap'];
    const centerNodes=[];
    for(const id of centerIds){
      const el=id==='fill' ? document.getElementById('fill')?.closest('.bar') :
               id==='mode-strip' ? wrap.querySelector('.mode-strip') :
               id==='pause-bar' ? wrap.querySelector('.pause-bar') :
               document.getElementById(id);
      if(el && !centerNodes.includes(el)) centerNodes.push(el);
    }

    // Capture all content after the header/banner that belongs to the reading experience.
    const header=wrap.querySelector('header');
    const banner=document.getElementById('banner');
    if(header) center.appendChild(header);
    if(banner) center.appendChild(banner);
    centerNodes.forEach(el=>center.appendChild(el));

    // Any remaining direct children are moved into center, except the side/menu pieces.
    Array.from(wrap.children).forEach(el=>{
      if(el===header || el===banner || el===moreRow || el===morePanel) return;
      if(el.classList.contains('mistakes') || el.id==='v8ReadControlsWrap' || el.id==='cardView' || el.id==='fullView' || el.classList.contains('bar') || el.classList.contains('mode-strip') || el.classList.contains('pause-bar') || el.id==='heard' || el.id==='azureSecureStatus') return;
      // Keep anything else in center so existing dialogs/scripts are not affected.
      if(el.parentElement===wrap) center.appendChild(el);
    });

    layout.appendChild(left);
    layout.appendChild(center);
    layout.appendChild(right);
    wrap.parentNode.insertBefore(layout, wrap);
    wrap.style.display='none';

    // Mobile accordion behavior.
    layout.querySelectorAll('.reading-sidebar').forEach(side=>{
      const btn=side.querySelector('.side-toggle');
      const content=side.querySelector('.reading-sidebar-content');
      btn?.addEventListener('click',()=>{
        const open=side.classList.toggle('open');
        btn.setAttribute('aria-expanded',String(open));
        btn.textContent=open?'إغلاق القائمة':'فتح القائمة';
      });
    });

    // Device detection is centralized in reading-app-config.js.
    // This page only reacts to the selected device/layout.
    const syncSidebars=(info)=>{
      const compact = info.device === 'phone' || info.layout === 'tablet-portrait';
      layout.querySelectorAll('.reading-sidebar').forEach(side=>{
        const btn=side.querySelector('.side-toggle');
        if(compact){
          side.classList.remove('open');
          btn?.setAttribute('aria-expanded','false');
          if(btn) btn.textContent='فتح القائمة';
        }else{
          side.classList.add('open');
          btn?.setAttribute('aria-expanded','true');
          if(btn) btn.textContent='';
        }
      });
    };

    const deviceApi=window.READING_APP_CONFIG?.DEVICE;
    const currentDevice=deviceApi?.apply?.() || deviceApi?.getInfo?.() || {device:'desktop',layout:'desktop'};
    syncSidebars(currentDevice);
    window.addEventListener('sana:devicechange', e=>syncSidebars(e.detail || currentDevice));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',setupResponsiveReadingLayout);
  else setupResponsiveReadingLayout();
