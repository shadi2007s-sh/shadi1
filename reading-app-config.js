/*
 * إعدادات مشتركة لجميع صفحات التطبيق (القراءة، الإملاء، الفحص).
 * هذا هو المكان الوحيد الذي يجب تعديله عند تغيير رابط الخادم أو الصوت أو المنطقة —
 * كل الصفحات تقرأ من هنا بدل أن يكرّر كل ملف نفس القيم.
 */
window.READING_APP_CONFIG = window.READING_APP_CONFIG || {
  TOKEN_ENDPOINT: 'https://reading-speech-api-e9hbc8fscfaxacgv.israelcentral-01.azurewebsites.net/api/speech-token',
  REGION: 'eastus',
  VOICE: 'ar-JO-SanaNeural',
  SDK_URL: 'https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.46.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js'
};

// أسماء بديلة يستخدمها كل ملف تاريخيًا — تشير كلها لنفس الكائن أعلاه،
// حتى لا نضطر لتعديل بقية الكود في كل صفحة.
window.DICTATION_APP_CONFIG = window.READING_APP_CONFIG;


/* ============================================================
 * اكتشاف الجهاز والتخطيط الأفضل
 * المصدر المركزي: كل الصفحات تقرأ النتيجة من هذا الجزء.
 * ============================================================ */
window.READING_APP_CONFIG.DEVICE = window.READING_APP_CONFIG.DEVICE || (() => {
  const state = { lastSignature: '' };

  function getInfo() {
    const w = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0);
    const h = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
    const ua = String(navigator.userAgent || '');
    const platform = String(navigator.platform || '');
    const touchPoints = Number(navigator.maxTouchPoints || 0);
    const touch = touchPoints > 0;
    const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
    const hover = !!window.matchMedia?.('(hover: hover)').matches;

    /* iPadOS can advertise itself as a Mac. Touch points are the key signal. */
    const isIPadUA = /iPad/i.test(ua);
    const isIPadOSDesktopUA = /Macintosh/i.test(ua) && touchPoints > 1;
    const isAndroid = /Android/i.test(ua);
    const isAndroidTablet = isAndroid && !/Mobile/i.test(ua);
    const isIPhone = /iPhone|iPod/i.test(ua);
    const isPhoneUA = isIPhone || (isAndroid && /Mobile/i.test(ua));
    const isTabletUA = isIPadUA || isIPadOSDesktopUA || isAndroidTablet;

    let device = 'desktop';
    if (isPhoneUA) {
      device = 'phone';
    } else if (isTabletUA) {
      device = 'tablet';
    } else if (touch && coarse && w <= 1200) {
      /* Covers other touch-first tablets whose UA is not distinctive. */
      device = 'tablet';
    } else if (w <= 700) {
      /* Small browser windows behave best like phone layout. */
      device = 'phone';
    }

    let orientation = w >= h ? 'landscape' : 'portrait';
    if (device === 'phone') orientation = 'portrait';

    /* Keep layout=portrait/landscape for compatibility with existing CSS.
     * view is the more specific presentation selected by the classifier. */
    const view = device === 'phone'
      ? 'phone'
      : device === 'tablet'
        ? `tablet-${orientation}`
        : 'desktop';

    return {
      device,
      layout: orientation,
      view,
      orientation,
      width: w,
      height: h,
      touch,
      coarse,
      hover,
      touchPoints,
      isIPad: isIPadUA || isIPadOSDesktopUA,
      isAndroid,
      isTablet: device === 'tablet',
      isPhone: device === 'phone',
      isDesktop: device === 'desktop'
    };
  }

  function apply() {
    const info = getInfo();
    const signature = [
      info.device, info.view, info.orientation,
      info.width, info.height, info.touchPoints
    ].join('|');

    document.documentElement.dataset.sanaDevice = info.device;
    document.documentElement.dataset.sanaLayout = info.layout;
    document.documentElement.dataset.sanaView = info.view;
    document.documentElement.dataset.sanaOrientation = info.orientation;
    document.documentElement.dataset.sanaTouch = info.touch ? '1' : '0';
    document.documentElement.dataset.sanaHover = info.hover ? '1' : '0';

    document.body?.setAttribute('data-sana-device', info.device);
    document.body?.setAttribute('data-sana-layout', info.layout);
    document.body?.setAttribute('data-sana-view', info.view);
    document.body?.setAttribute('data-sana-orientation', info.orientation);
    document.body?.setAttribute('data-sana-touch', info.touch ? '1' : '0');
    document.body?.setAttribute('data-sana-hover', info.hover ? '1' : '0');

    const changed = signature !== state.lastSignature;
    state.lastSignature = signature;

    if (changed) {
      window.dispatchEvent(new CustomEvent('sana:devicechange', { detail: info }));
    }
    return info;
  }

  function start() {
    if (!document.body) return getInfo();
    apply();
    const refresh = () => apply();
    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(refresh, 100), { passive: true });
    return getInfo();
  }

  return Object.freeze({ getInfo, apply, start });
})();

window.initSanaDeviceDetection = window.initSanaDeviceDetection || (() => {
  const start = () => window.READING_APP_CONFIG.DEVICE.start();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  return window.READING_APP_CONFIG.DEVICE;
})();

/* ============================================================
 * مزامنة النص المشترك بين القراءة والإملاء
 * القراءة هي المصدر الرئيسي، والإملاء يستقبل آخر نص مختار تلقائيًا.
 * ============================================================ */
window.READING_APP_CONFIG.SHARED_TEXT_KEY =
  window.READING_APP_CONFIG.SHARED_TEXT_KEY || 'sana_current_learning_text_v1';

window.sanaTextSync = window.sanaTextSync || (() => {
  const KEY = window.READING_APP_CONFIG.SHARED_TEXT_KEY;
  const listeners = new Set();

  function get(){
    try{
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){
      return null;
    }
  }

  function publish(text, meta={}){
    const value = String(text || '').trim();
    if(!value) return;
    const payload = {
      text: value,
      name: String(meta.name || 'النص الحالي'),
      textId: String(meta.textId || ''),
      updatedAt: new Date().toISOString()
    };
    try{ localStorage.setItem(KEY, JSON.stringify(payload)); }catch(e){}
    listeners.forEach(fn => { try{ fn(payload); }catch(e){} });
  }

  function onChange(fn){
    if(typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  window.addEventListener('storage', e => {
    if(e.key !== KEY || !e.newValue) return;
    try{
      const payload = JSON.parse(e.newValue);
      listeners.forEach(fn => { try{ fn(payload); }catch(err){} });
    }catch(err){}
  });

  return Object.freeze({ KEY, get, publish, onChange });
})();

/* ============================================================
 * التنقل المركزي بين صفحات التطبيق
 * غيّر أسماء الملفات هنا فقط إذا تغيّر هيكل المشروع.
 * ============================================================ */
window.READING_APP_CONFIG.PAGES = window.READING_APP_CONFIG.PAGES || {
  home:         { file: 'index.html',       label: '🏠 الرئيسية',   title: 'الرئيسية' },
  reading:      { file: 'reading.html',     label: '📖 القراءة',    title: 'تدريب القراءة' },
  dictation:    { file: 'dictation.html',   label: '✍️ الإملاء',    title: 'تدريب الإملاء' },
  diagnostics:  { file: 'diagnostics.html', label: '🩺 فحص النظام', title: 'فحص النظام' }
};

window.initSanaNavigation = window.initSanaNavigation || (() => {
  const CONFIG = window.READING_APP_CONFIG;
  const NAV_ID = 'central-app-nav';
  const STYLE_ID = 'central-app-nav-style';

  function currentPage() {
    const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    return Object.entries(CONFIG.PAGES).find(([, page]) => page.file.toLowerCase() === current)?.[0] || 'home';
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${NAV_ID}{
        max-width:860px;margin:0 auto 10px;padding:8px;display:flex;gap:7px;
        flex-wrap:wrap;align-items:center;justify-content:center;background:rgba(255,255,255,.88);
        border:2px solid #d8e8f0;border-radius:18px;box-shadow:0 6px 16px rgba(40,75,95,.08);
        direction:rtl;font-family:"Baloo Bhaijaan 2","Noto Naskh Arabic",system-ui,sans-serif;
      }
      #${NAV_ID} a{
        flex:1 1 120px;min-width:108px;text-align:center;text-decoration:none;color:#253844;
        background:#fff;border:2px solid #cfe4ee;border-radius:13px;padding:9px 10px;font-weight:800;
        line-height:1.25;transition:transform .12s,background .12s,border-color .12s;touch-action:manipulation;
      }
      #${NAV_ID} a:hover{transform:translateY(-1px)}
      #${NAV_ID} a[aria-current="page"]{background:#eef9ff;border-color:#67b8e9}
      @media(max-width:620px){#${NAV_ID} a{flex:1 1 calc(50% - 7px);min-width:0;font-size:.9rem}}
    `;
    document.head.appendChild(style);
  }

  function buildNav() {
    if (!document.body || document.getElementById(NAV_ID)) return;
    injectStyles();
    const nav = document.createElement('nav');
    nav.id = NAV_ID;
    nav.setAttribute('aria-label', 'التنقل بين صفحات التطبيق');
    const page = currentPage();

    Object.entries(CONFIG.PAGES).forEach(([key, item]) => {
      const a = document.createElement('a');
      a.href = item.file;
      a.textContent = item.label;
      a.title = item.title;
      if (key === page) a.setAttribute('aria-current', 'page');
      nav.appendChild(a);
    });
    document.body.insertBefore(nav, document.body.firstChild);
  }

  function wireDataLinks() {
    document.querySelectorAll('[data-nav]').forEach(el => {
      const item = CONFIG.PAGES[el.getAttribute('data-nav')];
      if (!item) return;
      if (el.tagName === 'A') el.href = item.file;
      el.setAttribute('data-nav-resolved', item.file);
    });
  }

  function init() { buildNav(); wireDataLinks(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  return Object.freeze({ pages: CONFIG.PAGES, current: currentPage, init });
})();
