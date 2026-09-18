(() => {
  function setupResponsiveReadingLayout(){
    const section=document.getElementById('v8ReadSection');
    const wrap=section?.querySelector(':scope > .wrap');
    if(!section || !wrap || document.getElementById('readingResponsiveLayout')) return;

    const morePanel=document.getElementById('moreToolsPanel');
    const v10=document.getElementById('v10ToolsWrap');
    const moreBtn=document.getElementById('moreToolsBtn');
    const moreRow=moreBtn?.closest('.more-toggle-row');
    const coach=document.getElementById('coachPanelsBtn');
    const dashboard=document.getElementById('v9Dashboard');

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

      // Left rail: compact reading mode / playback controls under "نصوصي".
      const modeStrip=wrap.querySelector('.mode-strip');
      const pauseBar=wrap.querySelector('.pause-bar');
      if(modeStrip || pauseBar){
        const actions=document.createElement('div');
        actions.className='left-reading-actions';
        actions.innerHTML='<div class="actions-title">🎛 التحكم بالقراءة</div>';
        if(modeStrip) actions.appendChild(modeStrip);
        if(pauseBar) actions.appendChild(pauseBar);
        leftContent.appendChild(actions);
      }

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
    if(v10){ rightContent.appendChild(v10); }
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
    const centerIds=['cardView','fullView','fill','heard','azureSecureStatus','mistakesBox','v8ReadControlsWrap'];
    const centerNodes=[];
    for(const id of centerIds){
      const el=id==='fill' ? document.getElementById('fill')?.closest('.bar') :
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
      if(el.classList.contains('mistakes') || el.id==='v8ReadControlsWrap' || el.id==='cardView' || el.id==='fullView' || el.classList.contains('bar') || el.id==='heard' || el.id==='azureSecureStatus') return;
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
})();
