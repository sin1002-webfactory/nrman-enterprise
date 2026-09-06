"use client";
import { useState } from 'react';
import { Database, Download, CloudUpload, CheckCircle, AlertCircle, RefreshCw, Upload, Trash2 } from 'lucide-react';
import { performFullBackup, restoreFromBackup, clearAllStorageData } from '@/lib/dataSync';
import { safeJsonParse, sanitizeObject } from '@/lib/security';

export default function BackupButton({ className = "", variant = "default" }) {
  const [backingUp, setBackingUp] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [backupResult, setBackupResult] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState('');

  const handleResetData = () => {
    if (window.confirm("Are you sure you want to remove all data in the preview and start completely fresh? This will clear all records.")) {
      clearAllStorageData();
      window.location.reload();
    }
  };

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const res = await performFullBackup();
      setBackupResult(res);
      setShowModal(true);
    } catch (err) {
      console.error("Backup error:", err);
      alert("Failed to create backup: " + err.message);
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestoreFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoring(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawText = event.target?.result;
        const parsedJson = safeJsonParse(rawText, null);
        if (!parsedJson) {
          alert('Invalid or corrupted JSON backup file format.');
          setRestoring(false);
          return;
        }
        const cleanData = sanitizeObject(parsedJson);
        const count = restoreFromBackup(cleanData);
        if (count > 0) {
          setRestoreMsg(`Successfully restored ${count} total records across all tables! Refreshing view...`);
          setShowModal(true);
          setBackupResult({
            timestamp: new Date().toLocaleString('en-IN'),
            recordCount: count,
            cloudSynced: true,
            cloudMsg: 'Data successfully restored to local view and server store!'
          });
          setTimeout(() => {
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          }, 1500);
        } else {
          alert('No valid database keys found in the backup file.');
        }
      } catch (err) {
        alert('Invalid JSON backup file: ' + err.message);
      } finally {
        setRestoring(false);
      }
    };
    reader.readAsText(file);
  };

  if (variant === "sidebar") {
    return (
      <>
        <div className={`mt-auto pt-4 border-t border-slate-700/60 ${className}`}>
          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest px-1 mb-2.5 flex items-center justify-between">
            <span>Data Cloud Backup</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleBackup}
              disabled={backingUp}
              className="w-full bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
              title="Backup all portal data to Cloud and download JSON"
            >
              {backingUp ? (
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950 shrink-0" />
              ) : (
                <Database className="w-4 h-4 text-slate-950 shrink-0" />
              )}
              <span>{backingUp ? 'Backing Up Data...' : 'Backup Portal Data'}</span>
            </button>

            <label className="w-full bg-slate-900/80 hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-700 font-semibold py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-2 transition cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{restoring ? 'Restoring...' : 'Restore JSON Backup'}</span>
              <input 
                type="file" 
                accept=".json" 
                onChange={handleRestoreFile} 
                className="hidden" 
              />
            </label>

            <button
              onClick={handleResetData}
              type="button"
              className="w-full bg-red-950/40 hover:bg-red-900/50 text-red-300 hover:text-red-100 border border-red-800/40 font-semibold py-1 px-3 rounded-lg text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
              title="Wipe all preview data for a fresh start"
            >
              <Trash2 className="w-3 h-3 text-red-400 shrink-0" />
              <span>Fresh Preview Reset</span>
            </button>
          </div>
        </div>

        {/* Backup Modal */}
        {showModal && backupResult && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/10 p-2 rounded-xl text-emerald-600">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Backup Operation Complete</h3>
                    <p className="text-xs text-slate-500">{backupResult.timestamp}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                  <div className="flex justify-between items-center font-medium">
                    <span className="text-slate-500">Total Records Processed:</span>
                    <span className="font-mono font-bold text-slate-900 bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                      {backupResult.recordCount} Records
                    </span>
                  </div>

                  <div className="flex justify-between items-center font-medium">
                    <span className="text-slate-500">JSON File Download:</span>
                    <span className="font-mono text-emerald-700 font-bold flex items-center gap-1">
                      <Download className="w-3.5 h-3.5" /> Generated & Downloaded
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-slate-500 block mb-1 font-semibold">Cloud Status:</span>
                    <p className={`p-2 rounded font-medium flex items-start gap-1.5 ${
                      backupResult.cloudSynced 
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}>
                      {backupResult.cloudSynced ? (
                        <CloudUpload className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <span>{backupResult.cloudMsg}</span>
                    </p>
                  </div>
                </div>

                {restoreMsg && (
                  <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs rounded-xl font-medium">
                    {restoreMsg}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => { setShowModal(false); setRestoreMsg(''); }}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                >
                  Close Window
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={handleBackup}
          disabled={backingUp}
          className={`px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm ${className}`}
          title="Backup all portal data to Cloud and JSON download"
        >
          {backingUp ? (
            <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
          ) : (
            <Database className="w-4 h-4 text-slate-950" />
          )}
          <span>{backingUp ? 'Backing up...' : 'Backup Data'}</span>
        </button>

        <label className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs flex items-center gap-1 transition cursor-pointer border border-slate-700" title="Restore Data from JSON Backup">
          <Upload className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Restore</span>
          <input 
            type="file" 
            accept=".json" 
            onChange={handleRestoreFile} 
            className="hidden" 
          />
        </label>

        <button
          onClick={handleResetData}
          type="button"
          className="p-1.5 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-200 border border-red-800/40 rounded-lg text-xs transition cursor-pointer"
          title="Reset / Clear all preview data"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Backup Confirmation Modal */}
      {showModal && backupResult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/10 p-2 rounded-xl text-emerald-600">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Backup Executed Successfully</h3>
                  <p className="text-xs text-slate-500">{backupResult.timestamp}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between items-center font-medium">
                  <span className="text-slate-500">Total Records Backed Up:</span>
                  <span className="font-mono font-bold text-slate-900 bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                    {backupResult.recordCount} Records
                  </span>
                </div>

                <div className="flex justify-between items-center font-medium">
                  <span className="text-slate-500">JSON Backup File:</span>
                  <span className="font-mono text-emerald-700 font-bold flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" /> Auto-Downloaded
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <span className="text-slate-500 block mb-1 font-semibold">Cloud Status:</span>
                  <p className={`p-2 rounded font-medium flex items-start gap-1.5 ${
                    backupResult.cloudSynced 
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}>
                    {backupResult.cloudSynced ? (
                      <CloudUpload className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <span>{backupResult.cloudMsg}</span>
                  </p>
                </div>
              </div>

              {restoreMsg && (
                <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs rounded-xl font-medium">
                  {restoreMsg}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => { setShowModal(false); setRestoreMsg(''); }}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
