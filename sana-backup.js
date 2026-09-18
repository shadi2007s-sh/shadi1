/* Sana Backup System — Phase 5 Step 10
   Backs up app localStorage data and user recordings without changing
   the existing storage keys or data shapes. Generated full-audio cache
   is intentionally excluded because it is disposable and can be rebuilt.
*/
(() => {
  const META_KEY = 'sanaBackupMetaV1';
  const FORMAT = 'sana-neural-backup';
  const VERSION = 1;
  const SESSION_THRESHOLD = 5;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  function readMeta() {
    try {
      const x = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      return {
        version: VERSION,
        lastExportAt: typeof x.lastExportAt === 'string' ? x.lastExportAt : null,
        lastExportSessions: Number(x.lastExportSessions) || 0
      };
    } catch (_) {
      return { version: VERSION, lastExportAt: null, lastExportSessions: 0 };
    }
  }

  function saveMeta(meta) {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (_) {}
  }

  function currentSessions() {
    try {
      const x = JSON.parse(localStorage.getItem('readingCoachV10') || '{}');
      return Number(x?.pronunciation?.sessions ?? x?.sessions) || 0;
    } catch (_) { return 0; }
  }

  function appStorageKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key === META_KEY) continue;
      // App-owned keys currently use the reading/sana prefixes.
      if (/^(reading|sana)/i.test(key)) keys.push(key);
    }
    return keys.sort();
  }

  async function blobToDataUrl(blob) {
    if (!(blob instanceof Blob)) return null;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('BLOB_READ_FAILED'));
      reader.readAsDataURL(blob);
    });
  }

  async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return await response.blob();
  }

  async function buildBackup() {
    const storage = {};
    appStorageKeys().forEach(key => {
      try { storage[key] = localStorage.getItem(key); } catch (_) {}
    });

    const recordings = [];
    if (window.sanaRecordings?.entries) {
      const entries = await window.sanaRecordings.entries();
      for (const entry of entries) {
        try {
          const dataUrl = await blobToDataUrl(entry.value);
          if (dataUrl) recordings.push({ key: entry.key, dataUrl });
        } catch (_) {}
      }
    }

    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      storage,
      recordings
    };
  }

  function downloadJson(obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sana-neural-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function exportAll() {
    try {
      const backup = await buildBackup();
      downloadJson(backup);
      saveMeta({version: VERSION, lastExportAt: backup.exportedAt, lastExportSessions: currentSessions()});
      updateStatus('تم إنشاء النسخة الاحتياطية بنجاح ✅', false);
      if (window.readingUi?.say) window.readingUi.say('💾 تم إنشاء النسخة الاحتياطية.');
    } catch (e) {
      updateStatus('تعذر إنشاء النسخة الاحتياطية. جرّبي مرة أخرى.', true);
      if (window.readingUi?.say) window.readingUi.say('❌ تعذر إنشاء النسخة الاحتياطية.');
    }
  }

  function validateBackup(obj) {
    return !!obj && obj.format === FORMAT && Number(obj.version) === VERSION &&
      obj.storage && typeof obj.storage === 'object' && !Array.isArray(obj.storage) &&
      Array.isArray(obj.recordings);
  }

  async function importAll(file) {
    try {
      const obj = JSON.parse(await file.text());
      if (!validateBackup(obj)) throw new Error('INVALID_BACKUP');

      const keys = Object.keys(obj.storage);
      const recordings = obj.recordings.filter(x => x && (typeof x.key === 'string' || typeof x.key === 'number') && typeof x.dataUrl === 'string');
      const message = `سيتم استعادة ${keys.length} من بيانات التطبيق و${recordings.length} تسجيلًا.\nلن يتم حذف البيانات الحالية غير الموجودة في الملف.\n\nهل تريد المتابعة؟`;
      if (!window.confirm(message)) return;

      keys.forEach(key => {
        try { localStorage.setItem(key, String(obj.storage[key] ?? '')); } catch (_) {}
      });

      if (window.sanaRecordings?.put) {
        for (const item of recordings) {
          try {
            const blob = await dataUrlToBlob(item.dataUrl);
            await window.sanaRecordings.put(item.key, blob);
          } catch (_) {}
        }
      }

      updateStatus('تم استعادة النسخة الاحتياطية. جارٍ تحديث التطبيق…', false);
      if (window.readingUi?.say) window.readingUi.say('✅ تم استعادة النسخة الاحتياطية.');
      setTimeout(() => location.reload(), 500);
    } catch (e) {
      updateStatus('ملف النسخة الاحتياطية غير صالح أو تالف.', true);
      if (window.readingUi?.say) window.readingUi.say('❌ ملف النسخة الاحتياطية غير صالح.');
    }
  }

  function due() {
    const meta = readMeta();
    const sessions = currentSessions();
    if (!meta.lastExportAt) return sessions > 0;
    const elapsed = Date.now() - Date.parse(meta.lastExportAt);
    return (Number.isFinite(elapsed) && elapsed >= WEEK_MS) || (sessions - meta.lastExportSessions >= SESSION_THRESHOLD);
  }

  function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ar-JO', {dateStyle: 'medium'});
  }

  function updateStatus(message, error) {
    const el = document.getElementById('backupReminder');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('backup-error', !!error);
    el.classList.remove('backup-due');
  }

  function renderReminder() {
    const el = document.getElementById('backupReminder');
    if (!el) return;
    const meta = readMeta();
    if (due()) {
      el.textContent = meta.lastExportAt
        ? `🔔 حان وقت نسخة احتياطية جديدة (آخر نسخة: ${formatDate(meta.lastExportAt)}).`
        : '🔔 لم يتم إنشاء نسخة احتياطية بعد.';
      el.classList.add('backup-due');
      el.classList.remove('backup-error');
    } else if (meta.lastExportAt) {
      el.textContent = `آخر نسخة احتياطية: ${formatDate(meta.lastExportAt)} ✅`;
      el.classList.remove('backup-due', 'backup-error');
    } else {
      el.textContent = 'يمكنك إنشاء نسخة احتياطية لحفظ بياناتك.';
      el.classList.remove('backup-due', 'backup-error');
    }
  }

  function openDialog() {
    const dlg = document.getElementById('backupDlg');
    if (!dlg) return;
    renderReminder();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.classList.add('show');
  }

  function closeDialog() {
    const dlg = document.getElementById('backupDlg');
    if (!dlg) return;
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.classList.remove('show');
  }

  window.sanaBackup = Object.freeze({exportAll, importAll, openDialog, renderReminder});

  function init() {
    document.getElementById('v9BackupBtn')?.addEventListener('click', openDialog);
    document.getElementById('backupExportBtn')?.addEventListener('click', exportAll);
    document.getElementById('backupImportBtn')?.addEventListener('click', () => document.getElementById('backupFileInput')?.click());
    document.getElementById('backupFileInput')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) importAll(file);
    });
    document.getElementById('closeBackupDlgBtn')?.addEventListener('click', closeDialog);
    renderReminder();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
