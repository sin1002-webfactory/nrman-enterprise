"use client";
import { useState } from 'react';
import { UploadCloud, FileSpreadsheet, X, Check, AlertCircle, Play, FileText } from 'lucide-react';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { sanitizeFileName, sanitizeObject } from '@/lib/security';

export default function TableImportModal({ isOpen, onClose, tableName, onImport, sampleCsv, sampleRows }) {
  const [csvText, setCsvText] = useState('');
  const [previewData, setPreviewData] = useState([]);
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'paste' | 'sample'
  const [errorMsg, setErrorMsg] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);

  if (!isOpen) return null;

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const safeName = sanitizeFileName(file.name);
    setFileName(safeName);
    setErrorMsg('');
    setParsing(true);

    const fileExt = file.name.split('.').pop()?.toLowerCase();

    try {
      if (fileExt === 'xlsx' || fileExt === 'xls') {
        // Parse Excel file using ExcelJS
        const workbook = new ExcelJS.Workbook();
        const buffer = await file.arrayBuffer();
        await workbook.xlsx.load(buffer);
        
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          setErrorMsg('No worksheet found in the uploaded Excel file.');
          setParsing(false);
          return;
        }

        const rawRows = [];
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          // row.values has 1-based index
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];
          rawRows.push(values.map(v => (v !== null && v !== undefined ? (typeof v === 'object' && v.result !== undefined ? String(v.result) : String(v)) : '')));
        });

        if (rawRows.length === 0) {
          setErrorMsg('The Excel file appears to be empty.');
          setParsing(false);
          return;
        }

        const headers = rawRows[0].map(h => String(h || '').trim());
        const dataObjects = [];

        for (let i = 1; i < rawRows.length; i++) {
          const rowValues = rawRows[i];
          if (rowValues && rowValues.some(cell => cell !== null && cell !== '')) {
            const rowObj = {};
            headers.forEach((header, index) => {
              if (header) {
                rowObj[header] = rowValues[index] !== undefined ? String(rowValues[index]) : '';
              }
            });
            dataObjects.push(rowObj);
          }
        }

        if (dataObjects.length === 0) {
          setErrorMsg('No valid data rows found below header row in Excel file.');
        } else {
          setPreviewData(dataObjects);
        }
      } else {
        // Parse CSV or Text
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.errors && results.errors.length > 0 && results.data.length === 0) {
              setErrorMsg('CSV parsing error: ' + results.errors[0].message);
            } else if (results.data.length === 0) {
              setErrorMsg('No valid data rows found in CSV file.');
            } else {
              setPreviewData(results.data);
            }
            setParsing(false);
          },
          error: (err) => {
            setErrorMsg('Failed to parse file: ' + err.message);
            setParsing(false);
          }
        });
        return;
      }
    } catch (err) {
      console.error("Excel parse error:", err);
      setErrorMsg('Failed to parse Excel file. Make sure it is a valid .xlsx spreadsheet: ' + err.message);
    } finally {
      setParsing(false);
    }
  };

  const parseAndSetCsv = (rawText) => {
    setErrorMsg('');
    if (!rawText || !rawText.trim()) {
      setErrorMsg('Please enter or paste CSV text first.');
      return;
    }

    try {
      Papa.parse(rawText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            setPreviewData(results.data);
          } else {
            setErrorMsg('Could not parse valid records from pasted CSV data.');
          }
        }
      });
    } catch (err) {
      setErrorMsg('Failed to parse CSV text: ' + err.message);
    }
  };

  const handleLoadSample = () => {
    if (sampleRows && sampleRows.length > 0) {
      setPreviewData(sampleRows);
      setErrorMsg('');
    } else if (sampleCsv) {
      parseAndSetCsv(sampleCsv);
    }
  };

  const handleConfirm = () => {
    if (previewData.length === 0) {
      setErrorMsg('No parsed data rows to import.');
      return;
    }
    const cleanRows = sanitizeObject(previewData);
    onImport(cleanRows);
    setPreviewData([]);
    setCsvText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Import Data to {tableName}</h3>
              <p className="text-[11px] text-slate-400">Bulk upload .csv or .xlsx records directly into this registry table</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Import Controls */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Tabs */}
          <div className="flex border-b border-slate-200 gap-4">
            <button
              onClick={() => setActiveTab('upload')}
              className={`pb-2 text-xs font-bold transition border-b-2 cursor-pointer ${
                activeTab === 'upload' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Upload Excel / CSV File
            </button>
            <button
              onClick={() => setActiveTab('paste')}
              className={`pb-2 text-xs font-bold transition border-b-2 cursor-pointer ${
                activeTab === 'paste' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Paste CSV / Text Data
            </button>
            <button
              onClick={() => setActiveTab('sample')}
              className={`pb-2 text-xs font-bold transition border-b-2 cursor-pointer ${
                activeTab === 'sample' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Load Sample Template
            </button>
          </div>

          {/* TAB 1: UPLOAD */}
          {activeTab === 'upload' && (
            <div className="border-2 border-dashed border-slate-300 hover:border-amber-500 bg-slate-50 hover:bg-amber-50/30 rounded-xl p-8 text-center transition cursor-pointer relative">
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv, .txt" 
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <UploadCloud className="w-10 h-10 text-amber-500 mx-auto mb-2" />
              <p className="font-bold text-slate-800 text-xs">
                {parsing ? 'Parsing Excel / CSV File...' : fileName ? `Loaded: ${fileName}` : 'Click or drag & drop Excel (.xlsx, .xls) or CSV file'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Supported formats: Microsoft Excel (.xlsx, .xls) and CSV (.csv, .txt)
              </p>
            </div>
          )}

          {/* TAB 2: PASTE */}
          {activeTab === 'paste' && (
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Paste Comma-Separated Values (CSV)</label>
              <textarea
                rows={5}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={sampleCsv || "Header1, Header2, Header3\nValue1, Value2, Value3"}
                className="w-full border border-slate-300 rounded-xl p-3 font-mono text-xs focus:ring-2 focus:ring-amber-500/30 outline-none"
              />
              <button
                type="button"
                onClick={() => parseAndSetCsv(csvText)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
              >
                Parse Pasted CSV
              </button>
            </div>
          )}

          {/* TAB 3: SAMPLE TEMPLATE */}
          {activeTab === 'sample' && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-700">Pre-configured Sample Data for {tableName}</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">Ready to Import</span>
              </div>
              <p className="text-xs text-slate-500">
                Click below to instantly load structured demo records for {tableName} to test real-time table sync across all dashboards.
              </p>
              <button
                type="button"
                onClick={handleLoadSample}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Load Sample Records</span>
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Preview Table */}
          {previewData.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Parsed Preview ({previewData.length} Rows Ready)</span>
                </p>
                <span className="text-[10px] text-slate-400">Verify column values before appending</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      {Object.keys(previewData[0]).map((k, i) => (
                        <th key={i} className="p-2 pl-3 border-b border-slate-200">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-amber-50/30">
                        {Object.values(row).map((val, ci) => (
                          <td key={ci} className="p-2 pl-3 text-slate-700 font-medium whitespace-nowrap">{String(val)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
          <span className="text-[11px] text-slate-500">
            {previewData.length > 0 ? `${previewData.length} records ready to commit.` : 'Select or paste CSV to preview.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-bold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={previewData.length === 0}
              onClick={handleConfirm}
              className={`px-5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                previewData.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>Import {previewData.length > 0 ? `${previewData.length} Rows` : ''}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
