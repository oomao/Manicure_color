/* =============================================================================
   cat-manager.js — 共用「分類管理」modal
   open({ title, items, onAdd(name), onDelete(name), maxLen, onChange })
   ============================================================================= */
(function () {
  let elModal, elTitle, elList, elInput, elAdd, elDone, elClose, elHint, elBox;
  let _state = null;
  let _openedAt = 0;       // 防止 modal 剛開啟就被殘留 click 關掉
  let _busy = false;       // 防止雙擊 / 競態重複 push

  function ensure() {
    if (elModal) return;
    elModal = document.getElementById('catManagerModal');
    elTitle = document.getElementById('catMgrTitle');
    elList  = document.getElementById('catMgrList');
    elInput = document.getElementById('catMgrInput');
    elAdd   = document.getElementById('catMgrAdd');
    elDone  = document.getElementById('catMgrDone');
    elClose = document.getElementById('catMgrClose');
    elHint  = document.getElementById('catMgrHint');
    elBox   = elModal.querySelector('.modal');

    elClose.addEventListener('click', close);
    elDone.addEventListener('click', close);
    // 只有真正點到 overlay 背景、且不是剛開啟時的殘留 click,才關閉
    elModal.addEventListener('click', (e) => {
      if (Date.now() - _openedAt < 350) return;
      if (e.target === elModal) close();
    });
    // 點到 modal 內容(包含輸入框、按鈕)時阻止 bubbling,避免影響底下其他 modal
    elBox.addEventListener('click', (e) => e.stopPropagation());
    elBox.addEventListener('mousedown', (e) => e.stopPropagation());
    elBox.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

    elAdd.addEventListener('click', (e) => { e.stopPropagation(); onAddClick(); });
    elInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onAddClick(); } });
    elList.addEventListener('click', (e) => {
      const btn = e.target.closest('.cat-mgr-del');
      if (!btn) return;
      onDelClick(btn.dataset.name);
    });
  }

  function open(opts) {
    ensure();
    _state = Object.assign({ maxLen: 8 }, opts);
    _busy = false;
    elTitle.textContent = opts.title || '管理分類';
    elInput.value = '';
    elInput.maxLength = _state.maxLen;
    elInput.placeholder = `最多 ${_state.maxLen} 字`;
    elHint.textContent = '';
    renderList();
    elModal.hidden = false;
    _openedAt = Date.now();
    // 不再自動 focus — 在 iOS 上會跟剛剛的 click 事件競態,讓使用者自己點輸入框
  }

  function close() {
    if (!elModal) return;
    elModal.hidden = true;
    const cb = _state && _state.onChange;
    _state = null;
    _busy = false;
    if (typeof cb === 'function') {
      try { cb(); } catch (err) { console.warn('cat-manager onChange failed', err); }
    }
  }

  function renderList() {
    if (!_state) return;
    const items = _state.items || [];
    if (items.length === 0) {
      elList.innerHTML = '<div class="cat-mgr-empty">尚未有任何項目</div>';
      return;
    }
    elList.innerHTML = items.map(c => `
      <div class="cat-mgr-row">
        <span class="cat-mgr-name">${escapeHtml(c)}</span>
        <button class="cat-mgr-del" data-name="${escapeAttr(c)}" aria-label="刪除 ${escapeAttr(c)}">×</button>
      </div>
    `).join('');
  }

  function dedupeInPlace(arr) {
    const seen = new Set();
    const cleaned = arr.filter(v => {
      const k = (typeof v === 'string') ? v.trim() : v;
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (cleaned.length !== arr.length) {
      arr.length = 0;
      arr.push(...cleaned);
      return true;
    }
    return false;
  }

  async function onAddClick() {
    if (!_state || _busy) return;
    const name = (elInput.value || '').trim().slice(0, _state.maxLen);
    if (!name) return;
    if (_state.items.some(x => (typeof x === 'string' ? x.trim() : x) === name)) {
      elHint.textContent = '已存在此項目';
      return;
    }
    _busy = true;
    try {
      await _state.onAdd(name);
      // 防衛性 dedupe — caller 已 push,但若不小心重複也清掉
      dedupeInPlace(_state.items);
      elInput.value = '';
      elHint.textContent = '';
      renderList();
    } catch (err) {
      elHint.textContent = '新增失敗:' + (err.message || err);
    } finally {
      _busy = false;
    }
  }

  async function onDelClick(name) {
    if (!_state || _busy) return;
    const ok = confirm(`刪除「${name}」?\n已使用此分類的項目會自動歸到「未分類」。`);
    if (!ok) return;
    _busy = true;
    try {
      await _state.onDelete(name);
      dedupeInPlace(_state.items);
      renderList();
    } catch (err) {
      elHint.textContent = '刪除失敗:' + (err.message || err);
    } finally {
      _busy = false;
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  window.CatManager = { open, close };
})();
