"use client";
import { useState, useEffect } from 'react';

import { SYNC_KEYS, fetchStorageData, saveStorageData, appendSingleRecord, notifyDataSync, markGrnAsLocallyCreated, broadcastGrnRealtime } from '@/lib/dataSync';
import TableImportModal from '@/components/TableImportModal';
import ResetDataModal from '@/components/ResetDataModal';
import BackupButton from '@/components/BackupButton';
import ExportButton from '@/components/ExportButton';
import { safeSetItem } from '@/lib/storageHelper';
import { FileText, Calculator, UploadCloud, CheckCircle, AlertTriangle, LogOut, RefreshCcw, RotateCcw, LayoutDashboard, UserPlus, PieChart, Wallet, History, FileSpreadsheet, PlusCircle, IndianRupee, Printer, Download, Filter, Calendar, Search, Menu, X, Pencil, Database, Building2, ChevronDown } from 'lucide-react';

export default function AssistantDashboard({ onNavigate, currentUser, onLogout, onOpenSheetsModal, onOpenCompanyModal, sheetsState }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('grn-logging');
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
  const [projects, setProjects] = useState([]);
  const [masters, setMasters] = useState({ Category: [], Supplier: [], UOM: [] });
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [grnLogs, setGrnLogs] = useState([]);
  const [ledgersList, setLedgersList] = useState([]);
  const [editingGrn, setEditingGrn] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetDataModal, setShowResetDataModal] = useState(false);
  // Raw masters list for subcategory filtering and supplier lookup
  const [rawMastersList, setRawMastersList] = useState([]);

  // Assistant Vendor Ledger Form State
  const [ledgerForm, setLedgerForm] = useState({
    date: new Date().toISOString().split('T')[0],
    vendor: '',
    project: '',
    category: 'Materials',
    item: 'Cement (OPC / PPC)',
    invoiceNumber: '',
    invoiceAmount: '',
    remarks: ''
  });

  // Filters State for GRN History
  const [filterPreset, setFilterPreset] = useState('all'); // 'all' | 'daily' | 'weekly' | 'monthly' | 'fy' | 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState('');

  const [notification, setNotification] = useState({ type: '', msg: '' });

  // Import Modal State
  const [importModalConfig, setImportModalConfig] = useState({
    isOpen: false,
    tableName: '',
    onImport: () => {},
    sampleCsv: '',
    sampleRows: []
  });

  const handleResetComplete = ({ mode }) => {
    setGrnLogs([]);
    setLedgersList([]);
    if (mode === 'factory') {
      setProjects([]);
      setMasters({ Category: [], Supplier: [], UOM: [] });
    }
  };

  // Default Construction Master Items list
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

  // Helper to calculate auto-incrementing GRN number for accounting year (e.g. 26-27/001)
  const calculateNextGrnNumber = (logsList, dateStr) => {
    const fyCode = getFinancialYearCode(dateStr); // e.g. "26-27"
    const prefix = `${fyCode}/`;
    
    let maxSeq = 0;
    if (Array.isArray(logsList)) {
      logsList.forEach(log => {
        const numStr = String(log.grnNumber || '');
        if (numStr.includes(prefix)) {
          const parts = numStr.split(prefix);
          if (parts.length > 1) {
            const seqVal = parseInt(parts[1], 10);
            if (!isNaN(seqVal) && seqVal > maxSeq) {
              maxSeq = seqVal;
            }
          }
        }
      });
    }
    const nextSeq = String(maxSeq + 1).padStart(3, '0');
    return `${fyCode}/${nextSeq}`;
  };

  // Form State initialized clean
  const [formData, setFormData] = useState({
    projectName: '',
    grnNumber: '26-27/001',
    grnDate: new Date().toISOString().split('T')[0],
    dcNumber: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    category: '',
    supplier: '',
    supplierAddress: '',
    supplierGstNo: '',
    supplierBankDetails: '',
    itemName: '',
    uom: '',
    qty: '',
    rate: '',
    otherCharges: '0',
    cgst: '9',
    sgst: '9',
    igst: '0'
  });

  const getSupplierMasterDetails = (selectedSupplier) => {
    if (!selectedSupplier || !selectedSupplier.trim()) return null;
    const cleanSel = selectedSupplier.trim().toLowerCase();
    const mList = (rawMastersList && rawMastersList.length > 0) ? rawMastersList : (fetchStorageData(SYNC_KEYS.MASTERS) || []);
    
    // First try exact match among Supplier/Vendor records
    let match = mList.find(m => {
      if (!m) return false;
      const isSupp = m.category === 'Supplier' || m.category === 'Vendor' || m.type === 'Supplier' || m.type === 'Vendor';
      if (!isSupp) return false;
      const name = (typeof m === 'string' ? m : (m.label || m.name || m.value || m.supplierName || m.supplier || m.partyName || m.vendor || '')).trim().toLowerCase();
      return name === cleanSel;
    });

    // Fallback: match any master record whose label/name equals cleanSel
    if (!match) {
      match = mList.find(m => {
        if (!m) return false;
        const name = (typeof m === 'string' ? m : (m.label || m.name || m.value || m.supplierName || m.supplier || m.partyName || m.vendor || '')).trim().toLowerCase();
        return name === cleanSel;
      });
    }
    return match || null;
  };

  const extractSupplierGSTRates = (suppObj) => {
    if (!suppObj) return { cgst: '9', sgst: '9', igst: '0' };

    let cgstVal = '';
    let sgstVal = '';
    let igstVal = '';

    if (suppObj.cgst !== undefined && suppObj.cgst !== null && String(suppObj.cgst).trim() !== '') {
      cgstVal = String(suppObj.cgst).trim();
    } else if (suppObj.CGST !== undefined && suppObj.CGST !== null && String(suppObj.CGST).trim() !== '') {
      cgstVal = String(suppObj.CGST).trim();
    } else if (suppObj.cgstPct !== undefined && suppObj.cgstPct !== null && String(suppObj.cgstPct).trim() !== '') {
      cgstVal = String(suppObj.cgstPct).trim();
    } else if (suppObj.cgst_pct !== undefined && suppObj.cgst_pct !== null && String(suppObj.cgst_pct).trim() !== '') {
      cgstVal = String(suppObj.cgst_pct).trim();
    } else if (suppObj.cgstRate !== undefined && suppObj.cgstRate !== null && String(suppObj.cgstRate).trim() !== '') {
      cgstVal = String(suppObj.cgstRate).trim();
    }

    if (suppObj.sgst !== undefined && suppObj.sgst !== null && String(suppObj.sgst).trim() !== '') {
      sgstVal = String(suppObj.sgst).trim();
    } else if (suppObj.SGST !== undefined && suppObj.SGST !== null && String(suppObj.SGST).trim() !== '') {
      sgstVal = String(suppObj.SGST).trim();
    } else if (suppObj.sgstPct !== undefined && suppObj.sgstPct !== null && String(suppObj.sgstPct).trim() !== '') {
      sgstVal = String(suppObj.sgstPct).trim();
    } else if (suppObj.sgst_pct !== undefined && suppObj.sgst_pct !== null && String(suppObj.sgst_pct).trim() !== '') {
      sgstVal = String(suppObj.sgst_pct).trim();
    } else if (suppObj.sgstRate !== undefined && suppObj.sgstRate !== null && String(suppObj.sgstRate).trim() !== '') {
      sgstVal = String(suppObj.sgstRate).trim();
    }

    if (suppObj.igst !== undefined && suppObj.igst !== null && String(suppObj.igst).trim() !== '') {
      igstVal = String(suppObj.igst).trim();
    } else if (suppObj.IGST !== undefined && suppObj.IGST !== null && String(suppObj.IGST).trim() !== '') {
      igstVal = String(suppObj.IGST).trim();
    } else if (suppObj.igstPct !== undefined && suppObj.igstPct !== null && String(suppObj.igstPct).trim() !== '') {
      igstVal = String(suppObj.igstPct).trim();
    } else if (suppObj.igst_pct !== undefined && suppObj.igst_pct !== null && String(suppObj.igst_pct).trim() !== '') {
      igstVal = String(suppObj.igst_pct).trim();
    } else if (suppObj.igstRate !== undefined && suppObj.igstRate !== null && String(suppObj.igstRate).trim() !== '') {
      igstVal = String(suppObj.igstRate).trim();
    }

    // Check if unified total GST % was defined on supplier (e.g. 18 -> CGST 9%, SGST 9%)
    const totalGst = suppObj.gstPct || suppObj.gstRate || suppObj.gst || suppObj['GST %'] || suppObj.taxRate;
    if (cgstVal === '' && sgstVal === '' && totalGst !== undefined && totalGst !== null && String(totalGst).trim() !== '') {
      const totalNum = Number(totalGst) || 0;
      if (igstVal !== '' && Number(igstVal) > 0) {
        cgstVal = '0';
        sgstVal = '0';
      } else {
        cgstVal = String(totalNum / 2);
        sgstVal = String(totalNum / 2);
        if (igstVal === '') igstVal = '0';
      }
    }

    // Default to standard 9% CGST, 9% SGST, 0% IGST if unassigned
    if (cgstVal === '' && sgstVal === '' && igstVal === '') {
      cgstVal = '9';
      sgstVal = '9';
      igstVal = '0';
    } else {
      if (cgstVal === '') cgstVal = '0';
      if (sgstVal === '') sgstVal = '0';
      if (igstVal === '') igstVal = '0';
    }

    return { cgst: cgstVal, sgst: sgstVal, igst: igstVal };
  };

  const handleSupplierChange = (selectedSupplier) => {
    if (!selectedSupplier || !selectedSupplier.trim()) {
      setFormData(prev => ({
        ...prev,
        supplier: '',
        supplierAddress: '',
        supplierGstNo: '',
        supplierBankDetails: '',
        cgst: '9',
        sgst: '9',
        igst: '0'
      }));
      return;
    }

    const suppObj = getSupplierMasterDetails(selectedSupplier);

    if (suppObj) {
      const { cgst: cgstVal, sgst: sgstVal, igst: igstVal } = extractSupplierGSTRates(suppObj);

      setFormData(prev => ({
        ...prev,
        supplier: selectedSupplier,
        supplierAddress: suppObj.supplierAddress || suppObj.address || '',
        supplierGstNo: suppObj.gstNumber || suppObj.gstNo || suppObj.gstin || suppObj.GSTIN || '',
        supplierBankDetails: suppObj.bankDetails || suppObj.bankAccount || suppObj.accountNumber || '',
        cgst: cgstVal,
        sgst: sgstVal,
        igst: igstVal
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        supplier: selectedSupplier,
        supplierAddress: '',
        supplierGstNo: '',
        supplierBankDetails: '',
        cgst: '9',
        sgst: '9',
        igst: '0'
      }));
    }
  };

  const handleEditSupplierChange = (selectedSupplier) => {
    if (!editingGrn) return;
    if (!selectedSupplier || !selectedSupplier.trim()) {
      setEditingGrn(prev => ({
        ...prev,
        supplier: '',
        supplierAddress: '',
        supplierGstNo: '',
        supplierBankDetails: ''
      }));
      return;
    }

    const suppObj = getSupplierMasterDetails(selectedSupplier);

    if (suppObj) {
      const { cgst: cgstVal, sgst: sgstVal, igst: igstVal } = extractSupplierGSTRates(suppObj);

      setEditingGrn(prev => ({
        ...prev,
        supplier: selectedSupplier,
        supplierAddress: suppObj.supplierAddress || suppObj.address || prev.supplierAddress || '',
        supplierGstNo: suppObj.gstNumber || suppObj.gstNo || suppObj.gstin || suppObj.GSTIN || prev.supplierGstNo || '',
        supplierBankDetails: suppObj.bankDetails || suppObj.bankAccount || suppObj.accountNumber || prev.supplierBankDetails || '',
        cgst: cgstVal,
        sgst: sgstVal,
        igst: igstVal
      }));
    } else {
      setEditingGrn(prev => ({
        ...prev,
        supplier: selectedSupplier
      }));
    }
  };

  // Auto-synchronize GST percentages if supplier is selected and masters load/update
  useEffect(() => {
    if (formData.supplier) {
      const suppObj = getSupplierMasterDetails(formData.supplier);
      if (suppObj) {
        const { cgst: cgstVal, sgst: sgstVal, igst: igstVal } = extractSupplierGSTRates(suppObj);
        setFormData(prev => {
          // Only update if rates or details are updated from master
          if (prev.cgst === cgstVal && prev.sgst === sgstVal && prev.igst === igstVal && prev.supplierGstNo === (suppObj.gstNumber || suppObj.gstNo || suppObj.gstin || '')) {
            return prev;
          }
          return {
            ...prev,
            cgst: cgstVal,
            sgst: sgstVal,
            igst: igstVal,
            supplierAddress: suppObj.supplierAddress || suppObj.address || prev.supplierAddress,
            supplierGstNo: suppObj.gstNumber || suppObj.gstNo || suppObj.gstin || suppObj.GSTIN || prev.supplierGstNo,
            supplierBankDetails: suppObj.bankDetails || suppObj.bankAccount || suppObj.accountNumber || prev.supplierBankDetails
          };
        });
      }
    }
  }, [rawMastersList, formData.supplier]);

  useEffect(() => {
    fetchMasterData();
    const loadedGrns = fetchStorageData(SYNC_KEYS.GRN);
    setGrnLogs(loadedGrns);

    // Initialize auto GRN number
    const autoGrn = calculateNextGrnNumber(loadedGrns, new Date().toISOString().split('T')[0]);
    setFormData(prev => ({ ...prev, grnNumber: autoGrn }));

    const handleSync = () => {
      fetchMasterData();
      loadGrnLogs();
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

  // Recalculate auto GRN number whenever date or grnLogs change
  useEffect(() => {
    const autoGrn = calculateNextGrnNumber(grnLogs, formData.grnDate);
    setFormData(prev => ({ ...prev, grnNumber: autoGrn }));
  }, [formData.grnDate, grnLogs]);

  const openImportModal = (tableName, onImportHandler, sampleCsv, sampleRows) => {
    setImportModalConfig({
      isOpen: true,
      tableName,
      onImport: onImportHandler,
      sampleCsv,
      sampleRows
    });
  };

  const fetchMasterData = async () => {
    setLoadingData(true);
    const pArr = fetchStorageData(SYNC_KEYS.PROJECTS) || [];
    const mArr = fetchStorageData(SYNC_KEYS.MASTERS) || [];

    setProjects(pArr);
    setRawMastersList(mArr);

    // Extract ONLY Categories created by the Manager in Diamond Masters
    const categoriesOnly = (Array.isArray(mArr) ? mArr : [])
      .filter(item => item && (item.category === 'Category' || item.type === 'Category'))
      .map(item => typeof item === 'string' ? item.trim() : (item?.label || item?.name || item?.value || '').trim())
      .filter(Boolean);

    // Extract ONLY Suppliers created by the Manager in Diamond Masters
    const suppliersOnly = (Array.isArray(mArr) ? mArr : [])
      .filter(item => item && (item.category === 'Supplier' || item.category === 'Vendor' || item.type === 'Supplier' || item.type === 'Vendor'))
      .map(item => typeof item === 'string' ? item.trim() : (item?.label || item?.name || item?.value || item?.supplierName || item?.supplier || '').trim())
      .filter(Boolean);

    // Extract ONLY UOMs created by the Manager in Diamond Masters
    const uomOnly = (Array.isArray(mArr) ? mArr : [])
      .filter(item => item && (item.category === 'UOM' || item.type === 'UOM' || item.category === 'Unit' || item.type === 'Unit'))
      .map(item => typeof item === 'string' ? item.trim() : (item?.label || item?.name || item?.value || item?.unit || '').trim())
      .filter(Boolean);

    setMasters({
      Category: Array.from(new Set(categoriesOnly)),
      Supplier: Array.from(new Set(suppliersOnly)),
      UOM: Array.from(new Set(uomOnly))
    });
    setLoadingData(false);
  };

  const getFilteredItemOptions = (selectedCategory) => {
    // Check both state rawMastersList and persistent local storage
    const mList = (rawMastersList && rawMastersList.length > 0) ? rawMastersList : (fetchStorageData(SYNC_KEYS.MASTERS) || []);

    // Get subcategories created by the manager in Diamond Masters ONLY
    const subcategoryMasters = (mList || []).filter(m => {
      if (!m) return false;
      const cat = m.category || m.type;
      return cat === 'Subcategory' || cat === 'Item';
    });

    if (!selectedCategory || !String(selectedCategory).trim()) {
      // If no category selected yet, return all subcategories created by manager in Diamond Masters
      const allSubcategories = subcategoryMasters
        .map(m => typeof m === 'string' ? m.trim() : (m?.label || m?.value || m?.name || '').trim())
        .filter(Boolean);
      return Array.from(new Set(allSubcategories));
    }

    const selCatLower = String(selectedCategory).trim().toLowerCase();

    // Filter subcategories where parent category pairs with selected category
    const matchedItems = subcategoryMasters
      .filter(m => {
        const parentCat = String(m.parentCategory || m.parent_category || m.category_name || m.parent || '').trim().toLowerCase();
        if (!parentCat) return false;
        if (parentCat === selCatLower) return true;
        if (selCatLower.includes(parentCat) || parentCat.includes(selCatLower)) return true;
        return false;
      })
      .map(m => typeof m === 'string' ? m.trim() : (m?.label || m?.value || m?.name || '').trim())
      .filter(Boolean);

    // Return strictly the subcategories created by manager for that category
    return Array.from(new Set(matchedItems));
  };

  const loadGrnLogs = () => {
    const data = fetchStorageData(SYNC_KEYS.GRN);
    setGrnLogs(data);
  };

  const loadLedgers = () => {
    setLedgersList(fetchStorageData(SYNC_KEYS.LEDGERS));
  };

  const handlePresetChange = (preset) => {
    setFilterPreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'daily') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'weekly') {
      const startOfWeek = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      setStartDate(startOfWeek.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === 'monthly') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(startOfMonth.toISOString().split('T')[0]);
      setEndDate(endOfMonth.toISOString().split('T')[0]);
    } else if (preset === 'fy') {
      const month = today.getMonth() + 1;
      const year = today.getFullYear();
      const fyStartYear = month >= 4 ? year : year - 1;
      setStartDate(`${fyStartYear}-04-01`);
      setEndDate(`${fyStartYear + 1}-03-31`);
    }
  };

  const calculateGstForLog = (log) => {
    const qty = Number(log.qty) || 0;
    const rate = Number(log.rate) || 0;
    const otherCharges = Number(log.otherCharges) || 0;
    const base = (qty * rate) + otherCharges;

    const cgstPct = log.cgst !== undefined ? Number(log.cgst) : 9;
    const sgstPct = log.sgst !== undefined ? Number(log.sgst) : 9;
    const igstPct = log.igst !== undefined ? Number(log.igst) : 0;
    const totalGstPct = cgstPct + sgstPct + igstPct;

    if (totalGstPct > 0 && base > 0) {
      return base * (totalGstPct / 100);
    }

    const parseVal = (v) => typeof v === 'number' ? v : Number(String(v || '').replace(/[^0-9.-]+/g, '')) || 0;
    const grandTotal = parseVal(log.grandTotal);
    if (grandTotal > base && base > 0) {
      return grandTotal - base;
    }
    return 0;
  };

  const filteredGrnLogs = grnLogs.filter(log => {
    const logDateStr = log.grnDate || (log.created_at ? log.created_at.split('T')[0] : '');

    if (startDate && logDateStr < startDate) return false;
    if (endDate && logDateStr > endDate) return false;

    if (filterProject && log.projectName !== filterProject) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const grnNo = String(log.grnNumber || '').toLowerCase();
      const proj = String(log.projectName || '').toLowerCase();
      const supp = String(log.supplier || '').toLowerCase();
      const item = String(log.itemName || '').toLowerCase();
      const cat = String(log.category || '').toLowerCase();

      if (!grnNo.includes(q) && !proj.includes(q) && !supp.includes(q) && !item.includes(q) && !cat.includes(q)) {
        return false;
      }
    }

    return true;
  });

  // Export Utilities for CSV and PDF
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
        <div class="footer">Verified Accounting Document | ROYALGOKUL CONSTRUCTIONS PVT LTD Interconnected Portal</div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // LIVE TAX CALCULATOR MATRIX WITH OTHER CHARGES & IGST
  const calculateTaxValues = () => {
    const itemBase = (Number(formData.qty) || 0) * (Number(formData.rate) || 0);
    const otherCharges = Number(formData.otherCharges) || 0;
    const totalBaseValue = itemBase + otherCharges; // Base value including other charges

    const cgstPct = Number(formData.cgst) || 0;
    const sgstPct = Number(formData.sgst) || 0;
    const igstPct = Number(formData.igst) || 0;

    const cgstVal = totalBaseValue * (cgstPct / 100);
    const sgstVal = totalBaseValue * (sgstPct / 100);
    const igstVal = totalBaseValue * (igstPct / 100);
    const totalTax = cgstVal + sgstVal + igstVal;

    return { itemBase, otherCharges, totalBaseValue, cgstVal, sgstVal, igstVal, totalTax };
  };

  const calculateGrandTotalNumeric = () => {
    const { totalBaseValue, totalTax } = calculateTaxValues();
    return totalBaseValue + totalTax;
  };

  const calculateGrandTotalFormatted = () => {
    const total = calculateGrandTotalNumeric();
    return total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
  };

  const submitGRN = async (e) => {
    e.preventDefault();
    if (!formData.projectName) {
      setNotification({ type: 'error', msg: 'Please select a Project Name.' });
      return;
    }
    if (!formData.itemName.trim()) {
      setNotification({ type: 'error', msg: 'Item Name / Description is required.' });
      return;
    }
    if (!formData.qty || Number(formData.qty) <= 0) {
      setNotification({ type: 'error', msg: 'Please enter a valid Quantity.' });
      return;
    }

    if (formData.invoiceNumber && String(formData.invoiceNumber).trim()) {
      if (!formData.rate || Number(formData.rate) <= 0) {
        setNotification({ type: 'error', msg: 'Unit Rate is required when an Invoice Number is mentioned.' });
        return;
      }
      const invTrim = String(formData.invoiceNumber).trim().toLowerCase();
      const isDuplicate = grnLogs.some(log => String(log.invoiceNumber || '').trim().toLowerCase() === invTrim);
      if (isDuplicate) {
        setNotification({ type: 'error', msg: `Invoice Number "${String(formData.invoiceNumber).trim()}" has already been used in another GRN entry. Duplicate invoice numbers are not allowed.` });
        return;
      }
    }

    setSubmitting(true);
    const grandTotalStr = calculateGrandTotalFormatted();
    const { itemBase, otherCharges, totalBaseValue } = calculateTaxValues();

    const payload = {
      id: 'grn-' + Date.now(),
      ...formData,
      qty: Number(formData.qty),
      rate: Number(formData.rate),
      otherCharges: Number(formData.otherCharges) || 0,
      itemBase,
      totalBaseValue,
      cgst: Number(formData.cgst),
      sgst: Number(formData.sgst),
      igst: Number(formData.igst),
      grandTotal: grandTotalStr,
      created_by: currentUser?.email || 'assistant@royalgokul.com',
      created_at: new Date().toISOString()
    };

    // Mark as created in this local tab session to prevent self-notification
    markGrnAsLocallyCreated(payload.id);

    const newLogs = [payload, ...grnLogs];
    setGrnLogs(newLogs);
    appendSingleRecord(SYNC_KEYS.GRN, payload);
    broadcastGrnRealtime(payload);

    setNotification({ type: 'success', msg: `GRN Entry #${formData.grnNumber} committed & synchronized across all dashboards!` });
    setSubmitting(false);

    // Compute next auto GRN number for reset
    const nextGrn = calculateNextGrnNumber(newLogs, formData.grnDate);

    setFormData({
      projectName: formData.projectName,
      grnNumber: nextGrn,
      grnDate: new Date().toISOString().split('T')[0],
      dcNumber: '',
      invoiceNumber: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      category: '',
      supplier: '',
      itemName: '',
      uom: '',
      qty: '',
      rate: '',
      otherCharges: '0',
      cgst: '9',
      sgst: '9',
      igst: '0'
    });
  };

  const addAssistantLedger = (e) => {
    e.preventDefault();
    if (!ledgerForm.vendor || !ledgerForm.project || !ledgerForm.invoiceAmount) {
      setNotification({ type: 'error', msg: 'Please enter Vendor, Project, and Invoice Amount Total.' });
      return;
    }

    const invVal = Number(ledgerForm.invoiceAmount) || 0;

    const newLedger = {
      id: 'ledg-' + Date.now(),
      date: ledgerForm.date || new Date().toISOString().split('T')[0],
      vendor: ledgerForm.vendor,
      project: ledgerForm.project,
      category: ledgerForm.category || 'Materials',
      item: ledgerForm.item || 'Cement (OPC / PPC)',
      invoiceNumber: ledgerForm.invoiceNumber || 'INV-' + Math.floor(1000 + Math.random() * 9000),
      invoiceAmount: invVal,
      remarks: ledgerForm.remarks || 'Invoice entry recorded',
      created_at: new Date().toISOString()
    };

    const updated = [newLedger, ...ledgersList];
    setLedgersList(updated);
    saveStorageData(SYNC_KEYS.LEDGERS, updated);
    setNotification({ type: 'success', msg: `Vendor Ledger Entry initialized for ${ledgerForm.vendor} (₹ ${invVal.toLocaleString('en-IN')})!` });

    setLedgerForm({
      date: new Date().toISOString().split('T')[0],
      vendor: '',
      project: '',
      category: 'Materials',
      item: 'Cement (OPC / PPC)',
      invoiceNumber: '',
      invoiceAmount: '',
      remarks: ''
    });
  };

  const handleSaveEditedGrn = (e) => {
    e.preventDefault();
    if (!editingGrn) return;

    const qty = Number(editingGrn.qty) || 0;
    const rate = Number(editingGrn.rate) || 0;
    const otherCharges = Number(editingGrn.otherCharges) || 0;
    const itemBase = qty * rate;
    const totalBase = itemBase + otherCharges;

    const cgstPct = Number(editingGrn.cgst) || 0;
    const sgstPct = Number(editingGrn.sgst) || 0;
    const igstPct = Number(editingGrn.igst) || 0;
    const totalTax = totalBase * ((cgstPct + sgstPct + igstPct) / 100);
    const grandTotalVal = totalBase + totalTax;
    const grandTotalStr = `₹ ${grandTotalVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

    const updatedGrnObj = {
      ...editingGrn,
      qty,
      rate,
      otherCharges,
      grandTotal: grandTotalStr
    };

    const updatedLogs = grnLogs.map(g => g.id === editingGrn.id ? updatedGrnObj : g);
    setGrnLogs(updatedLogs);
    saveStorageData(SYNC_KEYS.GRN, updatedLogs);
    setNotification({ type: 'success', msg: `GRN record ${editingGrn.grnNumber} updated successfully!` });
    setShowEditModal(false);
    setEditingGrn(null);
  };

  const handleImportGrns = (parsedRows) => {
    const formatted = parsedRows.map((r, i) => ({
      id: 'grn-imp-' + Date.now() + '-' + i,
      grnNumber: r.grnNumber || r['GRN #'] || '26-27/' + String(100 + i).padStart(3, '0'),
      projectName: r.projectName || r.project || '',
      category: r.category || 'Materials',
      supplier: r.supplier || r.vendor || '',
      itemName: r.itemName || r.item || '',
      qty: r.qty || '0',
      uom: r.uom || 'Units',
      rate: r.rate || '0',
      otherCharges: r.otherCharges || '0',
      grandTotal: r.grandTotal?.includes('₹') ? r.grandTotal : '₹ ' + (r.grandTotal || '0'),
      grnDate: r.grnDate || new Date().toISOString().split('T')[0]
    }));
    const updated = [...formatted, ...grnLogs];
    setGrnLogs(updated);
    saveStorageData(SYNC_KEYS.GRN, updated);
    setNotification({ type: 'success', msg: `Successfully imported ${formatted.length} material GRN entries!` });
  };

  const handleImportLedgers = (parsedRows) => {
    const formatted = parsedRows.map((r, i) => ({
      id: 'ledg-imp-' + Date.now() + '-' + i,
      date: r.date || new Date().toISOString().split('T')[0],
      vendor: r.vendor || r.Vendor || '',
      project: r.project || r.Project || '',
      category: r.category || r.Category || 'Materials',
      item: r.item || r.Item || '',
      invoiceNumber: r.invoiceNumber || r.invoice || 'INV-IMP-' + (100 + i),
      invoiceAmount: Number(r.invoiceAmount || r.amount || 0),
      remarks: r.remarks || '',
      created_at: new Date().toISOString()
    }));
    const updated = [...formatted, ...ledgersList];
    setLedgersList(updated);
    saveStorageData(SYNC_KEYS.LEDGERS, updated);
    setNotification({ type: 'success', msg: `Successfully imported ${formatted.length} vendor ledger records!` });
  };

  const { itemBase, otherCharges, totalBaseValue, cgstVal, sgstVal, igstVal, totalTax } = calculateTaxValues();

  // Helper filter for Vendor Ledger directory
  const getFilteredLedgers = () => {
    return ledgersList.filter(item => {
      const itemDate = item.date || (item.created_at ? item.created_at.split('T')[0] : '');
      
      // Date filtering
      if (ledgerFilters.filterType === 'Daily') {
        const todayStr = new Date().toISOString().split('T')[0];
        if (itemDate !== todayStr) return false;
      } else if (ledgerFilters.fromDate || ledgerFilters.toDate) {
        if (ledgerFilters.fromDate && itemDate < ledgerFilters.fromDate) return false;
        if (ledgerFilters.toDate && itemDate > ledgerFilters.toDate) return false;
      }

      // Project filter
      if (ledgerFilters.project !== 'All' && item.project !== ledgerFilters.project) {
        return false;
      }

      // Category filter
      if (ledgerFilters.category !== 'All' && (item.category || 'Materials') !== ledgerFilters.category) {
        return false;
      }

      // Vendor filter
      if (ledgerFilters.vendor !== 'All' && item.vendor !== ledgerFilters.vendor) {
        return false;
      }

      // Search Query
      if (ledgerFilters.searchQuery) {
        const q = ledgerFilters.searchQuery.toLowerCase();
        const v = (item.vendor || '').toLowerCase();
        const p = (item.project || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();
        const inv = (item.invoiceNumber || '').toLowerCase();
        const it = (item.item || '').toLowerCase();
        if (!v.includes(q) && !p.includes(q) && !cat.includes(q) && !inv.includes(q) && !it.includes(q)) {
          return false;
        }
      }

      return true;
    });
  };

  const filteredLedgers = getFilteredLedgers();
  const totalFilteredInvoiceAmount = filteredLedgers.reduce((acc, curr) => acc + (Number(curr.invoiceAmount || curr.openingBalance || 0) || 0), 0);

  return (
    <div className="flex flex-col min-h-screen w-full bg-slate-50 text-slate-900 font-sans assistant-scrollbar overflow-y-auto">
      <TableImportModal 
        isOpen={importModalConfig.isOpen}
        onClose={() => setImportModalConfig({...importModalConfig, isOpen: false})}
        tableName={importModalConfig.tableName}
        onImport={importModalConfig.onImport}
        sampleCsv={importModalConfig.sampleCsv}
        sampleRows={importModalConfig.sampleRows}
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
              title="Current Active Workspace"
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
                  <button
                    key={idx}
                    onClick={() => {
                      setActiveCompany(comp);
                      safeSetItem('rgc_active_company', JSON.stringify(comp));
                      setCompanyDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition ${
                      activeCompany?.prefix === comp.prefix ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate">{comp.name || comp.companyName}</span>
                    <span className="text-[10px] font-mono text-amber-400">{comp.prefix}</span>
                  </button>
                ))}

                <div className="pt-1 border-t border-slate-800">
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
            <p className="text-[10px] sm:text-xs font-bold uppercase text-amber-500">Accounts Assistant</p>
            <p className="text-xs sm:text-sm font-medium truncate max-w-[120px] sm:max-w-none">{currentUser?.email ? currentUser.email.split('@')[0] : 'Log Assistant'}</p>
          </div>

          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-white text-xs shrink-0">
            AA
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

      {/* Mobile Quick Navigation Strip */}
      <div className="md:hidden bg-[#070e20] border-b border-slate-800 p-2 flex overflow-x-auto gap-2 shrink-0 z-30">
        <button 
          onClick={() => setActiveSection('grn-logging')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap transition cursor-pointer ${
            activeSection === 'grn-logging' ? 'bg-[#131d36] text-amber-300 border border-amber-500/70 shadow-sm' : 'bg-slate-900/60 text-slate-300'
          }`}
        >
          <span>Material GRN Logging</span>
        </button>
        <button 
          onClick={() => setActiveSection('grn-history')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap transition cursor-pointer ${
            activeSection === 'grn-history' ? 'bg-[#131d36] text-amber-300 border border-amber-500/70 shadow-sm' : 'bg-slate-900/60 text-slate-300'
          }`}
        >
          <span>GRN History</span>
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

            {/* Assistant Workspace Label & Authorized Tag */}
            <div className="flex items-center justify-between px-1 mb-4">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-500">
                ASSISTANT WORKSPACE
              </span>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30">
                AUTHORIZED
              </span>
            </div>

            <div className="space-y-2">
              <button 
                onClick={() => { setActiveSection('grn-logging'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-left transition-all cursor-pointer ${
                  activeSection === 'grn-logging' 
                    ? 'bg-[#131d36] text-amber-300 border border-amber-500/80 shadow-inner font-bold' 
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <FileText className={`w-4 h-4 shrink-0 ${activeSection === 'grn-logging' ? 'text-amber-400' : 'text-amber-400'}`} />
                <span>Material GRN Logging</span>
              </button>

              <button 
                onClick={() => { setActiveSection('grn-history'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-left transition-all cursor-pointer ${
                  activeSection === 'grn-history' 
                    ? 'bg-[#131d36] text-amber-300 border border-amber-500/80 shadow-inner font-bold' 
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <History className={`w-4 h-4 shrink-0 ${activeSection === 'grn-history' ? 'text-amber-400' : 'text-emerald-400'}`} />
                <span>GRN History</span>
              </button>
            </div>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 p-3 sm:p-6 pb-28 flex flex-col gap-4 sm:gap-6 overflow-y-auto w-full min-w-0 assistant-scrollbar">
          
          {notification.msg && (
            <div className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between ${
              notification.type === 'success' 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-800'
            }`}>
              <div className="flex items-center gap-2">
                {notification.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-rose-600" />}
                <span>{notification.msg}</span>
              </div>
            </div>
          )}

          {/* TAB 1: Material GRN Logging Master */}
          {activeSection === 'grn-logging' && (
            <div id="grn-logging" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-20">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center flex-wrap gap-2">
                <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <span className="bg-amber-500/10 p-1.5 rounded text-amber-600">
                    <FileText className="w-4 h-4" />
                  </span>
                  Material GRN Logging Master
                </h2>
                
                <div className="flex items-center gap-2">
                  <button 
                    type="button" 
                    onClick={fetchMasterData}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600 flex items-center gap-1 transition cursor-pointer"
                  >
                    <RefreshCcw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                    <span>Reload Drops</span>
                  </button>
                </div>
              </div>

              <form onSubmit={submitGRN} className="p-6 space-y-6">
                
                {/* Row 1: Identification & Project */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Project Name *</label>
                    <select 
                      required
                      value={formData.projectName}
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:border-amber-500 outline-none font-medium bg-slate-50 focus:bg-white"
                      onChange={(e) => setFormData({...formData, projectName: e.target.value})}
                    >
                      <option value="">Select Project</option>
                      {projects.length === 0 ? (
                        <option disabled value="">No items configured. Please contact the Accounts Manager.</option>
                      ) : (
                        projects.map((p, idx) => <option key={p.id ? `ap2-${p.id}-${idx}` : `ap2-${p.name || idx}-${idx}`} value={p.name}>{p.name}</option>)
                      )}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-amber-600 uppercase tracking-widest block flex items-center justify-between">
                      <span>GRN Number *</span>
                      <span className="text-[9px] text-slate-400 font-mono">(AUTO FY)</span>
                    </label>
                    <input 
                      type="text" 
                      required
                      value={formData.grnNumber}
                      className="w-full bg-slate-50 border border-amber-300 rounded-lg p-2 text-sm font-mono font-bold text-amber-800"
                      onChange={(e) => setFormData({...formData, grnNumber: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">GRN Date *</label>
                    <input 
                      type="date" 
                      required
                      value={formData.grnDate}
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-slate-50 focus:bg-white"
                      onChange={(e) => setFormData({...formData, grnDate: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">DC Number</label>
                    <input 
                      type="text" 
                      placeholder="DC-9012"
                      value={formData.dcNumber}
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-slate-50 focus:bg-white"
                      onChange={(e) => setFormData({...formData, dcNumber: e.target.value})}
                    />
                  </div>
                </div>

                {/* Row 2: Vendor Invoice & Categories */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Invoice Number</label>
                    <input 
                      type="text" 
                      placeholder="INV-2026-091"
                      value={formData.invoiceNumber}
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-slate-50 focus:bg-white"
                      onChange={(e) => setFormData({...formData, invoiceNumber: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Invoice Date</label>
                    <input 
                      type="date" 
                      value={formData.invoiceDate}
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-slate-50 focus:bg-white"
                      onChange={(e) => setFormData({...formData, invoiceDate: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Category *</label>
                    <select 
                      value={formData.category}
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:border-amber-500 outline-none font-medium bg-slate-50 focus:bg-white"
                      onChange={(e) => setFormData({...formData, category: e.target.value, itemName: ''})}
                    >
                      <option value="">Select Category</option>
                      {masters.Category.map((c, idx) => { const str = typeof c === 'object' ? (c?.label || c?.name || c?.value || '') : String(c); return <option key={`cat-${str}-${idx}`} value={str}>{str}</option>; })}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Supplier Name *</label>
                    <select 
                      value={formData.supplier}
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:border-amber-500 outline-none font-medium bg-slate-50 focus:bg-white"
                      onChange={(e) => handleSupplierChange(e.target.value)}
                    >
                      <option value="">Select Supplier</option>
                      {masters.Supplier.map((s, idx) => { const str = typeof s === 'object' ? (s?.label || s?.name || s?.value || '') : String(s); return <option key={`supp-${str}-${idx}`} value={str}>{str}</option>; })}
                    </select>

                    {/* Auto-Fetched Supplier Master Details */}
                    {formData.supplier && (formData.supplierGstNo || formData.supplierAddress || formData.supplierBankDetails || formData.cgst || formData.sgst) && (
                      <div className="mt-2 bg-blue-50/90 border-2 border-blue-200/90 rounded-xl p-3 text-[11px] text-blue-950 space-y-1.5 animate-in fade-in shadow-xs">
                        <div className="flex items-center justify-between font-extrabold text-blue-950 flex-wrap gap-1">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>Auto-Fetched Supplier Master Info</span>
                          </div>
                          <div className="flex items-center gap-1 font-mono text-[10px]">
                            <span className="bg-blue-100/90 text-blue-900 px-2 py-0.5 rounded font-bold border border-blue-300/60">CGST: {formData.cgst}%</span>
                            <span className="bg-blue-100/90 text-blue-900 px-2 py-0.5 rounded font-bold border border-blue-300/60">SGST: {formData.sgst}%</span>
                            {Number(formData.igst) > 0 && (
                              <span className="bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded font-bold border border-indigo-300/60">IGST: {formData.igst}%</span>
                            )}
                          </div>
                        </div>
                        {formData.supplierGstNo && (
                          <div className="font-mono"><strong>GSTIN:</strong> <span className="font-bold text-blue-700">{formData.supplierGstNo}</span></div>
                        )}
                        {formData.supplierAddress && (
                          <div><strong>Address:</strong> {formData.supplierAddress}</div>
                        )}
                        {formData.supplierBankDetails && (
                          <div><strong>Bank Details:</strong> {formData.supplierBankDetails}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 3: Items & Pricing with Other Charges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div className="space-y-1 lg:col-span-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Item Description *</label>
                    <select 
                      required
                      value={formData.itemName}
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white font-medium focus:border-amber-500 outline-none"
                      onChange={(e) => setFormData({...formData, itemName: e.target.value})}
                    >
                      <option value="">Select Item Description</option>
                      {getFilteredItemOptions(formData.category).map((item, idx) => (
                        <option key={`item-${item}-${idx}`} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">UOM *</label>
                    <select 
                      value={formData.uom}
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white"
                      onChange={(e) => setFormData({...formData, uom: e.target.value})}
                    >
                      <option value="">Select UOM</option>
                      {masters.UOM.map((u, idx) => { const str = typeof u === 'object' ? (u?.label || u?.name || u?.value || '') : String(u); return <option key={`uom-${str}-${idx}`} value={str}>{str}</option>; })}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2 lg:col-span-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Quantity *</label>
                      <input 
                        type="number" 
                        required
                        placeholder="120"
                        value={formData.qty}
                        className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white font-mono"
                        onChange={(e) => setFormData({...formData, qty: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                        Unit Rate (₹) {formData.invoiceNumber && String(formData.invoiceNumber).trim() ? '*' : '(Optional)'}
                      </label>
                      <input 
                        type="number" 
                        required={Boolean(formData.invoiceNumber && String(formData.invoiceNumber).trim())}
                        placeholder="4500"
                        value={formData.rate}
                        className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white font-mono"
                        onChange={(e) => setFormData({...formData, rate: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                {/* Other Charges & IGST Row */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-amber-50/50 p-4 rounded-lg border border-amber-200/80">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-amber-800 uppercase tracking-widest block">Other Charges (₹)</label>
                    <input 
                      type="number" 
                      placeholder="e.g. 15000 (Freight/Handling)"
                      value={formData.otherCharges}
                      className="w-full border border-amber-300 rounded-lg p-2 text-sm bg-white font-mono font-bold text-slate-900"
                      onChange={(e) => setFormData({...formData, otherCharges: e.target.value})}
                    />
                    <span className="text-[9px] text-amber-700 block">Added to Base Value</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">CGST Rate (%)</label>
                    <input 
                      type="number" 
                      placeholder="9"
                      value={formData.cgst}
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white font-mono"
                      onChange={(e) => setFormData({...formData, cgst: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">SGST Rate (%)</label>
                    <input 
                      type="number" 
                      placeholder="9"
                      value={formData.sgst}
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white font-mono"
                      onChange={(e) => setFormData({...formData, sgst: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-blue-700 uppercase tracking-widest block">IGST Rate (%)</label>
                    <input 
                      type="number" 
                      placeholder="0"
                      value={formData.igst}
                      className="w-full border border-blue-300 rounded-lg p-2 text-sm bg-white font-mono font-bold text-blue-800"
                      onChange={(e) => setFormData({...formData, igst: e.target.value})}
                    />
                    <span className="text-[9px] text-blue-600 block">Integrated Tax</span>
                  </div>
                </div>

                {/* Tax Breakdown & Total Matrix */}
                <div className="bg-slate-900 text-white rounded-xl p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-2">
                      <Calculator className="w-4 h-4" />
                      Live Tax Matrix Computation Engine
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">Formula: (Item Base + Other Charges) + GST%</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
                    <div>
                      <p className="text-slate-400 text-[10px] uppercase font-bold">Item Base</p>
                      <p className="font-mono font-bold text-slate-200">₹ {itemBase.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-amber-400 text-[10px] uppercase font-bold">Other Charges</p>
                      <p className="font-mono font-bold text-amber-300">₹ {otherCharges.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-[10px] uppercase font-bold">Taxable Base</p>
                      <p className="font-mono font-extrabold text-slate-100">₹ {totalBaseValue.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-[10px] uppercase font-bold">CGST ({formData.cgst}%)</p>
                      <p className="font-mono text-slate-300">₹ {cgstVal.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 text-[10px] uppercase font-bold">SGST ({formData.sgst}%)</p>
                      <p className="font-mono text-slate-300">₹ {sgstVal.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-blue-400 text-[10px] uppercase font-bold">IGST ({formData.igst}%)</p>
                      <p className="font-mono text-blue-300">₹ {igstVal.toLocaleString('en-IN')}</p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex justify-between items-center flex-wrap gap-3">
                    <div>
                      <span className="text-xs text-slate-400 font-medium">Computed Grand Total: </span>
                      <span className="font-mono font-extrabold text-2xl text-amber-400">{calculateGrandTotalFormatted()}</span>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-8 py-3 rounded-lg text-xs uppercase tracking-wider cursor-pointer shadow-md transition"
                    >
                      {submitting ? 'Committing...' : 'Commit GRN to Interconnected Ledger'}
                    </button>
                  </div>
                </div>

              </form>
            </div>
          )}

          {/* TAB 2: GRN History & Report Exports */}
          {activeSection === 'grn-history' && (
            <div id="grn-history" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-4">
              
              {/* Header Bar */}
              <div className="p-4 bg-slate-900 text-white rounded-xl flex justify-between items-center flex-wrap gap-3">
                <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                  <History className="w-4 h-4 text-emerald-400" />
                  <span>Material GRN History & Retrieval Register</span>
                </h3>
                
                {/* Export Excel, PDF & Import CSV */}
                <div className="flex items-center gap-2">
                  <ExportButton 
                    onExportExcel={() => {
                      const headers = [
                        'GRN #', 'GRN Date', 'Project Site', 'Category', 'Supplier',
                        'Item Description', 'Quantity', 'UOM', 'Rate per Unit (₹)',
                        'GST Amount (₹)', 'Grand Total (₹)'
                      ];

                      const rows = filteredGrnLogs.map(g => {
                        const parseVal = (v) => typeof v === 'number' ? v : Number(String(v || '').replace(/[^0-9.-]+/g, '')) || 0;
                        const gTot = parseVal(g.grandTotal);
                        const gstVal = calculateGstForLog(g);

                        return [
                          g.grnNumber || '-',
                          g.grnDate || '-',
                          g.projectName || '-',
                          g.category || 'General',
                          g.supplier || '-',
                          g.itemName || '-',
                          g.qty !== undefined ? g.qty : '-',
                          g.uom || 'Nos',
                          g.rate !== undefined ? parseVal(g.rate) : '-',
                          Math.round(gstVal),
                          gTot
                        ];
                      });

                      const filterSummary = filterPreset !== 'all' ? `${filterPreset.toUpperCase()} (${startDate || 'Start'} to ${endDate || 'Present'})` : 'All Time';
                      const totalGrand = filteredGrnLogs.reduce((sum, g) => sum + (typeof g.grandTotal === 'number' ? g.grandTotal : Number(String(g.grandTotal || '').replace(/[^0-9.-]+/g, '')) || 0), 0);

                      // Append Grand Total Row at the end of the table
                      rows.push([
                        'GRAND TOTAL',
                        '-',
                        '-',
                        '-',
                        '-',
                        '-',
                        '-',
                        '-',
                        '-',
                        '-',
                        totalGrand
                      ]);

                      exportToExcel('Material GRN History Register', 'GRN_History_Register', headers, rows, filterSummary);
                    }}
                    onExportPdf={() => {
                      const headers = [
                        'GRN #', 'GRN Date', 'Project Site', 'Category', 'Supplier',
                        'Item Description', 'Qty', 'UOM', 'Rate (₹)',
                        'GST (₹)', 'Grand Total (₹)'
                      ];

                      const rows = filteredGrnLogs.map(g => {
                        const parseVal = (v) => typeof v === 'number' ? v : Number(String(v || '').replace(/[^0-9.-]+/g, '')) || 0;
                        const gTot = parseVal(g.grandTotal);
                        const gstVal = calculateGstForLog(g);

                        return [
                          g.grnNumber || '-',
                          g.grnDate || '-',
                          g.projectName || '-',
                          g.category || 'General',
                          g.supplier || '-',
                          g.itemName || '-',
                          g.qty !== undefined ? g.qty : '-',
                          g.uom || 'Nos',
                          g.rate !== undefined ? `₹${parseVal(g.rate).toLocaleString('en-IN')}` : '-',
                          `₹${Math.round(gstVal).toLocaleString('en-IN')}`,
                          `₹${gTot.toLocaleString('en-IN')}`
                        ];
                      });

                      const filterSummary = filterPreset !== 'all' ? `${filterPreset.toUpperCase()} (${startDate || 'Start'} to ${endDate || 'Present'})` : 'All Time';
                      const totalGrand = filteredGrnLogs.reduce((sum, g) => sum + (typeof g.grandTotal === 'number' ? g.grandTotal : Number(String(g.grandTotal || '').replace(/[^0-9.-]+/g, '')) || 0), 0);

                      // Append Grand Total Row at the end of the table
                      rows.push([
                        'GRAND TOTAL',
                        '-',
                        '-',
                        '-',
                        '-',
                        '-',
                        '-',
                        '-',
                        '-',
                        '-',
                        `₹${totalGrand.toLocaleString('en-IN')}`
                      ]);

                      exportToPDF('Material GRN History Register', headers, rows, filterSummary);
                    }}
                    label="Export Register"
                  />

                  <button
                    type="button"
                    onClick={() => openImportModal('Material GRN Entries', handleImportGrns, 'grnNumber, projectName, supplier, category, itemName, qty, rate, grandTotal', [])}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Import CSV</span>
                  </button>
                  <span className="bg-slate-800 text-slate-300 text-[10px] font-mono px-2 py-0.5 rounded">
                    {filteredGrnLogs.length} of {grnLogs.length} Records
                  </span>
                </div>
              </div>

              {/* Dynamic Net Grand Total Banner */}
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 p-4 rounded-xl shadow-xs flex items-center justify-between flex-wrap gap-3 border border-amber-400">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-900/80">Net Grand Total Amount (Filtered Reports)</div>
                  <div className="text-2xl font-black font-mono mt-0.5">
                    ₹ {filteredGrnLogs.reduce((sum, g) => sum + (typeof g.grandTotal === 'number' ? g.grandTotal : Number(String(g.grandTotal || '').replace(/[^0-9.-]+/g, '')) || 0), 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="text-xs font-bold bg-slate-950 text-amber-400 px-3 py-1.5 rounded-lg border border-amber-400/30 font-mono shadow-xs">
                  {filteredGrnLogs.length} Active Records
                </div>
              </div>

              {/* Data Retrieval & Date Range Filters Bar */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 text-xs">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <Filter className="w-4 h-4 text-amber-600" />
                    <span>Data Retrieval & Date Filters</span>
                  </div>

                  {(filterPreset !== 'all' || startDate || endDate || searchQuery || filterProject) && (
                    <button 
                      type="button"
                      onClick={() => {
                        setFilterPreset('all');
                        setStartDate('');
                        setEndDate('');
                        setSearchQuery('');
                        setFilterProject('');
                      }}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-800 underline transition cursor-pointer"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {/* Preset Dropdown */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Time Period</label>
                    <select
                      value={filterPreset}
                      onChange={(e) => handlePresetChange(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white font-medium text-slate-800 focus:border-amber-500 outline-none"
                    >
                      <option value="all">All Time</option>
                      <option value="daily">Daily (Today)</option>
                      <option value="weekly">Weekly (This Week)</option>
                      <option value="monthly">Monthly (This Month)</option>
                      <option value="fy">Financial Year (FY 2026-27)</option>
                      <option value="custom">Custom Date Range</option>
                    </select>
                  </div>

                  {/* From Date */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">From Date</label>
                    <input 
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setFilterPreset('custom');
                      }}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white font-medium text-slate-800 focus:border-amber-500 outline-none"
                    />
                  </div>

                  {/* To Date */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">To Date</label>
                    <input 
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setFilterPreset('custom');
                      }}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white font-medium text-slate-800 focus:border-amber-500 outline-none"
                    />
                  </div>

                  {/* Project Site Filter */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Project Site</label>
                    <select
                      value={filterProject}
                      onChange={(e) => setFilterProject(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-xs bg-white font-medium text-slate-800 focus:border-amber-500 outline-none"
                    >
                      <option value="">All Projects</option>
                      {projects.map((p, idx) => (
                        <option key={p.id ? `fproj-${p.id}-${idx}` : `fproj-${p.name || idx}-${idx}`} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Keyword Search */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Search Keywords</label>
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="GRN #, supplier..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg p-2 pl-7 text-xs bg-white font-medium text-slate-800 focus:border-amber-500 outline-none"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Records Table */}
              <div className="overflow-x-auto overflow-y-auto max-h-[620px] border border-slate-200 rounded-xl assistant-scrollbar custom-scrollbar shadow-xs relative">
                <table className="w-full text-left text-xs min-w-[950px]">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold sticky top-0 z-10 shadow-xs border-b border-slate-200">
                    <tr>
                      <th className="p-3 pl-4 bg-slate-100">GRN # & Date</th>
                      <th className="p-3 bg-slate-100">Project Site</th>
                      <th className="p-3 bg-slate-100">Category / Supplier</th>
                      <th className="p-3 bg-slate-100">Item Description</th>
                      <th className="p-3 text-center bg-slate-100">Qty</th>
                      <th className="p-3 text-center bg-slate-100">UOM</th>
                      <th className="p-3 text-right bg-slate-100">Rate / Unit</th>
                      <th className="p-3 text-right bg-slate-100">Base Amount</th>
                      <th className="p-3 text-right bg-slate-100">GST Amount</th>
                      <th className="p-3 pr-4 text-right bg-slate-100">Grand Total</th>
                      <th className="p-3 text-center bg-slate-100">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredGrnLogs.length === 0 ? (
                      <tr>
                        <td colSpan="11" className="p-6 text-center text-slate-400 italic">
                          No GRN logs match the selected filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredGrnLogs.map((log, idx) => {
                        const parseVal = (v) => typeof v === 'number' ? v : Number(String(v || '').replace(/[^0-9.-]+/g, '')) || 0;
                        const gTot = parseVal(log.grandTotal);
                        const gstVal = calculateGstForLog(log);
                        const qNum = parseVal(log.qty);
                        const rNum = parseVal(log.rate);
                        const baseAmt = log.totalBaseValue || log.itemBase || (qNum * rNum);

                        return (
                          <tr key={log.id ? `agrn-${log.id}-${idx}` : `agrn-row-${idx}`} className="hover:bg-amber-50/20">
                            <td className="p-3 pl-4 font-mono font-bold text-slate-900">
                              <div>{log.grnNumber}</div>
                              <div className="text-[10px] text-slate-400 font-normal">{log.grnDate || ''}</div>
                            </td>
                            <td className="p-3 text-slate-800 font-semibold">{log.projectName}</td>
                            <td className="p-3">
                              <div className="text-slate-800 font-semibold">{log.category || 'General'}</div>
                              <div className="text-[10px] text-slate-400">{log.supplier}</div>
                            </td>
                            <td className="p-3 text-slate-700">{log.itemName}</td>
                            <td className="p-3 text-center font-bold text-slate-900">{log.qty}</td>
                            <td className="p-3 text-center text-slate-600">{log.uom || 'Nos'}</td>
                            <td className="p-3 text-right font-mono text-slate-700">₹{parseVal(log.rate).toLocaleString('en-IN')}</td>
                            <td className="p-3 text-right font-mono text-emerald-700 font-bold">₹{Math.round(baseAmt).toLocaleString('en-IN')}</td>
                            <td className="p-3 text-right font-mono text-blue-700 font-medium">₹{Math.round(gstVal).toLocaleString('en-IN')}</td>
                            <td className="p-3 pr-4 text-right font-mono font-extrabold text-amber-700 text-sm">
                              {typeof log.grandTotal === 'string' && log.grandTotal.includes('₹') ? log.grandTotal : `₹ ${gTot.toLocaleString('en-IN')}`}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingGrn({ ...log });
                                  setShowEditModal(true);
                                }}
                                className="p-1.5 rounded-lg bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border border-amber-300 transition cursor-pointer shadow-xs"
                                title="Edit GRN Record"
                              >
                                <Pencil className="w-3.5 h-3.5" />
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

          {/* EDIT GRN RECORD MODAL */}
          {showEditModal && editingGrn && (
            <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in overflow-y-auto assistant-scrollbar">
              <div className="bg-white border border-slate-200 p-5 sm:p-6 rounded-2xl max-w-2xl w-full shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto assistant-scrollbar custom-scrollbar">
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Pencil className="w-5 h-5 text-amber-600" />
                    <h3 className="text-base font-bold text-slate-900">Edit GRN Entry Record ({editingGrn.grnNumber})</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setShowEditModal(false); setEditingGrn(null); }}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveEditedGrn} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">Project Site *</label>
                      <select
                        value={editingGrn.projectName || ''}
                        onChange={(e) => setEditingGrn({ ...editingGrn, projectName: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-slate-50 text-slate-900"
                        required
                      >
                        <option value="">Select Project</option>
                        {projects.map((p, idx) => (
                          <option key={`ep-${p.name}-${idx}`} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">GRN Date *</label>
                      <input
                        type="date"
                        value={editingGrn.grnDate || ''}
                        onChange={(e) => setEditingGrn({ ...editingGrn, grnDate: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-slate-50 text-slate-900"
                        required
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">Supplier / Vendor *</label>
                      <select
                        value={editingGrn.supplier || ''}
                        onChange={(e) => handleEditSupplierChange(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-slate-50 text-slate-900"
                        required
                      >
                        <option value="">Select Supplier</option>
                        {masters.Supplier.map((s, idx) => {
                          const str = typeof s === 'object' ? (s?.label || s?.name || s?.value || '') : String(s);
                          return <option key={`esup-${str}-${idx}`} value={str}>{str}</option>;
                        })}
                      </select>
                      {editingGrn.supplier && (editingGrn.supplierGstNo || editingGrn.supplierAddress || editingGrn.cgst !== undefined) && (
                        <div className="mt-1.5 bg-blue-50/90 border border-blue-200 rounded-lg p-2 text-[10px] text-blue-900 space-y-1">
                          <div className="flex items-center justify-between font-bold">
                            <span>Auto-Fetched Supplier GST</span>
                            <span className="font-mono bg-blue-100 px-1.5 py-0.5 rounded">CGST: {editingGrn.cgst || 0}% | SGST: {editingGrn.sgst || 0}%{Number(editingGrn.igst) > 0 ? ` | IGST: ${editingGrn.igst}%` : ''}</span>
                          </div>
                          {editingGrn.supplierGstNo && <div><strong>GSTIN:</strong> {editingGrn.supplierGstNo}</div>}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">Category *</label>
                      <select
                        value={editingGrn.category || ''}
                        onChange={(e) => setEditingGrn({ ...editingGrn, category: e.target.value, itemName: '' })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-slate-50 text-slate-900"
                        required
                      >
                        <option value="">Select Category</option>
                        {masters.Category.map((c, idx) => {
                          const str = typeof c === 'object' ? (c?.label || c?.name || c?.value || '') : String(c);
                          return <option key={`ecat-${str}-${idx}`} value={str}>{str}</option>;
                        })}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">Item Description (Subcategory) *</label>
                      <select
                        value={editingGrn.itemName || ''}
                        onChange={(e) => setEditingGrn({ ...editingGrn, itemName: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-slate-50 text-slate-900"
                        required
                      >
                        <option value="">Select Subcategory / Item</option>
                        {editingGrn.itemName && !getFilteredItemOptions(editingGrn.category).includes(editingGrn.itemName) && (
                          <option value={editingGrn.itemName}>{editingGrn.itemName} (Current)</option>
                        )}
                        {getFilteredItemOptions(editingGrn.category).map((it, idx) => (
                          <option key={`eitem-${it}-${idx}`} value={it}>{it}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">Quantity *</label>
                      <input
                        type="number"
                        step="any"
                        value={editingGrn.qty || ''}
                        onChange={(e) => setEditingGrn({ ...editingGrn, qty: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-slate-50 text-slate-900 font-mono"
                        required
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">UOM</label>
                      <input
                        type="text"
                        value={editingGrn.uom || ''}
                        onChange={(e) => setEditingGrn({ ...editingGrn, uom: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-slate-50 text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">Rate per Unit (₹) *</label>
                      <input
                        type="number"
                        step="any"
                        value={editingGrn.rate || ''}
                        onChange={(e) => setEditingGrn({ ...editingGrn, rate: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-slate-50 text-slate-900 font-mono"
                        required
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">Invoice Number</label>
                      <input
                        type="text"
                        value={editingGrn.invoiceNumber || ''}
                        onChange={(e) => setEditingGrn({ ...editingGrn, invoiceNumber: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-slate-50 text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-amber-800 uppercase text-[10px] mb-1">Other Charges (₹)</label>
                      <input
                        type="number"
                        step="any"
                        value={editingGrn.otherCharges !== undefined ? editingGrn.otherCharges : '0'}
                        onChange={(e) => setEditingGrn({ ...editingGrn, otherCharges: e.target.value })}
                        className="w-full border border-amber-300 rounded-lg p-2 font-medium bg-white text-slate-900 font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">CGST Rate (%)</label>
                      <input
                        type="number"
                        step="any"
                        value={editingGrn.cgst !== undefined ? editingGrn.cgst : '9'}
                        onChange={(e) => setEditingGrn({ ...editingGrn, cgst: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-slate-50 text-slate-900 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">SGST Rate (%)</label>
                      <input
                        type="number"
                        step="any"
                        value={editingGrn.sgst !== undefined ? editingGrn.sgst : '9'}
                        onChange={(e) => setEditingGrn({ ...editingGrn, sgst: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-slate-50 text-slate-900 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-blue-700 uppercase text-[10px] mb-1">IGST Rate (%)</label>
                      <input
                        type="number"
                        step="any"
                        value={editingGrn.igst !== undefined ? editingGrn.igst : '0'}
                        onChange={(e) => setEditingGrn({ ...editingGrn, igst: e.target.value })}
                        className="w-full border border-blue-300 rounded-lg p-2 font-medium bg-blue-50 text-blue-900 font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => { setShowEditModal(false); setEditingGrn(null); }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg cursor-pointer shadow-xs"
                    >
                      Save GRN Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

