"use client";
import { ShieldAlert, ArrowLeft, Building2, FileText, BarChart3, LogOut, Lock } from 'lucide-react';

export default function ForbiddenPage({ onNavigate, currentUser, requiredRoles = [] }) {
  const userRole = currentUser?.role || currentUser?.designation || 'Unassigned / Guest';
  const userEmail = currentUser?.email || currentUser?.user?.email || 'Guest User';

  const getTargetDashboard = (role) => {
    if (role === 'Accounts Manager') return '/dashboard/manager';
    if (role === 'Accounts Assistant') return '/dashboard/assistant';
    if (['Director', 'Managing Director', 'Project Director'].includes(role)) return '/dashboard/director';
    return '/login';
  };

  const targetDashboard = getTargetDashboard(userRole);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-600"></div>

        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 mb-5 border border-rose-500/20 shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <span className="bg-rose-500/10 text-rose-400 font-mono text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full border border-rose-500/20 inline-block mb-3">
          403 Access Forbidden
        </span>

        <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
          Unauthorized Route Access
        </h1>

        <p className="text-slate-400 text-xs leading-relaxed mb-6">
          Your account designation profile (<span className="text-amber-400 font-bold">{userRole}</span>) does not have authorization permissions to access this restricted workspace route.
        </p>

        {/* Info Box */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-left space-y-2 mb-6 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <span className="text-slate-500 font-medium">Logged Account:</span>
            <span className="text-slate-300 font-mono font-bold truncate max-w-[180px]">{userEmail}</span>
          </div>
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <span className="text-slate-500 font-medium">Your Role:</span>
            <span className="text-amber-400 font-bold">{userRole}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Required Roles:</span>
            <span className="text-rose-400 font-mono text-[11px] font-bold">{requiredRoles.join(', ') || 'Restricted'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {userRole !== 'Unassigned / Guest' && targetDashboard !== '/login' && (
            <button
              onClick={() => onNavigate(targetDashboard)}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              {userRole === 'Accounts Manager' && <Building2 className="w-4 h-4" />}
              {userRole === 'Accounts Assistant' && <FileText className="w-4 h-4" />}
              {['Director', 'Managing Director', 'Project Director'].includes(userRole) && <BarChart3 className="w-4 h-4" />}
              <span>Go To Allowed Dashboard ({userRole})</span>
            </button>
          )}

          <button
            onClick={() => onNavigate('/login')}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-slate-400" />
            <span>Re-authenticate at Login</span>
          </button>
        </div>
      </div>
    </div>
  );
}
