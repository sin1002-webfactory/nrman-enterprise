import React, { useState } from 'react';
import { AlertTriangle, Trash2, RotateCcw, CheckCircle, Database, FileSpreadsheet, X, Loader2 } from 'lucide-react';
import { clearAllWebsiteData, SYNC_KEYS } from '../lib/dataSync';
import { getAppScriptUrl } from '../lib/saveToDatabase';

export default function ResetDataModal({
  isOpen,
  onClose,
  onResetComplete,
  sheetsConnected = false,
  currentUser = null
}) {
  const [resetMode, setResetMode] = useState('transactions'); // 'transactions' | 'factory'
  const [clearSheetsToo, setClearSheetsToo] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleExecuteReset = async () => {
    setIsResetting(true);
    setStatusMessage('Clearing local cache, browser storage & database store...');

    try {
      const appscriptUrl = getAppScriptUrl();
      const result = await clearAllWebsiteData({
        mode: resetMode,
        clearSheets: clearSheetsToo,
        appscriptUrl
      });

      if (result && result.success) {
        setIsSuccess(true);
        setStatusMessage(result.message || 'All website data successfully wiped clean.');
        
        if (onResetComplete) {
          onResetComplete({
            mode: resetMode,
            clearedSheets: clearSheetsToo
          });
        }

        setTimeout(() => {
          setIsResetting(false);
          setIsSuccess(false);
          setStatusMessage('');
          onClose();
        }, 1200);
      } else {
        throw new Error(result?.error || 'Failed to complete reset');
      }
    } catch (err) {
      console.error('Reset execution error:', err);
      setStatusMessage(`Reset note: ${err?.message || 'Error occurred during reset'}`);
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5 text-white">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-white">Reset Website Data</h2>
              <p className="text-xs text-slate-400">Wipe website records and prevent old data re-sync</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isResetting}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5">
          {/* Warning Banner */}
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 flex items-start gap-3 text-rose-900">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-rose-800">Permanent Data Reset Action</p>
              <p className="text-rose-700 leading-relaxed">
                This will delete the records from your browser cache, persistent server database, and active views so that no old data gets pushed back into Google Sheets.
              </p>
            </div>
          </div>

          {/* Reset Mode Options */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Select Reset Scope:
            </label>

            <div 
              onClick={() => !isResetting && setResetMode('transactions')}
              className={`p-3.5 rounded-lg border text-left cursor-pointer transition flex items-start gap-3 ${
                resetMode === 'transactions'
                  ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-500'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <input 
                type="radio" 
                name="resetMode" 
                checked={resetMode === 'transactions'} 
                onChange={() => setResetMode('transactions')}
                className="mt-1 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <div>
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Wipe All Transactional Data</span>
                  <span className="text-[10px] font-semibold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Recommended</span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-normal">
                  Deletes all <strong>Payments</strong>, <strong>Material GRNs</strong>, <strong>Vendor Ledgers</strong>, <strong>P&amp;L Matrix</strong>, and <strong>Audit entries</strong>. Keeps Project names &amp; Master items intact for immediate new entries.
                </p>
              </div>
            </div>

            <div 
              onClick={() => !isResetting && setResetMode('factory')}
              className={`p-3.5 rounded-lg border text-left cursor-pointer transition flex items-start gap-3 ${
                resetMode === 'factory'
                  ? 'border-rose-500 bg-rose-50/50 ring-1 ring-rose-500'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <input 
                type="radio" 
                name="resetMode" 
                checked={resetMode === 'factory'} 
                onChange={() => setResetMode('factory')}
                className="mt-1 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Total Factory Reset
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-normal">
                  Completely wipes all data including custom Projects, Master Categories, and User Profiles back to initial clean state.
                </p>
              </div>
            </div>
          </div>

          {/* Google Sheets Sync Checkbox */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={clearSheetsToo}
                onChange={(e) => setClearSheetsToo(e.target.checked)}
                disabled={isResetting}
                className="w-4 h-4 rounded-sm border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Also send clear command to Google Sheets (keeps spreadsheet clean)</span>
              </div>
            </label>
          </div>

          {/* Status / Feedback Progress */}
          {statusMessage && (
            <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
              isSuccess ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-700'
            }`}>
              {isSuccess ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 text-slate-600 animate-spin shrink-0" />
              )}
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isResetting}
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleExecuteReset}
            disabled={isResetting}
            className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-sm transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isResetting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Resetting Data...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Wipe &amp; Reset Data</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
