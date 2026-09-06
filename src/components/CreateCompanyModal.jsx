import React, { useState } from 'react';
import { Building2, Upload, Loader2, X, CheckCircle2, AlertCircle, FileSpreadsheet, Mail, Sparkles, KeyRound, ExternalLink, Plus, Receipt, ShieldAlert, Check, HelpCircle } from 'lucide-react';
import { 
  getAppScriptUrl, 
  DB_SECRET_KEY, 
  extractSpreadsheetId, 
  isRealGoogleSheetId, 
  getCreateGoogleSheetUrl,
  startAutoSyncLoop,
  scheduleAutoPush,
  checkGstDuplicate,
  initializeGoogleSheetSubTables,
  saveMasterDatabaseRecord
} from '@/lib/saveToDatabase';
import { compressImageFile, safeSetItem } from '@/lib/storageHelper';

export default function CreateCompanyModal({ isOpen, onClose, onCompanyCreated, onSuccess }) {
  const [companyName, setCompanyName] = useState('');
  const [customPrefix, setCustomPrefix] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [gstError, setGstError] = useState('');
  const [isCheckingGst, setIsCheckingGst] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');
  const [customSpreadsheetUrl, setCustomSpreadsheetUrl] = useState('');
  const [logoBase64, setLogoBase64] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  // Real-time GST duplicate checker
  const handleGstChange = async (val) => {
    const formatted = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
    setGstNumber(formatted);
    setErrorMsg('');
    
    if (formatted.length === 15) {
      setIsCheckingGst(true);
      const activeClientCode = (typeof window !== 'undefined' && localStorage.getItem('rgc_client_code')) || 'rgc@nrman';
      const duplicateRes = await checkGstDuplicate(formatted, activeClientCode, customPrefix);
      setIsCheckingGst(false);
      if (duplicateRes.isDuplicate) {
        setGstError(`Duplicate GSTIN: Already registered for "${duplicateRes.companyName}" [${duplicateRes.prefix}]. Multiple companies cannot have the same GST number.`);
      } else {
        setGstError('');
      }
    } else {
      setGstError('');
    }
  };

  // Ultra-compressed Base64 Image Conversion
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024 * 5) {
      setErrorMsg("File size exceeds 5MB limit.");
      return;
    }

    try {
      // Compress to 120x120 webp/jpeg to keep size under 8KB
      const compressedB64 = await compressImageFile(file, 120, 0.7);
      setLogoBase64(compressedB64);
      setPreviewUrl(compressedB64);
      setErrorMsg('');
    } catch (err) {
      setErrorMsg('Failed to process image logo. Please try another image.');
    }
  };

  const handleCreateCompanySubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!companyName.trim()) {
      setErrorMsg('Company Legal Name is required. Please enter the name of the company.');
      return;
    }

    const autoPrefix = companyName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() || 'COMP';
    const finalPrefix = (customPrefix.trim() || autoPrefix).toUpperCase();

    if (!finalPrefix) {
      setErrorMsg('Company Prefix is required (e.g. RGC, APX).');
      return;
    }

    const cleanGoogleEmail = googleEmail.trim().toLowerCase();
    const cleanGst = gstNumber.trim().toUpperCase();
    const activeClientCode = (typeof window !== 'undefined' && localStorage.getItem('rgc_client_code')) || 'rgc@nrman';

    // 1. Mandatory GST Number and Format Validation
    if (!cleanGst) {
      setErrorMsg('GST Number is mandatory. Please enter the company GSTIN (e.g. 29AAAAA0000A1Z5).');
      return;
    }

    if (cleanGst.length !== 15) {
      setErrorMsg('Invalid GST Number length. Standard Indian GSTIN must be exactly 15 alphanumeric characters (e.g. 29ABCDE1234F1Z5).');
      return;
    }

    setLoading(true);

    // 2. Strict Duplicate GST Validation Across All Companies
    const duplicateRes = await checkGstDuplicate(cleanGst, activeClientCode, finalPrefix);
    if (duplicateRes.isDuplicate) {
      setErrorMsg(`Duplicate GST Number: Company "${duplicateRes.companyName}" [${duplicateRes.prefix}] is already registered with GSTIN "${cleanGst}". Multiple companies cannot share the same GST number.`);
      setGstError(`Already registered for "${duplicateRes.companyName}" [${duplicateRes.prefix}]`);
      setLoading(false);
      return;
    }

    const requestedSpreadsheetId = extractSpreadsheetId(customSpreadsheetUrl);
    const companyData = {
      id: `comp_${Date.now()}`,
      name: companyName.trim(),
      companyName: companyName.trim(),
      gstNumber: cleanGst,
      logo: logoBase64 || null,
      logoBase64: logoBase64 || null,
      prefix: finalPrefix,
      clientCode: activeClientCode,
      googleEmail: cleanGoogleEmail || null,
      spreadsheetId: null,
      spreadsheetUrl: null,
      sheetsCreated: false,
      tables: [],
      createdAt: new Date().toISOString()
    };

    try {
      // 1. Provision backend server scoped tables for this company (with duplicate GST check on server)
      const provRes = await fetch('/api/company/provision-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          prefix: finalPrefix,
          gstNumber: cleanGst,
          googleEmail: cleanGoogleEmail,
          customSpreadsheetId: isRealGoogleSheetId(requestedSpreadsheetId) ? requestedSpreadsheetId : undefined,
          clientCode: activeClientCode,
          logoBase64: logoBase64 || ''
        })
      });

      const provData = await provRes.json().catch(() => ({}));
      if (!provRes.ok || !provData.success || !isRealGoogleSheetId(provData.spreadsheetId)) {
        setErrorMsg(provData.error || 'Google Sheets provisioning failed. No company was saved.');
        setLoading(false);
        return;
      }

      companyData.spreadsheetId = provData.spreadsheetId;
      companyData.spreadsheetUrl = provData.spreadsheetUrl;
      companyData.tables = provData.tables || [];
      companyData.sheetsCreated = true;

      // 3. Dispatch to Google Apps Script if reachable
      const targetUrl = getAppScriptUrl();
      if (targetUrl) {
        try {
          await fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "CREATE_COMPANY_WORKSPACE",
              companyName: companyName.trim(),
              gstNumber: cleanGst,
              logoBase64: logoBase64 || "",
              prefix: finalPrefix,
              googleEmail: cleanGoogleEmail,
              spreadsheetId: companyData.spreadsheetId,
              secretKey: DB_SECRET_KEY
            }),
            redirect: 'follow'
          });
        } catch (_) {}
      }

      // 4. Save safely to client-scoped company registry
      let existing = [];
      try {
        existing = JSON.parse(localStorage.getItem(`rgc_company_registry_${activeClientCode}`) || localStorage.getItem('rgc_company_registry') || '[]');
      } catch (_) {}
      const filtered = Array.isArray(existing) ? existing.filter(c => c && c.prefix !== finalPrefix) : [];
      const updated = [companyData, ...filtered];
      
      safeSetItem(`rgc_company_registry_${activeClientCode}`, JSON.stringify(updated));
      safeSetItem('rgc_company_registry', JSON.stringify(updated));
      safeSetItem('rgc_active_company', JSON.stringify(companyData));

      // 4b. Register company in nrman_master_database
      saveMasterDatabaseRecord({
        id: `rec-${finalPrefix.toLowerCase()}-${Date.now()}`,
        clientCode: activeClientCode,
        companyName: companyName.trim(),
        prefix: finalPrefix,
        gstNumber: cleanGst,
        logoUrl: previewUrl || logoBase64 || '',
        googleEmail: cleanGoogleEmail,
        spreadsheetId: companyData.spreadsheetId,
        spreadsheetUrl: companyData.spreadsheetUrl,
        status: 'Active',
        createdAt: companyData.createdAt,
        lastUpdated: new Date().toISOString()
      }).catch((e) => console.warn('Master record sync error:', e));

      // 5. Initialize 2-way push & pull sync immediately in background
      startAutoSyncLoop();
      scheduleAutoPush(200);

      setSuccessMsg(`Company "${companyName}" (GST: ${cleanGst}) provisioned with separate Google Sheet [${finalPrefix}]!`);

      setTimeout(() => {
        if (onCompanyCreated) onCompanyCreated(companyData);
        if (onSuccess) onSuccess(companyData);
        onClose();
      }, 900);

    } catch (err) {
      // Fallback local save
      let existing = [];
      try {
        existing = JSON.parse(localStorage.getItem('rgc_company_registry') || '[]');
      } catch (_) {}
      const filtered = Array.isArray(existing) ? existing.filter(c => c && c.prefix !== finalPrefix) : [];
      safeSetItem('rgc_company_registry', JSON.stringify([companyData, ...filtered]));
      safeSetItem('rgc_active_company', JSON.stringify(companyData));
      
      setTimeout(() => {
        if (onCompanyCreated) onCompanyCreated(companyData);
        if (onSuccess) onSuccess(companyData);
        onClose();
      }, 1000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden my-auto">
        {/* Modal Sticky Header - Never cut off */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-900/95 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Create New Company</h3>
              <p className="text-xs text-slate-400">Independent company workspace with dedicated Google Sheet</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleCreateCompanySubmit} noValidate className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-200 text-xs flex items-center gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span className="font-semibold">{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-200 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span className="font-semibold">{successMsg}</span>
            </div>
          )}

          {/* Company Legal Name & Prefix - PROMINENT & ALWAYS VISIBLE AT TOP */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-200 mb-1">
                Company Legal Name <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Royal Gokul Constructions Pvt Ltd"
                value={companyName}
                onChange={(e) => {
                  setCompanyName(e.target.value);
                  if (!customPrefix) {
                    const auto = e.target.value.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase();
                    setCustomPrefix(auto);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">
                Prefix Code <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="e.g. RGC"
                value={customPrefix}
                onChange={(e) => setCustomPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-amber-400 font-mono font-bold focus:outline-none uppercase"
              />
            </div>
          </div>

          {/* GST Number (GSTIN) with Strict Duplicate Prevention */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-amber-400" />
                <span>GST Number (GSTIN) <span className="text-amber-400">*</span></span>
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                {gstNumber.length}/15 chars
              </span>
            </div>
            <div className="relative">
              <input
                type="text"
                maxLength={15}
                placeholder="e.g. 29AAAAA0000A1Z5 (15 digits alphanumeric)"
                value={gstNumber}
                onChange={(e) => handleGstChange(e.target.value)}
                className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-xs font-mono font-semibold tracking-wider text-slate-100 placeholder-slate-600 focus:outline-none uppercase ${
                  gstError 
                    ? 'border-rose-500 focus:border-rose-500 bg-rose-950/20 text-rose-200' 
                    : gstNumber.length === 15 
                      ? 'border-emerald-500 focus:border-emerald-500 text-emerald-300' 
                      : 'border-slate-700 focus:border-amber-500'
                }`}
              />
              <div className="absolute right-3 top-2.5 flex items-center gap-1">
                {isCheckingGst && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
                {!isCheckingGst && gstNumber.length === 15 && !gstError && (
                  <Check className="w-4 h-4 text-emerald-400" />
                )}
                {gstError && (
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                )}
              </div>
            </div>

            {/* Live Duplicate Warning */}
            {gstError ? (
              <p className="text-[11px] text-rose-400 mt-1 flex items-start gap-1 font-medium bg-rose-950/50 p-2 rounded-lg border border-rose-800/40">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{gstError}</span>
              </p>
            ) : (
              <p className="text-[10px] text-slate-400 mt-1">
                Every company must have a unique 15-character GSTIN. Duplicate GST numbers across multiple companies are strictly prevented.
              </p>
            )}
          </div>

          {/* Google Account Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-amber-400" />
                Company Google Account (For Company's Own Sheet)
              </span>
              <span className="text-[10px] text-amber-400/80 font-normal">Their Own Account</span>
            </label>
            <input
              type="email"
              placeholder="e.g. accounts@acmeinfra.com or company@gmail.com"
              value={googleEmail}
              onChange={(e) => setGoogleEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            />
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              This company's operational Google Sheet (<code className="text-amber-400">[{customPrefix || 'PREFIX'}]_Tables</code>) will be saved in <strong className="text-slate-200">their own Google account</strong>. The Master CEO Database remains linked strictly to root admin (<strong className="text-amber-300">sinchanar1002@gmail.com</strong>).
            </p>
          </div>

          {/* Custom or Auto Google Sheet */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-amber-400">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Dedicated Company Google Sheet</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const title = `${companyName.trim() || customPrefix || 'Company'} Operational Tables`;
                  window.open(getCreateGoogleSheetUrl(title, googleEmail.trim()), '_blank');
                }}
                className="text-[10px] text-amber-400 hover:text-amber-300 underline flex items-center gap-1 cursor-pointer font-sans"
              >
                <span>⚡ Create Sheet in Drive (sheets.new)</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Paste the Google Spreadsheet URL or Sheet ID below. You can click above to create a blank Google Sheet in 1 click, then paste its link here.
            </p>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-slate-400">
                  Google Spreadsheet URL or ID (Optional)
                </label>
                {customSpreadsheetUrl.trim() && (
                  <span className={`text-[10px] font-mono ${isRealGoogleSheetId(extractSpreadsheetId(customSpreadsheetUrl)) ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isRealGoogleSheetId(extractSpreadsheetId(customSpreadsheetUrl)) ? '✓ Valid Sheet ID' : '⚠ Link can be configured later'}
                  </span>
                )}
              </div>
              <input
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XR.../edit"
                value={customSpreadsheetUrl}
                onChange={(e) => setCustomSpreadsheetUrl(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Sub-Tables Explanation Card */}
          <div className="p-3 bg-blue-950/20 border border-blue-800/40 rounded-xl text-xs space-y-1">
            <div className="flex items-center gap-1.5 text-blue-300 font-semibold text-[11px]">
              <HelpCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>How Sub-Tables Are Created in Google Sheets:</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              NrMAN automatically provisions all 8 operational sub-tables (<code className="text-amber-300">Projects</code>, <code className="text-amber-300">GRN_Entries</code>, <code className="text-amber-300">Payments</code>, <code className="text-amber-300">Masters</code>, <code className="text-amber-300">Ledgers</code>, <code className="text-amber-300">Profiles</code>, <code className="text-amber-300">PnL_Matrix</code>, <code className="text-amber-300">Purchase_Audits</code>) with styled headers in this company's separate sheet!
            </p>
          </div>

          {/* Company Logo Upload */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Company Logo</label>
            <div className="flex items-center gap-3">
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="w-12 h-12 object-contain rounded-xl border border-slate-700 bg-slate-950 p-1" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 text-xs font-bold">
                  LOGO
                </div>
              )}
              <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-dashed border-slate-600 rounded-xl p-3 text-xs text-slate-300 transition">
                <Upload className="w-4 h-4" />
                <span>{previewUrl ? "Change Logo File" : "Upload Logo Image"}</span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Image is automatically compressed to protect browser quota and storage</p>
          </div>

          {/* Modal Sticky Footer - Always visible */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3 sticky bottom-0 bg-slate-900/95 py-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || Boolean(gstError)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition disabled:opacity-50 text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-amber-500/20"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Company & Provision Separate Sheets"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
