import { saveToDatabase, pushSingleRowToDatabase, startAutoSyncLoop, scheduleAutoPush, pullDataFromGoogleSheets, cleanAndRepairAllSheets } from './saveToDatabase';
import { safeJsonParse } from './security';

export const SYNC_KEYS = {
  PROJECTS: 'rgc_projects',
  MASTERS: 'rgc_masters',
  PROFILES: 'rgc_profiles',
  PAYMENTS: 'rgc_payments',
  LEDGERS: 'rgc_ledgers',
  GRN: 'rgc_grn_entries',
  PNL: 'rgc_pnl_matrix',
  AUDITS: 'rgc_purchase_audits'
};

// Table mapping helpers between local keys and backend database tables
export const getTableName = (key) => {
  if (key === SYNC_KEYS.MASTERS) return 'masters';
  return key.replace('rgc_', '');
};

export const getKeyFromTable = (tableName) => {
  if (tableName === 'projects') return SYNC_KEYS.PROJECTS;
  if (tableName === 'masters' || tableName === 'dynamic_masters') return SYNC_KEYS.MASTERS;
  if (tableName === 'profiles') return SYNC_KEYS.PROFILES;
  if (tableName === 'payments') return SYNC_KEYS.PAYMENTS;
  if (tableName === 'ledgers') return SYNC_KEYS.LEDGERS;
  if (tableName === 'grn_entries' || tableName === 'grn') return SYNC_KEYS.GRN;
  if (tableName === 'pnl_matrix' || tableName === 'pnl') return SYNC_KEYS.PNL;
  if (tableName === 'purchase_audits' || tableName === 'audits') return SYNC_KEYS.AUDITS;
  return `rgc_${tableName}`;
};

// Local Set to track GRN entries logged in this local browser session
const locallyCreatedGrnIds = new Set();

export const markGrnAsLocallyCreated = (id) => {
  if (!id) return;
  locallyCreatedGrnIds.add(id);
  setTimeout(() => {
    locallyCreatedGrnIds.delete(id);
  }, 120000);
};

export const isGrnLocallyCreated = (id) => {
  return locallyCreatedGrnIds.has(id);
};

export const broadcastGrnRealtime = (grnPayload) => {
  if (typeof window === 'undefined') return;
  if (grnPayload && grnPayload.id) {
    markGrnAsLocallyCreated(grnPayload.id);
  }
  if ('BroadcastChannel' in window) {
    try {
      const bc = new BroadcastChannel('rgc_grn_realtime_channel');
      bc.postMessage({ type: 'NEW_GRN', payload: grnPayload });
      bc.close();
    } catch (e) {
      // Ignore broadcast errors
    }
  }
};

// Dispatch global sync event to notify all React components across dashboards
export const notifyDataSync = (keyName) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rgc_data_sync', { detail: { key: keyName } }));
    window.dispatchEvent(new Event('storage'));
  }
};

// Default seed data fallback (Clean slate)
export const getInitialData = () => {
  return [];
};

export const clearAllStorageData = () => {
  if (typeof window === "undefined") return;
  Object.values(SYNC_KEYS).forEach((k) => {
    localStorage.removeItem(k);
    localStorage.setItem(k, JSON.stringify([]));
    notifyDataSync(k);

    // Also clear on central server
    fetch(`/api/sync/replace-key/${k}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [] })
    }).catch(() => {});
  });
  localStorage.removeItem("rgc_current_user");
};

export const fetchStorageData = (key) => {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(key);
  if (!raw) {
    const initial = getInitialData(key);
    localStorage.setItem(key, JSON.stringify(initial));
    return initial;
  }
  const parsed = safeJsonParse(raw, []);
  if (!Array.isArray(parsed)) return [];
  const seenIds = new Set();
  const deduped = [];
  for (const item of parsed) {
    if (!item) continue;
    // Discard any soft-deleted records
    const isDeleted = String(item.Is_Deleted || item.is_deleted || item.isDeleted || '').trim().toUpperCase();
    if (isDeleted === 'TRUE' || item.Is_Deleted === true || item.is_deleted === true) {
      continue;
    }
    const id = item.Record_ID || item.record_id || item.id;
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
    }
    deduped.push(item);
  }
  return deduped;
};

// Save single new record locally and push ONLY this new single row to Google Sheets without replication
export const appendSingleRecord = (key, newRecord) => {
  if (typeof window === 'undefined' || !newRecord) return;
  const current = fetchStorageData(key);
  
  // Inject guaranteed unique UUID and initial active soft-delete state if not already set
  const cleanRecord = {
    Record_ID: newRecord.Record_ID || newRecord.record_id || newRecord.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
    Is_Deleted: 'FALSE',
    ...newRecord
  };
  
  const recordId = cleanRecord.Record_ID || cleanRecord.id || cleanRecord.ID || cleanRecord.grnNumber || cleanRecord.voucherNo;
  
  // Deduplicate in local state array
  const filtered = current.filter(r => r && (r.Record_ID !== recordId && r.id !== recordId && r.grnNumber !== recordId && r.voucherNo !== recordId));
  const updated = [cleanRecord, ...filtered];
  
  localStorage.setItem(key, JSON.stringify(updated));
  notifyDataSync(key);

  // 1. Sync updated state to central server store
  fetch(`/api/sync/key/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: updated })
  }).catch(() => {});

  // 2. Push ONLY the single new record as a single row to Google Sheets
  const tableName = getTableName(key);
  pushSingleRowToDatabase(tableName, cleanRecord).catch((err) => {
    console.warn(`[Google Sheets Single Row Sync Error] ${tableName}:`, err);
  });

  // 3. Schedule auto-push for full consistency
  scheduleAutoPush(1500);

  return updated;
};

// Save data locally and push directly to central server & Google Sheets Web App
export const saveStorageData = (key, data) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  notifyDataSync(key);

  // 1. Sync directly with central enterprise server endpoint for instant multi-device reflection
  if (Array.isArray(data)) {
    fetch(`/api/sync/key/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data })
    })
      .then(res => res.json())
      .then(resData => {
        if (resData && resData.lastModified) {
          lastServerModifiedTime = resData.lastModified;
        }
      })
      .catch(err => {
        console.warn(`[Central Sync Note] ${key}:`, err);
      });
  }

  // 2. Direct route to Google Sheets Database via saveToDatabase
  const tableName = getTableName(key);
  if (data) {
    saveToDatabase(tableName, data).catch((err) => {
      console.warn(`[Google Sheets Database Sync] ${tableName}:`, err);
    });
  }

  // 3. Trigger debounced full auto-push to Google Sheets
  scheduleAutoPush(1500);
};

export const deleteStorageRecord = (key, recordId) => {
  if (typeof window === 'undefined') return;
  const current = fetchStorageData(key);
  const targetIdStr = String(recordId).trim();
  const updated = current.filter(r => {
    if (!r) return false;
    const rId = String(r.id || r.ID || r.Record_ID || r.record_id || r.grnNumber || r.voucherNo || r.payId || r.paymentId || r.code || '').trim();
    return rId !== targetIdStr &&
      String(r.id || '') !== targetIdStr &&
      String(r.grnNumber || '') !== targetIdStr &&
      String(r.voucherNo || '') !== targetIdStr &&
      String(r.payId || '') !== targetIdStr &&
      String(r.paymentId || '') !== targetIdStr &&
      String(r.code || '') !== targetIdStr;
  });
  localStorage.setItem(key, JSON.stringify(updated));
  notifyDataSync(key);

  const tableName = getTableName(key);

  // 1. Direct row deletion in Google Sheets
  fetch('/api/delete-row', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: tableName, recordId: targetIdStr })
  }).catch(() => {});

  // 2. Send delete command to central server to update memory and disk
  fetch('/api/sync/delete-record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, recordId: targetIdStr })
  })
    .then(res => res.json())
    .then(resData => {
      if (resData && resData.lastModified) {
        lastServerModifiedTime = resData.lastModified;
      }
    })
    .catch(() => {});

  // 3. Mirror updated clean table to Google Sheets Database
  fetch('/api/replace-table', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table: tableName,
      data: updated
    })
  }).catch(() => {});
};

// Central multi-device sync tracker
let lastServerModifiedTime = 0;
let isSyncingActive = false;
let pollTimer = null;

export const syncAllFromCloud = async () => {
  try {
    const res = await fetch('/api/sync/all');
    if (!res.ok) return;

    const result = await res.json();
    if (!result || !result.data) return;

    const serverDataStore = result.data;
    if (result.lastModified) {
      lastServerModifiedTime = result.lastModified;
    }

    Object.keys(SYNC_KEYS).forEach((k) => {
      const keyName = SYNC_KEYS[k];
      const serverRecords = Array.isArray(serverDataStore[keyName]) ? serverDataStore[keyName] : [];
      localStorage.setItem(keyName, JSON.stringify(serverRecords));
      notifyDataSync(keyName);
    });
  } catch (err) {
    console.warn('[Sync Error] Central store fetch note:', err);
  }
};

// Backward compatibility alias
export const syncAllFromCloudStore = async () => {
  return syncAllFromCloud();
};

export const initRealtimeSync = () => {
  if (typeof window === 'undefined' || isSyncingActive) return;
  isSyncingActive = true;

  console.log('🚀 Initializing Enterprise Realtime Multi-Device Google Sheets Sync Engine...');

  // 1. Start continuous 100% automated background push & pull loop
  startAutoSyncLoop();

  // 2. Initial full sync from server
  syncAllFromCloud();

  // 3. High-Frequency Status Polling (Checks every 4 seconds for changes made on other devices)
  if (!pollTimer) {
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch('/api/sync/status');
        if (res.ok) {
          const status = await res.json();
          if (status && status.lastModified && status.lastModified > lastServerModifiedTime) {
            console.log('⚡ Detected remote updates from another device! Syncing state...');
            await syncAllFromCloud();
          }
        }
      } catch (e) {
        // Network polling retry handled silently
      }
    }, 4000);
  }

  // 4. Tab Focus / Window Switch Event Listener (Instantly syncs when user switches back to app)
  if (typeof window !== 'undefined') {
    const handleFocusSync = () => {
      syncAllFromCloud();
    };
    window.addEventListener('focus', handleFocusSync);
    window.addEventListener('online', handleFocusSync);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleFocusSync();
      }
    });
  }
};

// Full dynamic backup engine completion block
export const performFullBackup = async () => {
  console.log('📦 Triggering cloud spreadsheet backup compilation...');
  const allData = {};
  Object.keys(SYNC_KEYS).forEach((k) => {
    const key = SYNC_KEYS[k];
    allData[key] = fetchStorageData(key);
  });

  let googleSheetsSynced = false;
  let syncMsg = '';

  try {
    const syncPromises = Object.entries(SYNC_KEYS).map(([k, keyName]) => {
      const records = allData[keyName];
      if (Array.isArray(records) && records.length > 0) {
        const tableName = getTableName(keyName);
        return saveToDatabase(tableName, records);
      }
      return Promise.resolve();
    });
    await Promise.all(syncPromises);
    googleSheetsSynced = true;
    syncMsg = 'All tables successfully backed up & synced to Google Sheets!';
  } catch (e) {
    console.error('Backup Engine Exception:', e);
    syncMsg = 'Google Sheets Sync note: ' + (e?.message || 'Unknown error');
  }

  // Trigger JSON file download in browser
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.setAttribute("download", `RGC_Construct_Backup_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      console.warn('Could not trigger automatic file download:', e);
    }
  }

  const recordCount = Object.values(allData).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);

  return {
    cloudSynced: googleSheetsSynced,
    cloudMsg: syncMsg,
    recordCount,
    timestamp: new Date().toLocaleString('en-IN')
  };
};

export const restoreFromBackup = (jsonData) => {
  if (!jsonData) return 0;
  let count = 0;

  // Unnest wrapper objects if present
  let targetObj = jsonData;
  if (jsonData.data && typeof jsonData.data === 'object' && !Array.isArray(jsonData.data)) {
    targetObj = jsonData.data;
  } else if (jsonData.dbStore && typeof jsonData.dbStore === 'object') {
    targetObj = jsonData.dbStore;
  } else if (jsonData.tables && typeof jsonData.tables === 'object') {
    targetObj = jsonData.tables;
  } else if (jsonData.store && typeof jsonData.store === 'object') {
    targetObj = jsonData.store;
  }

  // Iterate over all SYNC_KEYS
  Object.keys(SYNC_KEYS).forEach((k) => {
    const key = SYNC_KEYS[k];
    const cleanTableName = getTableName(key); // e.g. 'projects', 'masters', 'profiles'
    
    // Search with 'rgc_' prefix, without prefix, or alias
    let records = targetObj[key] || targetObj[cleanTableName] || targetObj[`rgc_${cleanTableName}`];
    
    if (cleanTableName === 'masters' && !records) {
      records = targetObj['dynamic_masters'] || targetObj['rgc_dynamic_masters'];
    }
    if (cleanTableName === 'grn_entries' && !records) {
      records = targetObj['grn'] || targetObj['rgc_grn'];
    }
    if (cleanTableName === 'pnl_matrix' && !records) {
      records = targetObj['pnl'] || targetObj['rgc_pnl'];
    }
    if (cleanTableName === 'purchase_audits' && !records) {
      records = targetObj['audits'] || targetObj['rgc_audits'];
    }

    if (records && Array.isArray(records) && records.length > 0) {
      saveStorageData(key, records);
      count += records.length;
    }
  });

  if (count > 0 && typeof window !== 'undefined') {
    Object.values(SYNC_KEYS).forEach(k => notifyDataSync(k));
    window.dispatchEvent(new Event('storage'));
  }

  return count;
};

// Complete Website & Server Data Reset Utility
export const clearAllWebsiteData = async ({ mode = 'transactions', clearSheets = true, appscriptUrl = '' } = {}) => {
  console.log(`🧹 Executing full data reset: mode=${mode}, clearSheets=${clearSheets}`);

  // 1. Wipe browser localStorage keys
  const transactionalKeys = [
    SYNC_KEYS.PAYMENTS,
    SYNC_KEYS.LEDGERS,
    SYNC_KEYS.GRN,
    SYNC_KEYS.PNL,
    SYNC_KEYS.AUDITS
  ];

  transactionalKeys.forEach((k) => {
    try {
      localStorage.setItem(k, JSON.stringify([]));
    } catch (_) {}
  });

  if (mode === 'factory') {
    [SYNC_KEYS.PROJECTS, SYNC_KEYS.MASTERS, SYNC_KEYS.PROFILES].forEach((k) => {
      try {
        localStorage.setItem(k, JSON.stringify([]));
      } catch (_) {}
    });
  }

  // 2. Call server endpoint to clear memory store & persistent disk storage
  let serverResult = null;
  try {
    const res = await fetch('/api/data/clear-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        clearSheets,
        appscriptUrl
      })
    });
    if (res.ok) {
      serverResult = await res.json();
    }
  } catch (err) {
    console.warn('Server clear-all note:', err);
  }

  // 3. If clearSheets is true, also push empty arrays to Google Sheets via direct clean call
  if (clearSheets) {
    try {
      await cleanAndRepairAllSheets(appscriptUrl);
    } catch (_) {}
  }

  // 4. Notify all components and tabs
  if (typeof window !== 'undefined') {
    Object.values(SYNC_KEYS).forEach((k) => notifyDataSync(k));
    window.dispatchEvent(new CustomEvent('rgc_data_sync', { detail: { cleared: true, mode } }));
    window.dispatchEvent(new Event('storage'));
  }

  return {
    success: true,
    message: mode === 'factory' 
      ? 'Factory reset completed. All website data & configurations cleared.'
      : 'All transactional records (Payments, GRNs, Ledgers, P&L) have been wiped clean.',
    serverResult
  };
};

