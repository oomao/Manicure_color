/* =============================================================================
   gallery.js — 美甲靈感圖庫(色系 + 風格 雙軸分類)
   - DB store: galleryImages
   - colorFamily: 單選 / styles: 多選 tag
   ============================================================================= */
(function () {
  const STORE = 'galleryImages';
  const DEFAULT_COLORS_BY_MODE = {
    manicure: ['紅', '橘', '黃', '綠', '藍', '紫', '粉', '白', '黑', '金銀', '裸色'],
    beauty:   ['紅', '橘', '裸色', '粉', '紫', '棕', '黑', '咖啡', '酒紅', '珊瑚', '大地'],
  };
  const DEFAULT_STYLES_BY_MODE = {
    manicure: ['法式', '暈染', '貓眼', '鏡面', '磁鐵', '手繪', '光療', '簡約', '漸層'],
    beauty:   ['日系', '韓系', '歐美', '裸妝', '煙燻', '紅唇', '清透', '復古', '舞台'],
  };
  function colorKey() { return `gal-colors-${window.AppMode ? AppMode.get() : 'manicure'}`; }
  function styleKey() { return `gal-styles-${window.AppMode ? AppMode.get() : 'manicure'}`; }
  function defaultColors() {
    const m = window.AppMode ? AppMode.get() : 'manicure';
    return DEFAULT_COLORS_BY_MODE[m] || DEFAULT_COLORS_BY_MODE.manicure;
  }
  function defaultStyles() {
    const m = window.AppMode ? AppMode.get() : 'manicure';
    return DEFAULT_STYLES_BY_MODE[m] || DEFAULT_STYLES_BY_MODE.manicure;
  }

  let _items = [];
  let _colors = defaultColors().slice();
  let _styles = defaultStyles().slice();
  let _filterColor = 'all';
  let _filterStyle = 'all';
  let _editingId = null;
  let _stagedImg = null;
  let _selectedColors = new Set();
  let _selectedStyles = new Set();

  // 取得項目的色系陣列(支援舊資料 colorFamily 字串)
  function getColors(it) {
    if (Array.isArray(it.colorFamilies)) return it.colorFamilies;
    if (it.colorFamily) return [it.colorFamily];
    return [];
  }

  let elGrid, elEmpty, elChipsColor, elChipsStyle, elAddBtn;
  let elModal, elModalTitle, elModalClose, elModalCancel, elModalSave;
  let elFile, elPreview, elName, elNote, elDelete;
  let elColorPicker, elStylePicker, elNewStyleBtn, elManageColorBtn;

  function $(id) { return document.getElementById(id); }

  async function init() {
    elGrid = $('galGrid');
    elEmpty = $('galEmpty');
    elChipsColor = $('galChipsColor');
    elChipsStyle = $('galChipsStyle');
    elAddBtn = $('galAddBtn');

    elModal = $('galModal');
    elModalTitle = $('galModalTitle');
    elModalClose = $('galModalClose');
    elModalCancel = $('galModalCancel');
    elModalSave = $('galModalSave');
    elFile = $('galFile');
    elPreview = $('galPreview');
    elName = $('galName');
    elNote = $('galNote');
    elDelete = $('galDelete');
    elColorPicker = $('galColorPicker');
    elStylePicker = $('galStylePicker');
    elNewStyleBtn = $('galNewStyleBtn');
    elManageColorBtn = $('galManageColorBtn');

    _colors = await MediaDB.getCategoryDef(colorKey(), defaultColors());
    _styles = await MediaDB.getCategoryDef(styleKey(), defaultStyles());
    // 清掉先前 bug 造成的重複
    const dedupe = (arr) => {
      const seen = new Set();
      return arr.filter(x => seen.has(x) ? false : (seen.add(x), true));
    };
    const dc = dedupe(_colors);
    const ds = dedupe(_styles);
    if (dc.length !== _colors.length) { _colors = dc; await MediaDB.setCategoryDef(colorKey(), _colors); }
    if (ds.length !== _styles.length) { _styles = ds; await MediaDB.setCategoryDef(styleKey(), _styles); }
    _items = await MediaDB.getAll(STORE);
    _items.sort((a, b) => b.updatedAt - a.updatedAt);

    bindUI();
    renderFilterChips();
    renderGrid();
  }

  function bindUI() {
    elAddBtn.addEventListener('click', () => openModal(null));
    elModalClose.addEventListener('click', closeModal);
    elModalCancel.addEventListener('click', closeModal);
    elModal.addEventListener('click', (e) => { if (e.target === elModal) closeModal(); });
    elModalSave.addEventListener('click', onSave);
    elDelete.addEventListener('click', onDelete);
    elFile.addEventListener('change', onFileChange);
    elNewStyleBtn.addEventListener('click', openStyleManager);
    elManageColorBtn.addEventListener('click', openColorManager);
    elGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.lib-card');
      if (card && card.dataset.id) openModal(card.dataset.id);
    });
    document.addEventListener('app-mode-change', async () => {
      _colors = await MediaDB.getCategoryDef(colorKey(), defaultColors());
      _styles = await MediaDB.getCategoryDef(styleKey(), defaultStyles());
      _filterColor = 'all';
      _filterStyle = 'all';
      renderFilterChips();
      renderGrid();
    });
  }

  /* ---------- Render filter chips ---------- */
  function renderFilterChips() {
    const inMode = window.AppMode
      ? _items.filter(it => AppMode.modeOf(it) === AppMode.get())
      : _items;
    const colorOpts = ['all'].concat(_colors);
    const colorHtml = colorOpts.map(c => {
      const label = c === 'all' ? '全色系' : c;
      const count = c === 'all' ? inMode.length : inMode.filter(it => getColors(it).includes(c)).length;
      const active = c === _filterColor ? ' active' : '';
      return `<button class="chip${active}" data-color="${escapeHtml(c)}">${escapeHtml(label)} <span class="chip-n">${count}</span></button>`;
    }).join('');
    elChipsColor.innerHTML = colorHtml + `<button class="chip chip-manage" data-action="manage-color" aria-label="管理色系">✏️</button>`;
    elChipsColor.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'manage-color') { openColorManager(); return; }
        _filterColor = btn.dataset.color;
        renderFilterChips();
        renderGrid();
      });
    });

    const styleOpts = ['all'].concat(_styles);
    const styleHtml = styleOpts.map(s => {
      const label = s === 'all' ? '全風格' : s;
      const count = s === 'all' ? inMode.length : inMode.filter(it => Array.isArray(it.styles) && it.styles.includes(s)).length;
      const active = s === _filterStyle ? ' active' : '';
      return `<button class="chip${active}" data-style="${escapeHtml(s)}">${escapeHtml(label)} <span class="chip-n">${count}</span></button>`;
    }).join('');
    elChipsStyle.innerHTML = styleHtml + `<button class="chip chip-manage" data-action="manage-style" aria-label="管理風格">✏️</button>`;
    elChipsStyle.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'manage-style') { openStyleManager(); return; }
        _filterStyle = btn.dataset.style;
        renderFilterChips();
        renderGrid();
      });
    });
  }

  function openColorManager() {
    CatManager.open({
      title: '管理色系',
      items: _colors,
      maxLen: 6,
      onAdd: async (name) => {
        _colors.push(name);
        await MediaDB.setCategoryDef(colorKey(), _colors);
      },
      onDelete: async (name) => {
        { const idx = _colors.indexOf(name); if (idx >= 0) _colors.splice(idx, 1); }
        await MediaDB.setCategoryDef(colorKey(), _colors);
        const affected = _items.filter(it => getColors(it).includes(name));
        for (const it of affected) {
          if (Array.isArray(it.colorFamilies)) {
            it.colorFamilies = it.colorFamilies.filter(c => c !== name);
          } else if (it.colorFamily === name) {
            it.colorFamilies = [];
          }
          it.colorFamily = '';
          it.updatedAt = Date.now();
          await MediaDB.put(STORE, it);
        }
        _selectedColors.delete(name);
        if (_filterColor === name) _filterColor = 'all';
      },
      onChange: () => {
        renderFilterChips();
        renderGrid();
        if (!elModal.hidden) renderColorPicker();
      },
    });
  }

  function openStyleManager() {
    CatManager.open({
      title: '管理風格',
      items: _styles,
      maxLen: 8,
      onAdd: async (name) => {
        _styles.push(name);
        await MediaDB.setCategoryDef(styleKey(), _styles);
      },
      onDelete: async (name) => {
        { const idx = _styles.indexOf(name); if (idx >= 0) _styles.splice(idx, 1); }
        await MediaDB.setCategoryDef(styleKey(), _styles);
        const affected = _items.filter(it => Array.isArray(it.styles) && it.styles.includes(name));
        for (const it of affected) {
          it.styles = it.styles.filter(s => s !== name);
          it.updatedAt = Date.now();
          await MediaDB.put(STORE, it);
        }
        _selectedStyles.delete(name);
        if (_filterStyle === name) _filterStyle = 'all';
      },
      onChange: () => {
        renderFilterChips();
        renderGrid();
        if (!elModal.hidden) renderStylePicker();
      },
    });
  }

  function renderGrid() {
    let list = _items.slice();
    if (window.AppMode) {
      const m = AppMode.get();
      list = list.filter(it => AppMode.modeOf(it) === m);
    }
    if (_filterColor !== 'all') list = list.filter(it => getColors(it).includes(_filterColor));
    if (_filterStyle !== 'all') list = list.filter(it => Array.isArray(it.styles) && it.styles.includes(_filterStyle));
    if (list.length === 0) {
      elGrid.innerHTML = '';
      elEmpty.hidden = false;
      elEmpty.textContent = _items.length === 0
        ? '還沒有靈感圖,點右上角「新增」開始'
        : '沒有符合條件的靈感';
      return;
    }
    elEmpty.hidden = true;
    elGrid.innerHTML = list.map(it => {
      const url = ImgUtils.urlFor(it.thumbBlob);
      const tags = [...getColors(it), ...(it.styles || [])].filter(Boolean).slice(0, 3).join(' · ');
      return `
        <div class="lib-card" data-id="${it.id}">
          <div class="lib-thumb"><img src="${url}" alt="${escapeHtml(it.name || '')}" loading="lazy"></div>
          <div class="lib-info">
            <div class="lib-name">${escapeHtml(it.name || '(未命名)')}</div>
            <div class="lib-meta">${escapeHtml(tags)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ---------- Modal ---------- */
  function openModal(id) {
    _editingId = id;
    _stagedImg = null;
    _selectedColors = new Set();
    _selectedStyles = new Set();

    if (id) {
      const it = _items.find(x => x.id === id);
      if (!it) return;
      elModalTitle.textContent = '編輯靈感';
      elName.value = it.name || '';
      elNote.value = it.note || '';
      getColors(it).forEach(c => _selectedColors.add(c));
      (it.styles || []).forEach(s => _selectedStyles.add(s));
      const url = ImgUtils.urlFor(it.thumbBlob);
      elPreview.innerHTML = `<img src="${url}" alt="">`;
      elDelete.hidden = false;
    } else {
      elModalTitle.textContent = '新增靈感';
      elName.value = '';
      elNote.value = '';
      elPreview.innerHTML = '<div class="lib-preview-empty">點下方「選擇照片」</div>';
      elDelete.hidden = true;
    }
    elFile.value = '';
    renderColorPicker();
    renderStylePicker();
    elModal.hidden = false;
  }
  function closeModal() {
    elModal.hidden = true;
    _editingId = null;
    _stagedImg = null;
  }

  function renderColorPicker() {
    elColorPicker.innerHTML = _colors.map(c => {
      const active = _selectedColors.has(c) ? ' active' : '';
      return `<button type="button" class="chip chip-pick${active}" data-c="${escapeHtml(c)}">${escapeHtml(c)}</button>`;
    }).join('');
    elColorPicker.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.c;
        if (_selectedColors.has(v)) _selectedColors.delete(v);
        else _selectedColors.add(v);
        renderColorPicker();
      });
    });
  }
  function renderStylePicker() {
    elStylePicker.innerHTML = _styles.map(s => {
      const active = _selectedStyles.has(s) ? ' active' : '';
      return `<button type="button" class="chip chip-pick${active}" data-s="${escapeHtml(s)}">${escapeHtml(s)}</button>`;
    }).join('');
    elStylePicker.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.s;
        if (_selectedStyles.has(v)) _selectedStyles.delete(v);
        else _selectedStyles.add(v);
        renderStylePicker();
      });
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
    const name = (elName.value || '').trim().slice(0, 30);
    const note = (elNote.value || '').trim().slice(0, 200);
    const colorFamilies = Array.from(_selectedColors).slice(0, 8);
    const colorFamily = colorFamilies[0] || '';
    const styles = Array.from(_selectedStyles).slice(0, 12);
    const now = Date.now();
    try {
      if (_editingId) {
        const old = _items.find(x => x.id === _editingId);
        if (!old) return;
        const updated = { ...old, name, note, colorFamily, colorFamilies, styles, updatedAt: now };
        if (_stagedImg) {
          updated.blob = _stagedImg.fullBlob;
          updated.thumbBlob = _stagedImg.thumbBlob;
        }
        await MediaDB.put(STORE, updated);
        Object.assign(old, updated);
      } else {
        if (!_stagedImg) { alert('請選一張照片'); return; }
        const rec = {
          id: MediaDB.genId(),
          name, note, colorFamily, colorFamilies, styles,
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
      renderFilterChips();
      renderGrid();
      closeModal();
    } catch (err) {
      console.warn('save gallery failed', err);
      if (err && err.name === 'QuotaExceededError') {
        alert('儲存空間不足,請刪除部分項目後再試。');
      } else {
        alert('儲存失敗:' + (err.message || err));
      }
    }
  }

  async function onDelete() {
    if (!_editingId) return;
    if (!confirm('確定刪除這張靈感圖?無法復原。')) return;
    try {
      await MediaDB.del(STORE, _editingId);
      _items = _items.filter(x => x.id !== _editingId);
      renderFilterChips();
      renderGrid();
      closeModal();
    } catch (err) {
      alert('刪除失敗:' + (err.message || err));
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  window.Gallery = { init };
})();
