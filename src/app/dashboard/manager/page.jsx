"use client";
import { useState, useEffect } from 'react';
import { SYNC_KEYS, fetchStorageData, saveStorageData, appendSingleRecord, notifyDataSync } from '@/lib/dataSync';
import TableImportModal from '@/components/TableImportModal';
import ResetDataModal from '@/components/ResetDataModal';
import CreateCompanyModal from '@/components/CreateCompanyModal';
import BackupButton from '@/components/BackupButton';
import ExportButton from '@/components/ExportButton';
import PaymentsTabSection from './PaymentsTabSection';
import { safeSetItem } from '@/lib/storageHelper';
import { deleteCompanyFromRegistry } from '@/lib/saveToDatabase';
import { Building2, Building, Layers, UserPlus, Database, CheckCircle2, AlertCircle, LogOut, ShieldCheck, RefreshCw, Trash2, RotateCcw, LayoutDashboard, FileText, PieChart, Wallet, CreditCard, UploadCloud, PlusCircle, ListOrdered, FileSpreadsheet, Printer, IndianRupee, Search, Plus, Filter, Calendar, BookOpen, Menu, X, Lock, Unlock, ShieldAlert, ShoppingBag, Package, Boxes, Tag, ChevronDown, Sparkles } from 'lucide-react';

export default function ManagerDashboard({ onNavigate, currentUser, onLogout, onOpenSheetsModal, onOpenCompanyModal, sheetsState }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('desk'); // 'desk' | 'payments' | 'ledgers'
  const [deskSubTab, setDeskSubTab] = useState('projects'); // 'projects' | 'masters' | 'register' | 'profiles' | 'authority'
  const [isCreateCompanyOpen, setIsCreateCompanyOpen] = useState(false);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [companyRegistry, setCompanyRegistry] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('rgc_company_registry') || '[]');
    } catch (_) { return []; }
  });
  const [activeCompany, setActiveCompany] = useState(() => {
    try {
      const saved = localStorage.getItem('rgc_active_company');
      return saved ? JSON.parse(saved) : { name: 'ROYALGOKUL CONSTRUCTIONS PVT LTD', logo: '/logo.svg', prefix: 'RGC' };
    } catch (_) {
      return { name: 'ROYALGOKUL CONSTRUCTIONS PVT LTD', logo: '/logo.svg', prefix: 'RGC' };
    }
  });

  const [project, setProject] = useState({ name: '', location: '', budget: '' });
  // Master Form State
  const [master, setMaster] = useState({ type: 'Category', parentCategory: '', value: '' });
  const [supplierMasterForm, setSupplierMasterForm] = useState({
    supplierAddress: '',
    gstNumber: '',
    bankDetails: '',
    cgst: '9',
    sgst: '9',
    igst: '0'
  });
  const [user, setUser] = useState({ email: '', fullName: '', designation: 'Accounts Assistant' });

  // Email Handle Lock State (Manager Lock Governance)
  const [isEmailLocked, setIsEmailLocked] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rgc_emails_locked') === 'true';
    }
    return false;
  });

  const formatDDMMYYYY = (dateStr) => {
    if (!dateStr) return '-';
    const s = String(dateStr).trim().split('T')[0];
    if (s.includes('-')) {
      const parts = s.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
      }
      if (parts.length === 3 && parts[2].length === 4) {
        return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
      }
    }
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
      }
      if (parts.length === 3 && parts[2].length === 4) {
        return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
      }
    }
    return s;
  };

  const toggleEmailLock = () => {
    const nextState = !isEmailLocked;
    setIsEmailLocked(nextState);
    if (typeof window !== 'undefined') {
      localStorage.setItem('rgc_emails_locked', String(nextState));
    }
    showNotice(
      nextState ? 'error' : 'success', 
      nextState ? '🔒 All email handles locked. No further email handles or staff profiles can be created.' : '🔓 Email handle creation unlocked by Manager.'
    );
  };

  // Default master items fallback
  const defaultMasterItems = [];

  // Helper to get Financial Year code (e.g., "26-27" for 2026-2027)
  const getFinancialYearCode = (dateStr) => {
    const d = dateStr ? new Date(dateStr) : new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1; // 1-12
    const startYear = month >= 4 ? year : year - 1;
    const endYear = startYear + 1;
    const sy = String(startYear).slice(-2);
    const ey = String(endYear).slice(-2);
    return `${sy}-${ey}`;
  };

  // Helper to calculate auto-incrementing Payment ID formatted in financial year/serial format (e.g. 26-27/001)
  const calculateNextPaymentId = (paymentsArr, dateStr) => {
    const fyCode = getFinancialYearCode(dateStr || new Date().toISOString().split('T')[0]); // e.g. "26-27"
    const prefix = `${fyCode}/`;
    
    let allRecords = Array.isArray(paymentsArr) ? [...paymentsArr] : [];
    if (typeof window !== 'undefined') {
      try {
        const stored = JSON.parse(localStorage.getItem(SYNC_KEYS.PAYMENTS) || '[]');
        if (Array.isArray(stored)) {
          allRecords = [...allRecords, ...stored];
        }
      } catch (_) {}
    }

    let maxSeq = 0;
    allRecords.forEach(p => {
      const pIdStr = String(p?.payId || p?.paymentId || p?.id || '').trim();
      const match = pIdStr.match(/(?:PAY-)?(\d{2}-\d{2})[\/-](\d+)/i);
      if (match && match[2]) {
        if (match[1] === fyCode) {
          const seqVal = parseInt(match[2], 10);
          if (!isNaN(seqVal) && seqVal > maxSeq) {
            maxSeq = seqVal;
          }
        }
      } else {
        const numOnlyMatch = pIdStr.match(/(\d+)$/);
        if (numOnlyMatch && numOnlyMatch[1]) {
          const seqVal = parseInt(numOnlyMatch[1], 10);
          if (!isNaN(seqVal) && seqVal > maxSeq) {
            maxSeq = seqVal;
          }
        }
      }
    });

    const nextSeq = String(maxSeq + 1).padStart(3, '0');
    return `${prefix}${nextSeq}`;
  };

  // Payment Form State (Pay ID, Payment Date, Site, Vendor, Mode of Transaction, Account Number, Paid Amount, Remarks)
  const [paymentForm, setPaymentForm] = useState({
    payId: '26-27/001',
    paymentDate: new Date().toISOString().split('T')[0],
    siteName: '',
    project: '',
    vendor: '',
    paymentMode: '',
    accountNumber: '',
    paidAmount: '',
    remarks: ''
  });

  // Payments Register Table Filters State
  const [paymentSearchQuery, setPaymentSearchQuery] = useState('');
  const [paymentSiteFilter, setPaymentSiteFilter] = useState('All Sites');
  const [paymentVendorFilter, setPaymentVendorFilter] = useState('All Vendors');
  const [paymentModeFilter, setPaymentModeFilter] = useState('All Modes');
  const [paymentAccountFilter, setPaymentAccountFilter] = useState('All Accounts');
  const [paymentDatePreset, setPaymentDatePreset] = useState('all'); // 'all' | 'today' | 'monthly' | 'yearly' | 'custom'
  const [paymentStartDate, setPaymentStartDate] = useState('');
  const [paymentEndDate, setPaymentEndDate] = useState('');

  // Ledger Subtab State ('vendor' | 'purchase')
  const [ledgerSubTab, setLedgerSubTab] = useState('vendor');

  // Vendor Passbook Ledger Filters State
  const [ledgerFilterPreset, setLedgerFilterPreset] = useState('all');
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState('');
  const [ledgerSupplierFilter, setLedgerSupplierFilter] = useState('All');
  const [ledgerSiteFilter, setLedgerSiteFilter] = useState('All');
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState('');

  // Purchase Ledger Filters State (Columns: Site, Vendor, Material, Item, Purchase Value)
  const [purchaseFilterPreset, setPurchaseFilterPreset] = useState('all');
  const [purchaseStartDate, setPurchaseStartDate] = useState('');
  const [purchaseEndDate, setPurchaseEndDate] = useState('');
  const [purchaseVendorFilter, setPurchaseVendorFilter] = useState('All');
  const [purchaseMaterialFilter, setPurchaseMaterialFilter] = useState('All');
  const [purchaseSiteFilter, setPurchaseSiteFilter] = useState('All');
  const [purchaseSearchQuery, setPurchaseSearchQuery] = useState('');

  // Ledger Form State (Legacy fallback)
  const [ledgerForm, setLedgerForm] = useState({
    vendor: '',
    project: '',
    openingBalance: '',
    ledgerType: 'Vendor Accounts Ledger',
    creditLimit: '₹ 50,00,000'
  });

  // Real-time Lists State
  const [projectsList, setProjectsList] = useState([]);
  const [mastersList, setMastersList] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [paymentsList, setPaymentsList] = useState([]);
  const [ledgersList, setLedgersList] = useState([]);
  const [grnList, setGrnList] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', msg: '' });
  const [showResetDataModal, setShowResetDataModal] = useState(false);

  const handleResetComplete = ({ mode }) => {
    setPaymentsList([]);
    setLedgersList([]);
    setGrnList([]);
    if (mode === 'factory') {
      setProjectsList([]);
      setMastersList([]);
      setUsersList([]);
    }
    setFeedback({ type: 'success', msg: 'All website data successfully wiped clean.' });
  };

  // Import Modal State
  const [importModalConfig, setImportModalConfig] = useState({
    isOpen: false,
    tableName: '',
    onImport: () => {},
    sampleCsv: '',
    sampleRows: []
  });

  const loadData = async () => {
    setLoading(true);
    loadLocalData();
    setLoading(false);
  };

  const cleanRealPaymentsOnly = (pData) => {
    const payArr = Array.isArray(pData) ? pData : [];
    // Strictly preserve only real payments recorded by the manager (strip out synthetic dummy GRN rows)
    return payArr.filter(p => p && !p.isGrn && !String(p.id || '').startsWith('PAY-GRN-') && !String(p.paymentId || '').startsWith('PAY-GRN-'));
  };

  const loadLocalData = () => {
    const pData = fetchStorageData(SYNC_KEYS.PROJECTS);
    const mData = fetchStorageData(SYNC_KEYS.MASTERS);
    const uData = fetchStorageData(SYNC_KEYS.PROFILES);
    const rawPayments = fetchStorageData(SYNC_KEYS.PAYMENTS);
    const lData = fetchStorageData(SYNC_KEYS.LEDGERS);
    const gData = fetchStorageData(SYNC_KEYS.GRN);

    setProjectsList(pData);
    setMastersList(mData);
    setUsersList(uData);
    setLedgersList(lData);
    setGrnList(gData);

    const cleanPayments = cleanRealPaymentsOnly(rawPayments);
    // If legacy dummy payments were present in storage, clean them out permanently
    if (Array.isArray(rawPayments) && rawPayments.length !== cleanPayments.length) {
      saveStorageData(SYNC_KEYS.PAYMENTS, cleanPayments);
    }
    setPaymentsList(cleanPayments);
  };

  useEffect(() => {
    loadData();
    loadLocalData();

    const handleSync = () => {
      loadLocalData();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('rgc_data_sync', handleSync);
      window.addEventListener('storage', handleSync);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('rgc_data_sync', handleSync);
        window.removeEventListener('storage', handleSync);
      }
    };
  }, []);

  const showNotice = (type, msg) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback({ type: '', msg: '' }), 4000);
  };

  // Preset filter handler for Vendor Passbook Ledger
  const handleLedgerPresetChange = (preset) => {
    setLedgerFilterPreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'all') {
      setLedgerStartDate('');
      setLedgerEndDate('');
    } else if (preset === 'daily') {
      setLedgerStartDate(todayStr);
      setLedgerEndDate(todayStr);
    } else if (preset === 'weekly') {
      const startOfWeek = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      setLedgerStartDate(startOfWeek.toISOString().split('T')[0]);
      setLedgerEndDate(todayStr);
    } else if (preset === 'monthly') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setLedgerStartDate(startOfMonth.toISOString().split('T')[0]);
      setLedgerEndDate(endOfMonth.toISOString().split('T')[0]);
    } else if (preset === 'yearly') {
      const month = today.getMonth() + 1;
      const year = today.getFullYear();
      const fyStartYear = month >= 4 ? year : year - 1;
      setLedgerStartDate(`${fyStartYear}-04-01`);
      setLedgerEndDate(`${fyStartYear + 1}-03-31`);
    }
  };

  // Connected Passbook Ledger Entries Generator (combining Purchases from GRN & Payments)
  const getPassbookLedgerEntries = () => {
    const parseVal = (v) => typeof v === 'number' ? v : Number(String(v || '').replace(/[^0-9.-]+/g, '')) || 0;
    
    const normalizeDateStr = (d) => {
      if (!d) return '2026-01-01';
      const s = String(d).trim().split('T')[0];
      if (s.includes('/')) {
        const parts = s.split('/');
        if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      return s;
    };

    const rawEntries = [];

    // 1. Convert Material GRNs (Purchases / Billings)
    // RULE 1: Reference ID = GRN ID, Transaction Date = GRN Date
    (grnList || []).forEach((g, idx) => {
      const gTot = parseVal(g.grandTotal || g.total || g.amount);
      const grnNo = String(g.grnNumber || g.id || `26-27/${String(idx + 1).padStart(3, '0')}`).trim();
      const invNo = String(g.invoiceNumber || g.invoiceNo || grnNo).trim();
      const dStr = normalizeDateStr(g.grnDate || g.grn_date || g.date || g.invoiceDate || (g.created_at ? g.created_at.split('T')[0] : '2026-02-10'));
      const supp = String(g.supplier || g.supplierName || g.vendor || g.partyName || 'General Supplier').trim();
      const site = String(g.projectName || g.siteName || g.project || g.site || 'Central Project Site').trim();

      rawEntries.push({
        id: 'grn-' + (g.id || g.grnNumber || idx),
        date: dStr, // Strict GRN Date (Transaction Date)
        particulars: `Purchase: ${g.itemName || g.category || 'Material Supplies'}`,
        type: 'Purchase',
        supplier: supp,
        siteName: site,
        grnNumber: grnNo, // Strict Reference ID = GRN ID
        paymentId: '-',
        invoiceNumber: invNo,
        purchaseAmount: gTot,
        amountPaid: 0
      });
    });

    // 2. Convert Payment Disbursements
    // RULE 2: Reference ID = Payment ID, Transaction Date = Payment Date (Independent from GRN ID/Date)
    (paymentsList || []).forEach((p, idx) => {
      // Exclude pure GRN mirror objects with 0 paid amount to prevent duplicate entries
      const paidVal = parseVal(p.paid !== undefined && p.paid !== null && String(p.paid).trim() !== '' ? p.paid : (p.paidAmount || p.amountPaid || (p.amount && !p.isGrn ? p.amount : 0)));
      if (paidVal > 0) {
        // STRICT PAYMENT DATE - NEVER OVERWRITTEN BY GRN DATE
        const dStr = normalizeDateStr(p.paymentDate || p.date || (p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0]));
        const supp = String(p.partyName || p.vendor || p.supplier || p.supplierName || 'General Supplier').trim();
        const site = String(p.projectName || p.siteName || p.project || p.site || 'Central Project Site').trim();
        
        // STRICT PAYMENT ID - Format: 26-27/001
        const paymentIdStr = String(p.payId || p.paymentId || p.voucherNo || p.referenceNo || (p.id && !String(p.id).startsWith('grn-') ? p.id : `26-27/${String(idx + 1).padStart(3, '0')}`)).trim();
        
        // Particulars column: Account number along with mode of transaction
        const modeStr = String(p.paymentMode || p.mode || p.type || '').trim();
        let accNumStr = String(
          p.accountNumber || 
          p.bankAccount || 
          p.accountNo || 
          p.account_number || 
          p.bankDetails || 
          p.bankAcc || 
          p.account || 
          ''
        ).trim();

        // If not directly present in payment record, resolve from bank master or supplier master
        if (!accNumStr) {
          const bankMatch = (mastersList || []).find(m => 
            m && (m.category === 'Bank accounts' || m.type === 'Bank accounts') &&
            ((m.label && String(m.label).trim().toLowerCase() === modeStr.toLowerCase()) ||
             (m.name && String(m.name).trim().toLowerCase() === modeStr.toLowerCase()) ||
             (m.value && String(m.value).trim().toLowerCase() === modeStr.toLowerCase()))
          );
          if (bankMatch) {
            accNumStr = String(bankMatch.bankDetails || bankMatch.accountNumber || bankMatch.bankAccount || bankMatch.value || '').trim();
          }
        }
        if (!accNumStr) {
          const suppMatch = (mastersList || []).find(m => 
            m && (m.category === 'Supplier' || m.category === 'Vendor') &&
            ((m.label && String(m.label).trim().toLowerCase() === supp.toLowerCase()) ||
             (m.name && String(m.name).trim().toLowerCase() === supp.toLowerCase()) ||
             (m.supplierName && String(m.supplierName).trim().toLowerCase() === supp.toLowerCase()))
          );
          if (suppMatch && suppMatch.bankDetails) {
            accNumStr = String(suppMatch.bankDetails).trim();
          }
        }

        const cleanAcc = accNumStr.replace(/^(a\/c[:\s]*|account\s*(no|number)?[:\s]*)/i, '').trim();

        let particularsStr = 'Payment';
        if (modeStr && cleanAcc) {
          particularsStr = `${modeStr} (A/c: ${cleanAcc})`;
        } else if (cleanAcc) {
          particularsStr = `Payment (A/c: ${cleanAcc})`;
        } else if (modeStr) {
          particularsStr = modeStr;
        }

        rawEntries.push({
          id: 'pay-' + (p.id || paymentIdStr || idx),
          date: dStr, // Strict Payment Date (Transaction Date)
          particulars: particularsStr,
          type: 'Payment',
          supplier: supp,
          siteName: site,
          grnNumber: paymentIdStr, // Shows Payment ID in the Reference ID column
          paymentId: paymentIdStr, // Strict Reference ID = Payment ID
          invoiceNumber: p.invoiceNo || p.invoiceNumber || '-',
          purchaseAmount: 0,
          amountPaid: paidVal
        });
      }
    });

    // Sort chronologically (oldest date first)
    rawEntries.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      if (a.type !== b.type) {
        return a.type === 'Purchase' ? -1 : 1;
      }
      return String(a.id).localeCompare(String(b.id));
    });

    // Filter results according to active criteria
    const filtered = rawEntries.filter(entry => {
      if (ledgerStartDate && entry.date < ledgerStartDate) return false;
      if (ledgerEndDate && entry.date > ledgerEndDate) return false;

      if (ledgerSupplierFilter !== 'All' && String(entry.supplier || '').trim().toLowerCase() !== String(ledgerSupplierFilter || '').trim().toLowerCase()) return false;
      if (ledgerSiteFilter !== 'All' && String(entry.siteName || '').trim().toLowerCase() !== String(ledgerSiteFilter || '').trim().toLowerCase()) return false;

      if (ledgerSearchQuery.trim()) {
        const q = ledgerSearchQuery.toLowerCase().trim();
        const part = String(entry.particulars || '').toLowerCase();
        const supp = String(entry.supplier || '').toLowerCase();
        const site = String(entry.siteName || '').toLowerCase();
        const grn = String(entry.grnNumber || '').toLowerCase();
        const inv = String(entry.invoiceNumber || '').toLowerCase();

        if (!part.includes(q) && !supp.includes(q) && !site.includes(q) && !grn.includes(q) && !inv.includes(q)) {
          return false;
        }
      }

      return true;
    });

    // Recalculate running balance per supplier for the filtered dataset
    const suppRunning = {};
    return filtered.map(entry => {
      const suppKey = String(entry.supplier || 'General').trim().toLowerCase();
      if (suppRunning[suppKey] === undefined) {
        suppRunning[suppKey] = 0;
      }

      if (entry.type === 'Purchase') {
        suppRunning[suppKey] += entry.purchaseAmount;
      } else if (entry.type === 'Payment') {
        suppRunning[suppKey] -= entry.amountPaid;
      }

      return {
        ...entry,
        balance: suppRunning[suppKey]
      };
    });
  };

  // Preset filter handler for Purchase Ledger
  const handlePurchasePresetChange = (preset) => {
    setPurchaseFilterPreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'all') {
      setPurchaseStartDate('');
      setPurchaseEndDate('');
    } else if (preset === 'daily') {
      setPurchaseStartDate(todayStr);
      setPurchaseEndDate(todayStr);
    } else if (preset === 'weekly') {
      const startOfWeek = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      setPurchaseStartDate(startOfWeek.toISOString().split('T')[0]);
      setPurchaseEndDate(todayStr);
    } else if (preset === 'monthly') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setPurchaseStartDate(startOfMonth.toISOString().split('T')[0]);
      setPurchaseEndDate(endOfMonth.toISOString().split('T')[0]);
    } else if (preset === 'yearly') {
      const month = today.getMonth() + 1;
      const year = today.getFullYear();
      const fyStartYear = month >= 4 ? year : year - 1;
      setPurchaseStartDate(`${fyStartYear}-04-01`);
      setPurchaseEndDate(`${fyStartYear + 1}-03-31`);
    }
  };

  // Purchase Ledger Entries Generator (Extracting Site, Vendor, Material, Item, Purchase Value)
  const getPurchaseLedgerEntries = () => {
    const parseVal = (v) => typeof v === 'number' ? v : Number(String(v || '').replace(/[^0-9.-]+/g, '')) || 0;
    
    const normalizeDateStr = (d) => {
      if (!d) return '2026-01-01';
      const s = String(d).trim().split('T')[0];
      if (s.includes('/')) {
        const parts = s.split('/');
        if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      return s;
    };

    const rawPurchases = (grnList || []).map((g, idx) => {
      const site = String(g.projectName || g.siteName || g.project || g.site || 'Central Project Site').trim();
      const vendor = String(g.supplier || g.vendor || 'General Supplier').trim();
      const material = String(g.category || g.materialCategory || g.material || 'General Material').trim();
      const item = String(g.itemName || g.subcategory || g.item || g.description || '-').trim();
      const qtyNum = parseVal(g.qty);
      const rateNum = parseVal(g.rate);
      const grandTot = parseVal(g.grandTotal || g.total || g.amount || (qtyNum * rateNum));
      const dStr = normalizeDateStr(g.grnDate || g.grn_date || g.date || g.invoiceDate || (g.created_at ? g.created_at.split('T')[0] : '2026-02-10'));
      const grnNo = String(g.grnNumber || `GRN-${idx + 101}`).trim();
      const invNo = String(g.invoiceNumber || g.invoiceNo || '-').trim();

      return {
        id: g.id || `purch-${idx}`,
        date: dStr,
        site,
        vendor,
        material,
        item,
        qty: qtyNum,
        uom: g.uom || 'Units',
        rate: rateNum,
        purchaseValue: grandTot,
        grnNumber: grnNo,
        invoiceNumber: invNo,
        dcNumber: g.dcNumber || '-',
        cgst: g.cgst || '9',
        sgst: g.sgst || '9',
        igst: g.igst || '0'
      };
    });

    // Sort chronologically descending (newest purchases first)
    rawPurchases.sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return String(b.id).localeCompare(String(a.id));
    });

    // Filter results according to active criteria
    return rawPurchases.filter(entry => {
      if (purchaseStartDate && entry.date < purchaseStartDate) return false;
      if (purchaseEndDate && entry.date > purchaseEndDate) return false;

      if (purchaseVendorFilter !== 'All' && String(entry.vendor || '').trim().toLowerCase() !== String(purchaseVendorFilter || '').trim().toLowerCase()) return false;
      if (purchaseMaterialFilter !== 'All' && String(entry.material || '').trim().toLowerCase() !== String(purchaseMaterialFilter || '').trim().toLowerCase()) return false;
      if (purchaseSiteFilter !== 'All' && String(entry.site || '').trim().toLowerCase() !== String(purchaseSiteFilter || '').trim().toLowerCase()) return false;

      if (purchaseSearchQuery.trim()) {
        const q = purchaseSearchQuery.toLowerCase().trim();
        const s = String(entry.site || '').toLowerCase();
        const v = String(entry.vendor || '').toLowerCase();
        const m = String(entry.material || '').toLowerCase();
        const itm = String(entry.item || '').toLowerCase();
        const grn = String(entry.grnNumber || '').toLowerCase();
        const inv = String(entry.invoiceNumber || '').toLowerCase();

        if (!s.includes(q) && !v.includes(q) && !m.includes(q) && !itm.includes(q) && !grn.includes(q) && !inv.includes(q)) {
          return false;
        }
      }

      return true;
    });
  };

  // Export Utilities for Excel (.csv) and PDF
  const exportToExcel = (title, filename, headers, rows, filterSummary = '', supplierName = 'All Suppliers') => {
    const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""')}"`;

    const line1 = escapeCsv(`ROYALGOKUL CONSTRUCTIONS PVT LTD — ${title}`);
    const line2 = escapeCsv(`Supplier Name: ${supplierName || 'All Suppliers'}`);
    const line3 = escapeCsv(`Date Range: ${filterSummary || 'All Time'}`);
    const blankRow = '';
    const headerRow = headers.map(escapeCsv).join(',');

    // Separate main table contents and grand total row to enforce requested 1-row gap
    const mainRows = [];
    const totalRows = [];
    rows.forEach(r => {
      const firstCol = String(r[0] || '').trim().toUpperCase();
      if (firstCol === 'TOTAL' || firstCol === 'GRAND TOTAL') {
        totalRows.push(r);
      } else {
        mainRows.push(r);
      }
    });

    const dataRows = mainRows.map(row => row.map(escapeCsv).join(','));
    const totalRowsCsv = totalRows.map(row => row.map(escapeCsv).join(','));

    const csvLines = [
      line1,
      line2,
      line3,
      blankRow,
      headerRow,
      ...dataRows
    ];

    // Enforce 1-row gap before Grand Total row as explicitly requested
    if (totalRowsCsv.length > 0) {
      csvLines.push(blankRow);
      csvLines.push(...totalRowsCsv);
    }

    const csvContent = csvLines.join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = (title, headers, rows, filterSummary = '', supplierName = 'All Suppliers') => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const logoUrl = window.location.origin + '/logo.svg';

    const mainRows = [];
    const totalRows = [];
    rows.forEach(r => {
      const firstCol = String(r[0] || '').trim().toUpperCase();
      if (firstCol === 'TOTAL' || firstCol === 'GRAND TOTAL') {
        totalRows.push(r);
      } else {
        mainRows.push(r);
      }
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          @page { size: landscape; margin: 10mm; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 16px; color: #0f172a; background: #ffffff; }
          .header { border-bottom: 2px solid #f59e0b; padding-bottom: 10px; margin-bottom: 12px; }
          .company-logo-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
          .company-logo-row img { height: 40px; width: auto; object-fit: contain; }
          .company-name { color: #0f172a; font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
          .report-title { color: #d97706; font-size: 12px; font-weight: 700; margin-top: 1px; }
          .meta-info-box { font-size: 11px; color: #334155; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; margin-top: 6px; display: flex; flex-direction: column; gap: 3px; }
          .meta-line { font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 10px; }
          th { background-color: #0f172a; color: #f8fafc; padding: 6px 8px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid #1e293b; }
          td { padding: 6px 8px; border: 1px solid #cbd5e1; color: #334155; vertical-align: top; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .spacer-row td { height: 12px; border: none; background: transparent; padding: 0; }
          .grand-total-row td { font-weight: 900; background-color: #fef3c7 !important; border: 2px solid #d97706 !important; color: #78350f !important; font-size: 10.5px; }
          .footer { margin-top: 24px; font-size: 9px; color: #94a3b8; text-align: right; border-top: 1px solid #f1f5f9; padding-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-logo-row">
            <img src="${logoUrl}" alt="ROYALGOKUL Logo" />
            <div>
              <div class="company-name">ROYALGOKUL CONSTRUCTIONS PVT LTD</div>
              <div class="report-title">${title}</div>
            </div>
          </div>
          <div class="meta-info-box">
            <div class="meta-line"><strong>Supplier Name:</strong> ${supplierName || 'All Suppliers'}</div>
            <div class="meta-line"><strong>Date Range:</strong> ${filterSummary || 'All Time'}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${mainRows.map(r => `<tr>${r.map(c => `<td>${c !== undefined && c !== null ? String(c) : '-'}</td>`).join('')}</tr>`).join('')}
            ${totalRows.length > 0 ? `<tr class="spacer-row"><td colspan="${headers.length}"></td></tr>` : ''}
            ${totalRows.map(r => `<tr class="grand-total-row">${r.map(c => `<td>${c !== undefined && c !== null ? String(c) : '-'}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        <div class="footer">Verified Accounting Document | Royal Gokul Constructions Interconnected Portal</div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Open Table Import Modal
  const openImportModal = (tableName, onImportHandler, sampleCsv, sampleRows) => {
    setImportModalConfig({
      isOpen: true,
      tableName,
      onImport: onImportHandler,
      sampleCsv,
      sampleRows
    });
  };

  // CRUD Handlers
  const addProject = async (e) => {
    e.preventDefault();
    if (!project.name.trim()) {
      showNotice('error', 'Please enter a valid Project Name.');
      return;
    }

    const newProjObj = {
      id: 'p-' + Date.now(),
      name: project.name.trim(),
      location: project.location.trim() || 'Central Site',
      budget: project.budget.trim() || '₹ 0.00',
      created_at: new Date().toISOString()
    };

    const updated = [newProjObj, ...projectsList];
    setProjectsList(updated);
    appendSingleRecord(SYNC_KEYS.PROJECTS, newProjObj);
    showNotice('success', `Project "${project.name}" registered successfully.`);

    setProject({ name: '', location: '', budget: '' });
  };

  const addMaster = async (e) => {
    e.preventDefault();
    if (!master.value.trim()) {
      showNotice('error', 'Please enter a name / option value label.');
      return;
    }

    if (master.type === 'Subcategory' && (!master.parentCategory || !master.parentCategory.trim())) {
      showNotice('error', 'Please select or specify a Parent Category for this Subcategory.');
      return;
    }

    const valName = master.value.trim();
    const isSupp = master.type === 'Supplier';
    const isBank = master.type === 'Bank accounts';
    const parentCat = master.type === 'Subcategory' ? master.parentCategory.trim() : '';

    const newMasterObj = {
      id: 'm-' + Date.now(),
      category: master.type,
      parentCategory: parentCat,
      name: valName,
      label: valName,
      value: valName,
      accountNumber: isBank ? (supplierMasterForm.bankDetails || valName).trim() : '',
      bankAccount: isBank ? (supplierMasterForm.bankDetails || valName).trim() : '',
      supplierName: valName,
      supplierAddress: isSupp ? supplierMasterForm.supplierAddress.trim() : '',
      gstNumber: isSupp ? supplierMasterForm.gstNumber.trim() : '',
      bankDetails: isSupp ? supplierMasterForm.bankDetails.trim() : (isBank ? supplierMasterForm.bankDetails.trim() : ''),
      cgst: isSupp ? (supplierMasterForm.cgst || '9') : '',
      sgst: isSupp ? (supplierMasterForm.sgst || '9') : '',
      igst: isSupp ? (supplierMasterForm.igst || '0') : '',
      status: 'Active',
      created_at: new Date().toISOString()
    };

    const updated = [newMasterObj, ...mastersList];
    setMastersList(updated);
    appendSingleRecord(SYNC_KEYS.MASTERS, newMasterObj);
    showNotice('success', `Master option "${valName}" saved under ${master.type}${parentCat ? ` (Parent: ${parentCat})` : ''}.`);

    setMaster({ type: master.type, parentCategory: master.parentCategory || '', value: '' });
    setSupplierMasterForm({ supplierAddress: '', gstNumber: '', bankDetails: '', cgst: '9', sgst: '9', igst: '0' });
  };

  const createUser = async (e) => {
    e.preventDefault();
    if (isEmailLocked) {
      showNotice('error', '🔒 All email handles are locked by Manager. Creation of new worker accounts is disabled.');
      return;
    }
    if (!user.email.trim() || !user.fullName.trim()) {
      showNotice('error', 'Email Handle and Full Name are required.');
      return;
    }

    const newProfile = {
      id: 'usr-' + Date.now(),
      email: user.email.trim(),
      full_name: user.fullName.trim(),
      designation: user.designation,
      is_first_time_login: true,
      security_question: '',
      security_answer: '',
      created_at: new Date().toISOString()
    };

    const updated = [newProfile, ...usersList];
    setUsersList(updated);
    appendSingleRecord(SYNC_KEYS.PROFILES, newProfile);
    showNotice('success', `HR Profile created for ${user.fullName}.`);

    setUser({ email: '', fullName: '', designation: 'Accounts Assistant' });
  };

  const parseNum = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    return Number(String(val).replace(/[^0-9.-]+/g, '')) || 0;
  };

  const formatINR = (val) => {
    const num = parseNum(val);
    return '₹' + num.toLocaleString('en-IN');
  };

  const handlePaymentDatePresetChange = (preset) => {
    setPaymentDatePreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'all') {
      setPaymentStartDate('');
      setPaymentEndDate('');
    } else if (preset === 'today') {
      setPaymentStartDate(todayStr);
      setPaymentEndDate(todayStr);
    } else if (preset === 'monthly') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setPaymentStartDate(startOfMonth.toISOString().split('T')[0]);
      setPaymentEndDate(endOfMonth.toISOString().split('T')[0]);
    } else if (preset === 'yearly') {
      const month = today.getMonth() + 1;
      const year = today.getFullYear();
      const fyStartYear = month >= 4 ? year : year - 1;
      setPaymentStartDate(`${fyStartYear}-04-01`);
      setPaymentEndDate(`${fyStartYear + 1}-03-31`);
    }
  };

  const handleRecordPayment = (e) => {
    e.preventDefault();
    const siteVal = (paymentForm.siteName || paymentForm.project || '').trim();
    const vendorVal = (paymentForm.vendor || '').trim();
    const modeVal = (paymentForm.paymentMode || '').trim();
    const accVal = (paymentForm.accountNumber || '').trim();
    const paidVal = parseNum(paymentForm.paidAmount);
    const payDate = paymentForm.paymentDate || new Date().toISOString().split('T')[0];
    const generatedId = paymentForm.payId || calculateNextPaymentId(paymentsList, payDate);

    if (!siteVal) {
      showNotice('error', 'Please select a Site / Project from the dropdown.');
      return;
    }
    if (!vendorVal) {
      showNotice('error', 'Please select a Vendor from the dropdown.');
      return;
    }
    if (!modeVal) {
      showNotice('error', 'Please select a Mode of Transaction.');
      return;
    }
    if (!accVal) {
      showNotice('error', 'Please select or enter an Account Number.');
      return;
    }
    if (paidVal <= 0) {
      showNotice('error', 'Please enter a valid Paid Amount greater than 0.');
      return;
    }

    const newPayment = {
      id: generatedId,
      payId: generatedId,
      paymentId: generatedId,
      date: payDate,
      paymentDate: payDate,
      siteName: siteVal,
      project: siteVal,
      site: siteVal,
      projectName: siteVal,
      vendor: vendorVal,
      partyName: vendorVal,
      supplier: vendorVal,
      paymentMode: modeVal,
      mode: modeVal,
      accountNumber: accVal,
      bankAccount: accVal,
      paidAmount: paidVal,
      amountPaid: paidVal,
      paid: paidVal,
      amount: 0,
      balance: 0,
      status: 'Paid',
      remarks: paymentForm.remarks || '',
      created_by: currentUser?.email || 'manager@rgc.com',
      created_at: new Date().toISOString()
    };

    const updated = [newPayment, ...paymentsList];
    setPaymentsList(updated);
    saveStorageData(SYNC_KEYS.PAYMENTS, updated);
    appendSingleRecord(SYNC_KEYS.PAYMENTS, newPayment);

    // Call server to record payment ledger independently
    try {
      fetch('/api/ledger/record-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPayment)
      }).catch(() => {});
    } catch (_) {}

    showNotice('success', `Payment Entry ${generatedId} for ${vendorVal} at ${siteVal} (₹${paidVal.toLocaleString('en-IN')}) recorded successfully!`);

    // Reset form with next automatic Pay ID
    const nextPayId = calculateNextPaymentId(updated, payDate);
    setPaymentForm({
      payId: nextPayId,
      paymentDate: payDate,
      siteName: '',
      project: '',
      vendor: '',
      paymentMode: '',
      accountNumber: '',
      paidAmount: '',
      remarks: ''
    });
  };

  const handleDeletePayment = (pId) => {
    if (typeof window !== 'undefined' && !window.confirm(`Are you sure you want to delete Payment record ${pId}?`)) {
      return;
    }
    const updated = paymentsList.filter(p => (p.payId || p.paymentId || p.id) !== pId);
    setPaymentsList(updated);
    saveStorageData(SYNC_KEYS.PAYMENTS, updated);
    deleteStorageRecord(SYNC_KEYS.PAYMENTS, pId);
    showNotice('success', `Payment record ${pId} deleted.`);
  };

  const handleDeleteGrn = (grnId, grnNumber) => {
    const targetId = grnNumber || grnId;
    if (typeof window !== 'undefined' && !window.confirm(`Are you sure you want to delete GRN record ${targetId}?`)) {
      return;
    }
    const updated = grnList.filter(g => (g.id || g.grnNumber) !== targetId && g.grnNumber !== targetId && g.id !== targetId);
    setGrnList(updated);
    saveStorageData(SYNC_KEYS.GRN, updated);
    deleteStorageRecord(SYNC_KEYS.GRN, targetId);
    showNotice('success', `GRN record ${targetId} deleted.`);
  };

  const handleClearWebsiteData = async () => {
    if (typeof window !== 'undefined' && !window.confirm('⚠️ WARNING: This will clear all transactional data (GRNs, Payments, Ledgers, PnL, Audits) from the website database and Google Sheets. Are you sure?')) {
      return;
    }
    try {
      setLoading(true);
      await fetch('/api/data/clear-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'transactions', clearSheets: true })
      });
      if (typeof window !== 'undefined') {
        localStorage.removeItem(SYNC_KEYS.GRN);
        localStorage.removeItem(SYNC_KEYS.PAYMENTS);
        localStorage.removeItem(SYNC_KEYS.LEDGERS);
        localStorage.removeItem(SYNC_KEYS.PNL);
        localStorage.removeItem(SYNC_KEYS.AUDITS);
      }
      setGrnList([]);
      setPaymentsList([]);
      setLedgersList([]);
      showNotice('success', '🧹 All transactional data in the website and Google Sheets has been cleared.');
      notifyDataSync('clear_all', {});
    } catch (err) {
      showNotice('error', 'Failed to clear data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const addLedgerEntry = (e) => {
    e.preventDefault();
    if (!ledgerForm.vendor || !ledgerForm.project || !ledgerForm.openingBalance) {
      showNotice('error', 'Please select Vendor, Project, and enter Opening Balance.');
      return;
    }

    const newLedger = {
      id: 'ledg-' + Date.now(),
      vendor: ledgerForm.vendor,
      project: ledgerForm.project,
      type: ledgerForm.ledgerType,
      openingBalance: '₹ ' + Number(ledgerForm.openingBalance).toLocaleString('en-IN'),
      creditLimit: ledgerForm.creditLimit || '₹ 50,00,000',
      created_at: new Date().toISOString()
    };

    const updated = [newLedger, ...ledgersList];
    setLedgersList(updated);
    appendSingleRecord(SYNC_KEYS.LEDGERS, newLedger);
    showNotice('success', `Account Ledger initialized for ${ledgerForm.vendor} on ${ledgerForm.project}.`);

    setLedgerForm({
      vendor: '',
      project: '',
      openingBalance: '',
      ledgerType: 'Vendor Accounts Ledger',
      creditLimit: '₹ 50,00,000'
    });
  };

  const deleteProjectItem = (id) => {
    const updated = projectsList.filter(p => p.id !== id);
    setProjectsList(updated);
    deleteStorageRecord(SYNC_KEYS.PROJECTS, id);
    showNotice('success', 'Project workspace removed.');
  };

  const deleteMasterItem = (id) => {
    const updated = mastersList.filter(m => m.id !== id);
    setMastersList(updated);
    deleteStorageRecord(SYNC_KEYS.MASTERS, id);
    showNotice('success', 'Master entry option removed.');
  };

  const deleteUserItem = (id) => {
    const updated = usersList.filter(u => u.id !== id);
    setUsersList(updated);
    deleteStorageRecord(SYNC_KEYS.PROFILES, id);
    showNotice('success', 'User profile removed.');
  };

  // Import Table Handlers
  const handleImportProjects = (parsedRows) => {
    const formatted = parsedRows.map((r, i) => ({
      id: 'p-imp-' + Date.now() + '-' + i,
      name: r.name || r.ProjectName || r['Project Name'] || '',
      location: r.location || r.Location || '',
      budget: r.budget || r.Budget || '0',
      created_at: new Date().toISOString()
    })).filter(item => item.name);
    const updated = [...formatted, ...projectsList];
    setProjectsList(updated);
    saveStorageData(SYNC_KEYS.PROJECTS, updated);
    showNotice('success', `Successfully imported ${formatted.length} project workspaces!`);
  };

  const handleImportMasters = (parsedRows) => {
    const formatted = parsedRows.map((r, i) => {
      const cat = r.category || r.Category || 'Category';
      const lbl = r.label || r.Option || r.Label || r.name || r.Name || r.value || r.Value || '';
      let parentCat = r.parentCategory || r.parent_category || r['Parent Category'] || r.ParentCategory || r.parent || '';
      if (cat === 'Subcategory' && !parentCat && lbl) {
        const vLow = lbl.toLowerCase();
        if (vLow.includes('block') || vLow.includes('brick') || vLow.includes('aac')) parentCat = 'BLOCKS';
        else if (vLow.includes('cement') || vLow.includes('opc') || vLow.includes('ppc')) parentCat = 'CEMENT';
        else if (vLow.includes('steel') || vLow.includes('tmt') || vLow.includes('rebar') || vLow.includes('rod')) parentCat = 'STEEL';
        else if (vLow.includes('sand') || vLow.includes('m sand') || vLow.includes('p sand')) parentCat = 'SAND';
        else if (vLow.includes('aggregate') || vLow.includes('blue metal') || vLow.includes('jelly')) parentCat = 'AGGREGATES';
        else if (vLow.includes('rmc') || vLow.includes('m 25') || vLow.includes('m 20') || vLow.includes('m 30') || vLow.includes('concrete')) parentCat = 'RMC';
      }
      const isSupp = cat === 'Supplier' || cat === 'Vendor';
      return {
        id: 'm-imp-' + Date.now() + '-' + i,
        category: cat,
        parentCategory: parentCat,
        label: lbl,
        value: lbl,
        name: lbl,
        supplierName: lbl,
        supplierAddress: r.supplierAddress || r.address || r.Address || '',
        gstNumber: r.gstNumber || r.gstNo || r.gstin || r.GSTIN || '',
        bankDetails: r.bankDetails || r.bank || r.Bank || r.bankAccount || '',
        cgst: r.cgst !== undefined ? String(r.cgst) : (r.CGST !== undefined ? String(r.CGST) : (isSupp ? '9' : '')),
        sgst: r.sgst !== undefined ? String(r.sgst) : (r.SGST !== undefined ? String(r.SGST) : (isSupp ? '9' : '')),
        igst: r.igst !== undefined ? String(r.igst) : (r.IGST !== undefined ? String(r.IGST) : (isSupp ? '0' : '')),
        gstPct: r.gstPct || r['GST %'] || (isSupp ? (Number(r.cgst || 9) + Number(r.sgst || 9) + Number(r.igst || 0)) : ''),
        status: 'Active',
        created_at: new Date().toISOString()
      };
    }).filter(item => item.label);
    const updated = [...formatted, ...mastersList];
    setMastersList(updated);
    saveStorageData(SYNC_KEYS.MASTERS, updated);
    showNotice('success', `Successfully imported ${formatted.length} master options!`);
  };

  const handleImportProfiles = (parsedRows) => {
    if (isEmailLocked) {
      showNotice('error', '🔒 All email handles are locked by Manager. No staff profiles can be imported or created.');
      return;
    }
    const formatted = parsedRows.map((r, i) => ({
      id: 'u-imp-' + Date.now() + '-' + i,
      email: r.email || r.Email || '',
      full_name: r.full_name || r.fullName || r['Full Name'] || '',
      designation: r.designation || r.Designation || 'Accounts Assistant',
      is_first_time_login: true,
      created_at: new Date().toISOString()
    })).filter(item => item.email);
    const updated = [...formatted, ...usersList];
    setUsersList(updated);
    saveStorageData(SYNC_KEYS.PROFILES, updated);
    showNotice('success', `Successfully imported ${formatted.length} staff profile accounts!`);
  };

  const handleImportPayments = (parsedRows) => {
    const formatted = parsedRows.map((r, i) => {
      const totAmt = parseNum(r.amount || r.Amount || 0);
      const paidAmt = parseNum(r.paid || r.Paid || totAmt);
      const balAmt = parseNum(r.balance || r.Balance || Math.max(0, totAmt - paidAmt));
      let st = r.status || r.Status;
      if (!st) {
        if (balAmt <= 0) st = 'Paid';
        else if (paidAmt > 0) st = 'Partial';
        else st = 'Pending';
      }
      return {
        id: 'PAY-IMP-' + Date.now() + '-' + i,
        date: r.date || r.Date || new Date().toISOString().split('T')[0],
        siteName: r.siteName || r.site || r.project || r.Project || '',
        project: r.siteName || r.site || r.project || r.Project || '',
        vendor: r.vendor || r.Vendor || '',
        invoiceNo: r.invoiceNo || r.invoice || r.Invoice || '',
        amount: totAmt,
        paid: paidAmt,
        balance: balAmt,
        status: st,
        remarks: r.remarks || r.notes || r.Notes || '',
        paymentMode: r.paymentMode || r.Mode || 'NEFT / RTGS',
        refNo: r.refNo || r.Ref || '',
        created_at: new Date().toISOString()
      };
    });
    const updated = [...formatted, ...paymentsList];
    setPaymentsList(updated);
    saveStorageData(SYNC_KEYS.PAYMENTS, updated);
    showNotice('success', `Successfully imported ${formatted.length} payment disbursement logs!`);
  };

  const handleImportLedgers = (parsedRows) => {
    const formatted = parsedRows.map((r, i) => ({
      id: 'ledg-imp-' + Date.now() + '-' + i,
      vendor: r.vendor || r.Vendor || '',
      project: r.project || r.Project || '',
      type: r.type || r.Type || 'Vendor Accounts Ledger',
      openingBalance: r.openingBalance?.includes('₹') ? r.openingBalance : '₹ ' + (r.openingBalance || '0'),
      creditLimit: r.creditLimit || '0',
      created_at: new Date().toISOString()
    }));
    const updated = [...formatted, ...ledgersList];
    setLedgersList(updated);
    saveStorageData(SYNC_KEYS.LEDGERS, updated);
    showNotice('success', `Successfully imported ${formatted.length} vendor ledger accounts!`);
  };

  const handleImportGrns = (parsedRows) => {
    const formatted = parsedRows.map((r, i) => ({
      id: 'grn-imp-' + Date.now() + '-' + i,
      grnNumber: r.grnNumber || r['GRN #'] || 'GRN-' + (88000 + i),
      projectName: r.projectName || r.project || r.Project || '',
      category: r.category || 'Materials',
      supplier: r.supplier || r.vendor || '',
      itemName: r.itemName || r.item || '',
      qty: r.qty || '0',
      uom: r.uom || 'Units',
      rate: r.rate || '0',
      grandTotal: r.grandTotal?.includes('₹') ? r.grandTotal : '₹ ' + (r.grandTotal || '0'),
      grnDate: new Date().toISOString().split('T')[0]
    }));
    const updated = [...formatted, ...grnList];
    setGrnList(updated);
    saveStorageData(SYNC_KEYS.GRN, updated);
    showNotice('success', `Successfully imported ${formatted.length} material GRN entries!`);
  };

  // Vendors list generated from masters & default
  const defaultVendors = mastersList.filter(m => m.category === 'Supplier' || m.category === 'Vendor').map(m => m.label || m.name || m.value);

  return (
    <div className="flex flex-col min-h-screen w-full bg-slate-50 text-slate-900 font-sans assistant-scrollbar overflow-y-auto">
      {/* Table Import Modal */}
      <TableImportModal 
        isOpen={importModalConfig.isOpen}
        onClose={() => setImportModalConfig({...importModalConfig, isOpen: false})}
        tableName={importModalConfig.tableName}
        onImport={importModalConfig.onImport}
        sampleCsv={importModalConfig.sampleCsv}
        sampleRows={importModalConfig.sampleRows}
      />

      {/* Create New Company Modal */}
      <CreateCompanyModal
        isOpen={isCreateCompanyOpen}
        onClose={() => setIsCreateCompanyOpen(false)}
        onCompanyCreated={(newComp) => {
          setActiveCompany(newComp);
          let existing = [];
          try {
            existing = JSON.parse(localStorage.getItem('rgc_company_registry') || '[]');
          } catch (_) {}
          const updated = [newComp, ...existing.filter(c => c.prefix !== newComp.prefix)];
          setCompanyRegistry(updated);
          safeSetItem('rgc_company_registry', JSON.stringify(updated));
          safeSetItem('rgc_active_company', JSON.stringify(newComp));
          showNotice('success', `Switched to Company Workspace: ${newComp.name} [${newComp.prefix}]`);
        }}
      />

      {/* Website Data Reset Modal */}
      <ResetDataModal
        isOpen={showResetDataModal}
        onClose={() => setShowResetDataModal(false)}
        onResetComplete={handleResetComplete}
        sheetsConnected={sheetsState?.connected}
        currentUser={currentUser}
      />

      {/* Header Navigation */}
      <header className="h-16 bg-[#070e20] text-white flex items-center justify-between px-3 sm:px-6 border-b border-slate-800 shrink-0 z-40">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <img 
            src={activeCompany?.logo || activeCompany?.logoBase64 || "/logo.svg"} 
            alt={`${activeCompany?.name || 'Company'} Logo`} 
            className="brand-logo-target h-7 sm:h-9 w-auto max-w-[120px] object-contain shrink-0 rounded bg-slate-900/40 p-0.5" 
          />
          <div className="flex flex-col min-w-0">
            <h1 className="brand-name-target text-xs sm:text-base md:text-lg font-extrabold tracking-tight truncate uppercase text-slate-100">
              {activeCompany?.name || "ROYALGOKUL CONSTRUCTIONS PVT LTD"}
            </h1>
            <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-mono">
              <span className="bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/30">
                [{activeCompany?.prefix || 'RGC'}] Active Sheet
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Company Workspace Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs font-bold text-slate-200 transition cursor-pointer"
              title="Switch or Register Company Workspaces"
            >
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Workspace:</span>
              <span className="text-amber-400 font-mono">{activeCompany?.prefix || 'RGC'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {companyDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-50 space-y-1">
                <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex items-center justify-between">
                  <span>Registered Workspaces</span>
                  <span className="text-amber-400">{companyRegistry.length + 1}</span>
                </div>
                
                {/* Default Master */}
                <button
                  onClick={() => {
                    const def = { name: 'ROYALGOKUL CONSTRUCTIONS PVT LTD', logo: '/logo.svg', prefix: 'RGC' };
                    setActiveCompany(def);
                    safeSetItem('rgc_active_company', JSON.stringify(def));
                    setCompanyDropdownOpen(false);
                    showNotice('success', 'Switched to primary RGC Master Workspace');
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition ${
                    activeCompany?.prefix === 'RGC' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">ROYALGOKUL PVT LTD</span>
                  <span className="text-[10px] font-mono text-amber-400">RGC</span>
                </button>

                {/* Dynamically Registered Companies */}
                {companyRegistry.map((comp, idx) => (
                  <div
                    key={idx}
                    className={`w-full px-2 py-1 rounded-lg text-xs flex items-center justify-between transition group/item ${
                      activeCompany?.prefix === comp.prefix ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCompany(comp);
                        safeSetItem('rgc_active_company', JSON.stringify(comp));
                        setCompanyDropdownOpen(false);
                        showNotice('success', `Switched to ${comp.name} [${comp.prefix}]`);
                      }}
                      className="flex-1 text-left truncate flex items-center justify-between pr-2 cursor-pointer"
                    >
                      <span className="truncate">{comp.name || comp.companyName}</span>
                      <span className="text-[10px] font-mono text-amber-400 shrink-0 ml-1">{comp.prefix}</span>
                    </button>

                    {/* Delete Company Button */}
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete company workspace "${comp.name || comp.prefix}" and unbind its dedicated sheets?`)) {
                          const res = await deleteCompanyFromRegistry(comp.prefix);
                          if (res.success) {
                            const updated = companyRegistry.filter(c => c && c.prefix !== comp.prefix);
                            setCompanyRegistry(updated);
                            if (activeCompany?.prefix === comp.prefix) {
                              const def = { name: 'ROYALGOKUL CONSTRUCTIONS PVT LTD', logo: '/logo.svg', prefix: 'RGC' };
                              setActiveCompany(def);
                              safeSetItem('rgc_active_company', JSON.stringify(def));
                            }
                            showNotice('success', `Company ${comp.name || comp.prefix} deleted successfully`);
                          }
                        }
                      }}
                      className="opacity-40 group-hover/item:opacity-100 p-1 rounded hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                      title={`Delete ${comp.name || comp.prefix}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                <div className="pt-1 border-t border-slate-800 space-y-1">
                  <button
                    onClick={() => {
                      setCompanyDropdownOpen(false);
                      onNavigate('/hub');
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition cursor-pointer border border-slate-700"
                  >
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>View All Workspaces Hub</span>
                  </button>
                  <button
                    onClick={() => {
                      setCompanyDropdownOpen(false);
                      setIsCreateCompanyOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Create New Company</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Small Google Sheets Icon Button */}
          {onOpenSheetsModal && (
            <button
              onClick={onOpenSheetsModal}
              className={`p-2 rounded-lg transition font-medium border flex items-center justify-center cursor-pointer shadow-xs ${
                sheetsState?.connected 
                  ? 'text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900/70 border-emerald-500/40' 
                  : 'text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border-slate-600/40'
              }`}
              title="Google Sheets Live Gateway & Realtime Sync"
            >
              <FileSpreadsheet className={`w-4 h-4 ${sheetsState?.connected ? 'text-emerald-400' : 'text-slate-300'}`} />
            </button>
          )}

          {/* Reset All Website Data Button placed directly next to Sheets button */}
          <button
            onClick={() => setShowResetDataModal(true)}
            className="p-2 rounded-lg transition font-medium border border-rose-500/40 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 hover:text-rose-200 flex items-center justify-center cursor-pointer shadow-xs gap-1.5"
            title="Reset & Clear All Website Data (Prevents pushback to sheets)"
          >
            <RotateCcw className="w-4 h-4 text-rose-400" />
            <span className="hidden sm:inline text-xs font-bold">Reset Data</span>
          </button>

          <div className="text-right hidden xs:block">
            <p className="text-[10px] sm:text-xs font-bold uppercase text-amber-500">Accounts Manager</p>
            <p className="text-xs sm:text-sm font-medium truncate max-w-[120px] sm:max-w-none">{currentUser?.email ? currentUser.email.split('@')[0] : 'Admin Manager'}</p>
          </div>

          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-white text-xs shrink-0">
            AM
          </div>

          <button 
            onClick={() => {
              if (onLogout) onLogout();
              else if (onNavigate) onNavigate('/login');
              else window.location.href = '/login';
            }}
            className="text-slate-400 hover:text-rose-400 p-1.5 sm:p-2 transition cursor-pointer"
            title="Sign Out to Employee Login"
          >
            <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </header>

      {/* Mobile Quick Navigation Strip (visible on small screens) */}
      <div className="md:hidden bg-[#070e20] border-b border-slate-800 p-2 flex overflow-x-auto gap-2 shrink-0 z-30">
        <button 
          onClick={() => setActiveTab('desk')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap transition cursor-pointer ${
            activeTab === 'desk' ? 'bg-[#131d36] text-amber-300 border border-amber-500/70 shadow-sm' : 'bg-slate-900/60 text-slate-300'
          }`}
        >
          <span>Command Desk</span>
        </button>
        <button 
          onClick={() => setActiveTab('payments')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap transition cursor-pointer ${
            activeTab === 'payments' ? 'bg-[#131d36] text-amber-300 border border-amber-500/70 shadow-sm' : 'bg-slate-900/60 text-slate-300'
          }`}
        >
          <span>Payments</span>
        </button>
        <button 
          onClick={() => setActiveTab('ledgers')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap transition cursor-pointer ${
            activeTab === 'ledgers' ? 'bg-[#131d36] text-amber-300 border border-amber-500/70 shadow-sm' : 'bg-slate-900/60 text-slate-300'
          }`}
        >
          <span>Vendor Ledger</span>
        </button>
      </div>

      <div className="flex flex-1 relative w-full min-h-[calc(100vh-4rem)] items-stretch">
        {/* Mobile Backdrop */}
        {mobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar Navigation - Completely Blue up to the Length of the Screen */}
        <nav className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-[#070e20] border-r border-slate-800 flex flex-col justify-between p-4 shrink-0 transition-transform duration-300 ease-in-out md:static md:w-64 md:min-h-full self-stretch
          ${mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}
        `}>
          <div>
            <div className="flex justify-between items-center md:hidden mb-4 pb-2 border-b border-slate-800">
              <span className="font-bold text-sm text-white">Menu</span>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Manager Workspace Label & Authorized Tag */}
            <div className="flex items-center justify-between px-1 mb-4">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-500">
                MANAGER WORKSPACE
              </span>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30">
                AUTHORIZED
              </span>
            </div>

            <div className="space-y-2">
              <button 
                onClick={() => { setActiveTab('desk'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-left transition-all cursor-pointer ${
                  activeTab === 'desk' 
                    ? 'bg-[#131d36] text-amber-300 border border-amber-500/80 shadow-inner font-bold' 
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Building2 className={`w-4 h-4 shrink-0 ${activeTab === 'desk' ? 'text-amber-400' : 'text-amber-400'}`} />
                <span>Command Desk</span>
              </button>

              <button 
                onClick={() => { setActiveTab('payments'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-left transition-all cursor-pointer ${
                  activeTab === 'payments' 
                    ? 'bg-[#131d36] text-amber-300 border border-amber-500/80 shadow-inner font-bold' 
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <CreditCard className={`w-4 h-4 shrink-0 ${activeTab === 'payments' ? 'text-amber-400' : 'text-emerald-400'}`} />
                <span>Payment Tab</span>
              </button>

              <button 
                onClick={() => { setActiveTab('ledgers'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-left transition-all cursor-pointer ${
                  activeTab === 'ledgers' 
                    ? 'bg-[#131d36] text-amber-300 border border-amber-500/80 shadow-inner font-bold' 
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <BookOpen className={`w-4 h-4 shrink-0 ${activeTab === 'ledgers' ? 'text-amber-400' : 'text-blue-400'}`} />
                <span>Ledger</span>
              </button>
            </div>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 p-3 sm:p-6 pb-28 flex flex-col gap-4 sm:gap-6 overflow-y-auto w-full min-w-0 assistant-scrollbar">
          
          {feedback.msg && (
            <div className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between ${
              feedback.type === 'success' 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-800'
            }`}>
              <div className="flex items-center gap-2">
                {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-rose-600" />}
                <span>{feedback.msg}</span>
              </div>
            </div>
          )}

          {/* TAB 1: COMMAND DESK WITH SUBTABS */}
          {activeTab === 'desk' && (
            <div className="space-y-6">
              {/* Subtabs Bar */}
              <div className="bg-white/80 backdrop-blur-md p-2.5 rounded-2xl border border-slate-200/90 shadow-md flex flex-wrap gap-2">
                <button
                  onClick={() => setDeskSubTab('projects')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
                    deskSubTab === 'projects' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span>Active Project Workspace</span>
                </button>
                <button
                  onClick={() => setDeskSubTab('masters')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
                    deskSubTab === 'masters' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Diamond Masters</span>
                </button>
                <button
                  onClick={() => setDeskSubTab('register')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
                    deskSubTab === 'register' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Register</span>
                </button>
                <button
                  onClick={() => setDeskSubTab('profiles')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
                    deskSubTab === 'profiles' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Staff Profile</span>
                </button>
                <button
                  onClick={() => setDeskSubTab('authority')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-2 ${
                    deskSubTab === 'authority' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Database className="w-4 h-4" />
                  <span>System Authority</span>
                </button>
              </div>

              {/* SUBTAB 1: Active Project Workspace */}
              {deskSubTab === 'projects' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Form */}
                  <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md p-5">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="font-extrabold text-slate-900 text-sm">Create New Construction Project Site</h2>
                        <span className="text-[10px] text-slate-500 font-mono font-bold">Table: public.projects</span>
                      </div>
                    </div>

                    <form onSubmit={addProject} className="space-y-3.5">
                      <div>
                        <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1.5">Project Site Name *</label>
                        <input 
                          type="text" 
                          required
                          value={project.name}
                          placeholder="e.g. Royal Heights Phase III"
                          className="w-full border-2 border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 bg-slate-50/90 focus:bg-white focus:border-amber-500 outline-none transition shadow-xs placeholder:font-normal placeholder:text-slate-400"
                          onChange={(e) => setProject({...project, name: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1.5">Site Location Address</label>
                        <input 
                          type="text" 
                          value={project.location}
                          placeholder="e.g. Whitefield, Bengaluru"
                          className="w-full border-2 border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 bg-slate-50/90 focus:bg-white focus:border-amber-500 outline-none transition shadow-xs placeholder:font-normal placeholder:text-slate-400"
                          onChange={(e) => setProject({...project, location: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1.5">Approved Sanctioned Budget</label>
                        <input 
                          type="text" 
                          value={project.budget}
                          placeholder="e.g. ₹ 75,00,00,000"
                          className="w-full border-2 border-slate-300 rounded-xl p-2.5 text-xs font-mono font-extrabold text-slate-900 bg-slate-50/90 focus:bg-white focus:border-amber-500 outline-none transition shadow-xs placeholder:font-normal placeholder:text-slate-400"
                          onChange={(e) => setProject({...project, budget: e.target.value})}
                        />
                      </div>

                      <button 
                        type="submit" 
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-xl text-xs font-extrabold tracking-wide transition shadow-md cursor-pointer mt-2"
                      >
                        Register Project Site
                      </button>
                    </form>
                  </div>

                  {/* Table */}
                  <div className="lg:col-span-2 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md overflow-hidden flex flex-col justify-between">
                    <div>
                      <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                        <h3 className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-amber-400" />
                          <span>Active Project Workspaces Directory</span>
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openImportModal('Projects', handleImportProjects, 'name, location, budget', [])}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Import CSV</span>
                          </button>
                          <span className="bg-slate-800 text-slate-200 text-xs font-mono font-bold px-2.5 py-1 rounded-lg">
                            {projectsList.length} Active
                          </span>
                        </div>
                      </div>
                      <div className="overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-900 text-slate-100 uppercase text-xs font-extrabold tracking-wider border-b border-slate-800">
                            <tr>
                              <th className="p-3.5 pl-4">Project Name</th>
                              <th className="p-3.5">Site Location</th>
                              <th className="p-3.5">Sanctioned Budget</th>
                              <th className="p-3.5 pr-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {projectsList.length === 0 ? (
                              <tr><td colSpan="4" className="p-4 text-center text-slate-500 italic">No project sites configured.</td></tr>
                            ) : (
                              projectsList.map((p, idx) => (
                                <tr key={p.id ? `proj-${p.id}-${idx}` : `proj-${p.name || idx}-${idx}`} className="hover:bg-slate-50 transition">
                                  <td className="p-3.5 pl-4 font-extrabold text-slate-900">{p.name}</td>
                                  <td className="p-3.5 font-bold text-slate-700">{p.location || 'Central Site'}</td>
                                  <td className="p-3.5 font-mono font-extrabold text-amber-700">{p.budget || '₹ 0.00'}</td>
                                  <td className="p-3.5 pr-4 text-right">
                                    <button onClick={() => deleteProjectItem(p.id)} className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 2: Diamond Masters */}
              {deskSubTab === 'masters' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Form */}
                  <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md p-5">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="font-extrabold text-slate-900 text-sm">Diamond Masters Seeding Panel</h2>
                        <span className="text-[10px] text-slate-500 font-mono font-bold">Table: public.dynamic_masters</span>
                      </div>
                    </div>

                    <form onSubmit={addMaster} className="space-y-3.5">
                      <div>
                        <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1.5">Category Type *</label>
                        <select 
                          value={master.type}
                          className="w-full border-2 border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 bg-slate-50/90 focus:bg-white focus:border-blue-500 outline-none transition cursor-pointer shadow-xs"
                          onChange={(e) => setMaster({...master, type: e.target.value})}
                        >
                          <option value="Category">Category</option>
                          <option value="Subcategory">Subcategory</option>
                          <option value="Designation">Designation</option>
                          <option value="UOM">UOM (Unit of Measurement)</option>
                          <option value="Supplier">Supplier</option>
                          <option value="Vendor">Vendor</option>
                          <option value="Bank accounts">Bank accounts</option>
                        </select>
                      </div>

                      {master.type === 'Subcategory' && (
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <label className="text-xs font-extrabold text-amber-900 uppercase tracking-wider block">Parent Category *</label>
                            <span className="text-[10px] text-amber-700 font-bold">Pairs with Subcategory</span>
                          </div>
                          <select 
                            value={master.parentCategory || ''}
                            required
                            className="w-full border-2 border-amber-400 rounded-xl p-2.5 text-xs bg-amber-50/90 focus:bg-white focus:border-amber-500 outline-none transition font-extrabold text-slate-900 cursor-pointer shadow-xs"
                            onChange={(e) => setMaster({...master, parentCategory: e.target.value})}
                          >
                            <option value="">-- Select Parent Category (Required) --</option>
                            {Array.from(new Set([
                              'CEMENT',
                              'STEEL',
                              'SAND',
                              'AGGREGATES',
                              'BLOCKS',
                              'RMC',
                              'ELECTRICAL',
                              'PLUMBING',
                              'TILES & FLOORING',
                              'PAINTS & FINISHES',
                              'WOODWORK',
                              'HARDWARE',
                              'SAFETY & TOOLS',
                              'LABOUR & SUBCONTRACT',
                              'GENERAL SITE EXPENSES',
                              'MATERIALS',
                              ...(mastersList || [])
                                .filter(m => m && (m.category === 'Category' || m.type === 'Category'))
                                .map(m => typeof m === 'string' ? m.trim() : (m?.label || m?.name || m?.value || '').trim())
                                .filter(Boolean)
                            ])).map((lbl, idx) => (
                              <option key={`m-cat-${lbl}-${idx}`} value={lbl}>{lbl}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div>
                        <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1.5">
                          {master.type === 'Subcategory' ? 'Subcategory Option Value Label *' : (master.type === 'Supplier' || master.type === 'Vendor' ? 'Supplier / Vendor Name *' : (master.type === 'Bank accounts' ? 'Bank Name / Identifier *' : 'Option Value Label *'))}
                        </label>
                        <input 
                          type="text" 
                          required
                          value={master.value}
                          placeholder={master.type === 'Subcategory' ? 'e.g. OPC 53 Grade Cement / PPC' : (master.type === 'Supplier' || master.type === 'Vendor' ? 'e.g. UltraTech Cement Ltd.' : (master.type === 'Bank accounts' ? 'e.g. HDFC Bank Corporate' : 'e.g. General Value'))}
                          className="w-full border-2 border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 bg-slate-50/90 focus:bg-white focus:border-blue-500 outline-none transition shadow-xs placeholder:font-normal placeholder:text-slate-400"
                          onChange={(e) => setMaster({...master, value: e.target.value})}
                        />
                      </div>

                      {master.type === 'Bank accounts' && (
                        <div className="space-y-2 bg-blue-50/80 p-3.5 rounded-2xl border-2 border-blue-200/90 shadow-xs">
                          <label className="text-xs font-extrabold text-blue-900 uppercase tracking-wider block">Bank Account Number *</label>
                          <input 
                            type="text"
                            required
                            value={supplierMasterForm.bankDetails || ''}
                            placeholder="e.g. A/C 50200084920192 / HDFC000123"
                            className="w-full border-2 border-blue-300 rounded-xl p-2.5 text-xs font-bold font-mono text-slate-900 bg-white focus:border-blue-500 outline-none transition shadow-xs"
                            onChange={(e) => setSupplierMasterForm({...supplierMasterForm, bankDetails: e.target.value})}
                          />
                        </div>
                      )}

                      {master.type === 'Supplier' && (
                        <div className="space-y-3 pt-2 bg-amber-50/80 p-3.5 rounded-2xl border-2 border-amber-200/90 shadow-xs">
                          <span className="text-xs font-extrabold text-amber-900 uppercase tracking-wider block">Supplier Master Profile Details</span>
                          
                          <div>
                            <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1">Supplier Registered Address</label>
                            <input 
                              type="text" 
                              value={supplierMasterForm.supplierAddress}
                              placeholder="e.g. Plot 42, Industrial Area, Phase II, New Delhi"
                              className="w-full border-2 border-slate-300 rounded-xl p-2 text-xs font-bold text-slate-900 bg-white focus:border-blue-500 outline-none transition"
                              onChange={(e) => setSupplierMasterForm({...supplierMasterForm, supplierAddress: e.target.value})}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1">GST Number (GSTIN)</label>
                              <input 
                                type="text" 
                                value={supplierMasterForm.gstNumber}
                                placeholder="e.g. 07AAAAA0000A1Z5"
                                className="w-full border-2 border-slate-300 rounded-xl p-2 text-xs font-mono font-extrabold uppercase bg-white focus:border-blue-500 outline-none transition text-blue-900"
                                onChange={(e) => setSupplierMasterForm({...supplierMasterForm, gstNumber: e.target.value})}
                              />
                            </div>

                            <div>
                              <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1">Bank Details</label>
                              <input 
                                type="text" 
                                value={supplierMasterForm.bankDetails}
                                placeholder="e.g. HDFC Bank, A/C: 50200012345"
                                className="w-full border-2 border-slate-300 rounded-xl p-2 text-xs font-bold text-slate-900 bg-white focus:border-blue-500 outline-none transition"
                                onChange={(e) => setSupplierMasterForm({...supplierMasterForm, bankDetails: e.target.value})}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1">CGST (%)</label>
                              <input 
                                type="number" 
                                value={supplierMasterForm.cgst}
                                placeholder="9"
                                className="w-full border-2 border-slate-300 rounded-xl p-2 text-xs font-mono font-extrabold bg-white focus:border-blue-500 outline-none transition text-slate-900"
                                onChange={(e) => setSupplierMasterForm({...supplierMasterForm, cgst: e.target.value})}
                              />
                            </div>

                            <div>
                              <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1">SGST (%)</label>
                              <input 
                                type="number" 
                                value={supplierMasterForm.sgst}
                                placeholder="9"
                                className="w-full border-2 border-slate-300 rounded-xl p-2 text-xs font-mono font-extrabold bg-white focus:border-blue-500 outline-none transition text-slate-900"
                                onChange={(e) => setSupplierMasterForm({...supplierMasterForm, sgst: e.target.value})}
                              />
                            </div>

                            <div>
                              <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1">IGST (%)</label>
                              <input 
                                type="number" 
                                value={supplierMasterForm.igst}
                                placeholder="0"
                                className="w-full border-2 border-slate-300 rounded-xl p-2 text-xs font-mono font-extrabold bg-white focus:border-blue-500 outline-none transition text-slate-900"
                                onChange={(e) => setSupplierMasterForm({...supplierMasterForm, igst: e.target.value})}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <p className="text-xs font-bold text-slate-500 italic">Populates live dropdown pickers and subcategory item options across all dashboards.</p>

                      <button 
                        type="submit" 
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-xl text-xs font-extrabold tracking-wide transition shadow-md cursor-pointer mt-2"
                      >
                        Save Master Option
                      </button>
                    </form>
                  </div>

                  {/* Table */}
                  <div className="lg:col-span-2 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md overflow-hidden flex flex-col justify-between">
                    <div>
                      <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                        <h3 className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-2">
                          <Layers className="w-4 h-4 text-blue-400" />
                          <span>Diamond Masters Dropdown Registry</span>
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openImportModal('Masters', handleImportMasters, 'category, parentCategory, label', [])}
                            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Import CSV</span>
                          </button>
                          <span className="bg-slate-800 text-slate-200 text-xs font-mono font-bold px-2.5 py-1 rounded-lg">
                            {mastersList.length} Seeded
                          </span>
                        </div>
                      </div>
                      <div className="overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-900 text-slate-100 uppercase text-xs font-extrabold tracking-wider border-b border-slate-800">
                            <tr>
                              <th className="p-3.5 pl-4">Category Type</th>
                              <th className="p-3.5">Parent Category</th>
                              <th className="p-3.5">Option Value / Subcategory Label</th>
                              <th className="p-3.5 pr-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {mastersList.length === 0 ? (
                              <tr><td colSpan="4" className="p-4 text-center text-slate-500 italic">No master options configured.</td></tr>
                            ) : (
                              mastersList.map((m, idx) => (
                                <tr key={m.id ? `m-${m.id}-${idx}` : `m-${m.category}-${m.label || m.name || idx}-${idx}`} className="hover:bg-slate-50 transition">
                                  <td className="p-3.5 pl-4 font-extrabold text-blue-700">{m.category}</td>
                                  <td className="p-3.5 font-bold text-amber-800">
                                    {(() => {
                                      let pCat = m.parentCategory || m.parent_category || m.parent || '';
                                      if (!pCat && (m.category === 'Subcategory' || m.type === 'Subcategory')) {
                                        const val = (m.label || m.name || m.value || '').toLowerCase();
                                        if (val.includes('block') || val.includes('brick') || val.includes('aac')) pCat = 'BLOCKS';
                                        else if (val.includes('cement') || val.includes('opc') || val.includes('ppc')) pCat = 'CEMENT';
                                        else if (val.includes('steel') || val.includes('tmt') || val.includes('rebar') || val.includes('rod')) pCat = 'STEEL';
                                        else if (val.includes('sand') || val.includes('m sand') || val.includes('p sand')) pCat = 'SAND';
                                        else if (val.includes('aggregate') || val.includes('blue metal') || val.includes('jelly')) pCat = 'AGGREGATES';
                                        else if (val.includes('rmc') || val.includes('m 25') || val.includes('m 20') || val.includes('m 30') || val.includes('concrete')) pCat = 'RMC';
                                        else if (val.includes('paint') || val.includes('primer') || val.includes('putty')) pCat = 'PAINTS & FINISHES';
                                        else if (val.includes('tile') || val.includes('granite') || val.includes('marble')) pCat = 'TILES & FLOORING';
                                        else if (val.includes('pipe') || val.includes('plumb') || val.includes('cpvc') || val.includes('pvc')) pCat = 'PLUMBING';
                                        else if (val.includes('wire') || val.includes('cable') || val.includes('switch') || val.includes('electrical')) pCat = 'ELECTRICAL';
                                      }
                                      return pCat ? (
                                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 text-[11px] font-extrabold px-2.5 py-1 rounded-lg border border-amber-300 shadow-xs">
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                          {pCat}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 italic font-normal">—</span>
                                      );
                                    })()}
                                  </td>
                                  <td className="p-3.5 text-slate-800 font-medium">
                                    <div className="font-extrabold text-slate-900">{typeof m === 'string' ? m : (m?.label || m?.name || m?.value || m?.supplier || '')}</div>
                                    {(m.category === 'Supplier' || m.category === 'Vendor') && (
                                      <div className="text-xs text-slate-600 space-y-0.5 mt-1">
                                        {m.gstNumber && <div><span className="font-bold text-slate-800">GSTIN:</span> <span className="font-mono font-extrabold text-blue-700">{m.gstNumber}</span></div>}
                                        {m.bankDetails && <div><span className="font-bold text-slate-800">Bank:</span> {m.bankDetails}</div>}
                                        {m.supplierAddress && <div><span className="font-bold text-slate-800">Address:</span> {m.supplierAddress}</div>}
                                        {(m.cgst || m.sgst || m.igst) && (
                                          <div className="flex items-center gap-1.5 pt-1">
                                            <span className="bg-slate-200/80 text-slate-800 font-mono font-bold px-2 py-0.5 rounded text-[10px]">CGST: {m.cgst || '9'}%</span>
                                            <span className="bg-slate-200/80 text-slate-800 font-mono font-bold px-2 py-0.5 rounded text-[10px]">SGST: {m.sgst || '9'}%</span>
                                            <span className="bg-slate-200/80 text-slate-800 font-mono font-bold px-2 py-0.5 rounded text-[10px]">IGST: {m.igst || '0'}%</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-3.5 pr-4 text-right">
                                    <button onClick={() => deleteMasterItem(m.id)} className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 3: Register HR Staff */}
              {deskSubTab === 'register' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Form */}
                  <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md p-6">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                          <UserPlus className="w-4 h-4" />
                        </div>
                        <div>
                          <h2 className="font-extrabold text-slate-900 text-sm">HR Staff Account Creation Suite</h2>
                          <span className="text-[10px] text-slate-500 font-mono font-bold">Table: public.profiles</span>
                        </div>
                      </div>

                      {/* Small Button to Lock / Unlock Email Handles */}
                      <button
                        type="button"
                        onClick={toggleEmailLock}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer border shadow-xs ${
                          isEmailLocked 
                            ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500' 
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                        }`}
                        title={isEmailLocked ? 'Email handles are locked. Click to unlock creation.' : 'Click to lock all email handle creation.'}
                      >
                        {isEmailLocked ? <Lock className="w-3.5 h-3.5 text-white" /> : <Unlock className="w-3.5 h-3.5 text-slate-600" />}
                        <span>{isEmailLocked ? 'Emails Locked' : 'Lock Email Handles'}</span>
                      </button>
                    </div>

                    {isEmailLocked && (
                      <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-900 text-xs font-bold">
                        <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>🔒 All email IDs are locked by Manager. No new email handles can be created.</span>
                      </div>
                    )}

                    <form onSubmit={createUser} className="space-y-4">
                      <div>
                        <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1.5">Worker Email Handle *</label>
                        <input 
                          type="email" 
                          required
                          disabled={isEmailLocked}
                          value={user.email}
                          placeholder="e.g. kiran@royalgokul.com"
                          className="w-full border-2 border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 bg-slate-50/90 focus:bg-white focus:border-emerald-500 outline-none transition shadow-xs placeholder:font-normal placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                          onChange={(e) => setUser({...user, email: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1.5">Initial Full Name *</label>
                        <input 
                          type="text" 
                          required
                          disabled={isEmailLocked}
                          value={user.fullName}
                          placeholder="e.g. Kiran Kumar"
                          className="w-full border-2 border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 bg-slate-50/90 focus:bg-white focus:border-emerald-500 outline-none transition shadow-xs placeholder:font-normal placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                          onChange={(e) => setUser({...user, fullName: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block mb-1.5">Designation Role Profile *</label>
                        <select 
                          value={user.designation}
                          disabled={isEmailLocked}
                          className="w-full border-2 border-slate-300 rounded-xl p-2.5 text-xs font-extrabold text-slate-900 bg-slate-50/90 focus:bg-white focus:border-emerald-500 outline-none transition cursor-pointer shadow-xs disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                          onChange={(e) => setUser({...user, designation: e.target.value})}
                        >
                          <option value="Accounts Assistant">Accounts Assistant</option>
                          <option value="Accounts Manager">Accounts Manager</option>
                          <option value="Director">Director</option>
                          <option value="Managing Director">Managing Director</option>
                          <option value="Project Director">Project Director</option>
                        </select>
                      </div>

                      <button 
                        type="submit" 
                        disabled={isEmailLocked}
                        className={`w-full py-2.5 rounded-xl text-xs font-extrabold tracking-wide transition shadow-md ${
                          isEmailLocked
                            ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                            : 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer mt-2'
                        }`}
                      >
                        {isEmailLocked ? '🔒 Creation Locked by Manager' : 'Create User Profile & Bind Role'}
                      </button>
                    </form>
                  </div>

                  {/* Governance Info Panel */}
                  <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-md p-6 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" />
                        <span>Security & Role Binding Policy</span>
                      </h3>
                      <p className="text-xs font-medium text-slate-300 leading-relaxed mb-4">
                        When an HR user profile is generated, the account is bound with a mandatory initial security lock (`is_first_time_login = true`).
                      </p>

                      <div className="space-y-3 text-xs">
                        <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                          <p className="font-extrabold text-emerald-400 mb-0.5">1. Initial Security Challenge</p>
                          <p className="text-slate-300 font-medium">New users are prompted to set up password locks and security questions upon first login.</p>
                        </div>

                        <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 flex justify-between items-center">
                          <div>
                            <p className="font-extrabold text-amber-400 mb-0.5">2. Manager Email Handle Lock</p>
                            <p className="text-slate-300 font-medium">Locking email handles prevents creation of any unapproved staff accounts.</p>
                          </div>
                          <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-extrabold shrink-0 border ${
                            isEmailLocked ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          }`}>
                            {isEmailLocked ? 'LOCKED' : 'UNLOCKED'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800 text-xs font-bold text-slate-400 flex justify-between items-center">
                      <span>Auth Engine: Active</span>
                      <span className={`font-mono font-extrabold ${isEmailLocked ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {isEmailLocked ? 'Email handles: LOCKED' : 'Email handles: OPEN'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 4: Staff Profiles */}
              {deskSubTab === 'profiles' && (
                <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md overflow-hidden">
                  <div className="p-4 bg-slate-900 text-white flex justify-between items-center flex-wrap gap-2">
                    <h3 className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-emerald-400" />
                      <span>HR Accounts Directory & Security Lock Status</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      {/* Small Button to Lock / Unlock Email Handles */}
                      <button
                        type="button"
                        onClick={toggleEmailLock}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer border shadow-xs ${
                          isEmailLocked 
                            ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500' 
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                        }`}
                        title={isEmailLocked ? 'Email handles are locked. Click to unlock.' : 'Lock all email handles so no further profiles can be created.'}
                      >
                        {isEmailLocked ? <Lock className="w-3.5 h-3.5 text-white" /> : <Unlock className="w-3.5 h-3.5 text-slate-400" />}
                        <span>{isEmailLocked ? 'Emails Locked' : 'Lock Email Handles'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isEmailLocked}
                        onClick={() => openImportModal('Staff Profiles', handleImportProfiles, 'full_name, email, designation', [])}
                        className={`font-extrabold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition shadow-xs ${
                          isEmailLocked ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600 text-slate-950 cursor-pointer'
                        }`}
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Import CSV</span>
                      </button>
                      <span className="bg-slate-800 text-slate-200 text-xs font-mono font-bold px-2.5 py-1 rounded-lg">
                        {usersList.length} Active Profiles
                      </span>
                    </div>
                  </div>

                  <div className={`p-3.5 border-b text-xs flex items-center gap-2 ${
                    isEmailLocked ? 'bg-rose-50 border-rose-200 text-rose-950' : 'bg-amber-50 border-amber-200/80 text-amber-900'
                  }`}>
                    {isEmailLocked ? (
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <span>
                      <strong className="font-extrabold">
                        {isEmailLocked ? 'Email Handle Lockdown ACTIVE:' : 'Designation Lock Active:'}
                      </strong>{' '}
                      {isEmailLocked 
                        ? 'All email IDs are locked by the Manager. No other email handles can be created or registered.' 
                        : 'Once logged in, designations are strictly locked to their registered profile email. Unregistered emails are blocked from logging in unless added here by the Accounts Manager.'}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-100 uppercase text-xs font-extrabold tracking-wider border-b border-slate-800">
                        <tr>
                          <th className="p-3.5 pl-4">Full Name / Email Handle</th>
                          <th className="p-3.5">Designation Role</th>
                          <th className="p-3.5">Security Question</th>
                          <th className="p-3.5">Lock Status</th>
                          <th className="p-3.5 pr-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {usersList.length === 0 ? (
                          <tr><td colSpan="5" className="p-4 text-center text-slate-500 italic">No staff user profiles registered.</td></tr>
                        ) : (
                          usersList.map((u, idx) => (
                            <tr key={u.id ? `u-${u.id}-${idx}` : `u-${u.email || idx}-${idx}`} className="hover:bg-slate-50 transition">
                              <td className="p-3.5 pl-4">
                                <div className="font-extrabold text-slate-900">{u.full_name || u.email}</div>
                                <div className="text-xs text-slate-500 font-mono">{u.email}</div>
                              </td>
                              <td className="p-3.5 font-bold text-slate-800">{u.designation}</td>
                              <td className="p-3.5 text-slate-600 italic text-xs font-medium">{u.security_question || 'Default System Prompt'}</td>
                              <td className="p-3.5">
                                {u.is_first_time_login ? (
                                  <span className="bg-amber-100 text-amber-900 font-extrabold text-[11px] uppercase px-2.5 py-1 rounded-full border border-amber-300">
                                    Lock Pending
                                  </span>
                                ) : (
                                  <span className="bg-emerald-100 text-emerald-900 font-extrabold text-[11px] uppercase px-2.5 py-1 rounded-full border border-emerald-300">
                                    Verified
                                  </span>
                                )}
                              </td>
                              <td className="p-3.5 pr-4 text-right">
                                <button onClick={() => deleteUserItem(u.id)} className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer">
                                  <Trash2 className="w-4 h-4" />
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

              {/* SUBTAB 5: System Authority */}
              {deskSubTab === 'authority' && (
                <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md p-6 space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="font-extrabold text-slate-900 text-base">System Authority & Access Control Governance</h2>
                        <p className="text-xs font-medium text-slate-500">Role-Based Access Control (RBAC) & Database Security Engine</p>
                      </div>
                    </div>
                    <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
                      Active Manager Authority
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Accounts Manager</h4>
                        <span className="text-[10px] bg-slate-900 text-white font-mono px-2 py-0.5 rounded">Full Admin</span>
                      </div>
                      <p className="text-xs text-slate-600">Full authority over Projects, Master dropdown seeders, HR users, Payments, and Ledger additions.</p>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Director / MD</h4>
                        <span className="text-[10px] bg-amber-500 text-slate-900 font-bold px-2 py-0.5 rounded">Executive Audit</span>
                      </div>
                      <p className="text-xs text-slate-600">Read-only Executive dashboard for Corporate P&L balance sheets, vendor ledgers, and raw material purchase audits.</p>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Accounts Assistant</h4>
                        <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded">Site Logging</span>
                      </div>
                      <p className="text-xs text-slate-600">Site entry access for material Goods Receipt Note (GRN) logging, itemized tax calculations, and bulk Excel parsing.</p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-wrap justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                      <Database className="w-5 h-5 text-amber-400" />
                      <div>
                        <p className="text-xs font-bold">Database Connectivity Engine</p>
                        <p className="text-[10px] text-slate-400">
                          Running on high-performance database engine with persistent state.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={loadData}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Sync Now</span>
                      </button>
                      <button 
                        onClick={handleClearWebsiteData}
                        className="px-3 py-1.5 bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800/80 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                        title="Clear all transactional data (GRNs, Payments, Ledgers, etc.)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Reset Data</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PAYMENTS TAB */}
          {activeTab === 'payments' && (
            <PaymentsTabSection
              paymentsList={paymentsList}
              mastersList={mastersList}
              grnList={grnList}
              projectsList={projectsList}
              defaultVendors={defaultVendors}
              paymentForm={paymentForm}
              setPaymentForm={setPaymentForm}
              calculateNextPaymentId={calculateNextPaymentId}
              handleRecordPayment={handleRecordPayment}
              handleDeletePayment={handleDeletePayment}
              paymentSearchQuery={paymentSearchQuery}
              setPaymentSearchQuery={setPaymentSearchQuery}
              paymentSiteFilter={paymentSiteFilter}
              setPaymentSiteFilter={setPaymentSiteFilter}
              paymentVendorFilter={paymentVendorFilter}
              setPaymentVendorFilter={setPaymentVendorFilter}
              paymentModeFilter={paymentModeFilter}
              setPaymentModeFilter={setPaymentModeFilter}
              paymentAccountFilter={paymentAccountFilter}
              setPaymentAccountFilter={setPaymentAccountFilter}
              paymentDatePreset={paymentDatePreset}
              setPaymentDatePreset={setPaymentDatePreset}
              handlePaymentDatePresetChange={handlePaymentDatePresetChange}
              paymentStartDate={paymentStartDate}
              setPaymentStartDate={setPaymentStartDate}
              paymentEndDate={paymentEndDate}
              setPaymentEndDate={setPaymentEndDate}
              formatDDMMYYYY={formatDDMMYYYY}
              parseNum={parseNum}
              exportToExcel={exportToExcel}
              exportToPDF={exportToPDF}
            />
          )}

          {false && activeTab === 'payments' && (() => {
            const groupedPay = getGroupedPayments(paymentSiteFilter, paymentVendorFilter);
            const filteredPayGrouped = groupedPay.filter(p => {
              const query = paymentSearchQuery.toLowerCase().trim();
              return !query || 
                (p.vendor && p.vendor.toLowerCase().includes(query)) ||
                (p.siteName && p.siteName.toLowerCase().includes(query)) ||
                (p.remarks && p.remarks.toLowerCase().includes(query));
            });

            const compTotalAmt = filteredPayGrouped.reduce((acc, p) => acc + parseNum(p.amount), 0);
            const compTotalPaid = filteredPayGrouped.reduce((acc, p) => acc + parseNum(p.paid), 0);
            const compTotalBal = compTotalAmt - compTotalPaid;

            return (
            <div className="space-y-6">
              
              {/* Top Payment Header Card (Dark Theme matching reference design) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-white">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  
                  {/* Title & Icon */}
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                      <IndianRupee className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="font-extrabold text-lg text-white tracking-tight">Payments</h2>
                    </div>
                  </div>

                  {/* Company Summary Box & Action Controls */}
                  <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    
                    {/* Small Company Net Financial Summary Box */}
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl px-3.5 py-2 flex flex-wrap items-center gap-3 text-xs shadow-inner shrink-0">
                      <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider">Purchase:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Total:</span>
                        <span className="font-mono font-extrabold text-slate-100">₹{compTotalAmt.toLocaleString('en-IN')}</span>
                      </div>
                      <span className="text-slate-700 font-bold">|</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-emerald-400 font-bold uppercase">Paid:</span>
                        <span className="font-mono font-extrabold text-emerald-400">₹{compTotalPaid.toLocaleString('en-IN')}</span>
                      </div>
                      <span className="text-slate-700 font-bold">|</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-amber-400 font-bold uppercase">Balance:</span>
                        <span className="font-mono font-extrabold text-amber-400">₹{compTotalBal.toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    {/* Search Input */}
                    <div className="relative flex-1 sm:w-48">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search vendor..."
                        value={paymentSearchQuery}
                        onChange={(e) => setPaymentSearchQuery(e.target.value)}
                        className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 outline-none transition font-medium"
                      />
                    </div>

                    {/* Site Filter Dropdown */}
                    <div className="relative">
                      <select
                        value={paymentSiteFilter}
                        onChange={(e) => setPaymentSiteFilter(e.target.value)}
                        className="bg-slate-950/80 border border-slate-700/80 text-amber-400 text-xs font-bold rounded-xl px-3 py-2 pr-8 appearance-none focus:border-amber-500 outline-none cursor-pointer shadow-xs"
                      >
                        {Array.from(new Set([
                          'All Sites',
                          ...projectsList.map(p => typeof p === 'string' ? p.trim() : (p?.name || p?.siteName || p?.site || '').trim()).filter(Boolean),
                          ...paymentsList.map(p => (p.siteName || p.project || p.site || p.projectName || '').trim()).filter(Boolean),
                          ...grnList.map(g => (g.projectName || g.siteName || g.project || g.site || '').trim()).filter(Boolean)
                        ])).map((site, idx) => (
                          <option key={`psite-${site}-${idx}`} value={site} className="bg-slate-900 text-slate-200 font-bold">{site}</option>
                        ))}
                      </select>
                      <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    {/* Vendor Filter Dropdown */}
                    <div className="relative">
                      <select
                        value={paymentVendorFilter}
                        onChange={(e) => setPaymentVendorFilter(e.target.value)}
                        className="bg-slate-950/80 border border-slate-700/80 text-emerald-400 text-xs font-bold rounded-xl px-3 py-2 pr-8 appearance-none focus:border-amber-500 outline-none cursor-pointer shadow-xs"
                      >
                        {Array.from(new Set([
                          'All Vendors',
                          ...defaultVendors.map(v => typeof v === 'string' ? v.trim() : String(v).trim()).filter(Boolean),
                          ...paymentsList.map(p => (p.vendor || p.supplier || '').trim()).filter(Boolean),
                          ...grnList.map(g => (g.supplier || g.vendor || '').trim()).filter(Boolean),
                          ...mastersList.filter(m => m.category === 'Supplier' || m.category === 'Vendor').map(s => typeof s === 'string' ? s.trim() : (s?.label || s?.name || s?.value || s?.supplier || '').trim()).filter(Boolean)
                        ])).map((vendor, idx) => (
                          <option key={`pven-${vendor}-${idx}`} value={vendor} className="bg-slate-900 text-slate-200 font-bold">{vendor}</option>
                        ))}
                      </select>
                      <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    {/* Export PDF/Excel Button */}
                    <ExportButton 
                      label="Export Payments"
                      onExportExcel={() => {
                        const isSingleVendor = paymentVendorFilter && paymentVendorFilter !== 'All Vendors';

                        if (isSingleVendor) {
                          // Detailed itemized report showing each individual transaction row separately
                          let detailedRows = [];
                          let totalAmt = 0;
                          let totalPaid = 0;
                          let totalBal = 0;

                          filteredPayGrouped.forEach(vGrp => {
                            if (vGrp.records && vGrp.records.length > 0) {
                              vGrp.records.forEach((rec, rIdx) => {
                                const amt = parseNum(rec.amount);
                                const paid = parseNum(rec.paid);
                                const bal = parseNum(rec.balance !== undefined ? rec.balance : Math.max(0, amt - paid));
                                const wt = parseNum(rec.weight || rec.qty || rec.quantity || 0);
                                const wtStr = wt > 0 ? `${wt.toLocaleString('en-IN')} ${rec.uom || vGrp.uom || 'MT'}` : '-';

                                totalAmt += amt;
                                totalPaid += paid;
                                totalBal += bal;

                                detailedRows.push([
                                  rec.paymentDate || rec.date || vGrp.date || '-',
                                  rec.paymentId || rec.id || `PAY-${vGrp.vendorKey}-${rIdx + 1}`,
                                  rec.siteName || rec.project || rec.site || vGrp.siteName || 'Site',
                                  vGrp.vendor,
                                  rec.item || rec.itemName || vGrp.item || '-',
                                  wtStr,
                                  amt,
                                  paid,
                                  bal,
                                  rec.paymentMode || 'NEFT / RTGS',
                                  rec.status || (paid >= amt && amt > 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Pending'),
                                  rec.remarks || '-'
                                ]);
                              });
                            } else {
                              const amt = parseNum(vGrp.amount);
                              const paid = parseNum(vGrp.paid);
                              const bal = parseNum(vGrp.balance);
                              totalAmt += amt;
                              totalPaid += paid;
                              totalBal += bal;

                              detailedRows.push([
                                vGrp.date || '-',
                                vGrp.paymentId || '-',
                                vGrp.siteName || 'Site',
                                vGrp.vendor,
                                vGrp.item || '-',
                                vGrp.totalWeight > 0 ? `${vGrp.totalWeight.toLocaleString('en-IN')} ${vGrp.uom || 'MT'}` : '-',
                                amt,
                                paid,
                                bal,
                                'NEFT / RTGS',
                                vGrp.status,
                                vGrp.remarks || '-'
                              ]);
                            }
                          });

                          // Append Total Summary Row
                          detailedRows.push([
                            'TOTAL',
                            '-',
                            '-',
                            '-',
                            '-',
                            '-',
                            totalAmt,
                            totalPaid,
                            totalBal,
                            '-',
                            '-',
                            '-'
                          ]);

                          exportToExcel(
                            `Vendor Payment Statement — ${paymentVendorFilter}`,
                            `Payment_Statement_${paymentVendorFilter.replace(/[^a-zA-Z0-9]/g, '_')}`,
                            ['Date', 'Payment ID / Ref', 'Project / Site', 'Vendor Name', 'Item Description', 'Qty / Weight', 'Bill Amount (₹)', 'Paid Amount (₹)', 'Balance Due (₹)', 'Payment Mode', 'Status', 'Remarks'],
                            detailedRows,
                            paymentSiteFilter !== 'All Sites' ? `Site: ${paymentSiteFilter}` : 'All Sites',
                            paymentVendorFilter
                          );

                        } else {
                          // All vendors together normal consolidated table
                          const totalAmt = filteredPayGrouped.reduce((s, p) => s + parseNum(p.amount), 0);
                          const totalPaid = filteredPayGrouped.reduce((s, p) => s + parseNum(p.paid), 0);
                          const totalBal = filteredPayGrouped.reduce((s, p) => s + parseNum(p.balance), 0);

                          const rows = filteredPayGrouped.map(p => {
                            const weightStr = p.totalWeight > 0 ? `${p.totalWeight.toLocaleString('en-IN')} ${p.uom || 'MT'}` : '-';
                            return [
                              p.vendor,
                              p.item || '-',
                              p.paymentId || '-',
                              weightStr,
                              p.amount,
                              p.paid,
                              p.balance,
                              p.status
                            ];
                          });

                          // Append Grand Total Row at the end of the table
                          rows.push([
                            'GRAND TOTAL',
                            '-',
                            '-',
                            '-',
                            totalAmt,
                            totalPaid,
                            totalBal,
                            '-'
                          ]);

                          exportToExcel(
                            'Payment Register Details',
                            'Payment_Register_Details',
                            ['Vendor Name', 'Item', 'Payment ID', 'Weight / Quantity', 'Total Bill Amount (₹)', 'Paid Amount (₹)', 'Balance Outstanding (₹)', 'Payment Status'],
                            rows,
                            paymentSiteFilter !== 'All Sites' ? `Site: ${paymentSiteFilter}` : 'All Sites',
                            'All Suppliers'
                          );
                        }
                      }}
                      onExportPdf={() => {
                        const isSingleVendor = paymentVendorFilter && paymentVendorFilter !== 'All Vendors';

                        if (isSingleVendor) {
                          // Detailed itemized PDF report showing each individual transaction row separately
                          let detailedRows = [];
                          let totalAmt = 0;
                          let totalPaid = 0;
                          let totalBal = 0;

                          filteredPayGrouped.forEach(vGrp => {
                            if (vGrp.records && vGrp.records.length > 0) {
                              vGrp.records.forEach((rec, rIdx) => {
                                const amt = parseNum(rec.amount);
                                const paid = parseNum(rec.paid);
                                const bal = parseNum(rec.balance !== undefined ? rec.balance : Math.max(0, amt - paid));
                                const wt = parseNum(rec.weight || rec.qty || rec.quantity || 0);
                                const wtStr = wt > 0 ? `${wt.toLocaleString('en-IN')} ${rec.uom || vGrp.uom || 'MT'}` : '-';

                                totalAmt += amt;
                                totalPaid += paid;
                                totalBal += bal;

                                detailedRows.push([
                                  rec.paymentDate || rec.date || vGrp.date || '-',
                                  rec.paymentId || rec.id || `PAY-${vGrp.vendorKey}-${rIdx + 1}`,
                                  rec.siteName || rec.project || rec.site || vGrp.siteName || 'Site',
                                  rec.item || rec.itemName || vGrp.item || '-',
                                  wtStr,
                                  `₹ ${amt.toLocaleString('en-IN')}`,
                                  `₹ ${paid.toLocaleString('en-IN')}`,
                                  `₹ ${bal.toLocaleString('en-IN')}`,
                                  rec.paymentMode || 'NEFT / RTGS',
                                  rec.status || (paid >= amt && amt > 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Pending')
                                ]);
                              });
                            } else {
                              const amt = parseNum(vGrp.amount);
                              const paid = parseNum(vGrp.paid);
                              const bal = parseNum(vGrp.balance);
                              totalAmt += amt;
                              totalPaid += paid;
                              totalBal += bal;

                              detailedRows.push([
                                vGrp.date || '-',
                                vGrp.paymentId || '-',
                                vGrp.siteName || 'Site',
                                vGrp.item || '-',
                                vGrp.totalWeight > 0 ? `${vGrp.totalWeight.toLocaleString('en-IN')} ${vGrp.uom || 'MT'}` : '-',
                                `₹ ${amt.toLocaleString('en-IN')}`,
                                `₹ ${paid.toLocaleString('en-IN')}`,
                                `₹ ${bal.toLocaleString('en-IN')}`,
                                'NEFT / RTGS',
                                vGrp.status
                              ]);
                            }
                          });

                          // Append Total Summary Row
                          detailedRows.push([
                            'TOTAL',
                            '-',
                            '-',
                            '-',
                            '-',
                            `₹ ${totalAmt.toLocaleString('en-IN')}`,
                            `₹ ${totalPaid.toLocaleString('en-IN')}`,
                            `₹ ${totalBal.toLocaleString('en-IN')}`,
                            '-',
                            '-'
                          ]);

                          exportToPDF(
                            `Vendor Payment Statement — ${paymentVendorFilter}`,
                            ['Date', 'Payment ID / Ref', 'Site', 'Item Description', 'Qty / Weight', 'Bill Amount (₹)', 'Paid (₹)', 'Balance (₹)', 'Mode', 'Status'],
                            detailedRows,
                            paymentSiteFilter !== 'All Sites' ? `Site: ${paymentSiteFilter}` : 'All Sites',
                            paymentVendorFilter
                          );

                        } else {
                          // All vendors together normal consolidated table
                          const totalAmt = filteredPayGrouped.reduce((s, p) => s + parseNum(p.amount), 0);
                          const totalPaid = filteredPayGrouped.reduce((s, p) => s + parseNum(p.paid), 0);
                          const totalBal = filteredPayGrouped.reduce((s, p) => s + parseNum(p.balance), 0);

                          const rows = filteredPayGrouped.map(p => {
                            const weightStr = p.totalWeight > 0 ? `${p.totalWeight.toLocaleString('en-IN')} ${p.uom || 'MT'}` : '-';
                            return [
                              p.vendor,
                              p.item || '-',
                              p.paymentId || '-',
                              weightStr,
                              `₹ ${p.amount.toLocaleString('en-IN')}`,
                              `₹ ${p.paid.toLocaleString('en-IN')}`,
                              `₹ ${p.balance.toLocaleString('en-IN')}`,
                              p.status
                            ];
                          });

                          // Append Grand Total Row at the end of the table
                          rows.push([
                            'GRAND TOTAL',
                            '-',
                            '-',
                            '-',
                            `₹ ${totalAmt.toLocaleString('en-IN')}`,
                            `₹ ${totalPaid.toLocaleString('en-IN')}`,
                            `₹ ${totalBal.toLocaleString('en-IN')}`,
                            '-'
                          ]);

                          exportToPDF(
                            'Payment Register Details',
                            ['Vendor Name', 'Item', 'Payment ID', 'Weight / Quantity', 'Total Bill Amount (₹)', 'Paid Amount (₹)', 'Balance Outstanding (₹)', 'Payment Status'],
                            rows,
                            paymentSiteFilter !== 'All Sites' ? `Site: ${paymentSiteFilter}` : 'All Sites',
                            'All Suppliers'
                          );
                        }
                      }}
                    />

                    {/* Import CSV Button */}
                    <button
                      type="button"
                      onClick={() => openImportModal('Payments', handleImportPayments, 'date, siteName, vendor, invoiceNo, amount, paid, remarks', [])}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                      <span>Import CSV</span>
                    </button>

                    {/* + New Payment Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const nextId = calculateNextPaymentId(paymentsList, paymentForm.paymentDate || new Date().toISOString().split('T')[0]);
                        setPaymentForm(prev => ({ ...prev, paymentId: nextId }));
                        setShowAddPaymentModal(true);
                      }}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md"
                    >
                      <Plus className="w-4 h-4" />
                      <span>New Payment</span>
                    </button>

                  </div>

                </div>
              </div>

              {/* Payments Register Table Container */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden text-slate-100">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    
                    {/* Header Columns for combined vendor rows */}
                    <thead className="bg-slate-950/90 text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-800">
                      <tr>
                        <th className="p-3.5 pl-4">VENDOR</th>
                        <th className="p-3.5">ITEM</th>
                        <th className="p-3.5">PAYMENT ID</th>
                        <th className="p-3.5 text-center">QTY / WEIGHT</th>
                        <th className="p-3.5 text-right">TOTAL AMOUNT (₹)</th>
                        <th className="p-3.5 text-right">PAID AMOUNT (₹)</th>
                        <th className="p-3.5 text-right">BALANCE (₹)</th>
                        <th className="p-3.5 text-center">STATUS</th>
                        <th className="p-3.5 text-center">ACTION</th>
                        <th className="p-3.5 pr-4">REMARKS</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-800/80 font-medium text-slate-200">
                      {filteredPayGrouped.map((vGrp, idx) => {
                          return (
                            <tr key={vGrp.id ? `vgrp-${vGrp.id}` : `vgrp-${vGrp.vendor || idx}-${idx}`} className="hover:bg-slate-800/60 transition">
                              
                              {/* VENDOR */}
                              <td className="p-3.5 pl-4 font-bold text-slate-100">
                                <div className="text-sm">{vGrp.vendor}</div>
                                {vGrp.records.length > 1 && (
                                  <span className="text-[10px] text-amber-400 font-mono font-normal block">
                                    Combined from {vGrp.records.length} transactions
                                  </span>
                                )}
                              </td>

                              {/* ITEM COLUMN */}
                              <td className="p-3.5 font-bold text-slate-200">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-800 text-amber-300 border border-slate-700">
                                  {vGrp.item || '-'}
                                </span>
                              </td>

                              {/* PAYMENT ID */}
                              <td className="p-3.5 font-mono font-bold text-emerald-400 text-[11px]">
                                {vGrp.paymentId || (vGrp.records[0]?.paymentId || '-')}
                              </td>

                              {/* QUANTITY / WEIGHT */}
                              <td className="p-3.5 text-center font-mono font-bold text-slate-100 text-xs">
                                {vGrp.totalWeight > 0 ? `${vGrp.totalWeight.toLocaleString('en-IN')} ${vGrp.uom || 'MT'}` : '-'}
                              </td>

                              {/* TOTAL AMOUNT (₹) */}
                              <td className="p-3.5 text-right font-mono font-extrabold text-slate-100 text-sm">
                                {formatINR(vGrp.amount)}
                              </td>

                              {/* PAID AMOUNT (₹) */}
                              <td className="p-3.5 text-right font-mono font-extrabold text-emerald-400 text-sm">
                                {formatINR(vGrp.paid)}
                              </td>

                              {/* BALANCE DUE (₹) */}
                              <td className="p-3.5 text-right font-mono font-extrabold text-amber-400 text-sm">
                                {formatINR(vGrp.balance)}
                              </td>

                              {/* STATUS BADGE */}
                              <td className="p-3.5 text-center">
                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                                  vGrp.status === 'Paid' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30' :
                                  vGrp.status === 'Partial' ? 'bg-amber-950/80 text-amber-400 border border-amber-500/30' :
                                  'bg-rose-950/80 text-rose-400 border border-rose-500/30'
                                }`}>
                                  {vGrp.status}
                                </span>
                              </td>

                              {/* ACTION COLUMN */}
                              <td className="p-3.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleOpenPayModal(vGrp)}
                                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 mx-auto shadow-xs"
                                >
                                  <CreditCard className="w-3.5 h-3.5" />
                                  <span>Pay / Details</span>
                                </button>
                              </td>

                              {/* REMARKS */}
                              <td className="p-3.5 pr-4 text-slate-400 text-xs italic">
                                {vGrp.remarks || ''}
                              </td>

                            </tr>
                          );
                        })}

                      {paymentsList.length === 0 && (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-slate-500 text-xs">
                            No payment records found. Click "+ New Payment" above to add an entry.
                          </td>
                        </tr>
                      )}
                    </tbody>

                    {/* Grand Total Footer for Payment Reports Table */}
                    {filteredPayGrouped.length > 0 && (
                      <tfoot className="bg-slate-950 text-white font-extrabold text-xs border-t-2 border-amber-500">
                        <tr>
                          <td className="p-3.5 pl-4 uppercase tracking-wider text-amber-300">
                            Grand Total ({filteredPayGrouped.length} Vendors)
                          </td>
                          <td className="p-3.5 text-slate-300">
                            All Items
                          </td>
                          <td className="p-3.5 font-mono text-emerald-400">
                            —
                          </td>
                          <td className="p-3.5 text-center font-mono text-slate-200">
                            {filteredPayGrouped.reduce((s, p) => s + parseNum(p.totalWeight), 0) > 0 
                              ? `${filteredPayGrouped.reduce((s, p) => s + parseNum(p.totalWeight), 0).toLocaleString('en-IN')} MT` 
                              : '—'}
                          </td>
                          <td className="p-3.5 text-right font-mono text-sm font-black text-slate-100">
                            ₹{filteredPayGrouped.reduce((s, p) => s + parseNum(p.amount), 0).toLocaleString('en-IN')}
                          </td>
                          <td className="p-3.5 text-right font-mono text-sm font-black text-emerald-400">
                            ₹{filteredPayGrouped.reduce((s, p) => s + parseNum(p.paid), 0).toLocaleString('en-IN')}
                          </td>
                          <td className="p-3.5 text-right font-mono text-sm font-black text-amber-300 bg-slate-900/90">
                            ₹{filteredPayGrouped.reduce((s, p) => s + parseNum(p.balance), 0).toLocaleString('en-IN')}
                          </td>
                          <td colSpan={3} className="p-3.5 pr-4 text-right text-slate-400">
                            Consolidated Ledger Summary
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* MODAL 1: Payment Disbursement & Print Details Modal */}
              {payModalOpen && activePaymentRow && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden text-white animate-in fade-in zoom-in duration-200">
                    
                    {/* Modal Header */}
                    <div className="p-5 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-base text-white">Payment Disbursement & Voucher Details</h3>
                          <p className="text-xs text-slate-400">Printed row details & record new partial/pending payment</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setPayModalOpen(false)}
                        className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="p-6 space-y-6">
                      
                      {/* Details Printed Voucher Box */}
                      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-4">
                        <div className="flex justify-between items-start pb-3 border-b border-slate-800">
                          <div>
                            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest block">ROYAL GOKUL CONSTRUCTIONS</span>
                            <h4 className="font-bold text-lg text-slate-100">{activePaymentRow.vendor}</h4>
                            <p className="text-xs text-slate-400">{activePaymentRow.siteName || activePaymentRow.project}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block font-mono">Invoice Number</span>
                            <span className="font-mono font-bold text-amber-400 text-sm">{activePaymentRow.invoiceNo || 'INV-2026-081'}</span>
                            <div className="text-[11px] text-slate-400 mt-0.5">Date: {activePaymentRow.date}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 text-center">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Qty / Weight</span>
                            <span className="font-mono font-extrabold text-sm text-slate-100">
                              {activePaymentRow.totalWeight > 0 ? `${activePaymentRow.totalWeight.toLocaleString('en-IN')} ${activePaymentRow.uom || 'MT'}` : '-'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Amount (₹)</span>
                            <span className="font-mono font-extrabold text-sm text-slate-100">{formatINR(parseNum(activePaymentRow.amount))}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Paid So Far (₹)</span>
                            <span className="font-mono font-extrabold text-sm text-emerald-400">{formatINR(parseNum(activePaymentRow.paid))}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Balance Due (₹)</span>
                            <span className="font-mono font-extrabold text-sm text-amber-400">{formatINR(parseNum(activePaymentRow.balance))}</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-xs text-slate-400 pt-1">
                          <div className="flex items-center gap-2">
                            <span>Status:</span>
                            <span className={`font-bold px-2.5 py-0.5 rounded-full text-[11px] ${
                              activePaymentRow.status === 'Paid' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30' :
                              activePaymentRow.status === 'Partial' ? 'bg-amber-950/80 text-amber-400 border border-amber-500/30' :
                              'bg-rose-950/80 text-rose-400 border border-rose-500/30'
                            }`}>
                              {activePaymentRow.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const recs = (activePaymentRow.records && activePaymentRow.records.length > 0) ? activePaymentRow.records : [activePaymentRow];
                                let totalAmt = 0;
                                let totalPaid = 0;
                                let totalBal = 0;
                                const detailedRows = recs.map((rec, rIdx) => {
                                  const amt = parseNum(rec.amount);
                                  const paid = parseNum(rec.paid);
                                  const bal = parseNum(rec.balance !== undefined ? rec.balance : Math.max(0, amt - paid));
                                  const wt = parseNum(rec.weight || rec.qty || rec.quantity || 0);
                                  const wtStr = wt > 0 ? `${wt.toLocaleString('en-IN')} ${rec.uom || activePaymentRow.uom || 'MT'}` : '-';
                                  totalAmt += amt;
                                  totalPaid += paid;
                                  totalBal += bal;

                                  return [
                                    rec.paymentDate || rec.date || activePaymentRow.date || '-',
                                    rec.paymentId || rec.id || `PAY-${activePaymentRow.vendorKey}-${rIdx + 1}`,
                                    rec.siteName || rec.project || activePaymentRow.siteName || 'Site',
                                    activePaymentRow.vendor,
                                    rec.item || rec.itemName || activePaymentRow.item || '-',
                                    wtStr,
                                    amt,
                                    paid,
                                    bal,
                                    rec.paymentMode || 'NEFT / RTGS',
                                    rec.status || (paid >= amt && amt > 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Pending'),
                                    rec.remarks || '-'
                                  ];
                                });

                                detailedRows.push([
                                  'TOTAL',
                                  '-',
                                  `${recs.length} Transactions`,
                                  activePaymentRow.vendor,
                                  'All Items',
                                  '-',
                                  totalAmt,
                                  totalPaid,
                                  totalBal,
                                  '-',
                                  '-',
                                  'Vendor Statement Summary'
                                ]);

                                exportToExcel(
                                  `Vendor Payment Statement — ${activePaymentRow.vendor}`,
                                  `Payment_Statement_${activePaymentRow.vendor.replace(/[^a-zA-Z0-9]/g, '_')}`,
                                  ['Date', 'Payment ID / Ref', 'Project / Site', 'Vendor Name', 'Item Description', 'Qty / Weight', 'Bill Amount (₹)', 'Paid Amount (₹)', 'Balance Due (₹)', 'Payment Mode', 'Status', 'Remarks'],
                                  detailedRows,
                                  activePaymentRow.siteName || 'All Sites',
                                  activePaymentRow.vendor
                                );
                              }}
                              className="bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 text-xs px-3 py-1 rounded-lg flex items-center gap-1.5 transition cursor-pointer border border-emerald-700/60 font-bold"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Export Excel</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => window.print()}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1 rounded-lg flex items-center gap-1.5 transition cursor-pointer border border-slate-700"
                            >
                              <Printer className="w-3.5 h-3.5 text-amber-400" />
                              <span>Print</span>
                            </button>
                          </div>
                        </div>

                        {/* Itemized Transactions Breakdown for this Vendor */}
                        {activePaymentRow.records && activePaymentRow.records.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-slate-800">
                            <div className="flex justify-between items-center text-xs font-bold text-slate-300">
                              <span className="text-amber-400 flex items-center gap-1.5">
                                <Building className="w-3.5 h-3.5" />
                                <span>Individual Transactions ({activePaymentRow.records.length})</span>
                              </span>
                              <span className="text-[11px] text-slate-400 font-normal">All recorded disbursements for this vendor</span>
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-slate-800 max-h-48 overflow-y-auto">
                              <table className="w-full text-[11px] text-left text-slate-300">
                                <thead className="bg-slate-900 text-slate-400 font-bold uppercase text-[9px] sticky top-0">
                                  <tr>
                                    <th className="p-2">Date</th>
                                    <th className="p-2">ID / Ref</th>
                                    <th className="p-2">Item / Site</th>
                                    <th className="p-2 text-right">Amount</th>
                                    <th className="p-2 text-right">Paid</th>
                                    <th className="p-2 text-right">Balance</th>
                                    <th className="p-2 text-center">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                                  {activePaymentRow.records.map((r, rIdx) => {
                                    const rAmt = parseNum(r.amount);
                                    const rPaid = parseNum(r.paid);
                                    const rBal = parseNum(r.balance !== undefined ? r.balance : Math.max(0, rAmt - rPaid));
                                    const rStatus = r.status || (rPaid >= rAmt && rAmt > 0 ? 'Paid' : rPaid > 0 ? 'Partial' : 'Pending');
                                    return (
                                      <tr key={`rec-${rIdx}`} className="hover:bg-slate-900/60">
                                        <td className="p-2 whitespace-nowrap">{r.paymentDate || r.date || activePaymentRow.date || '-'}</td>
                                        <td className="p-2 font-mono text-amber-400">{r.paymentId || r.id || `PAY-${activePaymentRow.vendorKey}-${rIdx + 1}`}</td>
                                        <td className="p-2">
                                          <div className="font-semibold text-slate-200">{r.item || r.itemName || activePaymentRow.item || '-'}</div>
                                          <div className="text-[9px] text-slate-500">{r.siteName || r.project || activePaymentRow.siteName || ''}</div>
                                        </td>
                                        <td className="p-2 text-right font-mono font-bold text-slate-200">₹{rAmt.toLocaleString('en-IN')}</td>
                                        <td className="p-2 text-right font-mono text-emerald-400">₹{rPaid.toLocaleString('en-IN')}</td>
                                        <td className="p-2 text-right font-mono text-amber-400">₹{rBal.toLocaleString('en-IN')}</td>
                                        <td className="p-2 text-center">
                                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                            rStatus === 'Paid' ? 'bg-emerald-950 text-emerald-400' :
                                            rStatus === 'Partial' ? 'bg-amber-950 text-amber-400' :
                                            'bg-rose-950 text-rose-400'
                                          }`}>
                                            {rStatus}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                        {activePaymentRow.remarks && (
                          <div className="text-xs text-slate-400 bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/80">
                            <strong className="text-slate-300">Remarks:</strong> {activePaymentRow.remarks}
                          </div>
                        )}
                      </div>

                      {/* Payment Entry Form (Amount to be paid LEFT BLANK as explicitly requested) */}
                      <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-5 space-y-4">
                        <h4 className="font-bold text-sm text-amber-400 flex items-center gap-2">
                          <IndianRupee className="w-4 h-4 text-amber-400" />
                          <span>Make Payment & Update Balance</span>
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                              Payment Date *
                            </label>
                            <input
                              type="date"
                              required
                              value={payDateInput}
                              onChange={(e) => setPayDateInput(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 font-mono focus:border-amber-500 outline-none transition"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                              Amount to Pay (₹) *
                            </label>
                            <input
                              type="number"
                              required
                              placeholder="Enter payment amount"
                              value={payAmountInput} // LEFT BLANK ON LOAD
                              onChange={(e) => setPayAmountInput(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm font-mono font-bold text-emerald-400 focus:border-amber-500 outline-none transition"
                            />
                            <span className="text-[10px] text-slate-500 mt-1 block">
                              Outstanding Balance: {formatINR(parseNum(activePaymentRow.balance))}
                            </span>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                              Payment Mode
                            </label>
                            <select
                              value={payModeInput}
                              onChange={(e) => setPayModeInput(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:border-amber-500 outline-none transition"
                            >
                              <option value="Online Transfer">Online Transfer</option>
                              <option value="NEFT / RTGS">NEFT / RTGS Bank Transfer</option>
                              <option value="Cheque Clearance">Cheque Clearance</option>
                              <option value="IMPS / UPI Transfer">IMPS / UPI Transfer</option>
                              <option value="Letter of Credit (LC)">Letter of Credit (LC)</option>
                              <option value="Cash Payment">Cash Payment</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                              Select Bank Account (Auto-fetched from Masters)
                            </label>
                            <select
                              value={payRefInput}
                              onChange={(e) => setPayRefInput(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm font-mono text-slate-200 focus:border-amber-500 outline-none transition"
                            >
                              <option value="">-- Select Bank Account --</option>
                              {mastersList.filter(m => m.category === 'Bank accounts').map((b, idx) => {
                                const bLbl = typeof b === 'string' ? b : (b?.label || b?.name || b?.value || '');
                                return (
                                  <option key={`bank-${b.id || idx}`} value={b.accountNumber || bLbl}>
                                    {bLbl} ({b.accountNumber || b.bankDetails || 'A/C Active'})
                                  </option>
                                );
                              })}
                              {mastersList.filter(m => m.category === 'Bank accounts').length === 0 && (
                                <option value="HDFC Bank A/C 50200084920192">HDFC Bank A/C 50200084920192</option>
                              )}
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                              Payment Notes / Remarks
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Part payment clearance"
                              value={payNotesInput}
                              onChange={(e) => setPayNotesInput(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-slate-200 focus:border-amber-500 outline-none transition"
                            />
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Modal Footer */}
                    <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setPayModalOpen(false)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSavePaymentUpdate}
                        className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-lg transition cursor-pointer shadow-md flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Save Payment</span>
                      </button>
                    </div>

                  </div>
                </div>
              )}

              {/* MODAL 2: Add New Payment Record Modal */}
              {showAddPaymentModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden text-white animate-in fade-in zoom-in duration-200 my-auto">
                    <div className="p-5 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                      <div className="flex items-center gap-2.5">
                        <PlusCircle className="w-5 h-5 text-amber-400" />
                        <h3 className="font-bold text-base text-white">Create New Vendor Payment Register Entry</h3>
                      </div>
                      <button onClick={() => setShowAddPaymentModal(false)} className="text-slate-400 hover:text-white p-1 cursor-pointer">✕</button>
                    </div>
                    
                    <form onSubmit={recordPayment} className="p-6 space-y-4 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        
                        {/* Payment ID (Auto-generated in same format as GRN ID) */}
                        <div>
                          <label className="font-bold text-slate-400 uppercase tracking-widest block mb-1">Payment ID *</label>
                          <input 
                            type="text"
                            required
                            value={paymentForm.paymentId || calculateNextPaymentId(paymentsList, paymentForm.paymentDate)}
                            onChange={(e) => setPaymentForm({...paymentForm, paymentId: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono font-bold text-emerald-400"
                            placeholder="e.g. PAY-26-27/001"
                          />
                        </div>

                        {/* Payment Date */}
                        <div>
                          <label className="font-bold text-slate-400 uppercase tracking-widest block mb-1">Payment Date *</label>
                          <input 
                            type="date"
                            required
                            value={paymentForm.paymentDate}
                            onChange={(e) => {
                              const newD = e.target.value;
                              const updatedId = calculateNextPaymentId(paymentsList, newD);
                              setPaymentForm({...paymentForm, paymentDate: newD, paymentId: updatedId});
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-400 uppercase tracking-widest block mb-1">Select Vendor *</label>
                          <select 
                            required
                            value={paymentForm.vendor}
                            onChange={(e) => setPaymentForm({...paymentForm, vendor: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-medium"
                          >
                            <option value="">Select Vendor</option>
                            {Array.from(new Set([
                              ...defaultVendors.map(v => typeof v === 'string' ? v.trim() : String(v).trim()).filter(Boolean),
                              ...grnList.map(g => (g.supplier || g.vendor || '').trim()).filter(Boolean),
                              ...paymentsList.map(p => (p.vendor || p.supplier || '').trim()).filter(Boolean),
                              ...mastersList.filter(m => m.category === 'Supplier' || m.category === 'Vendor').map(s => typeof s === 'string' ? s.trim() : (s?.label || s?.name || s?.value || s?.supplier || '').trim()).filter(Boolean)
                            ])).map((v, idx) => (
                              <option key={`vopt-${v}-${idx}`} value={v}>{v}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-slate-400 uppercase tracking-widest block mb-1">Site Name / Project *</label>
                          <select 
                            required
                            value={paymentForm.siteName}
                            onChange={(e) => setPaymentForm({...paymentForm, siteName: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 font-medium"
                          >
                            <option value="">Select Site</option>
                            {Array.from(new Set([
                              ...projectsList.map(p => typeof p === 'string' ? p.trim() : (p?.name || p?.siteName || p?.site || '').trim()).filter(Boolean),
                              ...grnList.map(g => (g.projectName || g.siteName || g.project || g.site || '').trim()).filter(Boolean),
                              ...paymentsList.map(p => (p.siteName || p.project || p.site || p.projectName || '').trim()).filter(Boolean)
                            ])).map((siteName, idx) => (
                              <option key={`popt-${siteName}-${idx}`} value={siteName}>{siteName}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-slate-400 uppercase tracking-widest block mb-1">Item / Material Description</label>
                          <input 
                            type="text"
                            placeholder="e.g. Cement 53 Grade / TMT Rebars"
                            value={paymentForm.item || ''}
                            onChange={(e) => setPaymentForm({...paymentForm, item: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-400 uppercase tracking-widest block mb-1">Payment Mode *</label>
                          <select 
                            required
                            value={paymentForm.paymentMode}
                            onChange={(e) => setPaymentForm({...paymentForm, paymentMode: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
                          >
                            <option value="Online Transfer">Online Transfer</option>
                            <option value="NEFT / RTGS">NEFT / RTGS Bank Transfer</option>
                            <option value="Cheque Clearance">Cheque Clearance</option>
                            <option value="IMPS / UPI Transfer">IMPS / UPI Transfer</option>
                            <option value="Letter of Credit (LC)">Letter of Credit (LC)</option>
                            <option value="Cash Payment">Cash Payment</option>
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-slate-400 uppercase tracking-widest block mb-1">Select Bank Account *</label>
                          <select 
                            value={paymentForm.bankAccount}
                            onChange={(e) => {
                              const selectedVal = e.target.value;
                              const matched = mastersList.find(m => m.category === 'Bank accounts' && (m.value === selectedVal || m.label === selectedVal));
                              setPaymentForm({
                                ...paymentForm,
                                bankAccount: selectedVal,
                                accountNumber: matched?.accountNumber || matched?.bankDetails || paymentForm.accountNumber || ''
                              });
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
                          >
                            <option value="">-- Select Bank Account --</option>
                            {mastersList.filter(m => m.category === 'Bank accounts').map((b, idx) => {
                              const bLbl = typeof b === 'string' ? b : (b?.label || b?.name || b?.value || '');
                              return (
                                <option key={`bankopt-${b.id || idx}`} value={bLbl}>
                                  {bLbl} ({b.accountNumber || b.bankDetails || 'Active'})
                                </option>
                              );
                            })}
                            {mastersList.filter(m => m.category === 'Bank accounts').length === 0 && (
                              <>
                                <option value="HDFC Bank Current Account">HDFC Bank Current Account</option>
                                <option value="State Bank of India (SBI) A/C">State Bank of India (SBI) A/C</option>
                                <option value="ICICI Bank Corporate A/C">ICICI Bank Corporate A/C</option>
                              </>
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="font-bold text-slate-400 uppercase tracking-widest block mb-1">Account Number / Bank A/C Details *</label>
                          <input 
                            type="text"
                            required
                            placeholder="e.g. 50200084920192 / HDFC0001234"
                            value={paymentForm.accountNumber}
                            onChange={(e) => setPaymentForm({...paymentForm, accountNumber: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-slate-200"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-400 uppercase tracking-widest block mb-1">Amount to be Paid (₹) *</label>
                          <input 
                            type="number"
                            required
                            placeholder="e.g. 500000"
                            value={paymentForm.amountToBePaid}
                            onChange={(e) => setPaymentForm({...paymentForm, amountToBePaid: e.target.value})}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-emerald-400 font-bold focus:border-amber-500 outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="font-bold text-slate-400 uppercase tracking-widest block mb-1">Remarks / Items Description</label>
                        <input 
                          type="text"
                          placeholder="e.g. Advance cement supply / TMT steel supply"
                          value={paymentForm.remarks}
                          onChange={(e) => setPaymentForm({...paymentForm, remarks: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
                        />
                      </div>

                      <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
                        <button type="button" onClick={() => setShowAddPaymentModal(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg cursor-pointer">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-lg shadow-md cursor-pointer">Create Entry</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

            </div>
            );
          })()}

          {/* TAB 3: LEDGER HUB (VENDOR LEDGER & PURCHASE LEDGER SUBTABS) */}
          {activeTab === 'ledgers' && (() => {
            // 1. DATA COMPUTATION FOR VENDOR LEDGER SUBTAB
            const ledgerEntries = getPassbookLedgerEntries();

            const availableSuppliers = Array.from(new Set([
              'All',
              ...defaultVendors.map(v => typeof v === 'string' ? v.trim() : String(v).trim()).filter(Boolean),
              ...grnList.map(g => (g.supplier || g.vendor || '').trim()).filter(Boolean),
              ...paymentsList.map(p => (p.vendor || p.supplier || '').trim()).filter(Boolean),
              ...mastersList.filter(m => m.category === 'Supplier' || m.category === 'Vendor').map(s => typeof s === 'string' ? s.trim() : (s?.label || s?.name || s?.value || s?.supplier || '').trim()).filter(Boolean)
            ]));

            const availableSites = Array.from(new Set([
              'All',
              ...projectsList.map(p => typeof p === 'string' ? p.trim() : (p?.name || p?.siteName || p?.site || '').trim()).filter(Boolean),
              ...mastersList.filter(m => m && (m.category === 'Site' || m.category === 'Sites' || m.category === 'Project')).map(s => typeof s === 'string' ? s.trim() : (s?.name || s?.label || s?.value || '').trim()).filter(Boolean)
            ]));

            const totalCredit = ledgerEntries.reduce((sum, e) => sum + (e.type === 'Purchase' ? (e.purchaseAmount || 0) : 0), 0);
            const totalDebit = ledgerEntries.reduce((sum, e) => sum + (e.type === 'Payment' ? (e.amountPaid || 0) : 0), 0);
            const netBalance = totalCredit - totalDebit;

            const vendorExportDataRows = [
              ...ledgerEntries.map(e => [
                formatDDMMYYYY(e.date),
                e.particulars,
                e.supplier,
                e.siteName,
                e.grnNumber,
                e.invoiceNumber,
                e.type === 'Purchase' ? `₹ ${e.purchaseAmount.toLocaleString('en-IN')}` : '₹ 0',
                e.type === 'Payment' ? `₹ ${e.amountPaid.toLocaleString('en-IN')}` : '₹ 0',
                `₹ ${e.balance.toLocaleString('en-IN')}`
              ]),
              [
                'TOTAL',
                'Consolidated Ledger Summary',
                '—',
                '—',
                '—',
                '—',
                `₹ ${totalCredit.toLocaleString('en-IN')}`,
                `₹ ${totalDebit.toLocaleString('en-IN')}`,
                `₹ ${netBalance.toLocaleString('en-IN')}`
              ]
            ];

            // 2. DATA COMPUTATION FOR PURCHASE LEDGER SUBTAB
            const purchaseEntries = getPurchaseLedgerEntries();

            const availablePurchaseVendors = Array.from(new Set([
              'All',
              ...defaultVendors.map(v => typeof v === 'string' ? v.trim() : String(v).trim()).filter(Boolean),
              ...grnList.map(g => (g.supplier || g.vendor || '').trim()).filter(Boolean),
              ...mastersList.filter(m => m.category === 'Supplier' || m.category === 'Vendor').map(s => typeof s === 'string' ? s.trim() : (s?.label || s?.name || s?.value || s?.supplier || '').trim()).filter(Boolean)
            ]));

            const availablePurchaseMaterials = Array.from(new Set([
              'All',
              ...grnList.map(g => (g.category || g.materialCategory || g.material || '').trim()).filter(Boolean),
              ...mastersList.filter(m => m.category === 'Category' || m.type === 'Category').map(m => typeof m === 'string' ? m.trim() : (m?.value || m?.name || m?.label || '').trim()).filter(Boolean)
            ]));

            const availablePurchaseSites = Array.from(new Set([
              'All',
              ...projectsList.map(p => typeof p === 'string' ? p.trim() : (p?.name || p?.siteName || p?.site || '').trim()).filter(Boolean),
              ...mastersList.filter(m => m && (m.category === 'Site' || m.category === 'Sites' || m.category === 'Project')).map(s => typeof s === 'string' ? s.trim() : (s?.name || s?.label || s?.value || '').trim()).filter(Boolean)
            ]));

            const totalPurchaseValue = purchaseEntries.reduce((sum, p) => sum + (p.purchaseValue || 0), 0);
            const totalPurchaseQty = purchaseEntries.reduce((sum, p) => sum + (p.qty || 0), 0);

            const purchaseExportDataRows = [
              ...purchaseEntries.map(p => [
                p.site,
                p.vendor,
                p.material,
                p.item,
                `₹ ${p.purchaseValue.toLocaleString('en-IN')}`,
                formatDDMMYYYY(p.date),
                p.grnNumber,
                p.invoiceNumber,
                `${p.qty} ${p.uom}`,
                `₹ ${p.rate.toLocaleString('en-IN')}`
              ]),
              [
                'TOTAL',
                'Total Filtered Purchases',
                '—',
                '—',
                `₹ ${totalPurchaseValue.toLocaleString('en-IN')}`,
                '—',
                '—',
                '—',
                `${totalPurchaseQty}`,
                '—'
              ]
            ];

            return (
              <div className="space-y-6">
                
                {/* SUBTAB NAVIGATION BAR */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 sm:p-2.5 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-white">
                  <div className="flex items-center gap-2 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
                    
                    {/* Subtab 1: Vendor Ledger Button */}
                    <button
                      type="button"
                      onClick={() => setLedgerSubTab('vendor')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                        ledgerSubTab === 'vendor'
                          ? 'bg-blue-600 text-white shadow-md border border-blue-400/40'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <BookOpen className="w-4 h-4 text-blue-300" />
                      <span>Vendor Ledger</span>
                      <span className="bg-blue-900/60 text-blue-200 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-normal">
                        {ledgerEntries.length}
                      </span>
                    </button>

                    {/* Subtab 2: Purchase Ledger Button */}
                    <button
                      type="button"
                      onClick={() => setLedgerSubTab('purchase')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                        ledgerSubTab === 'purchase'
                          ? 'bg-amber-500 text-slate-950 shadow-md border border-amber-400/40'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4 text-amber-900" />
                      <span>Purchase Ledger</span>
                      <span className="bg-amber-400/30 text-amber-950 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                        {purchaseEntries.length}
                      </span>
                    </button>

                  </div>
                </div>

                {/* ------------------------------------------------------------- */}
                {/* SUBTAB 1 VIEW: VENDOR LEDGER */}
                {/* ------------------------------------------------------------- */}
                {ledgerSubTab === 'vendor' && (
                  <div className="space-y-6">
                    
                    {/* Top Header Card */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-white">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                            <BookOpen className="w-6 h-6" />
                          </div>
                          <div>
                            <h2 className="font-extrabold text-lg text-white tracking-tight">Vendor Ledger</h2>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <ExportButton 
                            label="Export Vendor Ledger"
                            onExportExcel={() => {
                              const exportRows = ledgerEntries.map(e => [
                                formatDDMMYYYY(e.date),
                                e.particulars,
                                e.supplier,
                                e.siteName,
                                e.type === 'Payment' ? (e.paymentId || e.grnNumber) : e.grnNumber,
                                e.invoiceNumber,
                                e.type === 'Purchase' ? e.purchaseAmount : 0,
                                e.type === 'Payment' ? e.amountPaid : 0,
                                e.balance
                              ]);
                              // Append Grand Total Row at the end of the table
                              exportRows.push([
                                'GRAND TOTAL',
                                '-',
                                '-',
                                '-',
                                '-',
                                '-',
                                totalCredit,
                                totalDebit,
                                totalCredit - totalDebit
                              ]);
                              exportToExcel(
                                'Vendor Ledger Register',
                                'Vendor_Ledger',
                                ['Date', 'Particulars', 'Supplier', 'Site Name', 'GRN / Payment ID', 'Invoice Number', 'Purchase (₹)', 'Payment (₹)', 'Running Balance (₹)'],
                                exportRows,
                                ledgerFilterPreset !== 'all' ? `${ledgerFilterPreset.toUpperCase()} (${ledgerStartDate || 'Start'} to ${ledgerEndDate || 'Present'})` : 'All Time',
                                ledgerSupplierFilter !== 'All' ? ledgerSupplierFilter : 'All Suppliers'
                              );
                            }}
                            onExportPdf={() => {
                              const exportRows = ledgerEntries.map(e => [
                                formatDDMMYYYY(e.date),
                                e.particulars,
                                e.supplier,
                                e.siteName,
                                e.type === 'Payment' ? (e.paymentId || e.grnNumber) : e.grnNumber,
                                e.invoiceNumber,
                                e.type === 'Purchase' ? `₹ ${e.purchaseAmount.toLocaleString('en-IN')}` : '—',
                                e.type === 'Payment' ? `₹ ${e.amountPaid.toLocaleString('en-IN')}` : '—',
                                `₹ ${e.balance.toLocaleString('en-IN')}`
                              ]);
                              // Append Grand Total Row at the end of the table
                              exportRows.push([
                                'GRAND TOTAL',
                                '-',
                                '-',
                                '-',
                                '-',
                                '-',
                                `₹ ${totalCredit.toLocaleString('en-IN')}`,
                                `₹ ${totalDebit.toLocaleString('en-IN')}`,
                                `₹ ${(totalCredit - totalDebit).toLocaleString('en-IN')}`
                              ]);
                              exportToPDF(
                                'Vendor Ledger Register',
                                ['Date', 'Particulars', 'Supplier', 'Site Name', 'GRN / Payment ID', 'Invoice #', 'Purchase (₹)', 'Payment (₹)', 'Balance (₹)'],
                                exportRows,
                                ledgerFilterPreset !== 'all' ? `${ledgerFilterPreset.toUpperCase()} (${ledgerStartDate || 'Start'} to ${ledgerEndDate || 'Present'})` : 'All Time',
                                ledgerSupplierFilter !== 'All' ? ledgerSupplierFilter : 'All Suppliers'
                              );
                            }}
                          />
                          <span className="bg-slate-800 text-blue-400 text-xs font-mono font-bold px-3 py-1.5 rounded-xl border border-slate-700 shadow-xs">
                            {ledgerEntries.length} Entries
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Filter Retrieval Toolbar Card */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <Filter className="w-4 h-4 text-blue-600" />
                          <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Vendor Ledger Date & Scope Filters</span>
                        </div>
                        {(ledgerFilterPreset !== 'all' || ledgerStartDate || ledgerEndDate || ledgerSupplierFilter !== 'All' || ledgerSiteFilter !== 'All' || ledgerSearchQuery) && (
                          <button
                            type="button"
                            onClick={() => {
                              setLedgerFilterPreset('all');
                              setLedgerStartDate('');
                              setLedgerEndDate('');
                              setLedgerSupplierFilter('All');
                              setLedgerSiteFilter('All');
                              setLedgerSearchQuery('');
                            }}
                            className="text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg transition cursor-pointer"
                          >
                            Reset All Filters
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                        
                        {/* Filter 1: Time Period Preset Dropdown */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Date Range Preset</label>
                          <select
                            value={ledgerFilterPreset}
                            onChange={(e) => handleLedgerPresetChange(e.target.value)}
                            className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
                          >
                            <option value="all">All Time History</option>
                            <option value="daily">Daily (Today)</option>
                            <option value="weekly">Weekly (This Week)</option>
                            <option value="monthly">Monthly (This Month)</option>
                            <option value="yearly">Yearly (Financial Year)</option>
                            <option value="custom">Custom Date Range</option>
                          </select>
                        </div>

                        {/* Filter 2: From Date */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">From Date</label>
                          <input
                            type="date"
                            value={ledgerStartDate}
                            onChange={(e) => {
                              setLedgerStartDate(e.target.value);
                              setLedgerFilterPreset('custom');
                            }}
                            className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition"
                          />
                        </div>

                        {/* Filter 3: To Date */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">To Date</label>
                          <input
                            type="date"
                            value={ledgerEndDate}
                            onChange={(e) => {
                              setLedgerEndDate(e.target.value);
                              setLedgerFilterPreset('custom');
                            }}
                            className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition"
                          />
                        </div>

                        {/* Filter 4: Supplier Dropdown */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Supplier / Vendor</label>
                          <select
                            value={ledgerSupplierFilter}
                            onChange={(e) => setLedgerSupplierFilter(e.target.value)}
                            className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
                          >
                            <option value="All">All Suppliers</option>
                            {availableSuppliers.filter(s => s !== 'All').map((supp, idx) => (
                              <option key={`supp-${supp}-${idx}`} value={supp}>{supp}</option>
                            ))}
                          </select>
                        </div>

                        {/* Filter 5: Site Name Dropdown */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Site Name</label>
                          <select
                            value={ledgerSiteFilter}
                            onChange={(e) => setLedgerSiteFilter(e.target.value)}
                            className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
                          >
                            <option value="All">All Sites</option>
                            {availableSites.filter(s => s !== 'All').map((site, idx) => (
                              <option key={`lsite-${site}-${idx}`} value={site}>{site}</option>
                            ))}
                          </select>
                        </div>

                        {/* Filter 6: Keyword Search */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Search Query</label>
                          <input
                            type="text"
                            placeholder="GRN, invoice, or particulars..."
                            value={ledgerSearchQuery}
                            onChange={(e) => setLedgerSearchQuery(e.target.value)}
                            className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition placeholder-slate-400"
                          />
                        </div>

                      </div>
                    </div>

                    {/* Dynamic Net Total Summary Banner */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md text-white grid grid-cols-1 sm:grid-cols-3 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                          Purchase
                        </span>
                        <div className="text-xl font-black font-mono text-slate-100">
                          ₹ {totalCredit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </div>
                      </div>

                      <div className="flex flex-col sm:pl-6 pt-3 sm:pt-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block mb-1">
                          Payment
                        </span>
                        <div className="text-xl font-black font-mono text-emerald-400">
                          ₹ {totalDebit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </div>
                      </div>

                      <div className="flex flex-col sm:pl-6 pt-3 sm:pt-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block mb-1">
                          Outstanding
                        </span>
                        <div className="text-xl font-black font-mono text-amber-300">
                          ₹ {netBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    {/* Vendor Ledger Table Card */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 text-slate-100 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-800">
                            <tr>
                              <th className="p-3.5 pl-4">DATE</th>
                              <th className="p-3.5">PARTICULARS</th>
                              <th className="p-3.5">SUPPLIER</th>
                              <th className="p-3.5">SITE NAME</th>
                              <th className="p-3.5">GRN / PAYMENT ID</th>
                              <th className="p-3.5">INVOICE NUMBER</th>
                              <th className="p-3.5 text-right">PURCHASE (₹)</th>
                              <th className="p-3.5 text-right">PAYMENT (₹)</th>
                              <th className="p-3.5 pr-4 text-right">BALANCE (₹)</th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                            {ledgerEntries.map((entry, idx) => (
                              <tr key={entry.id ? `ledger-${entry.id}-${idx}` : `ledger-row-${idx}`} className="hover:bg-slate-50 transition">
                                
                                <td className="p-3.5 pl-4 font-mono font-bold text-slate-700 whitespace-nowrap">
                                  {formatDDMMYYYY(entry.date)}
                                </td>

                                <td className="p-3.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${
                                      entry.type === 'Purchase' 
                                        ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    }`}>
                                      {entry.type}
                                    </span>
                                    <span className="font-bold text-slate-900">{entry.particulars}</span>
                                  </div>
                                </td>

                                <td className="p-3.5 font-extrabold text-blue-900">
                                  {entry.supplier}
                                </td>

                                <td className="p-3.5 font-bold text-slate-800">
                                  {entry.siteName}
                                </td>

                                <td className="p-3.5 font-mono font-bold whitespace-nowrap">
                                  {entry.type === 'Purchase' ? (
                                    <span className="text-amber-700 font-bold">{entry.grnNumber}</span>
                                  ) : (
                                    <span className="text-emerald-600 font-bold">{entry.paymentId || entry.grnNumber}</span>
                                  )}
                                </td>

                                <td className="p-3.5 font-mono font-bold text-blue-700">
                                  {entry.invoiceNumber}
                                </td>

                                <td className="p-3.5 text-right font-mono font-extrabold text-amber-700 text-sm">
                                  {entry.type === 'Purchase' ? `₹${entry.purchaseAmount.toLocaleString('en-IN')}` : '—'}
                                </td>

                                <td className="p-3.5 text-right font-mono font-extrabold text-emerald-600 text-sm">
                                  {entry.type === 'Payment' ? `₹${entry.amountPaid.toLocaleString('en-IN')}` : '—'}
                                </td>

                                <td className="p-3.5 pr-4 text-right font-mono font-extrabold text-slate-900 text-sm">
                                  ₹{entry.balance.toLocaleString('en-IN')}
                                </td>

                              </tr>
                            ))}

                            {ledgerEntries.length === 0 && (
                              <tr>
                                <td colSpan={9} className="p-8 text-center text-slate-500 text-xs">
                                  No ledger entries match the selected filters. Change filters above to view transactions.
                                </td>
                              </tr>
                            )}
                          </tbody>

                          {/* Grand Total Footer for Vendor Ledger */}
                          {ledgerEntries.length > 0 && (
                            <tfoot className="bg-slate-900 text-white font-extrabold text-xs border-t-2 border-amber-500">
                              <tr>
                                <td colSpan={6} className="p-3.5 pl-4 uppercase tracking-wider text-amber-300">
                                  Consolidated Grand Total ({ledgerEntries.length} Ledger Transactions)
                                </td>
                                <td className="p-3.5 text-right font-mono text-sm font-black text-amber-300">
                                  ₹{totalCredit.toLocaleString('en-IN')}
                                </td>
                                <td className="p-3.5 text-right font-mono text-sm font-black text-emerald-400">
                                  ₹{totalDebit.toLocaleString('en-IN')}
                                </td>
                                <td className="p-3.5 pr-4 text-right font-mono text-base font-black text-amber-300 bg-slate-950">
                                  ₹{(totalCredit - totalDebit).toLocaleString('en-IN')}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>

                  </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* SUBTAB 2 VIEW: PURCHASE LEDGER */}
                {/* ------------------------------------------------------------- */}
                {ledgerSubTab === 'purchase' && (
                  <div className="space-y-6">
                    
                    {/* Top Header Card */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-white">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                            <ShoppingBag className="w-6 h-6" />
                          </div>
                          <div>
                            <h2 className="font-extrabold text-lg text-white tracking-tight">Purchase Ledger</h2>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <ExportButton 
                            label="Export Purchase Ledger"
                            onExportExcel={() => {
                              const exportRows = purchaseEntries.map(p => [
                                p.site,
                                p.vendor,
                                formatDDMMYYYY(p.date),
                                p.grnNumber,
                                p.invoiceNumber,
                                p.material,
                                p.item,
                                `${p.qty} ${p.uom || 'Units'}`,
                                p.rate,
                                p.purchaseValue
                              ]);
                              // Append Grand Total Row at the end of the table
                              exportRows.push([
                                'GRAND TOTAL',
                                '-',
                                '-',
                                '-',
                                '-',
                                '-',
                                '-',
                                '-',
                                '-',
                                totalPurchaseValue
                              ]);
                              exportToExcel(
                                'Purchase Ledger Register',
                                'Purchase_Ledger',
                                ['Site', 'Vendor', 'Date', 'GRN Number', 'Invoice Number', 'Material', 'Item', 'Quantity', 'Rate (₹)', 'Purchase Value (₹)'],
                                exportRows,
                                purchaseFilterPreset !== 'all' ? `${purchaseFilterPreset.toUpperCase()} (${purchaseStartDate || 'Start'} to ${purchaseEndDate || 'Present'})` : 'All Time',
                                purchaseVendorFilter !== 'All' ? purchaseVendorFilter : 'All Vendors'
                              );
                            }}
                            onExportPdf={() => {
                              const exportRows = purchaseEntries.map(p => [
                                p.site,
                                p.vendor,
                                formatDDMMYYYY(p.date),
                                p.grnNumber,
                                p.invoiceNumber,
                                p.material,
                                p.item,
                                `${p.qty} ${p.uom || 'Units'}`,
                                `₹ ${p.rate.toLocaleString('en-IN')}`,
                                `₹ ${p.purchaseValue.toLocaleString('en-IN')}`
                              ]);
                              // Append Grand Total Row at the end of the table
                              exportRows.push([
                                'GRAND TOTAL',
                                '-',
                                '-',
                                '-',
                                '-',
                                '-',
                                '-',
                                '-',
                                '-',
                                `₹ ${totalPurchaseValue.toLocaleString('en-IN')}`
                              ]);
                              exportToPDF(
                                'Purchase Ledger Register',
                                ['Site', 'Vendor', 'Date', 'GRN Number', 'Invoice Number', 'Material', 'Item', 'Quantity', 'Rate (₹)', 'Purchase Value (₹)'],
                                exportRows,
                                purchaseFilterPreset !== 'all' ? `${purchaseFilterPreset.toUpperCase()} (${purchaseStartDate || 'Start'} to ${purchaseEndDate || 'Present'})` : 'All Time',
                                purchaseVendorFilter !== 'All' ? purchaseVendorFilter : 'All Vendors'
                              );
                            }}
                          />
                          <span className="bg-slate-800 text-amber-400 text-xs font-mono font-bold px-3 py-1.5 rounded-xl border border-slate-700 shadow-xs">
                            {purchaseEntries.length} Purchases
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Filter Retrieval Toolbar Card (Vendor, Material, Site, Date Presets, Keyword Search) */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <Filter className="w-4 h-4 text-amber-500" />
                          <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Purchase Scope & Material Filters</span>
                        </div>
                        {(purchaseFilterPreset !== 'all' || purchaseStartDate || purchaseEndDate || purchaseVendorFilter !== 'All' || purchaseMaterialFilter !== 'All' || purchaseSiteFilter !== 'All' || purchaseSearchQuery) && (
                          <button
                            type="button"
                            onClick={() => {
                              setPurchaseFilterPreset('all');
                              setPurchaseStartDate('');
                              setPurchaseEndDate('');
                              setPurchaseVendorFilter('All');
                              setPurchaseMaterialFilter('All');
                              setPurchaseSiteFilter('All');
                              setPurchaseSearchQuery('');
                            }}
                            className="text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg transition cursor-pointer"
                          >
                            Reset All Filters
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                        
                        {/* Filter 1: Vendor Dropdown (Requested) */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider block flex items-center gap-1">
                            <span>Vendor Filter</span>
                            <span className="text-amber-500">*</span>
                          </label>
                          <select
                            value={purchaseVendorFilter}
                            onChange={(e) => setPurchaseVendorFilter(e.target.value)}
                            className="w-full font-bold text-slate-900 border border-slate-300 bg-amber-50/40 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-amber-500 outline-none transition cursor-pointer"
                          >
                            <option value="All">All Vendors</option>
                            {availablePurchaseVendors.filter(v => v !== 'All').map((vendor, idx) => (
                              <option key={`pvendor-${vendor}-${idx}`} value={vendor}>{vendor}</option>
                            ))}
                          </select>
                        </div>

                        {/* Filter 2: Material Category Dropdown (Requested) */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider block flex items-center gap-1">
                            <span>Material Filter</span>
                            <span className="text-amber-500">*</span>
                          </label>
                          <select
                            value={purchaseMaterialFilter}
                            onChange={(e) => setPurchaseMaterialFilter(e.target.value)}
                            className="w-full font-bold text-slate-900 border border-slate-300 bg-amber-50/40 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-amber-500 outline-none transition cursor-pointer"
                          >
                            <option value="All">All Materials</option>
                            {availablePurchaseMaterials.filter(m => m !== 'All').map((mat, idx) => (
                              <option key={`pmat-${mat}-${idx}`} value={mat}>{mat}</option>
                            ))}
                          </select>
                        </div>

                        {/* Filter 3: Site Dropdown */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Site / Project</label>
                          <select
                            value={purchaseSiteFilter}
                            onChange={(e) => setPurchaseSiteFilter(e.target.value)}
                            className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-amber-500 outline-none transition cursor-pointer"
                          >
                            <option value="All">All Sites</option>
                            {availablePurchaseSites.filter(s => s !== 'All').map((site, idx) => (
                              <option key={`psite-${site}-${idx}`} value={site}>{site}</option>
                            ))}
                          </select>
                        </div>

                        {/* Filter 4: Date Preset */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Time Preset</label>
                          <select
                            value={purchaseFilterPreset}
                            onChange={(e) => handlePurchasePresetChange(e.target.value)}
                            className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-amber-500 outline-none transition cursor-pointer"
                          >
                            <option value="all">All Time</option>
                            <option value="daily">Daily (Today)</option>
                            <option value="weekly">Weekly (This Week)</option>
                            <option value="monthly">Monthly (This Month)</option>
                            <option value="yearly">Financial Year</option>
                            <option value="custom">Custom Range</option>
                          </select>
                        </div>

                        {/* Filter 5: Date Range Inputs */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Date Range</label>
                          <div className="grid grid-cols-2 gap-1">
                            <input
                              type="date"
                              value={purchaseStartDate}
                              onChange={(e) => {
                                setPurchaseStartDate(e.target.value);
                                setPurchaseFilterPreset('custom');
                              }}
                              className="w-full font-semibold text-[11px] text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-lg p-1.5 focus:ring-2 focus:ring-amber-500 outline-none transition"
                            />
                            <input
                              type="date"
                              value={purchaseEndDate}
                              onChange={(e) => {
                                setPurchaseEndDate(e.target.value);
                                setPurchaseFilterPreset('custom');
                              }}
                              className="w-full font-semibold text-[11px] text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-lg p-1.5 focus:ring-2 focus:ring-amber-500 outline-none transition"
                            />
                          </div>
                        </div>

                        {/* Filter 6: Search Query */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Search Item / GRN</label>
                          <input
                            type="text"
                            placeholder="Item, vendor, GRN #..."
                            value={purchaseSearchQuery}
                            onChange={(e) => setPurchaseSearchQuery(e.target.value)}
                            className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-amber-500 outline-none transition placeholder-slate-400"
                          />
                        </div>

                      </div>
                    </div>

                    {/* Key Purchase Metrics Banner */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      
                      {/* Metric 1: Total Purchase Value */}
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md text-white">
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block mb-0.5">
                          Total Purchase Value
                        </span>
                        <div className="text-2xl font-black font-mono text-amber-300">
                          ₹ {totalPurchaseValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1 block">
                          Across filtered materials & sites
                        </span>
                      </div>

                      {/* Metric 2: Total Purchase Entries Count */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-slate-900">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-0.5">
                          Total Procurement Entries
                        </span>
                        <div className="text-2xl font-black font-mono text-slate-800">
                          {purchaseEntries.length}
                        </div>
                        <span className="text-[11px] text-slate-500 mt-1 block">
                          GRN receipts & deliveries
                        </span>
                      </div>

                      {/* Metric 3: Active Vendor Scope */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-slate-900">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 block mb-0.5">
                          Active Vendors in View
                        </span>
                        <div className="text-2xl font-black font-mono text-blue-900">
                          {new Set(purchaseEntries.map(p => p.vendor)).size}
                        </div>
                        <span className="text-[11px] text-slate-500 mt-1 block truncate">
                          {purchaseVendorFilter !== 'All' ? purchaseVendorFilter : 'All active vendors'}
                        </span>
                      </div>

                      {/* Metric 4: Active Material Types */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-slate-900">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 block mb-0.5">
                          Material Categories in View
                        </span>
                        <div className="text-2xl font-black font-mono text-emerald-900">
                          {new Set(purchaseEntries.map(p => p.material)).size}
                        </div>
                        <span className="text-[11px] text-slate-500 mt-1 block truncate">
                          {purchaseMaterialFilter !== 'All' ? purchaseMaterialFilter : 'All active categories'}
                        </span>
                      </div>

                    </div>

                    {/* Purchase Ledger Table (Columns: Site, Vendor, Date, GRN Number, Invoice Number, Material, Item, Quantity, Rate, Purchase Value) */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 text-slate-100 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-800">
                            <tr>
                              <th className="p-3.5 pl-4">SITE</th>
                              <th className="p-3.5">VENDOR</th>
                              <th className="p-3.5 text-center">DATE</th>
                              <th className="p-3.5 font-mono">GRN NUMBER</th>
                              <th className="p-3.5 font-mono">INVOICE NUMBER</th>
                              <th className="p-3.5">MATERIAL</th>
                              <th className="p-3.5">ITEM</th>
                              <th className="p-3.5 text-right">QUANTITY</th>
                              <th className="p-3.5 text-right">RATE (₹)</th>
                              <th className="p-3.5 pr-4 text-right font-black text-amber-300">PURCHASE VALUE (₹)</th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                            {purchaseEntries.map((p, idx) => (
                              <tr key={p.id ? `purch-${p.id}-${idx}` : `purch-row-${idx}`} className="hover:bg-amber-50/30 transition">
                                
                                {/* 1. SITE COLUMN */}
                                <td className="p-3.5 pl-4 font-bold text-slate-900 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span>{p.site}</span>
                                  </div>
                                </td>

                                {/* 2. VENDOR COLUMN */}
                                <td className="p-3.5 font-extrabold text-blue-900 whitespace-nowrap">
                                  {p.vendor}
                                </td>

                                {/* 3. DATE */}
                                <td className="p-3.5 text-center font-mono font-semibold text-slate-700 whitespace-nowrap">
                                  {formatDDMMYYYY(p.date)}
                                </td>

                                {/* 4. GRN NUMBER */}
                                <td className="p-3.5 font-mono font-bold text-amber-700 whitespace-nowrap">
                                  {p.grnNumber}
                                </td>

                                {/* 5. INVOICE NUMBER */}
                                <td className="p-3.5 font-mono font-bold text-blue-700 whitespace-nowrap">
                                  {p.invoiceNumber}
                                </td>

                                {/* 6. MATERIAL COLUMN */}
                                <td className="p-3.5">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-300">
                                    <Tag className="w-3 h-3 text-slate-500" />
                                    <span>{p.material}</span>
                                  </span>
                                </td>

                                {/* 7. ITEM COLUMN */}
                                <td className="p-3.5 font-bold text-slate-800">
                                  {p.item}
                                </td>

                                {/* 8. QUANTITY */}
                                <td className="p-3.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                  {p.qty.toLocaleString('en-IN')} {p.uom}
                                </td>

                                {/* 9. RATE */}
                                <td className="p-3.5 text-right font-mono text-slate-600 whitespace-nowrap">
                                  ₹{p.rate.toLocaleString('en-IN')}
                                </td>

                                {/* 10. PURCHASE VALUE COLUMN */}
                                <td className="p-3.5 pr-4 text-right font-mono font-black text-amber-700 text-sm whitespace-nowrap bg-amber-50/40">
                                  ₹{p.purchaseValue.toLocaleString('en-IN')}
                                </td>

                              </tr>
                            ))}

                            {purchaseEntries.length === 0 && (
                              <tr>
                                <td colSpan={10} className="p-10 text-center text-slate-500 text-xs">
                                  <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                  <p className="font-bold text-slate-700 mb-1">No purchase entries match the selected filters.</p>
                                  <p className="text-slate-400 text-[11px]">Adjust your Vendor, Material, or Date Range filters to view procurement records.</p>
                                </td>
                              </tr>
                            )}
                          </tbody>

                          {/* Table Footer with Summary Total */}
                          {purchaseEntries.length > 0 && (
                            <tfoot className="bg-slate-900 text-white font-extrabold text-xs border-t-2 border-amber-500">
                              <tr>
                                <td colSpan={7} className="p-3.5 pl-4 uppercase tracking-wider text-amber-300">
                                  Consolidated Total Purchase Value ({purchaseEntries.length} Items)
                                </td>
                                <td className="p-3.5 text-right font-mono font-bold text-slate-200">
                                  {totalPurchaseQty.toLocaleString('en-IN')} Units
                                </td>
                                <td className="p-3.5 text-right font-mono text-slate-400">
                                  —
                                </td>
                                <td className="p-3.5 pr-4 text-right font-mono text-base font-black text-amber-300 bg-slate-950">
                                  ₹{totalPurchaseValue.toLocaleString('en-IN')}
                                </td>
                              </tr>
                            </tfoot>
                          )}

                        </table>
                      </div>
                    </div>

                  </div>
                )}

              </div>
            );
          })()}

          {/* TAB 4: IMPORT EXCEL / CSV */}
          {activeTab === 'excel' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                <FileSpreadsheet className="w-6 h-6 text-amber-500" />
                <div>
                  <h2 className="font-bold text-slate-800 text-sm">Manager Excel / CSV Bulk Data Import Hub</h2>
                  <p className="text-xs text-slate-500">Bulk upload Ledgers, Payments, and Masters sheets directly into the portal.</p>
                </div>
              </div>

              <div className="border-2 border-dashed border-amber-300 bg-amber-50/50 rounded-xl p-8 text-center">
                <UploadCloud className="w-10 h-10 text-amber-500 mx-auto mb-2" />
                <p className="font-bold text-slate-800 text-sm mb-1">Drag and drop Ledger or Payment Excel files here</p>
                <p className="text-xs text-slate-500 mb-4">Supports .xlsx, .xls, and .csv data sheets</p>
                <button 
                  type="button" 
                  onClick={() => openImportModal('Ledger & Payment Sheet', handleImportLedgers, 'vendor, project, type, openingBalance, creditLimit', [])}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-6 py-2.5 rounded-lg text-xs uppercase tracking-wider cursor-pointer shadow-sm transition"
                >
                  Import Ledger & Payment Sheet
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: TOTAL GRN ACCESS */}
          {activeTab === 'grn' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>GRN Master Log</span>
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openImportModal('Material GRN Entries', handleImportGrns, 'grnNumber, projectName, supplier, category, itemName, qty, rate, grandTotal', [])}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-3 py-1 rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Import CSV</span>
                  </button>
                  <span className="bg-slate-800 text-amber-300 text-[10px] font-mono px-2 py-0.5 rounded">
                    {grnList.length} Records
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-500 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-3 pl-4">GRN #</th>
                      <th className="p-3">Project Site</th>
                      <th className="p-3">Category / Supplier</th>
                      <th className="p-3">Item Description</th>
                      <th className="p-3">Qty / Rate</th>
                      <th className="p-3 text-right">Grand Total</th>
                      <th className="p-3 text-center">Payment Status</th>
                      <th className="p-3 text-right">Paid / Balance</th>
                      <th className="p-3 pr-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {grnList.length === 0 ? (
                      <tr><td colSpan="9" className="p-6 text-center text-slate-400 italic">No GRN records logged yet.</td></tr>
                    ) : (
                      grnList.map((log, idx) => {
                        const gTot = parseNum(log.grandTotal);
                        const matchPay = paymentsList.find(p => (p.grnNumber && p.grnNumber === log.grnNumber) || (p.invoiceNo && p.invoiceNo === log.grnNumber));
                        const paidVal = parseNum(log.paidAmount !== undefined ? log.paidAmount : (matchPay ? matchPay.paid : 0));
                        const balVal = Math.max(0, gTot - paidVal);
                        let pStatus = log.paymentStatus || (matchPay ? matchPay.status : (balVal <= 0 && gTot > 0 ? 'Paid' : (paidVal > 0 ? 'Partial' : 'Pending')));
                        const targetGrnId = log.id || log.grnNumber;

                        return (
                          <tr key={log.id ? `grn-${log.id}-${idx}` : `grn-row-${idx}`} className="hover:bg-amber-50/20">
                            <td className="p-3 pl-4 font-mono font-bold text-slate-900">{log.grnNumber}</td>
                            <td className="p-3 text-slate-800">{log.projectName}</td>
                            <td className="p-3">
                              <div className="text-slate-800 font-semibold">{log.category || 'General'}</div>
                              <div className="text-[10px] text-slate-400">{log.supplier}</div>
                            </td>
                            <td className="p-3 text-slate-700">{log.itemName}</td>
                            <td className="p-3">
                              <div className="font-bold">{log.qty} {log.uom}</div>
                              <div className="text-[10px] text-slate-400">@ ₹{log.rate}</div>
                            </td>
                            <td className="p-3 text-right font-mono font-extrabold text-amber-700 text-sm">
                              {log.grandTotal}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                pStatus === 'Paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                                pStatus === 'Partial' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                'bg-rose-100 text-rose-800 border border-rose-300'
                              }`}>
                                {pStatus}
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono text-xs">
                              <div className="text-emerald-700 font-bold">Paid: ₹{paidVal.toLocaleString('en-IN')}</div>
                              <div className="text-amber-800 font-semibold text-[11px]">Bal: ₹{balVal.toLocaleString('en-IN')}</div>
                            </td>
                            <td className="p-3 pr-4 text-center">
                              <button
                                onClick={() => handleDeleteGrn(log.id, log.grnNumber)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                title={`Delete GRN ${log.grnNumber}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
