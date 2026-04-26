/* =============================================================================
   works.js — 美甲作品紀錄
   - DB store: works
   - 每個作品 = 封面 + 標題 + 日期 + (可連結計劃) + 步驟陣列
   - 每個步驟 = 標題 + 照片 + 多個調色配方 + 材料 + 備註
   ============================================================================= */
(function () {
  const STORE = 'works';
  const SAVED_KEY = 'nail-color-mixer.saved.v1';

  let _items = [];
  let _materials = [];
  let _recipes = [];
  let _plans = [];
  let _editingId = null;
  let _draft = null;
  let _searchTerm = '';
  let _dateFrom = '';
  let _dateTo = '';

  let elGrid, elEmpty, elAddBtn;
  let elSearch, elDateFrom, elDateTo, elDateClear, elCalendarBtn;
  let elEditModal, elEditTitle, elEditClose, elEditCancel, elEditSave, elEditDelete;
  let elCoverFile, elCoverPreview, elTitle, elDate, elPlanId, elNote, elStepsList, elAddStepBtn;
  let elDetailModal, elDetailClose, elDetailBody, elDetailEdit;

  function $(id) { return document.getElementById(id); }

  async function init() {
    elGrid = $('worksGrid');
    elEmpty = $('worksEmpty');
    elAddBtn = $('worksAddBtn');
    elSearch = $('worksSearch');
    elDateFrom = $('worksDateFrom');
    elDateTo = $('worksDateTo');
    elDateClear = $('worksDateClear');
    elCalendarBtn = $('worksCalendarBtn');

    elEditModal  = $('workEditModal');
    elEditTitle  = $('workEditTitleH');
    elEditClose  = $('workEditClose');
    elEditCancel = $('workEditCancel');
    elEditSave   = $('workEditSave');
    elEditDelete = $('workEditDelete');
    elCoverFile  = $('workCoverFile');
    elCoverPreview = $('workCoverPreview');
    elTitle      = $('workTitle');
    elDate       = $('workDate');
    elPlanId     = $('workPlanId');
    elNote       = $('workNote');
    elStepsList  = $('workStepsList');
    elAddStepBtn = $('workAddStepBtn');

    elDetailModal = $('workDetailModal');
    elDetailClose = $('workDetailClose');
    elDetailBody  = $('workDetailBody');
    elDetailEdit  = $('workDetailEdit');

    _items = await MediaDB.getAll(STORE);
    _items.sort((a, b) => b.updatedAt - a.updatedAt);
    await reloadDeps();

    bindUI();
    setupDatePlaceholders();
    renderGrid();
  }

  function setupDatePlaceholders() {
    [elDateFrom, elDateTo].forEach((input) => {
      if (!input || input.parentElement.classList.contains('date-wrap')) return;
      const wrap = document.createElement('div');
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
    try { _plans = await MediaDB.getAll('plans'); _plans.sort((a,b) => b.updatedAt - a.updatedAt); } catch (_) { _plans = []; }
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
    elCoverFile.addEventListener('change', onCoverFileChange);
    elAddStepBtn.addEventListener('click', () => addStep());

    elDetailClose.addEventListener('click', closeDetailModal);
    elDetailModal.addEventListener('click', (e) => { if (e.target === elDetailModal) closeDetailModal(); });
    elDetailEdit.addEventListener('click', () => {
      const id = elDetailModal.dataset.workId;
      closeDetailModal();
      if (id) openEditModal(id);
    });

    elGrid.addEventListener('click', (e) => {
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

    elStepsList.addEventListener('click', onStepListClick);
    elStepsList.addEventListener('input', onStepListInput);
    elStepsList.addEventListener('change', onStepListChange);
  }

  /* ---------- 資料 helper ---------- */
  function getRecipes(s) {
    if (Array.isArray(s.recipes) && s.recipes.length) return s.recipes;
    if (s.recipeId || s.recipeText) {
      return [{ recipeId: s.recipeId || '', recipeText: s.recipeText || '' }];
    }
    return [];
  }

  /* ---------- Render grid ---------- */
  function renderGrid() {
    let list = _items.slice();
    if (_searchTerm) {
      list = list.filter(it => {
        const hay = [
          it.title || '',
          it.note || '',
          ...(it.steps || []).map(s => s.title || ''),
        ].join(' ').toLowerCase();
        return hay.includes(_searchTerm);
      });
    }
    if (_dateFrom || _dateTo) {
      const fromTs = _dateFrom ? new Date(_dateFrom).getTime() : -Infinity;
      const toTs   = _dateTo   ? new Date(_dateTo).getTime() + 24*60*60*1000 - 1 : Infinity;
      list = list.filter(it => {
        const t = it.date || it.createdAt || 0;
        return t >= fromTs && t <= toTs;
      });
    }

    if (_items.length === 0) {
      elGrid.innerHTML = '';
      elEmpty.hidden = false;
      elEmpty.textContent = '還沒有任何作品紀錄,點上方「新增」開始記錄';
      return;
    }
    if (list.length === 0) {
      elGrid.innerHTML = '';
      elEmpty.hidden = false;
      elEmpty.textContent = '沒有符合條件的作品';
      return;
    }
    elEmpty.hidden = true;
    elGrid.innerHTML = list.map(it => {
      const url = it.coverThumbBlob ? ImgUtils.urlFor(it.coverThumbBlob) : '';
      const dateStr = it.date ? formatDate(it.date) : '';
      const stepCount = (it.steps || []).length;
      return `
        <div class="lib-card" data-id="${it.id}">
          <div class="lib-thumb">${url ? `<img src="${url}" alt="" loading="lazy">` : '<div class="lib-thumb-empty">📷</div>'}</div>
          <div class="lib-info">
            <div class="lib-name">${escapeHtml(it.title || '(未命名)')}</div>
            <div class="lib-meta">${escapeHtml(dateStr)}${stepCount ? ` · ${stepCount} 步驟` : ''}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ---------- Edit modal ---------- */
  async function openEditModal(id) {
    await reloadDeps();
    _editingId = id;

    if (id) {
      const it = _items.find(x => x.id === id);
      if (!it) return;
      elEditTitle.textContent = '編輯作品';
      _draft = JSON.parse(JSON.stringify({
        title: it.title || '',
        date: it.date || Date.now(),
        planId: it.planId || '',
        note: it.note || '',
        steps: (it.steps || []).map(s => ({
          id: s.id,
          title: s.title || '',
          recipes: getRecipes(s).map(r => ({ recipeId: r.recipeId || '', recipeText: r.recipeText || '' })),
          materialIds: Array.isArray(s.materialIds) ? s.materialIds.slice() : [],
          note: s.note || '',
        })),
      }));
      _draft._coverBlob = it.coverBlob || null;
      _draft._coverThumbBlob = it.coverThumbBlob || null;
      _draft.steps.forEach((s, i) => {
        s._photoBlob = (it.steps[i] && it.steps[i].photoBlob) || null;
        s._photoThumbBlob = (it.steps[i] && it.steps[i].photoThumbBlob) || null;
      });
      elEditDelete.hidden = false;
    } else {
      elEditTitle.textContent = '新增作品';
      // 預設帶入目前 active 計劃(若有)
      let prefillPlanId = '';
      const active = _plans.find(p => p.status === 'active');
      if (active) prefillPlanId = active.id;
      _draft = {
        title: active ? active.title : '',
        date: Date.now(),
        planId: prefillPlanId,
        note: '',
        steps: [],
        _coverBlob: null,
        _coverThumbBlob: null,
      };
      elEditDelete.hidden = true;
    }

    elTitle.value = _draft.title;
    elDate.value = toDateInput(_draft.date);
    elNote.value = _draft.note;
    fillPlanSelect(_draft.planId);
    elCoverFile.value = '';
    renderCoverPreview();
    renderStepsList();
    elEditModal.hidden = false;
  }

  function fillPlanSelect(selectedId) {
    if (!elPlanId) return;
    const opts = ['<option value="">— 不連結計劃 —</option>'];
    _plans.forEach(p => {
      const stat = p.status === 'active' ? '🔴' : (p.status === 'completed' ? '✅' : '📝');
      const sel = p.id === selectedId ? ' selected' : '';
      opts.push(`<option value="${escapeAttr(p.id)}"${sel}>${stat} ${escapeHtml(p.title || '(未命名)')}</option>`);
    });
    elPlanId.innerHTML = opts.join('');
  }

  function closeEditModal() {
    elEditModal.hidden = true;
    _editingId = null;
    _draft = null;
  }

  function renderCoverPreview() {
    const blob = _draft._coverThumbBlob || _draft._coverBlob;
    if (blob) {
      const url = URL.createObjectURL(blob);
      elCoverPreview.innerHTML = `<img src="${url}" alt="">`;
    } else {
      elCoverPreview.innerHTML = '<div class="lib-preview-empty">點下方「選擇封面照」</div>';
    }
  }

  async function onCoverFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    elCoverPreview.innerHTML = '<div class="lib-preview-empty">處理中...</div>';
    try {
      const r = await ImgUtils.processFile(file);
      _draft._coverBlob = r.fullBlob;
      _draft._coverThumbBlob = r.thumbBlob;
      renderCoverPreview();
    } catch (err) {
      console.warn(err);
      elCoverPreview.innerHTML = '<div class="lib-preview-empty">圖片處理失敗</div>';
    }
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
      _photoBlob: null,
      _photoThumbBlob: null,
    });
    renderStepsList();
  }

  function renderStepsList() {
    if (!_draft) return;
    if (_draft.steps.length === 0) {
      elStepsList.innerHTML = '<div class="hint" style="text-align:center; padding:12px;">尚未加入步驟,點下方「+ 新增步驟」</div>';
      return;
    }
    elStepsList.innerHTML = _draft.steps.map((s, i) => stepHtml(s, i)).join('');
  }

  function recipeRowHtml(r, recipeIdx) {
    const recipeOpts = ['<option value="">— 不連結配方 —</option>']
      .concat(_recipes.map(rc => `<option value="${escapeAttr(rc.id)}"${rc.id === r.recipeId ? ' selected' : ''}>${escapeHtml(rc.name || rc.targetHex)}</option>`))
      .join('');
    return `
      <div class="step-recipe-item" data-recipe="${recipeIdx}">
        <div class="recipe-row-head">
          <span class="recipe-row-no">配方 ${recipeIdx + 1}</span>
          <button type="button" class="recipe-row-del" data-act="del-recipe" title="刪除此配方">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
        <select class="select" data-field="recipeId">${recipeOpts}</select>
        <textarea class="input" rows="2" data-field="recipeText" placeholder="例:白 4 + 紅 1 + 一點黃" maxlength="200" style="margin-top:6px;">${escapeHtml(r.recipeText || '')}</textarea>
      </div>
    `;
  }

  function stepHtml(s, i) {
    const photoBlob = s._photoThumbBlob || s._photoBlob;
    const photoUrl = photoBlob ? URL.createObjectURL(photoBlob) : '';
    const matChips = _materials.map(m => {
      const active = (s.materialIds || []).includes(m.id) ? ' active' : '';
      return `<button type="button" class="chip chip-pick step-mat-chip${active}" data-mat="${escapeAttr(m.id)}" data-step="${i}">${escapeHtml(m.name || '?')}</button>`;
    }).join('');
    const recipesHtml = (s.recipes || []).map((r, ri) => recipeRowHtml(r, ri)).join('');

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

        <div class="step-photo">
          ${photoUrl ? `<img src="${photoUrl}" alt="">` : '<div class="step-photo-empty">無步驟照片</div>'}
        </div>
        <label class="btn btn-secondary btn-block step-photo-btn" style="margin-top:6px;">
          <input type="file" accept="image/*" data-field="photo" style="display:none;">
          ${photoUrl ? '更換步驟照片' : '+ 加步驟照片(選填)'}
        </label>

        <div class="field" style="margin-top:10px;">
          <label class="field-label">調色配方(可多個)</label>
          <div class="step-recipes-list">${recipesHtml}</div>
          <button type="button" class="btn btn-secondary step-add-recipe" data-act="add-recipe">+ 新增調色配方</button>
        </div>

        <div class="field">
          <label class="field-label">使用材料(可複選)</label>
          <div class="lib-chips lib-chips-pick step-mats">${matChips || '<span class="hint">材料庫還沒有項目,先去「材料」分頁新增</span>'}</div>
        </div>

        <div class="field" style="margin-bottom:0;">
          <label class="field-label">步驟備註</label>
          <input type="text" class="input" data-field="note" value="${escapeAttr(s.note || '')}" placeholder="例:固化 60 秒、用扁平筆" maxlength="200">
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
      } else if (act === 'up') {
        if (i > 0) {
          [_draft.steps[i-1], _draft.steps[i]] = [_draft.steps[i], _draft.steps[i-1]];
          renderStepsList();
        }
      } else if (act === 'down') {
        if (i < _draft.steps.length - 1) {
          [_draft.steps[i], _draft.steps[i+1]] = [_draft.steps[i+1], _draft.steps[i]];
          renderStepsList();
        }
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

  async function onStepListChange(e) {
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
    } else if (f === 'photo') {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const r = await ImgUtils.processFile(file);
        _draft.steps[i]._photoBlob = r.fullBlob;
        _draft.steps[i]._photoThumbBlob = r.thumbBlob;
        renderStepsList();
      } catch (err) {
        alert('圖片處理失敗');
      }
    }
  }

  /* ---------- Save / Delete ---------- */
  async function onSave() {
    if (!_draft) return;
    const title = (elTitle.value || '').trim().slice(0, 40);
    if (!title && _draft.steps.length === 0 && !_draft._coverBlob) {
      alert('至少給作品一個標題');
      return;
    }
    const dateVal = elDate.value ? new Date(elDate.value).getTime() : Date.now();
    const noteVal = (elNote.value || '').trim().slice(0, 500);
    const planId = elPlanId ? (elPlanId.value || '') : '';
    const now = Date.now();

    const stepsToSave = _draft.steps.map(s => {
      const recs = (s.recipes || []).map(r => ({
        recipeId: r.recipeId || '',
        recipeText: (r.recipeText || '').slice(0, 200),
      }));
      return {
        id: s.id,
        title: (s.title || '').slice(0, 40),
        recipes: recs,
        recipeId: recs[0] ? recs[0].recipeId : '',
        recipeText: recs[0] ? recs[0].recipeText : '',
        materialIds: Array.isArray(s.materialIds) ? s.materialIds.slice() : [],
        note: (s.note || '').slice(0, 200),
        photoBlob: s._photoBlob || null,
        photoThumbBlob: s._photoThumbBlob || null,
      };
    });

    try {
      if (_editingId) {
        const old = _items.find(x => x.id === _editingId);
        if (!old) return;
        const updated = {
          ...old,
          title,
          date: dateVal,
          planId,
          note: noteVal,
          steps: stepsToSave,
          coverBlob: _draft._coverBlob || old.coverBlob || null,
          coverThumbBlob: _draft._coverThumbBlob || old.coverThumbBlob || null,
          updatedAt: now,
        };
        await MediaDB.put(STORE, updated);
        Object.assign(old, updated);
      } else {
        const rec = {
          id: MediaDB.genId(),
          title,
          date: dateVal,
          planId,
          note: noteVal,
          steps: stepsToSave,
          coverBlob: _draft._coverBlob || null,
          coverThumbBlob: _draft._coverThumbBlob || null,
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
      console.warn('save work failed', err);
      if (err && err.name === 'QuotaExceededError') {
        alert('儲存空間不足,請刪除部分項目後再試。');
      } else {
        alert('儲存失敗:' + (err.message || err));
      }
    }
  }

  async function onDelete() {
    if (!_editingId) return;
    if (!confirm('確定刪除此作品紀錄?無法復原。')) return;
    try {
      await MediaDB.del(STORE, _editingId);
      _items = _items.filter(x => x.id !== _editingId);
      renderGrid();
      closeEditModal();
    } catch (err) {
      alert('刪除失敗:' + (err.message || err));
    }
  }

  /* ---------- Detail view ---------- */
  async function openDetailModal(id) {
    const it = _items.find(x => x.id === id);
    if (!it) return;
    await reloadDeps();
    elDetailModal.dataset.workId = id;

    const coverUrl = it.coverBlob ? URL.createObjectURL(it.coverBlob) : (it.coverThumbBlob ? URL.createObjectURL(it.coverThumbBlob) : '');
    const dateStr = it.date ? formatDate(it.date) : '';
    const stepsHtml = (it.steps || []).map((s, i) => detailStepHtml(s, i)).join('');

    let planBlock = '';
    if (it.planId) {
      const p = _plans.find(x => x.id === it.planId);
      if (p) {
        planBlock = `<div class="lib-meta" style="font-size:12px;margin-bottom:8px;">📋 對應計劃:${escapeHtml(p.title || '(未命名)')}</div>`;
      }
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
        matsBlock = `<h4 class="work-detail-section">使用材料總覽</h4><div class="work-d-mats-summary">${tags}</div>`;
      }
    }

    elDetailBody.innerHTML = `
      <div class="work-detail-cover">${coverUrl ? `<img src="${coverUrl}" alt="">` : '<div class="lib-preview-empty">沒有封面照</div>'}</div>
      <h3 class="work-detail-title">${escapeHtml(it.title || '(未命名)')}</h3>
      <div class="work-detail-date">${escapeHtml(dateStr)}</div>
      ${planBlock}
      ${it.note ? `<div class="work-detail-note">${escapeHtml(it.note)}</div>` : ''}
      <h4 class="work-detail-section">步驟</h4>
      ${stepsHtml || '<div class="hint" style="padding:8px 0;">沒有記錄步驟</div>'}
      ${matsBlock}
    `;
    elDetailModal.hidden = false;
  }

  function detailStepHtml(s, i) {
    const photoBlob = s.photoBlob || s.photoThumbBlob;
    const photoUrl = photoBlob ? URL.createObjectURL(photoBlob) : '';
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
        ${photoUrl ? `<div class="step-d-photo"><img src="${photoUrl}" alt=""></div>` : ''}
        ${recipeBlock}
        ${matsBlock}
        ${s.note ? `<div class="step-d-note">${escapeHtml(s.note)}</div>` : ''}
      </div>
    `;
  }

  function closeDetailModal() {
    elDetailModal.hidden = true;
  }

  /* ---------- helpers ---------- */
  function formatDate(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function toDateInput(ts) {
    return formatDate(ts);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // 對外:給 calendar 用
  function getAll() { return _items.slice(); }
  function openDetail(id) { openDetailModal(id); }

  window.Works = { init, getAll, openDetail };
})();
