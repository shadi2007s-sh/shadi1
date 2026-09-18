/*
 * Sana Common — وظائف مشتركة فعلًا بين صفحات القراءة والإملاء.
 * لا يحتوي إعدادات Azure أو التنقل؛ تلك تبقى في reading-app-config.js.
 */
window.sanaUtils = window.sanaUtils || (() => {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[ch]);
  }

  function normalizeArabicKey(value) {
    return String(value || '')
      .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/[^\u0621-\u064A0-9a-zA-Z]/g, '')
      .trim();
  }

  function beep(frequency = 880, duration = 0.12) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = Number(frequency) || 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + Math.max(0.03, Number(duration) || 0.12));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + Math.max(0.04, Number(duration) || 0.12) + 0.02);
      osc.onended = () => { try { ctx.close(); } catch (_) {} };
    } catch (_) {}
  }

  return Object.freeze({ escapeHtml, normalizeArabicKey, beep });
})();

window.sanaEffects = window.sanaEffects || (() => {
  function confetti(count = 50) {
    if (!document.body) return;
    const colors = ['#e2725b','#f0b429','#2f8f5b','#5aa9d6','#fff'];
    for (let i = 0; i < Number(count) || 0; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      document.body.appendChild(c);
      if (typeof c.animate === 'function') {
        c.animate(
          [{transform:'translateY(0) rotate(0)'},{transform:'translateY(105vh) rotate(720deg)'}],
          {duration:2200 + Math.random() * 1600, easing:'ease-in'}
        ).onfinish = () => c.remove();
      } else {
        setTimeout(() => c.remove(), 4000);
      }
    }
  }
  return Object.freeze({ confetti });
})();

window.sanaRecordings = window.sanaRecordings || (() => {
  const DB_NAME = 'readingRecs';
  const STORE_NAME = 'recs';

  function keyOf(value, normalizer) {
    return typeof normalizer === 'function' ? normalizer(value) : value;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    });
  }

  async function get(value, normalizer) {
    try {
      const db = await openDb();
      return await new Promise(resolve => {
        const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(keyOf(value, normalizer));
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    } catch (_) { return null; }
  }

  async function put(value, blob, normalizer) {
    try {
      const db = await openDb();
      await new Promise(resolve => {
        const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
          .put(blob, keyOf(value, normalizer));
        request.onsuccess = request.onerror = () => resolve();
      });
    } catch (_) {}
  }

  async function remove(value, normalizer) {
    try {
      const db = await openDb();
      await new Promise(resolve => {
        const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
          .delete(keyOf(value, normalizer));
        request.onsuccess = request.onerror = () => resolve();
      });
    } catch (_) {}
  }

  async function keys() {
    try {
      const db = await openDb();
      return await new Promise(resolve => {
        const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAllKeys();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
    } catch (_) { return []; }
  }

  async function entries() {
    try {
      const db = await openDb();
      return await new Promise(resolve => {
        const store = db.transaction(STORE_NAME).objectStore(STORE_NAME);
        const keysRequest = store.getAllKeys();
        const valuesRequest = store.getAll();
        let keysValue = null, valuesValue = null;
        const finish = () => {
          if (!keysValue || !valuesValue) return;
          const out = keysValue.map((key, i) => ({key, value: valuesValue[i]}));
          resolve(out);
        };
        keysRequest.onsuccess = () => { keysValue = keysRequest.result || []; finish(); };
        valuesRequest.onsuccess = () => { valuesValue = valuesRequest.result || []; finish(); };
        keysRequest.onerror = valuesRequest.onerror = () => resolve([]);
      });
    } catch (_) { return []; }
  }

  return Object.freeze({ get, put, remove, keys, entries });
})();
