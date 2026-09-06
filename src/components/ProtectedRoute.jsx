"use client";
import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export default function ProtectedRoute({ children, allowedRoles = [], currentUser, onNavigate }) {
  const [checking, setChecking] = useState(true);
  const [authStatus, setAuthStatus] = useState('loading'); // 'loading' | 'authorized' | 'forbidden' | 'unauthenticated'
  const [targetRedirect, setTargetRedirect] = useState(null);

  useEffect(() => {
    verifyRoleAccess();
  }, [currentUser, allowedRoles]);

  const verifyRoleAccess = async () => {
    setChecking(true);
    let activeUser = currentUser;
    let designation = currentUser?.role || currentUser?.designation || null;

    // Check local storage session fallback if not set
    if (!activeUser || !designation) {
      try {
        const storedUserStr = localStorage.getItem('rgc_current_user');
        if (storedUserStr) {
          const parsed = JSON.parse(storedUserStr);
          activeUser = parsed;
          designation = parsed?.role || parsed?.designation || null;
        }
      } catch (e) {
        console.error('Error reading stored current user:', e);
      }
    }

    // 3. Fallback to check local profiles if email exists
    if (activeUser?.email && !designation) {
      try {
        const pStr = localStorage.getItem('rgc_profiles');
        if (pStr) {
          const profiles = JSON.parse(pStr);
          const activeEmailLower = String(activeUser.email || '').toLowerCase();
          const match = Array.isArray(profiles) ? profiles.find(p => p && p.email && String(p.email).toLowerCase() === activeEmailLower) : null;
          if (match?.designation) {
            designation = match.designation;
            activeUser.role = designation;
            activeUser.designation = designation;
          }
        }
      } catch (e) {
        console.error('Error checking local profile:', e);
      }
    }

    // Validate permissions
    if (!activeUser && !designation) {
      setAuthStatus('unauthenticated');
      setTargetRedirect('/login');
      setChecking(false);
      return;
    }

    // Normalize roles comparison
    const isAuthorized = allowedRoles.some(role => {
      if (!designation || !role) return false;
      const cleanDesignation = String(designation).toLowerCase().trim();
      const cleanRole = String(role).toLowerCase().trim();

      if (cleanDesignation === cleanRole) return true;
      if (cleanRole === 'director' && (cleanDesignation.includes('director') || cleanDesignation === 'director')) return true;
      if (cleanRole === 'manager' && (cleanDesignation.includes('manager') || cleanDesignation === 'manager')) return true;
      if (cleanRole === 'assistant' && (cleanDesignation.includes('assistant') || cleanDesignation === 'assistant')) return true;
      return false;
    });

    if (isAuthorized) {
      setAuthStatus('authorized');
      setTargetRedirect(null);
    } else {
      setAuthStatus('forbidden');
      // Determine allowed dashboard for automatic redirection
      const roleLower = String(designation || '').toLowerCase();
      if (roleLower.includes('manager')) {
        setTargetRedirect('/dashboard/manager');
      } else if (roleLower.includes('assistant')) {
        setTargetRedirect('/dashboard/assistant');
      } else if (roleLower.includes('director')) {
        setTargetRedirect('/dashboard/director');
      } else {
        setTargetRedirect('/login');
      }
    }

    setChecking(false);
  };

  useEffect(() => {
    if (!checking && (authStatus === 'forbidden' || authStatus === 'unauthenticated') && targetRedirect) {
      onNavigate(targetRedirect);
    }
  }, [checking, authStatus, targetRedirect, onNavigate]);

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-6 py-4 rounded-2xl shadow-xl">
          <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
          <div className="text-left">
            <div className="text-xs font-bold text-white tracking-wide">Authenticating Route Authorization...</div>
            <div className="text-[10px] text-slate-400">Verifying Designation Scope</div>
          </div>
        </div>
      </div>
    );
  }

  if (authStatus !== 'authorized') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-6 py-4 rounded-2xl shadow-xl">
          <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
          <div className="text-left">
            <div className="text-xs font-bold text-white tracking-wide">Redirecting to Permitted Workspace...</div>
          </div>
        </div>
      </div>
    );
  }

  return children;
}

/**
 * Higher-Order Component (HOC) version of route protection
 * Usage: export default withRouteProtection(ManagerDashboard, ['Accounts Manager']);
 */
export function withRouteProtection(WrappedComponent, allowedRoles = []) {
  return function ProtectedComponent(props) {
    return (
      <ProtectedRoute allowedRoles={allowedRoles} currentUser={props.currentUser} onNavigate={props.onNavigate}>
        <WrappedComponent {...props} />
      </ProtectedRoute>
    );
  };
}
