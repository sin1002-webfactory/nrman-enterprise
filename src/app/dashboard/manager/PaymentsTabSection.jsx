"use client";
import React from 'react';
import ExportButton from '@/components/ExportButton';
import { 
  IndianRupee, 
  PlusCircle, 
  Lock, 
  Calendar, 
  CheckCircle2, 
  FileSpreadsheet, 
  Search, 
  Filter, 
  Trash2, 
  AlertCircle,
  Building2,
  Wallet,
  RotateCcw
} from 'lucide-react';

export default function PaymentsTabSection({
  paymentsList = [],
  mastersList = [],
  grnList = [],
  projectsList = [],
  defaultVendors = [],
  paymentForm,
  setPaymentForm,
  calculateNextPaymentId,
  handleRecordPayment,
  handleDeletePayment,
  paymentSearchQuery,
  setPaymentSearchQuery,
  paymentSiteFilter = 'All Sites',
  setPaymentSiteFilter,
  paymentVendorFilter,
  setPaymentVendorFilter,
  paymentModeFilter,
  setPaymentModeFilter,
  paymentAccountFilter,
  setPaymentAccountFilter,
  paymentDatePreset,
  setPaymentDatePreset,
  handlePaymentDatePresetChange,
  paymentStartDate,
  setPaymentStartDate,
  paymentEndDate,
  setPaymentEndDate,
  formatDDMMYYYY,
  parseNum,
  exportToExcel,
  exportToPDF
}) {
  // Master Data Resolution - ONLY projects and site masters created by the Manager
  const masterSites = (mastersList || [])
    .filter(m => m && (m.category === 'Site' || m.category === 'Sites' || m.category === 'Project' || m.type === 'Site' || m.type === 'Project'))
    .map(s => typeof s === 'string' ? s.trim() : (s?.name || s?.value || s?.label || '').trim())
    .filter(Boolean);

  const projectSites = (projectsList || [])
    .map(p => typeof p === 'string' ? p.trim() : (p?.name || p?.siteName || p?.site || '').trim())
    .filter(Boolean);

  // Available sites strictly limited to manager-created projects & site masters (no test sites)
  const availableSites = Array.from(new Set([
    ...projectSites,
    ...masterSites
  ])).filter(Boolean);

  const masterVendors = Array.from(new Set([
    ...mastersList.filter(m => m.category === 'Supplier' || m.category === 'Vendor' || m.type === 'Supplier' || m.type === 'Vendor').map(s => typeof s === 'string' ? s.trim() : (s?.name || s?.label || s?.value || s?.supplier || '').trim()).filter(Boolean),
    ...grnList.map(g => (g.supplier || g.vendor || '').trim()).filter(Boolean),
    ...paymentsList.map(p => (p.vendor || p.partyName || p.supplier || '').trim()).filter(Boolean)
  ])).filter(Boolean);

  const masterModes = mastersList
    .filter(m => m.category === 'Mode of Transaction' || m.category === 'Payment Mode' || m.category === 'Payment Modes' || m.type === 'Mode of Transaction' || m.type === 'Payment Mode')
    .map(m => typeof m === 'string' ? m.trim() : (m?.value || m?.label || m?.name || '').trim())
    .filter(Boolean);

  const defaultModes = ['Online Transfer', 'NEFT / RTGS', 'Cheque', 'UPI / IMPS', 'Cash', 'Net Banking', 'Letter of Credit (LC)'];
  const availableModes = Array.from(new Set([
    ...masterModes,
    ...defaultModes,
    ...paymentsList.map(p => (p.paymentMode || p.mode || '').trim()).filter(Boolean)
  ])).filter(Boolean);

  const masterAccounts = mastersList
    .filter(m => m.category === 'Bank accounts' || m.category === 'Bank Accounts' || m.type === 'Bank accounts' || m.type === 'Bank Accounts')
    .map((b, idx) => {
      const name = typeof b === 'string' ? b : (b?.name || b?.label || b?.value || 'Bank A/C');
      const accNum = typeof b === 'object' ? (b?.accountNumber || b?.bankDetails || b?.code || b?.name || '') : b;
      const cleanAcc = String(accNum || '').trim();
      return {
        id: b.id || `bank-${idx}`,
        accountNumber: cleanAcc || name,
        displayName: cleanAcc && cleanAcc !== name ? `${name} (${cleanAcc})` : name
      };
    })
    .filter(b => Boolean(b.accountNumber));

  const availableAccounts = masterAccounts;

  // Filtered Payments Dataset - Only actual payment disbursement entries made by the manager
  const filteredPaymentsList = (paymentsList || []).filter(p => {
    if (!p) return false;
    if (p.isGrn === true || String(p.id || '').startsWith('PAY-GRN-')) return false;
    const paidVal = parseNum(p.paidAmount !== undefined ? p.paidAmount : (p.paid !== undefined ? p.paid : (p.amountPaid || p.amount || 0)));
    if (paidVal <= 0) return false;

    const pId = String(p.payId || p.paymentId || p.id || '').toLowerCase();
    const pSite = String(p.siteName || p.project || p.site || p.projectName || '').trim();
    const pVendor = String(p.vendor || p.partyName || p.supplier || '').trim();
    const pMode = String(p.paymentMode || p.mode || '').trim();
    const pAccount = String(p.accountNumber || p.bankAccount || '').trim();
    const pRemarks = String(p.remarks || '').toLowerCase();
    const pDate = String(p.paymentDate || p.date || (p.created_at ? p.created_at.split('T')[0] : '')).split('T')[0];

    const q = paymentSearchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      pId.includes(q) || 
      pSite.toLowerCase().includes(q) ||
      pVendor.toLowerCase().includes(q) || 
      pMode.toLowerCase().includes(q) || 
      pAccount.toLowerCase().includes(q) || 
      pRemarks.includes(q);

    const matchesSite = !paymentSiteFilter || paymentSiteFilter === 'All Sites' || pSite === paymentSiteFilter;
    const matchesVendor = paymentVendorFilter === 'All Vendors' || pVendor === paymentVendorFilter;
    const matchesMode = paymentModeFilter === 'All Modes' || pMode === paymentModeFilter;
    const matchesAccount = paymentAccountFilter === 'All Accounts' || pAccount === paymentAccountFilter;

    let matchesDate = true;
    if (paymentStartDate && pDate < paymentStartDate) matchesDate = false;
    if (paymentEndDate && pDate > paymentEndDate) matchesDate = false;

    return matchesSearch && matchesSite && matchesVendor && matchesMode && matchesAccount && matchesDate;
  });

  const totalFilteredPaid = filteredPaymentsList.reduce((acc, p) => acc + parseNum(p.paidAmount !== undefined ? p.paidAmount : (p.paid !== undefined ? p.paid : (p.amountPaid || p.amount || 0))), 0);

  // Export Handlers
  const handleExportPaymentsExcel = () => {
    const exportRows = filteredPaymentsList.map((p, idx) => [
      idx + 1,
      p.payId || p.paymentId || p.id || `26-27/${String(idx + 1).padStart(3, '0')}`,
      formatDDMMYYYY(p.paymentDate || p.date || ''),
      p.siteName || p.project || p.site || p.projectName || '-',
      p.vendor || p.partyName || p.supplier || '-',
      p.paymentMode || p.mode || '-',
      p.accountNumber || p.bankAccount || '-',
      parseNum(p.paidAmount !== undefined ? p.paidAmount : (p.paid !== undefined ? p.paid : (p.amountPaid || p.amount || 0))),
      p.remarks || '-'
    ]);

    exportRows.push([
      'GRAND TOTAL',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      totalFilteredPaid,
      '-'
    ]);

    exportToExcel(
      'Payment Register Statement',
      'Payment_Register',
      ['Sl No.', 'Pay ID', 'Payment Date', 'Site / Project', 'Vendor', 'Mode of Transaction', 'Account Number', 'Paid Amount (₹)', 'Remarks'],
      exportRows,
      paymentDatePreset !== 'all' ? `${paymentDatePreset.toUpperCase()} (${paymentStartDate || 'Start'} to ${paymentEndDate || 'Present'})` : 'All Time',
      paymentVendorFilter !== 'All Vendors' ? paymentVendorFilter : 'All Vendors'
    );
  };

  const handleExportPaymentsPDF = () => {
    const exportRows = filteredPaymentsList.map((p, idx) => [
      idx + 1,
      p.payId || p.paymentId || p.id || `26-27/${String(idx + 1).padStart(3, '0')}`,
      formatDDMMYYYY(p.paymentDate || p.date || ''),
      p.siteName || p.project || p.site || p.projectName || '-',
      p.vendor || p.partyName || p.supplier || '-',
      p.paymentMode || p.mode || '-',
      p.accountNumber || p.bankAccount || '-',
      parseNum(p.paidAmount !== undefined ? p.paidAmount : (p.paid !== undefined ? p.paid : (p.amountPaid || p.amount || 0))),
      p.remarks || '-'
    ]);

    exportRows.push([
      'GRAND TOTAL',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      totalFilteredPaid,
      '-'
    ]);

    exportToPDF(
      'Payment Register Statement',
      ['Sl No.', 'Pay ID', 'Payment Date', 'Site / Project', 'Vendor', 'Mode of Transaction', 'Account Number', 'Paid Amount (₹)', 'Remarks'],
      exportRows,
      paymentDatePreset !== 'all' ? `${paymentDatePreset.toUpperCase()} (${paymentStartDate || 'Start'} to ${paymentEndDate || 'Present'})` : 'All Time',
      paymentVendorFilter !== 'All Vendors' ? paymentVendorFilter : 'All Vendors'
    );
  };

  return (
    <div className="space-y-6">
      
      {/* 1. TOP HEADER & SUMMARY CARD (Matches Ledger Hub Header) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <IndianRupee className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-extrabold text-lg text-white tracking-tight">Payments Register</h2>
              <p className="text-xs text-slate-400">Direct disbursement entry & financial transaction ledger linked to masters</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ExportButton 
              label="Export Payments"
              onExportExcel={handleExportPaymentsExcel}
              onExportPdf={handleExportPaymentsPDF}
            />
            <span className="bg-slate-800 text-emerald-400 text-xs font-mono font-bold px-3 py-1.5 rounded-xl border border-slate-700 shadow-xs">
              {filteredPaymentsList.length} Entries
            </span>
          </div>
        </div>
      </div>

      {/* 2. SUMMARY METRIC BANNER (Matches Ledger Net Total Summary Banner) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md text-white grid grid-cols-1 sm:grid-cols-3 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
            Recorded Transactions
          </span>
          <div className="text-xl font-black font-mono text-slate-100">
            {filteredPaymentsList.length} <span className="text-xs font-normal text-slate-400">Disbursements</span>
          </div>
        </div>

        <div className="flex flex-col sm:pl-6 pt-3 sm:pt-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block mb-1">
            Total Disbursed Amount
          </span>
          <div className="text-xl font-black font-mono text-emerald-400">
            ₹ {totalFilteredPaid.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="flex flex-col sm:pl-6 pt-3 sm:pt-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block mb-1">
            Active Pay ID Serial
          </span>
          <div className="text-xl font-black font-mono text-amber-300">
            {paymentForm.payId || calculateNextPaymentId(paymentsList, paymentForm.paymentDate)}
          </div>
        </div>
      </div>

      {/* 3. FRESH PAYMENT DATA ENTRY FORM (Matches Ledger Card & Input Theme) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Record New Payment Entry</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500">Auto Sequence:</span>
            <span className="font-mono font-extrabold text-xs px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-md">
              {paymentForm.payId || calculateNextPaymentId(paymentsList, paymentForm.paymentDate)}
            </span>
          </div>
        </div>

        <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            
            {/* 1. Pay ID (Auto FY/Seq) */}
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Pay ID *</span>
                <span className="text-[9px] text-amber-700 font-normal">Auto FY</span>
              </label>
              <div className="relative">
                <input 
                  type="text"
                  readOnly
                  value={paymentForm.payId || calculateNextPaymentId(paymentsList, paymentForm.paymentDate)}
                  className="w-full font-mono font-extrabold text-amber-800 border border-amber-200 bg-amber-50 rounded-xl p-2 cursor-not-allowed shadow-2xs"
                />
                <Lock className="w-3.5 h-3.5 text-amber-600 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 2. Payment Date */}
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3 text-blue-600" />
                <span>Payment Date *</span>
              </label>
              <input 
                type="date"
                required
                value={paymentForm.paymentDate}
                onChange={(e) => {
                  const newDate = e.target.value;
                  const nextId = calculateNextPaymentId(paymentsList, newDate);
                  setPaymentForm({
                    ...paymentForm,
                    paymentDate: newDate,
                    payId: nextId
                  });
                }}
                className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
              />
            </div>

            {/* 3. Site / Project Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                Site / Project *
              </label>
              <select 
                required
                value={paymentForm.siteName || paymentForm.project || ''}
                onChange={(e) => setPaymentForm({ ...paymentForm, siteName: e.target.value, project: e.target.value })}
                className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
              >
                <option value="">-- Select Site --</option>
                {availableSites.map((s, i) => (
                  <option key={`site-${i}`} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* 4. Vendor */}
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                Vendor *
              </label>
              <select 
                required
                value={paymentForm.vendor}
                onChange={(e) => setPaymentForm({ ...paymentForm, vendor: e.target.value })}
                className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
              >
                <option value="">-- Select Vendor --</option>
                {masterVendors.map((v, i) => (
                  <option key={`vend-${i}`} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* 5. Mode of Transaction */}
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                Mode of Transaction *
              </label>
              <select 
                required
                value={paymentForm.paymentMode}
                onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}
                className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
              >
                <option value="">-- Select Mode --</option>
                {availableModes.map((m, i) => (
                  <option key={`mode-${i}`} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* 6. Account Number */}
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                Account Number *
              </label>
              <select 
                required
                value={paymentForm.accountNumber}
                onChange={(e) => setPaymentForm({ ...paymentForm, accountNumber: e.target.value })}
                className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer font-mono"
              >
                <option value="">-- Select Bank A/C --</option>
                {availableAccounts.map((acc, i) => (
                  <option key={`acc-${i}`} value={acc.accountNumber}>
                    {acc.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* 7. Paid Amount (₹) */}
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                Paid Amount (₹) *
              </label>
              <div className="relative">
                <input 
                  type="number"
                  step="any"
                  min="1"
                  required
                  placeholder="0.00"
                  value={paymentForm.paidAmount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paidAmount: e.target.value })}
                  className="w-full font-mono font-extrabold text-emerald-700 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl pl-6 pr-2.5 py-2 focus:ring-2 focus:ring-emerald-500 outline-none transition text-sm"
                />
                <span className="text-slate-400 font-bold text-xs absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">₹</span>
              </div>
            </div>

          </div>

          {/* Remarks and Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                Remarks / Settlement Notes (Optional)
              </label>
              <input 
                type="text"
                placeholder="e.g. Clearance disbursement / Material settlement reference"
                value={paymentForm.remarks}
                onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                className="w-full font-medium text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition placeholder-slate-400"
              />
            </div>

            <div className="flex items-end gap-2 pt-2 md:pt-0">
              <button 
                type="submit"
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs py-2 px-3 rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer border border-amber-400"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Payment</span>
              </button>
              <button 
                type="button"
                onClick={() => {
                  const curDate = paymentForm.paymentDate || new Date().toISOString().split('T')[0];
                  setPaymentForm({
                    payId: calculateNextPaymentId(paymentsList, curDate),
                    paymentDate: curDate,
                    siteName: '',
                    project: '',
                    vendor: '',
                    paymentMode: '',
                    accountNumber: '',
                    paidAmount: '',
                    remarks: ''
                  });
                }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-3 rounded-xl transition cursor-pointer border border-slate-200"
                title="Clear Form"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* 4. FILTER RETRIEVAL TOOLBAR (Matches Ledger Filter Toolbar) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Payment Scope & Table Filters</span>
          </div>
          {(paymentDatePreset !== 'all' || paymentStartDate || paymentEndDate || paymentSiteFilter !== 'All Sites' || paymentVendorFilter !== 'All Vendors' || paymentModeFilter !== 'All Modes' || paymentAccountFilter !== 'All Accounts' || paymentSearchQuery) && (
            <button
              type="button"
              onClick={() => {
                setPaymentSearchQuery('');
                setPaymentSiteFilter && setPaymentSiteFilter('All Sites');
                setPaymentVendorFilter('All Vendors');
                setPaymentModeFilter('All Modes');
                setPaymentAccountFilter('All Accounts');
                setPaymentDatePreset('all');
                setPaymentStartDate('');
                setPaymentEndDate('');
              }}
              className="text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg transition cursor-pointer"
            >
              Reset All Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 text-xs">
          
          {/* Filter 1: Date Range Preset */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Date Range Preset</label>
            <select 
              value={paymentDatePreset}
              onChange={(e) => handlePaymentDatePresetChange(e.target.value)}
              className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
            >
              <option value="all">All Time History</option>
              <option value="today">Daily (Today)</option>
              <option value="monthly">Monthly (This Month)</option>
              <option value="yearly">Yearly (Financial Year)</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {/* Filter 2: Start Date */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">From Date</label>
            <input 
              type="date"
              value={paymentStartDate}
              onChange={(e) => {
                setPaymentStartDate(e.target.value);
                setPaymentDatePreset('custom');
              }}
              className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition"
            />
          </div>

          {/* Filter 3: End Date */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">To Date</label>
            <input 
              type="date"
              value={paymentEndDate}
              onChange={(e) => {
                setPaymentEndDate(e.target.value);
                setPaymentDatePreset('custom');
              }}
              className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition"
            />
          </div>

          {/* Filter 4: Site Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Site / Project</label>
            <select 
              value={paymentSiteFilter}
              onChange={(e) => setPaymentSiteFilter && setPaymentSiteFilter(e.target.value)}
              className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
            >
              <option value="All Sites">All Sites</option>
              {availableSites.map((s, i) => (
                <option key={`fs-${i}`} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Filter 5: Vendor Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Vendor</label>
            <select 
              value={paymentVendorFilter}
              onChange={(e) => setPaymentVendorFilter(e.target.value)}
              className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
            >
              <option value="All Vendors">All Vendors</option>
              {masterVendors.map((v, i) => (
                <option key={`fv-${i}`} value={v}>{v}</option>
              ))}
            </select>
          </div>

          {/* Filter 6: Mode Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Mode of Transaction</label>
            <select 
              value={paymentModeFilter}
              onChange={(e) => setPaymentModeFilter(e.target.value)}
              className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
            >
              <option value="All Modes">All Modes</option>
              {availableModes.map((m, i) => (
                <option key={`fm-${i}`} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Filter 7: Search Query */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Search Query</label>
            <input 
              type="text"
              placeholder="Pay ID, Site, A/C..."
              value={paymentSearchQuery}
              onChange={(e) => setPaymentSearchQuery(e.target.value)}
              className="w-full font-bold text-slate-900 border border-slate-300 bg-slate-50 focus:bg-white rounded-xl p-2 focus:ring-2 focus:ring-blue-500 outline-none transition placeholder-slate-400"
            />
          </div>

        </div>
      </div>

      {/* 5. PAYMENTS REGISTER TABLE (EXACT COLOR PALETTE MATCHING LEDGER TABLE) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            
            {/* Thead matching ledger table: bg-slate-900 text-slate-100 font-extrabold uppercase */}
            <thead className="bg-slate-900 text-slate-100 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="p-3.5 pl-4 w-12 text-center">#</th>
                <th className="p-3.5">PAY ID</th>
                <th className="p-3.5">PAYMENT DATE</th>
                <th className="p-3.5">SITE</th>
                <th className="p-3.5">VENDOR</th>
                <th className="p-3.5">MODE OF TRANSACTION</th>
                <th className="p-3.5">ACCOUNT NUMBER</th>
                <th className="p-3.5 text-right">PAID AMOUNT (₹)</th>
                <th className="p-3.5">REMARKS</th>
                <th className="p-3.5 pr-4 text-center w-16">ACTION</th>
              </tr>
            </thead>

            {/* Tbody matching ledger table: divide-y divide-slate-100 font-medium text-slate-800, hover:bg-slate-50 */}
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filteredPaymentsList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500 text-xs">
                    <AlertCircle className="w-7 h-7 text-slate-400 mx-auto mb-2 opacity-60" />
                    <p className="font-bold text-slate-700">No payment records found.</p>
                    <p className="text-slate-500 mt-0.5">Record a disbursement entry using the form above to populate the ledger.</p>
                  </td>
                </tr>
              ) : (
                filteredPaymentsList.map((p, idx) => {
                  const pId = p.payId || p.paymentId || p.id || `26-27/${String(idx + 1).padStart(3, '0')}`;
                  const paidAmt = parseNum(p.paidAmount !== undefined ? p.paidAmount : (p.paid !== undefined ? p.paid : (p.amountPaid || p.amount || 0)));

                  return (
                    <tr key={`pay-row-${p.id || idx}`} className="hover:bg-slate-50 transition">
                      
                      {/* # SL NO */}
                      <td className="p-3.5 pl-4 text-center font-mono font-bold text-slate-500">
                        {idx + 1}
                      </td>

                      {/* PAY ID (styled like Ledger Reference Badge) */}
                      <td className="p-3.5 font-mono font-bold whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                          {pId}
                        </span>
                      </td>

                      {/* PAYMENT DATE */}
                      <td className="p-3.5 font-mono font-bold text-slate-700 whitespace-nowrap">
                        {formatDDMMYYYY(p.paymentDate || p.date || '')}
                      </td>

                      {/* SITE */}
                      <td className="p-3.5 font-bold text-slate-800">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                          {p.siteName || p.project || p.site || p.projectName || '-'}
                        </span>
                      </td>

                      {/* VENDOR (styled like Ledger Supplier Name: font-extrabold text-blue-900) */}
                      <td className="p-3.5 font-extrabold text-blue-900">
                        {p.vendor || p.partyName || p.supplier || '-'}
                      </td>

                      {/* MODE OF TRANSACTION */}
                      <td className="p-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-300">
                          {p.paymentMode || p.mode || '-'}
                        </span>
                      </td>

                      {/* ACCOUNT NUMBER (styled like Ledger Invoice: font-mono font-bold text-blue-700) */}
                      <td className="p-3.5 font-mono font-bold text-blue-700">
                        {p.accountNumber || p.bankAccount || '-'}
                      </td>

                      {/* PAID AMOUNT (styled like Ledger Payment Column: font-mono font-extrabold text-emerald-600 text-sm) */}
                      <td className="p-3.5 text-right font-mono font-extrabold text-emerald-600 text-sm whitespace-nowrap">
                        ₹{paidAmt.toLocaleString('en-IN')}
                      </td>

                      {/* REMARKS */}
                      <td className="p-3.5 text-slate-600 text-xs italic max-w-xs truncate" title={p.remarks || ''}>
                        {p.remarks || '-'}
                      </td>

                      {/* ACTION */}
                      <td className="p-3.5 pr-4 text-center">
                        <button 
                          onClick={() => handleDeletePayment(pId)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Delete Payment Entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Tfoot matching Ledger Table: bg-slate-900 text-white font-extrabold text-xs border-t-2 border-amber-500 */}
            {filteredPaymentsList.length > 0 && (
              <tfoot className="bg-slate-900 text-white font-extrabold text-xs border-t-2 border-amber-500">
                <tr>
                  <td colSpan={7} className="p-3.5 pl-4 uppercase tracking-wider text-amber-300">
                    Grand Total ({filteredPaymentsList.length} Payment Disbursements)
                  </td>
                  <td className="p-3.5 text-right font-mono text-sm font-black text-emerald-400">
                    ₹{totalFilteredPaid.toLocaleString('en-IN')}
                  </td>
                  <td colSpan={2} className="p-3.5 pr-4 text-right text-slate-400 font-mono text-[11px]">
                    Consolidated Payment Register
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

    </div>
  );
}
