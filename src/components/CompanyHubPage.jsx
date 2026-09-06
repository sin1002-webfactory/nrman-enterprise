import React, { useState, useEffect } from 'react';
import { Building2, Plus, ArrowRight, ShieldCheck, LogOut, Search, Sparkles, Building, Layers, CheckCircle2, FileSpreadsheet, Mail, ExternalLink, Users, Trash2, AlertTriangle, KeyRound, X, ShieldAlert, Link as LinkIcon, Edit3, Receipt, HelpCircle, TableProperties, Loader2, RefreshCw } from 'lucide-react';
import CreateCompanyModal from './CreateCompanyModal';
import ConnectSheetModal from './ConnectSheetModal';
import SheetStatusModal from './SheetStatusModal';
import { safeSetItem } from '@/lib/storageHelper';
import { deleteCompanyFromRegistry, updateCompanySpreadsheet, isRealGoogleSheetId, getOpenGoogleSheetUrl, initializeGoogleSheetSubTables } from '@/lib/saveToDatabase';

export default function CompanyHubPage({ currentUser, onSelectCompany, onLogout, onNavigateToCeo }) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [companyToDelete, setCompanyToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);
  const [initializingPrefix, setInitializingPrefix] = useState(null);
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [statusModalCompany, setStatusModalCompany] = useState(null);
  
  const [connectModalState, setConnectModalState] = useState({
    isOpen: false,
    title: '',
    accountEmail: '',
    sheetName: '',
    initialSpreadsheetId: '',
    initialSpreadsheetUrl: '',
    isMaster: false,
    companyPrefix: '',
    focusTarget: 'account',
    onSave: null
  });
  
  const activeClientCode = (typeof window !== 'undefined' && localStorage.getItem('rgc_client_code')) || 'rgc@nrman';

  useEffect(() => {
    // Sanitize legacy or auto-populated accounts@royalgokul.com across storage
    try {
      const activeRaw = localStorage.getItem('rgc_active_company');
      if (activeRaw) {
        const activeObj = JSON.parse(activeRaw);
        if (activeObj?.googleEmail === 'accounts@royalgokul.com') {
          activeObj.googleEmail = 'sinchanar1002@gmail.com';
          safeSetItem('rgc_active_company', JSON.stringify(activeObj));
        }
      }

      const clientScopedKey = `rgc_company_registry_${activeClientCode}`;
      const scopedRaw = localStorage.getItem(clientScopedKey);
      if (scopedRaw) {
        const scopedList = JSON.parse(scopedRaw);
        let changed = false;
        const cleaned = (scopedList || []).map(c => {
          if (c && c.googleEmail === 'accounts@royalgokul.com') {
            changed = true;
            return { ...c, googleEmail: 'sinchanar1002@gmail.com' };
          }
          return c;
        });
        if (changed) {
          safeSetItem(clientScopedKey, JSON.stringify(cleaned));
          setCompanies(cleaned);
        }
      }
    } catch (_) {}

    const handleCompanyUpdate = () => {
      const clientScoped = localStorage.getItem(`rgc_company_registry_${activeClientCode}`);
      if (clientScoped) {
        setCompanies(JSON.parse(clientScoped));
      }
    };
    window.addEventListener('rgc_company_registry_updated', handleCompanyUpdate);
    return () => {
      window.removeEventListener('rgc_company_registry_updated', handleCompanyUpdate);
    };
  }, [activeClientCode]);

  const handleOpenCompanySheet = async (comp, e, focusTarget = 'sheet') => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!comp) return;

    if (focusTarget === 'sheet') {
      if (isRealGoogleSheetId(comp?.spreadsheetId)) {
        const targetUrl = getOpenGoogleSheetUrl(comp.spreadsheetId, comp.googleEmail || 'sinchanar1002@gmail.com');
        window.open(targetUrl, '_blank');
        return;
      }
      
      // If no real Google Sheet ID exists yet, provision in Google Drive and then open!
      setActionNotice({
        type: 'info',
        text: `Creating real Google Sheet in Google Drive for ${comp.name || comp.prefix}...`
      });
      setInitializingPrefix(comp.prefix);
      try {
        const initRes = await initializeGoogleSheetSubTables({
          spreadsheetId: comp.spreadsheetId,
          prefix: comp.prefix,
          companyName: comp.name || comp.companyName,
          googleEmail: comp.googleEmail || 'sinchanar1002@gmail.com',
          clientCode: activeClientCode
        });

        if (initRes && initRes.success && initRes.spreadsheetId && isRealGoogleSheetId(initRes.spreadsheetId)) {
          const finalId = initRes.spreadsheetId;
          const finalUrl = initRes.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${finalId}/edit`;
          updateCompanySpreadsheet(comp.prefix, {
            spreadsheetId: finalId,
            spreadsheetUrl: finalUrl,
            googleEmail: initRes.googleEmail || comp.googleEmail || 'sinchanar1002@gmail.com',
            sheetsCreated: true
          });
          setCompanies(prev => prev.map(c => c.prefix === comp.prefix ? {
            ...c,
            spreadsheetId: finalId,
            spreadsheetUrl: finalUrl,
            googleEmail: initRes.googleEmail || comp.googleEmail || 'sinchanar1002@gmail.com',
            sheetsCreated: true
          } : c));
          setActionNotice({
            type: 'success',
            text: `Google Sheet created in Google Drive with all 8 sub-tables for ${comp.name || comp.prefix}! Opening now...`
          });
          window.open(getOpenGoogleSheetUrl(finalId, comp.googleEmail || 'sinchanar1002@gmail.com'), '_blank');
          return;
        }
      } catch (_) {} finally {
        setInitializingPrefix(null);
      }
    }

    setConnectModalState({
      isOpen: true,
      title: `${comp?.name || comp?.prefix} Operational Sheet & Google Account`,
      accountEmail: (comp?.googleEmail && comp.googleEmail !== 'accounts@royalgokul.com') ? comp.googleEmail : 'sinchanar1002@gmail.com',
      sheetName: `${comp?.name || comp?.prefix} Tables`,
      initialSpreadsheetId: comp?.spreadsheetId,
      initialSpreadsheetUrl: comp?.spreadsheetUrl,
      isMaster: false,
      companyPrefix: comp?.prefix,
      focusTarget,
      onSave: ({ spreadsheetId, spreadsheetUrl, googleEmail }) => {
        const res = updateCompanySpreadsheet(comp.prefix, { spreadsheetId, spreadsheetUrl, googleEmail });
        const finalId = (res && res.spreadsheetId) || spreadsheetId;
        const finalUrl = (res && res.spreadsheetUrl) || spreadsheetUrl;
        setCompanies(prev => prev.map(c => c.prefix === comp.prefix ? { 
          ...c, 
          spreadsheetId: finalId || c.spreadsheetId, 
          spreadsheetUrl: finalUrl || c.spreadsheetUrl,
          googleEmail: googleEmail !== undefined ? googleEmail : c.googleEmail,
          sheetsCreated: true
        } : c));
        setActionNotice({ 
          type: 'success', 
          text: `Google account linked & sheet verified for ${comp.name || comp.prefix}! 2-way background push & pull is active.` 
        });
        setTimeout(() => setActionNotice(null), 4500);
      }
    });
  };

  const handleQuickInitSubTables = async (comp, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setInitializingPrefix(comp.prefix);
    setActionNotice({
      type: 'info',
      text: `Creating Google Sheet and formatting all 8 sub-tables for ${comp.name || comp.prefix}...`
    });
    try {
      const res = await initializeGoogleSheetSubTables({
        spreadsheetId: comp.spreadsheetId,
        prefix: comp.prefix,
        companyName: comp.name || comp.companyName,
        googleEmail: comp.googleEmail || 'sinchanar1002@gmail.com',
        clientCode: activeClientCode
      });
      if (res && res.success) {
        if (res.spreadsheetId && isRealGoogleSheetId(res.spreadsheetId)) {
          const finalId = res.spreadsheetId;
          const finalUrl = res.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${finalId}/edit`;
          updateCompanySpreadsheet(comp.prefix, {
            spreadsheetId: finalId,
            spreadsheetUrl: finalUrl,
            googleEmail: res.googleEmail || comp.googleEmail || 'sinchanar1002@gmail.com',
            sheetsCreated: true
          });
          setCompanies(prev => prev.map(c => c.prefix === comp.prefix ? {
            ...c,
            spreadsheetId: finalId,
            spreadsheetUrl: finalUrl,
            googleEmail: res.googleEmail || comp.googleEmail || 'sinchanar1002@gmail.com',
            sheetsCreated: true
          } : c));
        }
        setActionNotice({
          type: 'success',
          text: `All 8 sub-tables (Projects, GRN, Payments, Masters, Ledgers, Profiles, PnL, Audits) are formatted and active in Google Sheets for ${comp.name || comp.prefix}!`
        });
      } else {
        setActionNotice({
          type: 'warning',
          text: res?.error || `Sub-table schema registered for ${comp.name || comp.prefix}! They will also auto-format whenever you save your first entry.`
        });
      }
    } catch (err) {
      setActionNotice({
        type: 'info',
        text: `Sub-tables are configured to auto-create in Google Sheets upon your first data entry.`
      });
    } finally {
      setInitializingPrefix(null);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const [companies, setCompanies] = useState(() => {
    try {
      const clientScoped = localStorage.getItem(`rgc_company_registry_${activeClientCode}`);
      let list = clientScoped ? JSON.parse(clientScoped) : [];
      if (!list || list.length === 0) {
        const stored = localStorage.getItem('rgc_company_registry');
        list = stored ? JSON.parse(stored) : [];
      }

      // Preserve valid Google Sheet IDs, ensure sinchanar1002@gmail.com email
      list = (list || []).map((c) => {
        if (!c) return c;
        let updated = { ...c };
        if (!updated.googleEmail || updated.googleEmail === 'accounts@royalgokul.com') {
          updated.googleEmail = 'sinchanar1002@gmail.com';
        }
        if (c.prefix === 'RGC' && (!c.spreadsheetId || !isRealGoogleSheetId(c.spreadsheetId))) {
          updated.spreadsheetId = '1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs';
          updated.spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs/edit';
          updated.sheetsCreated = true;
        }
        return updated;
      });

      // If client code is rgc@nrman and no company registered yet, seed Royal Gokul Constructions
      if (list.length === 0 && activeClientCode.toLowerCase().includes('rgc')) {
        const defaultRgc = {
          id: 'comp_rgc_default',
          name: 'ROYALGOKUL CONSTRUCTIONS PVT LTD',
          companyName: 'ROYALGOKUL CONSTRUCTIONS PVT LTD',
          prefix: 'RGC',
          logo: '/logo.svg',
          logoBase64: null,
          clientCode: activeClientCode,
          googleEmail: 'sinchanar1002@gmail.com',
          spreadsheetId: '1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs',
          spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1nj3WxAa1z60x-iEfCNmL_DfDFY0_1tb5V_r9E2fmzXs/edit',
          sheetsCreated: true,
          tables: [
            'RGC_Projects',
            'RGC_GRN_Entries',
            'RGC_Payments',
            'RGC_Masters',
            'RGC_Ledgers',
            'RGC_Profiles',
            'RGC_PnL_Matrix',
            'RGC_Purchase_Audits'
          ],
          createdAt: new Date().toISOString()
        };
        list = [defaultRgc];
        safeSetItem(`rgc_company_registry_${activeClientCode}`, JSON.stringify(list));
        safeSetItem('rgc_company_registry', JSON.stringify(list));
      }

      return list;
    } catch {
      return [];
    }
  });

  const handleCompanyCreated = (newCompany) => {
    const updated = [newCompany, ...companies.filter(c => c && c.prefix !== newCompany.prefix)];
    setCompanies(updated);
    safeSetItem(`rgc_company_registry_${activeClientCode}`, JSON.stringify(updated));
    safeSetItem('rgc_company_registry', JSON.stringify(updated));
    safeSetItem('rgc_active_company', JSON.stringify(newCompany));
    setActionNotice({ type: 'success', text: `Company ${newCompany.name} [${newCompany.prefix}] created with dedicated sheet!` });
    setTimeout(() => setActionNotice(null), 4000);
    onSelectCompany(newCompany);
  };

  const confirmDeleteCompany = async () => {
    if (!companyToDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteCompanyFromRegistry(companyToDelete.prefix, activeClientCode);
      if (res.success) {
        const updated = companies.filter(c => c && (c.prefix || '').toUpperCase() !== companyToDelete.prefix.toUpperCase());
        setCompanies(updated);
        setActionNotice({
          type: 'success',
          text: `Company ${companyToDelete.name || companyToDelete.prefix} has been deleted successfully.`
        });
      } else {
        setActionNotice({
          type: 'error',
          text: res.error || 'Failed to delete company'
        });
      }
    } catch (err) {
      setActionNotice({
        type: 'error',
        text: 'Error deleting company workspace'
      });
    } finally {
      setIsDeleting(false);
      setCompanyToDelete(null);
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  const filteredCompanies = companies.filter(c => 
    c && (
      (c.name || c.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.prefix || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center text-amber-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight uppercase">NrMAN Enterprise Hub</h1>
              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">
                Client: {activeClientCode}
              </span>
            </div>
            <p className="text-xs text-slate-400">Multi-Company Directory & Dedicated Google Sheets Manager</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeClientCode === 'ceo@nrman' && (
            <button
              onClick={onNavigateToCeo}
              className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer shadow-sm"
              title="Open CEO Master Database & Control Center"
            >
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>CEO Dashboard</span>
            </button>
          )}

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/10 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create New Company</span>
            <span className="sm:hidden">New</span>
          </button>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs font-bold transition border border-slate-700 cursor-pointer"
            title="Logout and return to NrMAN Home Page"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout to Home</span>
          </button>
        </div>
      </header>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className="max-w-6xl mx-auto w-full px-6 pt-4">
          <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            actionNotice.type === 'error'
              ? 'bg-rose-950/80 border-rose-700 text-rose-200'
              : 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
          }`}>
            <span>{actionNotice.text}</span>
            <button onClick={() => setActionNotice(null)} className="p-1 hover:opacity-75">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Grid Section */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 sm:p-8 flex flex-col justify-start">

        {/* Title and Controls Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>Company Workspaces</span>
              <span className="text-xs font-bold bg-slate-800 text-amber-400 px-2.5 py-1 rounded-full border border-slate-700">
                {companies.length} Registered
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Select a company to open its <strong className="text-slate-200">Employee Login</strong>. Each company sheet is linked to their own account. You can also delete any company below.
            </p>
          </div>

          {companies.length > 0 && (
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search companies by name or prefix..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          )}
        </div>

        {/* Empty State / Initial Creation Prompt */}
        {companies.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-900/60 border border-slate-800/80 rounded-3xl backdrop-blur-sm min-h-[380px]">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 animate-bounce">
              <Building2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Create Your First Company</h3>
            <p className="text-xs text-slate-400 max-w-md mb-6">
              Enter your Company Name, Prefix, and Google Email Account. Separate Google Sheets (<code className="text-amber-400">[Prefix]_GRN</code>, <code className="text-amber-400">[Prefix]_Masters</code>) will be created automatically and linked to that company's account.
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition shadow-xl shadow-amber-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Create Company Now</span>
            </button>
          </div>
        ) : (
          /* Grid of Company Cards */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCompanies.map((comp, index) => (
              <div
                key={comp.id || comp.prefix || index}
                className="group relative bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-500/60 rounded-2xl p-6 transition-all duration-200 shadow-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="w-14 h-14 rounded-xl bg-slate-950 border border-slate-700/80 p-2 flex items-center justify-center shrink-0 group-hover:scale-105 transition overflow-hidden">
                      {comp.logo || comp.logoBase64 ? (
                        <img 
                          src={comp.logo || comp.logoBase64} 
                          alt={comp.name || comp.companyName} 
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <Building className="w-7 h-7 text-amber-400" />
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg">
                        Prefix: {comp.prefix}
                      </span>
                      
                      {/* Delete Company Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompanyToDelete(comp);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-600 transition cursor-pointer"
                        title={`Delete ${comp.name || comp.prefix} Company`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-extrabold text-white group-hover:text-amber-400 transition mb-1 line-clamp-1">
                    {comp.name || comp.companyName}
                  </h3>

                  {/* GSTIN Identification Badge */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 bg-slate-950/80 border border-slate-700/70 text-[10px] font-mono px-2 py-0.5 rounded-lg text-slate-300">
                      <Receipt className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="text-slate-400 font-sans text-[9px] uppercase tracking-wider">GSTIN:</span>
                      <span className="text-amber-300 font-bold tracking-wide">
                        {comp.gstNumber || (comp.prefix === 'RGC' ? '29AABCR1234F1Z5' : 'Unregistered')}
                      </span>
                    </span>
                  </div>
                  
                  {/* Google Account & Sheet Info - Linked to Company's Own Account */}
                  <div className="my-3 space-y-1.5 p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-[11px]">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Company's Own Sheet:
                      </span>
                      <button 
                        type="button"
                        onClick={(e) => handleOpenCompanySheet(comp, e)}
                        className="text-amber-400 hover:underline flex items-center gap-1 font-mono text-[10px] cursor-pointer"
                      >
                        <span>Open Sheet</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span className="truncate max-w-[140px]">
                        ID: {isRealGoogleSheetId(comp.spreadsheetId) 
                          ? `${comp.spreadsheetId.substring(0, 12)}...` 
                          : (comp.googleEmail ? `Linked (${comp.googleEmail.split('@')[0]})` : 'Setup Needed')}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleOpenCompanySheet(comp, e)}
                        className="text-[10px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-sans"
                      >
                        <Edit3 className="w-2.5 h-2.5" />
                        <span>{comp.googleEmail || isRealGoogleSheetId(comp.spreadsheetId) ? 'Manage Sheet' : 'Connect Sheet'}</span>
                      </button>
                    </div>

                    {/* Live Sheet Status Indicator */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px]">
                      <span className="text-slate-400">Sync Status:</span>
                      <span className={comp.googleEmail || isRealGoogleSheetId(comp.spreadsheetId) ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
                        {comp.googleEmail || isRealGoogleSheetId(comp.spreadsheetId) ? '● 2-Way Background Sync Active' : '⚠ Connect Gmail to Auto-Create'}
                      </span>
                    </div>

                    {/* Linked to Company's Own Google Account */}
                    <div className="flex items-center justify-between gap-1.5 text-[10px] truncate pt-1 border-t border-slate-800/80">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Mail className={`w-3 h-3 shrink-0 ${comp.googleEmail ? 'text-emerald-400' : 'text-amber-400'}`} />
                        <span>Google Account:</span>
                      </div>
                      {comp.googleEmail ? (
                        <div className="flex items-center gap-1.5 max-w-[170px]">
                          <span className="text-amber-300 font-mono font-medium truncate" title={comp.googleEmail}>
                            {comp.googleEmail}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleOpenCompanySheet(comp, e, 'account')}
                            className="text-slate-400 hover:text-amber-300 cursor-pointer p-0.5"
                            title="Edit Google Account"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleOpenCompanySheet(comp, e, 'account')}
                          className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/40 text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer shadow-sm"
                        >
                          <Plus className="w-2.5 h-2.5" />
                          <span>+ Connect Gmail</span>
                        </button>
                      )}
                    </div>

                    {/* Sub-Tables Action & Check Status */}
                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatusModalCompany(comp);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 text-[10px] font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        title="Check if sheet is created in Google Drive for sinchanar1002@gmail.com and verify all 8 sub-tables"
                      >
                        <ShieldCheck className="w-3 h-3 text-blue-400" />
                        <span>🔍 Check Sheet & 2-Way Sync</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFaqModalOpen(true);
                          }}
                          className="text-[9px] text-slate-400 hover:text-blue-300 underline flex items-center gap-0.5 cursor-pointer"
                          title="Click for explanation on sub-tables and initial creation"
                        >
                          <HelpCircle className="w-2.5 h-2.5" />
                          <span>FAQ</span>
                        </button>
                        <button
                          type="button"
                          disabled={initializingPrefix === comp.prefix}
                          onClick={(e) => handleQuickInitSubTables(comp, e)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                          title="Format and create all 8 sub-tables and headers right now in Google Sheets"
                        >
                          {initializingPrefix === comp.prefix ? (
                            <>
                              <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-400" />
                              <span>Building...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                              <span>Setup 8 Sub-Tables</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      8 Tables Active
                    </span>
                    <span>{comp.createdAt ? new Date(comp.createdAt).toLocaleDateString() : 'Active'}</span>
                  </div>

                  {/* Primary Company Selection Button -> Directs to Employee Login */}
                  <button
                    onClick={() => onSelectCompany(comp)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20"
                  >
                    <Users className="w-4 h-4" />
                    <span>Select & Employee Login</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ⚠️ DELETE COMPANY CONFIRMATION MODAL */}
      {companyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Company Workspace?</h3>
                <p className="text-xs text-rose-300 font-mono">[{companyToDelete.prefix}] {companyToDelete.name || companyToDelete.companyName}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to delete this company workspace? This will remove the company from your directory, unbind its dedicated sheet (<code className="text-amber-400">{companyToDelete.spreadsheetId}</code>), and clear its local workspace session.
            </p>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl mb-6 space-y-1 text-xs text-slate-400">
              <div><strong className="text-slate-300">Company:</strong> {companyToDelete.name || companyToDelete.companyName}</div>
              <div><strong className="text-slate-300">Prefix:</strong> {companyToDelete.prefix}</div>
              <div><strong className="text-slate-300">Linked Account:</strong> {companyToDelete.googleEmail || 'Not configured'}</div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCompanyToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmDeleteCompany}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 transition shadow-lg shadow-rose-600/20 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Deleting...' : 'Yes, Delete Company'}</span>
              </button>
            </div>
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

      {/* Creation Modal */}
      <CreateCompanyModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCompanyCreated={handleCompanyCreated}
      />

      {/* Sub-Tables & Sheet FAQ Modal */}
      {faqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setFaqModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Google Sheet Sub-Tables FAQ</h3>
                <p className="text-xs text-slate-400">Understanding blank sheets & automatic sub-table generation</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <h4 className="text-amber-400 font-bold flex items-center gap-1.5">
                  <span>Q: Why does clicking "Open Sheet" open a blank sheet?</span>
                </h4>
                <p className="text-slate-300 leading-relaxed">
                  When a new Google Spreadsheet is created via Google Drive, Google starts with a single default blank tab named <em>"Sheet1"</em>.
                </p>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <h4 className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Q: Will sub-tables be created after I make an entry?</span>
                </h4>
                <p className="text-slate-300 leading-relaxed font-semibold">
                  YES, automatically!
                </p>
                <p className="text-slate-400 leading-relaxed">
                  The moment you save your first entry in NrMAN (such as adding a Project, creating a GRN entry, logging a Payment, or saving a Master item), NrMAN automatically connects to the Google Sheet, builds that specific sub-table tab with formatted dark navy and gold column headers, and inserts the data row.
                </p>
              </div>

              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <h4 className="text-amber-300 font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Q: Can I create all 8 sub-tables and column headers right now without waiting?</span>
                </h4>
                <p className="text-slate-300 leading-relaxed">
                  <strong>YES!</strong> Simply click the <strong className="text-amber-300">"Setup 8 Sub-Tables"</strong> button on any company card. NrMAN will immediately format and initialize all 8 canonical sub-tables:
                </p>
                <div className="grid grid-cols-2 gap-1.5 pt-1 font-mono text-[11px] text-slate-300">
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 1. Projects
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 2. GRN_Entries
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 3. Payments
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 4. Masters
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 5. Ledgers
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 6. Profiles
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 7. PnL_Matrix
                  </div>
                  <div className="bg-slate-900 p-1.5 rounded border border-slate-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> 8. Purchase_Audits
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setFaqModalOpen(false)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Got It, Thanks!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Sheet Status & 2-Way Push/Pull Modal */}
      {statusModalCompany && (
        <SheetStatusModal
          isOpen={!!statusModalCompany}
          onClose={() => setStatusModalCompany(null)}
          company={statusModalCompany}
          clientCode={activeClientCode}
          onCompanyUpdated={(updated) => {
            setCompanies(prev => prev.map(c => c.prefix === updated.prefix ? updated : c));
            setStatusModalCompany(updated);
          }}
        />
      )}
    </div>
  );
}
