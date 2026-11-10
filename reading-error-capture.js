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
    const recentEntries = entries.slice().reverse();
    if(recentEntries.length){
      recentEntries.forEach(e => {
        const row = document.createElement('div');
        row.style.cssText = 'padding:10px 14px;border-bottom:1px solid #1e2a36;border-right:3px solid ' +
          (e.level === 'error' ? '#ff6b5e' : '#ffc247') +
          ';white-space:pre-wrap;overflow-wrap:anywhere';
        const time = document.createElement('span');
        time.style.color = '#5d7183';
        time.textContent = e.at.slice(11, 19);
        row.appendChild(time);
        row.appendChild(document.createTextNode('  ' + String(e.message)));
        if(e.where){
          const where = document.createElement('div');
          where.style.cssText = 'color:#7d93a8;font-size:.74rem;margin-top:3px';
          where.textContent = e.where;
          row.appendChild(where);
        }
        body.appendChild(row);
      });
    }else{
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:16px;color:#5d7183';
      empty.textContent = 'لا توجد أخطاء.';
      body.appendChild(empty);
    }

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

  // Small public API, also used by the diagnostics page.
  window.readingAppErrors = {
    all: () => entries.slice(),
    clear: () => { entries = []; write(entries); if(badge){ badge.remove(); badge = null; } },
    open: openViewer
  };
})();
