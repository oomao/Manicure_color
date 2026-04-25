/* =============================================================================
   cat-manager.js — 共用「分類管理」modal
   open({ title, items, onAdd(name), onDelete(name), maxLen, onChange })
   ============================================================================= */
(function () {
  let elModal, elTitle, elList, elInput, elAdd, elDone, elClose, elHint;
  let _state = null;

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

    elClose.addEventListener('click', close);
    elDone.addEventListener('click', close);
    elModal.addEventListener('click', (e) => { if (e.target === elModal) close(); });
    elAdd.addEventListener('click', onAddClick);
    elInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') onAddClick(); });
    elList.addEventListener('click', (e) => {
      const btn = e.target.closest('.cat-mgr-del');
      if (!btn) return;
      onDelClick(btn.dataset.name);
    });
  }

  function open(opts) {
    ensure();
    _state = Object.assign({ maxLen: 8 }, opts);
    elTitle.textContent = opts.title || '管理分類';
    elInput.value = '';
    elInput.maxLength = _state.maxLen;
    elInput.placeholder = `最多 ${_state.maxLen} 字`;
    elHint.textContent = '';
    renderList();
    elModal.hidden = false;
    setTimeout(() => elInput.focus(), 50);
  }

  function close() {
    if (!elModal) return;
    elModal.hidden = true;
    if (_state && typeof _state.onChange === 'function') _state.onChange();
    _state = null;
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

  async function onAddClick() {
    if (!_state) return;
    const name = (elInput.value || '').trim().slice(0, _state.maxLen);
    if (!name) return;
    if (_state.items.includes(name)) {
      elHint.textContent = '已存在此項目';
      return;
    }
    try {
      await _state.onAdd(name);
      _state.items.push(name);
      elInput.value = '';
      elHint.textContent = '';
      renderList();
    } catch (err) {
      elHint.textContent = '新增失敗:' + (err.message || err);
    }
  }

  async function onDelClick(name) {
    if (!_state) return;
    const ok = confirm(`刪除「${name}」?\n已使用此分類的項目會自動歸到「未分類」。`);
    if (!ok) return;
    try {
      await _state.onDelete(name);
      _state.items = _state.items.filter(x => x !== name);
      renderList();
    } catch (err) {
      elHint.textContent = '刪除失敗:' + (err.message || err);
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
