/* =============================================================================
   calendar.js — 計劃 + 作品 月曆檢視
   - plan: 用 scheduledDate(預計實行)為主、planDate 為次
   - work: 用 date
   - 點擊日期 → 顯示當日項目;再點項目 → 開啟對應 detail modal
   ============================================================================= */
(function () {
  let elModal, elClose, elGrid, elMonthLabel, elPrev, elNext, elDayList, elDayTitle;
  let _viewYear = 0, _viewMonth = 0; // month 0-based
  let _selectedKey = null;

  function $(id) { return document.getElementById(id); }

  function init() {
    elModal = $('calendarModal');
    elClose = $('calendarClose');
    elGrid  = $('calGrid');
    elMonthLabel = $('calMonthLabel');
    elPrev = $('calPrev');
    elNext = $('calNext');
    elDayList = $('calDayList');
    elDayTitle = $('calDayTitle');

    if (!elModal) return;
    elClose.addEventListener('click', close);
    elModal.addEventListener('click', (e) => { if (e.target === elModal) close(); });
    elPrev.addEventListener('click', () => shiftMonth(-1));
    elNext.addEventListener('click', () => shiftMonth(1));
    elGrid.addEventListener('click', onDayClick);
    elDayList.addEventListener('click', onDayItemClick);
  }

  function open() {
    const now = new Date();
    _viewYear = now.getFullYear();
    _viewMonth = now.getMonth();
    _selectedKey = dateKey(now);
    render();
    elModal.hidden = false;
  }
  function close() { elModal.hidden = true; }

  function shiftMonth(delta) {
    const d = new Date(_viewYear, _viewMonth + delta, 1);
    _viewYear = d.getFullYear();
    _viewMonth = d.getMonth();
    _selectedKey = null;
    render();
  }

  function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function dateKeyFromTs(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return dateKey(d);
  }

  function collectMap() {
    const map = new Map(); // key → { plans:[], works:[] }
    const ensure = (k) => {
      if (!map.has(k)) map.set(k, { plans: [], works: [] });
      return map.get(k);
    };
    const modeFilter = (it) => !window.AppMode || AppMode.modeOf(it) === AppMode.get();
    if (window.Plans && Plans.getAll) {
      Plans.getAll().filter(modeFilter).forEach(p => {
        const ts = p.scheduledDate || p.planDate;
        const k = dateKeyFromTs(ts);
        if (k) ensure(k).plans.push(p);
      });
    }
    if (window.Works && Works.getAll) {
      Works.getAll().filter(modeFilter).forEach(w => {
        const k = dateKeyFromTs(w.date);
        if (k) ensure(k).works.push(w);
      });
    }
    return map;
  }

  function render() {
    elMonthLabel.textContent = `${_viewYear} 年 ${_viewMonth + 1} 月`;
    const map = collectMap();

    const firstOfMonth = new Date(_viewYear, _viewMonth, 1);
    const startDow = firstOfMonth.getDay(); // 0 = Sun
    const daysInMonth = new Date(_viewYear, _viewMonth + 1, 0).getDate();

    // 6 行 × 7 欄,從這個月 1 號的星期偏移開始
    const cells = [];
    // 前置:上個月尾巴
    const prevMonthDays = new Date(_viewYear, _viewMonth, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const d = new Date(_viewYear, _viewMonth - 1, day);
      cells.push({ d, other: true });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ d: new Date(_viewYear, _viewMonth, day), other: false });
    }
    while (cells.length % 7 !== 0 || cells.length < 42) {
      const last = cells[cells.length - 1].d;
      const next = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
      cells.push({ d: next, other: next.getMonth() !== _viewMonth });
      if (cells.length >= 42) break;
    }

    const todayKey = dateKey(new Date());
    elGrid.innerHTML = cells.map(c => {
      const k = dateKey(c.d);
      const info = map.get(k);
      const cls = [];
      cls.push('cal-day');
      if (c.other) cls.push('is-other');
      if (k === todayKey) cls.push('is-today');
      if (k === _selectedKey) cls.push('is-selected');
      let dots = '';
      if (info) {
        if (info.plans.length) dots += '<span class="cal-dot cal-dot-plan"></span>';
        if (info.works.length) dots += '<span class="cal-dot cal-dot-work"></span>';
      }
      return `<button class="${cls.join(' ')}" data-key="${k}">${c.d.getDate()}<span class="cal-day-dots">${dots}</span></button>`;
    }).join('');

    renderDayList(map);
  }

  function renderDayList(map) {
    if (!_selectedKey) {
      elDayTitle.hidden = true;
      elDayList.innerHTML = '';
      return;
    }
    const info = map.get(_selectedKey);
    elDayTitle.hidden = false;
    elDayTitle.textContent = `${_selectedKey} 的項目`;
    if (!info || (info.plans.length === 0 && info.works.length === 0)) {
      elDayList.innerHTML = '<div class="cal-day-empty">這天沒有任何計劃或作品</div>';
      return;
    }
    const planRows = info.plans.map(p => `
      <div class="cal-day-item" data-type="plan" data-id="${escapeAttr(p.id)}">
        <span class="cal-day-tag cal-day-tag-plan">計劃</span>
        <span class="cal-day-item-title">${escapeHtml(p.title || '(未命名)')}</span>
      </div>
    `).join('');
    const workRows = info.works.map(w => `
      <div class="cal-day-item" data-type="work" data-id="${escapeAttr(w.id)}">
        <span class="cal-day-tag cal-day-tag-work">作品</span>
        <span class="cal-day-item-title">${escapeHtml(w.title || '(未命名)')}</span>
      </div>
    `).join('');
    elDayList.innerHTML = planRows + workRows;
  }

  function onDayClick(e) {
    const btn = e.target.closest('.cal-day');
    if (!btn) return;
    _selectedKey = btn.dataset.key;
    render();
  }

  function onDayItemClick(e) {
    const item = e.target.closest('.cal-day-item');
    if (!item) return;
    const id = item.dataset.id;
    const type = item.dataset.type;
    close();
    setTimeout(() => {
      if (type === 'plan' && window.Plans && Plans.openDetail) Plans.openDetail(id);
      else if (type === 'work' && window.Works && Works.openDetail) Works.openDetail(id);
    }, 150);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  window.Calendar = { init, open, close };
})();
