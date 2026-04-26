/* =============================================================================
   美甲調色 APP — 核心邏輯
   - 演算法：Mixbox (SIGGRAPH 2021) + CIEDE2000
   - 動態 N 基底色（最多 8）
   - localStorage 持久化
   ============================================================================= */

const STORAGE_KEY        = 'nail-color-mixer.bases.v1';
const MAX_BASES          = 8;
const MIN_BASES_OK       = 3;
const MAX_PARTS_PER_COLOR = 6;
const MAX_TOTAL_PARTS    = 10;

const DEFAULT_BASES = [
  { id: 'd-yellow', name: '黃', sub: 'infin.Lin 096M',  hex: '#E5B23C', tintStrength: 1.0, source: 'default', note: '' },
  { id: 'd-red',    name: '紅', sub: 'infin.Lin Red',   hex: '#C81E28', tintStrength: 1.0, source: 'default', note: '' },
  { id: 'd-blue',   name: '藍', sub: 'infin.Lin 156M',  hex: '#3E8ED0', tintStrength: 1.0, source: 'default', note: '' },
  { id: 'd-white',  name: '白', sub: 'infin.Lin White', hex: '#EDECE7', tintStrength: 1.0, source: 'default', note: '' },
  { id: 'd-black',  name: '黑', sub: 'infin.Lin Black', hex: '#0F0F0F', tintStrength: 3.0, source: 'default', note: '' },
];

let BASES = [];

/* ========== Storage ========== */
function loadBases() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_BASES));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('empty');
    return parsed.map(b => ({
      id: b.id || genId(),
      name: b.name || '?',
      sub: b.sub || '',
      hex: isValidHex(b.hex) ? normalizeHex(b.hex) : '#888888',
      tintStrength: typeof b.tintStrength === 'number' && b.tintStrength > 0 ? b.tintStrength : 1.0,
      source: b.source || 'default',
      note: b.note || '',
    }));
  } catch (err) {
    console.warn('localStorage load failed; using defaults', err);
    return JSON.parse(JSON.stringify(DEFAULT_BASES));
  }
}
function saveBases() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(BASES));
  } catch (err) {
    console.warn('localStorage save failed', err);
  }
  // Home Hero：基底色變動後同步重繪 palette card
  if (typeof renderPaletteCard === 'function') renderPaletteCard();
}
function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'b-' + Math.random().toString(36).slice(2, 11);
}

/* ========== Color utilities ========== */
function hexToRgb(hex) {
  const h = hex.replace('#','');
  return [
    parseInt(h.slice(0,2), 16),
    parseInt(h.slice(2,4), 16),
    parseInt(h.slice(4,6), 16),
  ];
}
function rgbToHex(rgb) {
  return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0')).join('').toUpperCase();
}
function isValidHex(s) {
  return typeof s === 'string' && /^#?[0-9a-fA-F]{6}$/.test(s.trim());
}
function normalizeHex(s) {
  let v = String(s).trim().toUpperCase();
  if (!v.startsWith('#')) v = '#' + v;
  return v;
}

/* ========== Mixbox latent cache ========== */
const LATENT_SIZE = mixbox.LATENT_SIZE; // = 7
function rebuildLatents() {
  BASES.forEach(b => {
    b.rgb = hexToRgb(b.hex);
    b.latent = mixbox.rgbToLatent(b.rgb[0], b.rgb[1], b.rgb[2]);
  });
}
function mixMixbox(parts) {
  let total = 0;
  const eff = new Array(parts.length);
  for (let i=0; i<parts.length; i++) {
    eff[i] = parts[i] * BASES[i].tintStrength;
    total += eff[i];
  }
  if (total === 0) return [255, 255, 255];
  const z = new Array(LATENT_SIZE).fill(0);
  for (let i=0; i<parts.length; i++) {
    if (eff[i] === 0) continue;
    const w = eff[i] / total;
    const L = BASES[i].latent;
    for (let j=0; j<LATENT_SIZE; j++) z[j] += L[j] * w;
  }
  return mixbox.latentToRgb(z);
}

/* ========== sRGB → Lab ========== */
function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function rgbToLab(rgb) {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);
  let X = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  let Y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  let Z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
  X /= 0.95047; Y /= 1.00000; Z /= 1.08883;
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16/116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/* ========== CIEDE2000 ========== */
function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const avgL = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const avgCp = (C1p + C2p) / 2;
  const h1p = (Math.atan2(b1, a1p) * 180 / Math.PI + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) * 180 / Math.PI + 360) % 360;
  let deltahp;
  if (Math.abs(h1p - h2p) <= 180) deltahp = h2p - h1p;
  else if (h2p <= h1p) deltahp = h2p - h1p + 360;
  else deltahp = h2p - h1p - 360;
  const deltaLp = L2 - L1;
  const deltaCp = C2p - C1p;
  const deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deltahp * Math.PI / 360);
  let avgHp;
  if (Math.abs(h1p - h2p) > 180) avgHp = (h1p + h2p + 360) / 2;
  else avgHp = (h1p + h2p) / 2;
  const T = 1
    - 0.17 * Math.cos((avgHp - 30) * Math.PI / 180)
    + 0.24 * Math.cos((2 * avgHp) * Math.PI / 180)
    + 0.32 * Math.cos((3 * avgHp + 6) * Math.PI / 180)
    - 0.20 * Math.cos((4 * avgHp - 63) * Math.PI / 180);
  const deltaTheta = 30 * Math.exp(-Math.pow((avgHp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const Sc = 1 + 0.045 * avgCp;
  const Sh = 1 + 0.015 * avgCp * T;
  const Rt = -Math.sin(2 * deltaTheta * Math.PI / 180) * Rc;
  return Math.sqrt(
    Math.pow(deltaLp / Sl, 2) +
    Math.pow(deltaCp / Sc, 2) +
    Math.pow(deltaHp / Sh, 2) +
    Rt * (deltaCp / Sc) * (deltaHp / Sh)
  );
}

/* ========== Recursive recipe search (動態 N) ========== */
let _bestScore, _best, _targetLab;
function findBestRecipe(targetRgb) {
  _targetLab = rgbToLab(targetRgb);
  _bestScore = Infinity;
  _best = null;
  const N = BASES.length;
  if (N === 0) return null;
  const parts = new Array(N).fill(0);
  searchRec(parts, 0, MAX_TOTAL_PARTS);
  return _best;
}
function searchRec(parts, idx, remaining) {
  const N = BASES.length;
  if (idx === N) {
    let total = 0;
    for (let i=0; i<N; i++) total += parts[i];
    if (total === 0) return;
    const mixed = mixMixbox(parts);
    const dE = deltaE2000(_targetLab, rgbToLab(mixed));
    const score = dE + total * 0.03;
    if (score < _bestScore) {
      _bestScore = score;
      _best = { parts: parts.slice(), mixed, deltaE: dE, total };
    }
    return;
  }
  const max = Math.min(MAX_PARTS_PER_COLOR, remaining);
  for (let k = 0; k <= max; k++) {
    parts[idx] = k;
    searchRec(parts, idx + 1, remaining - k);
  }
  parts[idx] = 0;
}

/* ========== Misc helpers ========== */
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
function simplifyRatio(arr) {
  const nonzero = arr.filter(v => v > 0);
  if (nonzero.length === 0) return arr.slice();
  let g = nonzero[0];
  for (let i=1; i<nonzero.length; i++) g = gcd(g, nonzero[i]);
  return arr.map(v => v / g);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

/* ========== UI: Tab navigation ========== */
const tabbarBtns = document.querySelectorAll('.tabbar-btn');
const views = {
  mix:     document.getElementById('view-mix'),
  record:  document.getElementById('view-record'),
  bases:   document.getElementById('view-bases'),
  library: document.getElementById('view-library'),
  me:      document.getElementById('view-me'),
};
function closeAllModals() {
  // 切換 view 時把所有開著的 modal-overlay 關掉,避免遺留的 modal 蓋住新 view 的點擊
  document.querySelectorAll('.modal-overlay').forEach(m => { m.hidden = true; });
  document.body.style.overflow = '';
}
function switchView(name) {
  closeAllModals();
  Object.entries(views).forEach(([k, el]) => { if (el) el.hidden = (k !== name); });
  tabbarBtns.forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'bases') renderBases();
  if (name === 'record' && typeof initRecordOnce === 'function') initRecordOnce();
  if (name === 'mix' && typeof renderHero === 'function') renderHero();
  if (name === 'library' && typeof initLibraryOnce === 'function') initLibraryOnce();
  if (name === 'me' && typeof refreshMeView === 'function') refreshMeView();
  window.scrollTo(0, 0);
}
tabbarBtns.forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
window.switchView = switchView;

/* ========== Library view: 材料 / 靈感 ========== */
let _libraryInited = false;
async function initLibraryOnce() {
  if (!_libraryInited) {
    const segBtns = document.querySelectorAll('.view-library .lib-segmented .tabs-btn');
    const paneMat = document.getElementById('lib-pane-materials');
    const paneGal = document.getElementById('lib-pane-gallery');
    const libTitle = document.getElementById('libTitle');
    const titles = { materials: '材料庫', gallery: '美甲靈感' };
    function showSub(name) {
      segBtns.forEach(b => b.classList.toggle('active', b.dataset.libtab === name));
      paneMat.hidden = name !== 'materials';
      paneGal.hidden = name !== 'gallery';
      libTitle.textContent = titles[name] || '圖庫';
    }
    segBtns.forEach(b => b.addEventListener('click', () => showSub(b.dataset.libtab)));
    showSub('materials');
    _libraryInited = true;

    try {
      await MediaDB.init();
      await Materials.init();
      await Gallery.init();
    } catch (err) {
      console.warn('Library init failed', err);
      const grid = document.getElementById('matGrid');
      if (grid) grid.innerHTML = '<div class="empty" style="padding:24px;">瀏覽器不支援 IndexedDB,圖庫無法使用。</div>';
    }
  }
}

/* ========== Record view: 配方 / 計劃 / 作品 ========== */
let _recordInited = false;
async function initRecordOnce() {
  // 配方部分(原 saved view)總是要刷新
  if (typeof renderSaved === 'function') renderSaved();

  if (!_recordInited) {
    const segBtns = document.querySelectorAll('.record-segmented .tabs-btn');
    const paneRec = document.getElementById('record-pane-recipes');
    const panePln = document.getElementById('record-pane-plans');
    const paneWrk = document.getElementById('record-pane-works');
    const recTitle = document.getElementById('recordTitle');
    const titles = { recipes: '配方收藏', plans: '美甲計劃', works: '作品紀錄' };
    function showSub(name) {
      segBtns.forEach(b => b.classList.toggle('active', b.dataset.rectab === name));
      paneRec.hidden = name !== 'recipes';
      panePln.hidden = name !== 'plans';
      paneWrk.hidden = name !== 'works';
      recTitle.textContent = titles[name] || '紀錄';
    }
    segBtns.forEach(b => b.addEventListener('click', () => showSub(b.dataset.rectab)));
    showSub('recipes');
    _recordInited = true;

    try {
      await MediaDB.init();
      await Works.init();
      await Plans.init();
      if (window.Calendar && Calendar.init) Calendar.init();
    } catch (err) {
      console.warn('Record init failed', err);
    }
  }
}

/* ========== Me view: 主題切換 + 基底色入口 ========== */
function bindMeView() {
  // 基底色入口
  const basesEntry = document.getElementById('basesEntryCard');
  basesEntry && basesEntry.addEventListener('click', () => switchView('bases'));

  // 基底色 view 的返回鈕
  const basesBack = document.getElementById('basesBackBtn');
  basesBack && basesBack.addEventListener('click', () => switchView('me'));

  // 主題切換
  const themeBtns = document.querySelectorAll('.theme-btn[data-theme-mode]');
  function paintActive() {
    const cur = (window.Theme && Theme.get && Theme.get()) || 'auto';
    themeBtns.forEach(b => b.classList.toggle('active', b.dataset.themeMode === cur));
  }
  themeBtns.forEach(b => b.addEventListener('click', () => {
    if (window.Theme && Theme.set) Theme.set(b.dataset.themeMode);
    paintActive();
  }));
  paintActive();

  // ===== 資料備份 =====
  const backupCard = document.getElementById('backupCard');
  const backupModal = document.getElementById('backupModal');
  const backupClose = document.getElementById('backupClose');
  const backupExportBtn = document.getElementById('backupExportBtn');
  const backupImportFile = document.getElementById('backupImportFile');
  const backupExportStatus = document.getElementById('backupExportStatus');
  const backupImportStatus = document.getElementById('backupImportStatus');
  const scopeBtns = document.querySelectorAll('[data-backup-scope]');
  let _backupScope = 'all';
  scopeBtns.forEach(b => b.addEventListener('click', () => {
    _backupScope = b.dataset.backupScope;
    scopeBtns.forEach(x => x.classList.toggle('active', x === b));
  }));
  backupCard && backupCard.addEventListener('click', () => {
    if (!window.Backup) { alert('JSZip 載入失敗,備份功能無法使用'); return; }
    backupExportStatus.textContent = '';
    backupImportStatus.textContent = '';
    backupModal.hidden = false;
    document.body.style.overflow = 'hidden';
  });
  function closeBackupModal() {
    backupModal.hidden = true;
    document.body.style.overflow = '';
  }
  backupClose && backupClose.addEventListener('click', closeBackupModal);
  backupModal && backupModal.addEventListener('click', (e) => { if (e.target === backupModal) closeBackupModal(); });
  backupExportBtn && backupExportBtn.addEventListener('click', async () => {
    backupExportBtn.disabled = true;
    try {
      await Backup.exportAll(_backupScope, (msg) => { backupExportStatus.textContent = msg; });
    } catch (err) {
      console.warn(err);
      backupExportStatus.textContent = '✕ 匯出失敗:' + (err.message || err);
    } finally {
      backupExportBtn.disabled = false;
    }
  });
  backupImportFile && backupImportFile.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      await Backup.importAll(file, (msg) => { backupImportStatus.textContent = msg; });
    } catch (err) {
      console.warn(err);
      backupImportStatus.textContent = '✕ 匯入失敗:' + (err.message || err);
    }
  });
}
function refreshMeView() {
  // 顯示已啟用基底色數量
  const sub = document.getElementById('basesEntrySub');
  if (sub && Array.isArray(BASES)) {
    sub.textContent = `目前有 ${BASES.length} 個基底色`;
  }
  // 重新整理主題按鈕的 active 狀態
  const themeBtns = document.querySelectorAll('.theme-btn[data-theme-mode]');
  if (themeBtns.length) {
    const cur = (window.Theme && Theme.get && Theme.get()) || 'auto';
    themeBtns.forEach(b => b.classList.toggle('active', b.dataset.themeMode === cur));
  }
  // 色彩校正狀態
  const calibSub = document.getElementById('calibEntrySub');
  if (calibSub && window.Calibration) {
    const cal = Calibration.get();
    if (cal && cal.enabled) {
      const d = new Date(cal.createdAt);
      calibSub.textContent = `已校正(${d.getMonth()+1}/${d.getDate()}),點擊重新校正`;
    } else {
      calibSub.textContent = '用色卡校正不同光線下的拍照偏差';
    }
  }
}

/* ========== 色彩校正 modal ========== */
let _calibInited = false;
let _calibImg = null;       // 載入後的 Image 物件
let _calibCanvas = null;
let _calibCtx = null;
let _calibCurrentTargetIdx = 0;
let _calibSampled = [];     // 6 筆 [r,g,b]
function bindCalibration() {
  if (_calibInited || !window.Calibration) return;
  const entry = document.getElementById('calibEntryCard');
  const modal = document.getElementById('calibModal');
  if (!entry || !modal) return;

  const refCanvas = document.getElementById('calibRefCanvas');
  const downloadBtn = document.getElementById('calibDownloadBtn');
  const fileInput = document.getElementById('calibFile');
  const photoWrap = document.getElementById('calibPhotoWrap');
  const photoCanvas = document.getElementById('calibPhotoCanvas');
  const pinLayer = document.getElementById('calibPinLayer');
  const targetsEl = document.getElementById('calibTargets');
  const progressEl = document.getElementById('calibProgress');
  const previewTitle = document.getElementById('calibPreviewTitle');
  const previewWrap = document.getElementById('calibPreview');
  const saveBtn = document.getElementById('calibSaveBtn');
  const clearBtn = document.getElementById('calibClearBtn');
  const cancelBtn = document.getElementById('calibCancelBtn');
  const closeBtn = document.getElementById('calibClose');
  const statusEl = document.getElementById('calibStatus');

  _calibCanvas = photoCanvas;
  _calibCtx = photoCanvas.getContext('2d', { willReadFrequently: true });

  function open() {
    Calibration.drawReferenceCard(refCanvas);
    _calibImg = null;
    _calibSampled = [];
    _calibCurrentTargetIdx = 0;
    photoWrap.hidden = true;
    pinLayer.innerHTML = '';
    fileInput.value = '';
    previewTitle.hidden = true;
    previewWrap.hidden = true;
    saveBtn.disabled = true;
    const has = Calibration.isEnabled();
    clearBtn.hidden = !has;
    statusEl.textContent = has ? '✓ 目前有啟用校正,可重新校正或清除' : '尚未校正';
    statusEl.className = 'calib-status' + (has ? ' calib-status-on' : '');
    renderTargets();
    renderProgress();
    modal.hidden = false;
  }
  function close() {
    modal.hidden = true;
    _calibImg = null;
    _calibSampled = [];
  }

  function renderTargets() {
    const T = Calibration.TARGETS;
    targetsEl.innerHTML = T.map((t, i) => {
      const sampled = !!_calibSampled[i];
      const active = i === _calibCurrentTargetIdx ? ' active' : '';
      const done = sampled ? ' calib-target-done' : '';
      const hex = '#' + t.rgb.map(v => v.toString(16).padStart(2,'0')).join('');
      return `
        <button type="button" class="chip chip-pick calib-target-chip${active}${done}" data-idx="${i}">
          <span class="calib-target-sw" style="background:${hex}"></span>
          ${t.name}${sampled ? ' ✓' : ''}
        </button>
      `;
    }).join('');
    targetsEl.querySelectorAll('.calib-target-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        _calibCurrentTargetIdx = +btn.dataset.idx;
        renderTargets();
        renderProgress();
      });
    });
  }
  function renderProgress() {
    const done = _calibSampled.filter(Boolean).length;
    const T = Calibration.TARGETS;
    if (done >= T.length) {
      progressEl.textContent = `✓ 6/6 已採樣 — 點下方「儲存校正」`;
      tryCompute();
    } else {
      progressEl.textContent = `${done}/6 已採樣 — 請點選「${T[_calibCurrentTargetIdx].name}」色塊在照片上的位置`;
    }
  }

  function renderPin(i, x, y) {
    const t = Calibration.TARGETS[i];
    const dot = document.createElement('div');
    dot.className = 'calib-pin';
    dot.style.left = x + 'px';
    dot.style.top = y + 'px';
    dot.style.background = `rgb(${t.rgb.join(',')})`;
    dot.dataset.idx = i;
    dot.title = t.name;
    pinLayer.appendChild(dot);
  }
  function refreshPins() {
    pinLayer.innerHTML = '';
    if (!_calibImg) return;
    _calibSampled.forEach((s, i) => {
      if (s && s.x != null) renderPin(i, s.x, s.y);
    });
  }

  function samplePixelAvg(cx, cy, radius) {
    const sx = Math.max(0, Math.floor(cx - radius));
    const sy = Math.max(0, Math.floor(cy - radius));
    const w = Math.min(radius * 2, _calibCanvas.width - sx);
    const h = Math.min(radius * 2, _calibCanvas.height - sy);
    const data = _calibCtx.getImageData(sx, sy, w, h).data;
    let r=0, g=0, b=0, n=0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i+1]; b += data[i+2]; n++;
    }
    return [Math.round(r/n), Math.round(g/n), Math.round(b/n)];
  }

  function onPhotoClick(clientX, clientY) {
    if (!_calibImg) return;
    const rect = _calibCanvas.getBoundingClientRect();
    const cx = (clientX - rect.left) * (_calibCanvas.width  / rect.width);
    const cy = (clientY - rect.top ) * (_calibCanvas.height / rect.height);
    if (cx < 0 || cy < 0 || cx >= _calibCanvas.width || cy >= _calibCanvas.height) return;
    const rgb = samplePixelAvg(cx, cy, 6);
    const i = _calibCurrentTargetIdx;
    _calibSampled[i] = {
      rgb,
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
    // 自動跳到下一個尚未採樣的
    const T = Calibration.TARGETS;
    for (let k = 1; k <= T.length; k++) {
      const idx = (i + k) % T.length;
      if (!_calibSampled[idx]) { _calibCurrentTargetIdx = idx; break; }
    }
    refreshPins();
    renderTargets();
    renderProgress();
  }

  photoCanvas.addEventListener('click', (e) => onPhotoClick(e.clientX, e.clientY));
  photoCanvas.addEventListener('touchend', (e) => {
    if (e.changedTouches && e.changedTouches.length) {
      const t = e.changedTouches[0];
      onPhotoClick(t.clientX, t.clientY);
      e.preventDefault();
    }
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        _calibImg = img;
        const maxW = photoWrap.clientWidth || 480;
        const scale = Math.min(1, maxW / img.width);
        _calibCanvas.width  = Math.round(img.width * scale);
        _calibCanvas.height = Math.round(img.height * scale);
        _calibCtx.drawImage(img, 0, 0, _calibCanvas.width, _calibCanvas.height);
        photoWrap.hidden = false;
        _calibSampled = [];
        _calibCurrentTargetIdx = 0;
        pinLayer.innerHTML = '';
        renderTargets();
        renderProgress();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  function tryCompute() {
    const measured = _calibSampled.map(s => s && s.rgb).filter(Boolean);
    if (measured.length < Calibration.TARGETS.length) {
      saveBtn.disabled = true;
      previewTitle.hidden = true;
      previewWrap.hidden = true;
      return;
    }
    const cal = Calibration.computeCalibration(measured);
    if (!cal) {
      saveBtn.disabled = true;
      return;
    }
    // 預覽:把每個 measured 套上矩陣後跟 target 比對
    const T = Calibration.TARGETS;
    previewTitle.hidden = false;
    previewWrap.hidden = false;
    previewWrap.innerHTML = T.map((t, i) => {
      const corrected = Calibration.applyToRgb(measured[i], cal);
      const dE = Math.round(Math.sqrt(
        (corrected[0]-t.rgb[0])**2 +
        (corrected[1]-t.rgb[1])**2 +
        (corrected[2]-t.rgb[2])**2
      ));
      return `
        <div class="calib-pv-row">
          <span class="calib-pv-label">${t.name}</span>
          <div class="calib-pv-sw" style="background:rgb(${measured[i].join(',')})" title="拍到"></div>
          <span class="calib-pv-arrow">→</span>
          <div class="calib-pv-sw" style="background:rgb(${corrected.join(',')})" title="校正後"></div>
          <span class="calib-pv-arrow">vs</span>
          <div class="calib-pv-sw" style="background:rgb(${t.rgb.join(',')})" title="目標"></div>
          <span class="calib-pv-de">ΔE ${dE}</span>
        </div>
      `;
    }).join('');
    saveBtn.disabled = false;
    saveBtn._pendingCal = cal;
  }

  saveBtn.addEventListener('click', () => {
    const cal = saveBtn._pendingCal;
    if (!cal) return;
    Calibration.save(cal);
    refreshMeView();
    close();
    alert('色彩校正已儲存。之後從圖片取色都會自動套用。');
  });
  clearBtn.addEventListener('click', () => {
    if (!confirm('清除目前的色彩校正?')) return;
    Calibration.clear();
    refreshMeView();
    close();
  });
  cancelBtn.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  downloadBtn.addEventListener('click', () => {
    const url = refCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nail-mixer-calibration-card.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  entry.addEventListener('click', open);
  _calibInited = true;
}

/* ========== Mix view: image upload & pick ========== */
const fileInput     = document.getElementById('fileInput');
const canvas        = document.getElementById('canvas');
const canvasWrap    = document.getElementById('canvasWrap');
const crosshair     = document.getElementById('crosshair');
const hint          = document.getElementById('hint');
const emptyState    = document.getElementById('emptyState');
const calcState     = document.getElementById('calcState');
const resultContent = document.getElementById('resultContent');
const targetSwatch  = document.getElementById('targetSwatch');
const targetHex     = document.getElementById('targetHex');
const predictSwatch = document.getElementById('predictSwatch');
const predictHex    = document.getElementById('predictHex');
const recipeList    = document.getElementById('recipeList');
const ratioSummary  = document.getElementById('ratioSummary');
const accuracy      = document.getElementById('accuracy');
const gamutWarning  = document.getElementById('gamutWarning');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
let currentImage = null;

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      currentImage = img;
      drawImage(img, canvas, ctx, canvasWrap);
      canvasWrap.classList.add('has-image');
      hint.style.display = 'block';
      crosshair.classList.remove('show');
      if (typeof resetZoom === 'function') resetZoom();
      if (zoomControls) zoomControls.hidden = false;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

function drawImage(img, cvs, c, wrap) {
  const maxW = wrap.clientWidth || 480;
  const scale = Math.min(1, maxW / img.width);
  cvs.width  = Math.round(img.width * scale);
  cvs.height = Math.round(img.height * scale);
  c.drawImage(img, 0, 0, cvs.width, cvs.height);
  // 套用色彩校正(若有啟用)
  if (window.Calibration && Calibration.isEnabled()) {
    try {
      const data = c.getImageData(0, 0, cvs.width, cvs.height);
      Calibration.applyToImageData(data, Calibration.get());
      c.putImageData(data, 0, 0);
    } catch (e) { console.warn('apply calibration failed', e); }
  }
}

function pickFromCanvas(cvs, c, ch, clientX, clientY) {
  const rect = cvs.getBoundingClientRect();
  const x = (clientX - rect.left) * (cvs.width  / rect.width);
  const y = (clientY - rect.top ) * (cvs.height / rect.height);
  if (x < 0 || y < 0 || x >= cvs.width || y >= cvs.height) return null;
  const size = 5;
  const sx = Math.max(0, Math.floor(x - size/2));
  const sy = Math.max(0, Math.floor(y - size/2));
  const w = Math.min(size, cvs.width  - sx);
  const h = Math.min(size, cvs.height - sy);
  const data = c.getImageData(sx, sy, w, h).data;
  let r=0, g=0, b=0, n=0;
  for (let i=0; i<data.length; i+=4) {
    r += data[i]; g += data[i+1]; b += data[i+2]; n++;
  }
  ch.style.left = ((clientX - rect.left) / rect.width  * 100) + '%';
  ch.style.top  = ((clientY - rect.top ) / rect.height * 100) + '%';
  ch.classList.add('show');
  return [Math.round(r/n), Math.round(g/n), Math.round(b/n)];
}

// 取色入口：tap 才算（pan/scroll/pinch 不會誤觸發）。
// 實際的 listeners 在後面 pan/zoom 那段一次處理。

function onPickTarget(target) {
  emptyState.hidden = true;
  resultContent.hidden = true;
  calcState.hidden = false;
  setTimeout(() => showResult(target), 20);
}

function showResult(target) {
  if (BASES.length === 0) {
    calcState.hidden = true;
    emptyState.hidden = false;
    emptyState.innerHTML = '<div>請先到「基底色」分頁新增至少一個基底色</div>';
    return;
  }
  const best = findBestRecipe(target);
  if (!best) {
    calcState.hidden = true;
    emptyState.hidden = false;
    return;
  }
  calcState.hidden = true;
  resultContent.hidden = false;

  targetSwatch.style.background  = `rgb(${target.join(',')})`;
  targetHex.textContent = rgbToHex(target);

  const mixed = best.mixed.map(v => Math.max(0, Math.min(255, Math.round(v))));
  predictSwatch.style.background = `rgb(${mixed.join(',')})`;
  predictHex.textContent = rgbToHex(mixed);

  recipeList.innerHTML = '';
  BASES.forEach((base, i) => {
    const parts = best.parts[i];
    const row = document.createElement('div');
    row.className = 'recipe-row' + (parts === 0 ? ' zero' : '');
    row.innerHTML = `
      <div class="color-dot" style="background:${base.hex}"></div>
      <div class="recipe-info">
        <div class="name">${escapeHtml(base.name)}</div>
        ${base.sub ? `<div class="sub">${escapeHtml(base.sub)}</div>` : ''}
      </div>
      <div class="recipe-parts">${parts}<span class="unit">份</span></div>
    `;
    recipeList.appendChild(row);
  });

  const simp = simplifyRatio(best.parts).map(v => Math.round(v));
  const namesShort = BASES.map(b => b.name).join(':');
  ratioSummary.textContent = `比例 ${simp.join(' : ')}  （${namesShort}）`;

  const dE = best.deltaE;
  let level, color;
  if (dE < 2)       { level = '肉眼幾乎無差'; color = '#2ECC71'; }
  else if (dE < 5)  { level = '非常接近';     color = '#27AE60'; }
  else if (dE < 10) { level = '接近';         color = '#F1C40F'; }
  else if (dE < 20) { level = '中等';         color = '#F39C12'; }
  else              { level = '差距較大';     color = '#E74C3C'; }
  accuracy.innerHTML = `<span class="accuracy-dot" style="background:${color}"></span>色差 <span class="accuracy-de">ΔE ${dE.toFixed(1)}</span> · ${level}`;

  if (dE > 15) {
    gamutWarning.hidden = false;
    gamutWarning.innerHTML = `<b>⚠️ 色域不足</b><br>此目標色在你目前的 ${BASES.length} 個基底色組合下難以精確調出，建議到「基底色」分頁新增缺少的色相基底。`;
  } else {
    gamutWarning.hidden = true;
  }

  // 記錄目前結果，給「複製配方」「收藏配方」使用
  lastResult = {
    target: target.slice(),
    targetHex: rgbToHex(target),
    predicted: mixed,
    predictedHex: rgbToHex(mixed),
    deltaE: dE,
    parts: BASES
      .map((b, i) => ({
        hex: b.hex,
        name: b.name,
        sub: b.sub || '',
        parts: best.parts[i],
      }))
      .filter(p => p.parts > 0),
    totalParts: best.total,
  };
}

/* ========== Bases view ========== */
const basesList    = document.getElementById('basesList');
const baseCount    = document.getElementById('baseCount');
const basesWarning = document.getElementById('basesWarning');

function renderBases() {
  basesList.innerHTML = '';
  BASES.forEach(base => {
    const item = document.createElement('div');
    item.className = 'base-item';
    item.innerHTML = `
      <div class="base-swatch" style="background:${base.hex}"></div>
      <div class="base-info">
        <div class="name">${escapeHtml(base.name)}</div>
        <div class="meta">${escapeHtml(base.sub || base.hex)} · ×${base.tintStrength.toFixed(1)}${base.note ? ' · ' + escapeHtml(base.note) : ''}</div>
      </div>
      <div class="base-actions">
        <button class="icon-btn" data-act="edit" data-id="${base.id}" aria-label="編輯">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button class="icon-btn" data-act="delete" data-id="${base.id}" aria-label="刪除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `;
    basesList.appendChild(item);
  });

  baseCount.textContent = `共 ${BASES.length} / ${MAX_BASES} 個基底色`;

  if (BASES.length < MIN_BASES_OK) {
    basesWarning.hidden = false;
    basesWarning.className = 'gamut-warning';
    basesWarning.innerHTML = `<b>⚠️ 基底色不足</b><br>少於 ${MIN_BASES_OK} 個基底會讓多數目標色色域內無法調出，建議至少保留 ${MIN_BASES_OK} 個。`;
  } else {
    basesWarning.hidden = true;
  }
}

basesList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.act === 'edit') openModal(id);
  else if (btn.dataset.act === 'delete') deleteBase(id);
});

function deleteBase(id) {
  const base = BASES.find(b => b.id === id);
  if (!base) return;
  if (BASES.length <= 1) {
    alert('至少需要保留 1 個基底色');
    return;
  }
  if (!confirm(`確定要刪除「${base.name}」嗎？`)) return;
  BASES = BASES.filter(b => b.id !== id);
  saveBases();
  rebuildLatents();
  renderBases();
}

document.getElementById('addBaseBtn').addEventListener('click', () => {
  if (BASES.length >= MAX_BASES) {
    alert(`基底色已達上限 ${MAX_BASES} 個`);
    return;
  }
  openModal(null);
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('確定要重置為預設 5 色？目前的所有自訂會被清掉。')) return;
  BASES = JSON.parse(JSON.stringify(DEFAULT_BASES));
  saveBases();
  rebuildLatents();
  renderBases();
  alert('已重置為預設 5 色');
});

/* ========== Modal: Add / Edit Base ========== */
const baseModal       = document.getElementById('baseModal');
const modalTitle      = document.getElementById('modalTitle');
const modalClose      = document.getElementById('modalClose');
const modalCancel     = document.getElementById('modalCancel');
const modalSave       = document.getElementById('modalSave');
const modalFileInput  = document.getElementById('modalFileInput');
const modalCanvas     = document.getElementById('modalCanvas');
const modalCanvasWrap = document.getElementById('modalCanvasWrap');
const modalCrosshair  = document.getElementById('modalCrosshair');
const modalHint       = document.getElementById('modalHint');
const modalCtx        = modalCanvas.getContext('2d', { willReadFrequently: true });
const samplePreview   = document.getElementById('samplePreview');
const sampleSwatch    = document.getElementById('sampleSwatch');
const sampleHex       = document.getElementById('sampleHex');
const hexInput        = document.getElementById('hexInput');
const baseNameInput   = document.getElementById('baseName');
const baseSubInput    = document.getElementById('baseSub');
const baseTintSelect  = document.getElementById('baseTint');
const baseTintCustom  = document.getElementById('baseTintCustom');
const baseNoteInput   = document.getElementById('baseNote');

let editingId = null;
let modalImage = null;
let pendingHex = null;

window.addEventListener('resize', () => {
  if (currentImage) {
    drawImage(currentImage, canvas, ctx, canvasWrap);
    if (typeof resetZoom === 'function') resetZoom(); // 旋轉 / resize 後重置 zoom
  }
  if (modalImage)  drawImage(modalImage, modalCanvas, modalCtx, modalCanvasWrap);
});

function openModal(id) {
  editingId = id;
  modalImage = null;
  pendingHex = null;
  modalCanvasWrap.classList.remove('has-image');
  modalHint.style.display = 'none';
  samplePreview.hidden = true;
  modalCrosshair.classList.remove('show');
  hexInput.value = '';
  baseTintCustom.hidden = true;
  baseTintCustom.value = '';

  if (id) {
    const b = BASES.find(x => x.id === id);
    if (!b) return;
    modalTitle.textContent = '編輯基底色';
    baseNameInput.value = b.name;
    baseSubInput.value = b.sub;
    baseNoteInput.value = b.note || '';
    pendingHex = b.hex;
    sampleSwatch.style.background = b.hex;
    sampleHex.textContent = b.hex;
    samplePreview.hidden = false;
    const t = b.tintStrength;
    if (t === 1.0 || t === 2.0 || t === 3.0) {
      baseTintSelect.value = t.toFixed(1);
    } else {
      baseTintSelect.value = 'custom';
      baseTintCustom.hidden = false;
      baseTintCustom.value = t;
    }
    switchModalTab('hex');
    hexInput.value = b.hex;
  } else {
    modalTitle.textContent = '新增基底色';
    baseNameInput.value = '';
    baseSubInput.value = '';
    baseNoteInput.value = '';
    baseTintSelect.value = '1.0';
    switchModalTab('image');
  }
  baseModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  baseModal.hidden = true;
  document.body.style.overflow = '';
}
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
baseModal.addEventListener('click', (e) => {
  if (e.target === baseModal) closeModal();
});

document.querySelectorAll('.tabs-btn').forEach(btn => {
  btn.addEventListener('click', () => switchModalTab(btn.dataset.tab));
});
function switchModalTab(name) {
  document.querySelectorAll('.tabs-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  document.getElementById('tab-image').hidden = (name !== 'image');
  document.getElementById('tab-hex').hidden = (name !== 'hex');
}

modalFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      modalImage = img;
      drawImage(img, modalCanvas, modalCtx, modalCanvasWrap);
      modalCanvasWrap.classList.add('has-image');
      modalHint.style.display = 'block';
      modalCrosshair.classList.remove('show');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

modalCanvas.addEventListener('click', (e) => {
  const rgb = pickFromCanvas(modalCanvas, modalCtx, modalCrosshair, e.clientX, e.clientY);
  if (rgb) onSamplePicked(rgb);
});
modalCanvas.addEventListener('touchend', (e) => {
  if (e.changedTouches.length > 0) {
    const t = e.changedTouches[0];
    const rgb = pickFromCanvas(modalCanvas, modalCtx, modalCrosshair, t.clientX, t.clientY);
    if (rgb) onSamplePicked(rgb);
    e.preventDefault();
  }
}, { passive: false });

function onSamplePicked(rgb) {
  const hex = rgbToHex(rgb);
  pendingHex = hex;
  sampleSwatch.style.background = hex;
  sampleHex.textContent = hex;
  samplePreview.hidden = false;
  hexInput.value = hex;
}

hexInput.addEventListener('input', () => {
  const v = hexInput.value.trim();
  if (isValidHex(v)) {
    const hex = normalizeHex(v);
    pendingHex = hex;
    sampleSwatch.style.background = hex;
    sampleHex.textContent = hex;
    samplePreview.hidden = false;
  }
});

baseTintSelect.addEventListener('change', () => {
  if (baseTintSelect.value === 'custom') {
    baseTintCustom.hidden = false;
    if (!baseTintCustom.value) baseTintCustom.value = '1.0';
    baseTintCustom.focus();
  } else {
    baseTintCustom.hidden = true;
  }
});

modalSave.addEventListener('click', () => {
  const name = baseNameInput.value.trim();
  if (!name) { alert('請填寫名稱'); baseNameInput.focus(); return; }
  if (!pendingHex || !isValidHex(pendingHex)) { alert('請先採樣或輸入正確色號'); return; }

  let tint;
  if (baseTintSelect.value === 'custom') {
    tint = parseFloat(baseTintCustom.value);
    if (!isFinite(tint) || tint <= 0 || tint > 5) {
      alert('著色力必須介於 0.2 ~ 5.0');
      baseTintCustom.focus();
      return;
    }
  } else {
    tint = parseFloat(baseTintSelect.value);
  }

  const data = {
    name,
    sub: baseSubInput.value.trim(),
    hex: normalizeHex(pendingHex),
    tintStrength: tint,
    note: baseNoteInput.value.trim(),
  };

  if (editingId) {
    const idx = BASES.findIndex(b => b.id === editingId);
    if (idx >= 0) BASES[idx] = { ...BASES[idx], ...data };
  } else {
    BASES.push({
      id: genId(),
      ...data,
      source: modalImage ? 'image' : 'hex',
    });
  }
  saveBases();
  rebuildLatents();
  renderBases();
  closeModal();
});

/* =============================================================================
   Phase 7：配方收藏 / 調色日記
   ============================================================================= */

const SAVED_KEY = 'nail-color-mixer.saved.v1';
const MAX_SAVED = 200;
const PHOTO_MAX_DIM = 720;
const PHOTO_QUALITY = 0.7;

let SAVED = [];           // Array<SavedRecipe>
let lastResult = null;    // 最近一次調色結果
let detailCurrentId = null; // 目前打開的詳細頁配方 id

/* ---------- Storage ---------- */
function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(r => r && r.id && Array.isArray(r.parts))
      .map(r => ({
        id: r.id,
        name: typeof r.name === 'string' ? r.name : '',
        note: typeof r.note === 'string' ? r.note : '',
        tags: Array.isArray(r.tags) ? r.tags.filter(Boolean) : [],
        targetHex: isValidHex(r.targetHex) ? normalizeHex(r.targetHex) : '#888888',
        predictedHex: isValidHex(r.predictedHex) ? normalizeHex(r.predictedHex) : '#888888',
        deltaE: typeof r.deltaE === 'number' ? r.deltaE : 0,
        parts: r.parts.map(p => ({
          hex: isValidHex(p.hex) ? normalizeHex(p.hex) : '#888888',
          name: typeof p.name === 'string' ? p.name : '?',
          sub: typeof p.sub === 'string' ? p.sub : '',
          parts: typeof p.parts === 'number' ? p.parts : 0,
        })),
        totalParts: typeof r.totalParts === 'number' ? r.totalParts : 0,
        photo: typeof r.photo === 'string' ? r.photo : null,
        createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
        updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : (r.createdAt || Date.now()),
      }));
  } catch (err) {
    console.warn('saved load failed', err);
    return [];
  }
}

function saveSaved() {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(SAVED));
    // Home Hero：收藏變動後同步重繪 rail
    if (typeof renderRecentRail === 'function') renderRecentRail();
    return true;
  } catch (err) {
    console.warn('saved save failed', err);
    if (err && err.name === 'QuotaExceededError') {
      alert('儲存空間不足。建議刪除一些已收藏配方或移除照片後再試。');
    }
    return false;
  }
}

function parseTags(s) {
  return String(s || '')
    .split(/[,，\s]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/* ---------- Toast ---------- */
let _toastTimer = null;
function toast(msg) {
  let el = document.querySelector('.save-toast');
  if (el) el.remove();
  el = document.createElement('div');
  el.className = 'save-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.remove(), 1800);
}

/* ---------- Recipe → text （for clipboard / share） ---------- */
function recipeToText(r) {
  const lines = [];
  lines.push(`【${r.name || '未命名配方'}】`);
  lines.push(`目標色 ${r.targetHex} → 預估 ${r.predictedHex} (ΔE ${r.deltaE.toFixed(1)})`);
  lines.push('');
  lines.push('配方：');
  r.parts.forEach(p => {
    const subStr = p.sub ? ` (${p.sub})` : '';
    lines.push(`  ${p.name}${subStr}：${p.parts} 份`);
  });
  lines.push(`總計 ${r.totalParts} 份`);
  if (r.tags && r.tags.length) lines.push(`標籤：${r.tags.join(' ')}`);
  if (r.note) {
    lines.push('');
    lines.push(`備註：${r.note}`);
  }
  lines.push('');
  lines.push('— 美甲調色');
  return lines.join('\n');
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* fallthrough */ }
  // Fallback：textarea + execCommand
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

/* ---------- 結果頁：複製 / 收藏按鈕 ---------- */
const copyRecipeBtn = document.getElementById('copyRecipeBtn');
const saveRecipeBtn = document.getElementById('saveRecipeBtn');

copyRecipeBtn.addEventListener('click', async () => {
  if (!lastResult) return;
  const text = recipeToText({
    name: '配方',
    targetHex: lastResult.targetHex,
    predictedHex: lastResult.predictedHex,
    deltaE: lastResult.deltaE,
    parts: lastResult.parts,
    totalParts: lastResult.totalParts,
    tags: [],
    note: '',
  });
  const ok = await copyToClipboard(text);
  toast(ok ? '已複製到剪貼簿' : '複製失敗，請手動選取');
});

saveRecipeBtn.addEventListener('click', () => {
  if (!lastResult) return;
  openSaveModal();
});

/* ---------- Save modal ---------- */
const saveModal       = document.getElementById('saveModal');
const saveModalClose  = document.getElementById('saveModalClose');
const saveModalCancel = document.getElementById('saveModalCancel');
const saveModalSave   = document.getElementById('saveModalSave');
const saveTargetSwatch  = document.getElementById('saveTargetSwatch');
const saveTargetHex     = document.getElementById('saveTargetHex');
const savePredictSwatch = document.getElementById('savePredictSwatch');
const savePredictHex    = document.getElementById('savePredictHex');
const saveNameInput = document.getElementById('saveName');
const saveTagsInput = document.getElementById('saveTags');
const saveNoteInput = document.getElementById('saveNote');

function openSaveModal() {
  if (!lastResult) return;
  saveTargetSwatch.style.background  = lastResult.targetHex;
  savePredictSwatch.style.background = lastResult.predictedHex;
  saveTargetHex.textContent  = lastResult.targetHex;
  savePredictHex.textContent = lastResult.predictedHex;
  saveNameInput.value = lastResult.targetHex;
  saveTagsInput.value = '';
  saveNoteInput.value = '';
  saveModal.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    saveNameInput.focus();
    saveNameInput.select();
  }, 50);
}
function closeSaveModal() {
  saveModal.hidden = true;
  document.body.style.overflow = '';
}
saveModalClose.addEventListener('click', closeSaveModal);
saveModalCancel.addEventListener('click', closeSaveModal);
saveModal.addEventListener('click', (e) => {
  if (e.target === saveModal) closeSaveModal();
});

saveModalSave.addEventListener('click', () => {
  if (!lastResult) { closeSaveModal(); return; }
  if (SAVED.length >= MAX_SAVED) {
    alert(`收藏已達上限 ${MAX_SAVED} 個，請先刪除舊的`);
    return;
  }
  const name = saveNameInput.value.trim() || lastResult.targetHex;
  const tags = parseTags(saveTagsInput.value);
  const note = saveNoteInput.value.trim();
  const now = Date.now();
  const recipe = {
    id: genId(),
    name,
    note,
    tags,
    targetHex: lastResult.targetHex,
    predictedHex: lastResult.predictedHex,
    deltaE: lastResult.deltaE,
    parts: lastResult.parts.map(p => ({ hex: p.hex, name: p.name, sub: p.sub, parts: p.parts })),
    totalParts: lastResult.totalParts,
    photo: null,
    createdAt: now,
    updatedAt: now,
  };
  SAVED.unshift(recipe);
  if (saveSaved()) {
    closeSaveModal();
    toast('已加入收藏');
  } else {
    SAVED.shift();
    alert('儲存失敗');
  }
});

/* ---------- Saved list view ---------- */
const savedListWrap   = document.getElementById('savedListWrap');
const savedEmpty      = document.getElementById('savedEmpty');
const savedNoResult   = document.getElementById('savedNoResult');
const savedSearchWrap = document.getElementById('savedSearchWrap');
const savedSearchInput = document.getElementById('savedSearch');
const savedCount      = document.getElementById('savedCount');

function timeAgo(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return '剛剛';
  if (d < 3600) return Math.floor(d/60) + ' 分鐘前';
  if (d < 86400) return Math.floor(d/3600) + ' 小時前';
  if (d < 86400 * 30) return Math.floor(d/86400) + ' 天前';
  const dt = new Date(ts);
  return `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getDate()).padStart(2,'0')}`;
}

function recipeMatches(r, q) {
  if (!q) return true;
  const lower = q.toLowerCase();
  if ((r.name || '').toLowerCase().includes(lower)) return true;
  if ((r.note || '').toLowerCase().includes(lower)) return true;
  if (r.tags && r.tags.some(t => t.toLowerCase().includes(lower))) return true;
  if ((r.targetHex || '').toLowerCase().includes(lower)) return true;
  return false;
}

function renderSaved() {
  const total = SAVED.length;
  savedCount.textContent = total > 0 ? `${total} 個配方` : '';
  savedSearchWrap.hidden = total === 0;

  if (total === 0) {
    savedListWrap.innerHTML = '';
    savedEmpty.hidden = false;
    savedNoResult.hidden = true;
    return;
  }
  savedEmpty.hidden = true;

  const q = (savedSearchInput.value || '').trim();
  const list = SAVED.filter(r => recipeMatches(r, q));
  if (list.length === 0) {
    savedListWrap.innerHTML = '';
    savedNoResult.hidden = false;
    return;
  }
  savedNoResult.hidden = true;

  const html = list.map(r => {
    const dE = r.deltaE.toFixed(1);
    const ratio = r.parts.map(p => p.parts).join(' : ');
    const namesShort = r.parts.map(p => p.name).join(':');
    const photoHtml = r.photo
      ? `<img class="photo-thumb" src="${r.photo}" alt="">`
      : '';
    const tagsHtml = (r.tags && r.tags.length)
      ? `<div class="saved-tags">${r.tags.map(t => `<span class="saved-tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    return `
      <div class="saved-card" data-id="${r.id}">
        <div class="swatch-pair" aria-hidden="true">
          <div style="background:${r.targetHex}"></div>
          <div style="background:${r.predictedHex}"></div>
        </div>
        <div class="body">
          <div class="title">${escapeHtml(r.name || r.targetHex)}</div>
          <div class="meta">
            <span class="de">ΔE ${dE}</span>
            <span>${ratio} （${escapeHtml(namesShort)}）</span>
            <span>${timeAgo(r.updatedAt || r.createdAt)}</span>
          </div>
          ${tagsHtml}
        </div>
        ${photoHtml}
      </div>
    `;
  }).join('');
  savedListWrap.innerHTML = html;
}

savedSearchInput.addEventListener('input', renderSaved);

savedListWrap.addEventListener('click', (e) => {
  const card = e.target.closest('.saved-card');
  if (!card) return;
  openDetail(card.dataset.id);
});

/* ---------- Detail modal ---------- */
const detailModal  = document.getElementById('detailModal');
const detailClose  = document.getElementById('detailClose');
const detailTitle  = document.getElementById('detailTitle');
const detailBody   = document.getElementById('detailBody');
const detailDelete = document.getElementById('detailDelete');
const detailRemix  = document.getElementById('detailRemix');
const photoFileInput = document.getElementById('photoFileInput');

function openDetail(id) {
  const r = SAVED.find(x => x.id === id);
  if (!r) return;
  detailCurrentId = id;
  renderDetail(r);
  detailModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  detailModal.hidden = true;
  document.body.style.overflow = '';
  detailCurrentId = null;
}
detailClose.addEventListener('click', closeDetail);
detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) closeDetail();
});

function renderDetail(r) {
  detailTitle.textContent = r.name || r.targetHex;

  // 比對基底色變動
  const stale = isRecipeStale(r);

  const recipeRows = r.parts.map(p => `
    <div class="recipe-row">
      <div class="color-dot" style="background:${p.hex}"></div>
      <div class="recipe-info">
        <div class="name">${escapeHtml(p.name)}</div>
        ${p.sub ? `<div class="sub">${escapeHtml(p.sub)}</div>` : ''}
      </div>
      <div class="recipe-parts">${p.parts}<span class="unit">份</span></div>
    </div>
  `).join('');

  const ratio = r.parts.map(p => p.parts).join(' : ');
  const namesShort = r.parts.map(p => p.name).join(':');

  const photoHtml = r.photo
    ? `<div class="detail-photo-wrap">
         <img class="detail-photo" src="${r.photo}" alt="成品">
         <button class="detail-photo-remove" id="removePhotoBtn" aria-label="移除照片">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
         </button>
       </div>`
    : `<button class="btn btn-secondary btn-block detail-add-photo" id="addPhotoBtn">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
         加上成品照片
       </button>`;

  const tagsHtml = (r.tags && r.tags.length)
    ? r.tags.map(t => `<span class="saved-tag">${escapeHtml(t)}</span>`).join('')
    : '<span style="color: var(--text-3);">（無）</span>';

  const dE = r.deltaE;
  let level, color;
  if (dE < 2)       { level = '肉眼幾乎無差'; color = '#2ECC71'; }
  else if (dE < 5)  { level = '非常接近';     color = '#27AE60'; }
  else if (dE < 10) { level = '接近';         color = '#F1C40F'; }
  else if (dE < 20) { level = '中等';         color = '#F39C12'; }
  else              { level = '差距較大';     color = '#E74C3C'; }

  detailBody.innerHTML = `
    <div class="detail-section">
      <div class="compare">
        <div class="compare-cell">
          <div class="label">目標色</div>
          <div class="swatch" style="height: 80px; background:${r.targetHex};"></div>
          <div class="hex">${r.targetHex}</div>
        </div>
        <div class="compare-cell">
          <div class="label">預估</div>
          <div class="swatch" style="height: 80px; background:${r.predictedHex};"></div>
          <div class="hex">${r.predictedHex}</div>
        </div>
      </div>
      <div class="accuracy">
        <span class="accuracy-dot" style="background:${color}"></span>色差 <span class="accuracy-de">ΔE ${dE.toFixed(1)}</span> · ${level}
      </div>
      ${stale ? `<div class="stale-banner">⚠️ 此配方使用的基底色與目前設定不同（已被刪除或修改），「再做一次」會用目前基底色重算最佳配方。</div>` : ''}
    </div>

    <div class="detail-section">
      <div class="label">配方</div>
      <div>${recipeRows}</div>
      <div class="ratio-bar" style="margin-top: 12px;">比例 ${ratio}  （${escapeHtml(namesShort)}），共 ${r.totalParts} 份</div>
    </div>

    <div class="detail-section">
      <div class="label">標籤</div>
      <div style="display:flex; flex-wrap:wrap; gap:4px;">${tagsHtml}</div>
    </div>

    <div class="detail-section">
      <div class="label">備註</div>
      <div class="body-text">${r.note ? escapeHtml(r.note) : '<span style="color: var(--text-3);">（無）</span>'}</div>
      <button class="btn btn-secondary btn-block" id="editMetaBtn" style="margin-top:8px;">
        編輯名稱 / 標籤 / 備註
      </button>
    </div>

    <div class="detail-section">
      <div class="label">成品照片</div>
      ${photoHtml}
    </div>

    <div class="detail-section">
      <div class="label">分享</div>
      <button class="btn btn-secondary btn-block" id="shareBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        複製成文字（可貼到 LINE / IG）
      </button>
    </div>
  `;

  // 綁細節按鈕
  const addBtn    = document.getElementById('addPhotoBtn');
  const removeBtn = document.getElementById('removePhotoBtn');
  const editBtn   = document.getElementById('editMetaBtn');
  const shareBtn  = document.getElementById('shareBtn');
  if (addBtn)    addBtn.addEventListener('click', () => photoFileInput.click());
  if (removeBtn) removeBtn.addEventListener('click', () => removePhoto(r.id));
  if (editBtn)   editBtn.addEventListener('click', () => editMeta(r.id));
  if (shareBtn)  shareBtn.addEventListener('click', async () => {
    const ok = await copyToClipboard(recipeToText(r));
    toast(ok ? '已複製到剪貼簿' : '複製失敗');
  });
}

/* 此配方所引用的基底色，跟目前 BASES 是否一致？ */
function isRecipeStale(r) {
  for (const p of r.parts) {
    const matched = BASES.find(b => b.hex.toLowerCase() === p.hex.toLowerCase());
    if (!matched) return true;
  }
  return false;
}

/* ---------- Detail：刪除 / 再做一次 / 編輯 meta / 照片 ---------- */
detailDelete.addEventListener('click', () => {
  if (!detailCurrentId) return;
  const r = SAVED.find(x => x.id === detailCurrentId);
  if (!r) return;
  if (!confirm(`確定要刪除「${r.name || r.targetHex}」嗎？`)) return;
  SAVED = SAVED.filter(x => x.id !== detailCurrentId);
  saveSaved();
  closeDetail();
  renderSaved();
  toast('已刪除');
});

detailRemix.addEventListener('click', () => {
  if (!detailCurrentId) return;
  const r = SAVED.find(x => x.id === detailCurrentId);
  if (!r) return;
  closeDetail();
  switchView('mix');
  // 用儲存的目標色重新計算
  const targetRgb = hexToRgb(r.targetHex);
  // 確保結果區域被展開
  if (typeof openPicker === 'function') openPicker('result');
  onPickTarget(targetRgb);
  setTimeout(() => {
    document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
});

function editMeta(id) {
  const r = SAVED.find(x => x.id === id);
  if (!r) return;
  const newName = prompt('名稱：', r.name || r.targetHex);
  if (newName === null) return;
  const newTags = prompt('標籤（用空白或逗號分隔）：', (r.tags || []).join(' '));
  if (newTags === null) return;
  const newNote = prompt('備註：', r.note || '');
  if (newNote === null) return;
  r.name = newName.trim() || r.targetHex;
  r.tags = parseTags(newTags);
  r.note = newNote.trim();
  r.updatedAt = Date.now();
  if (saveSaved()) {
    renderDetail(r);
    renderSaved();
    toast('已更新');
  }
}

function removePhoto(id) {
  const r = SAVED.find(x => x.id === id);
  if (!r) return;
  if (!confirm('要移除這張成品照片嗎？')) return;
  r.photo = null;
  r.updatedAt = Date.now();
  if (saveSaved()) {
    renderDetail(r);
    renderSaved();
    toast('已移除照片');
  }
}

/* ---------- Photo：壓縮 + 存進當前 detail recipe ---------- */
photoFileInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = ''; // 允許再選同一張
  if (!file || !detailCurrentId) return;
  const r = SAVED.find(x => x.id === detailCurrentId);
  if (!r) return;
  try {
    const dataUrl = await compressImage(file, PHOTO_MAX_DIM, PHOTO_QUALITY);
    r.photo = dataUrl;
    r.updatedAt = Date.now();
    if (saveSaved()) {
      renderDetail(r);
      renderSaved();
      toast('已加上照片');
    } else {
      r.photo = null;
    }
  } catch (err) {
    console.warn(err);
    alert('照片處理失敗');
  }
});

function compressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const c = cv.getContext('2d');
        c.fillStyle = '#fff';
        c.fillRect(0, 0, w, h);
        c.drawImage(img, 0, 0, w, h);
        try {
          resolve(cv.toDataURL('image/jpeg', quality));
        } catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* =============================================================================
   Phase 8：多點取色 / 漸層分析
   ============================================================================= */

const MAX_PICKS = 5;
let mixMode = 'single';        // 'single' | 'multi'
let multiPicks = [];           // [{ rgb, hex, x%, y%, recipe }]
let showGradient = false;      // 顯示漸層中間色 toggle

const modeToggle    = document.getElementById('modeToggle');
const pinsLayer     = document.getElementById('pinsLayer');
const picksStrip    = document.getElementById('picksStrip');
const picksChips    = document.getElementById('picksChips');
const picksClearBtn = document.getElementById('picksClearBtn');
const gradientToggleBtn = document.getElementById('gradientToggleBtn');
const multiResults  = document.getElementById('multiResults');

modeToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  setMixMode(btn.dataset.mode);
});

function setMixMode(mode) {
  mixMode = mode;
  modeToggle.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  if (mode === 'single') {
    // 切回單點：清掉多點，但保留最近一個 pick 為單點目標
    if (multiPicks.length > 0) {
      const last = multiPicks[multiPicks.length - 1];
      crosshair.style.left = last.xPct + '%';
      crosshair.style.top  = last.yPct + '%';
      crosshair.classList.add('show');
      onPickTarget(last.rgb);
    }
    multiPicks = [];
    renderPins();
    renderPicksStrip();
    renderMultiResults();
  } else {
    // 切到多點：清掉單點結果，把目前那點作為第一個多點
    crosshair.classList.remove('show');
    if (lastResult) {
      multiPicks = [{
        rgb: lastResult.target.slice(),
        hex: lastResult.targetHex,
        xPct: getCurrentCrosshairPct().x,
        yPct: getCurrentCrosshairPct().y,
      }];
      // 把單點結果蓋掉
      resultContent.hidden = true;
      emptyState.hidden = false;
      lastResult = null;
    }
    renderPins();
    renderPicksStrip();
    recomputeMultiResults();
  }
}

function getCurrentCrosshairPct() {
  return {
    x: parseFloat(crosshair.style.left) || 50,
    y: parseFloat(crosshair.style.top) || 50,
  };
}

/* 改寫 canvas click：依 mixMode 分流 */
function pickAndRoute(clientX, clientY) {
  if (!currentImage) return;
  const rect = canvas.getBoundingClientRect();
  const xPct = (clientX - rect.left) / rect.width  * 100;
  const yPct = (clientY - rect.top ) / rect.height * 100;

  if (mixMode === 'single') {
    const rgb = pickFromCanvas(canvas, ctx, crosshair, clientX, clientY);
    if (rgb) onPickTarget(rgb);
    return;
  }

  // 多點：取色但不動 crosshair
  const tmp = { style: { left: '', top: '' }, classList: { add: () => {}, remove: () => {} } };
  const rgb = pickFromCanvas(canvas, ctx, tmp, clientX, clientY);
  if (!rgb) return;

  if (multiPicks.length >= MAX_PICKS) {
    toast(`最多 ${MAX_PICKS} 個取色點`);
    return;
  }
  multiPicks.push({
    rgb, hex: rgbToHex(rgb),
    xPct, yPct,
  });
  renderPins();
  renderPicksStrip();
  recomputeMultiResults();
}

/* =========================================================================
   Pan / Zoom + Tap-vs-drag 偵測
   - zoom = 1：touch-action: pan-y，瀏覽器接管上下捲，整頁可滑
   - zoom > 1：自己接管，1 指 = pan，2 指 = pinch
   - tap：移動 < 8px 且時間 < 400ms 才視為取色，避免多點誤觸 / 滑動誤點
   ========================================================================= */

const canvasZoomer  = document.getElementById('canvasZoomer');
const zoomControls  = document.getElementById('zoomControls');
const zoomInBtn     = document.getElementById('zoomInBtn');
const zoomOutBtn    = document.getElementById('zoomOutBtn');
const zoomResetBtn  = document.getElementById('zoomResetBtn');
const zoomLevelEl   = document.getElementById('zoomLevel');

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.5;
const TAP_MOVE_THRESHOLD = 8;   // px — 累積移動超過就不算 tap
const TAP_TIME_THRESHOLD = 400; // ms — 按住超過就不算 tap（避免長按誤觸）

let zoom = 1;
let panX = 0, panY = 0;

function applyZoomTransform() {
  canvasZoomer.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  canvasWrap.classList.toggle('is-zoomed', zoom > 1.001);
  if (zoomLevelEl) zoomLevelEl.textContent = zoom.toFixed(1) + '×';
  if (zoomOutBtn)  zoomOutBtn.disabled  = zoom <= ZOOM_MIN + 0.001;
  if (zoomInBtn)   zoomInBtn.disabled   = zoom >= ZOOM_MAX - 0.001;
  if (zoomResetBtn) zoomResetBtn.style.visibility = zoom > 1.001 ? 'visible' : 'hidden';
}

function clampPan() {
  if (zoom <= 1) { panX = 0; panY = 0; return; }
  const W = canvasWrap.clientWidth  || 1;
  const H = canvasWrap.clientHeight || 1;
  const minX = W - W * zoom;  // 負值
  const minY = H - H * zoom;
  panX = Math.min(0, Math.max(minX, panX));
  panY = Math.min(0, Math.max(minY, panY));
}

function setZoom(newZoom, pivotClientX, pivotClientY) {
  newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  if (Math.abs(newZoom - zoom) < 0.001) return;
  // 把 pivot 轉成 wrap 的本地座標（zoom=1 那層）
  const rect = canvasWrap.getBoundingClientRect();
  const localX = (pivotClientX - rect.left - panX) / zoom;
  const localY = (pivotClientY - rect.top  - panY) / zoom;
  zoom = newZoom;
  panX = (pivotClientX - rect.left) - localX * zoom;
  panY = (pivotClientY - rect.top ) - localY * zoom;
  clampPan();
  applyZoomTransform();
}

function resetZoom() {
  zoom = 1; panX = 0; panY = 0;
  applyZoomTransform();
}

zoomInBtn  && zoomInBtn .addEventListener('click', () => {
  const r = canvasWrap.getBoundingClientRect();
  setZoom(zoom * ZOOM_STEP, r.left + r.width/2, r.top + r.height/2);
});
zoomOutBtn && zoomOutBtn.addEventListener('click', () => {
  const r = canvasWrap.getBoundingClientRect();
  setZoom(zoom / ZOOM_STEP, r.left + r.width/2, r.top + r.height/2);
});
zoomResetBtn && zoomResetBtn.addEventListener('click', resetZoom);

/* ---------- Touch handling: tap / pan / pinch ---------- */

let activeTouches = new Map(); // identifier → { x0, y0, x, y, t0 }
let isPinching = false;
let pinchStartDist = 0;
let pinchStartZoom = 1;
let pinchPivot = { x: 0, y: 0 };
let isDragging = false; // 1 指拖曳中（zoom>1 時 pan）
let didMove = false;    // 整段觸控是否被判定為「拖過 / 縮過」（用來阻止 click 觸發）
let _handledTouchTap = false; // touchend 已處理 tap，後續合成 click 要忽略

function _touchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

canvasWrap.addEventListener('touchstart', (e) => {
  if (!currentImage) return;
  // 點到 zoom 控制鈕時不處理（讓按鈕自己接 click）
  if (e.target.closest('.zoom-controls')) return;
  for (const t of e.changedTouches) {
    activeTouches.set(t.identifier, {
      x0: t.clientX, y0: t.clientY,
      x:  t.clientX, y:  t.clientY,
      t0: Date.now(),
    });
  }
  if (e.touches.length === 2) {
    // 進入 pinch
    isPinching = true;
    isDragging = false;
    didMove = true;
    const [a, b] = [e.touches[0], e.touches[1]];
    pinchStartDist = _touchDist(a, b);
    pinchStartZoom = zoom;
    pinchPivot = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    e.preventDefault();
  } else if (e.touches.length === 1 && zoom > 1.001) {
    // zoom > 1 時 1 指準備 pan
    isDragging = true;
  }
}, { passive: false });

canvasWrap.addEventListener('touchmove', (e) => {
  if (!currentImage) return;

  if (isPinching && e.touches.length >= 2) {
    const [a, b] = [e.touches[0], e.touches[1]];
    const d = _touchDist(a, b);
    if (pinchStartDist > 0) {
      const factor = d / pinchStartDist;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchStartZoom * factor));
      setZoom(newZoom, pinchPivot.x, pinchPivot.y);
    }
    e.preventDefault();
    return;
  }

  if (e.touches.length === 1) {
    const t = e.touches[0];
    const rec = activeTouches.get(t.identifier);
    if (!rec) return;
    const dx = t.clientX - rec.x;
    const dy = t.clientY - rec.y;
    const totalDx = t.clientX - rec.x0;
    const totalDy = t.clientY - rec.y0;
    if (Math.hypot(totalDx, totalDy) > TAP_MOVE_THRESHOLD) didMove = true;
    rec.x = t.clientX; rec.y = t.clientY;

    if (isDragging && zoom > 1.001) {
      panX += dx;
      panY += dy;
      clampPan();
      applyZoomTransform();
      e.preventDefault();
    }
    // 否則（zoom=1）不 preventDefault，讓瀏覽器處理頁面捲動
  }
}, { passive: false });

canvasWrap.addEventListener('touchend', (e) => {
  if (!currentImage) {
    activeTouches.clear();
    return;
  }
  if (e.target.closest('.zoom-controls')) return;

  // 取色：只處理「最後一根手指離開、整段沒被判定為移動、按壓時間夠短」
  if (e.touches.length === 0 && !didMove && !isPinching) {
    const t = e.changedTouches[0];
    const rec = t ? activeTouches.get(t.identifier) : null;
    if (rec && (Date.now() - rec.t0) < TAP_TIME_THRESHOLD) {
      e.preventDefault();
      _handledTouchTap = true;
      // 下一輪事件循環清掉，避免後續手動觸發的 click 也被吃掉
      setTimeout(() => { _handledTouchTap = false; }, 350);
      pickAndRoute(t.clientX, t.clientY);
    }
  }

  // 清掉已離開的 touch
  for (const t of e.changedTouches) activeTouches.delete(t.identifier);

  if (e.touches.length < 2) isPinching = false;
  if (e.touches.length === 0) {
    isDragging = false;
    // 重置 didMove 要等 click 也處理完，所以延遲一拍
    setTimeout(() => { didMove = false; }, 0);
  }
}, { passive: false });

canvasWrap.addEventListener('touchcancel', () => {
  activeTouches.clear();
  isPinching = false;
  isDragging = false;
  didMove = false;
}, { passive: false });

/* ---------- Mouse / Desktop：click 取色 + wheel zoom ---------- */
// 用 click 而不是 touchstart→touchend，因為桌機 mouse 的 touchend 我們不會收到，
// 但行動端 click 預設不會觸發（已經 preventDefault 過 touchend），所以兩條路不會重疊。
canvasWrap.addEventListener('click', (e) => {
  if (!currentImage) return;
  if (didMove || _handledTouchTap) return; // touchend 已經吃掉這次 tap
  // 點到 zoom-controls 區域時不取色
  if (e.target.closest('.zoom-controls')) return;
  pickAndRoute(e.clientX, e.clientY);
});

canvasWrap.addEventListener('wheel', (e) => {
  if (!currentImage) return;
  // ctrl + 滾輪 = 縮放（不擋一般滾頁）
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  setZoom(zoom * factor, e.clientX, e.clientY);
}, { passive: false });

function renderPins() {
  pinsLayer.innerHTML = '';
  if (mixMode !== 'multi') return;
  multiPicks.forEach((p, i) => {
    const pin = document.createElement('div');
    pin.className = 'numbered-pin';
    pin.style.left = p.xPct + '%';
    pin.style.top  = p.yPct + '%';
    pin.textContent = String(i + 1);
    pinsLayer.appendChild(pin);
  });
}

function renderPicksStrip() {
  if (mixMode !== 'multi') {
    picksStrip.hidden = true;
    return;
  }
  picksStrip.hidden = false;
  picksChips.innerHTML = '';
  multiPicks.forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = 'pick-chip';
    chip.innerHTML = `
      <div class="num">${i + 1}</div>
      <div class="sw" style="background:${p.hex}"></div>
      <div class="hex">${p.hex}</div>
      <button class="x" data-idx="${i}" aria-label="移除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    `;
    picksChips.appendChild(chip);
  });
  gradientToggleBtn.classList.toggle('on', showGradient);
  gradientToggleBtn.disabled = multiPicks.length < 2;
  gradientToggleBtn.style.opacity = (multiPicks.length < 2) ? 0.4 : 1;
}

picksChips.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-idx]');
  if (!btn) return;
  const idx = parseInt(btn.dataset.idx, 10);
  multiPicks.splice(idx, 1);
  renderPins();
  renderPicksStrip();
  recomputeMultiResults();
});

picksClearBtn.addEventListener('click', () => {
  if (multiPicks.length === 0) return;
  multiPicks = [];
  renderPins();
  renderPicksStrip();
  renderMultiResults();
});

gradientToggleBtn.addEventListener('click', () => {
  if (multiPicks.length < 2) return;
  showGradient = !showGradient;
  renderPicksStrip();
  recomputeMultiResults();
});

/* LAB 中間色：在 ab 空間插值，回 RGB */
function labToRgb(lab) {
  const [L, a, b] = lab;
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const cube = (t) => Math.pow(t, 3) > 0.008856 ? Math.pow(t, 3) : (t - 16/116) / 7.787;
  let X = cube(fx) * 0.95047;
  let Y = cube(fy) * 1.00000;
  let Z = cube(fz) * 1.08883;
  let r = X *  3.2404542 + Y * -1.5371385 + Z * -0.4985314;
  let g = X * -0.9692660 + Y *  1.8760108 + Z *  0.0415560;
  let bl= X *  0.0556434 + Y * -0.2040259 + Z *  1.0572252;
  const enc = (c) => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1/2.4) - 0.055;
  r = Math.round(Math.max(0, Math.min(1, enc(r))) * 255);
  g = Math.round(Math.max(0, Math.min(1, enc(g))) * 255);
  bl= Math.round(Math.max(0, Math.min(1, enc(bl))) * 255);
  return [r, g, bl];
}

function midpointRgb(rgbA, rgbB) {
  const labA = rgbToLab(rgbA);
  const labB = rgbToLab(rgbB);
  return labToRgb([
    (labA[0] + labB[0]) / 2,
    (labA[1] + labB[1]) / 2,
    (labA[2] + labB[2]) / 2,
  ]);
}

function buildMultiResultEntries() {
  const entries = [];
  multiPicks.forEach((p, i) => {
    entries.push({ kind: 'pick', label: String(i + 1), rgb: p.rgb, hex: p.hex });
    if (showGradient && i < multiPicks.length - 1) {
      const mid = midpointRgb(p.rgb, multiPicks[i+1].rgb);
      entries.push({
        kind: 'mid',
        label: `${i+1}↔${i+2}`,
        rgb: mid,
        hex: rgbToHex(mid),
      });
    }
  });
  return entries;
}

function recomputeMultiResults() {
  const entries = buildMultiResultEntries();
  // 預先算好每筆的 recipe
  entries.forEach(en => {
    const best = findBestRecipe(en.rgb);
    if (!best) {
      en.recipe = null;
      return;
    }
    const mixed = best.mixed.map(v => Math.max(0, Math.min(255, Math.round(v))));
    en.recipe = {
      target: en.rgb.slice(),
      targetHex: en.hex,
      predicted: mixed,
      predictedHex: rgbToHex(mixed),
      deltaE: best.deltaE,
      parts: BASES
        .map((b, i) => ({ hex: b.hex, name: b.name, sub: b.sub || '', parts: best.parts[i] }))
        .filter(p => p.parts > 0),
      totalParts: best.total,
    };
  });
  renderMultiResults(entries);
}

function renderMultiResults(entries) {
  if (mixMode !== 'multi') {
    multiResults.hidden = true;
    multiResults.innerHTML = '';
    return;
  }
  if (!entries) entries = buildMultiResultEntries();
  if (entries.length === 0) {
    multiResults.hidden = false;
    multiResults.innerHTML = `<div class="card"><div class="multi-card-empty">在圖片上點選 1-${MAX_PICKS} 個位置</div></div>`;
    return;
  }
  multiResults.hidden = false;
  multiResults.innerHTML = '';
  entries.forEach((en, i) => {
    const card = document.createElement('div');
    card.className = 'multi-card';
    card.dataset.idx = String(i);
    if (!en.recipe) {
      card.innerHTML = `<div class="multi-card-empty">沒有基底色可用，請先到「基底色」分頁新增</div>`;
      multiResults.appendChild(card);
      return;
    }
    const r = en.recipe;
    const dE = r.deltaE;
    let level, color;
    if (dE < 2)       { level = '幾乎無差'; color = '#2ECC71'; }
    else if (dE < 5)  { level = '非常接近';  color = '#27AE60'; }
    else if (dE < 10) { level = '接近';      color = '#F1C40F'; }
    else if (dE < 20) { level = '中等';      color = '#F39C12'; }
    else              { level = '差距較大';  color = '#E74C3C'; }
    const ratio = r.parts.map(p => p.parts).join(' : ');
    const namesShort = r.parts.map(p => p.name).join(':');
    const recipeRows = r.parts.map(p => `
      <div class="recipe-row">
        <div class="color-dot" style="background:${p.hex}"></div>
        <div class="recipe-info">
          <div class="name">${escapeHtml(p.name)}</div>
          ${p.sub ? `<div class="sub">${escapeHtml(p.sub)}</div>` : ''}
        </div>
        <div class="recipe-parts">${p.parts}<span class="unit">份</span></div>
      </div>
    `).join('');
    card.innerHTML = `
      <div class="multi-card-head">
        <div class="num ${en.kind === 'mid' ? 'midpoint' : ''}">${escapeHtml(en.label)}</div>
        <div class="swatches">
          <div class="sw" style="background:${r.targetHex}"></div>
          <div class="sw" style="background:${r.predictedHex}"></div>
        </div>
        <div class="hex-pair">${r.targetHex} → ${r.predictedHex}</div>
        <div class="acc">
          <span class="accuracy-dot" style="background:${color}"></span>
          <span class="accuracy-de">ΔE ${dE.toFixed(1)}</span> · ${level}
        </div>
      </div>
      <div>${recipeRows}</div>
      <div class="ratio-bar">比例 ${ratio}（${escapeHtml(namesShort)}）</div>
      <div class="multi-card-foot">
        <button class="btn btn-secondary" data-act="copy">複製</button>
        <button class="btn btn-primary" data-act="save">收藏</button>
      </div>
    `;
    multiResults.appendChild(card);
  });
}

multiResults.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const card = btn.closest('.multi-card');
  if (!card) return;
  const idx = parseInt(card.dataset.idx, 10);
  const entries = buildMultiResultEntries();
  const en = entries[idx];
  if (!en || !en.recipe) return;
  if (btn.dataset.act === 'copy') {
    const ok = await copyToClipboard(recipeToText({
      name: `位置 ${en.label}`,
      targetHex: en.recipe.targetHex,
      predictedHex: en.recipe.predictedHex,
      deltaE: en.recipe.deltaE,
      parts: en.recipe.parts,
      totalParts: en.recipe.totalParts,
      tags: [],
      note: '',
    }));
    toast(ok ? '已複製到剪貼簿' : '複製失敗');
  } else if (btn.dataset.act === 'save') {
    if (SAVED.length >= MAX_SAVED) {
      alert(`收藏已達上限 ${MAX_SAVED} 個`);
      return;
    }
    // 直接打開 saveModal，但暫時把 lastResult 換成這筆
    lastResult = {
      target: en.recipe.target.slice(),
      targetHex: en.recipe.targetHex,
      predicted: en.recipe.predicted.slice(),
      predictedHex: en.recipe.predictedHex,
      deltaE: en.recipe.deltaE,
      parts: en.recipe.parts.map(p => ({ ...p })),
      totalParts: en.recipe.totalParts,
    };
    openSaveModal();
    saveNameInput.value = `位置 ${en.label}（${en.recipe.targetHex}）`;
    setTimeout(() => { saveNameInput.focus(); saveNameInput.select(); }, 80);
  }
});

/* =============================================================================
   Phase 10：份量計算（克數 / 倍數）
   ============================================================================= */

const GEL_PER_PART = 0.10; // 1 份 = 0.10 g（與既有提示一致）
const NAIL_SIZE_GRAMS = { small: 0.04, medium: 0.06, large: 0.08 };

function renderPortionPanel(container, recipe) {
  // recipe = { parts: [{hex,name,sub,parts}], totalParts }
  if (!recipe || !recipe.parts || recipe.parts.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  // state lives on the container
  if (!container._portionState) {
    container._portionState = {
      mode: 'mult',     // 'mult' | 'nail'
      multiplier: 1,
      nails: 10,
      size: 'medium',
    };
  }
  const s = container._portionState;
  container.innerHTML = `
    <details>
      <summary>📐 份量計算（克數 / 倍數）</summary>
      <div style="padding-top: 10px;">
        <div class="portion-modes">
          <button data-mode="mult" class="${s.mode === 'mult' ? 'active' : ''}">倍數縮放</button>
          <button data-mode="nail" class="${s.mode === 'nail' ? 'active' : ''}">依指甲數</button>
        </div>
        <div class="portion-body" id="portionBody"></div>
      </div>
    </details>
  `;
  const body = container.querySelector('#portionBody');
  renderPortionBody();

  container.querySelectorAll('.portion-modes button').forEach(btn => {
    btn.addEventListener('click', () => {
      s.mode = btn.dataset.mode;
      container.querySelectorAll('.portion-modes button').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === s.mode);
      });
      renderPortionBody();
    });
  });

  function renderPortionBody() {
    if (s.mode === 'mult') {
      body.innerHTML = `
        <div class="portion-multiplier" id="multBtns">
          ${[0.5, 1, 1.5, 2, 3].map(m =>
            `<button data-m="${m}" class="${s.multiplier === m ? 'active' : ''}">×${m}</button>`
          ).join('')}
          <button data-m="custom" class="${![0.5,1,1.5,2,3].includes(s.multiplier) ? 'active' : ''}">自訂</button>
        </div>
        <div class="portion-row" id="multCustomRow" style="${[0.5,1,1.5,2,3].includes(s.multiplier) ? 'display:none' : ''}">
          <label>倍數</label>
          <input type="number" id="multCustomInput" min="0.1" max="10" step="0.1" value="${s.multiplier}">
        </div>
        <div id="portionOutput"></div>
        <div class="portion-hint">1 份 = ${GEL_PER_PART.toFixed(2)} g（用 0.01 g 電子秤量；10 顆鈕扣電池疊起來約 50 g 可校準）</div>
      `;
      body.querySelectorAll('#multBtns button').forEach(b => {
        b.addEventListener('click', () => {
          if (b.dataset.m === 'custom') {
            s.multiplier = 1.2;
          } else {
            s.multiplier = parseFloat(b.dataset.m);
          }
          renderPortionBody();
        });
      });
      const customInput = body.querySelector('#multCustomInput');
      if (customInput) {
        customInput.addEventListener('input', () => {
          const v = parseFloat(customInput.value);
          if (isFinite(v) && v > 0) {
            s.multiplier = v;
            renderOutput();
          }
        });
      }
      renderOutput();
    } else {
      body.innerHTML = `
        <div class="portion-row">
          <label>指甲數</label>
          <input type="number" id="nailCount" min="1" max="20" step="1" value="${s.nails}">
        </div>
        <div class="portion-row">
          <label>每片用量</label>
          <select id="nailSize">
            <option value="small" ${s.size==='small'?'selected':''}>小（薄塗 ${NAIL_SIZE_GRAMS.small}g/片）</option>
            <option value="medium" ${s.size==='medium'?'selected':''}>中（標準 ${NAIL_SIZE_GRAMS.medium}g/片）</option>
            <option value="large" ${s.size==='large'?'selected':''}>大（厚塗 ${NAIL_SIZE_GRAMS.large}g/片）</option>
          </select>
        </div>
        <div id="portionOutput"></div>
        <div class="portion-hint">提示：色膠用量不算底膠 / 封層；會自動加 20% 緩衝避免不夠用。</div>
      `;
      body.querySelector('#nailCount').addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (isFinite(v) && v > 0) { s.nails = v; renderOutput(); }
      });
      body.querySelector('#nailSize').addEventListener('change', (e) => {
        s.size = e.target.value; renderOutput();
      });
      renderOutput();
    }
  }

  function renderOutput() {
    const out = body.querySelector('#portionOutput');
    if (!out) return;
    let scale;
    if (s.mode === 'mult') {
      scale = s.multiplier;
    } else {
      const targetGrams = s.nails * NAIL_SIZE_GRAMS[s.size] * 1.2; // 加 20% 緩衝
      const currentGrams = recipe.totalParts * GEL_PER_PART;
      scale = currentGrams > 0 ? targetGrams / currentGrams : 0;
    }
    let totalGrams = 0;
    let totalParts = 0;
    const rows = recipe.parts.map(p => {
      const scaled = p.parts * scale;
      const grams = scaled * GEL_PER_PART;
      totalParts += scaled;
      totalGrams += grams;
      return `
        <div class="portion-output-row">
          <span class="name"><span class="dot" style="background:${p.hex}"></span>${escapeHtml(p.name)}</span>
          <span class="val">${scaled.toFixed(2)} 份 · ${grams.toFixed(3)} g</span>
        </div>
      `;
    }).join('');
    out.innerHTML = `
      <div class="portion-output">
        ${rows}
        <div class="portion-output-row total">
          <span class="name">總計</span>
          <span class="val">${totalParts.toFixed(2)} 份 · ${totalGrams.toFixed(3)} g</span>
        </div>
      </div>
    `;
  }
}

/* 把 portion panel 接到「調色」結果 */
const mixPortionPanel = document.getElementById('mixPortionPanel');

// 修補 showResult：每次顯示結果就重渲染 portion panel
const _origShowResult = showResult;
showResult = function(target) {
  _origShowResult(target);
  if (lastResult) {
    renderPortionPanel(mixPortionPanel, {
      parts: lastResult.parts,
      totalParts: lastResult.totalParts,
    });
  } else {
    mixPortionPanel.innerHTML = '';
  }
};

/* 把 portion panel 接到「收藏詳細頁」 */
const _origRenderDetail = renderDetail;
renderDetail = function(r) {
  _origRenderDetail(r);
  // 在 detailBody 最後追加一個 portion section
  const sec = document.createElement('div');
  sec.className = 'detail-section';
  sec.innerHTML = `<div class="label">份量計算</div><div id="detailPortion"></div>`;
  detailBody.appendChild(sec);
  renderPortionPanel(sec.querySelector('#detailPortion'), {
    parts: r.parts,
    totalParts: r.totalParts,
  });
};

/* =============================================================================
   碼表（取代原本的 UV/LED 倒數計時器）
   - 行為比照 iPhone 內建碼表：開始 → 計次 → 停止 → 重設 → 開始
   - 狀態機：'idle' | 'running' | 'paused'
   - 計次（lap）：記下從上一次 lap（或起點）到現在的 delta，以及累積總時間
   ============================================================================= */

const timerCard   = document.getElementById('timerCard');
const timerModal  = document.getElementById('timerModal');
const timerClose  = document.getElementById('timerClose');
const swTimeEl    = document.getElementById('swTime');
const swStatusEl  = document.getElementById('swStatus');
const swLapsEl    = document.getElementById('swLaps');
const swPrimary   = document.getElementById('swPrimary');
const swSecondary = document.getElementById('swSecondary');

let swState = 'idle';     // 'idle' | 'running' | 'paused'
let swStartedAt = 0;      // running 期間：開始時間（含累積 paused 偏移調整）
let swElapsed = 0;        // 暫停時凍結的 elapsed（ms）
let swRafId = null;
let swLaps = [];          // [{ t: totalMs, delta: ms }]

function fmtTime(ms) {
  const total = Math.max(0, Math.floor(ms));
  const cs = Math.floor((total % 1000) / 10);
  const s  = Math.floor(total / 1000) % 60;
  const m  = Math.floor(total / 60000);
  return {
    main: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    cs:   `.${String(cs).padStart(2, '0')}`,
  };
}

function getSwElapsed() {
  if (swState === 'running') return swElapsed + (Date.now() - swStartedAt);
  return swElapsed;
}

function renderSwTime() {
  const f = fmtTime(getSwElapsed());
  swTimeEl.innerHTML = `${f.main}<span class="cs">${f.cs}</span>`;
}

function renderSwButtons() {
  if (swState === 'idle') {
    swPrimary.textContent = '開始';
    swPrimary.classList.add('btn-primary');
    swPrimary.classList.remove('btn-secondary');
    swSecondary.textContent = '重設';
    swSecondary.disabled = true;
    swStatusEl.textContent = '就緒';
  } else if (swState === 'running') {
    swPrimary.textContent = '停止';
    swPrimary.classList.remove('btn-primary');
    swPrimary.classList.add('btn-secondary');
    swSecondary.textContent = '計次';
    swSecondary.disabled = false;
    swStatusEl.textContent = '進行中';
  } else { // paused
    swPrimary.textContent = '繼續';
    swPrimary.classList.add('btn-primary');
    swPrimary.classList.remove('btn-secondary');
    swSecondary.textContent = '重設';
    swSecondary.disabled = false;
    swStatusEl.textContent = '已停止';
  }
}

function renderSwLaps() {
  if (swLaps.length === 0) {
    swLapsEl.hidden = true;
    swLapsEl.innerHTML = '';
    return;
  }
  swLapsEl.hidden = false;
  // 找最快 / 最慢（≥3 lap 才標）
  let fastestIdx = -1, slowestIdx = -1;
  if (swLaps.length >= 3) {
    let fastest = Infinity, slowest = 0;
    swLaps.forEach((lap, i) => {
      if (lap.delta < fastest) { fastest = lap.delta; fastestIdx = i; }
      if (lap.delta > slowest) { slowest = lap.delta; slowestIdx = i; }
    });
  }
  // newest 在最上面
  const rows = swLaps.map((lap, i) => {
    const fd = fmtTime(lap.delta);
    const ft = fmtTime(lap.t);
    let cls = 'lap';
    if (i === fastestIdx) cls += ' fastest';
    if (i === slowestIdx) cls += ' slowest';
    return `<div class="${cls}">
      <span class="num">#${i + 1}</span>
      <span class="delta">${fd.main}${fd.cs}</span>
      <span class="total">${ft.main}${ft.cs}</span>
    </div>`;
  }).reverse().join('');
  swLapsEl.innerHTML = rows;
}

function swTick() {
  renderSwTime();
  swRafId = requestAnimationFrame(swTick);
}

function swStart() {
  if (swState === 'running') return;
  swStartedAt = Date.now();
  swState = 'running';
  if (swRafId == null) swRafId = requestAnimationFrame(swTick);
  renderSwButtons();
}

function swStop() {
  if (swState !== 'running') return;
  swElapsed += Date.now() - swStartedAt;
  swState = 'paused';
  if (swRafId != null) {
    cancelAnimationFrame(swRafId);
    swRafId = null;
  }
  renderSwTime();
  renderSwButtons();
  // 若有實行中的計劃且至少跑了 30 秒,詢問是否記錄
  maybeOfferRecordTime();
}

async function maybeOfferRecordTime() {
  if (!window.Plans || typeof Plans.getActive !== 'function') return;
  const elapsed = swElapsed;
  if (elapsed < 30 * 1000) return; // < 30 秒不問
  let active = null;
  try { active = await Plans.getActive(); } catch (_) {}
  if (!active) return;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;
  // 用 setTimeout 避免 confirm 跟剛剛的 click 事件競態
  setTimeout(async () => {
    const ok = confirm(`要把這次計時 ${timeStr} 記錄到計劃「${active.title}」嗎?`);
    if (ok) {
      try {
        await Plans.recordTime(active.id, elapsed, swLaps.length);
        if (swStatusEl) swStatusEl.textContent = '已記錄';
      } catch (err) {
        alert('記錄失敗:' + (err.message || err));
      }
    }
  }, 100);
}

function swReset() {
  if (swRafId != null) {
    cancelAnimationFrame(swRafId);
    swRafId = null;
  }
  swState = 'idle';
  swElapsed = 0;
  swStartedAt = 0;
  swLaps = [];
  renderSwTime();
  renderSwButtons();
  renderSwLaps();
}

function swLap() {
  if (swState !== 'running') return;
  const t = getSwElapsed();
  const prev = swLaps.length > 0 ? swLaps[swLaps.length - 1].t : 0;
  swLaps.push({ t, delta: t - prev });
  renderSwLaps();
}

// 全域碼表入口已被移除(用「資料備份」取代)。下面這些 listener 仍保留以
// 防有外部呼叫 timerModal,但用 null guard 避免錯誤
if (swPrimary) swPrimary.addEventListener('click', () => {
  if (swState === 'running') swStop();
  else swStart();
});
if (swSecondary) swSecondary.addEventListener('click', () => {
  if (swState === 'running') swLap();
  else swReset();
});

if (timerCard) timerCard.addEventListener('click', () => {
  timerModal.hidden = false;
  document.body.style.overflow = 'hidden';
  renderSwTime();
  renderSwButtons();
  renderSwLaps();
  if (swState === 'running' && swRafId == null) {
    swRafId = requestAnimationFrame(swTick);
  }
});
function closeTimerModal() {
  if (timerModal) timerModal.hidden = true;
  document.body.style.overflow = '';
}
if (timerClose) timerClose.addEventListener('click', closeTimerModal);
if (timerModal) timerModal.addEventListener('click', (e) => {
  if (e.target === timerModal) closeTimerModal();
});

// 初始化顯示
renderSwTime();
renderSwButtons();

/* =============================================================================
   Home Hero — 首頁問候 / 調色盤狀態 / 雙動作卡 / 最近收藏 rail / 小知識
   ============================================================================= */

const heroGreeting   = document.getElementById('heroGreeting');
const heroSub        = document.getElementById('heroSub');
const paletteCard    = document.getElementById('paletteCard');
const actionImageBtn = document.getElementById('actionImageBtn');
const actionHexBtn   = document.getElementById('actionHexBtn');
const pickerSection  = document.getElementById('pickerSection');
const recentRail     = document.getElementById('recentRail');
const recentMore     = document.getElementById('recentMore');
const tipCard        = document.getElementById('tipCard');
const tipText        = document.getElementById('tipText');

const TIPS = [
  '同一次調色從頭到尾用同一個工具量，比例才會準。電子秤 ＞ 牙籤 ＞ 滴。',
  '黑色一點點就會壓過其他色 — Carbon Black 染色力是一般顏料的 2-3 倍，App 已預設 ×3.0 補償。',
  'iPhone 校色準（ΔE < 1），但一般筆電 / Android 螢幕常有 3-8 的色差，固定光源較重要。',
  'UV / LED 固化後永遠比生膠深一點點 — 把預估色當下限參考，實際塗了再微調。',
  'Mixbox 是「顏料混合」不是 RGB 平均：紅+黃在 RGB 平均下會偏髒橘，用 Mixbox 才是鮮亮橙。',
  '配方調出 70% 像就靠近了，剩下靠眼睛微調 — 這個 App 是「起手式」不是「最終答案」。',
  '收藏配方時加一張成品照，下次回頭看比 ΔE 數字更準。',
];

let _tipIndex = 0;

function getDisplayName() {
  // 不存私資料；簡單問候用，未登入就用通用詞
  return '今天';
}
function timeOfDayHello() {
  const h = new Date().getHours();
  if (h < 5)  return '夜深了';
  if (h < 11) return '早安';
  if (h < 14) return '午安';
  if (h < 18) return '下午好';
  if (h < 22) return '晚安';
  return '夜深了';
}

function renderHero() {
  // 只在 mix view 顯示時刷新（switchView('mix') 會呼叫）
  if (heroGreeting) {
    heroGreeting.innerHTML = `${escapeHtml(timeOfDayHello())} <span class="wave">✨</span>`;
  }
  if (heroSub) {
    heroSub.textContent = '今天想調什麼顏色？';
  }
  renderPaletteCard();
  renderRecentRail();
  renderTipCard();
}

function renderPaletteCard() {
  if (!paletteCard) return;
  const N = BASES.length;
  const SHOW_MAX = 5;
  const swatches = BASES.slice(0, SHOW_MAX).map(b =>
    `<div class="swatch" style="background:${b.hex}" title="${escapeHtml(b.name)}"></div>`
  ).join('');
  const more = N > SHOW_MAX ? `<div class="more">+${N - SHOW_MAX}</div>` : '';
  const status = N >= MIN_BASES_OK
    ? `<span class="status-dot ok"></span>${N} 個基底色 · 可開始調色`
    : `<span class="status-dot warn"></span>${N} 個基底色 · 建議至少 ${MIN_BASES_OK} 個`;
  const names = BASES.slice(0, SHOW_MAX).map(b => b.name).join(' ');
  paletteCard.innerHTML = `
    <div class="palette-stack">${swatches}${more}</div>
    <div class="palette-info">
      <div class="title">我的調色盤</div>
      <div class="meta">${status}</div>
      ${names ? `<div class="meta" style="margin-top:2px;">${escapeHtml(names)}</div>` : ''}
    </div>
    <svg class="palette-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="m9 18 6-6-6-6"/></svg>
  `;
}

paletteCard && paletteCard.addEventListener('click', () => switchView('bases'));

function renderRecentRail() {
  if (!recentRail) return;
  const items = SAVED.slice(0, 6);
  if (items.length === 0) {
    recentRail.innerHTML = `<div class="rail-empty">還沒收藏配方 — 調出滿意的顏色後按「收藏配方」</div>`;
    if (recentMore) recentMore.style.display = 'none';
    return;
  }
  if (recentMore) recentMore.style.display = '';
  recentRail.innerHTML = items.map(r => `
    <div class="rail-item" data-id="${r.id}">
      <div class="pair">
        <div style="background:${r.targetHex}"></div>
        <div style="background:${r.predictedHex}"></div>
      </div>
      <div class="name">${escapeHtml(r.name || r.targetHex)}</div>
      <div class="meta">ΔE ${r.deltaE.toFixed(1)}</div>
    </div>
  `).join('');
}

recentRail && recentRail.addEventListener('click', (e) => {
  const item = e.target.closest('.rail-item');
  if (!item) return;
  // 切到收藏分頁，再打開 detail
  switchView('record');
  setTimeout(() => openDetail(item.dataset.id), 50);
});

recentMore && recentMore.addEventListener('click', () => switchView('record'));

function renderTipCard() {
  if (!tipText) return;
  tipText.textContent = TIPS[_tipIndex % TIPS.length];
}

tipCard && tipCard.addEventListener('click', () => {
  _tipIndex = (_tipIndex + 1) % TIPS.length;
  renderTipCard();
});

/* ---------- Action cards：從圖片取色 / 輸入色號 ---------- */

function setActionActive(name) {
  if (actionImageBtn) actionImageBtn.classList.toggle('active', name === 'image');
  if (actionHexBtn)   actionHexBtn.classList.toggle('active', name === 'hex');
}

function openPicker(focus) {
  // focus: 'image' | 'hex' | 'result'（後者用於 remix 的捷徑，只展開不切模式）
  if (pickerSection) pickerSection.hidden = false;
  if (focus === 'image') setActionActive('image');
}

actionImageBtn && actionImageBtn.addEventListener('click', () => {
  openPicker('image');
  // 直接觸發檔案選擇
  fileInput.click();
});

/* ---------- 從靈感選圖 → 載入 mix canvas ---------- */
function loadBlobIntoMixCanvas(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    currentImage = img;
    drawImage(img, canvas, ctx, canvasWrap);
    canvasWrap.classList.add('has-image');
    hint.style.display = 'block';
    crosshair.classList.remove('show');
    if (typeof resetZoom === 'function') resetZoom();
    if (zoomControls) zoomControls.hidden = false;
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('圖片載入失敗'); };
  img.src = url;
}

const actionInspireBtn = document.getElementById('actionInspireBtn');
actionInspireBtn && actionInspireBtn.addEventListener('click', () => {
  openPicker('image');
  setActionActive('image');
  InspirePicker.open((blob) => {
    loadBlobIntoMixCanvas(blob);
    // 滾到 picker section 讓使用者看到圖
    setTimeout(() => {
      pickerSection && pickerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  });
});

actionHexBtn && actionHexBtn.addEventListener('click', () => {
  setActionActive('hex');
  openHexModal();
});

/* ---------- Hex 輸入 mini-modal ---------- */
const hexModal      = document.getElementById('hexModal');
const hexModalClose = document.getElementById('hexModalClose');
const hexModalCancel= document.getElementById('hexModalCancel');
const hexModalGo    = document.getElementById('hexModalGo');
const hexModalInput = document.getElementById('hexModalInput');
const hexModalSwatch= document.getElementById('hexModalSwatch');
const hexModalPreviewHex = document.getElementById('hexModalPreviewHex');

function openHexModal() {
  if (!hexModal) return;
  hexModalInput.value = '';
  updateHexPreview('');
  hexModal.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => hexModalInput.focus(), 50);
}
function closeHexModal() {
  if (!hexModal) return;
  hexModal.hidden = true;
  document.body.style.overflow = '';
}
function updateHexPreview(v) {
  if (!hexModalSwatch || !hexModalPreviewHex) return;
  if (isValidHex(v)) {
    const hex = normalizeHex(v);
    hexModalSwatch.style.background = hex;
    hexModalPreviewHex.textContent = hex;
    hexModalGo.disabled = false;
  } else {
    hexModalSwatch.style.background = 'var(--bg)';
    hexModalPreviewHex.textContent = '#------';
    hexModalGo.disabled = true;
  }
}
function submitHex() {
  const v = hexModalInput.value.trim();
  if (!isValidHex(v)) return;
  const rgb = hexToRgb(normalizeHex(v));
  closeHexModal();
  openPicker('result');
  onPickTarget(rgb);
  setTimeout(() => {
    const card = document.getElementById('resultCard');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}
hexModalClose  && hexModalClose .addEventListener('click', closeHexModal);
hexModalCancel && hexModalCancel.addEventListener('click', closeHexModal);
hexModalGo     && hexModalGo    .addEventListener('click', submitHex);
hexModal       && hexModal      .addEventListener('click', (e) => { if (e.target === hexModal) closeHexModal(); });
hexModalInput  && hexModalInput .addEventListener('input', () => updateHexPreview(hexModalInput.value));
hexModalInput  && hexModalInput .addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !hexModalGo.disabled) submitHex();
});

/* ========== Init ========== */
BASES = loadBases();
rebuildLatents();
SAVED = loadSaved();
if (typeof bindMeView === 'function') bindMeView();
if (typeof bindCalibration === 'function') bindCalibration();
if (window.AppMode && AppMode.init) AppMode.init();
switchView('mix');
