/*
 * النواة المشتركة لجميع صفحات التطبيق.
 * لا تحتوي على أي UI؛ فقط أدوات مشتركة للمصادقة، تحميل Azure SDK، والتخزين.
 */
(function(){
  'use strict';

  const CONFIG = window.READING_APP_CONFIG || {};
  const TOKEN_CACHE_MS = 9 * 60 * 1000;
  const SDK_TIMEOUT_MS = 15000;

  let tokenCache = null;
  let tokenCachedAt = 0;
  let sdkPromise = null;

  function coreLog(message, error){
    try{
      console.error('[SanaCore] ' + message, error || '');
    }catch(_){ /* logging must never break the app */ }
  }

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    })[char]);
  }

  function storageGet(key, fallback=null){
    try{
      const value = localStorage.getItem(key);
      return value == null ? fallback : value;
    }catch(error){
      coreLog('storage get failed for '+key, error);
      return fallback;
    }
  }

  function storageSet(key, value){
    try{
      localStorage.setItem(key, String(value));
      return true;
    }catch(error){
      coreLog('storage set failed for '+key, error);
      return false;
    }
  }

  function storageRemove(key){
    try{
      localStorage.removeItem(key);
      return true;
    }catch(error){
      coreLog('storage remove failed for '+key, error);
      return false;
    }
  }

  async function getToken(force=false){
    const now = Date.now();
    if(!force && tokenCache && (now - tokenCachedAt) < TOKEN_CACHE_MS){
      return tokenCache;
    }

    const url = String(CONFIG.TOKEN_ENDPOINT || '').trim();
    if(!url || url.includes('YOUR-FUNCTION-APP')){
      throw new Error('TOKEN_ENDPOINT_NOT_CONFIGURED');
    }

    let response;
    try{
      response = await fetch(url, {
        method:'GET',
        cache:'no-store',
        headers:{'Accept':'application/json'}
      });
    }catch(error){
      coreLog('token request failed', error);
      throw new Error('TOKEN_NETWORK_OR_CORS');
    }

    if(!response.ok){
      throw new Error('TOKEN_HTTP_'+response.status);
    }

    let data;
    try{
      data = await response.json();
    }catch(error){
      coreLog('token response JSON parse failed', error);
      throw new Error('TOKEN_BAD_JSON');
    }

    if(!data || !data.token){
      throw new Error('TOKEN_MISSING');
    }

    tokenCache = data;
    tokenCachedAt = Date.now();
    return data;
  }

  function loadSdk(){
    if(window.SpeechSDK) return Promise.resolve(window.SpeechSDK);
    if(sdkPromise) return sdkPromise;

    const url = String(CONFIG.SDK_URL || '').trim();
    if(!url){
      return Promise.reject(new Error('SDK_URL_NOT_CONFIGURED'));
    }

    sdkPromise = new Promise((resolve,reject)=>{
      let settled = false;
      const finish = (error, sdk) => {
        if(settled) return;
        settled = true;
        clearTimeout(timeout);
        if(error){
          sdkPromise = null;
          reject(error);
        }else{
          resolve(sdk);
        }
      };

      const timeout = setTimeout(()=>finish(new Error('SDK_LOAD_TIMEOUT')), SDK_TIMEOUT_MS);
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.crossOrigin = 'anonymous';
      const integrity = String(CONFIG.SDK_SRI || '').trim();
      if(integrity){
        script.integrity = integrity;
        script.referrerPolicy = 'no-referrer';
      }
      script.onload = () => {
        if(window.SpeechSDK) finish(null, window.SpeechSDK);
        else finish(new Error('SDK_LOAD_EMPTY'));
      };
      script.onerror = () => finish(new Error('SDK_LOAD_FAILED'));
      document.head.appendChild(script);
    });

    return sdkPromise;
  }

  function registerServiceWorker(){
    if(!('serviceWorker' in navigator)) return;
    if(location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('./service-worker.js').catch(error=>coreLog('service worker registration failed', error));
    }, {once:true});
  }

  window.SanaCore = Object.freeze({
    escapeHtml,
    getToken,
    loadSdk,
    storageGet,
    storageSet,
    storageRemove,
    registerServiceWorker
  });

  registerServiceWorker();
})();
