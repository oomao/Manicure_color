/* =============================================================================
   app-mode.js — 美甲 / 美妝 模式切換
   - 模式存在 localStorage
   - 材料(materials)與靈感(galleryImages)會依當前模式過濾
   - 配方 / 計劃 / 作品 共用,不依模式過濾
   - 切換時通知各模組重新渲染
   ============================================================================= */
(function () {
  const KEY = 'app-mode';
  const DEFAULT = 'manicure';
  const VALID = ['manicure', 'beauty'];

  function get() {
    try {
      const v = localStorage.getItem(KEY);
      return VALID.includes(v) ? v : DEFAULT;
    } catch (_) { return DEFAULT; }
  }

  const META = {
    manicure: { emoji: '💅', name: '美甲模式', libTitle: '美甲圖庫' },
    beauty:   { emoji: '💄', name: '美妝模式', libTitle: '美妝圖庫' },
  };

  function set(mode) {
    if (!VALID.includes(mode)) return;
    const before = get();
    try { localStorage.setItem(KEY, mode); } catch (_) {}
    document.documentElement.setAttribute('data-app-mode', mode);
    renderButtons();
    syncUI();
    notifyChange();
    if (before !== mode) {
      handleHiddenViewRedirect(mode);
      showToast(`已切換到 ${META[mode].emoji} ${META[mode].name}`);
    }
  }

  // 美妝模式不顯示 調色 / 配方 / 作品。若使用者切到美妝時當下停留在這些頁面,
  // 自動把畫面導去仍可用的位置(圖庫 或 紀錄→計劃)。
  function handleHiddenViewRedirect(mode) {
    if (mode !== 'beauty') return;
    const mixOpen = !document.getElementById('view-mix')?.hidden;
    if (mixOpen && typeof window.switchView === 'function') {
      window.switchView('library');
      return;
    }
    const recordOpen = !document.getElementById('view-record')?.hidden;
    if (recordOpen) {
      const activeRec = document.querySelector('.record-segmented .tabs-btn.active');
      const activeRecKey = activeRec && activeRec.dataset.rectab;
      if (activeRecKey === 'recipes' || activeRecKey === 'works') {
        const plansBtn = document.querySelector('.record-segmented .tabs-btn[data-rectab="plans"]');
        if (plansBtn) plansBtn.click();
      }
    }
  }

  function syncUI() {
    const meta = META[get()] || META.manicure;
    const stripe = document.getElementById('libModeStripe');
    if (stripe) {
      const e = stripe.querySelector('.lib-mode-emoji');
      const n = stripe.querySelector('.lib-mode-name');
      if (e) e.textContent = meta.emoji;
      if (n) n.textContent = meta.name;
    }
    const libTitle = document.getElementById('libTitle');
    if (libTitle) libTitle.textContent = meta.libTitle;
  }

  function showToast(msg) {
    let t = document.getElementById('appModeToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'appModeToast';
      t.className = 'save-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(showToast._tid);
    showToast._tid = setTimeout(() => { t.style.opacity = '0'; }, 1600);
  }

  function notifyChange() {
    const ev = new CustomEvent('app-mode-change', { detail: { mode: get() } });
    document.dispatchEvent(ev);
  }

  function renderButtons() {
    const cur = get();
    document.querySelectorAll('button[data-app-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.appMode === cur);
    });
  }

  // 取得項目所屬模式(向下相容沒有 mode 欄位的舊資料 → 視為 manicure)
  function modeOf(item) {
    if (!item) return DEFAULT;
    return VALID.includes(item.mode) ? item.mode : DEFAULT;
  }

  function init() {
    document.documentElement.setAttribute('data-app-mode', get());
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-app-mode]');
      if (!btn) return;
      set(btn.dataset.appMode);
    });
    renderButtons();
    syncUI();
    // 初始載入若在美妝模式且預設停在 mix view,等下一個 tick 等 switchView 設好,再導去圖庫
    if (get() === 'beauty') {
      setTimeout(() => {
        if (typeof window.switchView === 'function') {
          if (!document.getElementById('view-mix')?.hidden) window.switchView('library');
        }
      }, 0);
    }
  }

  window.AppMode = { init, get, set, modeOf };
})();
