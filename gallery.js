/* =============================================================================
   gallery.js — 美甲靈感圖庫(色系 + 風格 雙軸分類)
   - DB store: galleryImages
   - colorFamily: 單選 / styles: 多選 tag
   ============================================================================= */
(function () {
  const STORE = 'galleryImages';
  const COLOR_KEY = 'gal-colors';
  const STYLE_KEY = 'gal-styles';
  const DEFAULT_COLORS = ['紅', '橘', '黃', '綠', '藍', '紫', '粉', '白', '黑', '金銀', '裸色'];
  const DEFAULT_STYLES = ['法式', '暈染', '貓眼', '鏡面', '磁鐵', '手繪', '光療', '簡約', '漸層'];

  let _items = [];
  let _colors = DEFAULT_COLORS.slice();
  let _styles = DEFAULT_STYLES.slice();
  let _filterColor = 'all';
  let _filterStyle = 'all';
  let _editingId = null;
  let _stagedImg = null;
  let _selectedColor = null;
  let _selectedStyles = new Set();

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

    _colors = await MediaDB.getCategoryDef(COLOR_KEY, DEFAULT_COLORS);
    _styles = await MediaDB.getCategoryDef(STYLE_KEY, DEFAULT_STYLES);
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
  }

  /* ---------- Render filter chips ---------- */
  function renderFilterChips() {
    const colorOpts = ['all'].concat(_colors);
    const colorHtml = colorOpts.map(c => {
      const label = c === 'all' ? '全色系' : c;
      const count = c === 'all' ? _items.length : _items.filter(it => it.colorFamily === c).length;
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
      const count = s === 'all' ? _items.length : _items.filter(it => Array.isArray(it.styles) && it.styles.includes(s)).length;
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
        await MediaDB.setCategoryDef(COLOR_KEY, _colors);
      },
      onDelete: async (name) => {
        _colors = _colors.filter(c => c !== name);
        await MediaDB.setCategoryDef(COLOR_KEY, _colors);
        const affected = _items.filter(it => it.colorFamily === name);
        for (const it of affected) {
          it.colorFamily = '';
          it.updatedAt = Date.now();
          await MediaDB.put(STORE, it);
        }
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
        await MediaDB.setCategoryDef(STYLE_KEY, _styles);
      },
      onDelete: async (name) => {
        _styles = _styles.filter(s => s !== name);
        await MediaDB.setCategoryDef(STYLE_KEY, _styles);
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
    if (_filterColor !== 'all') list = list.filter(it => it.colorFamily === _filterColor);
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
      const tags = [it.colorFamily, ...(it.styles || [])].filter(Boolean).slice(0, 3).join(' · ');
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
    _selectedColor = null;
    _selectedStyles = new Set();

    if (id) {
      const it = _items.find(x => x.id === id);
      if (!it) return;
      elModalTitle.textContent = '編輯靈感';
      elName.value = it.name || '';
      elNote.value = it.note || '';
      _selectedColor = it.colorFamily || null;
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
      const active = c === _selectedColor ? ' active' : '';
      return `<button type="button" class="chip chip-pick${active}" data-c="${escapeHtml(c)}">${escapeHtml(c)}</button>`;
    }).join('');
    elColorPicker.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        _selectedColor = (_selectedColor === btn.dataset.c) ? null : btn.dataset.c;
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
    const colorFamily = _selectedColor || '';
    const styles = Array.from(_selectedStyles).slice(0, 12);
    const now = Date.now();
    try {
      if (_editingId) {
        const old = _items.find(x => x.id === _editingId);
        if (!old) return;
        const updated = { ...old, name, note, colorFamily, styles, updatedAt: now };
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
          name, note, colorFamily, styles,
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
