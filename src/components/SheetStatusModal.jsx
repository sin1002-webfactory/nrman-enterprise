import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, CheckCircle2, AlertTriangle, RefreshCw, 
  ExternalLink, ArrowUpRight, ArrowDownLeft, X, Mail, ShieldCheck, 
  Copy, Check, Layers, Database, Sparkles, Building2
} from 'lucide-react';
import { 
  isRealGoogleSheetId, getOpenGoogleSheetUrl, 
  checkCompanySheetStatus, initializeGoogleSheetSubTables,
  pushAllTablesToGoogleSheets, pullCompanySheetData,
  updateCompanySpreadsheet
} from '../lib/saveToDatabase';

export default function SheetStatusModal({
  isOpen,
  onClose,
  company,
  clientCode,
  onCompanyUpdated
}) {
  const [isChecking, setIsChecking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncType, setSyncType] = useState(null); // 'push' | 'pull' | 'setup'
  const [statusResult, setStatusResult] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [copied, setCopied] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [customEmailInput, setCustomEmailInput] = useState('');
  const [showManualLink, setShowManualLink] = useState(false);

  const subTablesList = [
    { key: 'projects', label: 'Projects Table', desc: 'Active sites, codes & budgets' },
    { key: 'grn_entries', label: 'GRN Entries', desc: 'Material inwards, invoices & POs' },
    { key: 'payments', label: 'Payments Register', desc: 'Disbursements, vouchers & modes' },
    { key: 'masters', label: 'Masters Directory', desc: 'Vendors, categories & units' },
    { key: 'ledgers', label: 'Party Ledgers', desc: 'Double-entry debits, credits & balance' },
    { key: 'profiles', label: 'Profiles & Users', desc: 'Role access & team members' },
    { key: 'pnl_matrix', label: 'PnL Matrix', desc: 'Project financial performance' },
    { key: 'purchase_audits', label: 'Purchase Audits', desc: 'Discrepancy & compliance logs' }
  ];

  useEffect(() => {
    if (isOpen && company) {
      setCustomUrlInput(company.spreadsheetUrl || '');
      setCustomEmailInput(company.googleEmail || 'sinchanar1002@gmail.com');
      runCheck();
    } else {
      setStatusResult(null);
      setFeedback(null);
      setShowManualLink(false);
    }
  }, [isOpen, company]);

  const runCheck = async () => {
    if (!company) return;
    setIsChecking(true);
    setFeedback(null);
    try {
      const res = await checkCompanySheetStatus({
        prefix: company.prefix,
        spreadsheetId: company.spreadsheetId,
        googleEmail: company.googleEmail || 'sinchanar1002@gmail.com',
        companyName: company.name || company.companyName
      });
      setStatusResult(res);
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Could not verify sheet status' });
    } finally {
      setIsChecking(false);
    }
  };

  const handleSetupAllSubTables = async () => {
    if (!company) return;
    setIsSyncing(true);
    setSyncType('setup');
    setFeedback(null);
    try {
      const res = await initializeGoogleSheetSubTables({
        spreadsheetId: company.spreadsheetId,
        prefix: company.prefix,
        companyName: company.name || company.companyName,
        googleEmail: company.googleEmail || 'sinchanar1002@gmail.com',
        clientCode: clientCode || 'rgc@nrman'
      });

      if (res && res.success) {
        if (res.spreadsheetId && isRealGoogleSheetId(res.spreadsheetId)) {
          const updated = {
            ...company,
            spreadsheetId: res.spreadsheetId,
            spreadsheetUrl: res.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${res.spreadsheetId}/edit`,
            googleEmail: res.googleEmail || company.googleEmail || 'sinchanar1002@gmail.com',
            sheetsCreated: true
          };
          updateCompanySpreadsheet(company.prefix, updated);
          if (onCompanyUpdated) onCompanyUpdated(updated);
        }
        setFeedback({ 
          type: 'success', 
          message: `All 8 sub-tables and column headers successfully configured in Google Sheets for ${company.name || company.prefix}!` 
        });
        await runCheck();
      } else {
        setFeedback({ 
          type: 'error', 
          message: res?.error || 'Failed to setup sub-tables in Google Sheets' 
        });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Error setting up sub-tables' });
    } finally {
      setIsSyncing(false);
      setSyncType(null);
    }
  };

  const handlePushData = async () => {
    if (!company) return;
    setIsSyncing(true);
    setSyncType('push');
    setFeedback(null);
    try {
      const res = await pushAllTablesToGoogleSheets(null, {
        spreadsheetId: company.spreadsheetId,
        prefix: company.prefix
      });
      if (res && res.success) {
        setFeedback({
          type: 'success',
          message: `Successfully pushed ${res.totalPushed || 0} local operational records to Google Sheet!`
        });
        await runCheck();
      } else {
        setFeedback({
          type: 'error',
          message: res?.error || 'Failed to push data to Google Sheet'
        });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Error pushing data to Google Sheet' });
    } finally {
      setIsSyncing(false);
      setSyncType(null);
    }
  };

  const handlePullData = async () => {
    if (!company) return;
    setIsSyncing(true);
    setSyncType('pull');
    setFeedback(null);
    try {
      const res = await pullCompanySheetData({
        prefix: company.prefix,
        spreadsheetId: company.spreadsheetId
      });
      if (res && res.success) {
        const counts = res.counts || {};
        const total = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0);
        setFeedback({
          type: 'success',
          message: `Successfully pulled ${total} rows across all 8 sub-tables from Google Sheet into ERP!`
        });
      } else {
        setFeedback({
          type: 'error',
          message: res?.error || 'Failed to pull data from Google Sheet. Make sure sheet exists and has data.'
        });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Error pulling data from Google Sheet' });
    } finally {
      setIsSyncing(false);
      setSyncType(null);
    }
  };

  const handleLinkCustomSheet = async () => {
    if (!customUrlInput.trim()) {
      setFeedback({ type: 'error', message: 'Please paste a Google Sheet URL or ID' });
      return;
    }
    const match = customUrlInput.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const extractedId = match ? match[1] : customUrlInput.trim();

    if (!isRealGoogleSheetId(extractedId)) {
      setFeedback({ type: 'error', message: 'Please enter a valid Google Sheet ID (at least 20 alphanumeric characters)' });
      return;
    }

    const emailToUse = customEmailInput.trim() || company.googleEmail || 'sinchanar1002@gmail.com';
    const updated = {
      ...company,
      spreadsheetId: extractedId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${extractedId}/edit`,
      googleEmail: emailToUse,
      sheetsCreated: true
    };

    updateCompanySpreadsheet(company.prefix, updated);
    if (onCompanyUpdated) onCompanyUpdated(updated);

    setFeedback({
      type: 'success',
      message: `Linked Google Sheet ID: ${extractedId}. Now setting up 8 sub-tables in this sheet...`
    });

    // Auto-setup sub-tables in this linked sheet
    setIsSyncing(true);
    setSyncType('setup');
    try {
      await initializeGoogleSheetSubTables({
        spreadsheetId: extractedId,
        prefix: company.prefix,
        companyName: company.name || company.companyName,
        googleEmail: emailToUse,
        clientCode: clientCode || 'rgc@nrman'
      });
      setShowManualLink(false);
      await runCheck();
    } catch (_) {}
    setIsSyncing(false);
    setSyncType(null);
  };

  const handleCopyId = () => {
    if (company?.spreadsheetId) {
      navigator.clipboard.writeText(company.spreadsheetId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen || !company) return null;

  const realId = isRealGoogleSheetId(company.spreadsheetId);
  const openUrl = getOpenGoogleSheetUrl(company.spreadsheetId, company.googleEmail || 'sinchanar1002@gmail.com');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-6">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">
                  Google Sheet Status & Real-Time Sync
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {company.prefix}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {company.name || company.companyName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Feedback banner */}
          {feedback && (
            <div className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
              feedback.type === 'success' 
                ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300' 
                : feedback.type === 'error'
                ? 'bg-rose-500/15 border border-rose-500/40 text-rose-300'
                : 'bg-blue-500/15 border border-blue-500/40 text-blue-300'
            }`}>
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">{feedback.message}</div>
            </div>
          )}

          {/* Primary Sheet Status Card */}
          <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-amber-400" />
                Sheet Name in Google Drive:
              </span>
              <span className="text-xs font-bold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 font-mono">
                {company.name || company.companyName} - Operational Database
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80 text-xs">
              <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-900/80 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Mail className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Google Account:</span>
                </div>
                <span className="font-mono text-amber-300 font-medium truncate max-w-[150px]" title={company.googleEmail || 'sinchanar1002@gmail.com'}>
                  {company.googleEmail || 'sinchanar1002@gmail.com'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-900/80 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                  <span>Drive Status:</span>
                </div>
                <div className="flex items-center gap-1">
                  {realId ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Created & Active
                    </span>
                  ) : (
                    <span className="text-amber-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Needs Setup
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Sheet ID & Open Actions */}
            <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-900/90 rounded-lg border border-slate-800 text-xs font-mono">
              <div className="flex items-center gap-2 truncate">
                <span className="text-slate-400">Sheet ID:</span>
                <span className="text-slate-200 truncate max-w-[240px]">
                  {company.spreadsheetId || 'Not created yet'}
                </span>
                {company.spreadsheetId && (
                  <button 
                    onClick={handleCopyId}
                    className="p-1 text-slate-400 hover:text-amber-300 rounded cursor-pointer"
                    title="Copy Sheet ID"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={openUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
                >
                  <span>Open Sheet</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Sub-Tables Grid (8 tables) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  8 Operational Sub-Tables in Sheet
                </h4>
              </div>
              <button
                onClick={runCheck}
                disabled={isChecking}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
                <span>{isChecking ? 'Checking Drive...' : 'Re-check Status'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {subTablesList.map((tbl) => {
                const isPresent = statusResult?.presentTables 
                  ? statusResult.presentTables.includes(tbl.key) 
                  : realId;
                return (
                  <div 
                    key={tbl.key}
                    className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col justify-between text-left"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-slate-200 truncate">
                        {tbl.label}
                      </span>
                      {isPresent ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 truncate">
                      {tbl.desc}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sync & Setup Action Controls */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-200">
                  Data Push & Pull Actions (Real-Time Bidirectional)
                </span>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono">
                ● Live Sync Active
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Setup 8 sub-tables button */}
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleSetupAllSubTables}
                className="px-3 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isSyncing && syncType === 'setup' ? 'animate-spin' : ''}`} />
                <span>{isSyncing && syncType === 'setup' ? 'Formatting...' : 'Setup 8 Sub-Tables'}</span>
              </button>

              {/* Push local data to sheet */}
              <button
                type="button"
                disabled={isSyncing}
                onClick={handlePushData}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <ArrowUpRight className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing && syncType === 'push' ? 'animate-bounce' : ''}`} />
                <span>{isSyncing && syncType === 'push' ? 'Pushing Data...' : 'Push to Google Sheet'}</span>
              </button>

              {/* Pull data from sheet to ERP */}
              <button
                type="button"
                disabled={isSyncing}
                onClick={handlePullData}
                className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <ArrowDownLeft className={`w-3.5 h-3.5 text-blue-400 ${isSyncing && syncType === 'pull' ? 'animate-bounce' : ''}`} />
                <span>{isSyncing && syncType === 'pull' ? 'Pulling Data...' : 'Pull from Google Sheet'}</span>
              </button>
            </div>
          </div>

          {/* Manual Link Collapsible */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowManualLink(!showManualLink)}
              className="text-xs text-slate-400 hover:text-amber-300 underline cursor-pointer"
            >
              {showManualLink ? 'Hide manual Google Sheet linking' : 'Already created a Google Sheet manually? Paste link here'}
            </button>

            {showManualLink && (
              <div className="mt-2.5 p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">
                    Google Sheets URL or ID:
                  </label>
                  <input
                    type="text"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1AbCdEf.../edit"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">
                    Associated Google Account (Gmail):
                  </label>
                  <input
                    type="email"
                    value={customEmailInput}
                    onChange={(e) => setCustomEmailInput(e.target.value)}
                    placeholder="sinchanar1002@gmail.com"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={handleLinkCustomSheet}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition cursor-pointer"
                >
                  Link Sheet & Format 8 Sub-Tables
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Created for {company.googleEmail || 'sinchanar1002@gmail.com'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
