/* =============================================================================
   backup.js — 資料匯出 / 匯入(zip 格式)
   - 匯出範圍 scope:'all' | 'manicure' | 'beauty'
   - zip 結構:
       manifest.json
       localStorage.json
       indexeddb/{store}.json    每個 store 一個 JSON,blob 欄位被替換成
                                  "blob:xxx" reference
       blobs/{filename}           實際 Blob 檔案
   ============================================================================= */
(function () {
  if (typeof JSZip === 'undefined') {
    console.warn('JSZip 未載入,備份功能停用');
    return;
  }

  const STORES = ['materials', 'galleryImages', 'plans', 'works', 'categoryDefs'];
  const BLOB_FIELDS = ['blob', 'thumbBlob', 'photoBlob', 'photoThumbBlob', 'coverBlob', 'coverThumbBlob'];

  // localStorage 白名單(只匯出 app 用到的 key)
  function lsKeys(scope) {
    const all = [
      'nail-color-mixer.bases.v1',
      'nail-color-mixer.saved.v1',
      'nail-mixer-theme',
      'app-mode',
      'mat-categories-manicure',
      'mat-categories-beauty',
      'gal-colors-manicure',
      'gal-colors-beauty',
      'gal-styles-manicure',
      'gal-styles-beauty',
      'nail-mixer.calibration.v1',
    ];
    if (scope === 'all') return all;
    if (scope === 'manicure') return all.filter(k => !k.includes('beauty'));
    if (scope === 'beauty') return all.filter(k => !k.includes('manicure'));
    return all;
  }

  function modeOfItem(it) {
    if (!it) return 'manicure';
    return it.mode === 'beauty' ? 'beauty' : 'manicure';
  }

  // 哪些 store / 哪些 record 在這個 scope 要被帶走
  function shouldIncludeRecord(store, item, scope) {
    if (scope === 'all') return true;
    if (store === 'materials' || store === 'galleryImages') {
      return modeOfItem(item) === scope;
    }
    if (store === 'categoryDefs') {
      // key 形如 'mat-categories-manicure' / 'gal-styles-beauty'
      if (typeof item.key !== 'string') return scope === 'manicure';
      if (item.key.endsWith('-manicure')) return scope === 'manicure';
      if (item.key.endsWith('-beauty'))   return scope === 'beauty';
      return scope === 'manicure'; // 舊格式視為 manicure
    }
    // plans / works:目前不分模式,scope='all' 才帶
    return scope === 'all';
  }

  function safeFilename(s) {
    return String(s || 'unnamed').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  }

  function blobExt(blob) {
    if (!blob || !blob.type) return 'bin';
    if (blob.type.includes('jpeg') || blob.type.includes('jpg')) return 'jpg';
    if (blob.type.includes('png')) return 'png';
    if (blob.type.includes('webp')) return 'webp';
    if (blob.type.includes('gif')) return 'gif';
    return 'bin';
  }

  // 把一筆 record 中的 Blob 欄位抽出來放進 blobs folder,record 裡留 reference
  function extractBlobs(store, idx, record, blobsFolder) {
    const out = { ...record };
    const recordKey = record.id || record.key || `idx${idx}`;
    BLOB_FIELDS.forEach(field => {
      if (out[field] instanceof Blob) {
        const fname = `${store}/${safeFilename(recordKey)}-${field}.${blobExt(out[field])}`;
        blobsFolder.file(fname, out[field]);
        out[field] = `__blob__:${fname}`;
      }
    });
    if (Array.isArray(out.steps)) {
      out.steps = out.steps.map((s, si) => {
        const stepOut = { ...s };
        BLOB_FIELDS.forEach(field => {
          if (stepOut[field] instanceof Blob) {
            const fname = `${store}/${safeFilename(recordKey)}-step${si}-${field}.${blobExt(stepOut[field])}`;
            blobsFolder.file(fname, stepOut[field]);
            stepOut[field] = `__blob__:${fname}`;
          }
        });
        return stepOut;
      });
    }
    return out;
  }

  async function inflateBlobs(record, zip) {
    const out = { ...record };
    for (const field of BLOB_FIELDS) {
      if (typeof out[field] === 'string' && out[field].startsWith('__blob__:')) {
        const fname = out[field].slice('__blob__:'.length);
        const f = zip.file(`blobs/${fname}`);
        out[field] = f ? await f.async('blob') : null;
      }
    }
    if (Array.isArray(out.steps)) {
      for (let i = 0; i < out.steps.length; i++) {
        const s = { ...out.steps[i] };
        for (const field of BLOB_FIELDS) {
          if (typeof s[field] === 'string' && s[field].startsWith('__blob__:')) {
            const fname = s[field].slice('__blob__:'.length);
            const f = zip.file(`blobs/${fname}`);
            s[field] = f ? await f.async('blob') : null;
          }
        }
        out.steps[i] = s;
      }
    }
    return out;
  }

  /* ========== EXPORT ========== */
  async function exportAll(scope, onStatus) {
    const zip = new JSZip();
    const blobsFolder = zip.folder('blobs');
    onStatus && onStatus('打包中...');

    // localStorage
    const ls = {};
    lsKeys(scope).forEach(k => {
      const v = localStorage.getItem(k);
      if (v != null) ls[k] = v;
    });
    zip.file('localStorage.json', JSON.stringify(ls, null, 2));

    // IndexedDB
    let totalBlobs = 0;
    for (const store of STORES) {
      let items;
      try { items = await MediaDB.getAll(store); } catch (_) { items = []; }
      const filtered = items.filter(it => shouldIncludeRecord(store, it, scope));
      const cleaned = filtered.map((it, i) => {
        const before = JSON.stringify(it).length;
        const after = extractBlobs(store, i, it, blobsFolder);
        return after;
      });
      zip.file(`indexeddb/${store}.json`, JSON.stringify(cleaned, null, 2));
    }

    const manifest = {
      app: '美甲調色',
      version: 1,
      scope,
      exportedAt: new Date().toISOString(),
      stores: STORES,
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    onStatus && onStatus('壓縮中,大檔案會比較久...');
    const blob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      meta => onStatus && onStatus(`壓縮中... ${Math.round(meta.percent)}%`)
    );

    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const scopeName = scope === 'all' ? '全部' : (scope === 'beauty' ? '美妝' : '美甲');
    const fname = `美甲調色-${scopeName}備份-${ts}.zip`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
    onStatus && onStatus(`✓ 已下載 ${fname}(${(blob.size / 1024 / 1024).toFixed(1)} MB)`);
  }

  /* ========== IMPORT ========== */
  async function importAll(file, onStatus) {
    onStatus && onStatus('讀取 zip...');
    const zip = await JSZip.loadAsync(file);
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) throw new Error('找不到 manifest.json,這不是有效的備份檔');
    const manifest = JSON.parse(await manifestFile.async('string'));
    if (manifest.app !== '美甲調色') throw new Error('不是美甲調色 app 的備份');
    if (manifest.version !== 1) throw new Error('不支援的備份版本:' + manifest.version);

    const scopeLabel = manifest.scope === 'all' ? '全部' : (manifest.scope === 'beauty' ? '美妝' : '美甲');
    const ok = confirm(
      `備份內容:${scopeLabel}\n` +
      `匯出時間:${manifest.exportedAt}\n\n` +
      `匯入會把同 ID 的項目覆蓋,確定繼續?`
    );
    if (!ok) { onStatus && onStatus('已取消'); return false; }

    // localStorage
    const lsFile = zip.file('localStorage.json');
    if (lsFile) {
      const ls = JSON.parse(await lsFile.async('string'));
      Object.entries(ls).forEach(([k, v]) => {
        try { localStorage.setItem(k, v); } catch (_) {}
      });
    }

    // IndexedDB
    let imported = 0;
    for (const store of STORES) {
      const f = zip.file(`indexeddb/${store}.json`);
      if (!f) continue;
      const items = JSON.parse(await f.async('string'));
      onStatus && onStatus(`匯入 ${store} (${items.length} 筆)...`);
      for (const item of items) {
        const inflated = await inflateBlobs(item, zip);
        try { await MediaDB.put(store, inflated); imported++; } catch (e) { console.warn('put failed', store, item, e); }
      }
    }

    onStatus && onStatus(`✓ 匯入完成,共 ${imported} 筆。即將重新載入...`);
    setTimeout(() => location.reload(), 800);
    return true;
  }

  window.Backup = { exportAll, importAll };
})();
