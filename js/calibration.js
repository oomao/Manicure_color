/* =============================================================================
   calibration.js — 色彩校正(MVP / Phase 9 簡化版)
   - 6 個色塊(白/灰/黑/紅/綠/藍)
   - 使用者拍照 → 手動點選 6 個色塊位置 → 算 3x3 矩陣 + offset
   - 儲存至 localStorage,之後所有從圖片取色都會先校正
   ============================================================================= */
(function () {
  const KEY = 'nail-mixer-calibration';

  // 6 個參考色(sRGB):這是「應該的答案」
  const TARGETS = [
    { key: 'white',  name: '白', rgb: [240, 240, 240] },
    { key: 'gray',   name: '灰', rgb: [128, 128, 128] },
    { key: 'black',  name: '黑', rgb: [ 30,  30,  30] },
    { key: 'red',    name: '紅', rgb: [200,  50,  50] },
    { key: 'green',  name: '綠', rgb: [ 50, 170,  70] },
    { key: 'blue',   name: '藍', rgb: [ 50,  80, 180] },
  ];

  /* ---------- 線性最小二乘 ---------- */
  // 解 X·w ≈ y (least squares),X 是 N×4,y 是 N
  function solveLeastSquares(X, y) {
    const n = X.length;
    const N = 4;
    const XtX = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
    const Xty = [0,0,0,0];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < N; j++) {
        Xty[j] += X[i][j] * y[i];
        for (let k = 0; k < N; k++) XtX[j][k] += X[i][j] * X[i][k];
      }
    }
    // Gauss-Jordan elimination on [XtX | Xty]
    const A = XtX.map((row, i) => row.concat([Xty[i]]));
    for (let i = 0; i < N; i++) {
      let max = Math.abs(A[i][i]); let maxRow = i;
      for (let k = i + 1; k < N; k++) {
        if (Math.abs(A[k][i]) > max) { max = Math.abs(A[k][i]); maxRow = k; }
      }
      if (max < 1e-10) return null;
      [A[i], A[maxRow]] = [A[maxRow], A[i]];
      for (let k = i + 1; k < N; k++) {
        const factor = A[k][i] / A[i][i];
        for (let j = i; j <= N; j++) A[k][j] -= factor * A[i][j];
      }
    }
    const w = new Array(N);
    for (let i = N - 1; i >= 0; i--) {
      let sum = A[i][N];
      for (let j = i + 1; j < N; j++) sum -= A[i][j] * w[j];
      w[i] = sum / A[i][i];
    }
    return w;
  }

  /* ---------- 主要 API ---------- */
  /**
   * 由 6 組(measured RGB, target RGB)算出 3x3 矩陣 + offset
   */
  function computeCalibration(measured) {
    if (!Array.isArray(measured) || measured.length < 4) return null;
    const X = measured.map(rgb => [rgb[0], rgb[1], rgb[2], 1]);
    const yR = TARGETS.map(t => t.rgb[0]);
    const yG = TARGETS.map(t => t.rgb[1]);
    const yB = TARGETS.map(t => t.rgb[2]);
    const wR = solveLeastSquares(X, yR);
    const wG = solveLeastSquares(X, yG);
    const wB = solveLeastSquares(X, yB);
    if (!wR || !wG || !wB) return null;
    return {
      enabled: true,
      matrix: [[wR[0], wR[1], wR[2]], [wG[0], wG[1], wG[2]], [wB[0], wB[1], wB[2]]],
      offset: [wR[3], wG[3], wB[3]],
      createdAt: Date.now(),
    };
  }

  function clamp255(v) { if (!isFinite(v)) v = 0; return Math.max(0, Math.min(255, Math.round(v))); }

  function applyToRgb(rgb, cal) {
    if (!cal || !cal.enabled) return rgb.slice();
    const M = cal.matrix, o = cal.offset;
    const r = rgb[0], g = rgb[1], b = rgb[2];
    return [
      clamp255(M[0][0]*r + M[0][1]*g + M[0][2]*b + o[0]),
      clamp255(M[1][0]*r + M[1][1]*g + M[1][2]*b + o[1]),
      clamp255(M[2][0]*r + M[2][1]*g + M[2][2]*b + o[2]),
    ];
  }

  function applyToImageData(imageData, cal) {
    if (!cal || !cal.enabled) return;
    const M = cal.matrix, o = cal.offset;
    const m00=M[0][0],m01=M[0][1],m02=M[0][2],o0=o[0];
    const m10=M[1][0],m11=M[1][1],m12=M[1][2],o1=o[1];
    const m20=M[2][0],m21=M[2][1],m22=M[2][2],o2=o[2];
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      d[i]   = clamp255(m00*r + m01*g + m02*b + o0);
      d[i+1] = clamp255(m10*r + m11*g + m12*b + o1);
      d[i+2] = clamp255(m20*r + m21*g + m22*b + o2);
    }
  }

  /* ---------- 儲存 ---------- */
  let _cached = null;
  function load() {
    if (_cached) return _cached;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj.matrix || !obj.offset) return null;
      _cached = obj;
      return obj;
    } catch (_) { return null; }
  }
  function save(cal) {
    _cached = cal;
    if (!cal) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(cal));
  }
  function get()      { return load(); }
  function isEnabled() { const c = load(); return !!(c && c.enabled); }
  function setEnabled(v) {
    const c = load();
    if (!c) return;
    c.enabled = !!v;
    save(c);
  }
  function clear() { save(null); }

  /* ---------- 產生參考卡(canvas → dataURL,可下載) ---------- */
  function drawReferenceCard(canvas) {
    const W = 600, H = 420;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    // 紙底
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    // 邊框
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    // 標題
    ctx.fillStyle = '#000';
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('美甲調色 — 色彩校正卡', W / 2, 38);
    ctx.font = '14px -apple-system, sans-serif';
    ctx.fillStyle = '#555';
    ctx.fillText('Print me & place beside the gel when taking a photo', W / 2, 60);

    // 4 角定位方塊
    const cs = 24;
    [[12, 12], [W-12-cs, 12], [12, H-12-cs], [W-12-cs, H-12-cs]].forEach(([x,y]) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, cs, cs);
    });

    // 6 個色塊(2 列 3 欄)
    const patchW = 150, patchH = 110;
    const startX = (W - patchW * 3) / 2;
    const startY = 100;
    const gap = 10;
    TARGETS.forEach((t, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = startX + col * (patchW + gap);
      const y = startY + row * (patchH + 40 + gap);
      // 色塊
      ctx.fillStyle = `rgb(${t.rgb.join(',')})`;
      ctx.fillRect(x, y, patchW, patchH);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, patchW, patchH);
      // 名稱
      ctx.fillStyle = '#000';
      ctx.font = 'bold 18px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.name, x + patchW / 2, y + patchH + 22);
      // hex
      ctx.font = '11px monospace';
      ctx.fillStyle = '#666';
      const hex = '#' + t.rgb.map(v => v.toString(16).padStart(2,'0')).join('').toUpperCase();
      ctx.fillText(hex, x + patchW / 2, y + patchH + 36);
    });
  }

  function getReferenceDataUrl() {
    const c = document.createElement('canvas');
    drawReferenceCard(c);
    return c.toDataURL('image/png');
  }

  window.Calibration = {
    TARGETS,
    computeCalibration,
    applyToRgb, applyToImageData,
    get, isEnabled, setEnabled, clear, save,
    drawReferenceCard, getReferenceDataUrl,
  };
})();
