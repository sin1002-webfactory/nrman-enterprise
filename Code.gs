/**
 * =========================================================================
 * ROYAL GOKUL CONSTRUCTIONS - ENTERPRISE MANAGEMENT BACKEND (Code.gs)
 * Google Apps Script Web App & Spreadsheet Sync Controller
 * =========================================================================
 */

// Private API Secret Key (matches frontend DB_SECRET_KEY)
var DB_SECRET_KEY = "MyPrivateCompanySecretKey2026!";

// Target Google Spreadsheet ID
var SPREADSHEET_ID = "1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs";

/**
 * ⚡ INSTANT 1-CLICK CLEANING & REPAIR FUNCTION:
 * In Google Apps Script, select "RUN_MANUAL_CLEAN_ALL_SHEETS" in the top toolbar dropdown
 * and click "▶ Run"!
 * It will instantly format all 8 sheets, eliminate ALL blank rows, align columns,
 * and freeze styled headers in 2 seconds.
 */
function RUN_MANUAL_CLEAN_ALL_SHEETS() {
  var res = cleanAndRepairAllSheets();
  Logger.log("=== CLEAN & REPAIR RESULT ===");
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

/**
 * Standard canonical table schemas (Clean, ordered, non-redundant columns)
 */
var TABLE_SCHEMAS = {
  'nrman_master_database': [
    'id', 'clientCode', 'companyName', 'prefix', 'gstNumber', 'logoUrl', 
    'googleEmail', 'spreadsheetId', 'spreadsheetUrl', 'status', 'createdAt', 'lastUpdated'
  ],
  'clients': [
    'id', 'clientCode', 'clientName', 'contactEmail', 'phone', 'plan', 
    'status', 'companiesCount', 'createdAt'
  ],
  'projects': [
    'id', 'code', 'name', 'location', 'clientName', 'budget', 
    'startDate', 'targetDate', 'status', 'created_by', 'created_at'
  ],
  'grn_entries': [
    'id', 'grnNumber', 'grnDate', 'projectName', 'supplier', 'category', 
    'itemName', 'uom', 'qty', 'rate', 'otherCharges', 'itemBase', 'cgst', 
    'sgst', 'igst', 'grandTotal', 'paidAmount', 'balanceAmount', 'paymentStatus', 
    'dcNumber', 'invoiceNumber', 'invoiceDate', 'supplierAddress', 'supplierGstNo', 
    'supplierBankDetails', 'created_by', 'created_at'
  ],
  'payments': [
    'id', 'voucherNo', 'date', 'partyName', 'projectName', 'grnNumber', 
    'invoiceNo', 'paymentType', 'totalAmount', 'paidAmount', 'balance', 
    'status', 'paymentMode', 'referenceNo', 'remarks', 'created_by', 'created_at'
  ],
  'masters': [
    'id', 'category', 'name', 'code', 'unit', 'gstPct', 
    'address', 'gstNo', 'bankDetails', 'status', 'created_by', 'created_at'
  ],
  'ledgers': [
    'id', 'date', 'partyName', 'projectName', 'accountType', 
    'particulars', 'refNumber', 'debit', 'credit', 'balance', 'remarks', 
    'created_by', 'created_at'
  ],
  'profiles': [
    'id', 'email', 'fullName', 'role', 'phone', 'department', 'status', 'created_at'
  ],
  'pnl_matrix': [
    'id', 'projectName', 'month', 'year', 'revenue', 'materialCost', 
    'labourCost', 'machineryCost', 'overheads', 'totalExpenses', 'netProfit', 
    'profitMargin', 'created_at'
  ],
  'purchase_audits': [
    'id', 'auditDate', 'projectName', 'supplierName', 'itemAudited', 
    'discrepancyType', 'qtyDifference', 'amountDifference', 'status', 
    'auditorNotes', 'auditedBy', 'created_at'
  ]
};

/**
 * Helper to get the target spreadsheet (bound or standalone by ID)
 */
function getTargetSpreadsheet(optId) {
  var targetId = (optId && String(optId).trim() !== "") ? String(optId).trim() : SPREADSHEET_ID;
  if (targetId && String(targetId).trim() !== "") {
    try {
      return SpreadsheetApp.openById(String(targetId).trim());
    } catch (err) {
      Logger.log("Could not open spreadsheet by ID: " + err);
    }
  }
  var active = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
  if (!active) throw new Error('Master spreadsheet is not configured or accessible');
  return active;
}

function ensureMasterSpreadsheet() {
  var ss = getTargetSpreadsheet();
  getOrCreateSheet(ss, 'nrman_master_database');
  getOrCreateSheet(ss, 'clients');
  return ss;
}

/**
 * Validates whether a row object has real operational data or is just a blank/dummy phantom
 */
function isValidRecord(table, r) {
  if (!r || typeof r !== 'object') return false;
  var t = String(table || '').toLowerCase().replace(/^rgc_/, '').trim();
  var idStr = String(r.id || '');

  if (t === 'projects') {
    var hasName = Boolean(r.name && String(r.name).trim() !== '');
    var hasCode = Boolean(r.code && String(r.code).trim() !== '');
    var hasLoc = Boolean(r.location && String(r.location).trim() !== '');
    return (hasName || hasCode || hasLoc) && !idStr.startsWith('pay-') && !idStr.startsWith('grn-') && !idStr.startsWith('m-');
  }

  if (t === 'payments') {
    var hasParty = Boolean(r.partyName && String(r.partyName).trim() !== '');
    var hasVoucher = Boolean(r.voucherNo && String(r.voucherNo).trim() !== '');
    var hasInvoice = Boolean(r.invoiceNo && String(r.invoiceNo).trim() !== '');
    var hasGrn = Boolean(r.grnNumber && String(r.grnNumber).trim() !== '');
    var tot = Number(String(r.totalAmount || r.amount || 0).replace(/[^0-9.-]+/g, '')) || 0;
    var pd = Number(String(r.paidAmount || r.paid || 0).replace(/[^0-9.-]+/g, '')) || 0;
    return (hasParty || hasVoucher || hasInvoice || hasGrn || tot > 0 || pd > 0) && !idStr.startsWith('p-') && !idStr.startsWith('usr-');
  }

  if (t === 'grn_entries') {
    var hasItem = Boolean((r.itemName || r.item || r.material) && String(r.itemName || r.item || r.material).trim() !== '');
    var hasSupp = Boolean((r.supplier || r.supplierName || r.vendor) && String(r.supplier || r.supplierName || r.vendor).trim() !== '');
    var hasGrnNo = Boolean((r.grnNumber || r.grnNo) && String(r.grnNumber || r.grnNo).trim() !== '');
    var grnTot = Number(String(r.grandTotal || r.totalAmount || 0).replace(/[^0-9.-]+/g, '')) || 0;
    return (hasItem || hasSupp || hasGrnNo || grnTot > 0) && !idStr.startsWith('p-');
  }

  if (t === 'masters') {
    var hasMName = Boolean((r.name || r.label || r.value) && String(r.name || r.label || r.value).trim() !== '');
    return hasMName && !idStr.startsWith('p-') && !idStr.startsWith('pay-');
  }

  if (t === 'ledgers') {
    var hasLParty = Boolean((r.partyName || r.vendor || r.supplier) && String(r.partyName || r.vendor || r.supplier).trim() !== '');
    var hasPart = Boolean((r.particulars || r.item) && String(r.particulars || r.item).trim() !== '');
    var dr = Number(String(r.debit || 0).replace(/[^0-9.-]+/g, '')) || 0;
    var cr = Number(String(r.credit || 0).replace(/[^0-9.-]+/g, '')) || 0;
    return hasLParty || hasPart || dr > 0 || cr > 0;
  }

  if (t === 'profiles') {
    var hasEmail = Boolean(r.email && String(r.email).trim() !== '');
    var hasFull = Boolean((r.fullName || r.full_name) && String(r.fullName || r.full_name).trim() !== '');
    return hasEmail || hasFull;
  }

  if (t === 'pnl_matrix') {
    var hasPnlProj = Boolean(r.projectName && String(r.projectName).trim() !== '');
    var rev = Number(String(r.revenue || 0).replace(/[^0-9.-]+/g, '')) || 0;
    var exp = Number(String(r.totalExpenses || 0).replace(/[^0-9.-]+/g, '')) || 0;
    return hasPnlProj || rev > 0 || exp > 0;
  }

  if (t === 'purchase_audits') {
    var hasAudProj = Boolean(r.projectName && String(r.projectName).trim() !== '');
    var hasAudSupp = Boolean(r.supplierName && String(r.supplierName).trim() !== '');
    var hasAudItem = Boolean(r.itemAudited && String(r.itemAudited).trim() !== '');
    return hasAudProj || hasAudSupp || hasAudItem;
  }

  return true;
}

/**
 * Resolves a specific field value strictly without creating duplicate or misaligned values
 */
function extractFieldValue(rowObj, colName) {
  if (!rowObj || typeof rowObj !== 'object') return '';
  
  // If property exists directly on object and is a valid scalar
  if (rowObj[colName] !== undefined && rowObj[colName] !== null && rowObj[colName] !== '') {
    var val = rowObj[colName];
    if (typeof val !== 'object') return val;
  }

  // Exact case-insensitive matching
  var colLower = String(colName).toLowerCase();
  for (var k in rowObj) {
    if (String(k).toLowerCase() === colLower && rowObj[k] !== undefined && rowObj[k] !== null && rowObj[k] !== '') {
      var val2 = rowObj[k];
      if (typeof val2 !== 'object') return val2;
    }
  }

  // Strict field aliases
  var fieldAliases = {
    'name': ['projectName', 'label', 'value', 'title', 'fullName'],
    'projectname': ['project', 'siteName', 'site', 'name'],
    'supplier': ['supplierName', 'partyName', 'vendor'],
    'partyname': ['vendor', 'supplier', 'supplierName', 'party'],
    'itemname': ['materialName', 'item', 'material', 'description'],
    'uom': ['unit'],
    'unit': ['uom'],
    'voucherno': ['vchNo', 'voucherNumber'],
    'invoiceno': ['invoiceNumber'],
    'invoicenumber': ['invoiceNo'],
    'paidamount': ['paid', 'netPaid'],
    'balanceamount': ['balance'],
    'balance': ['balanceAmount'],
    'paymentstatus': ['status'],
    'status': ['paymentStatus'],
    'fullname': ['full_name', 'name'],
    'created_by': ['createdBy'],
    'created_at': ['createdAt']
  };

  var aliases = fieldAliases[colLower];
  if (aliases) {
    for (var a = 0; a < aliases.length; a++) {
      var aliasKey = aliases[a];
      if (rowObj[aliasKey] !== undefined && rowObj[aliasKey] !== null && rowObj[aliasKey] !== '') {
        var val3 = rowObj[aliasKey];
        if (typeof val3 !== 'object') return val3;
      }
    }
  }

  return '';
}

/**
 * Ensures a sheet tab exists with clean canonical headers and dark navy header formatting
 */
function getOrCreateSheet(ss, rawTableName) {
  var tableName = String(rawTableName || '').toLowerCase().replace(/^rgc_/, '').trim();
  var sheet = ss.getSheetByName(tableName);
  var canonical = TABLE_SCHEMAS[tableName] || ['id', 'created_at', 'data'];
  
  if (!sheet) sheet = ss.insertSheet(tableName);

  var existingHeaders = sheet.getLastColumn() > 0 ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), canonical.length)).getValues()[0] : [];
  var headerMatches = canonical.every(function(header, index) { return String(existingHeaders[index] || '').trim() === header; });
  if (!headerMatches) {
    var lastRow = sheet.getLastRow();
    var oldRows = lastRow > 1 && existingHeaders.length ? sheet.getRange(2, 1, lastRow - 1, existingHeaders.length).getValues() : [];
    var migrated = oldRows.map(function(row) {
      var obj = {};
      existingHeaders.forEach(function(header, index) { if (header) obj[String(header)] = row[index]; });
      return canonical.map(function(header) { return extractFieldValue(obj, header); });
    });
    sheet.clearContents();
    sheet.getRange(1, 1, 1, canonical.length).setValues([canonical]);
    if (migrated.length) sheet.getRange(2, 1, migrated.length, canonical.length).setValues(migrated);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, canonical.length).setValues([canonical]);
  }
  var headerRange = sheet.getRange(1, 1, 1, canonical.length);
  headerRange.setFontWeight('bold').setBackground('#0f172a').setFontColor('#f59e0b');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 28);
  return sheet;
}

/**
 * Master Sheet Rebuilder & Cleaner:
 * Clears sheet, writes canonical headers in Row 1, writes only valid rows continuously from Row 2 (NO gaps),
 * formats cells, and removes ALL trailing empty rows beyond the data.
 */
function cleanAndRebuildSheet(ss, rawTableName, validRows) {
  var tableName = String(rawTableName || '').toLowerCase().replace(/^rgc_/, '').trim();
  var canonical = TABLE_SCHEMAS[tableName] || ['id', 'created_at'];
  var sheet = ss.getSheetByName(tableName);

  if (!sheet) {
    sheet = ss.insertSheet(tableName);
  }

  // 1. Wipe all existing contents and formats
  sheet.clearContents();
  sheet.clearFormats();

  // 2. Write exact canonical headers in Row 1
  sheet.getRange(1, 1, 1, canonical.length).setValues([canonical]);
  var headerRange = sheet.getRange(1, 1, 1, canonical.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#0f172a');
  headerRange.setFontColor('#f59e0b');
  headerRange.setFontSize(10);
  headerRange.setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 28);

  // 3. Filter valid rows only (no partial/ghost rows)
  var filteredRows = [];
  var seenIds = {};
  if (Array.isArray(validRows)) {
    for (var i = 0; i < validRows.length; i++) {
      var r = validRows[i];
      if (isValidRecord(tableName, r)) {
        var recId = r.id || r.ID || r.grnNumber || r.voucherNo || r.code || JSON.stringify(r);
        if (!seenIds[recId]) {
          seenIds[recId] = true;
          filteredRows.push(r);
        }
      }
    }
  }

  // 4. Build 2D matrix of clean values
  if (filteredRows.length > 0) {
    var matrix = [];
    for (var rIdx = 0; rIdx < filteredRows.length; rIdx++) {
      var rowObj = filteredRows[rIdx];
      var rowArr = [];
      for (var cIdx = 0; cIdx < canonical.length; cIdx++) {
        var colName = canonical[cIdx];
        var cellVal = extractFieldValue(rowObj, colName);
        rowArr.push(cellVal !== undefined && cellVal !== null ? cellVal : '');
      }
      matrix.push(rowArr);
    }

    // Write all rows continuously starting at Row 2
    var dataRange = sheet.getRange(2, 1, matrix.length, canonical.length);
    dataRange.setValues(matrix);
    dataRange.setFontSize(9);
    dataRange.setVerticalAlignment('middle');

    // Clean number formatting for currency/numeric columns
    for (var c = 0; c < canonical.length; c++) {
      var col = canonical[c].toLowerCase();
      var colRange = sheet.getRange(2, c + 1, matrix.length, 1);
      if (col.includes('amount') || col === 'budget' || col === 'grandtotal' || col === 'balance' || col === 'debit' || col === 'credit' || col === 'revenue' || col === 'netprofit') {
        colRange.setNumberFormat('#,##0.00');
      } else if (col === 'qty' || col === 'rate' || col === 'cgst' || col === 'sgst' || col === 'igst') {
        colRange.setNumberFormat('0.##');
      }
    }
  }

  // 5. Trim extra empty rows so there are ZERO trailing blank rows
  var currentMaxRows = sheet.getMaxRows();
  var neededRows = filteredRows.length > 0 ? (filteredRows.length + 1) : 2;
  if (currentMaxRows > neededRows) {
    try {
      sheet.deleteRows(neededRows + 1, currentMaxRows - neededRows);
    } catch (_) {}
  }

  // 6. Auto-fit columns
  try {
    sheet.autoResizeColumns(1, canonical.length);
  } catch (_) {}

  return { success: true, table: tableName, count: filteredRows.length };
}

/**
 * Appends or updates a single record row in the specified sheet tab
 */
function appendRowData(rawTableName, rowData, optSpreadsheetId) {
  if (!rowData) {
    return { success: false, error: 'Invalid row data' };
  }

  if (Array.isArray(rowData)) {
    var count = 0;
    for (var i = 0; i < rowData.length; i++) {
      var res = appendRowData(rawTableName, rowData[i], optSpreadsheetId);
      if (res && res.success) count++;
    }
    return { success: true, action: 'bulk_synced', count: count };
  }

  if (typeof rowData === 'string') {
    try {
      rowData = JSON.parse(rowData);
    } catch (_) {
      return { success: false, error: 'Could not parse JSON row string' };
    }
  }

  var tableName = String(rawTableName || '').toLowerCase().replace(/^rgc_/, '').trim();
  
  // Guard against blank or invalid phantom records
  if (!isValidRecord(tableName, rowData)) {
    return { success: false, error: 'Ignored blank or invalid record' };
  }

  var ss = getTargetSpreadsheet(optSpreadsheetId);
  var sheet = getOrCreateSheet(ss, tableName);
  var canonical = TABLE_SCHEMAS[tableName] || ['id', 'created_at'];

  var lastRow = sheet.getLastRow();

  // Find record ID to prevent duplicate row creation
  var recordId = rowData.id || rowData.ID || rowData.grnNumber || rowData.voucherNo || rowData.code || '';
  var idColIdx = canonical.indexOf('id');
  if (idColIdx === -1) idColIdx = 0;

  var existingRowIndex = -1;
  if (recordId && lastRow >= 2) {
    var idColumnValues = sheet.getRange(2, idColIdx + 1, lastRow - 1, 1).getValues();
    for (var r = 0; r < idColumnValues.length; r++) {
      var cellId = String(idColumnValues[r][0]).trim();
      if (cellId === String(recordId).trim() && cellId !== '') {
        existingRowIndex = r + 2;
        break;
      }
    }
  }

  // Build clean row array strictly matching canonical columns
  var rowArray = [];
  for (var c = 0; c < canonical.length; c++) {
    var colName = canonical[c];
    var val = extractFieldValue(rowData, colName);
    rowArray.push(val !== undefined && val !== null ? val : '');
  }

  if (existingRowIndex > 0) {
    sheet.getRange(existingRowIndex, 1, 1, rowArray.length).setValues([rowArray]);
    return { success: true, action: 'updated', rowNumber: existingRowIndex, id: recordId };
  } else {
    var targetRow = lastRow + 1;
    if (lastRow < 1) targetRow = 2;
    sheet.getRange(targetRow, 1, 1, rowArray.length).setValues([rowArray]);
    return { success: true, action: 'appended', rowNumber: targetRow, id: recordId };
  }
}

/**
 * Bulk synchronizes multiple rows to a sheet tab
 */
function syncTableData(rawTableName, recordsArray, optSpreadsheetId) {
  if (!Array.isArray(recordsArray)) {
    recordsArray = [];
  }

  var validList = [];
  for (var i = 0; i < recordsArray.length; i++) {
    if (isValidRecord(rawTableName, recordsArray[i])) {
      validList.push(recordsArray[i]);
    }
  }

  var ss = getTargetSpreadsheet(optSpreadsheetId);
  return cleanAndRebuildSheet(ss, rawTableName, validList);
}

/**
 * Reads a single table's rows as an array of clean JSON objects
 */
function readTableData(rawTableName, optSpreadsheetId) {
  var ss = getTargetSpreadsheet(optSpreadsheetId);
  if (!ss) return [];
  
  var tableName = String(rawTableName || '').toLowerCase().replace(/^rgc_/, '').trim();
  var sheet = ss.getSheetByName(tableName);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  var canonical = TABLE_SCHEMAS[tableName] || ['id', 'created_at'];
  if (lastRow < 2) {
    return [];
  }

  var values = sheet.getRange(1, 1, lastRow, canonical.length).getValues();
  var headers = values[0].map(function(h) { return String(h).trim(); });
  var records = [];

  for (var r = 1; r < values.length; r++) {
    var rowValues = values[r];
    var hasContent = rowValues.some(function(v) { return v !== '' && v !== null && v !== undefined; });
    if (!hasContent) continue;

    var recordObj = {};
    for (var c = 0; c < headers.length; c++) {
      var headerName = headers[c];
      if (!headerName || /^\d+$/.test(headerName)) continue;
      
      var cellVal = rowValues[c];
      if (cellVal instanceof Date) {
        cellVal = Utilities.formatDate(cellVal, Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
      }
      recordObj[headerName] = cellVal !== undefined && cellVal !== null ? cellVal : '';
    }

    if (isValidRecord(tableName, recordObj)) {
      records.push(recordObj);
    }
  }

  return records;
}

/**
 * Clean & Format All Sheets across the entire spreadsheet
 */
function cleanAndRepairAllSheets() {
  var ss = getTargetSpreadsheet();
  var summary = {};

  for (var tbl in TABLE_SCHEMAS) {
    var currentData = readTableData(tbl);
    var res = cleanAndRebuildSheet(ss, tbl, currentData);
    summary[tbl] = res.count;
  }

  return {
    status: 'success',
    message: 'All sheets cleared of blank rows, aligned to canonical columns, and formatted',
    summary: summary
  };
}

/**
 * -------------------------------------------------------------------------
 * WEB APP ENTRY POINT (doGet)
 * Serves the HTML frontend (main / Index / index) or handles GET API queries
 * -------------------------------------------------------------------------
 */
function doGet(e) {
  e = e || { parameter: {} };
  var action = e.parameter.action;

  // Handle API GET requests (READ ONLY or explicitly requested actions)
  if (action === 'readData') {
    var tableName = e.parameter.table || 'projects';
    var records = readTableData(tableName);
    return ContentService.createTextOutput(JSON.stringify(records))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'clean_and_repair' || action === 'clean_and_repair_all' || action === 'repair') {
    var repairRes = cleanAndRepairAllSheets();
    return ContentService.createTextOutput(JSON.stringify(repairRes))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'ping' || action === 'test') {
    var ss = getTargetSpreadsheet();
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Connected to Royal Gokul Constructions Gateway',
      spreadsheetName: ss ? ss.getName() : 'Target Spreadsheet',
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'append_row' || action === 'save_row') {
    var tbl = e.parameter.table || 'projects';
    var rowParam = e.parameter.data || e.parameter.row;
    if (!rowParam) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'No row data provided' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var writeRes = appendRowData(tbl, rowParam);
    return ContentService.createTextOutput(JSON.stringify(writeRes))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Serve HTML: Dynamically try 'main', 'Index', and 'index'
  var template = null;
  var filenames = ['main', 'Index', 'index'];
  for (var f = 0; f < filenames.length; f++) {
    try {
      template = HtmlService.createTemplateFromFile(filenames[f]);
      break;
    } catch (err) {}
  }

  if (!template) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;padding:24px;background:#0f172a;color:#f8fafc;border-radius:12px;max-width:600px;margin:40px auto;text-align:center;">' +
      '<h2 style="color:#f59e0b;">Royal Gokul Constructions Gateway Online</h2>' +
      '<p>Google Apps Script is active and listening for real-time synchronization.</p>' +
      '</div>'
    ).setTitle('Royal Gokul Constructions - Enterprise Portal');
  }

  return template.evaluate()
    .setTitle('Royal Gokul Constructions - Enterprise Portal')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=5.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * -------------------------------------------------------------------------
 * WEB APP API ENDPOINT (doPost)
 * -------------------------------------------------------------------------
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(15000);

  try {
    var postData = {};
    if (e && e.postData && e.postData.contents) {
      try {
        postData = JSON.parse(e.postData.contents);
      } catch (_) {
        postData = {};
      }
    }

    var action = postData.action || '';
    var tableName = postData.table || postData.tableName || 'projects';

    if (action === 'clean_and_repair' || action === 'clean_and_repair_all') {
      var ss = getTargetSpreadsheet(postData.spreadsheetId);
      var tablesData = postData.tablesData || {};
      var summary = {};
      
      for (var tbl in TABLE_SCHEMAS) {
        var rowsForTable = Array.isArray(tablesData[tbl]) ? tablesData[tbl] : (Array.isArray(tablesData['rgc_' + tbl]) ? tablesData['rgc_' + tbl] : readTableData(tbl));
        var res = cleanAndRebuildSheet(ss, tbl, rowsForTable);
        summary[tbl] = res.count;
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        success: true,
        message: 'All sheets sanitized, reformatted, and cleared of blank gaps',
        summary: summary
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'check_company_sheet') {
      var checkId = postData.spreadsheetId;
      var cEmailCheck = postData.googleEmail || '';
      var cPrefixCheck = (postData.prefix || '').toUpperCase();
      if (!checkId || String(checkId).trim() === '' || String(checkId).startsWith('sheet_')) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          exists: false,
          message: 'No valid Google Spreadsheet ID provided'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      try {
        var checkSs = SpreadsheetApp.openById(String(checkId).trim());
        var sheets = checkSs.getSheets().map(function(s) { return s.getName().toLowerCase(); });
        var operationalTables = ['projects', 'grn_entries', 'payments', 'masters', 'ledgers', 'profiles', 'pnl_matrix', 'purchase_audits'];
        var missing = [];
        var present = [];
        for (var k = 0; k < operationalTables.length; k++) {
          if (sheets.indexOf(operationalTables[k]) !== -1) {
            present.push(operationalTables[k]);
          } else {
            missing.push(operationalTables[k]);
          }
        }

        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          exists: true,
          spreadsheetId: checkSs.getId(),
          spreadsheetUrl: checkSs.getUrl(),
          spreadsheetName: checkSs.getName(),
          allTablesPresent: missing.length === 0,
          presentTables: present,
          missingTables: missing,
          tablesCount: present.length,
          googleEmail: cEmailCheck,
          prefix: cPrefixCheck
        })).setMimeType(ContentService.MimeType.JSON);
      } catch (errCheck) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          exists: false,
          error: errCheck.toString(),
          message: 'Spreadsheet not found or access denied for ID: ' + checkId
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (action === 'CREATE_COMPANY_WORKSPACE' || action === 'create_company_sheet' || action === 'ensure_company_sheet') {
      var cName = postData.companyName || 'New Company';
      var cPrefix = (postData.prefix || 'COMP').toUpperCase();
      var cGst = postData.gstNumber || '';
      var cEmail = postData.googleEmail || '';
      var cLogo = postData.logoUrl || postData.logoBase64 || '';
      var cClientCode = postData.clientCode || 'rgc@nrman';
      var existingId = postData.spreadsheetId;

      var targetSs = null;
      var isNewlyCreated = false;

      // If an existing valid Google Sheet ID was provided, try to open it
      if (existingId && !String(existingId).startsWith('sheet_')) {
        try {
          targetSs = SpreadsheetApp.openById(String(existingId).trim());
        } catch (_) {}
      }

      // If not existing, create a brand new Google Spreadsheet named after the company
      if (!targetSs) {
        var sheetTitle = cName + ' - Operational Database';
        targetSs = SpreadsheetApp.create(sheetTitle);
        isNewlyCreated = true;
      }

      var newId = targetSs.getId();
      var newUrl = targetSs.getUrl();

      // Share spreadsheet with editor permission for the specified Google account
      if (cEmail && String(cEmail).includes('@')) {
        var cleanEmail = String(cEmail).trim();
        try {
          targetSs.addEditor(cleanEmail);
        } catch (eShare1) {
          try {
            DriveApp.getFileById(newId).addEditor(cleanEmail);
          } catch (eShare2) {
            Logger.log('Could not add editor: ' + eShare2);
          }
        }
      }

      // Initialize all 8 canonical operational sub-tables with formatted headers
      var operationalTables = ['projects', 'grn_entries', 'payments', 'masters', 'ledgers', 'profiles', 'pnl_matrix', 'purchase_audits'];
      for (var t = 0; t < operationalTables.length; t++) {
        getOrCreateSheet(targetSs, operationalTables[t]);
      }

      // Remove default blank "Sheet1" if operational sub-tables exist
      try {
        var defaultSheet1 = targetSs.getSheetByName("Sheet1");
        if (defaultSheet1 && targetSs.getSheets().length > 1) {
          targetSs.deleteSheet(defaultSheet1);
        }
      } catch (_) {}

      // Record in master database sheet nrman_master_database
  try {
    var masterSs = ensureMasterSpreadsheet();
    var masterRecord = {
          id: 'rec-' + cPrefix.toLowerCase() + '-' + Date.now(),
          clientCode: cClientCode,
          companyName: cName,
          prefix: cPrefix,
          gstNumber: cGst,
          logoUrl: cLogo,
          googleEmail: cEmail,
          spreadsheetId: newId,
          spreadsheetUrl: newUrl,
          status: 'Active',
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        appendRowData('nrman_master_database', masterRecord);
      } catch (_) {}

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        success: true,
        isNewlyCreated: isNewlyCreated,
        message: 'Google Sheet "' + targetSs.getName() + '" successfully configured with 8 sub-tables for ' + (cEmail || 'company'),
        spreadsheetId: newId,
        spreadsheetUrl: newUrl,
        companyName: cName,
        prefix: cPrefix,
        gstNumber: cGst,
        googleEmail: cEmail,
        tables: operationalTables
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'pull_all_tables' || action === 'pull_company_data') {
      var pullSs = getTargetSpreadsheet(postData.spreadsheetId);
      var pullTables = ['projects', 'grn_entries', 'payments', 'masters', 'ledgers', 'profiles', 'pnl_matrix', 'purchase_audits'];
      var pulledData = {};
      var pulledCounts = {};
      for (var p = 0; p < pullTables.length; p++) {
        var pName = pullTables[p];
        try {
          var pRows = readTableData(pName);
          pulledData[pName] = pRows;
          pulledCounts[pName] = pRows.length;
        } catch (ePull) {
          pulledData[pName] = [];
          pulledCounts[pName] = 0;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        success: true,
        spreadsheetId: pullSs ? pullSs.getId() : '',
        data: pulledData,
        counts: pulledCounts,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'create_master_sheet') {
      var mOwnerEmail = postData.ownerEmail || 'sinchanar1002@gmail.com';
      var mSs = null;
      var isNewMaster = false;
      var existingMasterId = postData.spreadsheetId;
      // Never use RGC Primary for nrman_master_database
      if (existingMasterId && !String(existingMasterId).startsWith('sheet_') && String(existingMasterId).trim() !== SPREADSHEET_ID) {
        try { mSs = SpreadsheetApp.openById(String(existingMasterId).trim()); } catch(_) {}
      }
      if (!mSs) {
        try {
          mSs = SpreadsheetApp.create('nrman master database');
          isNewMaster = true;
        } catch(eCreate) {
          Logger.log('SpreadsheetApp.create failed: ' + eCreate);
        }
      }
      if (!mSs) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          success: false,
          error: 'Could not create new spreadsheet nrman_master_database. Please create it directly via Google Sheets and link the URL.'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      if (mOwnerEmail && String(mOwnerEmail).includes('@')) {
        try { mSs.addEditor(String(mOwnerEmail).trim()); } catch(_) {}
      }
      var masterEntries = Array.isArray(postData.entries) ? postData.entries : (Array.isArray(postData.data) ? postData.data : []);
      cleanAndRebuildSheet(mSs, 'nrman_master_database', masterEntries);
      if (Array.isArray(postData.clients)) {
        cleanAndRebuildSheet(mSs, 'clients', postData.clients);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        success: true,
        created: isNewMaster,
        spreadsheetId: mSs.getId(),
        spreadsheetUrl: mSs.getUrl(),
        message: 'Separate Master Google Sheet nrman_master_database configured successfully'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'sync_master_database') {
      var masterSs2 = getTargetSpreadsheet(postData.spreadsheetId);
      var entries = Array.isArray(postData.entries) ? postData.entries : (Array.isArray(postData.data) ? postData.data : []);
      var resMaster = cleanAndRebuildSheet(masterSs2, 'nrman_master_database', entries);
      if (Array.isArray(postData.clients)) {
        cleanAndRebuildSheet(masterSs2, 'clients', postData.clients);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        success: true,
        message: 'nrman_master_database synced successfully with ' + resMaster.count + ' rows',
        count: resMaster.count
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'append_row' || action === 'save_row' || action === 'save_master_entry') {
      var row = postData.row || postData.data || postData.dataObject;
      if (!row) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'No row data provided' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var targetTable = (action === 'save_master_entry' || tableName === 'master_database') ? 'nrman_master_database' : tableName;
      var result = appendRowData(targetTable, row, postData.spreadsheetId);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        success: true,
        action: result.action,
        table: targetTable,
        result: result
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'replace_table' || action === 'bulk_sync' || action === 'save_data') {
      var targetTbl = tableName === 'master_database' ? 'nrman_master_database' : tableName;
      var dataArray = Array.isArray(postData.data) ? postData.data : (postData.data ? [postData.data] : []);
      var ssTarget = getTargetSpreadsheet(postData.spreadsheetId);
      var syncResult = cleanAndRebuildSheet(ssTarget, targetTbl, dataArray);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        success: true,
        count: syncResult.count,
        table: targetTbl,
        result: syncResult
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'delete_row') {
      var rowToDelete = postData.data || postData.row || {};
      var delId = String(rowToDelete.id || rowToDelete.voucherNo || rowToDelete.grnNumber || rowToDelete.payId || rowToDelete.paymentId || rowToDelete.code || postData.id || '').trim();
      var targetTblDel = tableName === 'master_database' ? 'nrman_master_database' : tableName;
      var ssDel = getTargetSpreadsheet(postData.spreadsheetId);
      var sheetDel = ssDel.getSheetByName(targetTblDel);
      var deletedCount = 0;
      if (sheetDel && delId) {
        var lastRowDel = sheetDel.getLastRow();
        if (lastRowDel >= 2) {
          var dataDel = sheetDel.getDataRange().getValues();
          for (var rDel = lastRowDel; rDel >= 2; rDel--) {
            var rowVals = dataDel[rDel - 1];
            var matched = false;
            for (var cDel = 0; cDel < rowVals.length; cDel++) {
              if (String(rowVals[cDel]).trim() === delId) {
                matched = true;
                break;
              }
            }
            if (matched) {
              sheetDel.deleteRow(rDel);
              deletedCount++;
            }
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        success: true,
        deletedCount: deletedCount,
        id: delId,
        table: targetTblDel
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'sync_all_tables') {
      var ss2 = getTargetSpreadsheet(postData.spreadsheetId);
      var tablesData2 = postData.tablesData || {};
      var summary2 = {};
      var total = 0;
      for (var tblKey in TABLE_SCHEMAS) {
        var rows2 = Array.isArray(tablesData2[tblKey]) ? tablesData2[tblKey] : (Array.isArray(tablesData2['rgc_' + tblKey]) ? tablesData2['rgc_' + tblKey] : []);
        var res2 = cleanAndRebuildSheet(ss2, tblKey, rows2);
        summary2[tblKey] = res2.count;
        total += res2.count;
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        success: true,
        totalSynced: total,
        summary: summary2
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'ping') {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'doPost is active and operational'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Unknown or unspecified action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
