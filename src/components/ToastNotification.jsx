import React, { useState, useEffect } from 'react';
import { FileText, X, User, Building2, Package } from 'lucide-react';
import { isGrnLocallyCreated } from '../lib/dataSync';

// Web Audio API gentle notification chime helper
const playNotificationChime = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 note
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5 note
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    // Ignore audio context autoplay restrictions gracefully
  }
};

export default function ToastNotification() {
  const [toasts, setToasts] = useState([]);

  const addToast = (grnData) => {
    const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    
    // Parse user email or creator
    const creator = grnData.created_by || grnData.loggedBy || grnData.userEmail || grnData.createdBy || 'Field Accounts Staff';
    const grnNum = grnData.grnNumber || grnData.grnNo || 'GRN-NEW';
    const site = grnData.projectName || grnData.siteName || 'Central Site';
    const supplier = grnData.supplier || grnData.supplierName || 'Material Vendor';
    const item = grnData.itemName || grnData.material || 'Construction Supplies';
    const qty = grnData.qty || grnData.quantity || '1';
    const uom = grnData.uom || 'units';
    const amount = grnData.grandTotal || grnData.totalBaseValue || '0.00';
    const timestamp = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const newToast = {
      id: toastId,
      grnNumber: grnNum,
      projectName: site,
      supplier,
      itemName: item,
      qty,
      uom,
      grandTotal: amount,
      created_by: creator,
      timestamp,
      raw: grnData
    };

    setToasts(prev => [newToast, ...prev].slice(0, 5)); // Keep max 5 visible toasts
    playNotificationChime();

    // Auto-dismiss after 7 seconds
    setTimeout(() => {
      removeToast(toastId);
    }, 7000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
    // 1. Listen for custom window event dispatched by Realtime cloud sync in dataSync.js
    const handleRealtimeGrnToast = (e) => {
      if (e && e.detail) {
        // Double check it wasn't logged locally in this session
        if (e.detail.id && isGrnLocallyCreated(e.detail.id)) {
          return;
        }
        addToast(e.detail);
      }
    };

    window.addEventListener('rgc_realtime_grn_toast', handleRealtimeGrnToast);

    // 2. Cross-tab BroadcastChannel listener for multi-tab realtime notifications
    let bc = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('rgc_grn_realtime_channel');
        bc.onmessage = (event) => {
          if (event.data && event.data.type === 'NEW_GRN') {
            const grnData = event.data.payload;
            if (grnData && (!grnData.id || !isGrnLocallyCreated(grnData.id))) {
              addToast(grnData);
            }
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel error:', err);
      }
    }

    return () => {
      window.removeEventListener('rgc_realtime_grn_toast', handleRealtimeGrnToast);
      if (bc) bc.close();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div 
      aria-live="polite" 
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm sm:max-w-md w-full px-4 sm:px-0 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div 
          key={toast.id}
          className="pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-amber-500/50 rounded-xl shadow-2xl overflow-hidden transition-all transform animate-in slide-in-from-bottom-5 duration-300 text-slate-100"
        >
          {/* Header Bar */}
          <div className="bg-slate-800/80 px-4 py-2.5 border-b border-slate-700/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0">
                Realtime Cloud Sync
              </span>
              <span className="text-[11px] text-slate-400 font-mono ml-auto shrink-0">{toast.timestamp}</span>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition cursor-pointer shrink-0"
              title="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Details */}
          <div className="p-4 flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <FileText className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-extrabold text-amber-400 font-mono text-sm tracking-wide truncate">
                  {toast.grnNumber}
                </h4>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                  ₹ {toast.grandTotal}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{toast.projectName}</span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{toast.supplier} • {toast.itemName} ({toast.qty} {toast.uom})</span>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                <User className="w-3 h-3 text-amber-500/80 shrink-0" />
                <span>Logged by <strong className="text-slate-200">{toast.created_by}</strong></span>
              </div>
            </div>
          </div>

          {/* Auto-Dismiss Progress Bar Animation */}
          <div className="h-1 bg-slate-800 w-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 animate-pulse w-full"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Helper to simulate or manually dispatch a GRN toast event
export const triggerGrnRealtimeToast = (grnPayload) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rgc_realtime_grn_toast', { detail: grnPayload }));
  }
};
