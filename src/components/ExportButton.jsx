"use client";
import { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, Printer, ChevronDown } from 'lucide-react';

export default function ExportButton({ onExportExcel, onExportPdf, label = "Export" }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 py-1 overflow-hidden">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportExcel();
            }}
            className="w-full text-left px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-slate-800 flex items-center gap-2 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export as Excel (.csv)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportPdf();
            }}
            className="w-full text-left px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-slate-800 flex items-center gap-2 transition cursor-pointer"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>Export as PDF</span>
          </button>
        </div>
      )}
    </div>
  );
}
