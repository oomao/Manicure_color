/* =============================================================================
   inspire-picker.js — 從靈感圖庫挑一張到調色 canvas
   open(onPick(blob))
   ============================================================================= */
(function () {
  let elModal, elGrid, elEmpty, elClose;
  let _onPick = null;

  function ensure() {
    if (elModal) return;
    elModal = document.getElementById('inspirePickerModal');
    elGrid  = document.getElementById('inspirePickerGrid');
    elEmpty = document.getElementById('inspirePickerEmpty');
    elClose = document.getElementById('inspirePickerClose');

    elClose.addEventListener('click', close);
    elModal.addEventListener('click', (e) => { if (e.target === elModal) close(); });
    elGrid.addEventListener('click', async (e) => {
      const card = e.target.closest('.lib-card');
      if (!card || !card.dataset.id) return;
      try {
        const rec = await MediaDB.get('galleryImages', card.dataset.id);
        if (rec && rec.blob && _onPick) {
          _onPick(rec.blob);
          close();
        }
      } catch (err) {
        alert('讀取圖片失敗:' + (err.message || err));
      }
    });
  }

  async function open(onPick) {
    ensure();
    _onPick = onPick;
    try {
      await MediaDB.init();
      const items = await MediaDB.getAll('galleryImages');
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      if (items.length === 0) {
        elGrid.innerHTML = '';
        elEmpty.hidden = false;
      } else {
        elEmpty.hidden = true;
        elGrid.innerHTML = items.map(it => {
          const url = ImgUtils.urlFor(it.thumbBlob);
          const tags = [it.colorFamily, ...(it.styles || [])].filter(Boolean).slice(0, 2).join(' · ');
          return `
            <div class="lib-card" data-id="${it.id}">
              <div class="lib-thumb"><img src="${url}" alt="" loading="lazy"></div>
              <div class="lib-info">
                <div class="lib-name">${escapeHtml(it.name || '(未命名)')}</div>
                <div class="lib-meta">${escapeHtml(tags)}</div>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      console.warn('inspire picker open failed', err);
      elGrid.innerHTML = '';
      elEmpty.hidden = false;
      elEmpty.textContent = '無法讀取圖庫:' + (err.message || err);
    }
    elModal.hidden = false;
  }

  function close() {
    if (!elModal) return;
    elModal.hidden = true;
    _onPick = null;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  window.InspirePicker = { open, close };
})();
