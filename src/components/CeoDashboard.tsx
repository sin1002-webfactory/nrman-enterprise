import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Building2, 
  Users, 
  FileSpreadsheet, 
  Receipt, 
  Plus, 
  Trash2, 
  ExternalLink, 
  RefreshCw, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Mail, 
  ArrowLeft, 
  LogOut, 
  Layers, 
  Sparkles, 
  Check, 
  X, 
  Edit3, 
  Upload, 
  Download,
  Copy,
  HelpCircle,
  Activity,
  ChevronDown,
  ChevronRight,
  Database,
  Settings,
  Link2
} from 'lucide-react';
import { 
  getMasterDatabaseRecords, 
  saveMasterDatabaseRecord, 
  deleteMasterDatabaseRecord, 
  syncMasterDatabaseToGoogleSheet,
  getClientsList,
  createNewClientRecord,
  deleteClientRecord,
  autoSyncAllLocalCompaniesToMaster,
  getAppScriptUrl,
  checkGstDuplicate
} from '../lib/saveToDatabase';
import { safeSetItem } from '../lib/storageHelper';

interface CeoDashboardProps {
  onLogout: () => void;
  onNavigateToHub: () => void;
}

export default function CeoDashboard({ onLogout, onNavigateToHub }: CeoDashboardProps) {
  const [activeTab, setActiveTab] = useState<'clients' | 'master_db' | 'sheets_sync'>('clients');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Data state
  const [masterRecords, setMasterRecords] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalClients: 0,
    totalCompanies: 0,
    totalSheetsConnected: 0,
    totalGstNumbers: 0
  });
  const [masterSheet, setMasterSheet] = useState<any>({
    sheetName: 'nrman_master_database',
    spreadsheetId: '',
    spreadsheetUrl: '',
    ownerAccount: 'sinchanar1002@gmail.com'
  });

  // Modals state
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  const [isAddCompanyModalOpen, setIsAddCompanyModalOpen] = useState(false);
  const [isMasterSheetModalOpen, setIsMasterSheetModalOpen] = useState(false);
  const [masterSheetUrlInput, setMasterSheetUrlInput] = useState('');
  const [savingMasterSheet, setSavingMasterSheet] = useState(false);
  const [isCreatingMasterSheet, setIsCreatingMasterSheet] = useState(false);
  const [copiedHeaders, setCopiedHeaders] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  // In-app delete confirmation modal states (replaces blocked window.confirm)
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<{ id: string; prefix: string; name: string } | null>(null);
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);

  // Form states for Add Client
  const [newClientCode, setNewClientCode] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPlan, setNewClientPlan] = useState('Enterprise Sovereign');
  const [clientModalError, setClientModalError] = useState('');

  // Form states for Add Company
  const [compClientCode, setCompClientCode] = useState('');
  const [compName, setCompName] = useState('');
  const [compPrefix, setCompPrefix] = useState('');
  const [compGst, setCompGst] = useState('');
  const [compEmail, setCompEmail] = useState('');
  const [compLogoUrl, setCompLogoUrl] = useState('');
  const [compSpreadsheetUrl, setCompSpreadsheetUrl] = useState('');
  const [compModalError, setCompModalError] = useState('');

  // Load data on mount
  const refreshAllData = async () => {
    setLoading(true);
    try {
      // Auto harvest any local registries into master
      autoSyncAllLocalCompaniesToMaster();

      const [dbRes, cliRes] = await Promise.all([
        getMasterDatabaseRecords(),
        getClientsList()
      ]);

      if (dbRes && dbRes.records) {
        setMasterRecords(dbRes.records);
        if (dbRes.stats) setStats(dbRes.stats);
        if (dbRes.masterSheet) {
          const ms = { ...dbRes.masterSheet };
          // If legacy response returned RGC primary sheet, keep master database distinct
          if (ms.spreadsheetId === '1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs') {
            ms.spreadsheetId = '';
            ms.spreadsheetUrl = '';
          }
          setMasterSheet(ms);
        }
      }

      if (Array.isArray(cliRes) && cliRes.length > 0) {
        setClients(cliRes);
      } else if (dbRes && Array.isArray(dbRes.clients)) {
        setClients(dbRes.clients);
      }
    } catch (err) {
      console.error('Error loading CEO data:', err);
    } finally {
      setLoading(false);
    }
  };

  const MASTER_COLUMN_HEADERS = [
    'Client Code',
    'Company Legal Name',
    'Prefix Code',
    'GSTIN',
    'Google Account Email',
    'Spreadsheet URL',
    'Spreadsheet ID',
    'Status',
    'Created Date',
    'Last Synced'
  ];

  const handleCopyHeaders = () => {
    navigator.clipboard.writeText(MASTER_COLUMN_HEADERS.join('\t'));
    setCopiedHeaders(true);
    showToast('success', 'Copied 10 master column headers! Paste directly into Cell A1.');
    setTimeout(() => setCopiedHeaders(false), 3500);
  };

  const handleDownloadMasterCsv = () => {
    const rows = masterRecords.map(r => [
      `"${(r.clientCode || '').replace(/"/g, '""')}"`,
      `"${(r.companyName || '').replace(/"/g, '""')}"`,
      `"${(r.prefix || '').replace(/"/g, '""')}"`,
      `"${(r.gstNumber || '').replace(/"/g, '""')}"`,
      `"${(r.googleEmail || '').replace(/"/g, '""')}"`,
      `"${(r.spreadsheetUrl || '').replace(/"/g, '""')}"`,
      `"${(r.spreadsheetId || '').replace(/"/g, '""')}"`,
      `"${(r.status || 'Active').replace(/"/g, '""')}"`,
      `"${(r.createdAt || new Date().toISOString()).replace(/"/g, '""')}"`,
      `"${new Date().toISOString()}"`
    ]);
    const csvContent = [MASTER_COLUMN_HEADERS.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'nrman_master_database.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('success', 'Downloaded nrman_master_database.csv with all 10 required headers!');
  };

  const handleCreateMasterSheet = async () => {
    setIsCreatingMasterSheet(true);
    try {
      const res = await fetch('/api/master-database/create-master-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerEmail: masterSheet.ownerAccount || 'sinchanar1002@gmail.com',
          appscriptUrl: getAppScriptUrl()
        })
      });
      const data = await res.json();
      
      // If a real separate spreadsheet was created via Apps Script
      if (data && data.created && data.spreadsheetId && data.spreadsheetId !== '1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs') {
        const targetId = data.spreadsheetId;
        const targetUrl = data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${targetId}/edit`;

        setMasterSheet({
          ...masterSheet,
          spreadsheetId: targetId,
          spreadsheetUrl: targetUrl,
          lastSynced: new Date().toISOString()
        });
        showToast('success', 'Separate Master Sheet "nrman_master_database" created successfully!');
        window.open(targetUrl, '_blank');
        setIsMasterSheetModalOpen(false);
        refreshAllData();
        return;
      }

      showToast('error', data?.error || 'Master sheet creation failed. No sheet was opened or linked.');
    } catch (err: any) {
      showToast('error', err?.message || 'Master sheet creation failed. Check the Apps Script deployment and try again.');
    } finally {
      setIsCreatingMasterSheet(false);
    }
  };

  const handleSaveMasterSheetUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterSheetUrlInput.trim()) return;
    setSavingMasterSheet(true);
    try {
      let sheetId = masterSheetUrlInput.trim();
      const match = masterSheetUrlInput.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) sheetId = match[1];

      if (sheetId === '1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs') {
        showToast('error', 'This is the RGC Primary sheet ID. Please link your separate "nrman_master_database" sheet.');
        setSavingMasterSheet(false);
        return;
      }

      const cleanUrl = masterSheetUrlInput.trim().startsWith('http')
        ? masterSheetUrlInput.trim()
        : `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

      const res = await fetch('/api/master/client-sheet/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: sheetId,
          spreadsheetUrl: cleanUrl
        })
      });
      const data = await res.json();
      if (data.success) {
        setMasterSheet({
          ...masterSheet,
          spreadsheetId: sheetId,
          spreadsheetUrl: cleanUrl,
          lastSynced: new Date().toISOString()
        });
        showToast('success', 'Separate Master Database Sheet linked! Pushing table structure & headers...');
        setIsMasterSheetModalOpen(false);
        setMasterSheetUrlInput('');
        syncMasterDatabaseToGoogleSheet().catch(() => {});
        refreshAllData();
      } else {
        showToast('error', data.error || 'Failed to update Master Sheet');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Connection failed');
    } finally {
      setSavingMasterSheet(false);
    }
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  // Sync to Master Google Sheet
  const handleSyncToMasterSheet = async () => {
    setSyncing(true);
    try {
      const res = await syncMasterDatabaseToGoogleSheet();
      if (res && (res.success || res.status === 'success')) {
        showToast('success', res.message || 'nrman_master_database pushed successfully to Google Sheets!');
        refreshAllData();
      } else {
        showToast('error', res?.error || 'Could not push to Google Sheets. Check Apps Script URL in settings.');
      }
    } catch (e: any) {
      showToast('error', e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Handle Add New Client
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientModalError('');
    const cleanCode = newClientCode.trim().toLowerCase();
    if (!cleanCode) {
      setClientModalError('Client Code is required (e.g. client@nrman)');
      return;
    }
    if (!newClientName.trim()) {
      setClientModalError('Client Organization Name is required');
      return;
    }

    try {
      const res = await createNewClientRecord({
        clientCode: cleanCode,
        clientName: newClientName.trim(),
        contactEmail: newClientEmail.trim(),
        plan: newClientPlan
      });

      if (res && res.success) {
        showToast('success', `Client "${cleanCode}" successfully registered in master database!`);
        setIsAddClientModalOpen(false);
        setNewClientCode('');
        setNewClientName('');
        setNewClientEmail('');
        refreshAllData();
      } else {
        setClientModalError(res?.error || 'Failed to create client');
      }
    } catch (err: any) {
      setClientModalError(err?.message || 'Network error');
    }
  };

  // Handle Delete Client - Opens non-blocking In-App Confirmation Modal
  const handleDeleteClient = (clientCode: string) => {
    if (clientCode.toLowerCase() === 'ceo@nrman') {
      showToast('error', 'Cannot delete the CEO root controller account.');
      return;
    }
    setClientToDelete(clientCode);
  };

  const confirmDeleteClient = async (clientCode: string) => {
    setIsDeletingClient(true);
    // Optimistic UI updates
    setClients(prev => prev.filter(c => (c.clientCode || '').toLowerCase() !== clientCode.toLowerCase()));
    setMasterRecords(prev => prev.filter(r => (r.clientCode || '').toLowerCase() !== clientCode.toLowerCase()));

    try {
      const res = await deleteClientRecord(clientCode);
      if (res && res.success) {
        showToast('success', res.message || `Client "${clientCode}" and all associated companies deleted.`);
        await refreshAllData();
      } else {
        showToast('error', res?.error || 'Failed to delete client');
        await refreshAllData();
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Deletion failed');
      await refreshAllData();
    } finally {
      setIsDeletingClient(false);
      setClientToDelete(null);
    }
  };

  // Handle Add Company
  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompModalError('');
    if (!compName.trim()) {
      setCompModalError('Company Name is required');
      return;
    }
    const cleanPrefix = compPrefix.trim().toUpperCase() || compName.slice(0, 3).toUpperCase();
    const cleanGst = compGst.trim().toUpperCase();

    // Validate GST uniqueness if provided
    if (cleanGst) {
      const isDup = checkGstDuplicate(cleanGst, cleanPrefix);
      if (isDup) {
        setCompModalError(`GST Number "${cleanGst}" is already registered by another company.`);
        return;
      }
    }

    const assignedClientCode = compClientCode.trim().toLowerCase() || 'rgc@nrman';

    let spreadsheetId = '';
    if (compSpreadsheetUrl.includes('/d/')) {
      const match = compSpreadsheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match) spreadsheetId = match[1];
    } else if (compSpreadsheetUrl.trim()) {
      spreadsheetId = compSpreadsheetUrl.trim();
    }

    try {
      const res = await saveMasterDatabaseRecord({
        id: `rec-${cleanPrefix.toLowerCase()}-${Date.now()}`,
        clientCode: assignedClientCode,
        companyName: compName.trim(),
        prefix: cleanPrefix,
        gstNumber: cleanGst,
        logoUrl: compLogoUrl.trim(),
        googleEmail: compEmail.trim(),
        spreadsheetId: spreadsheetId || `sheet_${cleanPrefix.toLowerCase()}_${Date.now().toString(36)}`,
        spreadsheetUrl: compSpreadsheetUrl.trim() || (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : ''),
        status: 'Active',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      });

      if (res && (res.success || res.record)) {
        showToast('success', `Company ${compName} [${cleanPrefix}] saved into nrman_master_database!`);
        setIsAddCompanyModalOpen(false);
        setCompName('');
        setCompPrefix('');
        setCompGst('');
        setCompEmail('');
        setCompLogoUrl('');
        setCompSpreadsheetUrl('');
        refreshAllData();
      } else {
        setCompModalError(res?.error || 'Failed to save company record');
      }
    } catch (err: any) {
      setCompModalError(err?.message || 'Network error');
    }
  };

  // Handle Delete Company - Opens non-blocking In-App Confirmation Modal
  const handleDeleteCompany = (id: string, prefix: string, name: string) => {
    setCompanyToDelete({ id, prefix, name });
  };

  const confirmDeleteCompany = async (item: { id: string; prefix: string; name: string }) => {
    setIsDeletingCompany(true);
    // Optimistic UI update
    setMasterRecords(prev => prev.filter(r => (r.prefix || '').toUpperCase() !== item.prefix.toUpperCase()));

    try {
      const res = await deleteMasterDatabaseRecord(item.id, item.prefix);
      if (res && res.success) {
        showToast('success', `Company ${item.prefix} removed from master database.`);
        await refreshAllData();
      } else {
        showToast('error', res?.error || 'Failed to delete company');
        await refreshAllData();
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Deletion failed');
      await refreshAllData();
    } finally {
      setIsDeletingCompany(false);
      setCompanyToDelete(null);
    }
  };

  // Filtered records
  const filteredRecords = masterRecords.filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.companyName || '').toLowerCase().includes(q) ||
      (r.prefix || '').toLowerCase().includes(q) ||
      (r.clientCode || '').toLowerCase().includes(q) ||
      (r.gstNumber || '').toLowerCase().includes(q) ||
      (r.googleEmail || '').toLowerCase().includes(q)
    );
  });

  return (
    <div id="ceo-dashboard-root" className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top CEO Control Bar */}
      <header className="sticky top-0 z-40 w-full bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)] border border-amber-400/40">
            <ShieldCheck className="w-6 h-6 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-amber-200">
                NrMAN Master Database & CEO Control Center
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Root Owner
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Admin: <span className="text-slate-200 font-semibold">{masterSheet.ownerAccount}</span> &bull; Verified Client Code: <span className="text-cyan-300 font-mono font-bold">ceo@nrman</span>
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* 1-Click Open Master Google Sheet */}
          {masterSheet.spreadsheetId && masterSheet.spreadsheetId !== '1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs' && masterSheet.spreadsheetUrl ? (
            <a
              id="open-master-sheet-btn"
              href={masterSheet.spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all shadow-sm hover:shadow-emerald-900/40"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Open Master Sheet</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          ) : (
            <button
              id="open-master-sheet-btn"
              onClick={() => {
                setMasterSheetUrlInput('');
                setIsMasterSheetModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-amber-400" />
              <span>Connect Master Sheet</span>
            </button>
          )}

          {/* Configure / Link Master Google Sheet */}
          <button
            id="config-master-sheet-btn"
            onClick={() => {
              setMasterSheetUrlInput(masterSheet.spreadsheetUrl || '');
              setIsMasterSheetModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all"
            title="Configure or link master Google Sheet"
          >
            <Settings className="w-4 h-4 text-amber-400" />
            <span>Sheet Settings</span>
          </button>

          {/* Sync to Master Google Sheet */}
          <button
            id="sync-master-sheet-btn"
            onClick={handleSyncToMasterSheet}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Sheet'}</span>
          </button>

          {/* Logout */}
          <button
            id="ceo-logout-btn"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 text-xs font-semibold transition-all"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Floating Notification */}
      {notice && (
        <div className={`fixed top-18 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-md animate-fade-in ${
          notice.type === 'success' 
            ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/50 shadow-emerald-900/30' 
            : 'bg-rose-950/90 text-rose-200 border-rose-500/50 shadow-rose-900/30'
        }`}>
          {notice.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />}
          <span className="text-xs font-bold">{notice.text}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 flex flex-col gap-6">
        
        {/* KPI Metrics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Clients</p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-100 mt-1">{clients.length}</h3>
              <p className="text-[11px] text-cyan-400 mt-0.5">Enterprise Accounts</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-cyan-400" />
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Companies</p>
              <h3 className="text-2xl sm:text-3xl font-black text-amber-300 mt-1">{masterRecords.length}</h3>
              <p className="text-[11px] text-amber-400/80 mt-0.5">In Master Database</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-amber-400" />
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sheets Connected</p>
              <h3 className="text-2xl sm:text-3xl font-black text-emerald-300 mt-1">{stats.totalSheetsConnected || masterRecords.filter(r => r.spreadsheetId).length}</h3>
              <p className="text-[11px] text-emerald-400 mt-0.5">Workspaces</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">GST Registered</p>
              <h3 className="text-2xl sm:text-3xl font-black text-purple-300 mt-1">{stats.totalGstNumbers || masterRecords.filter(r => r.gstNumber && r.gstNumber.length >= 10).length}</h3>
              <p className="text-[11px] text-purple-400 mt-0.5">Entities</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Receipt className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>

        {/* Tab Navigation Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              id="tab-clients-btn"
              onClick={() => setActiveTab('clients')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'clients'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Clients</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'clients' ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-300'
              }`}>
                {clients.length}
              </span>
            </button>

            <button
              id="tab-master-db-btn"
              onClick={() => setActiveTab('master_db')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'master_db'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Master Database</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'master_db' ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-300'
              }`}>
                {masterRecords.length}
              </span>
            </button>

            <button
              id="tab-sheets-sync-btn"
              onClick={() => setActiveTab('sheets_sync')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'sheets_sync'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Sheets Sync</span>
            </button>
          </div>

          {/* Quick Search & Modals Trigger */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search clients, GST, companies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 w-48 sm:w-64"
              />
            </div>

            {activeTab === 'clients' && (
              <button
                id="add-client-btn"
                onClick={() => setIsAddClientModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add Client</span>
              </button>
            )}

            {activeTab === 'master_db' && (
              <button
                id="add-company-master-btn"
                onClick={() => setIsAddCompanyModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition-all shadow-sm"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add Company</span>
              </button>
            )}
          </div>
        </div>

        {/* TAB 1: CLIENTS & THEIR COMPANIES */}
        {activeTab === 'clients' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-100">Enterprise Clients Registry</h2>
                <p className="text-xs text-slate-400">
                  Manage all client codes, their allocated plan, and inspect individual company workspaces per client.
                </p>
              </div>
              <button
                onClick={refreshAllData}
                className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-all text-xs flex items-center gap-1.5"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {clients.map((cli) => {
                const cliCode = (cli.clientCode || '').toLowerCase().trim();
                const clientCompanies = masterRecords.filter(c => {
                  if (!c) return false;
                  const cCode = (c.clientCode || '').toLowerCase().trim();
                  return cCode === cliCode;
                });

                const isExpanded = expandedClientId === cli.clientCode;

                return (
                  <div 
                    key={cli.clientCode} 
                    className="bg-slate-900/70 border border-slate-800/90 rounded-2xl p-5 shadow-lg flex flex-col gap-4 transition-all hover:border-slate-700"
                  >
                    {/* Client Primary Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-300 font-black text-sm">
                          {cli.clientCode.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-slate-100">{cli.clientName}</h3>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                              {cli.clientCode}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                              {cli.plan || 'Enterprise Sovereign'}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-400 mt-1">
                            {cli.contactEmail && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3.5 h-3.5 text-slate-500" />
                                {cli.contactEmail}
                              </span>
                            )}
                            <span className="text-slate-500">
                              Created: {new Date(cli.createdAt || Date.now()).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Client Actions */}
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
                          {clientCompanies.length} {clientCompanies.length === 1 ? 'Company' : 'Companies'}
                        </span>

                        <button
                          onClick={() => setExpandedClientId(isExpanded ? null : cli.clientCode)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <span>{isExpanded ? 'Hide Details' : 'View Companies'}</span>
                        </button>

                        {cli.clientCode.toLowerCase() !== 'ceo@nrman' && (
                          <button
                            onClick={() => handleDeleteClient(cli.clientCode)}
                            className="p-1.5 text-rose-400 hover:bg-rose-950/60 hover:text-rose-300 rounded-lg transition-all"
                            title="Remove Client"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Sub-View: Companies belonging to this client */}
                    {isExpanded && (
                      <div className="mt-2 pt-4 border-t border-slate-800/80 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Registered Companies ({clientCompanies.length})
                          </p>
                          <button
                            onClick={() => {
                              setCompClientCode(cli.clientCode);
                              setIsAddCompanyModalOpen(true);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 bg-cyan-950 text-cyan-300 hover:bg-cyan-900 border border-cyan-500/30 rounded-lg text-xs font-semibold"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Company to this Client</span>
                          </button>
                        </div>

                        {clientCompanies.length === 0 ? (
                          <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800 text-center text-xs text-slate-500">
                            No companies created under client <strong className="text-slate-400">{cli.clientCode}</strong> yet.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {clientCompanies.map(comp => (
                              <div 
                                key={comp.prefix}
                                className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between gap-2.5 shadow-sm hover:border-slate-700"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    {comp.logoUrl ? (
                                      <img src={comp.logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-slate-900 p-0.5 border border-slate-800" />
                                    ) : (
                                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300 font-bold text-xs">
                                        {comp.prefix}
                                      </div>
                                    )}
                                    <div>
                                      <h4 className="text-sm font-bold text-slate-200">{comp.companyName}</h4>
                                      <span className="text-[11px] font-mono text-cyan-400 font-bold">[{comp.prefix}]</span>
                                    </div>
                                  </div>

                                  <button
                                    onClick={() => handleDeleteCompany(comp.id, comp.prefix, comp.companyName)}
                                    className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-900 rounded"
                                    title="Delete Company"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="flex flex-col gap-1 text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-500 font-semibold">GSTIN:</span>
                                    <span className="font-mono text-purple-300 font-bold">{comp.gstNumber || 'Not Configured'}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-500 font-semibold">Google Email:</span>
                                    <span className="truncate max-w-[140px] text-slate-300" title={comp.googleEmail || ''}>{comp.googleEmail || 'Shared Root'}</span>
                                  </div>
                                </div>

                                {comp.spreadsheetUrl && (
                                  <a
                                    href={comp.spreadsheetUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition-all"
                                  >
                                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Open Company Sheet</span>
                                    <ExternalLink className="w-3 h-3 opacity-70" />
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: NRMAN_MASTER_DATABASE TABLE VIEW */}
        {activeTab === 'master_db' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-100">nrman_master_database Sheet Table</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                    8 Canonical Columns
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Every company created with its client code, GST number, Google Account email, logo link, and sheet URL is synced here.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSyncToMasterSheet}
                  disabled={syncing}
                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  <span>Push All Rows to Google Sheet</span>
                </button>
              </div>
            </div>

            {/* Master Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold text-[11px]">
                    <th className="py-3 px-4">Client Code</th>
                    <th className="py-3 px-4">Company Name & Prefix</th>
                    <th className="py-3 px-4">GST Number</th>
                    <th className="py-3 px-4">Google Account Email</th>
                    <th className="py-3 px-4">Logo Link</th>
                    <th className="py-3 px-4">Google Sheet ID & Link</th>
                    <th className="py-3 px-4">Sub-Tables Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        No records found in nrman_master_database.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r, idx) => (
                      <tr key={r.id || r.prefix || idx} className="hover:bg-slate-800/40 transition-colors">
                        {/* Client Code */}
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-300 font-mono font-bold border border-cyan-500/20">
                            {r.clientCode || 'rgc@nrman'}
                          </span>
                        </td>

                        {/* Company Name & Prefix */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-100">{r.companyName}</div>
                          <span className="text-[10px] font-mono text-amber-300 font-black">[{r.prefix}]</span>
                        </td>

                        {/* GST Number */}
                        <td className="py-3 px-4">
                          {r.gstNumber ? (
                            <span className="font-mono text-purple-300 font-bold px-2 py-0.5 rounded bg-purple-950/60 border border-purple-800/50">
                              {r.gstNumber}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">None</span>
                          )}
                        </td>

                        {/* Google Account Email */}
                        <td className="py-3 px-4">
                          {r.googleEmail ? (
                            <span className="text-slate-300 flex items-center gap-1">
                              <Mail className="w-3 h-3 text-cyan-400" />
                              {r.googleEmail}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">sinchanar1002@gmail.com</span>
                          )}
                        </td>

                        {/* Logo Link */}
                        <td className="py-3 px-4 max-w-[150px] truncate">
                          {r.logoUrl ? (
                            <a
                              href={r.logoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cyan-400 hover:underline flex items-center gap-1"
                              title={r.logoUrl}
                            >
                              <span>View Logo</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-500 italic">None</span>
                          )}
                        </td>

                        {/* Google Sheet ID & Link */}
                        <td className="py-3 px-4">
                          {r.spreadsheetUrl ? (
                            <a
                              href={r.spreadsheetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Open Sheet</span>
                              <ExternalLink className="w-3 h-3 opacity-70" />
                            </a>
                          ) : (
                            <span className="text-slate-500 italic">No Sheet Linked</span>
                          )}
                        </td>

                        {/* Sub-Tables Status */}
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>8 Operational Tabs</span>
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeleteCompany(r.id, r.prefix, r.companyName)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: SHEETS SYNC ENGINE & SETUP GUIDE */}
        {activeTab === 'sheets_sync' && (
          <div className="flex flex-col gap-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Real-Time Two-Way Google Sheets Sync Architecture
                  </h3>
                  <p className="text-xs text-slate-400">
                    How data is immediately pushed to and pulled from Google Sheets without blank sheets or delay.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs">
                    <Activity className="w-4 h-4" />
                    <span>1. Real-Time Push (&lt; 50ms)</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Every transaction (GRN, Payment, Material, Project) is immediately sent to the Google Apps Script Webhook endpoint.
                  </p>
                </div>

                <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                    <Layers className="w-4 h-4" />
                    <span>2. Automatic 8 Sub-Tables</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Whenever a company is created or opens its sheet, all 8 sub-tables (<code className="text-amber-200">projects, grn_entries, payments, masters, ledgers, profiles, pnl_matrix, purchase_audits</code>) are auto-initialized with headers so it is never blank!
                  </p>
                </div>

                <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                    <Mail className="w-4 h-4" />
                    <span>3. Client Account Visibility</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    The spreadsheet is shared with the client's provided Gmail address with Editor access so they immediately see it in their Google Drive & Sheets app!
                  </p>
                </div>
              </div>

              {/* Action checklist for user */}
              <div className="mt-4 p-5 bg-amber-950/20 border border-amber-500/30 rounded-xl flex flex-col gap-3">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                  <Sparkles className="w-4 h-4" />
                  <span>Important: Steps to do from your side (Google Apps Script Deployment)</span>
                </div>
                <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
                  <li>
                    <strong>Open your Apps Script editor</strong> on your Google Account: <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="text-amber-300 underline font-semibold">script.google.com</a>.
                  </li>
                  <li>
                    Replace the script content with the latest <code className="text-cyan-300">Code.gs</code> file provided in this application.
                  </li>
                  <li>
                    Click <strong>Deploy &gt; Manage Deployments &gt; Edit &gt; New Version</strong>.
                  </li>
                  <li>
                    Ensure <strong>Execute as: "Me"</strong> and <strong>Who has access: "Anyone"</strong> are selected.
                  </li>
                  <li>
                    Copy the Webhook URL and paste it into the <strong>Google Sheets Connection Modal</strong> in this app if you ever change or redeploy it!
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* MODAL: ADD CLIENT */}
      {isAddClientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md max-h-[90vh] p-6 shadow-2xl flex flex-col gap-4 overflow-hidden my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-base">
                <Users className="w-5 h-5" />
                <span>Register New Enterprise Client</span>
              </div>
              <button 
                onClick={() => setIsAddClientModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {clientModalError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-200 text-xs rounded-xl flex items-center gap-2 flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{clientModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateClient} className="flex flex-col gap-3 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Client Code <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. acme@nrman or builder123@nrman"
                  value={newClientCode}
                  onChange={(e) => setNewClientCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  This code will be entered by the client on the homepage to access their workspace.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Client Organization / Name <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Builders & Developers"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Owner / Contact Email
                </label>
                <input
                  type="email"
                  placeholder="client@gmail.com"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  License / Plan Tier
                </label>
                <select
                  value={newClientPlan}
                  onChange={(e) => setNewClientPlan(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                >
                  <option value="Enterprise Sovereign">Enterprise Sovereign (Unlimited Companies)</option>
                  <option value="Standard Business">Standard Business (Up to 3 Companies)</option>
                  <option value="Starter Multi-Project">Starter Multi-Project (1 Company)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddClientModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-md"
                >
                  Create Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD COMPANY TO MASTER DATABASE */}
      {isAddCompanyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] p-6 shadow-2xl flex flex-col gap-4 overflow-hidden my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-base">
                <Building2 className="w-5 h-5" />
                <span>Add Company to nrman_master_database</span>
              </div>
              <button 
                onClick={() => setIsAddCompanyModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {compModalError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-200 text-xs rounded-xl flex items-center gap-2 flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{compModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCompany} className="flex flex-col gap-3 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Assign to Client Code <span className="text-amber-400">*</span>
                </label>
                <select
                  value={compClientCode}
                  onChange={(e) => setCompClientCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 font-mono focus:border-amber-500 focus:outline-none"
                  required
                >
                  <option value="">Select a Client...</option>
                  {clients.map(c => (
                    <option key={c.clientCode} value={c.clientCode}>
                      {c.clientCode} &mdash; {c.clientName}
                    </option>
                  ))}
                  <option value="rgc@nrman">rgc@nrman &mdash; Royal Gokul Constructions Group</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Company Name <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Apex Infra Projects"
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Prefix Code <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. APX"
                    value={compPrefix}
                    maxLength={6}
                    onChange={(e) => setCompPrefix(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-amber-300 font-mono font-bold focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  GST Number (Strict Duplicate Protection)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  value={compGst}
                  maxLength={15}
                  onChange={(e) => setCompGst(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-purple-300 font-mono font-bold focus:border-amber-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  The system will automatically prevent multiple companies from having the same GST number.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Client Google Account Email (For Sheet Visibility & Sharing)
                </label>
                <input
                  type="email"
                  placeholder="client-account@gmail.com"
                  value={compEmail}
                  onChange={(e) => setCompEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Logo Link / URL
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={compLogoUrl}
                  onChange={(e) => setCompLogoUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Dedicated Google Sheet URL (Optional / Pre-existing)
                </label>
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  value={compSpreadsheetUrl}
                  onChange={(e) => setCompSpreadsheetUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-emerald-300 font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddCompanyModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-md"
                >
                  Save to Master Database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURE / LINK NRMAN MASTER DATABASE SHEET */}
      {isMasterSheetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] p-6 shadow-2xl flex flex-col gap-4 overflow-hidden my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-base">
                <Database className="w-5 h-5" />
                <span>Master Google Sheet</span>
              </div>
              <button 
                onClick={() => setIsMasterSheetModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto pr-1 text-xs">
              <div className="flex flex-col gap-1.5 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 font-semibold">Separate Master Database Sheet:</span>
                {masterSheet.spreadsheetId && masterSheet.spreadsheetId !== '1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs' ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-emerald-400 font-bold truncate">ID: {masterSheet.spreadsheetId}</span>
                    <a
                      href={masterSheet.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 bg-emerald-950 text-emerald-300 border border-emerald-500/30 rounded text-[11px] font-bold flex items-center gap-1"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : (
                  <div className="text-amber-400/90 text-[11px]">
                    Not connected yet. Click <strong>Create Master Sheet</strong> below to create a separate <code>nrman_master_database</code> sheet.
                  </div>
                )}
              </div>

              {/* Create or Connect Master Sheet */}
              <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex flex-col gap-3">
                <span className="font-bold text-slate-100 text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Create Separate Master Sheet</span>
                </span>

                <p className="text-[11px] text-slate-300">
                  Creates a dedicated, separate Google Sheet named <strong>nrman_master_database</strong> in your Google account (<strong className="text-amber-300">{masterSheet.ownerAccount || 'sinchanar1002@gmail.com'}</strong>) with all 10 standard headers and records:
                </p>

                {/* Column Headers Badges */}
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                  {MASTER_COLUMN_HEADERS.map((col, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-mono border border-slate-700">
                      {col}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCreateMasterSheet}
                    disabled={isCreatingMasterSheet}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 font-black text-xs transition-all shadow-lg disabled:opacity-50"
                  >
                    <FileSpreadsheet className={`w-4 h-4 ${isCreatingMasterSheet ? 'animate-spin' : ''}`} />
                    <span>{isCreatingMasterSheet ? 'Processing...' : 'Create Master Sheet'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyHeaders}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all"
                  >
                    {copiedHeaders ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                    <span>{copiedHeaders ? 'Copied' : 'Copy Headers'}</span>
                  </button>
                </div>
              </div>

              {/* Link Existing Master Sheet */}
              <form onSubmit={handleSaveMasterSheetUrl} className="flex flex-col gap-2.5">
                <span className="font-bold text-slate-200">Link Existing Separate Sheet</span>
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  value={masterSheetUrlInput}
                  onChange={(e) => setMasterSheetUrlInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-amber-200 font-mono focus:border-amber-500 focus:outline-none"
                  required
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsMasterSheetModalOpen(false)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingMasterSheet}
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-md disabled:opacity-50"
                  >
                    {savingMasterSheet ? 'Saving...' : 'Save Link'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE ENTERPRISE CLIENT */}
      {clientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-rose-900/60 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-rose-400 font-bold text-base">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-slate-100 font-bold">Remove Enterprise Client</h3>
                <p className="text-xs text-slate-400 font-normal">This action is irreversible</p>
              </div>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
              Are you sure you want to completely delete client <strong className="text-amber-300 font-mono">{clientToDelete}</strong> and all their registered companies from the master database?
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setClientToDelete(null)}
                disabled={isDeletingClient}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmDeleteClient(clientToDelete)}
                disabled={isDeletingClient}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingClient ? 'Deleting...' : 'Delete Client'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE COMPANY */}
      {companyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-rose-900/60 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-rose-400 font-bold text-base">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-slate-100 font-bold">Remove Company</h3>
                <p className="text-xs text-slate-400 font-normal">Master Database Record</p>
              </div>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
              Are you sure you want to remove <strong className="text-amber-300">{companyToDelete.name}</strong> [<span className="font-mono text-cyan-400 font-bold">{companyToDelete.prefix}</span>] from <code>nrman_master_database</code>?
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setCompanyToDelete(null)}
                disabled={isDeletingCompany}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmDeleteCompany(companyToDelete)}
                disabled={isDeletingCompany}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingCompany ? 'Removing...' : 'Delete Company'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
