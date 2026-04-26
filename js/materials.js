/* =============================================================================
   materials.js — 材料庫(凝膠 / 亮粉 / 飾品 …)
   - DB store: materials
   - 自訂分類,可 CRUD,可依分類篩選
   ============================================================================= */
(function () {
  const STORE = 'materials';
  const CATS_KEY = 'mat-categories';
  const DEFAULT_CATS = ['凝膠', '亮粉', '飾品', '貼紙', '筆刷', '其他'];

  let _items = [];
  let _categories = DEFAULT_CATS.slice();
  let _filterCat = 'all';
  let _searchTerm = '';
  let _editingId = null;
  let _stagedImg = null; // { fullBlob, thumbBlob }

  /* ---------- DOM refs(在 init 時抓) ---------- */
  let elGrid, elEmpty, elChips, elSearch, elAddBtn;
  let elModal, elModalTitle, elModalClose, elModalCancel, elModalSave;
  let elFileInput, elPreview, elNameInput, elCatSelect, elNewCatBtn, elNoteInput, elDeleteBtn;

  function $(id) { return document.getElementById(id); }

  async function init() {
    elGrid = $('matGrid');
    elEmpty = $('matEmpty');
    elChips = $('matChips');
    elSearch = $('matSearch');
    elAddBtn = $('matAddBtn');

    elModal = $('matModal');
    elModalTitle = $('matModalTitle');
    elModalClose = $('matModalClose');
    elModalCancel = $('matModalCancel');
    elModalSave = $('matModalSave');
    elFileInput = $('matFile');
    elPreview = $('matPreview');
    elNameInput = $('matName');
    elCatSelect = $('matCat');
    elNewCatBtn = $('matNewCatBtn');
    elNoteInput = $('matNote');
    elDeleteBtn = $('matDelete');

    _categories = await MediaDB.getCategoryDef(CATS_KEY, DEFAULT_CATS);
    // 清掉先前 bug 造成的重複
    const seen = new Set();
    const deduped = _categories.filter(c => seen.has(c) ? false : (seen.add(c), true));
    if (deduped.length !== _categories.length) {
      _categories = deduped;
      await MediaDB.setCategoryDef(CATS_KEY, _categories);
    }
    _items = await MediaDB.getAll(STORE);
    _items.sort((a, b) => b.updatedAt - a.updatedAt);

    bindUI();
    renderChips();
    renderGrid();
  }

  function bindUI() {
    elAddBtn.addEventListener('click', () => openModal(null));
    elModalClose.addEventListener('click', closeModal);
    elModalCancel.addEventListener('click', closeModal);
    elModal.addEventListener('click', (e) => { if (e.target === elModal) closeModal(); });
    elModalSave.addEventListener('click', onSave);
    elDeleteBtn.addEventListener('click', onDelete);
    elFileInput.addEventListener('change', onFileChange);
    elNewCatBtn.addEventListener('click', onAddCategory);
    elSearch.addEventListener('input', () => {
      _searchTerm = elSearch.value.trim().toLowerCase();
      renderGrid();
    });
    elGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.lib-card');
      if (!card) return;
      const id = card.dataset.id;
      if (id) openModal(id);
    });
    document.addEventListener('app-mode-change', () => {
      renderChips();
      renderGrid();
    });
  }

  /* ---------- Render ---------- */
  function renderChips() {
    const all = ['all'].concat(_categories);
    const inMode = window.AppMode
      ? _items.filter(it => AppMode.modeOf(it) === AppMode.get())
      : _items;
    const chipsHtml = all.map(c => {
      const label = c === 'all' ? '全部' : c;
      const count = c === 'all' ? inMode.length : inMode.filter(it => it.category === c).length;
      const active = c === _filterCat ? ' active' : '';
      return `<button class="chip${active}" data-cat="${escapeHtml(c)}">${escapeHtml(label)} <span class="chip-n">${count}</span></button>`;
    }).join('');
    elChips.innerHTML = chipsHtml + `<button class="chip chip-manage" data-action="manage" aria-label="管理分類">✏️</button>`;
    elChips.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'manage') {
          openCategoryManager();
          return;
        }
        _filterCat = btn.dataset.cat;
        renderChips();
        renderGrid();
      });
    });
  }

  function openCategoryManager() {
    CatManager.open({
      title: '管理材料分類',
      items: _categories,
      maxLen: 8,
      onAdd: async (name) => {
        _categories.push(name);
        await MediaDB.setCategoryDef(CATS_KEY, _categories);
      },
      onDelete: async (name) => {
        { const idx = _categories.indexOf(name); if (idx >= 0) _categories.splice(idx, 1); }
        await MediaDB.setCategoryDef(CATS_KEY, _categories);
        const affected = _items.filter(it => it.category === name);
        for (const it of affected) {
          it.category = '未分類';
          it.updatedAt = Date.now();
          await MediaDB.put(STORE, it);
        }
        if (_filterCat === name) _filterCat = 'all';
      },
      onChange: () => {
        renderChips();
        renderGrid();
      },
    });
  }

  function renderGrid() {
    let list = _items.slice();
    // 依照當前 app mode 過濾
    if (window.AppMode) {
      const m = AppMode.get();
      list = list.filter(it => AppMode.modeOf(it) === m);
    }
    if (_filterCat !== 'all') list = list.filter(it => it.category === _filterCat);
    if (_searchTerm) {
      list = list.filter(it =>
        (it.name || '').toLowerCase().includes(_searchTerm) ||
        (it.note || '').toLowerCase().includes(_searchTerm)
      );
    }
    if (list.length === 0) {
      elGrid.innerHTML = '';
      elEmpty.hidden = false;
      elEmpty.textContent = _items.length === 0
        ? '還沒有任何材料,點右上角「新增」開始'
        : '沒有符合條件的材料';
      return;
    }
    elEmpty.hidden = true;
    elGrid.innerHTML = list.map(it => {
      const url = ImgUtils.urlFor(it.thumbBlob);
      return `
        <div class="lib-card" data-id="${it.id}">
          <div class="lib-thumb"><img src="${url}" alt="${escapeHtml(it.name || '')}" loading="lazy"></div>
          <div class="lib-info">
            <div class="lib-name">${escapeHtml(it.name || '(未命名)')}</div>
            <div class="lib-meta">${escapeHtml(it.category || '其他')}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ---------- Modal ---------- */
  function openModal(id) {
    _editingId = id;
    _stagedImg = null;
    if (id) {
      const it = _items.find(x => x.id === id);
      if (!it) return;
      elModalTitle.textContent = '編輯材料';
      elNameInput.value = it.name || '';
      elNoteInput.value = it.note || '';
      fillCategorySelect(it.category);
      const url = ImgUtils.urlFor(it.thumbBlob);
      elPreview.innerHTML = `<img src="${url}" alt="">`;
      elDeleteBtn.hidden = false;
    } else {
      elModalTitle.textContent = '新增材料';
      elNameInput.value = '';
      elNoteInput.value = '';
      fillCategorySelect();
      elPreview.innerHTML = '<div class="lib-preview-empty">點下方「選擇照片」</div>';
      elDeleteBtn.hidden = true;
    }
    elFileInput.value = '';
    elModal.hidden = false;
  }
  function closeModal() {
    elModal.hidden = true;
    _editingId = null;
    _stagedImg = null;
  }

  function fillCategorySelect(selected) {
    elCatSelect.innerHTML = _categories
      .map(c => `<option value="${escapeHtml(c)}"${c === selected ? ' selected' : ''}>${escapeHtml(c)}</option>`)
      .join('');
    if (selected && !_categories.includes(selected)) {
      const opt = document.createElement('option');
      opt.value = selected; opt.textContent = selected; opt.selected = true;
      elCatSelect.appendChild(opt);
    }
  }

  function onAddCategory() {
    const currentSelected = elCatSelect.value;
    CatManager.open({
      title: '管理材料分類',
      items: _categories,
      maxLen: 8,
      onAdd: async (name) => {
        _categories.push(name);
        await MediaDB.setCategoryDef(CATS_KEY, _categories);
      },
      onDelete: async (name) => {
        { const idx = _categories.indexOf(name); if (idx >= 0) _categories.splice(idx, 1); }
        await MediaDB.setCategoryDef(CATS_KEY, _categories);
        const affected = _items.filter(it => it.category === name);
        for (const it of affected) {
          it.category = '未分類';
          it.updatedAt = Date.now();
          await MediaDB.put(STORE, it);
        }
      },
      onChange: () => {
        fillCategorySelect(currentSelected);
        renderChips();
        renderGrid();
      },
    });
  }

  async function onFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    elPreview.innerHTML = '<div class="lib-preview-empty">處理中...</div>';
    try {
      const r = await ImgUtils.processFile(file);
      _stagedImg = { fullBlob: r.fullBlob, thumbBlob: r.thumbBlob };
      const url = URL.createObjectURL(r.thumbBlob);
      elPreview.innerHTML = `<img src="${url}" alt="">`;
    } catch (err) {
      console.warn('process file failed', err);
      elPreview.innerHTML = '<div class="lib-preview-empty">圖片處理失敗</div>';
      _stagedImg = null;
    }
  }

  async function onSave() {
    const name = (elNameInput.value || '').trim().slice(0, 30);
    const category = elCatSelect.value || '其他';
    const note = (elNoteInput.value || '').trim().slice(0, 200);
    if (!name && !_stagedImg && !_editingId) {
      alert('請至少給個名稱或選張照片');
      return;
    }
    const now = Date.now();
    try {
      if (_editingId) {
        const old = _items.find(x => x.id === _editingId);
        if (!old) return;
        const updated = {
          ...old,
          name, category, note,
          updatedAt: now,
        };
        if (_stagedImg) {
          updated.blob = _stagedImg.fullBlob;
          updated.thumbBlob = _stagedImg.thumbBlob;
        }
        await MediaDB.put(STORE, updated);
        Object.assign(old, updated);
      } else {
        if (!_stagedImg) {
          alert('請選一張照片');
          return;
        }
        const rec = {
          id: MediaDB.genId(),
          name, category, note,
          mode: (window.AppMode ? AppMode.get() : 'manicure'),
          blob: _stagedImg.fullBlob,
          thumbBlob: _stagedImg.thumbBlob,
          createdAt: now,
          updatedAt: now,
        };
        await MediaDB.add(STORE, rec);
        _items.unshift(rec);
      }
      _items.sort((a, b) => b.updatedAt - a.updatedAt);
      renderChips();
      renderGrid();
      closeModal();
    } catch (err) {
      console.warn('save material failed', err);
      if (err && err.name === 'QuotaExceededError') {
        alert('儲存空間不足,請刪除部分項目後再試。');
      } else {
        alert('儲存失敗:' + (err.message || err));
      }
    }
  }

  async function onDelete() {
    if (!_editingId) return;
    if (!confirm('確定刪除這筆材料?無法復原。')) return;
    try {
      await MediaDB.del(STORE, _editingId);
      _items = _items.filter(x => x.id !== _editingId);
      renderChips();
      renderGrid();
      closeModal();
    } catch (err) {
      alert('刪除失敗:' + (err.message || err));
    }
  }

  /* ---------- helpers ---------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  window.Materials = { init };
})();
