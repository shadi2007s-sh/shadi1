// Sana Neural - Reading UI helpers
// Keeps the existing global names used by the reading page.
const $ = id => document.getElementById(id);
const readingUi = {
  say: h => { const el=$('heard'); if(el) el.textContent=h; },
  setVoiceStatus: msg => {
    const x=document.getElementById('v10VoiceStatus'); if(x) x.textContent=msg;
    const y=document.getElementById('azureSecureStatus'); if(y && msg) y.textContent='☁️ '+msg;
  }
};
const norm = window.sanaUtils.normalizeArabicKey;
