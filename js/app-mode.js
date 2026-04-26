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

  function set(mode) {
    if (!VALID.includes(mode)) return;
    try { localStorage.setItem(KEY, mode); } catch (_) {}
    document.documentElement.setAttribute('data-app-mode', mode);
    renderButtons();
    notifyChange();
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
  }

  window.AppMode = { init, get, set, modeOf };
})();
