const DB_NAME = 'trading_desk_dashboard_store';
const DB_VERSION = 1;
const STORE_KV = 'kv';

function openDashboardDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

export async function idbGet(key) {
  const db = await openDashboardDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, 'readonly');
    const req = tx.objectStore(STORE_KV).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB get failed'));
    tx.oncomplete = () => db.close();
  });
}

export async function idbSet(key, value) {
  const db = await openDashboardDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, 'readwrite');
    const req = tx.objectStore(STORE_KV).put(value, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error('IndexedDB put failed'));
    tx.oncomplete = () => db.close();
  });
}

export async function idbDelete(key) {
  const db = await openDashboardDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, 'readwrite');
    const req = tx.objectStore(STORE_KV).delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error('IndexedDB delete failed'));
    tx.oncomplete = () => db.close();
  });
}
