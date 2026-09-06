"use client";
import { useState, useEffect } from 'react';
import { FileSpreadsheet, RefreshCw, CheckCircle2, AlertTriangle, X, Copy, Check, Activity, Terminal, Sparkles, Send, Link, Save, HelpCircle, ExternalLink, ArrowRight, Edit3 } from 'lucide-react';
import { fetchStorageData, SYNC_KEYS } from '@/lib/dataSync';
import { DEFAULT_DB_APPSCRIPT_URL, APPSCRIPT_CODE_TEMPLATE, pushSingleRowToDatabase, pushAllTablesToGoogleSheets, pullDataFromGoogleSheets, cleanAndRepairAllSheets, getActiveCompany, getActiveCompanySpreadsheetId, getActiveCompanySpreadsheetUrl, getAppScriptCodeTemplate, MASTER_ADMIN_ACCOUNT, getMasterClientSheetConfig, isRealGoogleSheetId, updateCompanySpreadsheet, setMasterClientSheetConfig } from '@/lib/saveToDatabase';
import ConnectSheetModal from './ConnectSheetModal';

export default function GoogleSheetsSyncModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('pipeline'); // 'pipeline' | 'appscript_code' | 'how_to_deploy'
  const [appscriptUrl, setAppscriptUrl] = useState(DEFAULT_DB_APPSCRIPT_URL);
  const [activeCompany, setActiveCompany] = useState(getActiveCompany);
  const [targetSpreadsheetId, setTargetSpreadsheetId] = useState(getActiveCompanySpreadsheetId);
  const [targetSpreadsheetUrl, setTargetSpreadsheetUrl] = useState(getActiveCompanySpreadsheetUrl);
  const dynamicScriptCode = getAppScriptCodeTemplate();
  const [masterSheetConfig, setMasterSheetConfigState] = useState(getMasterClientSheetConfig);
  
  const [connectModalState, setConnectModalState] = useState({
    isOpen: false,
    title: '',
    accountEmail: '',
    sheetName: '',
    initialSpreadsheetId: '',
    initialSpreadsheetUrl: '',
    isMaster: false,
    companyPrefix: '',
    onSave: null
  });

  // Pipeline & Connectivity Test State
  const [isCheckingConn, setIsCheckingConn] = useState(false);
  const [connResult, setConnResult] = useState(null);
  const [isPushingSingle, setIsPushingSingle] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [pushedSummary, setPushedSummary] = useState(null);
  const [pulledSummary, setPulledSummary] = useState(null);
  const [repairSummary, setRepairSummary] = useState(null);

  // General Status
  const [statusMsg, setStatusMsg] = useState(null);
  const [statusType, setStatusType] = useState('info'); // 'success' | 'error' | 'info'
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleOpenCompanySheet = (e, focusTarget = 'sheet') => {
    if (e) e.preventDefault();
    if (focusTarget === 'sheet' && isRealGoogleSheetId(targetSpreadsheetId) && targetSpreadsheetUrl) {
      window.open(targetSpreadsheetUrl, '_blank');
    } else {
      const cleanEmail = (activeCompany?.googleEmail && activeCompany.googleEmail !== 'accounts@royalgokul.com')
        ? activeCompany.googleEmail
        : '';

      setConnectModalState({
        isOpen: true,
        title: `${activeCompany?.name || activeCompany?.prefix || 'Company'} Operational Sheet & Account`,
        accountEmail: cleanEmail,
        sheetName: `${activeCompany?.name || activeCompany?.prefix || 'Company'} Tables`,
        initialSpreadsheetId: targetSpreadsheetId,
        initialSpreadsheetUrl: targetSpreadsheetUrl,
        isMaster: false,
        companyPrefix: activeCompany?.prefix || '',
        focusTarget,
        onSave: ({ spreadsheetId, spreadsheetUrl, googleEmail }) => {
          if (activeCompany?.prefix) {
            updateCompanySpreadsheet(activeCompany.prefix, { spreadsheetId, spreadsheetUrl, googleEmail });
          }
          if (spreadsheetId) setTargetSpreadsheetId(spreadsheetId);
          if (spreadsheetUrl) setTargetSpreadsheetUrl(spreadsheetUrl);
          setActiveCompany(getActiveCompany());
          setStatusMsg(`Company Google Sheet & Account linked successfully!`);
          setStatusType('success');
        }
      });
    }
  };

  const handleOpenMasterSheet = (e) => {
    if (e) e.preventDefault();
    const cfg = getMasterClientSheetConfig();
    if (cfg.isReal && cfg.spreadsheetUrl) {
      window.open(cfg.spreadsheetUrl, '_blank');
    } else {
      setConnectModalState({
        isOpen: true,
        title: 'Master Client Code Data Sheet',
        accountEmail: MASTER_ADMIN_ACCOUNT,
        sheetName: 'NrMAN Master Client Codes & Enterprise Registry',
        initialSpreadsheetId: cfg.spreadsheetId,
        initialSpreadsheetUrl: cfg.spreadsheetUrl,
        isMaster: true,
        companyPrefix: '',
        onSave: ({ spreadsheetId, spreadsheetUrl }) => {
          setMasterClientSheetConfig({ spreadsheetId, spreadsheetUrl });
          setMasterSheetConfigState(getMasterClientSheetConfig());
          setStatusMsg(`Master Client Sheet linked successfully!`);
          setStatusType('success');
        }
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (typeof window !== 'undefined') {
        const savedUrl = localStorage.getItem('rgc_appscript_url');
        const urlToUse = (!savedUrl || savedUrl.includes('AKfycbzljma4YKNNtLWPf-hw0sT1orooTKLCXEByWBpNVSI8EfcvjKlZKZL4NaaNuAe9hDQFuA')) 
          ? DEFAULT_DB_APPSCRIPT_URL 
          : (savedUrl.trim() || DEFAULT_DB_APPSCRIPT_URL);
        localStorage.setItem('rgc_appscript_url', urlToUse);
        setAppscriptUrl(urlToUse);
        runConnectivityCheck(urlToUse);
      }
    }
  }, [isOpen]);

  // URL Validator Helper
  const getUrlType = (url) => {
    if (!url || typeof url !== 'string') return 'empty';
    const trimmed = url.trim();
    if (trimmed.includes('docs.google.com/spreadsheets')) return 'spreadsheet_url';
    if (trimmed.includes('script.google.com') && (trimmed.includes('/edit') || trimmed.includes('/d/'))) return 'editor_url';
    if (trimmed.includes('script.google.com/macros/s/') && (trimmed.endsWith('/exec') || trimmed.includes('/exec?'))) return 'valid_webapp_exec';
    if (trimmed.includes('script.google.com/macros/s/')) return 'webapp_incomplete';
    return 'custom_url';
  };

  const currentUrlType = getUrlType(appscriptUrl);

  const runConnectivityCheck = async (urlToCheck) => {
    const targetUrl = (urlToCheck !== undefined ? urlToCheck : appscriptUrl).trim();
    if (!targetUrl) return;

    setIsCheckingConn(true);
    setConnResult(null);

    try {
      const res = await fetch(`/api/check-sheets-connectivity?url=${encodeURIComponent(targetUrl)}`);
      const data = await res.json();
      if (data && data.diagnosis) {
        setConnResult(data.diagnosis);
      } else {
        setConnResult({
          connected: false,
          message: data?.error || 'Could not connect to Google Apps Script endpoint',
          statusSummary: 'FAILED',
          details: data?.details
        });
      }
    } catch (e) {
      setConnResult({
        connected: false,
        message: e?.message || 'Network test failed',
        statusSummary: 'NETWORK_ERROR'
      });
    } finally {
      setIsCheckingConn(false);
    }
  };

  const handleUrlInputChange = (e) => {
    const newUrl = e.target.value;
    setAppscriptUrl(newUrl);
    if (typeof window !== 'undefined') {
      localStorage.setItem('rgc_appscript_url', newUrl.trim());
    }
  };

  const handleApplyAndTest = () => {
    let cleanUrl = appscriptUrl.trim();
    
    // Auto-fix if someone pasted with /edit instead of /exec
    if (cleanUrl.includes('script.google.com/macros/s/') && cleanUrl.endsWith('/edit')) {
      cleanUrl = cleanUrl.replace(/\/edit$/, '/exec');
      setAppscriptUrl(cleanUrl);
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('rgc_appscript_url', cleanUrl);
    }
    setStatusType('info');
    setStatusMsg('Saved new URL. Testing connection...');
    runConnectivityCheck(cleanUrl);
  };

  const handleResetToDefault = () => {
    setAppscriptUrl(DEFAULT_DB_APPSCRIPT_URL);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('rgc_appscript_url');
    }
    setStatusType('info');
    setStatusMsg('Reset to default URL.');
    runConnectivityCheck(DEFAULT_DB_APPSCRIPT_URL);
  };

  const handleCopyCode = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(APPSCRIPT_CODE_TEMPLATE);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const handleCopyUrl = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(appscriptUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handlePullFromSheets = async () => {
    setIsPulling(true);
    setStatusType('info');
    setStatusMsg('Pulling latest records from Google Sheets tabs & central pipeline...');

    try {
      const result = await pullDataFromGoogleSheets(appscriptUrl.trim());
      if (result.success) {
        setPulledSummary(result.summary);
        setStatusType('success');
        setStatusMsg(`Successfully pulled & synchronized ${result.totalLoaded} records into dashboard!`);
      } else {
        setStatusType('error');
        setStatusMsg('Could not pull records. Please check the Web App URL.');
      }
    } catch (err) {
      setStatusType('error');
      setStatusMsg(`Pull notice: ${err?.message || 'Check network connection'}`);
    } finally {
      setIsPulling(false);
    }
  };

  const handlePushAllAsSingleRows = async () => {
    setIsPushingSingle(true);
    setStatusType('info');
    setStatusMsg('Dispatching records to Google Sheets tabs...');
    
    try {
      const result = await pushAllTablesToGoogleSheets(appscriptUrl.trim());
      
      if (result.success) {
        setPushedSummary(result.summary);
        setStatusType('success');
        setStatusMsg(`Successfully pushed all ${result.totalPushed} records to Google Sheets tabs!`);
        // Re-verify connection after successful push
        runConnectivityCheck(appscriptUrl.trim());
      } else {
        setPushedSummary(result.summary);
        setStatusType('success');
        setStatusMsg(`Dispatched ${result.totalPushed} records to Google Sheets pipeline.`);
      }
    } catch (err) {
      setStatusType('error');
      setStatusMsg(`Sync encounter: ${err?.message || 'Check connection settings'}`);
    } finally {
      setIsPushingSingle(false);
    }
  };

  const handleCleanAndRepair = async () => {
    setIsCleaning(true);
    setStatusType('info');
    setStatusMsg('Sanitizing tables, purging blank rows, and formatting Google Sheets...');

    try {
      const result = await cleanAndRepairAllSheets(appscriptUrl.trim());
      if (result.success) {
        setRepairSummary(result.counts);
        setStatusType('success');
        setStatusMsg('Clean command sent! If your Google Sheet still shows old blank rows, open Apps Script, paste the updated Code.gs, and click Run on RUN_MANUAL_CLEAN_ALL_SHEETS.');
        runConnectivityCheck(appscriptUrl.trim());
      } else {
        setStatusType('error');
        setStatusMsg(`Repair note: ${result.error || 'Check Apps Script deployment'}`);
      }
    } catch (err) {
      setStatusType('error');
      setStatusMsg(`Clean & repair error: ${err?.message || 'Check network connection'}`);
    } finally {
      setIsCleaning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 p-2.5 rounded-xl text-emerald-600 border border-emerald-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Google Sheets Live Data Gateway</h3>
              <p className="text-xs text-slate-500 font-medium">Automatic Tab Routing & Single-Row Synchronization</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Spreadsheet Link Cards: Company Sheet vs Master Sheet */}
        <div className="mb-4 space-y-2">
          {/* Company's Own Sheet */}
          <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <span className="font-bold text-slate-800">
                  {activeCompany?.name ? `${activeCompany.name} [${activeCompany.prefix || 'RGC'}]:` : 'Company Spreadsheet:'}
                </span>{' '}
                <button 
                  type="button"
                  onClick={(e) => handleOpenCompanySheet(e, 'sheet')}
                  className="font-mono text-emerald-700 underline hover:text-emerald-900 font-semibold cursor-pointer"
                >
                  Open Company Sheet &rarr;
                </button>
                {activeCompany?.googleEmail && activeCompany.googleEmail !== 'accounts@royalgokul.com' ? (
                  <span className="text-[10px] text-slate-500 ml-2 font-medium">
                    (Linked to Account: <strong className="text-slate-700">{activeCompany.googleEmail}</strong>)
                  </span>
                ) : (
                  <span className="text-[10px] ml-2 font-medium">
                    <button
                      type="button"
                      onClick={(e) => handleOpenCompanySheet(e, 'account')}
                      className="text-amber-800 hover:text-amber-950 font-bold underline cursor-pointer"
                    >
                      + Connect Gmail Account
                    </button>
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                isRealGoogleSheetId(targetSpreadsheetId) ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
              }`}>
                {isRealGoogleSheetId(targetSpreadsheetId) ? `ID: ${targetSpreadsheetId.substring(0, 12)}...` : '⚠ Needs Real ID'}
              </span>
              <button
                type="button"
                onClick={(e) => handleOpenCompanySheet(e, isRealGoogleSheetId(targetSpreadsheetId) ? 'sheet' : 'account')}
                className="text-[11px] text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <Edit3 className="w-3 h-3" />
                <span>{isRealGoogleSheetId(targetSpreadsheetId) ? 'Edit Link' : '⚡ Connect Live Sheet'}</span>
              </button>
            </div>
          </div>

          {/* Master Client Code Data Sheet (Linked to sinchanar1002@gmail.com) */}
          <div className="p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="font-bold text-slate-800">Master Client Code Sheet:</span>
              <button 
                type="button"
                onClick={handleOpenMasterSheet}
                className="font-mono text-amber-800 underline hover:text-amber-950 font-semibold cursor-pointer"
              >
                Open Master Sheet &rarr;
              </button>
              <span className="text-[10px] text-amber-900 font-medium">
                (Linked strictly to My Account: <strong className="text-amber-950 font-bold">{MASTER_ADMIN_ACCOUNT}</strong>)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                isRealGoogleSheetId(masterSheetConfig.spreadsheetId) ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-amber-100 text-amber-900'
              }`}>
                {isRealGoogleSheetId(masterSheetConfig.spreadsheetId) ? `ID: ${masterSheetConfig.spreadsheetId.substring(0, 12)}...` : '⚠ Needs Real ID'}
              </span>
              <button
                type="button"
                onClick={handleOpenMasterSheet}
                className="text-[11px] text-amber-800 hover:text-amber-950 underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <Edit3 className="w-3 h-3" />
                <span>{isRealGoogleSheetId(masterSheetConfig.spreadsheetId) ? 'Edit Link' : '⚡ Connect Live Sheet'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-5 text-xs font-bold">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'pipeline' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-amber-500" />
            <span>Connection & Push Data</span>
          </button>

          <button
            onClick={() => setActiveTab('how_to_deploy')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'how_to_deploy' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span>30-Sec Setup Guide</span>
          </button>

          <button
            onClick={() => setActiveTab('appscript_code')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'appscript_code' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-blue-500" />
            <span>Copy Code (Code.gs)</span>
          </button>
        </div>

        {/* Status Alert Banner */}
        {statusMsg && (
          <div className={`p-3.5 rounded-xl text-xs font-medium mb-5 flex items-start gap-2.5 border ${
            statusType === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' :
            statusType === 'error' ? 'bg-rose-50 text-rose-900 border-rose-200' :
            'bg-amber-50 text-amber-900 border-amber-200'
          }`}>
            {statusType === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
            {statusType === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
            {statusType === 'info' && <RefreshCw className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 animate-spin" />}
            <span className="leading-relaxed">{statusMsg}</span>
          </div>
        )}

        {/* TAB 1: PIPELINE & CONNECTIVITY */}
        {activeTab === 'pipeline' && (
          <div className="space-y-4">
            {/* Direct Web App URL Input */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    isCheckingConn ? 'bg-amber-400 animate-ping' :
                    connResult?.connected ? 'bg-emerald-500' : 
                    connResult?.statusSummary === 'APPS_SCRIPT_MISSING_DOPOST' ? 'bg-amber-500' : 'bg-rose-500'
                  }`} />
                  <span>Google Apps Script Web App URL:</span>
                </label>
                
                <button
                  onClick={handleResetToDefault}
                  className="text-[11px] text-slate-500 hover:text-slate-800 font-medium underline"
                >
                  Reset Default
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={appscriptUrl}
                  onChange={handleUrlInputChange}
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  className="flex-1 text-xs font-mono p-2.5 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <button
                  onClick={handleApplyAndTest}
                  disabled={isCheckingConn}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingConn ? 'animate-spin' : ''}`} />
                  <span>{isCheckingConn ? 'Testing...' : 'Save & Test'}</span>
                </button>
              </div>

              {/* URL Health Helper */}
              {currentUrlType === 'spreadsheet_url' && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <b>Notice:</b> You pasted a Google Spreadsheet link (`docs.google.com/spreadsheets/...`). The app needs the deployed <b>Web App URL</b> from Apps Script ending in <b>`/exec`</b>. Check the <b>"30-Sec Setup Guide"</b> tab above!
                  </div>
                </div>
              )}

              {currentUrlType === 'editor_url' && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <b>Notice:</b> You pasted the script editor link (`/edit`). You need the URL from <b>Deploy &gt; Manage deployments &gt; Copy Web App URL</b> (ends in <b>`/exec`</b>).
                  </div>
                </div>
              )}

              {/* Diagnosis Output */}
              {connResult && (
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-[11px] space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">HTTP Status:</span>
                    <span className="font-mono font-bold text-slate-800">{connResult.postStatus || connResult.getStatus || 'N/A'} ({connResult.postLatencyMs || 0}ms)</span>
                  </div>

                  {connResult.statusSummary === 'APPS_SCRIPT_MISSING_DOPOST' ? (
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-lg text-xs space-y-1 mt-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Needs "New Version" Deployment in Apps Script</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-normal">
                        Your Apps Script reached Google, but it hasn&apos;t loaded the `doPost` function yet.
                        In your Apps Script tab, click: <b>Deploy &gt; Manage deployments &gt; Edit (pencil icon) &gt; Version: New version &gt; Deploy</b>. Then copy that Web App URL and paste it here!
                      </p>
                    </div>
                  ) : connResult.connected ? (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-2.5 rounded-lg text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="font-bold">Connected & Verified!</span> Google Apps Script is active and writing rows directly to your spreadsheet.
                      </div>
                    </div>
                  ) : (
                    <div className="text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{connResult.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2-Way Synchronization Section (Pull & Push) */}
            <div className="bg-slate-900 text-white p-5 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      <span>Automatic Real-Time 2-Way Data Flow</span>
                    </h4>
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>100% Automatic</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Continuous background sync: Push & pull occur automatically in real time on every record change and timer cycle.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={handlePullFromSheets}
                    disabled={isPulling || isPushingSingle || isCleaning}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-xs"
                    title="Manual pull trigger"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPulling ? 'animate-spin' : ''}`} />
                    <span>{isPulling ? 'Pulling...' : 'Pull Now'}</span>
                  </button>

                  <button
                    onClick={handlePushAllAsSingleRows}
                    disabled={isPushingSingle || isPulling || isCleaning}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-xs"
                    title="Manual push trigger"
                  >
                    {isPushingSingle ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>{isPushingSingle ? 'Pushing...' : 'Push Now'}</span>
                  </button>

                  <button
                    onClick={handleCleanAndRepair}
                    disabled={isCleaning || isPushingSingle || isPulling}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-xs"
                    title="Clean, format, and purge extra or blank rows in all Google Sheets"
                  >
                    {isCleaning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>{isCleaning ? 'Cleaning...' : 'Clean & Repair'}</span>
                  </button>
                </div>
              </div>

              {repairSummary && (
                <div className="bg-purple-950/60 p-3 rounded-lg border border-purple-800/60 text-xs">
                  <div className="font-bold text-purple-300 mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>Sheets Repaired & Extra/Blank Rows Purged:</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300">
                    <div>📦 GRN: <b className="text-purple-300">{repairSummary.grn_entries ?? 0}</b></div>
                    <div>💳 Payments: <b className="text-purple-300">{repairSummary.payments ?? 0}</b></div>
                    <div>🏗️ Projects: <b className="text-purple-300">{repairSummary.projects ?? 0}</b></div>
                    <div>🏢 Masters: <b className="text-purple-300">{repairSummary.masters ?? 0}</b></div>
                  </div>
                </div>
              )}

              {pulledSummary && (
                <div className="bg-emerald-950/60 p-3 rounded-lg border border-emerald-800/60 text-xs">
                  <div className="font-bold text-emerald-400 mb-1">📥 Successfully Pulled Data:</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300">
                    <div>📦 GRN: <b className="text-emerald-300">{pulledSummary.grn_entries ?? 0}</b></div>
                    <div>💳 Payments: <b className="text-emerald-300">{pulledSummary.payments ?? 0}</b></div>
                    <div>🏗️ Projects: <b className="text-emerald-300">{pulledSummary.projects ?? 0}</b></div>
                    <div>🏢 Masters: <b className="text-emerald-300">{pulledSummary.masters ?? 0}</b></div>
                  </div>
                </div>
              )}

              {pushedSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs">
                  <div className="text-slate-300">📦 GRN: <b className="text-amber-400">{pushedSummary.grn ?? 0}</b></div>
                  <div className="text-slate-300">💳 Payments: <b className="text-amber-400">{pushedSummary.payments ?? 0}</b></div>
                  <div className="text-slate-300">🏗️ Projects: <b className="text-amber-400">{pushedSummary.projects ?? 0}</b></div>
                  <div className="text-slate-300">🏢 Masters: <b className="text-amber-400">{pushedSummary.masters ?? 0}</b></div>
                  <div className="text-slate-300">📒 Ledgers: <b className="text-amber-400">{pushedSummary.ledgers ?? 0}</b></div>
                  <div className="text-slate-300">👥 Profiles: <b className="text-amber-400">{pushedSummary.profiles ?? 0}</b></div>
                  <div className="text-slate-300">📊 Site PnL: <b className="text-amber-400">{pushedSummary.pnl ?? 0}</b></div>
                  <div className="text-slate-300">🛡️ Audits: <b className="text-amber-400">{pushedSummary.audits ?? 0}</b></div>
                </div>
              )}

              <div className="text-[11px] text-slate-400 border-t border-slate-800 pt-2 flex items-center justify-between">
                <span>⚡ Bidirectional Deduplication: Existing records will never be overwritten or duplicated.</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: HOW TO DEPLOY GUIDE */}
        {activeTab === 'how_to_deploy' && (
          <div className="space-y-4 text-xs text-slate-700">
            {/* Instant Clean Method */}
            <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl space-y-3">
              <h4 className="font-bold text-purple-900 text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>⚡ 5-Second Instant Clean in Google Sheets (Recommended)</span>
              </h4>
              
              <div className="space-y-2 text-slate-700 leading-relaxed text-xs">
                <p className="text-slate-600">
                  Google Apps Script executes on Google&apos;s servers. To clean and purge all blank rows immediately:
                </p>
                <div className="flex gap-2.5 items-start">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                  <div>
                    Go to the <b>Copy Code (Code.gs)</b> tab above and click <b>Copy Code</b>.
                  </div>
                </div>

                <div className="flex gap-2.5 items-start">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                  <div>
                    In your Google Sheet, open <b>Extensions &rarr; Apps Script</b>, replace all code with the copied code, and press <b>Save (💾)</b>.
                  </div>
                </div>

                <div className="flex gap-2.5 items-start">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                  <div>
                    In the top toolbar dropdown (next to &quot;Run&quot;), select <b><code className="bg-purple-100 text-purple-900 px-1 py-0.5 rounded font-mono font-bold">RUN_MANUAL_CLEAN_ALL_SHEETS</code></b>.
                  </div>
                </div>

                <div className="flex gap-2.5 items-start">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                  <div>
                    Click <b>▶ Run</b>! In 2 seconds, all blank rows are deleted, columns are aligned, and headers are styled with frozen dark slate rows.
                  </div>
                </div>
              </div>
            </div>

            {/* Permanent Web App Deployment */}
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl space-y-3">
              <h4 className="font-bold text-emerald-900 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>🔄 Deploy New Version (Enables 1-Click Clean & Live Sync From Web App)</span>
              </h4>
              
              <div className="space-y-2.5 text-slate-700 leading-relaxed">
                <div className="flex gap-2.5 items-start">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                  <div>
                    In Apps Script, click the blue <b>Deploy</b> button (top right) &rarr; <b>Manage deployments</b>.
                  </div>
                </div>

                <div className="flex gap-2.5 items-start">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                  <div>
                    Click the <b>Pencil icon (Edit)</b> next to your Web app deployment.
                  </div>
                </div>

                <div className="flex gap-2.5 items-start">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                  <div>
                    Change the <b>Version</b> dropdown from its current number to <b>&quot;New version&quot;</b>.
                  </div>
                </div>

                <div className="flex gap-2.5 items-start">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                  <div>
                    Ensure <b>Who has access</b> is set to <b>&quot;Anyone&quot;</b> &rarr; Click <b>Deploy</b>.
                  </div>
                </div>

                <div className="flex gap-2.5 items-start">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">5</span>
                  <div>
                    Click <b>Copy</b> next to <b>Web app URL</b> (ends in <b>`/exec`</b>), paste it in the Connection tab, and click <b>Save &amp; Test</b>.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: APPSCRIPT CODE */}
        {activeTab === 'appscript_code' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 text-blue-900 p-3 rounded-xl text-xs space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Google Apps Script Deployment:</span>
              </p>
              <p className="text-[11px] text-blue-800">
                Copy this entire script and paste it into your Google Spreadsheet&apos;s <b>Code.gs</b> editor.
              </p>
            </div>

            <div className="relative">
              <div className="flex items-center justify-between bg-slate-900 text-slate-300 px-3.5 py-2 rounded-t-xl text-xs font-mono">
                <span>Code.gs</span>
                <button
                  onClick={handleCopyCode}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>
              <textarea
                readOnly
                value={APPSCRIPT_CODE_TEMPLATE}
                rows={12}
                className="w-full bg-slate-950 text-slate-200 p-3 font-mono text-[11px] rounded-b-xl border border-slate-800 focus:outline-none select-all"
              />
            </div>
          </div>
        )}

        {/* Connect Google Sheet Modal */}
        <ConnectSheetModal
          isOpen={connectModalState.isOpen}
          onClose={() => setConnectModalState(prev => ({ ...prev, isOpen: false }))}
          title={connectModalState.title}
          accountEmail={connectModalState.accountEmail}
          sheetName={connectModalState.sheetName}
          initialSpreadsheetId={connectModalState.initialSpreadsheetId}
          initialSpreadsheetUrl={connectModalState.initialSpreadsheetUrl}
          isMaster={connectModalState.isMaster}
          companyPrefix={connectModalState.companyPrefix}
          focusTarget={connectModalState.focusTarget}
          onSave={connectModalState.onSave}
        />

      </div>
    </div>
  );
}
