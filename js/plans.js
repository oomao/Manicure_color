/* =============================================================================
   plans.js — 美甲計劃(做之前)
   - DB store: plans
   - 一個計劃 = 標題 + 計劃日期 + 預計實行(選填) + 多張靈感 + 預計步驟 + 備註
   - 步驟 = 標題 + 多個調色配方 + 材料多選 + 備註
   - 狀態:active(實行中) / draft(未完成) / completed(已完成)
   ============================================================================= */
(function () {
  const STORE = 'plans';
  const SAVED_KEY = 'nail-color-mixer.saved.v1';

  let _items = [];
  let _materials = [];
  let _recipes = [];
  let _galleryItems = [];
  let _editingId = null;
  let _draft = null;
  let _searchTerm = '';
  let _dateFrom = '';
  let _dateTo = '';
  let _detailTimerRaf = null;

  let elGrid, elEmpty, elAddBtn, elSections;
  let elSearch, elDateFrom, elDateTo, elDateClear, elCalendarBtn;
  let elEditModal, elEditTitleH, elEditClose, elEditCancel, elEditSave, elEditDelete;
  let elTitle, elNote, elInspGrid, elInspEmpty, elStepsList, elAddStepBtn;
  let elPlanDate, elPlanScheduledDate;
  let elDetailModal, elDetailClose, elDetailBody, elDetailEdit, elDetailDelete;
  let elDetailStart, elDetailComplete, elDetailReopen, elDetailPause, elDetailResume;

  function $(id) { return document.getElementById(id); }

  async function init() {
    elGrid = $('plansGrid');
    elEmpty = $('plansEmpty');
    elAddBtn = $('plansAddBtn');
    elSections = $('plansSections');
    elSearch = $('plansSearch');
    elDateFrom = $('plansDateFrom');
    elDateTo = $('plansDateTo');
    elDateClear = $('plansDateClear');
    elCalendarBtn = $('plansCalendarBtn');

    elEditModal  = $('planEditModal');
    elEditTitleH = $('planEditTitleH');
    elEditClose  = $('planEditClose');
    elEditCancel = $('planEditCancel');
    elEditSave   = $('planEditSave');
    elEditDelete = $('planEditDelete');
    elTitle      = $('planTitle');
    elNote       = $('planNote');
    elPlanDate   = $('planDate');
    elPlanScheduledDate = $('planScheduledDate');
    elInspGrid   = $('planInspGrid');
    elInspEmpty  = $('planInspEmpty');
    elStepsList  = $('planStepsList');
    elAddStepBtn = $('planAddStepBtn');

    elDetailModal = $('planDetailModal');
    elDetailClose = $('planDetailClose');
    elDetailBody  = $('planDetailBody');
    elDetailEdit  = $('planDetailEdit');
    elDetailDelete = $('planDetailDelete');
    elDetailStart    = $('planDetailStart');
    elDetailComplete = $('planDetailComplete');
    elDetailReopen   = $('planDetailReopen');
    elDetailPause    = $('planDetailPause');
    elDetailResume   = $('planDetailResume');

    _items = await MediaDB.getAll(STORE);
    _items.sort((a, b) => b.updatedAt - a.updatedAt);
    await reloadDeps();

    bindUI();
    setupDatePlaceholders();
    renderGrid();
  }

  // iOS 在某些情況不顯示「年/月/日」placeholder,自製一個 overlay
  function setupDatePlaceholders() {
    [elDateFrom, elDateTo].forEach((input) => {
      if (!input || input.parentElement.classList.contains('date-wrap')) return;
      const wrap = document.createElement('span');
      wrap.className = 'date-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const ph = document.createElement('span');
      ph.className = 'date-ph';
      ph.textContent = '年/月/日';
      wrap.appendChild(ph);
      const sync = () => { ph.hidden = !!input.value; };
      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
      sync();
    });
  }

  async function reloadDeps() {
    try { _materials = await MediaDB.getAll('materials'); } catch (_) { _materials = []; }
    try { _galleryItems = await MediaDB.getAll('galleryImages'); _galleryItems.sort((a,b) => b.updatedAt - a.updatedAt); } catch (_) { _galleryItems = []; }
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      _recipes = raw ? (JSON.parse(raw) || []) : [];
    } catch (_) { _recipes = []; }
  }

  function bindUI() {
    elAddBtn.addEventListener('click', () => openEditModal(null));
    elEditClose.addEventListener('click', closeEditModal);
    elEditCancel.addEventListener('click', closeEditModal);
    elEditModal.addEventListener('click', (e) => { if (e.target === elEditModal) closeEditModal(); });
    elEditSave.addEventListener('click', onSave);
    elEditDelete.addEventListener('click', onDelete);
    elAddStepBtn.addEventListener('click', () => addStep());

    elDetailClose.addEventListener('click', closeDetailModal);
    elDetailModal.addEventListener('click', (e) => { if (e.target === elDetailModal) closeDetailModal(); });
    elDetailEdit.addEventListener('click', () => {
      const id = elDetailModal.dataset.planId;
      closeDetailModal();
      if (id) openEditModal(id);
    });
    elDetailDelete && elDetailDelete.addEventListener('click', onDeleteFromDetail);
    elDetailStart    && elDetailStart   .addEventListener('click', onStartActive);
    elDetailComplete && elDetailComplete.addEventListener('click', onCompletePlan);
    elDetailReopen   && elDetailReopen  .addEventListener('click', onReopenPlan);
    elDetailPause    && elDetailPause   .addEventListener('click', onPauseTimer);
    elDetailResume   && elDetailResume  .addEventListener('click', onResumeTimer);

    elSections.addEventListener('click', (e) => {
      const card = e.target.closest('.lib-card');
      if (card && card.dataset.id) openDetailModal(card.dataset.id);
    });

    if (elSearch) {
      elSearch.addEventListener('input', () => {
        _searchTerm = elSearch.value.trim().toLowerCase();
        renderGrid();
      });
    }
    const onDateChange = () => {
      _dateFrom = elDateFrom.value || '';
      _dateTo = elDateTo.value || '';
      renderGrid();
    };
    if (elDateFrom) elDateFrom.addEventListener('change', onDateChange);
    if (elDateTo)   elDateTo.addEventListener('change', onDateChange);
    if (elDateClear) elDateClear.addEventListener('click', () => {
      _dateFrom = ''; _dateTo = '';
      elDateFrom.value = ''; elDateTo.value = '';
      // 同步 placeholder
      [elDateFrom, elDateTo].forEach(i => {
        const ph = i && i.parentElement && i.parentElement.querySelector('.date-ph');
        if (ph) ph.hidden = false;
      });
      renderGrid();
    });

    if (elCalendarBtn) {
      elCalendarBtn.addEventListener('click', () => {
        if (window.Calendar && Calendar.open) Calendar.open();
      });
    }

    elInspGrid.addEventListener('click', (e) => {
      const tile = e.target.closest('.plan-insp-tile');
      if (!tile || !_draft) return;
      const id = tile.dataset.id;
      const idx = _draft.inspirationIds.indexOf(id);
      if (idx >= 0) _draft.inspirationIds.splice(idx, 1);
      else _draft.inspirationIds.push(id);
      tile.classList.toggle('selected');
    });

    elStepsList.addEventListener('click', onStepListClick);
    elStepsList.addEventListener('input', onStepListInput);
    elStepsList.addEventListener('change', onStepListChange);

    document.addEventListener('app-mode-change', () => renderGrid());
  }

  /* ---------- 資料 helper ---------- */
  // 取步驟的配方陣列(向下相容單一 recipeId/recipeText)
  function getRecipes(s) {
    if (Array.isArray(s.recipes) && s.recipes.length) return s.recipes;
    if (s.recipeId || s.recipeText) {
      return [{ recipeId: s.recipeId || '', recipeText: s.recipeText || '' }];
    }
    return [];
  }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function fmtDateOnly(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  }
  function dateInputToTs(s) {
    if (!s) return null;
    const t = new Date(s).getTime();
    return isNaN(t) ? null : t;
  }
  function tsToDateInput(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // 計算 active 計劃當下的累積經過時間
  function getElapsedMs(it) {
    if (!it || it.status !== 'active') return 0;
    const acc = it.accumulatedMs || 0;
    if (it.timerPaused) return acc;
    if (it.timerStartedAt) return acc + (Date.now() - it.timerStartedAt);
    return acc;
  }

  /* ---------- Render grid (3 區塊) ---------- */
  function passesFilter(it) {
    if (window.AppMode && AppMode.modeOf(it) !== AppMode.get()) return false;
    if (_searchTerm) {
      const hay = [
        it.title || '',
        it.note || '',
        ...(it.steps || []).map(s => s.title || ''),
      ].join(' ').toLowerCase();
      if (!hay.includes(_searchTerm)) return false;
    }
    if (_dateFrom || _dateTo) {
      const ts = it.scheduledDate || it.planDate || it.createdAt || 0;
      const fromTs = _dateFrom ? new Date(_dateFrom).getTime() : -Infinity;
      const toTs   = _dateTo   ? new Date(_dateTo).getTime() + 24*60*60*1000 - 1 : Infinity;
      if (ts < fromTs || ts > toTs) return false;
    }
    return true;
  }

  function renderGrid() {
    const filtered = _items.filter(passesFilter);
    if (_items.length === 0) {
      elSections.innerHTML = '';
      elEmpty.hidden = false;
      elEmpty.textContent = '還沒有任何計劃,點上方「新增」開始';
      return;
    }
    if (filtered.length === 0) {
      elSections.innerHTML = '';
      elEmpty.hidden = false;
      elEmpty.textContent = '沒有符合條件的計劃';
      return;
    }
    elEmpty.hidden = true;

    const groups = {
      active:    filtered.filter(it => it.status === 'active'),
      draft:     filtered.filter(it => (it.status || 'draft') === 'draft'),
      completed: filtered.filter(it => it.status === 'completed'),
    };
    groups.active   .sort((a,b) => (b.timerStartedAt||0) - (a.timerStartedAt||0));
    groups.draft    .sort((a,b) => (b.scheduledDate||b.updatedAt) - (a.scheduledDate||a.updatedAt));
    groups.completed.sort((a,b) => (b.completedAt||b.updatedAt) - (a.completedAt||a.updatedAt));

    const sections = [
      { key: 'active',    label: '正在進行中', cls: 'plans-section-active',  list: groups.active,    emptyText: '目前沒有正在進行的計劃' },
      { key: 'draft',     label: '未完成',     cls: 'plans-section-pending', list: groups.draft,     emptyText: '沒有待實行的計劃' },
      { key: 'completed', label: '已完成',     cls: 'plans-section-done',    list: groups.completed, emptyText: '尚未完成任何計劃' },
    ];

    elSections.innerHTML = sections.map(sec => {
      const cards = sec.list.map(it => cardHtml(it, sec.key)).join('');
      return `
        <div class="plans-section ${sec.cls}">
          <div class="plans-section-head">
            <span class="plans-section-dot"></span>${sec.label}
            <span class="plans-section-count">${sec.list.length}</span>
          </div>
          ${sec.list.length ? `<div class="lib-grid">${cards}</div>` : `<div class="plans-section-empty">${sec.emptyText}</div>`}
        </div>
      `;
    }).join('');
  }

  function cardHtml(it, sectionKey) {
    const firstInspId = (it.inspirationIds || [])[0];
    let coverUrl = '';
    if (firstInspId) {
      const insp = _galleryItems.find(g => g.id === firstInspId);
      if (insp && insp.thumbBlob) coverUrl = ImgUtils.urlFor(insp.thumbBlob);
    }
    const stepCount = (it.steps || []).length;
    const inspCount = (it.inspirationIds || []).length;
    const meta = [
      inspCount ? `${inspCount} 張靈感` : '',
      stepCount ? `${stepCount} 步驟` : '',
    ].filter(Boolean).join(' · ');

    let when = '';
    if (sectionKey === 'completed' && it.completedAt) {
      when = `✓ ${fmtDateOnly(it.completedAt)} 完成`;
    } else if (sectionKey === 'active') {
      when = `🔴 ${fmtDateOnly(it.timerStartedAt || it.startedAt)} 開始`;
    } else if (it.scheduledDate) {
      when = `📅 ${fmtDateOnly(it.scheduledDate)}`;
    } else if (it.planDate) {
      when = `📝 ${fmtDateOnly(it.planDate)}`;
    }

    return `
      <div class="lib-card" data-id="${it.id}">
        <div class="lib-thumb">${coverUrl ? `<img src="${coverUrl}" alt="" loading="lazy">` : '<div class="lib-thumb-empty">📋</div>'}</div>
        <div class="lib-info">
          <div class="lib-name">${escapeHtml(it.title || '(未命名)')}</div>
          ${when ? `<div class="plan-when">${escapeHtml(when)}</div>` : ''}
          ${meta ? `<div class="lib-meta">${escapeHtml(meta)}</div>` : ''}
        </div>
      </div>
    `;
  }

  /* ---------- Edit modal ---------- */
  async function openEditModal(id) {
    await reloadDeps();
    _editingId = id;

    if (id) {
      const it = _items.find(x => x.id === id);
      if (!it) return;
      elEditTitleH.textContent = '編輯計劃';
      _draft = {
        title: it.title || '',
        note: it.note || '',
        planDate: it.planDate || it.createdAt || Date.now(),
        scheduledDate: it.scheduledDate || null,
        inspirationIds: (it.inspirationIds || []).slice(),
        steps: (it.steps || []).map(s => ({
          id: s.id,
          title: s.title || '',
          recipes: getRecipes(s).map(r => ({ recipeId: r.recipeId || '', recipeText: r.recipeText || '' })),
          materialIds: Array.isArray(s.materialIds) ? s.materialIds.slice() : [],
          note: s.note || '',
        })),
      };
      elEditDelete.hidden = false;
    } else {
      elEditTitleH.textContent = '新增計劃';
      _draft = {
        title: '',
        note: '',
        planDate: Date.now(),
        scheduledDate: null,
        inspirationIds: [],
        steps: [],
      };
      elEditDelete.hidden = true;
    }

    elTitle.value = _draft.title;
    elNote.value = _draft.note;
    elPlanDate.value = tsToDateInput(_draft.planDate);
    elPlanScheduledDate.value = tsToDateInput(_draft.scheduledDate);
    renderInspirationPicker();
    renderStepsList();
    elEditModal.hidden = false;
  }

  function closeEditModal() {
    elEditModal.hidden = true;
    _editingId = null;
    _draft = null;
  }

  function renderInspirationPicker() {
    if (_galleryItems.length === 0) {
      elInspGrid.innerHTML = '';
      elInspEmpty.hidden = false;
      elInspEmpty.textContent = '靈感圖庫是空的,請先到「圖庫 → 靈感」新增';
      return;
    }
    elInspEmpty.hidden = true;
    elInspGrid.innerHTML = _galleryItems.map(g => {
      const url = g.thumbBlob ? ImgUtils.urlFor(g.thumbBlob) : '';
      const sel = _draft.inspirationIds.includes(g.id) ? ' selected' : '';
      return `
        <div class="plan-insp-tile${sel}" data-id="${escapeAttr(g.id)}" title="${escapeAttr(g.name || '')}">
          ${url ? `<img src="${url}" alt="" loading="lazy">` : '<div class="lib-thumb-empty">🖼️</div>'}
          <span class="plan-insp-check">✓</span>
        </div>
      `;
    }).join('');
  }

  /* ---------- Steps editor ---------- */
  function addStep() {
    if (!_draft) return;
    _draft.steps.push({
      id: MediaDB.genId(),
      title: '',
      recipes: [],
      materialIds: [],
      note: '',
    });
    renderStepsList();
  }

  function renderStepsList() {
    if (!_draft) return;
    if (_draft.steps.length === 0) {
      elStepsList.innerHTML = '<div class="hint" style="text-align:center; padding:12px;">尚未規劃步驟,點下方「+ 新增步驟」</div>';
      return;
    }
    elStepsList.innerHTML = _draft.steps.map((s, i) => stepHtml(s, i)).join('');
  }

  function recipeRowHtml(r, stepIdx, recipeIdx) {
    const recipeOpts = ['<option value="">— 不連結配方 —</option>']
      .concat(_recipes.map(rc => `<option value="${escapeAttr(rc.id)}"${rc.id === r.recipeId ? ' selected' : ''}>${escapeHtml(rc.name || rc.targetHex)}</option>`))
      .join('');
    return `
      <div class="step-recipe-item" data-recipe="${recipeIdx}">
        <div class="recipe-row-head">
          <span class="recipe-row-no">配方 ${recipeIdx + 1}</span>
          <button type="button" class="recipe-row-del" data-act="del-recipe" title="刪除這個配方">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
        <select class="select" data-field="recipeId">${recipeOpts}</select>
        <textarea class="input" rows="2" data-field="recipeText" placeholder="例:白 4 + 紅 1 + 一點黃" maxlength="200" style="margin-top:6px;">${escapeHtml(r.recipeText || '')}</textarea>
      </div>
    `;
  }

  function stepHtml(s, i) {
    const matChips = _materials.map(m => {
      const active = (s.materialIds || []).includes(m.id) ? ' active' : '';
      return `<button type="button" class="chip chip-pick step-mat-chip${active}" data-mat="${escapeAttr(m.id)}" data-step="${i}">${escapeHtml(m.name || '?')}</button>`;
    }).join('');
    const recipesHtml = (s.recipes || []).map((r, ri) => recipeRowHtml(r, i, ri)).join('');

    return `
      <div class="step-card" data-step="${i}">
        <div class="step-head">
          <span class="step-no">步驟 ${i + 1}</span>
          <div class="step-actions">
            ${i > 0 ? `<button type="button" class="step-icon-btn" data-act="up" title="上移">↑</button>` : ''}
            ${i < _draft.steps.length - 1 ? `<button type="button" class="step-icon-btn" data-act="down" title="下移">↓</button>` : ''}
            <button type="button" class="step-icon-btn step-del" data-act="del" title="刪除步驟">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        <input type="text" class="input step-title" data-field="title" value="${escapeAttr(s.title || '')}" placeholder="步驟標題,例:底色、漸層暈染" maxlength="40">

        <div class="field" style="margin-top:10px;">
          <label class="field-label">調色配方(可多個)</label>
          <div class="step-recipes-list">${recipesHtml}</div>
          <button type="button" class="btn btn-secondary step-add-recipe" data-act="add-recipe">+ 新增調色配方</button>
        </div>

        <div class="field">
          <label class="field-label">使用材料(可複選)</label>
          <div class="lib-chips lib-chips-pick step-mats">${matChips || '<span class="hint">材料庫還沒有項目</span>'}</div>
        </div>

        <div class="field" style="margin-bottom:0;">
          <label class="field-label">步驟備註</label>
          <input type="text" class="input" data-field="note" value="${escapeAttr(s.note || '')}" placeholder="例:預計固化 60 秒、用扁平筆" maxlength="200">
        </div>
      </div>
    `;
  }

  function onStepListClick(e) {
    if (!_draft) return;
    const card = e.target.closest('.step-card');
    if (!card) return;
    const i = +card.dataset.step;
    const actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      const act = actBtn.dataset.act;
      if (act === 'del') {
        if (confirm('確定刪除此步驟?')) {
          _draft.steps.splice(i, 1);
          renderStepsList();
        }
      } else if (act === 'up' && i > 0) {
        [_draft.steps[i-1], _draft.steps[i]] = [_draft.steps[i], _draft.steps[i-1]];
        renderStepsList();
      } else if (act === 'down' && i < _draft.steps.length - 1) {
        [_draft.steps[i], _draft.steps[i+1]] = [_draft.steps[i+1], _draft.steps[i]];
        renderStepsList();
      } else if (act === 'add-recipe') {
        _draft.steps[i].recipes = _draft.steps[i].recipes || [];
        _draft.steps[i].recipes.push({ recipeId: '', recipeText: '' });
        renderStepsList();
      } else if (act === 'del-recipe') {
        const rItem = e.target.closest('.step-recipe-item');
        if (rItem) {
          const ri = +rItem.dataset.recipe;
          _draft.steps[i].recipes.splice(ri, 1);
          renderStepsList();
        }
      }
      return;
    }
    const matChip = e.target.closest('.step-mat-chip');
    if (matChip) {
      const mid = matChip.dataset.mat;
      const step = _draft.steps[i];
      step.materialIds = step.materialIds || [];
      const idx = step.materialIds.indexOf(mid);
      if (idx >= 0) step.materialIds.splice(idx, 1);
      else step.materialIds.push(mid);
      matChip.classList.toggle('active');
    }
  }

  function onStepListInput(e) {
    if (!_draft) return;
    const card = e.target.closest('.step-card');
    if (!card) return;
    const i = +card.dataset.step;
    const f = e.target.dataset.field;
    if (!f) return;
    if (f === 'title' || f === 'note') {
      _draft.steps[i][f] = e.target.value;
    } else if (f === 'recipeText') {
      const rItem = e.target.closest('.step-recipe-item');
      if (rItem) {
        const ri = +rItem.dataset.recipe;
        _draft.steps[i].recipes[ri].recipeText = e.target.value;
      }
    }
  }

  function onStepListChange(e) {
    if (!_draft) return;
    const card = e.target.closest('.step-card');
    if (!card) return;
    const i = +card.dataset.step;
    const f = e.target.dataset.field;
    if (f === 'recipeId') {
      const rItem = e.target.closest('.step-recipe-item');
      if (rItem) {
        const ri = +rItem.dataset.recipe;
        _draft.steps[i].recipes[ri].recipeId = e.target.value;
      }
    }
  }

  /* ---------- Save / Delete ---------- */
  async function onSave() {
    if (!_draft) return;
    const title = (elTitle.value || '').trim().slice(0, 40);
    if (!title) {
      alert('請給計劃一個標題');
      return;
    }
    const noteVal = (elNote.value || '').trim().slice(0, 500);
    const planDate = dateInputToTs(elPlanDate.value) || Date.now();
    const scheduledDate = dateInputToTs(elPlanScheduledDate.value);

    const stepsToSave = _draft.steps.map(s => ({
      id: s.id,
      title: (s.title || '').slice(0, 40),
      recipes: (s.recipes || []).map(r => ({
        recipeId: r.recipeId || '',
        recipeText: (r.recipeText || '').slice(0, 200),
      })),
      // 維持向下相容 — 第一筆同步寫入舊欄位
      recipeId: (s.recipes && s.recipes[0]) ? (s.recipes[0].recipeId || '') : '',
      recipeText: (s.recipes && s.recipes[0]) ? (s.recipes[0].recipeText || '').slice(0, 200) : '',
      materialIds: Array.isArray(s.materialIds) ? s.materialIds.slice() : [],
      note: (s.note || '').slice(0, 200),
    }));
    const now = Date.now();

    try {
      if (_editingId) {
        const old = _items.find(x => x.id === _editingId);
        if (!old) return;
        const updated = {
          ...old,
          title,
          note: noteVal,
          planDate,
          scheduledDate,
          inspirationIds: _draft.inspirationIds.slice(),
          steps: stepsToSave,
          updatedAt: now,
        };
        await MediaDB.put(STORE, updated);
        Object.assign(old, updated);
      } else {
        const rec = {
          id: MediaDB.genId(),
          title,
          note: noteVal,
          planDate,
          scheduledDate,
          mode: (window.AppMode ? AppMode.get() : 'manicure'),
          inspirationIds: _draft.inspirationIds.slice(),
          steps: stepsToSave,
          status: 'draft',
          timeRecords: [],
          createdAt: now,
          updatedAt: now,
        };
        await MediaDB.add(STORE, rec);
        _items.unshift(rec);
      }
      _items.sort((a, b) => b.updatedAt - a.updatedAt);
      renderGrid();
      closeEditModal();
    } catch (err) {
      console.warn('save plan failed', err);
      alert('儲存失敗:' + (err.message || err));
    }
  }

  async function onDelete() {
    if (!_editingId) return;
    if (!confirm('確定刪除此計劃?無法復原。')) return;
    try {
      await MediaDB.del(STORE, _editingId);
      _items = _items.filter(x => x.id !== _editingId);
      renderGrid();
      closeEditModal();
    } catch (err) {
      alert('刪除失敗:' + (err.message || err));
    }
  }

  async function onDeleteFromDetail() {
    const id = elDetailModal.dataset.planId;
    if (!id) return;
    if (!confirm('確定刪除此計劃?無法復原。')) return;
    try {
      await MediaDB.del(STORE, id);
      _items = _items.filter(x => x.id !== id);
      renderGrid();
      closeDetailModal();
    } catch (err) {
      alert('刪除失敗:' + (err.message || err));
    }
  }

  /* ---------- Detail view ---------- */
  async function openDetailModal(id) {
    const it = _items.find(x => x.id === id);
    if (!it) return;
    await reloadDeps();
    elDetailModal.dataset.planId = id;
    renderDetailBody(it);
    elDetailModal.hidden = false;
    if (it.status === 'active') startDetailTimerLoop();
    bindEditableTimer();
  }

  function bindEditableTimer() {
    const tm = elDetailBody.querySelector('[data-plan-timer]');
    if (!tm || !tm.dataset.editable) return;
    tm.addEventListener('click', onEditTimerClick, { once: true });
  }

  async function onEditTimerClick() {
    const id = elDetailModal.dataset.planId;
    if (!id) return;
    const it = _items.find(x => x.id === id);
    if (!it || it.status !== 'active' || !it.timerPaused) return;
    const ms = it.accumulatedMs || 0;
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const current = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    const inp = prompt('輸入新的已實行時間 (HH:MM:SS):', current);
    if (inp == null) {
      // 取消後重新綁定 click,讓使用者下次仍可點擊編輯
      bindEditableTimer();
      return;
    }
    const parts = inp.trim().split(':').map(p => parseInt(p, 10));
    if (parts.length === 0 || parts.some(isNaN)) { alert('格式錯誤,請用 HH:MM:SS 或 MM:SS'); bindEditableTimer(); return; }
    let nh = 0, nm = 0, ns = 0;
    if (parts.length >= 3) { nh = parts[0]; nm = parts[1]; ns = parts[2]; }
    else if (parts.length === 2) { nm = parts[0]; ns = parts[1]; }
    else { ns = parts[0]; }
    if (nh < 0 || nm < 0 || ns < 0 || nm >= 60 || ns >= 60) { alert('時間超出範圍'); bindEditableTimer(); return; }
    const newMs = (nh * 3600 + nm * 60 + ns) * 1000;
    it.accumulatedMs = newMs;
    it.updatedAt = Date.now();
    await MediaDB.put(STORE, it);
    renderDetailBody(it);
  }

  function renderDetailBody(it) {
    const inspBlock = (it.inspirationIds || []).map(iid => {
      const g = _galleryItems.find(x => x.id === iid);
      if (!g) return '';
      const url = g.thumbBlob ? ImgUtils.urlFor(g.thumbBlob) : '';
      return `<div class="plan-d-insp">${url ? `<img src="${url}" alt="">` : ''}<span class="plan-d-insp-name">${escapeHtml(g.name || '')}</span></div>`;
    }).join('');

    const stepsHtml = (it.steps || []).map((s, i) => detailStepHtml(s, i)).join('');

    const status = it.status || 'draft';
    const statusLabel = status === 'active'
      ? '🔴 實行中'
      : (status === 'completed' ? '✅ 已完成' : '📝 未完成');

    // 時間 / 排程資訊
    const dateInfo = [];
    if (it.planDate)      dateInfo.push(`📝 計劃於 ${fmtDateOnly(it.planDate)}`);
    if (it.scheduledDate) dateInfo.push(`📅 預計 ${fmtDateOnly(it.scheduledDate)}`);
    if (it.completedAt)   dateInfo.push(`✓ ${fmtDateOnly(it.completedAt)} 完成`);
    const dateBlock = dateInfo.length ? `<div class="lib-meta" style="font-size:12px;margin-bottom:8px;">${dateInfo.join(' · ')}</div>` : '';

    // 計時 panel(僅 active 顯示)
    let timerBlock = '';
    if (status === 'active') {
      const isPaused = !!it.timerPaused;
      const ms = getElapsedMs(it);
      const t = fmtTimer(ms);
      const editable = isPaused ? ' is-editable' : '';
      const editHint = isPaused ? '<div class="plan-d-timer-edit-hint">點擊時間可調整</div>' : '';
      timerBlock = `
        <div class="plan-d-timer${editable}" data-plan-timer${isPaused ? ' data-editable="1"' : ''}>
          <div class="plan-d-timer-label">已實行時間</div>
          <div class="plan-d-timer-time" data-timer-display>${t.main}<span class="cs">.${t.cs}</span></div>
          <div class="plan-d-timer-state ${isPaused ? 'is-paused' : 'is-running'}" data-timer-state>${isPaused ? '已暫停' : '進行中'}</div>
          ${editHint}
        </div>
      `;
    }

    // 材料總結
    const matIds = new Set();
    (it.steps || []).forEach(s => (s.materialIds || []).forEach(mid => matIds.add(mid)));
    let matsBlock = '';
    if (matIds.size > 0) {
      const tags = Array.from(matIds).map(mid => {
        const m = _materials.find(x => x.id === mid);
        return m ? `<span class="plan-d-mat-tag">${escapeHtml(m.name || '?')}</span>` : '';
      }).filter(Boolean).join('');
      if (tags) {
        matsBlock = `<h4 class="work-detail-section">使用材料總覽</h4><div class="plan-d-mats-summary">${tags}</div>`;
      }
    }

    // 時間記錄
    const records = it.timeRecords || [];
    let recordsBlock = '';
    if (records.length) {
      const total = records.reduce((sum, r) => sum + (r.duration || 0), 0);
      const items = records.slice().reverse().map(r => {
        const d = formatDuration(r.duration || 0);
        const tt = r.finishedAt ? new Date(r.finishedAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="plan-d-time-row"><span class="plan-d-time-dur">${d}</span><span class="plan-d-time-when">${escapeHtml(tt)}</span></div>`;
      }).join('');
      recordsBlock = `
        <h4 class="work-detail-section">時間記錄(${records.length} 次,共 ${formatDuration(total)})</h4>
        <div class="plan-d-times">${items}</div>
      `;
    }

    elDetailBody.innerHTML = `
      <div class="plan-d-status">${statusLabel}</div>
      <h3 class="work-detail-title">${escapeHtml(it.title || '(未命名)')}</h3>
      ${dateBlock}
      ${timerBlock}
      ${it.note ? `<div class="work-detail-note">${escapeHtml(it.note)}</div>` : ''}
      ${inspBlock ? `<h4 class="work-detail-section">參考靈感</h4><div class="plan-d-insps">${inspBlock}</div>` : ''}
      <h4 class="work-detail-section">預計步驟</h4>
      ${stepsHtml || '<div class="hint" style="padding:8px 0;">沒有規劃步驟</div>'}
      ${matsBlock}
      ${recordsBlock}
    `;

    // 底部按鈕顯隱
    elDetailStart.hidden    = status !== 'draft';
    elDetailComplete.hidden = status !== 'active';
    elDetailReopen.hidden   = status !== 'completed';
    elDetailPause.hidden    = !(status === 'active' && !it.timerPaused);
    elDetailResume.hidden   = !(status === 'active' && it.timerPaused);
  }

  function fmtTimer(ms) {
    const total = Math.max(0, Math.floor(ms));
    const cs = Math.floor((total % 1000) / 10);
    const s  = Math.floor(total / 1000) % 60;
    const m  = Math.floor(total / 60000) % 60;
    const h  = Math.floor(total / 3600000);
    const main = h > 0
      ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return { main, cs: String(cs).padStart(2,'0') };
  }

  function startDetailTimerLoop() {
    stopDetailTimerLoop();
    const tick = () => {
      const id = elDetailModal.dataset.planId;
      const it = _items.find(x => x.id === id);
      if (!it || elDetailModal.hidden || it.status !== 'active') {
        stopDetailTimerLoop();
        return;
      }
      const display = elDetailBody.querySelector('[data-timer-display]');
      if (display) {
        const t = fmtTimer(getElapsedMs(it));
        display.innerHTML = `${t.main}<span class="cs">.${t.cs}</span>`;
      }
      _detailTimerRaf = requestAnimationFrame(tick);
    };
    _detailTimerRaf = requestAnimationFrame(tick);
  }
  function stopDetailTimerLoop() {
    if (_detailTimerRaf != null) {
      cancelAnimationFrame(_detailTimerRaf);
      _detailTimerRaf = null;
    }
  }

  async function onStartActive() {
    const id = elDetailModal.dataset.planId;
    if (!id) return;
    const it = _items.find(x => x.id === id);
    if (!it) return;
    // 若有其他實行中的,先暫停並降為草稿(保留累積時間 → 寫到 timeRecords)
    const others = _items.filter(x => x.id !== id && x.status === 'active');
    for (const o of others) {
      const ms = getElapsedMs(o);
      if (ms > 0) {
        o.timeRecords = o.timeRecords || [];
        o.timeRecords.push({ duration: ms, finishedAt: Date.now() });
      }
      o.status = 'draft';
      o.timerStartedAt = null;
      o.accumulatedMs = 0;
      o.timerPaused = false;
      o.updatedAt = Date.now();
      await MediaDB.put(STORE, o);
    }
    it.status = 'active';
    it.startedAt = it.startedAt || Date.now();
    it.timerStartedAt = Date.now();
    it.accumulatedMs = 0;
    it.timerPaused = false;
    it.updatedAt = Date.now();
    await MediaDB.put(STORE, it);
    renderDetailBody(it);
    renderGrid();
    startDetailTimerLoop();
  }

  async function onPauseTimer() {
    const id = elDetailModal.dataset.planId;
    if (!id) return;
    const it = _items.find(x => x.id === id);
    if (!it || it.status !== 'active' || it.timerPaused) return;
    it.accumulatedMs = (it.accumulatedMs || 0) + (Date.now() - (it.timerStartedAt || Date.now()));
    it.timerPaused = true;
    it.timerStartedAt = null;
    it.updatedAt = Date.now();
    await MediaDB.put(STORE, it);
    renderDetailBody(it);
    stopDetailTimerLoop();
  }

  async function onResumeTimer() {
    const id = elDetailModal.dataset.planId;
    if (!id) return;
    const it = _items.find(x => x.id === id);
    if (!it || it.status !== 'active' || !it.timerPaused) return;
    it.timerPaused = false;
    it.timerStartedAt = Date.now();
    it.updatedAt = Date.now();
    await MediaDB.put(STORE, it);
    renderDetailBody(it);
    startDetailTimerLoop();
  }

  async function onCompletePlan() {
    const id = elDetailModal.dataset.planId;
    if (!id) return;
    const it = _items.find(x => x.id === id);
    if (!it) return;
    if (!confirm('結束實行並標記為已完成?')) return;
    // 把這次計時收進 timeRecords
    const ms = getElapsedMs(it);
    if (ms > 0) {
      it.timeRecords = it.timeRecords || [];
      it.timeRecords.push({ duration: ms, finishedAt: Date.now() });
    }
    it.status = 'completed';
    it.completedAt = Date.now();
    it.timerStartedAt = null;
    it.accumulatedMs = 0;
    it.timerPaused = false;
    it.updatedAt = Date.now();
    await MediaDB.put(STORE, it);
    stopDetailTimerLoop();
    closeDetailModal();
    renderGrid();
  }

  async function onReopenPlan() {
    const id = elDetailModal.dataset.planId;
    if (!id) return;
    const it = _items.find(x => x.id === id);
    if (!it) return;
    if (!confirm('確定要重新開啟此計劃?\n會把它從「已完成」搬回「未完成」,但時間記錄會保留。')) return;
    it.status = 'draft';
    it.completedAt = null;
    it.updatedAt = Date.now();
    await MediaDB.put(STORE, it);
    closeDetailModal();
    renderGrid();
  }

  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  // 對外 API:碼表停止時呼叫
  async function getActive() {
    return _items.find(x => x.status === 'active') || null;
  }
  async function recordTime(planId, durationMs, lapCount) {
    const it = _items.find(x => x.id === planId);
    if (!it) return false;
    it.timeRecords = it.timeRecords || [];
    it.timeRecords.push({
      duration: durationMs,
      finishedAt: Date.now(),
      lapCount: lapCount || 0,
    });
    it.updatedAt = Date.now();
    await MediaDB.put(STORE, it);
    renderGrid();
    return true;
  }
  // 給 calendar 用
  function getAll() { return _items.slice(); }
  function openDetail(id) { openDetailModal(id); }

  function detailStepHtml(s, i) {
    const recipes = getRecipes(s);
    let recipeBlock = '';
    if (recipes.length) {
      recipeBlock = recipes.map(r => {
        let inner = '';
        if (r.recipeId) {
          const rc = _recipes.find(x => x.id === r.recipeId);
          if (rc) {
            const parts = (rc.parts || []).map(p => `${escapeHtml(p.name)} ${p.parts}`).join(' + ');
            inner = `
              <div class="step-d-recipe">
                <span class="step-d-swatch" style="background:${escapeAttr(rc.targetHex || '#ccc')}"></span>
                <span><b>${escapeHtml(rc.name || rc.targetHex)}</b>${parts ? ` — ${escapeHtml(parts)}` : ''}</span>
              </div>
            `;
          }
        }
        if (r.recipeText) inner += `<div class="step-d-recipe-text">${escapeHtml(r.recipeText)}</div>`;
        return inner;
      }).join('');
    }
    let matsBlock = '';
    if (s.materialIds && s.materialIds.length) {
      const names = s.materialIds.map(mid => {
        const m = _materials.find(x => x.id === mid);
        return m ? escapeHtml(m.name || '?') : '<span class="hint">(已刪除材料)</span>';
      });
      matsBlock = `<div class="step-d-mats"><b>使用材料:</b>${names.join('、')}</div>`;
    }
    return `
      <div class="step-d-card">
        <div class="step-d-head"><span class="step-no">步驟 ${i + 1}</span> ${escapeHtml(s.title || '')}</div>
        ${recipeBlock}
        ${matsBlock}
        ${s.note ? `<div class="step-d-note">${escapeHtml(s.note)}</div>` : ''}
      </div>
    `;
  }

  function closeDetailModal() {
    elDetailModal.hidden = true;
    stopDetailTimerLoop();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  window.Plans = { init, getActive, recordTime, getAll, openDetail };
})();
