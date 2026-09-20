/*
 * مخزن التقدّم الموحّد.
 * يحتفظ بنسخة حديثة واحدة، ويستورد بيانات الإصدارات القديمة بدون فقدانها.
 */
(function(){
  'use strict';

  const STORAGE_KEY = 'sanaProgress';
  const SCHEMA_VERSION = 1;
  const LEGACY_V10_KEY = 'readingCoachV10';
  const LEGACY_V7_KEY = 'readingCoachV7';
  const LEGACY_HISTORY_KEY = 'readingCoachHistoryV7';

  const defaultLesson = () => ({
    correct:0, wrong:0, streak:0, best:0, startedAt:null,
    mistakes:{}, attempts:0, finished:false, wordCount:0
  });

  const defaultCoach = () => ({
    hard:{}, sessions:0, words:0, bestAccuracy:0, bestStreak:0, history:[]
  });

  const clone = value => JSON.parse(JSON.stringify(value));

  function readJson(key, fallback){
    const raw = window.SanaCore?.storageGet(key, null);
    if(raw == null) return fallback;
    try { return JSON.parse(raw); }
    catch(error){
      console.error('[SanaProgress] invalid JSON in '+key, error);
      return fallback;
    }
  }

  function normalizeLesson(value){
    const base=defaultLesson();
    if(!value || typeof value!=='object') return base;
    return {
      ...base,
      ...value,
      mistakes:value.mistakes && typeof value.mistakes==='object' ? {...value.mistakes} : {}
    };
  }

  function normalizeCoach(value){
    const base=defaultCoach();
    if(!value || typeof value!=='object') return base;
    return {
      ...base,
      ...value,
      hard:value.hard && typeof value.hard==='object' ? {...value.hard} : {},
      history:Array.isArray(value.history) ? value.history.slice(-50) : []
    };
  }

  function normalizeProgress(value){
    return {
      schemaVersion:SCHEMA_VERSION,
      lesson:normalizeLesson(value?.lesson),
      history:Array.isArray(value?.history) ? value.history.slice(-50) : [],
      coach:normalizeCoach(value?.coach)
    };
  }

  function migrate(){
    const current=readJson(STORAGE_KEY,null);
    if(current && typeof current==='object'){
      const normalized=normalizeProgress(current);
      if(current.schemaVersion !== SCHEMA_VERSION){
        persist(normalized);
      }
      return normalized;
    }

    const legacyV7=readJson(LEGACY_V7_KEY,null);
    const legacyHistory=readJson(LEGACY_HISTORY_KEY,[]);
    const legacyV10=readJson(LEGACY_V10_KEY,null);

    const migrated={
      schemaVersion:SCHEMA_VERSION,
      lesson:normalizeLesson(legacyV7),
      history:Array.isArray(legacyHistory) ? legacyHistory.slice(-50) : [],
      coach:normalizeCoach(legacyV10)
    };

    // إذا لم توجد بيانات v10 لكن توجد بيانات قراءة قديمة، لا نفقد الإحصاءات المتاحة.
    if(!legacyV10 || typeof legacyV10!=='object'){
      migrated.coach.history = migrated.history.map(entry=>({
        type:'reading',
        at:entry?.at ? new Date(entry.at).toISOString() : new Date().toISOString(),
        accuracy:Number(entry?.accuracy||0),
        words:Number(entry?.total||entry?.correct||0)
      }));
      migrated.coach.sessions = migrated.history.length;
      migrated.coach.words = migrated.history.reduce((sum,entry)=>sum+Number(entry?.total||0),0);
      migrated.coach.bestAccuracy = migrated.history.reduce((best,entry)=>Math.max(best,Number(entry?.accuracy||0)),0);
      migrated.coach.hard = Object.entries(migrated.lesson.mistakes||{}).reduce((out,[word,count])=>{
        out[word]=Number(count)||0; return out;
      },{});
    }

    persist(migrated);
    return migrated;
  }

  function persist(value){
    const normalized=normalizeProgress(value);
    const ok=window.SanaCore?.storageSet(STORAGE_KEY,JSON.stringify(normalized));
    if(ok) window.dispatchEvent(new CustomEvent('sana:progresschange'));
    return ok;
  }

  let state=migrate();

  function refresh(){ state=normalizeProgress(readJson(STORAGE_KEY,state)); }

  function saveLessonState(lesson,history){
    refresh();
    state.lesson=normalizeLesson(lesson);
    state.history=Array.isArray(history) ? history.slice(-50) : state.history;
    persist(state);
  }

  function saveCoachState(coach){
    refresh();
    state.coach=normalizeCoach(coach);
    persist(state);
  }

  function getLessonState(){ refresh(); return clone(state.lesson); }
  function getHistory(){ refresh(); return clone(state.history); }
  function getCoachState(){ refresh(); return clone(state.coach); }
  function getState(){ refresh(); return clone(state); }

  window.SanaProgress=Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    getState,
    getLessonState,
    getHistory,
    getCoachState,
    saveLessonState,
    saveCoachState
  });

  try{ navigator.storage?.persist?.().catch(()=>{}); }catch(error){
    console.error('[SanaProgress] storage persistence request failed',error);
  }
})();
