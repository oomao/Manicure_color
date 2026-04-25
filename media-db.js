/* =============================================================================
   media-db.js — IndexedDB 薄封裝
   - 資料庫:nail-mixer-media
   - 三個 store:materials / galleryImages / categoryDefs
   - 對外暴露 window.MediaDB
   ============================================================================= */
(function () {
  const DB_NAME = 'nail-mixer-media';
  const DB_VERSION = 1;

  const STORE_MAT = 'materials';
  const STORE_GAL = 'galleryImages';
  const STORE_DEF = 'categoryDefs';

  let _db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        return reject(new Error('IndexedDB not supported'));
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_MAT)) {
          const s = db.createObjectStore(STORE_MAT, { keyPath: 'id' });
          s.createIndex('by-category', 'category', { unique: false });
          s.createIndex('by-updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_GAL)) {
          const s = db.createObjectStore(STORE_GAL, { keyPath: 'id' });
          s.createIndex('by-colorFamily', 'colorFamily', { unique: false });
          s.createIndex('by-updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_DEF)) {
          db.createObjectStore(STORE_DEF, { keyPath: 'key' });
        }
      };
    });
  }

  async function init() {
    if (_db) return _db;
    _db = await openDB();
    // 嘗試請求持久化儲存(失敗也沒關係)
    if (navigator.storage && navigator.storage.persist) {
      try { await navigator.storage.persist(); } catch (_) {}
    }
    return _db;
  }

  function tx(storeName, mode = 'readonly') {
    if (!_db) throw new Error('DB not initialized — call MediaDB.init() first');
    return _db.transaction(storeName, mode).objectStore(storeName);
  }

  function reqAsPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /* ---------- 通用 CRUD ---------- */
  async function add(storeName, record) {
    return reqAsPromise(tx(storeName, 'readwrite').add(record));
  }
  async function put(storeName, record) {
    return reqAsPromise(tx(storeName, 'readwrite').put(record));
  }
  async function get(storeName, id) {
    return reqAsPromise(tx(storeName).get(id));
  }
  async function del(storeName, id) {
    return reqAsPromise(tx(storeName, 'readwrite').delete(id));
  }
  async function getAll(storeName) {
    return reqAsPromise(tx(storeName).getAll());
  }
  async function count(storeName) {
    return reqAsPromise(tx(storeName).count());
  }

  /* ---------- 分類定義(輕量 KV) ---------- */
  function dedupeArr(arr) {
    const seen = new Set();
    return arr.filter(v => {
      const k = (typeof v === 'string') ? v.trim() : v;
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  async function getCategoryDef(key, defaults) {
    const rec = await get(STORE_DEF, key);
    if (rec && Array.isArray(rec.values)) {
      const cleaned = dedupeArr(rec.values);
      if (cleaned.length !== rec.values.length) {
        await put(STORE_DEF, { key, values: cleaned });
      }
      return cleaned;
    }
    if (defaults) {
      const cleaned = dedupeArr(defaults);
      await put(STORE_DEF, { key, values: cleaned });
      return cleaned.slice();
    }
    return [];
  }
  async function setCategoryDef(key, values) {
    const cleaned = dedupeArr(values);
    return put(STORE_DEF, { key, values: cleaned });
  }

  /* ---------- 容量估算 ---------- */
  async function storageEstimate() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
      const e = await navigator.storage.estimate();
      return { usage: e.usage || 0, quota: e.quota || 0 };
    } catch (_) {
      return null;
    }
  }

  /* ---------- ID ---------- */
  function genId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  window.MediaDB = {
    init,
    STORE_MAT, STORE_GAL, STORE_DEF,
    add, put, get, del, getAll, count,
    getCategoryDef, setCategoryDef,
    storageEstimate,
    genId,
  };
})();
