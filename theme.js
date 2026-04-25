/* =============================================================================
   theme.js — 淺色 / 深色 / 自動 主題切換
   - 使用 <html data-theme="light|dark"> 控制
   - 自動模式不寫 data-theme,讓 CSS 的 prefers-color-scheme 接手
   - 持久化到 localStorage('theme')
   ============================================================================= */
(function () {
  const KEY = 'nail-mixer-theme';
  const root = document.documentElement;

  function getSaved() {
    return localStorage.getItem(KEY) || 'auto';
  }

  function apply(mode) {
    if (mode === 'light' || mode === 'dark') {
      root.setAttribute('data-theme', mode);
    } else {
      root.removeAttribute('data-theme');
    }
    // 同步 meta theme-color(影響 iOS 狀態列)
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) {
      const computed = getComputedStyle(root).getPropertyValue('--bg').trim();
      if (computed) m.setAttribute('content', computed);
    }
  }

  function set(mode) {
    if (!['auto', 'light', 'dark'].includes(mode)) mode = 'auto';
    if (mode === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
    apply(mode);
    if (typeof onChangeCb === 'function') onChangeCb(mode);
  }

  function get() { return getSaved(); }

  let onChangeCb = null;
  function onChange(cb) { onChangeCb = cb; }

  // 初始套用(在 DOMContentLoaded 之前就跑,避免閃爍)
  apply(getSaved());

  // 監聽系統主題變化(只在 auto 模式下重新套色 meta)
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener && mq.addEventListener('change', () => {
      if (getSaved() === 'auto') apply('auto');
    });
  }

  window.Theme = { get, set, onChange };
})();
