/* =============================================================================
   plans.js — 美甲計劃(做之前)
   - DB store: plans
   - 一個計劃 = 標題 + 多張靈感參考圖 + 預計步驟 + 備註
   - 步驟結構與 works 相同(配方連結 + 自由文字 + 材料多選 + 備註)
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

  let elGrid, elEmpty, elAddBtn;
  let elEditModal, elEditTitleH, elEditClose, elEditCancel, elEditSave, elEditDelete;
  let elTitle, elNote, elInspGrid, elInspEmpty, elStepsList, elAddStepBtn;
  let elDetailModal, elDetailClose, elDetailBody, elDetailEdit;
  let elDetailStart, elDetailComplete, elDetailReopen;

  function $(id) { return document.getElementById(id); }

  async function init() {
    elGrid = $('plansGrid');
    elEmpty = $('plansEmpty');
    elAddBtn = $('plansAddBtn');

    elEditModal  = $('planEditModal');
    elEditTitleH = $('planEditTitleH');
    elEditClose  = $('planEditClose');
    elEditCancel = $('planEditCancel');
    elEditSave   = $('planEditSave');
    elEditDelete = $('planEditDelete');
    elTitle      = $('planTitle');
    elNote       = $('planNote');
    elInspGrid   = $('planInspGrid');
    elInspEmpty  = $('planInspEmpty');
    elStepsList  = $('planStepsList');
    elAddStepBtn = $('planAddStepBtn');

    elDetailModal = $('planDetailModal');
    elDetailClose = $('planDetailClose');
    elDetailBody  = $('planDetailBody');
    elDetailEdit  = $('planDetailEdit');
    elDetailStart    = $('planDetailStart');
    elDetailComplete = $('planDetailComplete');
    elDetailReopen   = $('planDetailReopen');

    _items = await MediaDB.getAll(STORE);
    _items.sort((a, b) => b.updatedAt - a.updatedAt);
    await reloadDeps();

    bindUI();
    renderGrid();
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
    elDetailStart    && elDetailStart   .addEventListener('click', onStartActive);
    elDetailComplete && elDetailComplete.addEventListener('click', onCompletePlan);
    elDetailReopen   && elDetailReopen  .addEventListener('click', onReopenPlan);

    elGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.lib-card');
      if (card && card.dataset.id) openDetailModal(card.dataset.id);
    });

    // 靈感選取
    elInspGrid.addEventListener('click', (e) => {
      const tile = e.target.closest('.plan-insp-tile');
      if (!tile || !_draft) return;
      const id = tile.dataset.id;
      const idx = _draft.inspirationIds.indexOf(id);
      if (idx >= 0) _draft.inspirationIds.splice(idx, 1);
      else _draft.inspirationIds.push(id);
      tile.classList.toggle('selected');
    });

    // 步驟事件委派
    elStepsList.addEventListener('click', onStepListClick);
    elStepsList.addEventListener('input', onStepListInput);
    elStepsList.addEventListener('change', onStepListChange);
  }

  /* ---------- Render grid ---------- */
  function renderGrid() {
    if (_items.length === 0) {
      elGrid.innerHTML = '';
      elEmpty.hidden = false;
      elEmpty.textContent = '還沒有任何計劃,點右上角「新增計劃」開始';
      return;
    }
    elEmpty.hidden = true;
    // 實行中排在最前
    const ordered = _items.slice().sort((a, b) => {
      const aActive = a.status === 'active' ? 1 : 0;
      const bActive = b.status === 'active' ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return b.updatedAt - a.updatedAt;
    });
    elGrid.innerHTML = ordered.map(it => {
      const firstInspId = (it.inspirationIds || [])[0];
      let coverUrl = '';
      if (firstInspId) {
        const insp = _galleryItems.find(g => g.id === firstInspId);
        if (insp && insp.thumbBlob) coverUrl = ImgUtils.urlFor(insp.thumbBlob);
      }
      const stepCount = (it.steps || []).length;
      const inspCount = (it.inspirationIds || []).length;
      const status = it.status || 'draft';
      const statusLabel = status === 'active' ? '實行中' : (status === 'completed' ? '已完成' : '草稿');
      const meta = [
        inspCount ? `${inspCount} 張靈感` : '',
        stepCount ? `${stepCount} 步驟` : '',
      ].filter(Boolean).join(' · ');
      return `
        <div class="lib-card" data-id="${it.id}">
          <div class="lib-thumb">${coverUrl ? `<img src="${coverUrl}" alt="" loading="lazy">` : '<div class="lib-thumb-empty">📋</div>'}</div>
          <div class="lib-info">
            <div class="lib-name">${escapeHtml(it.title || '(未命名)')}</div>
            <div class="lib-meta">
              <span class="plan-status plan-status-${status}">${statusLabel}</span>
              ${meta ? `<span class="plan-meta-rest"> · ${escapeHtml(meta)}</span>` : ''}
            </div>
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
      elEditTitleH.textContent = '編輯計劃';
      _draft = {
        title: it.title || '',
        note: it.note || '',
        inspirationIds: (it.inspirationIds || []).slice(),
        steps: (it.steps || []).map(s => ({ ...s })),
      };
      elEditDelete.hidden = false;
    } else {
      elEditTitleH.textContent = '新增計劃';
      _draft = { title: '', note: '', inspirationIds: [], steps: [] };
      elEditDelete.hidden = true;
    }

    elTitle.value = _draft.title;
    elNote.value = _draft.note;
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
      elInspEmpty.textContent = '靈感圖庫是空的,請先到「靈感」分頁新增';
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

  /* ---------- Steps editor (與 works 相同邏輯,但無步驟照片) ---------- */
  function addStep() {
    if (!_draft) return;
    _draft.steps.push({
      id: MediaDB.genId(),
      title: '',
      recipeId: '',
      recipeText: '',
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

  function stepHtml(s, i) {
    const recipeOpts = ['<option value="">— 不連結配方 —</option>']
      .concat(_recipes.map(r => `<option value="${escapeAttr(r.id)}"${r.id === s.recipeId ? ' selected' : ''}>${escapeHtml(r.name || r.targetHex)}</option>`))
      .join('');
    const matChips = _materials.map(m => {
      const active = (s.materialIds || []).includes(m.id) ? ' active' : '';
      return `<button type="button" class="chip chip-pick step-mat-chip${active}" data-mat="${escapeAttr(m.id)}" data-step="${i}">${escapeHtml(m.name || '?')}</button>`;
    }).join('');

    return `
      <div class="step-card" data-step="${i}">
        <div class="step-head">
          <span class="step-no">步驟 ${i + 1}</span>
          <div class="step-actions">
            ${i > 0 ? `<button type="button" class="step-icon-btn" data-act="up" title="上移">↑</button>` : ''}
            ${i < _draft.steps.length - 1 ? `<button type="button" class="step-icon-btn" data-act="down" title="下移">↓</button>` : ''}
            <button type="button" class="step-icon-btn step-del" data-act="del" title="刪除步驟">✕</button>
          </div>
        </div>
        <input type="text" class="input step-title" data-field="title" value="${escapeAttr(s.title || '')}" placeholder="步驟標題,例:底色、漸層暈染" maxlength="40">

        <div class="field" style="margin-top:10px;">
          <label class="field-label">調色配方(連結)</label>
          <select class="select" data-field="recipeId">${recipeOpts}</select>
        </div>
        <div class="field">
          <label class="field-label">調色邏輯/比例文字</label>
          <textarea class="input" rows="2" data-field="recipeText" placeholder="例:白 4 + 紅 1 + 一點黃" maxlength="200">${escapeHtml(s.recipeText || '')}</textarea>
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
    if (['title', 'recipeText', 'note'].includes(f)) {
      _draft.steps[i][f] = e.target.value;
    }
  }

  function onStepListChange(e) {
    if (!_draft) return;
    const card = e.target.closest('.step-card');
    if (!card) return;
    const i = +card.dataset.step;
    const f = e.target.dataset.field;
    if (f === 'recipeId') _draft.steps[i].recipeId = e.target.value;
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
    const stepsToSave = _draft.steps.map(s => ({
      id: s.id,
      title: (s.title || '').slice(0, 40),
      recipeId: s.recipeId || '',
      recipeText: (s.recipeText || '').slice(0, 200),
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

  /* ---------- Detail view ---------- */
  async function openDetailModal(id) {
    const it = _items.find(x => x.id === id);
    if (!it) return;
    await reloadDeps();
    elDetailModal.dataset.planId = id;

    const inspBlock = (it.inspirationIds || []).map(iid => {
      const g = _galleryItems.find(x => x.id === iid);
      if (!g) return '';
      const url = g.thumbBlob ? ImgUtils.urlFor(g.thumbBlob) : '';
      return `<div class="plan-d-insp">${url ? `<img src="${url}" alt="">` : ''}<span class="plan-d-insp-name">${escapeHtml(g.name || '')}</span></div>`;
    }).join('');

    const stepsHtml = (it.steps || []).map((s, i) => detailStepHtml(s, i)).join('');

    const status = it.status || 'draft';
    const statusLabel = status === 'active' ? '🔴 實行中' : (status === 'completed' ? '✅ 已完成' : '📝 草稿');
    const records = it.timeRecords || [];
    let recordsBlock = '';
    if (records.length) {
      const total = records.reduce((sum, r) => sum + (r.duration || 0), 0);
      const items = records.slice().reverse().map(r => {
        const d = formatDuration(r.duration || 0);
        const t = r.finishedAt ? new Date(r.finishedAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const laps = r.lapCount ? ` · ${r.lapCount} 次計次` : '';
        return `<div class="plan-d-time-row"><span class="plan-d-time-dur">${d}</span><span class="plan-d-time-when">${escapeHtml(t)}${laps}</span></div>`;
      }).join('');
      recordsBlock = `
        <h4 class="work-detail-section">時間記錄(${records.length} 次,共 ${formatDuration(total)})</h4>
        <div class="plan-d-times">${items}</div>
      `;
    }

    elDetailBody.innerHTML = `
      <div class="plan-d-status">${statusLabel}</div>
      <h3 class="work-detail-title">${escapeHtml(it.title || '(未命名)')}</h3>
      ${it.note ? `<div class="work-detail-note">${escapeHtml(it.note)}</div>` : ''}
      ${inspBlock ? `<h4 class="work-detail-section">參考靈感</h4><div class="plan-d-insps">${inspBlock}</div>` : ''}
      <h4 class="work-detail-section">預計步驟</h4>
      ${stepsHtml || '<div class="hint" style="padding:8px 0;">沒有規劃步驟</div>'}
      ${recordsBlock}
    `;

    // 控制底部按鈕顯隱
    elDetailStart.hidden    = status !== 'draft';
    elDetailComplete.hidden = status !== 'active';
    elDetailReopen.hidden   = status !== 'completed';

    elDetailModal.hidden = false;
  }

  async function onStartActive() {
    const id = elDetailModal.dataset.planId;
    if (!id) return;
    const it = _items.find(x => x.id === id);
    if (!it) return;
    // 若有其他實行中,先把它降為草稿
    const others = _items.filter(x => x.id !== id && x.status === 'active');
    for (const o of others) {
      o.status = 'draft';
      o.updatedAt = Date.now();
      await MediaDB.put(STORE, o);
    }
    it.status = 'active';
    it.startedAt = Date.now();
    it.updatedAt = Date.now();
    await MediaDB.put(STORE, it);
    closeDetailModal();
    renderGrid();
    if (window._showToast) window._showToast(`「${it.title}」已標記為實行中,開啟碼表開始計時`);
    else alert(`「${it.title}」已標記為實行中。\n開啟碼表開始計時,暫停後可選擇是否記錄時間到計劃。`);
  }

  async function onCompletePlan() {
    const id = elDetailModal.dataset.planId;
    if (!id) return;
    const it = _items.find(x => x.id === id);
    if (!it) return;
    if (!confirm('標記為已完成?之後仍可重新開啟。')) return;
    it.status = 'completed';
    it.completedAt = Date.now();
    it.updatedAt = Date.now();
    await MediaDB.put(STORE, it);
    closeDetailModal();
    renderGrid();
  }

  async function onReopenPlan() {
    const id = elDetailModal.dataset.planId;
    if (!id) return;
    const it = _items.find(x => x.id === id);
    if (!it) return;
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

  function detailStepHtml(s, i) {
    let recipeBlock = '';
    if (s.recipeId) {
      const r = _recipes.find(x => x.id === s.recipeId);
      if (r) {
        const parts = (r.parts || []).map(p => `${escapeHtml(p.name)} ${p.parts}`).join(' + ');
        recipeBlock = `
          <div class="step-d-recipe">
            <span class="step-d-swatch" style="background:${escapeAttr(r.targetHex || '#ccc')}"></span>
            <span><b>${escapeHtml(r.name || r.targetHex)}</b>${parts ? ` — ${escapeHtml(parts)}` : ''}</span>
          </div>
        `;
      }
    }
    if (s.recipeText) {
      recipeBlock += `<div class="step-d-recipe-text">${escapeHtml(s.recipeText)}</div>`;
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

  function closeDetailModal() { elDetailModal.hidden = true; }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  window.Plans = { init, getActive, recordTime };
})();
