/* =============================================================================
   img-utils.js — 圖片處理共用工具
   - 從 File 產生原圖 + 縮圖兩個 Blob(JPEG)
   - Blob ↔ ObjectURL 管理
   ============================================================================= */
(function () {
  const MAX_FULL = 1280;   // 原圖最長邊
  const MAX_THUMB = 320;   // 縮圖最長邊
  const QUALITY_FULL = 0.85;
  const QUALITY_THUMB = 0.78;

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image decode failed'));
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function drawScaled(img, maxDim) {
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(w0, h0));
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')),
        type, quality
      );
    });
  }

  /**
   * 從 File 產生 { fullBlob, thumbBlob, width, height }
   */
  async function processFile(file) {
    if (!file || !/^image\//.test(file.type)) {
      throw new Error('not an image');
    }
    const img = await loadImage(file);
    const fullCanvas = drawScaled(img, MAX_FULL);
    const thumbCanvas = drawScaled(img, MAX_THUMB);
    const [fullBlob, thumbBlob] = await Promise.all([
      canvasToBlob(fullCanvas, 'image/jpeg', QUALITY_FULL),
      canvasToBlob(thumbCanvas, 'image/jpeg', QUALITY_THUMB),
    ]);
    return {
      fullBlob,
      thumbBlob,
      width: fullCanvas.width,
      height: fullCanvas.height,
    };
  }

  /* ---------- ObjectURL 管理 ---------- */
  const _urlCache = new WeakMap(); // blob → url
  function urlFor(blob) {
    if (!blob) return '';
    let url = _urlCache.get(blob);
    if (!url) {
      url = URL.createObjectURL(blob);
      _urlCache.set(blob, url);
    }
    return url;
  }
  function revoke(blob) {
    const url = _urlCache.get(blob);
    if (url) {
      URL.revokeObjectURL(url);
      _urlCache.delete(blob);
    }
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0, v = bytes;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(v < 10 && i > 0 ? 1 : 0) + ' ' + u[i];
  }

  window.ImgUtils = { processFile, urlFor, revoke, formatBytes, MAX_FULL, MAX_THUMB };
})();
