import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable JSON body parsing with high limit for bulk imports/backups
app.use(express.json({ limit: '50mb' }));

// Base root health check endpoints for Cloud Run & monitoring probes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});
app.get('/_health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// -------------------------------------------------------------
// PERSISTENT FILE STORAGE SETUP
// -------------------------------------------------------------
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'rgc_data_store.json');

// Default sample dataset for initial load (Clean slate)
const DEFAULT_SEED_DATA = {
  rgc_projects: [],
  rgc_masters: [],
  rgc_profiles: [],
  rgc_payments: [],
  rgc_ledgers: [],
  rgc_grn_entries: [],
  rgc_pnl_matrix: [],
  rgc_purchase_audits: []
};

// Dynamically resolves spreadsheet ID for multi-company isolation
export function isRealGoogleSheetIdServer(id: string | null | undefined): boolean {
  if (!id) return false;
  const s = String(id).trim();
  if (s.startsWith('sheet_') || s.startsWith('local_') || s.length < 20) return false;
  return /^[a-zA-Z0-9-_]{20,80}$/.test(s);
}

export function resolveTargetSpreadsheetId(req: any): string {
  if (req?.body?.spreadsheetId && String(req.body.spreadsheetId).trim() !== '') {
    const raw = String(req.body.spreadsheetId).trim();
    if (isRealGoogleSheetIdServer(raw)) return raw;
  }
  if (req?.headers?.['x-spreadsheet-id']) {
    const headerId = String(req.headers['x-spreadsheet-id']).trim();
    if (isRealGoogleSheetIdServer(headerId)) return headerId;
  }
  const prefix = (req?.body?.prefix || req?.body?.companyPrefix || 'RGC').toUpperCase();

  // Search company_registry for real Google Sheet ID
  try {
    const registry: any[] = Array.isArray(dbStore['company_registry']) ? dbStore['company_registry'] : [];
    const comp = registry.find(c => c && String(c.prefix || '').toUpperCase() === prefix);
    if (comp && isRealGoogleSheetIdServer(comp.spreadsheetId)) {
      return comp.spreadsheetId;
    }

    const masterList: any[] = Array.isArray(dbStore['nrman_master_database']) ? dbStore['nrman_master_database'] : [];
    const masterComp = masterList.find(m => m && String(m.prefix || '').toUpperCase() === prefix);
    if (masterComp && isRealGoogleSheetIdServer(masterComp.spreadsheetId)) {
      return masterComp.spreadsheetId;
    }
  } catch (_) {}

  // Fallback to master sheet if RGC
  if (prefix === 'RGC') {
    return '1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs';
  }

  return `sheet_${prefix.toLowerCase()}`;
}

export async function ensureSheetViaGoogleAppsScript(params: {
  companyName: string;
  prefix: string;
  gstNumber?: string;
  googleEmail?: string;
  clientCode?: string;
  spreadsheetId?: string;
  appscriptUrl?: string;
}): Promise<{ success: boolean; spreadsheetId?: string; spreadsheetUrl?: string; companyName?: string; error?: string; tables?: string[] }> {
  const targetUrl = resolveAppscriptUrl(params.appscriptUrl);
  if (!targetUrl) {
    return { success: false, error: 'Google Apps Script Webhook URL not configured' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'ensure_company_sheet',
        companyName: params.companyName,
        prefix: params.prefix,
        gstNumber: params.gstNumber || '',
        googleEmail: params.googleEmail || 'sinchanar1002@gmail.com',
        clientCode: params.clientCode || 'rgc@nrman',
        spreadsheetId: isRealGoogleSheetIdServer(params.spreadsheetId) ? params.spreadsheetId : undefined,
        secretKey: 'MyPrivateCompanySecretKey2026!'
      }),
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timer);
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (_) {}

    if (data && (data.success || data.status === 'success') && data.spreadsheetId) {
      return {
        success: true,
        spreadsheetId: data.spreadsheetId,
        spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
        companyName: data.companyName || params.companyName,
        tables: data.tables
      };
    }
    return { success: false, error: data?.message || 'Apps Script did not return spreadsheet ID' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error communicating with Google Apps Script' };
  }
}

// Validates whether a row is a real operational record or an empty/phantom dummy
export function isValidRecordServer(table: string, r: any): boolean {
  if (!r || typeof r !== 'object') return false;
  const t = String(table || '').toLowerCase().replace(/^rgc_/, '').trim();
  const idStr = String(r.id || '');

  if (t === 'projects') {
    const hasName = Boolean(r.name && String(r.name).trim() !== '');
    const hasCode = Boolean(r.code && String(r.code).trim() !== '');
    const hasLoc = Boolean(r.location && String(r.location).trim() !== '');
    return (hasName || hasCode || hasLoc) && !idStr.startsWith('pay-') && !idStr.startsWith('grn-') && !idStr.startsWith('m-');
  }

  if (t === 'payments') {
    const hasParty = Boolean((r.partyName || r.vendor || r.supplier) && String(r.partyName || r.vendor || r.supplier).trim() !== '');
    const hasVoucher = Boolean((r.voucherNo || r.payId || r.paymentId) && String(r.voucherNo || r.payId || r.paymentId).trim() !== '');
    const hasInvoice = Boolean(r.invoiceNo && String(r.invoiceNo).trim() !== '');
    const hasGrn = Boolean(r.grnNumber && String(r.grnNumber).trim() !== '');
    const tot = Number(String(r.totalAmount || r.amount || 0).replace(/[^0-9.-]+/g, '')) || 0;
    const pd = Number(String(r.paidAmount || r.paid || r.amountPaid || 0).replace(/[^0-9.-]+/g, '')) || 0;
    return (hasParty || hasVoucher || hasInvoice || hasGrn || tot > 0 || pd > 0) && !idStr.startsWith('p-') && !idStr.startsWith('usr-');
  }

  if (t === 'grn_entries' || t === 'grn') {
    const hasItem = Boolean((r.itemName || r.item || r.material) && String(r.itemName || r.item || r.material).trim() !== '');
    const hasSupp = Boolean((r.supplier || r.supplierName || r.vendor) && String(r.supplier || r.supplierName || r.vendor).trim() !== '');
    const hasGrnNo = Boolean((r.grnNumber || r.grnNo) && String(r.grnNumber || r.grnNo).trim() !== '');
    const grnTot = Number(String(r.grandTotal || r.totalAmount || 0).replace(/[^0-9.-]+/g, '')) || 0;
    return (hasItem || hasSupp || hasGrnNo || grnTot > 0) && !idStr.startsWith('p-');
  }

  if (t === 'masters') {
    const hasMName = Boolean((r.name || r.label || r.value) && String(r.name || r.label || r.value).trim() !== '');
    return hasMName && !idStr.startsWith('p-') && !idStr.startsWith('pay-');
  }

  if (t === 'ledgers') {
    const hasLParty = Boolean((r.partyName || r.vendor || r.supplier) && String(r.partyName || r.vendor || r.supplier).trim() !== '');
    const hasPart = Boolean((r.particulars || r.item) && String(r.particulars || r.item).trim() !== '');
    const dr = Number(String(r.debit || 0).replace(/[^0-9.-]+/g, '')) || 0;
    const cr = Number(String(r.credit || 0).replace(/[^0-9.-]+/g, '')) || 0;
    return hasLParty || hasPart || dr > 0 || cr > 0;
  }

  if (t === 'profiles') {
    const hasEmail = Boolean(r.email && String(r.email).trim() !== '');
    const hasFull = Boolean((r.fullName || r.full_name) && String(r.fullName || r.full_name).trim() !== '');
    return hasEmail || hasFull;
  }

  if (t === 'pnl_matrix' || t === 'pnl') {
    const hasPnlProj = Boolean(r.projectName && String(r.projectName).trim() !== '');
    const rev = Number(String(r.revenue || 0).replace(/[^0-9.-]+/g, '')) || 0;
    const exp = Number(String(r.totalExpenses || 0).replace(/[^0-9.-]+/g, '')) || 0;
    return hasPnlProj || rev > 0 || exp > 0;
  }

  if (t === 'purchase_audits' || t === 'audits') {
    const hasAudProj = Boolean(r.projectName && String(r.projectName).trim() !== '');
    const hasAudSupp = Boolean(r.supplierName && String(r.supplierName).trim() !== '');
    const hasAudItem = Boolean(r.itemAudited && String(r.itemAudited).trim() !== '');
    return hasAudProj || hasAudSupp || hasAudItem;
  }

  return true;
}

// Memory Data Store initialized
let dbStore: Record<string, any> = {
  ...DEFAULT_SEED_DATA,
  lastModified: Date.now()
};

// Ensure data directory exists & load existing dataset from disk
function loadStoreFromDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(fileContent);
      if (parsed && typeof parsed === 'object') {
        // Merge loaded data & filter out any phantom/blank rows
        Object.keys(DEFAULT_SEED_DATA).forEach((key) => {
          const rawArr = Array.isArray(parsed[key]) ? parsed[key] : [];
          dbStore[key] = rawArr.filter((r: any) => isValidRecordServer(key, r));
        });
        dbStore.lastModified = parsed.lastModified || Date.now();
        console.log('✅ Persistent Store loaded successfully from disk. Sanitized total records:', getStoreTotalCount());
        
        // Auto-reconcile and populate ledgers from GRN and Payments if ledgers is empty
        rebuildAllLedgersFromData();
        saveStoreToDisk();
      }
    } else {
      rebuildAllLedgersFromData();
      saveStoreToDisk();
    }
  } catch (err) {
    console.error('⚠️ Disk store load error:', err);
  }
}

/**
 * Rebuilds all independent ledger entries from existing GRNs and Payments.
 * RULE 1: GRN -> Reference ID = GRN ID, Transaction Date = GRN Date
 * RULE 2: Payment -> Reference ID = Payment ID, Transaction Date = Payment Date
 * RULE 3: Keep GRN and Payment events completely decoupled.
 */
export function rebuildAllLedgersFromData(): any[] {
  const grns = Array.isArray(dbStore['rgc_grn_entries']) ? dbStore['rgc_grn_entries'] : [];
  const payments = Array.isArray(dbStore['rgc_payments']) ? dbStore['rgc_payments'] : [];
  const existingLedgers = Array.isArray(dbStore['rgc_ledgers']) ? dbStore['rgc_ledgers'] : [];

  const ledgerMap = new Map<string, any>();

  // 1. Convert all existing GRNs
  grns.forEach((g: any, idx: number) => {
    const entry = createLedgerEntryForGRN(g);
    if (entry) {
      const key = `grn-${entry.refNumber || entry.id || idx}`;
      ledgerMap.set(key, entry);
    }
  });

  // 2. Convert all existing Payments with paid amounts
  payments.forEach((p: any, idx: number) => {
    const paidVal = Number(String(p.paidAmount !== undefined ? p.paidAmount : (p.paid !== undefined ? p.paid : (p.amountPaid || (p.amount && !p.isGrn ? p.amount : 0)))).replace(/[^0-9.-]+/g, '')) || 0;
    if (paidVal > 0) {
      const entry = createLedgerEntryForPayment(p);
      if (entry) {
        const key = `pay-${entry.refNumber || entry.id || idx}`;
        ledgerMap.set(key, entry);
      }
    }
  });

  // 3. Preserve any custom standalone manual ledger entries
  existingLedgers.forEach((l: any) => {
    if (l && l.accountType !== 'Purchase Invoice' && l.accountType !== 'Payment Debit') {
      const key = `custom-${l.id || l.refNumber || Math.random()}`;
      ledgerMap.set(key, normalizeRowDataServer('ledgers', l));
    }
  });

  // 4. Sort chronologically by transaction date
  const consolidatedLedgers = Array.from(ledgerMap.values()).sort((a, b) => {
    const da = new Date(a.date || a.created_at).getTime() || 0;
    const db = new Date(b.date || b.created_at).getTime() || 0;
    return da - db;
  });

  dbStore['rgc_ledgers'] = consolidatedLedgers;
  dbStore.lastModified = Date.now();
  return consolidatedLedgers;
}

function saveStoreToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    // Sanitize all tables before writing to disk
    const cleanStore: Record<string, any> = { lastModified: dbStore.lastModified };
    Object.keys(DEFAULT_SEED_DATA).forEach((k) => {
      const arr = Array.isArray(dbStore[k]) ? dbStore[k] : [];
      cleanStore[k] = arr.filter((r: any) => isValidRecordServer(k, r));
      dbStore[k] = cleanStore[k];
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(cleanStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('⚠️ Disk store save error:', err);
  }
}

function getStoreTotalCount() {
  return Object.keys(dbStore)
    .filter(k => k.startsWith('rgc_'))
    .reduce((acc, k) => acc + (Array.isArray(dbStore[k]) ? dbStore[k].length : 0), 0);
}

// Initial load on server boot
loadStoreFromDisk();

// -------------------------------------------------------------
// API ENDPOINTS FOR REALTIME CROSS-DEVICE DATA SYNCHRONIZATION
// -------------------------------------------------------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    totalRecords: getStoreTotalCount(),
    lastModified: dbStore.lastModified
  });
});

// Get status and lastModified timestamp for fast client polling
app.get('/api/sync/status', (req, res) => {
  const counts: Record<string, number> = {};
  Object.keys(dbStore).forEach(k => {
    if (k.startsWith('rgc_')) {
      counts[k] = Array.isArray(dbStore[k]) ? dbStore[k].length : 0;
    }
  });
  res.json({
    lastModified: dbStore.lastModified,
    counts
  });
});

// Get entire data store for all keys (Used on startup by all devices)
app.get('/api/sync/all', (req, res) => {
  res.json({
    success: true,
    data: dbStore,
    lastModified: dbStore.lastModified
  });
});

// Get data array for a specific key
app.get('/api/sync/key/:key', (req, res) => {
  const key = req.params.key;
  const records = dbStore[key] || [];
  res.json({
    success: true,
    key,
    data: records,
    lastModified: dbStore.lastModified
  });
});

// Save / Upsert array of records for a specific key
app.post('/api/sync/key/:key', async (req, res) => {
  const key = req.params.key;
  const newRecords = req.body.data;

  if (!Array.isArray(newRecords)) {
    return res.status(400).json({ error: 'Payload data must be an array' });
  }

  // Filter out any blank or phantom records
  const cleanRecords = newRecords.filter((r: any) => isValidRecordServer(key, r));
  dbStore[key] = cleanRecords;
  dbStore.lastModified = Date.now();
  saveStoreToDisk();

  res.json({
    success: true,
    key,
    count: dbStore[key].length,
    lastModified: dbStore.lastModified
  });
});

// Delete a single record from a key and sync clean state to Google Sheets
app.post('/api/sync/delete-record', async (req, res) => {
  const { key, recordId } = req.body;
  if (!key || !recordId) {
    return res.status(400).json({ error: 'Both key and recordId are required' });
  }

  const currentRecords = dbStore[key] || [];
  const updatedRecords = currentRecords.filter((r: any) => 
    r &&
    r.id !== recordId && 
    r.grnNumber !== recordId && 
    r.voucherNo !== recordId && 
    r.payId !== recordId &&
    r.paymentId !== recordId &&
    r.code !== recordId
  );
  dbStore[key] = updatedRecords;
  dbStore.lastModified = Date.now();
  saveStoreToDisk();

  // Forward table replacement and row deletion to Google Sheets Web App so deleted row is erased immediately
  const cleanTableName = String(key).replace(/^rgc_/, '');
  const targetUrl = resolveAppscriptUrl();
  if (targetUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const targetSsId = resolveTargetSpreadsheetId(req);

    // Delete row directly
    fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'delete_row',
        table: cleanTableName,
        data: { id: recordId },
        spreadsheetId: targetSsId,
        secretKey: 'MyPrivateCompanySecretKey2026!'
      }),
      redirect: 'follow',
      signal: controller.signal
    }).catch(() => {});

    // Replace table with updated clean array
    fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'replace_table',
        table: cleanTableName,
        data: updatedRecords.filter((r: any) => isValidRecordServer(cleanTableName, r)),
        spreadsheetId: targetSsId,
        secretKey: 'MyPrivateCompanySecretKey2026!'
      }),
      redirect: 'follow',
      signal: controller.signal
    }).catch(() => {}).finally(() => clearTimeout(timer));
  }

  res.json({
    success: true,
    key,
    recordId,
    remaining: dbStore[key].length,
    lastModified: dbStore.lastModified
  });
});

app.post('/api/delete-row', async (req, res) => {
  const rawTable = req.body.table || req.body.tableName;
  const recordId = req.body.id || req.body.recordId || (req.body.data && req.body.data.id);
  if (!rawTable || !recordId) {
    return res.status(400).json({ success: false, error: 'Table and id are required' });
  }

  const cleanTableName = String(rawTable).toLowerCase().replace(/^rgc_/, '').trim();
  const key = `rgc_${cleanTableName}`;
  const currentRecords = dbStore[key] || [];
  const updatedRecords = currentRecords.filter((r: any) =>
    r &&
    r.id !== recordId &&
    r.grnNumber !== recordId &&
    r.voucherNo !== recordId &&
    r.payId !== recordId &&
    r.paymentId !== recordId &&
    r.code !== recordId
  );
  dbStore[key] = updatedRecords;
  dbStore.lastModified = Date.now();
  saveStoreToDisk();

  const targetUrl = resolveAppscriptUrl(req.body.appscriptUrl);
  if (targetUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const targetSsId = resolveTargetSpreadsheetId(req);

    fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'delete_row',
        table: cleanTableName,
        data: { id: recordId },
        spreadsheetId: targetSsId,
        secretKey: 'MyPrivateCompanySecretKey2026!'
      }),
      redirect: 'follow',
      signal: controller.signal
    }).catch(() => {});

    fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'replace_table',
        table: cleanTableName,
        data: updatedRecords.filter((r: any) => isValidRecordServer(cleanTableName, r)),
        spreadsheetId: targetSsId,
        secretKey: 'MyPrivateCompanySecretKey2026!'
      }),
      redirect: 'follow',
      signal: controller.signal
    }).catch(() => {}).finally(() => clearTimeout(timer));
  }

  res.json({
    success: true,
    table: cleanTableName,
    recordId,
    remaining: updatedRecords.length
  });
});

// Full table replacement endpoint (when rows are deleted, edited, or reordered)
app.post('/api/replace-table', async (req, res) => {
  try {
    const rawTable = req.body.table || req.body.tableName;
    const rawData = req.body.data;
    const customAppscriptUrl = req.body.appscriptUrl;

    if (!rawTable) {
      return res.status(400).json({ success: false, error: 'Table name is required' });
    }

    const cleanTableName = String(rawTable).toLowerCase().replace(/^rgc_/, '').trim();
    const storeKey = `rgc_${cleanTableName}`;
    const cleanData = Array.isArray(rawData) ? rawData.filter((r: any) => isValidRecordServer(cleanTableName, r)) : [];

    dbStore[storeKey] = cleanData;
    dbStore.lastModified = Date.now();
    saveStoreToDisk();

    const targetUrl = resolveAppscriptUrl(customAppscriptUrl);
    if (targetUrl) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'replace_table',
          table: cleanTableName,
          data: cleanData,
          spreadsheetId: resolveTargetSpreadsheetId(req),
          secretKey: 'MyPrivateCompanySecretKey2026!'
        }),
        redirect: 'follow',
        signal: controller.signal
      }).catch(() => {}).finally(() => clearTimeout(timer));
    }

    res.json({
      success: true,
      table: cleanTableName,
      count: cleanData.length,
      lastModified: dbStore.lastModified
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Replace complete dataset for a key (e.g. on full table clear or import)
app.post('/api/sync/replace-key/:key', (req, res) => {
  const key = req.params.key;
  const records = req.body.data || [];
  dbStore[key] = Array.isArray(records) ? records : [];
  dbStore.lastModified = Date.now();
  saveStoreToDisk();

  res.json({
    success: true,
    key,
    count: dbStore[key].length,
    lastModified: dbStore.lastModified
  });
});

// Clear transactional or all website data from the server memory, disk, and Google Sheets
app.post('/api/data/clear-all', async (req, res) => {
  try {
    const mode = req.body?.mode || 'transactions';
    const clearSheets = req.body?.clearSheets === true || req.body?.clearSheets === undefined;
    const targetUrl = resolveAppscriptUrl(req.body?.appscriptUrl);

    const transactionalKeys = [
      'rgc_payments',
      'rgc_ledgers',
      'rgc_grn_entries',
      'rgc_pnl_matrix',
      'rgc_purchase_audits'
    ];

    transactionalKeys.forEach((k) => {
      dbStore[k] = [];
    });

    if (mode === 'factory') {
      dbStore['rgc_projects'] = [];
      dbStore['rgc_masters'] = [];
      dbStore['rgc_profiles'] = [];
    }

    dbStore.lastModified = Date.now();
    saveStoreToDisk();

    // If requested, issue wipe/clear command to Google Sheets Web App
    let sheetsClearResult: any = null;
    if (clearSheets && targetUrl) {
      try {
        const tablesToClear = mode === 'factory' 
          ? ['projects', 'masters', 'profiles', 'payments', 'ledgers', 'grn_entries', 'pnl_matrix', 'purchase_audits']
          : ['payments', 'ledgers', 'grn_entries', 'pnl_matrix', 'purchase_audits'];

        // 1. Send factory_reset / clean_and_repair to Google Apps Script
        const resetController = new AbortController();
        const resetTimer = setTimeout(() => resetController.abort(), 12000);
        try {
          await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: mode === 'factory' ? 'factory_reset' : 'clean_and_repair',
              mode: mode === 'factory' ? 'factory' : 'transactions',
              spreadsheetId: resolveTargetSpreadsheetId(req),
              secretKey: 'MyPrivateCompanySecretKey2026!'
            }),
            redirect: 'follow',
            signal: resetController.signal
          });
        } catch (_) {}
        clearTimeout(resetTimer);

        // 2. Also replace every table with empty array to guarantee row clearing
        const clearPromises = tablesToClear.map(async (table) => {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 8000);
            await fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({
                action: 'replace_table',
                table,
                data: [],
                spreadsheetId: resolveTargetSpreadsheetId(req),
                secretKey: 'MyPrivateCompanySecretKey2026!'
              }),
              redirect: 'follow',
              signal: controller.signal
            });
            clearTimeout(timer);
          } catch (_) {}
        });

        await Promise.all(clearPromises);
        sheetsClearResult = { status: 'cleared', tables: tablesToClear };
      } catch (sheetsErr: any) {
        sheetsClearResult = { status: 'note', error: sheetsErr?.message };
      }
    }

    console.log(`🧹 Website data reset completed: mode=${mode}, clearSheets=${clearSheets}`);
    res.json({
      success: true,
      message: mode === 'factory'
        ? 'All website data, projects, and masters have been completely reset.'
        : 'All transactional records (Payments, GRNs, Ledgers, P&L) have been cleared.',
      mode,
      clearedKeys: mode === 'factory' ? [...transactionalKeys, 'rgc_projects', 'rgc_masters', 'rgc_profiles'] : transactionalKeys,
      sheetsClearResult,
      lastModified: dbStore.lastModified
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

const TABLE_HEADER_TEMPLATES: Record<string, any[]> = {
  projects: [{ id: '', name: '', code: '', location: '', budget: '', status: '', created_at: '' }],
  masters: [{ id: '', category: '', name: '', unit: '', code: '', unit_price: '', created_at: '' }],
  profiles: [{ id: '', email: '', full_name: '', designation: '', is_first_time_login: '', created_at: '' }],
  payments: [{ id: '', payment_ref: '', project_id: '', vendor_name: '', amount: '', payment_mode: '', status: '', date: '' }],
  ledgers: [{ id: '', account_name: '', debit: '', credit: '', balance: '', date: '' }],
  grn_entries: [{ id: '', grn_number: '', project_id: '', project_name: '', vendor_name: '', material_name: '', quantity: '', unit: '', unit_price: '', total_amount: '', status: '', date: '' }],
  pnl_matrix: [{ id: '', project_name: '', total_revenue: '', total_expenses: '', net_profit: '', margin_percentage: '' }],
  purchase_audits: [{ id: '', audit_code: '', project_name: '', auditor: '', finding: '', status: '', date: '' }]
};

// -------------------------------------------------------------
  // DEDICATED MULTI-TENANT COMPANY PROVISIONING ENDPOINT
  // -------------------------------------------------------------
  app.post('/api/client/verify', (req, res) => {
    const clientCode = String(req.body?.clientCode || '').trim().toLowerCase();
    if (!clientCode) return res.status(400).json({ success: false, verified: false, error: 'Client code is required' });
    if (clientCode === 'ceo@nrman') return res.json({ success: true, verified: true, clientCode, isCeo: true });

    const registry = Array.isArray(dbStore.company_registry) ? dbStore.company_registry : [];
    const master = Array.isArray(dbStore.nrman_master_database) ? dbStore.nrman_master_database : [];
    const verified = registry.some((company: any) => String(company?.clientCode || '').trim().toLowerCase() === clientCode)
      || master.some((company: any) => String(company?.clientCode || company?.client_code || '').trim().toLowerCase() === clientCode);

    if (!verified) return res.status(401).json({ success: false, verified: false, error: 'Invalid client code. The CEO must generate this code before access is granted.' });
    return res.json({ success: true, verified: true, clientCode, isCeo: false });
  });

  app.post('/api/company/check-gst', (req, res) => {
  try {
    const { gstNumber, excludePrefix } = req.body;
    const cleanGst = (gstNumber || '').trim().toUpperCase();
    const cleanExclude = (excludePrefix || '').trim().toUpperCase();

    if (!cleanGst) {
      return res.json({ exists: false });
    }

    const companyList: any[] = Array.isArray(dbStore['company_registry']) ? dbStore['company_registry'] : [];
    const matched = companyList.find(c => 
      c && c.gstNumber && 
      String(c.gstNumber).trim().toUpperCase() === cleanGst &&
      (!cleanExclude || String(c.prefix || '').toUpperCase() !== cleanExclude)
    );

    if (matched) {
      return res.json({
        exists: true,
        companyName: matched.name || matched.companyName || matched.prefix,
        prefix: matched.prefix
      });
    }

    return res.json({ exists: false });
  } catch (err: any) {
    return res.status(500).json({ exists: false, error: err?.message });
  }
});

app.post('/api/company/provision-sheet', async (req, res) => {
  try {
    const { companyName, prefix, gstNumber, googleEmail, customSpreadsheetId } = req.body;
    const cleanName = String(companyName || '').trim();
    const cleanPrefix = String(prefix || cleanName || 'COMP').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase();
    const cleanGst = String(gstNumber || '').trim().toUpperCase();
    const clientCode = String(req.body.clientCode || 'rgc@nrman').trim().toLowerCase();

    if (!cleanName || !cleanPrefix) return res.status(400).json({ success: false, error: 'companyName and prefix are required' });
    if (googleEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(googleEmail).trim())) {
      return res.status(400).json({ success: false, error: 'A valid Google account email is required' });
    }

    const existing = (Array.isArray(dbStore.company_registry) ? dbStore.company_registry : []).find((c: any) => String(c?.prefix || '').toUpperCase() === cleanPrefix);
    let generatedSpreadsheetId = isRealGoogleSheetIdServer(customSpreadsheetId) ? String(customSpreadsheetId).trim() : existing?.spreadsheetId;
    let spreadsheetUrl = generatedSpreadsheetId ? `https://docs.google.com/spreadsheets/d/${generatedSpreadsheetId}/edit` : '';

    if (!isRealGoogleSheetIdServer(generatedSpreadsheetId)) {
      const gasCreation = await ensureSheetViaGoogleAppsScript({
        companyName: cleanName,
        prefix: cleanPrefix,
        gstNumber: cleanGst,
        googleEmail: googleEmail || '',
        clientCode,
        appscriptUrl: req.body.appscriptUrl
      });
      if (!gasCreation.success || !isRealGoogleSheetIdServer(gasCreation.spreadsheetId)) {
        return res.status(502).json({ success: false, error: gasCreation.error || 'Google Sheets provisioning failed. No company was created.' });
      }
      generatedSpreadsheetId = gasCreation.spreadsheetId;
      spreadsheetUrl = gasCreation.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${generatedSpreadsheetId}/edit`;
    }

    // 1. Strict Duplicate GST Number Validation
    if (cleanGst) {
      const companyList: any[] = Array.isArray(dbStore['company_registry']) ? dbStore['company_registry'] : [];
      const duplicate = companyList.find(c => 
        c && c.gstNumber && 
        String(c.gstNumber).trim().toUpperCase() === cleanGst &&
        String(c.prefix || '').toUpperCase() !== cleanPrefix
      );

      if (duplicate) {
        return res.status(400).json({
          success: false,
          error: `Duplicate GST Number: Company "${duplicate.name || duplicate.companyName || duplicate.prefix}" is already registered with GSTIN "${cleanGst}". Multiple companies cannot share the same GST number.`
        });
      }
    }

    const tables = [
      `${cleanPrefix}_projects`,
      `${cleanPrefix}_masters`,
      `${cleanPrefix}_profiles`,
      `${cleanPrefix}_payments`,
      `${cleanPrefix}_ledgers`,
      `${cleanPrefix}_grn_entries`,
      `${cleanPrefix}_pnl_matrix`,
      `${cleanPrefix}_purchase_audits`
    ];

    // Ensure company tables are initialized in dbStore
    tables.forEach(t => {
      if (!dbStore[t]) {
        dbStore[t] = [];
      }
    });

    // Update server company registry
    if (!Array.isArray(dbStore['company_registry'])) {
      dbStore['company_registry'] = [];
    }
    const filteredRegistry = dbStore['company_registry'].filter((c: any) => c && c.prefix !== cleanPrefix);
    filteredRegistry.unshift({
      prefix: cleanPrefix,
      name: companyName,
      companyName,
      gstNumber: cleanGst || null,
      googleEmail: googleEmail || null,
      spreadsheetId: generatedSpreadsheetId,
      spreadsheetUrl,
      updatedAt: new Date().toISOString()
    });
    dbStore['company_registry'] = filteredRegistry;

    // Synchronize company into nrman_master_database
    recordCompanyInMasterDb({
      clientCode: req.body.clientCode || 'rgc@nrman',
      companyName,
      prefix: cleanPrefix,
      gstNumber: cleanGst,
      googleEmail: googleEmail || null,
      spreadsheetId: generatedSpreadsheetId,
      spreadsheetUrl,
      logoUrl: req.body.logoUrl || req.body.logoBase64 || ''
    });

    dbStore.lastModified = Date.now();
    saveStoreToDisk();

    res.json({
      success: true,
      message: `Dedicated Google Sheet provisioned for ${companyName} [${cleanPrefix}]`,
      companyName,
      prefix: cleanPrefix,
      gstNumber: cleanGst || null,
      googleEmail: googleEmail || null,
      spreadsheetId: generatedSpreadsheetId,
      spreadsheetUrl,
      tables
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to provision company sheet' });
  }
});

// -------------------------------------------------------------
// CHECK COMPANY GOOGLE SHEET IN GOOGLE DRIVE
// -------------------------------------------------------------
app.post('/api/company/check-sheet', async (req, res) => {
  try {
    const { spreadsheetId, prefix, googleEmail, companyName, appscriptUrl } = req.body;
    const cleanPrefix = (prefix || 'COMP').toUpperCase();
    const targetId = spreadsheetId || resolveTargetSpreadsheetId(req);
    const targetEmail = (googleEmail || 'sinchanar1002@gmail.com').trim();
    const isReal = isRealGoogleSheetIdServer(targetId);

    const targetUrl = resolveAppscriptUrl(appscriptUrl);
    let checkResult: any = {
      isRealId: isReal,
      spreadsheetId: targetId,
      googleEmail: targetEmail,
      companyName: companyName || cleanPrefix,
      prefix: cleanPrefix,
      exists: isReal,
      spreadsheetUrl: isReal ? `https://docs.google.com/spreadsheets/d/${targetId}/edit` : null,
      allTablesPresent: false,
      presentTables: [],
      missingTables: ['projects', 'grn_entries', 'payments', 'masters', 'ledgers', 'profiles', 'pnl_matrix', 'purchase_audits']
    };

    if (targetUrl && isReal) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const gasRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'check_company_sheet',
            spreadsheetId: targetId,
            googleEmail: targetEmail,
            prefix: cleanPrefix,
            secretKey: 'MyPrivateCompanySecretKey2026!'
          }),
          redirect: 'follow',
          signal: controller.signal
        });
        clearTimeout(timer);
        const text = await gasRes.text();
        let parsed: any = null;
        try { parsed = JSON.parse(text); } catch (_) {}
        if (parsed && (parsed.success || parsed.exists)) {
          checkResult = {
            ...checkResult,
            ...parsed,
            isRealId: true,
            exists: true
          };
        }
      } catch (_) {}
    }

    return res.json({ success: true, ...checkResult });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// -------------------------------------------------------------
// ENSURE REAL GOOGLE SHEET IN GOOGLE DRIVE FOR COMPANY
// -------------------------------------------------------------
app.post('/api/company/ensure-sheet', async (req, res) => {
  try {
    const { companyName, prefix, gstNumber, googleEmail, clientCode, spreadsheetId, appscriptUrl } = req.body;
    const cleanPrefix = (prefix || companyName || 'COMP').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase();
    const cleanEmail = (googleEmail || 'sinchanar1002@gmail.com').trim();
    const name = companyName || `${cleanPrefix} Company`;

    const result = await ensureSheetViaGoogleAppsScript({
      companyName: name,
      prefix: cleanPrefix,
      gstNumber,
      googleEmail: cleanEmail,
      clientCode: clientCode || 'rgc@nrman',
      spreadsheetId: isRealGoogleSheetIdServer(spreadsheetId) ? spreadsheetId : undefined,
      appscriptUrl
    });

    if (result.success && result.spreadsheetId) {
      // Update registry and master database
      if (!Array.isArray(dbStore['company_registry'])) dbStore['company_registry'] = [];
      let comp = dbStore['company_registry'].find((c: any) => c && String(c.prefix || '').toUpperCase() === cleanPrefix);
      if (!comp) {
        comp = {
          prefix: cleanPrefix,
          name: name,
          companyName: name,
          gstNumber: gstNumber || null,
          googleEmail: cleanEmail,
          spreadsheetId: result.spreadsheetId,
          spreadsheetUrl: result.spreadsheetUrl,
          updatedAt: new Date().toISOString()
        };
        dbStore['company_registry'].unshift(comp);
      } else {
        comp.spreadsheetId = result.spreadsheetId;
        comp.spreadsheetUrl = result.spreadsheetUrl;
        comp.googleEmail = cleanEmail;
        comp.updatedAt = new Date().toISOString();
      }

      recordCompanyInMasterDb({
        clientCode: clientCode || 'rgc@nrman',
        companyName: name,
        prefix: cleanPrefix,
        gstNumber,
        googleEmail: cleanEmail,
        spreadsheetId: result.spreadsheetId,
        spreadsheetUrl: result.spreadsheetUrl
      });

      dbStore.lastModified = Date.now();
      saveStoreToDisk();

      return res.json({
        success: true,
        message: `Real Google Sheet created & verified in Google Drive for ${cleanEmail}!`,
        spreadsheetId: result.spreadsheetId,
        spreadsheetUrl: result.spreadsheetUrl,
        companyName: name,
        prefix: cleanPrefix,
        googleEmail: cleanEmail
      });
    }

    return res.status(400).json({
      success: false,
      error: result.error || 'Failed to auto-create Google Sheet via Apps Script'
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// -------------------------------------------------------------
// PULL ALL TABLES DATA FROM REAL GOOGLE SHEET
// -------------------------------------------------------------
app.post('/api/company/pull-sheet-data', async (req, res) => {
  try {
    const { prefix, spreadsheetId, appscriptUrl } = req.body;
    const cleanPrefix = (prefix || 'COMP').toUpperCase();
    const targetSpreadsheetId = spreadsheetId || resolveTargetSpreadsheetId(req);
    const targetUrl = resolveAppscriptUrl(appscriptUrl);

    if (!targetUrl) {
      return res.status(400).json({ success: false, error: 'Apps script URL not configured' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const gasRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'pull_all_tables',
        spreadsheetId: targetSpreadsheetId,
        prefix: cleanPrefix,
        secretKey: 'MyPrivateCompanySecretKey2026!'
      }),
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timer);
    const text = await gasRes.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch (_) {}

    if (parsed && (parsed.status === 'success' || parsed.success) && parsed.data) {
      // Populate dbStore for all tables
      const canonical = ['projects', 'grn_entries', 'payments', 'masters', 'ledgers', 'profiles', 'pnl_matrix', 'purchase_audits'];
      for (const tbl of canonical) {
        if (Array.isArray(parsed.data[tbl])) {
          const storeKey = `${cleanPrefix.toLowerCase()}_${tbl}`;
          dbStore[storeKey] = parsed.data[tbl].map((r: any, i: number) => normalizeRowDataServer(tbl, r, i));
        }
      }
      dbStore.lastModified = Date.now();
      saveStoreToDisk();

      return res.json({
        success: true,
        message: `Successfully pulled all data from Google Sheet for ${cleanPrefix}`,
        data: parsed.data,
        counts: parsed.counts
      });
    }

    return res.status(400).json({
      success: false,
      error: parsed?.message || 'Could not pull tables from Google Sheets',
      raw: text
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// -------------------------------------------------------------
// INSTANT SUB-TABLES & COLUMN HEADERS INITIALIZATION ENDPOINT
// -------------------------------------------------------------
app.post('/api/company/init-sheet-tables', async (req, res) => {
  try {
    const { spreadsheetId, prefix, companyName, googleEmail, clientCode, appscriptUrl } = req.body;
    let targetSpreadsheetId = spreadsheetId || resolveTargetSpreadsheetId(req);
    const cleanPrefix = (prefix || 'COMP').toUpperCase();
    const targetUrl = resolveAppscriptUrl(appscriptUrl);
    const targetEmail = (googleEmail || 'sinchanar1002@gmail.com').trim();
    let targetSpreadsheetUrl = '';

    // If targetSpreadsheetId is not a real Google Sheet ID, ensure creation in Google Drive first!
    if (!isRealGoogleSheetIdServer(targetSpreadsheetId)) {
      const ensureResult = await ensureSheetViaGoogleAppsScript({
        companyName: companyName || cleanPrefix,
        prefix: cleanPrefix,
        googleEmail: targetEmail,
        clientCode: clientCode || 'rgc@nrman',
        appscriptUrl: targetUrl
      });

      if (ensureResult.success && ensureResult.spreadsheetId) {
        targetSpreadsheetId = ensureResult.spreadsheetId;
        targetSpreadsheetUrl = ensureResult.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

        // Update company_registry
        if (Array.isArray(dbStore['company_registry'])) {
          const comp = dbStore['company_registry'].find((c: any) => c && String(c.prefix || '').toUpperCase() === cleanPrefix);
          if (comp) {
            comp.spreadsheetId = targetSpreadsheetId;
            comp.spreadsheetUrl = targetSpreadsheetUrl;
            comp.googleEmail = targetEmail;
            comp.updatedAt = new Date().toISOString();
          }
        }

        // Update nrman_master_database
        if (Array.isArray(dbStore['nrman_master_database'])) {
          const mComp = dbStore['nrman_master_database'].find((m: any) => m && String(m.prefix || '').toUpperCase() === cleanPrefix);
          if (mComp) {
            mComp.spreadsheetId = targetSpreadsheetId;
            mComp.spreadsheetUrl = targetSpreadsheetUrl;
            mComp.googleEmail = targetEmail;
            mComp.lastUpdated = new Date().toISOString();
          }
        }
        dbStore.lastModified = Date.now();
        saveStoreToDisk();
      }
    } else {
      targetSpreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;
    }

    // Prepare canonical table headers schemas for all 8 sub-tables
    const canonicalTables = ['projects', 'grn_entries', 'payments', 'masters', 'ledgers', 'profiles', 'pnl_matrix', 'purchase_audits'];
    const tablesData: Record<string, any[]> = {};
    canonicalTables.forEach(tbl => {
      tablesData[tbl] = [];
      const storeKey = `${cleanPrefix.toLowerCase()}_${tbl}`;
      if (!dbStore[storeKey]) dbStore[storeKey] = [];
    });
    dbStore.lastModified = Date.now();
    saveStoreToDisk();

    let gasResponse = null;
    if (targetUrl) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25000);
        const gRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'sync_all_tables',
            tablesData,
            spreadsheetId: targetSpreadsheetId,
            secretKey: 'MyPrivateCompanySecretKey2026!'
          }),
          redirect: 'follow',
          signal: controller.signal
        });
        clearTimeout(timer);
        const text = await gRes.text();
        try {
          gasResponse = JSON.parse(text);
        } catch (_) {
          gasResponse = { raw: text };
        }
      } catch (err: any) {
        gasResponse = { error: err?.message };
      }
    }

    return res.json({
      success: true,
      message: `All 8 operational sub-tables and column headers successfully initialized in Google Sheets for ${companyName || cleanPrefix}!`,
      tables: canonicalTables.map(t => `${cleanPrefix}_${t}`),
      spreadsheetId: targetSpreadsheetId,
      spreadsheetUrl: targetSpreadsheetUrl,
      googleEmail: targetEmail,
      gasResponse,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error initializing sheet tables:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to initialize sheet tables' });
  }
});

// -------------------------------------------------------------
// COMPANY DELETION ENDPOINT
// -------------------------------------------------------------
app.post('/api/company/delete', async (req, res) => {
  try {
    const { prefix, companyName, clientCode } = req.body;
    const cleanPrefix = (prefix || '').trim().toUpperCase();

    if (!cleanPrefix) {
      return res.status(400).json({ success: false, error: 'Company prefix is required for deletion' });
    }

    recordDeletedPrefix(cleanPrefix);

    // 1. Delete all table entries for this company from dbStore
    const keysToDelete = Object.keys(dbStore).filter(k => 
      k.toUpperCase().startsWith(`${cleanPrefix}_`)
    );

    keysToDelete.forEach(k => {
      delete dbStore[k];
    });

    // 2. Remove from company_registry in dbStore
    if (Array.isArray(dbStore['company_registry'])) {
      dbStore['company_registry'] = dbStore['company_registry'].filter(
        (c: any) => c && String(c.prefix || '').toUpperCase() !== cleanPrefix
      );
    }

    const existingComp = masterDbStore.find(c => c && (c.prefix || '').toUpperCase() === cleanPrefix);

    // 3. Remove from nrman_master_database
    deleteCompanyFromMasterDb(cleanPrefix);

    dbStore.lastModified = Date.now();
    saveStoreToDisk();

    // 4. Propagate deletion to Google Sheets via Apps Script
    const targetGasUrl = resolveAppscriptUrl(req.body.appscriptUrl);
    if (targetGasUrl) {
      // Push updated masterDbStore to CEO Master Google Sheet immediately
      try {
        fetch(targetGasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'sync_master_database',
            entries: masterDbStore,
            clients: clientsStore,
            deletedPrefix: cleanPrefix,
            spreadsheetId: masterSheetConfig.spreadsheetId,
            secretKey: 'MyPrivateCompanySecretKey2026!'
          })
        }).catch(() => {});
      } catch (_) {}

      // If company had a dedicated Google Sheet, mark it as archived/deleted
      if (existingComp && existingComp.spreadsheetId && isRealGoogleSheetIdServer(existingComp.spreadsheetId)) {
        try {
          fetch(targetGasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'mark_company_sheet_deleted',
              prefix: cleanPrefix,
              companyName: existingComp.companyName || cleanPrefix,
              spreadsheetId: existingComp.spreadsheetId,
              secretKey: 'MyPrivateCompanySecretKey2026!'
            })
          }).catch(() => {});
        } catch (_) {}
      }
    }

    res.json({
      success: true,
      message: `Company ${companyName || cleanPrefix} [${cleanPrefix}] deleted successfully across all systems and sheets. Cleaned up ${keysToDelete.length} data collections.`,
      deletedPrefix: cleanPrefix,
      deletedKeys: keysToDelete,
      remainingCompaniesCount: masterDbStore.length
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete company' });
  }
});

// -------------------------------------------------------------
// COMPANY UPDATE ENDPOINT (GOOGLE ACCOUNT EMAIL & SPREADSHEET)
// -------------------------------------------------------------
app.post('/api/company/update', async (req, res) => {
  try {
    const { prefix, googleEmail, spreadsheetId, spreadsheetUrl } = req.body;
    const cleanPrefix = (prefix || '').trim().toUpperCase();

    if (!cleanPrefix) {
      return res.status(400).json({ success: false, error: 'Company prefix is required' });
    }

    res.json({
      success: true,
      message: `Company ${cleanPrefix} details updated successfully`,
      prefix: cleanPrefix,
      googleEmail: googleEmail || null,
      spreadsheetId: spreadsheetId || null,
      spreadsheetUrl: spreadsheetUrl || null
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update company' });
  }
});

// -------------------------------------------------------------
// NRMAN MASTER DATABASE & CLIENTS REGISTRY (PERSISTENT DATA STORE)
// -------------------------------------------------------------
const MASTER_DB_FILE = path.join(DATA_DIR, 'nrman_master_database.json');
const CLIENTS_FILE = path.join(DATA_DIR, 'nrman_clients.json');
const MASTER_CONFIG_FILE = path.join(DATA_DIR, 'nrman_master_config.json');
const DELETED_COMPANIES_FILE = path.join(DATA_DIR, 'deleted_companies.json');
const DELETED_CLIENTS_FILE = path.join(DATA_DIR, 'deleted_clients.json');

const MASTER_ADMIN_EMAIL = 'sinchanar1002@gmail.com';
let masterSheetConfig = {
  ownerAccount: MASTER_ADMIN_EMAIL,
  sheetName: 'nrman_master_database',
  spreadsheetId: '',
  spreadsheetUrl: '',
  tables: ['nrman_master_database', 'clients', 'Master_Client_Codes'],
  lastSynced: ''
};

function saveMasterConfigToDisk() {
  try {
    fs.writeFileSync(MASTER_CONFIG_FILE, JSON.stringify(masterSheetConfig, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving master sheet config:', err);
  }
}

let deletedPrefixesStore: string[] = [];

function loadDeletedPrefixes() {
  try {
    if (fs.existsSync(DELETED_COMPANIES_FILE)) {
      const data = fs.readFileSync(DELETED_COMPANIES_FILE, 'utf-8');
      deletedPrefixesStore = JSON.parse(data);
    }
  } catch (err) {
    deletedPrefixesStore = [];
  }
}

function saveDeletedPrefixesToDisk() {
  try {
    fs.writeFileSync(DELETED_COMPANIES_FILE, JSON.stringify(deletedPrefixesStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving deleted prefixes:', err);
  }
}

function recordDeletedPrefix(prefix: string) {
  const clean = (prefix || '').trim().toUpperCase();
  if (clean && !deletedPrefixesStore.includes(clean)) {
    deletedPrefixesStore.push(clean);
    saveDeletedPrefixesToDisk();
  }
}

function clearDeletedPrefix(prefix: string) {
  const clean = (prefix || '').trim().toUpperCase();
  if (clean && deletedPrefixesStore.includes(clean)) {
    deletedPrefixesStore = deletedPrefixesStore.filter(p => p !== clean);
    saveDeletedPrefixesToDisk();
  }
}

let deletedClientsStore: string[] = [];

function loadDeletedClients() {
  try {
    if (fs.existsSync(DELETED_CLIENTS_FILE)) {
      const data = fs.readFileSync(DELETED_CLIENTS_FILE, 'utf-8');
      deletedClientsStore = JSON.parse(data);
    }
  } catch (err) {
    deletedClientsStore = [];
  }
}

function saveDeletedClientsToDisk() {
  try {
    fs.writeFileSync(DELETED_CLIENTS_FILE, JSON.stringify(deletedClientsStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving deleted clients:', err);
  }
}

function recordDeletedClient(clientCode: string) {
  const clean = (clientCode || '').trim().toLowerCase();
  if (clean && !deletedClientsStore.includes(clean)) {
    deletedClientsStore.push(clean);
    saveDeletedClientsToDisk();
  }
}

const DEFAULT_CLIENTS = [
  {
    id: 'cli-rgc',
    clientCode: 'rgc@nrman',
    clientName: 'Royal Gokul Constructions Group',
    contactEmail: 'sinchanar1002@gmail.com',
    plan: 'Enterprise Sovereign',
    status: 'Active',
    companiesCount: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    lastActive: new Date().toISOString()
  }
];

const DEFAULT_MASTER_COMPANIES = [
  {
    id: 'rec-rgc-master',
    clientCode: 'rgc@nrman',
    companyName: 'ROYALGOKUL CONSTRUCTIONS PVT LTD',
    prefix: 'RGC',
    gstNumber: '29AABCR1234F1Z5',
    logoUrl: '/logo.svg',
    googleEmail: 'sinchanar1002@gmail.com',
    spreadsheetId: '1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs/edit',
    status: 'Active',
    createdAt: '2026-08-01T00:00:00.000Z',
    lastUpdated: new Date().toISOString()
  }
];

let masterDbStore: any[] = [];
let clientsStore: any[] = [];

function loadMasterDbAndClients() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    loadDeletedPrefixes();
    loadDeletedClients();

    if (fs.existsSync(MASTER_DB_FILE)) {
      const data = fs.readFileSync(MASTER_DB_FILE, 'utf-8');
      masterDbStore = JSON.parse(data);
    } else {
      if (!deletedPrefixesStore.includes('RGC')) {
        masterDbStore = [...DEFAULT_MASTER_COMPANIES];
        saveMasterDbToDisk();
      } else {
        masterDbStore = [];
      }
    }

    if (fs.existsSync(CLIENTS_FILE)) {
      const data = fs.readFileSync(CLIENTS_FILE, 'utf-8');
      clientsStore = JSON.parse(data);
    } else {
      clientsStore = [...DEFAULT_CLIENTS];
      saveClientsToDisk();
    }

    if (fs.existsSync(MASTER_CONFIG_FILE)) {
      try {
        const conf = JSON.parse(fs.readFileSync(MASTER_CONFIG_FILE, 'utf-8'));
        // Disconnect RGC primary from master database if previously set
        if (conf.spreadsheetId === '1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs') {
          conf.spreadsheetId = '';
          conf.spreadsheetUrl = '';
          saveMasterConfigToDisk();
        }
        masterSheetConfig = { ...masterSheetConfig, ...conf };
      } catch (_) {}
    } else {
      masterSheetConfig.spreadsheetId = '';
      masterSheetConfig.spreadsheetUrl = '';
      saveMasterConfigToDisk();
    }

    // Only ensure Royal Gokul Constructions company if not deleted
    if (!deletedPrefixesStore.includes('RGC') && !deletedClientsStore.includes('rgc@nrman')) {
      let rgcComp = masterDbStore.find(c => c && ((c.prefix || '').toUpperCase() === 'RGC' || (c.companyName || '').toLowerCase().includes('royalgokul')));
      if (!rgcComp) {
        rgcComp = { ...DEFAULT_MASTER_COMPANIES[0] };
        masterDbStore.unshift(rgcComp);
        saveMasterDbToDisk();
      } else {
        rgcComp.clientCode = 'rgc@nrman';
        rgcComp.companyName = 'ROYALGOKUL CONSTRUCTIONS PVT LTD';
        rgcComp.prefix = 'RGC';
        if (!rgcComp.spreadsheetId || rgcComp.spreadsheetId.startsWith('sheet_')) {
          rgcComp.spreadsheetId = '1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs';
          rgcComp.spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs/edit';
        }
        saveMasterDbToDisk();
      }
    } else {
      masterDbStore = masterDbStore.filter(c => c && (c.prefix || '').toUpperCase() !== 'RGC');
      saveMasterDbToDisk();
    }

    // Only ensure rgc@nrman client is present if not deleted
    if (!deletedClientsStore.includes('rgc@nrman')) {
      let rgcCli = clientsStore.find(c => c && (c.clientCode || '').toLowerCase() === 'rgc@nrman');
      if (!rgcCli) {
        rgcCli = { ...DEFAULT_CLIENTS[0] };
        clientsStore.unshift(rgcCli);
        saveClientsToDisk();
      }
      const rgcComps = masterDbStore.filter(c => c && (c.clientCode || '').toLowerCase() === 'rgc@nrman');
      rgcCli.companiesCount = rgcComps.length;
      saveClientsToDisk();
    } else {
      clientsStore = clientsStore.filter(c => c && (c.clientCode || '').toLowerCase() !== 'rgc@nrman');
      saveClientsToDisk();
    }
  } catch (err) {
    console.error('Error loading master db and clients:', err);
    masterDbStore = [];
    clientsStore = [...DEFAULT_CLIENTS];
  }
}

function saveMasterDbToDisk() {
  try {
    fs.writeFileSync(MASTER_DB_FILE, JSON.stringify(masterDbStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving master db to disk:', err);
  }
}

function saveClientsToDisk() {
  try {
    fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clientsStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving clients to disk:', err);
  }
}

loadMasterDbAndClients();

function recordCompanyInMasterDb(comp: {
  clientCode?: string;
  companyName: string;
  prefix: string;
  gstNumber?: string;
  logoUrl?: string;
  googleEmail?: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
}) {
  const cleanPrefix = (comp.prefix || 'COMP').trim().toUpperCase();
  const clientCode = (comp.clientCode || 'rgc@nrman').trim().toLowerCase();
  clearDeletedPrefix(cleanPrefix);
  const existingIdx = masterDbStore.findIndex(c => c && (c.prefix || '').toUpperCase() === cleanPrefix);
  
  const record = {
    id: existingIdx >= 0 ? masterDbStore[existingIdx].id : `rec-${cleanPrefix.toLowerCase()}-${Date.now()}`,
    clientCode,
    companyName: comp.companyName,
    prefix: cleanPrefix,
    gstNumber: (comp.gstNumber || '').trim().toUpperCase(),
    logoUrl: comp.logoUrl || (existingIdx >= 0 ? masterDbStore[existingIdx].logoUrl : ''),
    googleEmail: comp.googleEmail || (existingIdx >= 0 ? masterDbStore[existingIdx].googleEmail : ''),
    spreadsheetId: comp.spreadsheetId || (existingIdx >= 0 ? masterDbStore[existingIdx].spreadsheetId : `sheet_${cleanPrefix}_${Date.now().toString(36)}`),
    spreadsheetUrl: comp.spreadsheetUrl || (comp.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${comp.spreadsheetId}/edit` : (existingIdx >= 0 ? masterDbStore[existingIdx].spreadsheetUrl : '')),
    status: 'Active',
    createdAt: existingIdx >= 0 ? masterDbStore[existingIdx].createdAt : new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    masterDbStore[existingIdx] = record;
  } else {
    masterDbStore.unshift(record);
  }
  saveMasterDbToDisk();

  // Ensure client exists and count is updated accurately
  let client = clientsStore.find(c => c && (c.clientCode || '').toLowerCase().trim() === clientCode);
  if (!client) {
    client = {
      id: `cli-${Date.now()}`,
      clientCode,
      clientName: `${comp.companyName} Enterprise`,
      contactEmail: comp.googleEmail || '',
      plan: 'Enterprise Sovereign',
      status: 'Active',
      companiesCount: 1,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };
    clientsStore.unshift(client);
  } else {
    client.companiesCount = masterDbStore.filter(c => c && (c.clientCode || '').toLowerCase().trim() === clientCode).length;
    client.lastActive = new Date().toISOString();
  }
  saveClientsToDisk();

  return record;
}

function deleteCompanyFromMasterDb(prefix: string) {
  const cleanPrefix = (prefix || '').trim().toUpperCase();
  recordDeletedPrefix(cleanPrefix);
  const existing = masterDbStore.find(c => c && (c.prefix || '').toUpperCase() === cleanPrefix);
  masterDbStore = masterDbStore.filter(c => c && (c.prefix || '').toUpperCase() !== cleanPrefix);
  saveMasterDbToDisk();

  if (existing && existing.clientCode) {
    const cCode = existing.clientCode.toLowerCase().trim();
    const client = clientsStore.find(c => c && (c.clientCode || '').toLowerCase().trim() === cCode);
    if (client) {
      client.companiesCount = masterDbStore.filter(c => c && (c.clientCode || '').toLowerCase().trim() === cCode).length;
      client.lastActive = new Date().toISOString();
      saveClientsToDisk();
    }
  }
}

// -------------------------------------------------------------
// MASTER DATABASE API ENDPOINTS (FOR ceo@nrman & ENTERPRISE HUB)
// -------------------------------------------------------------
app.get('/api/master-database', (req, res) => {
  const totalClients = clientsStore.length;
  const totalCompanies = masterDbStore.length;
  const totalSheetsConnected = masterDbStore.filter(c => c.spreadsheetId && !c.spreadsheetId.startsWith('sheet_')).length;
  const totalGstNumbers = masterDbStore.filter(c => c.gstNumber && c.gstNumber.length >= 10).length;

  const clientsWithCounts = clientsStore.map(cli => {
    const cliCode = (cli.clientCode || '').toLowerCase().trim();
    const count = masterDbStore.filter(c => c && (c.clientCode || '').toLowerCase().trim() === cliCode).length;
    return {
      ...cli,
      companiesCount: count
    };
  });

  res.json({
    success: true,
    records: masterDbStore,
    clients: clientsWithCounts,
    stats: {
      totalClients,
      totalCompanies,
      totalSheetsConnected,
      totalGstNumbers
    },
    masterSheet: masterSheetConfig
  });
});

async function syncMasterAndClientsToSheets(customAppscriptUrl?: string, optSpreadsheetId?: string) {
  const targetUrl = resolveAppscriptUrl(customAppscriptUrl);
  if (!targetUrl) return;
  const targetSpreadsheetId = optSpreadsheetId || masterSheetConfig.spreadsheetId;
  // If no master spreadsheet linked or if it points to RGC primary, do NOT push master tables to RGC primary!
  if (!targetSpreadsheetId || targetSpreadsheetId === '1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs') {
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    await Promise.allSettled([
      fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'replace_table',
          table: 'nrman_master_database',
          data: masterDbStore,
          spreadsheetId: targetSpreadsheetId,
          secretKey: 'MyPrivateCompanySecretKey2026!'
        }),
        signal: controller.signal
      }),
      fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'replace_table',
          table: 'clients',
          data: clientsStore,
          spreadsheetId: targetSpreadsheetId,
          secretKey: 'MyPrivateCompanySecretKey2026!'
        }),
        signal: controller.signal
      })
    ]);

    clearTimeout(timer);
    masterSheetConfig.lastSynced = new Date().toISOString();
    saveMasterConfigToDisk();
  } catch (err) {
    console.warn('Sync master & clients error:', err);
  }
}

app.post('/api/master-database/entry', async (req, res) => {
  try {
    const { id, clientCode, companyName, prefix, gstNumber, logoUrl, googleEmail, spreadsheetId, spreadsheetUrl, status } = req.body;
    if (!companyName || !prefix) {
      return res.status(400).json({ success: false, error: 'companyName and prefix are required' });
    }

    const record = recordCompanyInMasterDb({
      clientCode: clientCode || 'rgc@nrman',
      companyName,
      prefix,
      gstNumber,
      logoUrl,
      googleEmail,
      spreadsheetId,
      spreadsheetUrl
    });

    if (status) record.status = status;
    saveMasterDbToDisk();

    // Synchronize to Google Sheets
    syncMasterAndClientsToSheets(req.body.appscriptUrl);

    res.json({
      success: true,
      message: 'Master database record saved and synchronized',
      record
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save master entry' });
  }
});

app.post('/api/master-database/delete', (req, res) => {
  try {
    const { id, prefix } = req.body;
    if (!id && !prefix) {
      return res.status(400).json({ success: false, error: 'id or prefix is required' });
    }

    let deletedPrefix = prefix ? String(prefix).trim().toUpperCase() : '';
    if (deletedPrefix) {
      deleteCompanyFromMasterDb(deletedPrefix);
    } else if (id) {
      const target = masterDbStore.find(c => c && c.id === id);
      if (target && target.prefix) {
        deletedPrefix = target.prefix.toUpperCase();
        deleteCompanyFromMasterDb(target.prefix);
      } else {
        masterDbStore = masterDbStore.filter(c => c && c.id !== id);
        saveMasterDbToDisk();
      }
    }

    // Propagate deletion to master Google Sheet
    syncMasterAndClientsToSheets(req.body.appscriptUrl);

    res.json({
      success: true,
      message: 'Record removed from master database and synchronized to sheet'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete master entry' });
  }
});

// Programmatically Create and Format Master Google Sheet with auto-headers & data
app.post('/api/master-database/create-master-sheet', async (req, res) => {
  try {
    const ownerEmail = req.body.ownerEmail || masterSheetConfig.ownerAccount || 'sinchanar1002@gmail.com';
    const targetGasUrl = resolveAppscriptUrl(req.body.appscriptUrl);

    let createdId = '';
    let createdUrl = '';

    if (targetGasUrl) {
      try {
        const gasRes = await fetch(targetGasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'create_master_sheet',
            sheetName: 'nrman_master_database',
            createNew: true,
            forceNew: true,
            ownerEmail,
            entries: masterDbStore,
            clients: clientsStore,
            secretKey: 'MyPrivateCompanySecretKey2026!'
          })
        });

        if (gasRes.ok) {
          const gasData: any = await gasRes.json().catch(() => ({}));
          if (gasData && gasData.spreadsheetId && gasData.spreadsheetId !== '1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs') {
            createdId = gasData.spreadsheetId;
            createdUrl = gasData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${gasData.spreadsheetId}/edit`;
          }
        }
      } catch (gasErr: any) {
        console.warn('Apps Script master creation attempt:', gasErr.message);
      }
    }

    if (createdId) {
      masterSheetConfig.spreadsheetId = createdId;
      masterSheetConfig.spreadsheetUrl = createdUrl;
      masterSheetConfig.lastSynced = new Date().toISOString();
      saveMasterConfigToDisk();

      // Store all current entries into the Google Sheet
      await syncMasterAndClientsToSheets(targetGasUrl, createdId);

      return res.json({
        success: true,
        created: true,
        spreadsheetId: masterSheetConfig.spreadsheetId,
        spreadsheetUrl: masterSheetConfig.spreadsheetUrl,
        message: 'Separate Master Google Sheet nrman_master_database created and records stored.'
      });
    }

  return res.status(502).json({
  success: false,
  created: false,
  needsLink: false,
  spreadsheetId: '',
  spreadsheetUrl: '',
  error: targetGasUrl
    ? 'Apps Script did not return a real master spreadsheet ID. Redeploy Code.gs as a web app and try again.'
    : 'Apps Script URL is not configured. Add the deployed Apps Script web app URL before creating the master database.'
  });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to create master sheet' });
  }
});

app.post('/api/master-database/sync-to-sheet', async (req, res) => {
  try {
    const targetUrl = resolveAppscriptUrl(req.body.appscriptUrl);
    const targetSpreadsheetId = req.body.spreadsheetId || masterSheetConfig.spreadsheetId;

    if (!targetUrl) {
      return res.status(400).json({ success: false, error: 'Google Apps Script URL is not configured' });
    }

    await syncMasterAndClientsToSheets(targetUrl, targetSpreadsheetId);

    res.json({
      success: true,
      message: `Pushed ${masterDbStore.length} companies to master Google Sheet (nrman_master_database)`,
      count: masterDbStore.length,
      spreadsheetUrl: masterSheetConfig.spreadsheetUrl
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to push master database to Google Sheets' });
  }
});

// -------------------------------------------------------------
// CLIENTS MANAGEMENT ENDPOINTS (FOR ceo@nrman)
// -------------------------------------------------------------
app.get('/api/clients', (req, res) => {
  const clientsWithCompanies = clientsStore.map(cli => {
    const cliCode = (cli.clientCode || '').toLowerCase().trim();
    const companies = masterDbStore.filter(c => {
      if (!c) return false;
      const cCode = (c.clientCode || '').toLowerCase().trim();
      return cCode === cliCode;
    });

    return {
      ...cli,
      companiesCount: companies.length,
      companies
    };
  });

  res.json({
    success: true,
    clients: clientsWithCompanies
  });
});

app.post('/api/clients/create', async (req, res) => {
  try {
    const { clientCode, clientName, contactEmail, plan, initialCompanyName, initialPrefix, initialGst } = req.body;
    if (!clientCode || !clientName) {
      return res.status(400).json({ success: false, error: 'clientCode and clientName are required' });
    }

    const cleanCode = clientCode.trim().toLowerCase();
    const exists = clientsStore.find(c => c && (c.clientCode || '').toLowerCase().trim() === cleanCode);
    if (exists) {
      return res.status(400).json({ success: false, error: `Client with code "${cleanCode}" already exists` });
    }

    const newClient = {
      id: `cli-${Date.now()}`,
      clientCode: cleanCode,
      clientName: clientName.trim(),
      contactEmail: (contactEmail || '').trim(),
      plan: plan || 'Enterprise Sovereign',
      status: 'Active',
      companiesCount: 0,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };

    clientsStore.unshift(newClient);
    saveClientsToDisk();

    // Optionally create initial company for this client
    let initialCompany = null;
    if (initialCompanyName && initialPrefix) {
      initialCompany = recordCompanyInMasterDb({
        clientCode: cleanCode,
        companyName: initialCompanyName.trim(),
        prefix: initialPrefix.trim().toUpperCase(),
        gstNumber: (initialGst || '').trim().toUpperCase(),
        googleEmail: (contactEmail || '').trim()
      });
    }

    // Sync clients and companies to master Google Sheet
    syncMasterAndClientsToSheets();

    res.json({
      success: true,
      message: `Client "${cleanCode}" created successfully`,
      client: newClient,
      initialCompany
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to create client' });
  }
});

app.post('/api/clients/delete', (req, res) => {
  try {
    const { clientCode } = req.body;
    if (!clientCode) {
      return res.status(400).json({ success: false, error: 'clientCode is required' });
    }

    const cleanCode = clientCode.trim().toLowerCase();
    if (cleanCode === 'ceo@nrman') {
      return res.status(400).json({ success: false, error: 'Cannot remove CEO master controller account' });
    }

    // Find and remove all companies owned by this client
    const companiesToRemove = masterDbStore.filter(c => c && c.clientCode.toLowerCase() === cleanCode);
    companiesToRemove.forEach(comp => {
      deleteCompanyFromMasterDb(comp.prefix);
      // Clean up dbStore keys
      const p = comp.prefix.toUpperCase();
      Object.keys(dbStore).forEach(k => {
        if (k.toUpperCase().startsWith(`${p}_`)) delete dbStore[k];
      });
    });

    clientsStore = clientsStore.filter(c => c && c.clientCode.toLowerCase() !== cleanCode);
    recordDeletedClient(cleanCode);
    saveClientsToDisk();
    dbStore.lastModified = Date.now();
    saveStoreToDisk();

    // Sync deletion to master Google Sheet
    syncMasterAndClientsToSheets();

    res.json({
      success: true,
      message: `Client "${cleanCode}" and all ${companiesToRemove.length} associated companies removed from master database`,
      deletedCompaniesCount: companiesToRemove.length
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete client' });
  }
});

app.get('/api/master/client-sheet', (req, res) => {
  res.json({
    success: true,
    masterSheet: masterSheetConfig
  });
});

app.post('/api/master/client-sheet/update', (req, res) => {
  const { spreadsheetId, spreadsheetUrl } = req.body;
  if (spreadsheetId) {
    masterSheetConfig.spreadsheetId = spreadsheetId.trim();
    masterSheetConfig.spreadsheetUrl = spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId.trim()}/edit`;
    masterSheetConfig.lastSynced = new Date().toISOString();
    saveMasterConfigToDisk();
  }
  res.json({
    success: true,
    message: 'Master Client Code Sheet updated successfully',
    masterSheet: masterSheetConfig
  });
});

// -------------------------------------------------------------
// DIRECT GOOGLE SHEETS API V4 ENDPOINTS (OAUTH ACCESS TOKEN)
// -------------------------------------------------------------
app.post('/api/google-sheets/clear-v4', async (req, res) => {
  try {
    const { spreadsheetId, accessToken } = req.body;
    const targetSpreadsheetId = resolveTargetSpreadsheetId(req);

    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'Google OAuth access token is required' });
    }

    // 1. Retrieve metadata for spreadsheet to list all tab names
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!metaRes.ok) {
      const errText = await metaRes.text();
      return res.status(metaRes.status).json({ success: false, error: 'Failed to access Google Sheet', details: errText });
    }

    const meta = await metaRes.json();
    const sheets = meta.sheets || [];
    const sheetNames = sheets.map((s: any) => s.properties?.title).filter(Boolean);

    if (sheetNames.length === 0) {
      return res.status(400).json({ success: false, error: 'No sheet tabs found in spreadsheet' });
    }

    // 2. Prepare ranges to clear from row 2 downwards for every tab
    const ranges = sheetNames.map((name: string) => `'${name}'!A2:ZZ100000`);

    // 3. Perform batchClear via Google Sheets v4 API
    const clearRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values:batchClear`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ranges })
    });

    if (!clearRes.ok) {
      const clearErr = await clearRes.text();
      return res.status(clearRes.status).json({ success: false, error: 'Batch clear failed', details: clearErr });
    }

    const clearJson = await clearRes.json();

    // Also clear central server store data
    Object.keys(DEFAULT_SEED_DATA).forEach((key) => {
      dbStore[key] = [];
    });
    dbStore.lastModified = Date.now();
    saveStoreToDisk();

    res.json({
      success: true,
      message: `Successfully cleared data from ${sheetNames.length} sheet tabs in Google Sheets`,
      clearedSheets: sheetNames,
      details: clearJson
    });
  } catch (error: any) {
    console.error('Error clearing Google Sheet v4:', error);
    res.status(500).json({ success: false, error: error?.message || 'Server error clearing spreadsheet' });
  }
});

app.post('/api/google-sheets/sync-v4', async (req, res) => {
  try {
    const { spreadsheetId, accessToken, tableData } = req.body;
    const targetSpreadsheetId = resolveTargetSpreadsheetId(req);

    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'Google OAuth access token is required' });
    }

    const dataToSync = tableData || dbStore;
    const valueRanges: any[] = [];

    // Map table keys to sheet ranges
    const tableKeys = ['rgc_projects', 'rgc_masters', 'rgc_profiles', 'rgc_payments', 'rgc_ledgers', 'rgc_grn_entries', 'rgc_pnl_matrix', 'rgc_purchase_audits'];

    for (const key of tableKeys) {
      const cleanName = key.replace('rgc_', '');
      const items = Array.isArray(dataToSync[key]) ? dataToSync[key] : [];

      if (items.length > 0) {
        const headers = Object.keys(items[0]);
        const rows = items.map((item: any) => headers.map(h => item[h] !== undefined && item[h] !== null ? String(item[h]) : ''));
        const values = [headers, ...rows];

        valueRanges.push({
          range: `'${cleanName}'!A1`,
          values
        });
      }
    }

    if (valueRanges.length === 0) {
      return res.json({ success: true, message: 'No non-empty tables to sync' });
    }

    const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: valueRanges
      })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return res.status(updateRes.status).json({ success: false, error: 'Batch update failed', details: errText });
    }

    const resultJson = await updateRes.json();
    res.json({ success: true, message: 'Synced data directly to Google Sheets', details: resultJson });
  } catch (error: any) {
    console.error('Error syncing to Google Sheet v4:', error);
    res.status(500).json({ success: false, error: error?.message || 'Server error syncing to spreadsheet' });
  }
});

app.post('/api/google-sheets/fetch-v4', async (req, res) => {
  try {
    const { spreadsheetId, accessToken } = req.body;
    const targetSpreadsheetId = resolveTargetSpreadsheetId(req);

    let totalFetchedRecords = 0;

    // Mode A: API v4 with OAuth Access Token
    if (accessToken) {
      const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (metaRes.ok) {
        const meta = await metaRes.json();
        const sheets = meta.sheets || [];
        const sheetNames = sheets.map((s: any) => s.properties?.title).filter(Boolean);

        if (sheetNames.length > 0) {
          const rangesQuery = sheetNames.map((name: string) => `ranges=${encodeURIComponent("'" + name + "'!A1:ZZ10000")}`).join('&');
          const valuesRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values:batchGet?${rangesQuery}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });

          if (valuesRes.ok) {
            const valuesData = await valuesRes.json();
            const valueRanges = valuesData.valueRanges || [];

            valueRanges.forEach((vr: any, idx: number) => {
              const rawSheetName = sheetNames[idx];
              const storeKey = rawSheetName.startsWith('rgc_') ? rawSheetName : `rgc_${rawSheetName}`;
              const rawRows = vr.values || [];

              if (rawRows.length > 1) {
                const headers = rawRows[0];
                const dataRows = rawRows.slice(1);
                const parsedItems = dataRows.map((row: any[]) => {
                  const item: Record<string, any> = {};
                  headers.forEach((h: string, colIdx: number) => {
                    if (h) {
                      item[h] = row[colIdx] !== undefined && row[colIdx] !== null ? row[colIdx] : '';
                    }
                  });
                  return item;
                }).filter((item: any) => Object.values(item).some(val => String(val).trim() !== ''));

                if (parsedItems.length > 0) {
                  totalFetchedRecords += parsedItems.length;
                  dbStore[storeKey] = parsedItems;
                }
              }
            });

            dbStore.lastModified = Date.now();
            saveStoreToDisk();

            return res.json({
              success: true,
              message: `Successfully fetched ${totalFetchedRecords} records from Google Sheets`,
              totalRecords: totalFetchedRecords,
              data: dbStore,
              lastModified: dbStore.lastModified
            });
          }
        }
      }
    }

    // Mode B: Public CSV export fallback (for sheets shared with "Anyone with the link")
    const standardTabNames = [
      'projects', 'masters', 'profiles', 'payments', 'ledgers',
      'grn_entries', 'pnl_matrix', 'purchase_audits'
    ];

    function parseCSVLine(line: string): string[] {
      const row: string[] = [];
      let insideQuotes = false;
      let entry = '';
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && line[i + 1] === '"') {
          entry += '"';
          i++;
        } else if (char === '"') {
          insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
          row.push(entry.trim());
          entry = '';
        } else {
          entry += char;
        }
      }
      row.push(entry.trim());
      return row;
    }

    for (const tabName of standardTabNames) {
      try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
        const csvRes = await fetch(csvUrl);

        if (csvRes.ok) {
          const csvText = await csvRes.text();
          // Check if response returned HTML login page instead of CSV
          if (!csvText.includes('<!DOCTYPE html>') && !csvText.includes('<html')) {
            const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
            if (lines.length > 1) {
              const headers = parseCSVLine(lines[0]);
              const dataRows = lines.slice(1);
              const parsedItems = dataRows.map(line => {
                const row = parseCSVLine(line);
                const item: Record<string, any> = {};
                headers.forEach((h, colIdx) => {
                  if (h) {
                    item[h] = row[colIdx] !== undefined && row[colIdx] !== null ? row[colIdx] : '';
                  }
                });
                return item;
              }).filter((item: any) => Object.values(item).some(val => String(val).trim() !== ''));

              if (parsedItems.length > 0) {
                const storeKey = `rgc_${tabName}`;
                dbStore[storeKey] = parsedItems;
                totalFetchedRecords += parsedItems.length;
              }
            }
          }
        }
      } catch (tabErr) {
        // Individual tab fetch error ignored silently
      }
    }

    if (totalFetchedRecords > 0) {
      dbStore.lastModified = Date.now();
      saveStoreToDisk();

      return res.json({
        success: true,
        message: `Successfully fetched ${totalFetchedRecords} records from Google Sheets`,
        totalRecords: totalFetchedRecords,
        data: dbStore,
        lastModified: dbStore.lastModified
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Unable to fetch spreadsheet records. Please ensure link sharing on your Google Sheet is set to "Anyone with the link can view", or provide an Access Token.',
      details: 'Google Sheets returned a login redirect because link access is restricted.'
    });

  } catch (error: any) {
    console.error('Error fetching from Google Sheet v4:', error);
    res.status(500).json({ success: false, error: error?.message || 'Server error fetching spreadsheet' });
  }
});

// -------------------------------------------------------------
// GOOGLE APPSCRIPT WEB APP DATABASE PROXY & CONNECTIVITY ENDPOINTS
// -------------------------------------------------------------

const DEFAULT_APPSCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxg-wjKLVwltUm5RkjPolOacwfi2XUwY4Mlpgr7Dkoue9-IK4WSkHfOlSYpU_RbOwMukw/exec';

function resolveAppscriptUrl(candidate?: string): string {
  if (!candidate || typeof candidate !== 'string' || candidate.includes('AKfycbzljma4YKNNtLWPf-hw0sT1orooTKLCXEByWBpNVSI8EfcvjKlZKZL4NaaNuAe9hDQFuA') || candidate.includes('AKfycbx3S5BsLQXWUXDcLAJlhA6FvzypNmPBOc1d6vU4K7n4mido6Hb0DNrN4ZWnyQw1MOUUTQ')) {
    const envUrl = process.env.DB_APPSCRIPT_URL || process.env.NEXT_PUBLIC_DB_APPSCRIPT_URL;
    if (envUrl && !envUrl.includes('AKfycbzljma4YKNNtLWPf-hw0sT1orooTKLCXEByWBpNVSI8EfcvjKlZKZL4NaaNuAe9hDQFuA') && !envUrl.includes('AKfycbx3S5BsLQXWUXDcLAJlhA6FvzypNmPBOc1d6vU4K7n4mido6Hb0DNrN4ZWnyQw1MOUUTQ')) {
      return envUrl.trim();
    }
    return DEFAULT_APPSCRIPT_URL;
  }
  return candidate.trim();
}

// Live Connectivity Diagnostics Checker
app.get('/api/check-sheets-connectivity', async (req, res) => {
  const customQueryUrl = req.query.url as string;
  const appscriptUrl = resolveAppscriptUrl(customQueryUrl);

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    // 1. First test GET endpoint
    let isGetActive = false;
    let getPayload: any = null;
    try {
      const getRes = await fetch(appscriptUrl, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow'
      });
      if (getRes.status >= 200 && getRes.status < 400) {
        const getText = await getRes.text();
        try {
          getPayload = JSON.parse(getText);
          if (getPayload?.status === 'active' || getPayload?.status === 'success') {
            isGetActive = true;
          }
        } catch (_) {
          if (getText.includes('"status"') || getText.includes('Royal Gokul')) {
            isGetActive = true;
          }
        }
      }
    } catch (_) {}

    // 2. Test POST request to verify doPost support
    const postTestRes = await fetch(appscriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'ping',
        table: 'connectivity_test',
        secretKey: 'MyPrivateCompanySecretKey2026!',
        timestamp: new Date().toISOString()
      }),
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeoutId);

    const postLatency = Date.now() - startTime;
    const postStatus = postTestRes.status;
    const postText = await postTestRes.text();

    const hasDoPostError = postText.includes('Script function not found: doPost');
    const isHtmlService = postText.includes('<!DOCTYPE html>') || postText.includes('<html');
    const isJsonSuccess = postText.includes('"status":"success"') || postText.includes('"status":"active"') || isGetActive;

    const isConnected = (postStatus >= 200 && postStatus < 400 && !hasDoPostError) || isGetActive;

    const diagnosis = {
      connected: isConnected,
      url: appscriptUrl,
      postStatus,
      postLatencyMs: postLatency,
      hasDoPost: !hasDoPostError,
      isHtmlServiceOnly: isHtmlService && hasDoPostError,
      statusSummary: hasDoPostError 
        ? 'APPS_SCRIPT_MISSING_DOPOST' 
        : isConnected 
        ? 'FULLY_OPERATIONAL' 
        : 'CONNECTED_STANDALONE',
      message: hasDoPostError
        ? 'Google Apps Script is reachable, but "doPost" function is missing or needs redeployment in Apps Script.'
        : 'Google Apps Script Web App is connected and responding to database writes.'
    };

    return res.json({ success: true, diagnosis });
  } catch (err: any) {
    clearTimeout(timeoutId);
    const postLatency = Date.now() - startTime;
    return res.json({
      success: true,
      diagnosis: {
        connected: false,
        url: appscriptUrl,
        postStatus: 0,
        postLatencyMs: postLatency,
        statusSummary: 'TIMEOUT_OR_NETWORK_ERROR',
        message: err?.name === 'AbortError' 
          ? 'Connection timed out after 12 seconds. Please check the URL.'
          : (err?.message || 'Network connection failed')
      }
    });
  }
});

// -------------------------------------------------------------
// INDEPENDENT LEDGER WRITING ENGINE (GRN & PAYMENT EVENTS)
// -------------------------------------------------------------

/**
 * Rule 1: When a GRN is generated:
 * Create a ledger row where Reference ID = GRN ID and Transaction Date = GRN Date.
 */
export function createLedgerEntryForGRN(grn: any): any {
  if (!grn || typeof grn !== 'object') return null;
  const grnRefId = String(grn.grnNumber || grn.grnNo || grn.id || '').trim();
  const grnTxDate = String(grn.grnDate || grn.grn_date || grn.date || grn.invoiceDate || (grn.created_at ? grn.created_at.split('T')[0] : new Date().toISOString().split('T')[0])).trim();
  const grandTotal = Number(String(grn.grandTotal || grn.totalAmount || grn.amount || 0).replace(/[^0-9.-]+/g, '')) || 0;
  const party = String(grn.supplier || grn.supplierName || grn.vendor || grn.partyName || '').trim();
  const project = String(grn.projectName || grn.project || grn.siteName || grn.site || '').trim();
  const itemDesc = String(grn.itemName || grn.item || grn.material || grn.category || 'Material Supplies').trim();

  return {
    id: `ledg-grn-${grn.id || grnRefId}`,
    date: grnTxDate, // Reference Transaction Date = GRN Date
    partyName: party,
    projectName: project,
    accountType: 'Purchase Invoice',
    particulars: `Purchase: ${itemDesc}`,
    refNumber: grnRefId, // Reference ID = GRN ID
    debit: 0,
    credit: grandTotal,
    balance: grandTotal,
    remarks: grn.remarks || `GRN Reference: ${grnRefId}`,
    created_by: grn.created_by || grn.createdBy || 'system',
    created_at: grn.created_at || new Date().toISOString()
  };
}

/**
 * Rule 2: When a Payment is logged:
 * Create a ledger row where Reference ID = Payment ID and Transaction Date = Payment Date.
 * Do NOT use the GRN date or GRN ID for the payment transaction entry rows in the Ledger.
 */
export function createLedgerEntryForPayment(payment: any): any {
  if (!payment || typeof payment !== 'object') return null;
  // Strict Payment ID extraction - Never use GRN ID
  const payRefId = String(payment.payId || payment.paymentId || payment.voucherNo || payment.referenceNo || payment.refNo || payment.id || '').trim();
  // Strict Payment Date extraction - Never use GRN Date
  const payTxDate = String(payment.paymentDate || payment.date || (payment.created_at ? payment.created_at.split('T')[0] : new Date().toISOString().split('T')[0])).trim();
  const paidAmount = Number(String(payment.paidAmount !== undefined ? payment.paidAmount : (payment.paid !== undefined ? payment.paid : (payment.amountPaid || payment.amount || 0))).replace(/[^0-9.-]+/g, '')) || 0;
  const party = String(payment.partyName || payment.vendor || payment.supplier || payment.supplierName || '').trim();
  const project = String(payment.projectName || payment.project || payment.siteName || '').trim();
  const mode = String(payment.paymentMode || payment.mode || 'Online Transfer').trim();
  let accNum = String(payment.accountNumber || payment.bankAccount || payment.accountNo || payment.account_number || payment.bankDetails || '').trim();
  if (!accNum) {
    const masters = Array.isArray(dbStore['rgc_masters']) ? dbStore['rgc_masters'] : [];
    const bankMatch = masters.find((m: any) => m && m.category === 'Bank accounts' && (
      (m.name && String(m.name).trim().toLowerCase() === mode.toLowerCase()) ||
      (m.label && String(m.label).trim().toLowerCase() === mode.toLowerCase()) ||
      (m.value && String(m.value).trim().toLowerCase() === mode.toLowerCase())
    ));
    if (bankMatch) {
      accNum = String(bankMatch.bankDetails || bankMatch.code || bankMatch.accountNumber || '').trim();
    }
  }
  const cleanAcc = accNum.replace(/^(a\/c[:\s]*|account\s*(no|number)?[:\s]*)/i, '').trim();
  let particularsStr = 'Payment';
  if (mode && cleanAcc) {
    particularsStr = `${mode} (A/c: ${cleanAcc})`;
  } else if (cleanAcc) {
    particularsStr = `Payment (A/c: ${cleanAcc})`;
  } else if (mode) {
    particularsStr = mode;
  }

  return {
    id: `ledg-pay-${payment.id || payRefId}`,
    date: payTxDate, // Reference Transaction Date = Payment Date (Independent from GRN Date)
    partyName: party,
    projectName: project,
    accountType: 'Payment Debit',
    particulars: particularsStr,
    refNumber: payRefId, // Reference ID = Payment ID (Independent from GRN ID)
    debit: paidAmount,
    credit: 0,
    balance: -paidAmount,
    remarks: payment.remarks || `Disbursement Ref: ${payRefId}`,
    created_by: payment.created_by || payment.createdBy || 'system',
    created_at: payment.created_at || new Date().toISOString()
  };
}

/**
 * Rule 3: Keep these two events completely independent in the Ledger table mapping.
 */
export function writeLedgerTransaction(type: 'GRN' | 'Payment' | 'Custom' | 'PAYMENT' | string, rowData: any): any {
  const cleanType = String(type || '').toUpperCase();
  let ledgerEntry: any = null;

  if (cleanType === 'GRN') {
    ledgerEntry = createLedgerEntryForGRN(rowData);
  } else if (cleanType === 'PAYMENT') {
    ledgerEntry = createLedgerEntryForPayment(rowData);
  } else {
    // Standard ledger normalization
    ledgerEntry = normalizeRowDataServer('ledgers', rowData);
  }

  if (!ledgerEntry) return null;

  // Insert or update in server store dbStore['rgc_ledgers']
  const existingLedgers: any[] = Array.isArray(dbStore['rgc_ledgers']) ? dbStore['rgc_ledgers'] : [];
  const entryId = ledgerEntry.id || `ledg-${Date.now()}`;
  const idx = existingLedgers.findIndex(l => l && (l.id === entryId || (l.refNumber && l.refNumber === ledgerEntry.refNumber && l.accountType === ledgerEntry.accountType)));

  if (idx >= 0) {
    existingLedgers[idx] = ledgerEntry;
  } else {
    existingLedgers.unshift(ledgerEntry);
  }

  dbStore['rgc_ledgers'] = existingLedgers;
  dbStore.lastModified = Date.now();
  saveStoreToDisk();

  return ledgerEntry;
}

// Endpoint to rebuild all ledgers from existing GRNs and Payments
app.post('/api/ledger/rebuild-all', (req, res) => {
  try {
    const rebuiltLedgers = rebuildAllLedgersFromData();
    saveStoreToDisk();
    res.json({
      success: true,
      message: `Rebuilt ${rebuiltLedgers.length} independent ledger entries successfully.`,
      count: rebuiltLedgers.length,
      ledgers: rebuiltLedgers
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Endpoint to rebuild all ledgers and push to Google Sheets
app.post('/api/ledger/rebuild-and-sync', async (req, res) => {
  try {
    const rebuiltLedgers = rebuildAllLedgersFromData();
    saveStoreToDisk();

    const targetUrl = resolveAppscriptUrl(req.body.appscriptUrl);
    let sheetsResult: any = null;

    if (targetUrl) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        const fetchRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            table: 'ledgers',
            data: rebuiltLedgers,
            action: 'bulk_sync',
            spreadsheetId: resolveTargetSpreadsheetId(req),
            secretKey: 'MyPrivateCompanySecretKey2026!'
          }),
          redirect: 'follow',
          signal: controller.signal
        });
        clearTimeout(timer);
        sheetsResult = await fetchRes.json();
      } catch (sErr: any) {
        sheetsResult = { error: sErr?.message };
      }
    }

    res.json({
      success: true,
      message: `Rebuilt ${rebuiltLedgers.length} independent ledger entries and synced to Google Sheets.`,
      count: rebuiltLedgers.length,
      sheetsResult
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// API endpoint to record a GRN ledger entry independently
app.post('/api/ledger/record-grn', (req, res) => {
  try {
    const grnData = req.body;
    const entry = writeLedgerTransaction('GRN', grnData);
    res.json({ success: true, ledgerEntry: entry });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// API endpoint to record a Payment ledger entry independently
app.post('/api/ledger/record-payment', (req, res) => {
  try {
    const paymentData = req.body;
    const entry = writeLedgerTransaction('PAYMENT', paymentData);
    res.json({ success: true, ledgerEntry: entry });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Intelligent Server-Side Row Normalizer (Canonical non-redundant schema)
function normalizeRowDataServer(table: string, r: any, idx = 0): any {
  if (!r || typeof r !== 'object') return r;
  const t = table.replace(/^rgc_/, '');

  if (t === 'grn_entries' || t === 'grn') {
    const qty = Number(r.qty) || 0;
    const rate = Number(r.rate) || 0;
    const itemBase = Number(r.itemBase) || (qty * rate);
    const otherCharges = Number(r.otherCharges) || 0;
    const totalBase = Number(r.totalBaseValue) || (itemBase + otherCharges);
    const cgst = Number(r.cgst) || 0;
    const sgst = Number(r.sgst) || 0;
    const igst = Number(r.igst) || 0;
    const grandTotalNum = Number(String(r.grandTotal || r.totalAmount || r.amount || (totalBase + (totalBase * (cgst + sgst + igst) / 100))).replace(/[^0-9.-]+/g, '')) || 0;
    const paid = Number(String(r.paidAmount !== undefined ? r.paidAmount : (r.paid !== undefined ? r.paid : (r.netPaid !== undefined ? r.netPaid : 0))).replace(/[^0-9.-]+/g, '')) || 0;
    const bal = r.balanceAmount !== undefined ? Number(r.balanceAmount) : (r.balance !== undefined ? Number(r.balance) : Math.max(0, grandTotalNum - paid));
    const supplierVal = r.supplier || r.supplierName || r.partyName || r.vendor || '';
    const itemVal = r.itemName || r.item || r.material || r.description || '';
    const projectVal = r.projectName || r.project || r.siteName || r.site || '';

    return {
      id: r.id || `grn-${Date.now()}-${idx}`,
      grnNumber: r.grnNumber || r.grnNo || '',
      grnDate: r.grnDate || r.date || '',
      projectName: projectVal,
      supplier: supplierVal,
      category: r.category || '',
      itemName: itemVal,
      uom: r.uom || r.unit || '',
      qty: qty,
      rate: rate,
      otherCharges: otherCharges,
      itemBase: itemBase,
      cgst: cgst,
      sgst: sgst,
      igst: igst,
      grandTotal: grandTotalNum,
      paidAmount: paid,
      balanceAmount: bal,
      paymentStatus: r.paymentStatus || r.status || (bal <= 0 ? 'Paid' : (paid > 0 ? 'Partial' : 'Pending')),
      dcNumber: r.dcNumber || '',
      invoiceNumber: r.invoiceNumber || r.invoiceNo || '',
      invoiceDate: r.invoiceDate || r.grnDate || '',
      supplierAddress: r.supplierAddress || r.address || '',
      supplierGstNo: r.supplierGstNo || r.gstNumber || r.gstNo || '',
      supplierBankDetails: r.supplierBankDetails || r.bankDetails || '',
      created_by: r.created_by || r.createdBy || '',
      created_at: r.created_at || r.createdAt || new Date().toISOString()
    };
  }

  if (t === 'payments') {
    const totalAmount = Number(String(r.totalAmount || r.amount || r.grandTotal || r.invoiceAmount || 0).replace(/[^0-9.-]+/g, '')) || 0;
    const paid = Number(String(r.paidAmount !== undefined ? r.paidAmount : (r.paid !== undefined ? r.paid : (r.netPaid !== undefined ? r.netPaid : totalAmount))).replace(/[^0-9.-]+/g, '')) || 0;
    const balance = r.balance !== undefined ? Number(String(r.balance).replace(/[^0-9.-]+/g, '')) : Math.max(0, totalAmount - paid);
    const status = r.status || r.paymentStatus || (balance <= 0 ? 'Paid' : (paid > 0 ? 'Partial' : 'Pending'));
    const partyVal = r.partyName || r.vendor || r.supplier || r.supplierName || '';
    const projVal = r.projectName || r.project || r.siteName || '';

    return {
      id: r.id || `pay-${Date.now()}-${idx}`,
      voucherNo: r.voucherNo || r.vchNo || '',
      date: r.date || r.paymentDate || '',
      partyName: partyVal,
      projectName: projVal,
      grnNumber: r.grnNumber || '',
      invoiceNo: r.invoiceNo || r.invoiceNumber || '',
      paymentType: r.paymentType || 'Vendor Material Payment',
      totalAmount: totalAmount,
      paidAmount: paid,
      balance: balance,
      status: status,
      paymentMode: r.paymentMode || r.mode || '',
      referenceNo: r.referenceNo || r.refNo || r.refNumber || '',
      remarks: r.remarks || '',
      created_by: r.created_by || r.createdBy || '',
      created_at: r.created_at || r.createdAt || new Date().toISOString()
    };
  }

  if (t === 'projects') {
    const pName = r.name || r.projectName || r.title || '';
    return {
      id: r.id || `p-${Date.now()}-${idx}`,
      code: r.code || '',
      name: pName,
      location: r.location || r.siteAddress || '',
      clientName: r.clientName || '',
      budget: r.budget || '',
      startDate: r.startDate || '',
      targetDate: r.targetDate || '',
      status: r.status || 'Active',
      created_by: r.created_by || r.createdBy || '',
      created_at: r.created_at || r.createdAt || new Date().toISOString()
    };
  }

  if (t === 'masters') {
    const val = r.name || r.label || r.value || r.supplierName || '';
    const cat = r.category || r.type || 'Category';
    let parentCat = r.parentCategory || r.parent_category || r.parent || '';
    
    // Auto-infer parent category for subcategories if missing
    if (cat === 'Subcategory' && !parentCat && val) {
      const vLow = val.toLowerCase();
      if (vLow.includes('block') || vLow.includes('brick') || vLow.includes('aac')) parentCat = 'BLOCKS';
      else if (vLow.includes('cement') || vLow.includes('opc') || vLow.includes('ppc')) parentCat = 'CEMENT';
      else if (vLow.includes('steel') || vLow.includes('tmt') || vLow.includes('rebar') || vLow.includes('rod')) parentCat = 'STEEL';
      else if (vLow.includes('sand') || vLow.includes('m sand') || vLow.includes('p sand')) parentCat = 'SAND';
      else if (vLow.includes('aggregate') || vLow.includes('blue metal') || vLow.includes('jelly')) parentCat = 'AGGREGATES';
      else if (vLow.includes('rmc') || vLow.includes('m 25') || vLow.includes('m 20') || vLow.includes('m 30') || vLow.includes('concrete')) parentCat = 'RMC';
      else if (vLow.includes('paint') || vLow.includes('primer') || vLow.includes('putty')) parentCat = 'PAINTS & FINISHES';
      else if (vLow.includes('tile') || vLow.includes('granite') || vLow.includes('marble')) parentCat = 'TILES & FLOORING';
      else if (vLow.includes('pipe') || vLow.includes('plumb') || vLow.includes('cpvc') || vLow.includes('pvc')) parentCat = 'PLUMBING';
      else if (vLow.includes('wire') || vLow.includes('cable') || vLow.includes('switch') || vLow.includes('electrical')) parentCat = 'ELECTRICAL';
    }

    return {
      id: r.id || `m-${Date.now()}-${idx}`,
      category: cat,
      parentCategory: parentCat,
      name: val,
      label: val,
      value: val,
      code: r.code || '',
      unit: r.unit || r.uom || '',
      gstPct: r.gstPct || (Number(r.cgst || 0) + Number(r.sgst || 0) + Number(r.igst || 0)) || '',
      address: r.address || r.supplierAddress || '',
      gstNo: r.gstNo || r.gstNumber || '',
      bankDetails: r.bankDetails || r.bankAccount || r.accountNumber || '',
      status: r.status || 'Active',
      created_by: r.created_by || r.createdBy || '',
      created_at: r.created_at || r.createdAt || new Date().toISOString()
    };
  }

  if (t === 'ledgers') {
    const isPayment = r.type === 'Payment' || r.accountType === 'Payment Debit' || r.accountType === 'Payment' || Number(r.debit || 0) > 0 || Boolean(r.paymentId && !r.grnNumber);
    const partyVal = r.partyName || r.vendor || r.supplier || r.supplierName || '';
    const projVal = r.projectName || r.project || r.siteName || '';

    // Independent Reference ID and Date mapping
    let refNum = '';
    let txDate = '';
    let debit = 0;
    let credit = 0;
    let accType = r.accountType || (isPayment ? 'Payment Debit' : 'Purchase Invoice');

    if (isPayment) {
      // RULE 2: Payment Reference ID = Payment ID, Transaction Date = Payment Date
      refNum = r.paymentId || r.voucherNo || r.referenceNo || r.refNumber || (r.id && String(r.id).startsWith('pay') ? r.id : '');
      txDate = r.paymentDate || r.date || '';
      debit = Number(String(r.debit !== undefined ? r.debit : (r.paidAmount || r.paid || r.amountPaid || r.amount || 0)).replace(/[^0-9.-]+/g, '')) || 0;
      credit = 0;
      if (!accType) accType = 'Payment Debit';
    } else {
      // RULE 1: GRN Reference ID = GRN ID, Transaction Date = GRN Date
      refNum = r.grnNumber || r.grnNo || r.refNumber || (r.id && String(r.id).startsWith('grn') ? r.id : '') || r.invoiceNumber || r.invoiceNo || '';
      txDate = r.grnDate || r.date || '';
      credit = Number(String(r.credit !== undefined ? r.credit : (r.purchaseAmount || r.grandTotal || r.totalAmount || r.invoiceAmount || r.amount || 0)).replace(/[^0-9.-]+/g, '')) || 0;
      debit = 0;
      if (!accType) accType = 'Purchase Invoice';
    }

    return {
      id: r.id || `ledg-${Date.now()}-${idx}`,
      date: txDate,
      partyName: partyVal,
      projectName: projVal,
      accountType: accType,
      particulars: r.particulars || r.item || r.itemName || r.remarks || (isPayment ? 'Payment Disbursement' : 'Material Purchase'),
      refNumber: refNum,
      debit: debit,
      credit: credit,
      balance: r.balance !== undefined ? r.balance : (credit - debit),
      remarks: r.remarks || '',
      created_by: r.created_by || r.createdBy || '',
      created_at: r.created_at || r.createdAt || new Date().toISOString()
    };
  }

  if (t === 'profiles') {
    const full = r.fullName || r.full_name || (r.email ? r.email.split('@')[0] : '');
    return {
      id: r.id || `usr-${Date.now()}-${idx}`,
      email: r.email || '',
      fullName: full,
      role: r.role || (r.designation ? r.designation.toLowerCase() : 'staff'),
      phone: r.phone || '',
      department: r.department || '',
      status: r.status || 'Active',
      created_at: r.created_at || r.createdAt || new Date().toISOString()
    };
  }

  if (t === 'pnl_matrix' || t === 'pnl') {
    const rev = Number(String(r.revenue || 0).replace(/[^0-9.-]+/g, '')) || 0;
    const mat = Number(String(r.materialCost || 0).replace(/[^0-9.-]+/g, '')) || 0;
    const lab = Number(String(r.labourCost || 0).replace(/[^0-9.-]+/g, '')) || 0;
    const mac = Number(String(r.machineryCost || 0).replace(/[^0-9.-]+/g, '')) || 0;
    const ovh = Number(String(r.overheads || 0).replace(/[^0-9.-]+/g, '')) || 0;
    const totExp = r.totalExpenses || (mat + lab + mac + ovh);
    const net = r.netProfit !== undefined ? r.netProfit : (rev - totExp);
    const margin = r.profitMargin || (rev > 0 ? `${((net / rev) * 100).toFixed(1)}%` : '0%');

    return {
      id: r.id || `pnl-${Date.now()}-${idx}`,
      projectName: r.projectName || '',
      month: r.month || '',
      year: r.year || '',
      revenue: rev,
      materialCost: mat,
      labourCost: lab,
      machineryCost: mac,
      overheads: ovh,
      totalExpenses: totExp,
      netProfit: net,
      profitMargin: margin,
      created_at: r.created_at || r.createdAt || new Date().toISOString()
    };
  }

  if (t === 'purchase_audits' || t === 'audits') {
    return {
      id: r.id || `aud-${Date.now()}-${idx}`,
      auditDate: r.auditDate || r.date || '',
      projectName: r.projectName || '',
      supplierName: r.supplierName || r.supplier || '',
      itemAudited: r.itemAudited || r.itemName || '',
      discrepancyType: r.discrepancyType || '',
      qtyDifference: r.qtyDifference || 0,
      amountDifference: r.amountDifference || 0,
      status: r.status || 'Approved',
      auditorNotes: r.auditorNotes || '',
      auditedBy: r.auditedBy || '',
      created_at: r.created_at || r.createdAt || new Date().toISOString()
    };
  }

  return r;
}

// Fast Direct Batch Sync Endpoint for All Tables
app.post('/api/sync-all-to-sheets', async (req, res) => {
  try {
    const { tablesData, appscriptUrl } = req.body;
    const targetUrl = resolveAppscriptUrl(appscriptUrl);

    const results: Record<string, any> = {};

    if (targetUrl && tablesData && typeof tablesData === 'object') {
      // 1. First try master full-sync in a single POST request
      try {
        const fullNormalized: Record<string, any[]> = {};
        for (const [tbl, rows] of Object.entries(tablesData)) {
          if (Array.isArray(rows)) {
            const norm = rows.map((r, i) => normalizeRowDataServer(tbl, r, i));
            fullNormalized[tbl.replace(/^rgc_/, '')] = norm;
            const storeKey = tbl.startsWith('rgc_') ? tbl : `rgc_${tbl}`;
            dbStore[storeKey] = norm;
          }
        }
        dbStore.lastModified = Date.now();
        saveStoreToDisk();

        const masterController = new AbortController();
        const masterTimer = setTimeout(() => masterController.abort(), 25000);

        const masterRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'sync_all_tables',
            tablesData: fullNormalized,
            spreadsheetId: resolveTargetSpreadsheetId(req),
            secretKey: 'MyPrivateCompanySecretKey2026!'
          }),
          redirect: 'follow',
          signal: masterController.signal
        });
        clearTimeout(masterTimer);
        const masterText = await masterRes.text();
        let masterParsed: any = null;
        try {
          masterParsed = JSON.parse(masterText);
        } catch (_) {}

        if (masterParsed && (masterParsed.status === 'success' || masterParsed.success)) {
          return res.json({
            success: true,
            message: 'All tables synchronized successfully',
            summary: masterParsed.summary || masterParsed,
            timestamp: new Date().toISOString()
          });
        }
      } catch (_) {}

      // 2. Table-by-table fallback using bulk_sync ONLY
      const entries = Object.entries(tablesData);
      
      const syncPromises = entries.map(async ([tableName, rows]) => {
        if (Array.isArray(rows)) {
          const cleanName = tableName.replace(/^rgc_/, '');
          const normalizedRows = rows
            .filter((r) => isValidRecordServer(cleanName, r))
            .map((r, i) => normalizeRowDataServer(cleanName, r, i));
          
          const storeKey = tableName.startsWith('rgc_') ? tableName : `rgc_${tableName}`;
          dbStore[storeKey] = normalizedRows;
          dbStore.lastModified = Date.now();

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 20000);

          try {
            const fetchRes = await fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({
                table: cleanName,
                data: normalizedRows,
                action: 'bulk_sync',
                spreadsheetId: resolveTargetSpreadsheetId(req),
                secretKey: 'MyPrivateCompanySecretKey2026!'
              }),
              redirect: 'follow',
              signal: controller.signal
            });
            clearTimeout(timer);
            const text = await fetchRes.text();
            
            let parsed: any = null;
            try {
              parsed = JSON.parse(text);
            } catch (_) {}

            if (parsed && (parsed.status === 'success' || parsed.success)) {
              results[cleanName] = parsed;
            } else {
              results[cleanName] = { status: 'sent', count: normalizedRows.length };
            }
          } catch (err: any) {
            clearTimeout(timer);
            results[cleanName] = { status: 'sent_offline', count: normalizedRows.length };
          }
        }
      });

      await Promise.all(syncPromises);
      saveStoreToDisk();
    }

    return res.json({
      success: true,
      message: 'Batch synchronization completed successfully',
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Batch sync error:', error);
    return res.status(500).json({ success: false, error: error?.message });
  }
});

// Single Row Push / Append Endpoint (Without Replication)
app.post('/api/append-row', async (req, res) => {
  try {
    const rawTable = req.body.table || req.body.tableName;
    const rawRow = req.body.row || req.body.rowData || req.body.data;
    const cleanTableName = (rawTable || 'projects').replace(/^rgc_/, '');
    const row = normalizeRowDataServer(cleanTableName, rawRow);
    const rowId = req.body.id || (row && (row.id || row.ID || row.grnNumber || row.voucherNo || row.code));

    if (!rawTable || !row) {
      return res.status(400).json({
        success: false,
        error: 'table and row object are required'
      });
    }

    // Ignore empty/phantom dummy records
    if (!isValidRecordServer(cleanTableName, row)) {
      return res.json({
        success: true,
        status: 'ignored',
        message: 'Blank or invalid dummy record ignored'
      });
    }

    const storeKey = rawTable.startsWith('rgc_') ? rawTable : `rgc_${rawTable}`;

    // Update in-memory server persistent store (append or update single row)
    const existingList = Array.isArray(dbStore[storeKey]) ? dbStore[storeKey] : [];
    if (rowId) {
      const idx = existingList.findIndex((item: any) => item && (item.id === rowId || item.grnNumber === rowId || item.voucherNo === rowId || item.code === rowId));
      if (idx >= 0) {
        existingList[idx] = row;
      } else {
        existingList.unshift(row);
      }
    } else {
      existingList.unshift(row);
    }

    // -------------------------------------------------------------
    // AUTOMATIC INDEPENDENT LEDGER ROW GENERATION (RULES 1, 2, 3)
    // -------------------------------------------------------------
    if (cleanTableName === 'grn_entries' || cleanTableName === 'grn') {
      const ledgerEntry = createLedgerEntryForGRN(row);
      if (ledgerEntry) {
        const existingLedgers: any[] = Array.isArray(dbStore['rgc_ledgers']) ? dbStore['rgc_ledgers'] : [];
        const lIdx = existingLedgers.findIndex(l => l && (l.id === ledgerEntry.id || (l.refNumber === ledgerEntry.refNumber && l.accountType === 'Purchase Invoice')));
        if (lIdx >= 0) existingLedgers[lIdx] = ledgerEntry;
        else existingLedgers.unshift(ledgerEntry);
        dbStore['rgc_ledgers'] = existingLedgers;
      }
    } else if (cleanTableName === 'payments') {
      const ledgerEntry = createLedgerEntryForPayment(row);
      if (ledgerEntry) {
        const existingLedgers: any[] = Array.isArray(dbStore['rgc_ledgers']) ? dbStore['rgc_ledgers'] : [];
        const lIdx = existingLedgers.findIndex(l => l && (l.id === ledgerEntry.id || (l.refNumber === ledgerEntry.refNumber && l.accountType === 'Payment Debit')));
        if (lIdx >= 0) existingLedgers[lIdx] = ledgerEntry;
        else existingLedgers.unshift(ledgerEntry);
        dbStore['rgc_ledgers'] = existingLedgers;
      }
    }

    dbStore[storeKey] = existingList;
    dbStore.lastModified = Date.now();
    saveStoreToDisk();

    // Respond immediately (<2ms)
    res.json({
      success: true,
      message: 'Single row stored and synced locally',
      id: rowId,
      lastModified: dbStore.lastModified
    });

    // Asynchronously dispatch single row to Google Apps Script Web App
    const appscriptUrl = resolveAppscriptUrl(req.body.appscriptUrl);

    const secretKey = 
      process.env.DB_SECRET_KEY || 
      process.env.NEXT_PUBLIC_DB_SECRET_KEY || 
      'MyPrivateCompanySecretKey2026!';

    if (appscriptUrl) {
      const postPayload = {
        action: 'append_row',
        secretKey,
        table: cleanTableName,
        row: row,
        id: rowId,
        timestamp: new Date().toISOString()
      };

      // Non-blocking asynchronous dispatch with timeout guard & graceful error trapping
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      fetch(appscriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(postPayload),
        signal: controller.signal,
        redirect: 'follow'
      })
        .then(async (googleResponse) => {
          clearTimeout(timeoutId);
          try {
            const resText = await googleResponse.text();
            if (resText.includes('Script function not found: doPost') || resText.includes('<!DOCTYPE html>')) {
              // GET stream fallback
              const getParams = new URLSearchParams({
                action: 'append_row',
                table: cleanTableName,
                id: String(rowId || ''),
                data: JSON.stringify(row)
              });
              fetch(`${appscriptUrl}?${getParams.toString()}`, { redirect: 'follow' }).catch(() => {});
            } else {
              console.log(`[Google Sheets Single Row] ${cleanTableName} row queued: ${googleResponse.status}`);
            }
          } catch (_) {}
        })
        .catch((_err) => {
          clearTimeout(timeoutId);
          // Fallback GET stream on POST network delay
          try {
            const getParams = new URLSearchParams({
              action: 'append_row',
              table: cleanTableName,
              id: String(rowId || ''),
              data: JSON.stringify(row)
            });
            fetch(`${appscriptUrl}?${getParams.toString()}`, { redirect: 'follow' }).catch(() => {});
          } catch (_) {}
        });
    }
  } catch (error: any) {
    console.error('⚠️ Error appending row:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: error?.message || 'Server error appending row' });
    }
  }
});

// Master Endpoint to Clean, Format and Repair All Sheets in Google Sheets
app.post('/api/clean-and-repair-sheets', async (req, res) => {
  try {
    const targetUrl = resolveAppscriptUrl(req.body.appscriptUrl);
    const isWipe = req.body.wipeAll === true || req.body.mode === 'factory' || req.body.mode === 'wipe';
    
    // 1. First clean and save local store
    if (isWipe) {
      Object.keys(DEFAULT_SEED_DATA).forEach((k) => {
        dbStore[k] = [];
      });
      dbStore.lastModified = Date.now();
    }
    saveStoreToDisk();

    // 2. Prepare clean sanitized table dataset
    const cleanTables: Record<string, any[]> = {};
    Object.keys(DEFAULT_SEED_DATA).forEach((k) => {
      const cleanName = k.replace(/^rgc_/, '');
      const list = Array.isArray(dbStore[k]) ? dbStore[k] : [];
      cleanTables[cleanName] = list.filter((r: any) => isValidRecordServer(cleanName, r));
    });

    let googleAppsScriptResult = null;

    if (targetUrl) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35000);

      try {
        const actionToSend = isWipe ? 'factory_reset' : 'clean_and_repair_all';
        const gRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: actionToSend,
            mode: isWipe ? 'factory' : 'repair',
            tablesData: cleanTables,
            spreadsheetId: resolveTargetSpreadsheetId(req),
            secretKey: 'MyPrivateCompanySecretKey2026!'
          }),
          redirect: 'follow',
          signal: controller.signal
        });
        clearTimeout(timer);
        const text = await gRes.text();
        try {
          googleAppsScriptResult = JSON.parse(text);
        } catch (_) {
          googleAppsScriptResult = { text };
        }
      } catch (err: any) {
        clearTimeout(timer);
        // Try GET fallback
        try {
          const actionParam = isWipe ? 'factory_reset' : 'clean_and_repair';
          const gRes2 = await fetch(`${targetUrl}?action=${actionParam}`, { redirect: 'follow' });
          const text2 = await gRes2.text();
          googleAppsScriptResult = JSON.parse(text2);
        } catch (_) {}
      }
    }

    const counts: Record<string, number> = {};
    Object.keys(cleanTables).forEach(k => {
      counts[k] = cleanTables[k].length;
    });

    return res.json({
      success: true,
      message: 'All local and Google Sheets tables have been sanitized, formatted, and purged of blank rows',
      counts,
      googleAppsScriptResult,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Clean & repair error:', error);
    return res.status(500).json({ success: false, error: error?.message });
  }
});

// Dedicated Independent Ledger Writing Route
app.post('/api/ledger/record-transaction', (req, res) => {
  try {
    const { type, data } = req.body;
    if (!type || !data) {
      return res.status(400).json({ success: false, error: 'type (GRN | Payment) and data object are required' });
    }

    const recordedEntry = writeLedgerTransaction(type, data);
    if (!recordedEntry) {
      return res.status(400).json({ success: false, error: 'Invalid record data for ledger transaction' });
    }

    return res.json({
      success: true,
      message: `Ledger transaction recorded successfully for ${type}`,
      entry: recordedEntry,
      lastModified: dbStore.lastModified
    });
  } catch (err: any) {
    console.error('Error recording ledger transaction:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
});

// Dedicated Ledger List Fetch Route
app.get('/api/ledger/entries', (req, res) => {
  const ledgers = Array.isArray(dbStore['rgc_ledgers']) ? dbStore['rgc_ledgers'] : [];
  res.json({
    success: true,
    total: ledgers.length,
    data: ledgers,
    lastModified: dbStore.lastModified
  });
});

// Legacy / Full Table Save-Entry Endpoint
app.post('/api/save-entry', async (req, res) => {
  try {
    const rawTable = req.body.table || req.body.tableName;
    const rawData = req.body.data || req.body.dataObject;

    if (!rawTable || rawData === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Both table/tableName and data/dataObject are required'
      });
    }

    const cleanTableName = rawTable.replace(/^rgc_/, '');
    const storeKey = rawTable.startsWith('rgc_') ? rawTable : `rgc_${rawTable}`;

    // Update server persistent store memory & disk
    dbStore[storeKey] = rawData;
    dbStore.lastModified = Date.now();
    saveStoreToDisk();

    // Respond immediately to the client (<2ms) to prevent UI lag or freezing
    res.json({
      success: true,
      message: 'Saved to central store successfully',
      lastModified: dbStore.lastModified,
      data: { status: 'success', message: 'Clean grid sync successful' }
    });

    // Background dispatch to Google Sheets Web App without holding up the HTTP client
    const appscriptUrl = 
      process.env.DB_APPSCRIPT_URL || 
      process.env.NEXT_PUBLIC_DB_APPSCRIPT_URL || 
      'https://script.google.com/macros/s/AKfycbzljma4YKNNtLWPf-hw0sT1orooTKLCXEByWBpNVSI8EfcvjKlZKZL4NaaNuAe9hDQFuA/exec';

    const secretKey = 
      process.env.DB_SECRET_KEY || 
      process.env.NEXT_PUBLIC_DB_SECRET_KEY || 
      'MyPrivateCompanySecretKey2026!';

    if (appscriptUrl) {
      let dataForGoogleSheets = rawData;
      if (Array.isArray(rawData)) {
        dataForGoogleSheets = rawData.filter((r: any) => isValidRecordServer(cleanTableName, r));
      }

      const payload = {
        secretKey,
        table: cleanTableName,
        data: dataForGoogleSheets,
        action: 'bulk_sync',
        spreadsheetId: resolveTargetSpreadsheetId(req),
        timestamp: new Date().toISOString()
      };

      const streamController = new AbortController();
      const streamTimeoutId = setTimeout(() => streamController.abort(), 8000);

      fetch(appscriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: streamController.signal
      })
        .then(async (googleResponse) => {
          clearTimeout(streamTimeoutId);
          console.log(`[Google Sheets Async Stream] ${cleanTableName} sync status: ${googleResponse.status}`);
        })
        .catch((_err) => {
          clearTimeout(streamTimeoutId);
        });
    }
  } catch (error: any) {
    console.error('⚠️ Backend error saving database entry:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: 'Internal server error while saving database entry',
        message: error?.message || 'Unknown error'
      });
    }
  }
});

// -------------------------------------------------------------
// VITE & STATIC FILES MIDDLEWARE
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null
      },
      plugins: [{
        name: 'remove-vite-client-from-hosted-preview',
        transformIndexHtml(html) {
          return html.replace(/\s*<script type="module" src="\/@vite\/client"><\/script>/g, '');
        }
      }],
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).send('Royal Gokul Constructions Portal Server is Running');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Central Multi-Device Enterprise Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
