import React, { useState, useEffect } from 'react';
import HomePage from './components/HomePage';
import LoginPage from './app/login/page';
import CompanyHubPage from './components/CompanyHubPage';
import CeoDashboard from './components/CeoDashboard';
import ManagerDashboard from './app/dashboard/manager/page';
import AssistantDashboard from './app/dashboard/assistant/page';
import ProtectedRoute from './components/ProtectedRoute';
import GoogleSheetsSyncModal from './components/GoogleSheetsSyncModal';
import ToastNotification from './components/ToastNotification';
import { initSessionInactivityMonitor } from './lib/security';
import { getSheetsConnectionState, startAutoSyncLoop } from './lib/saveToDatabase';
import { syncAllFromCloud } from './lib/dataSync';
import CreateCompanyModal from './components/CreateCompanyModal';
import { safeSetItem } from './lib/storageHelper';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const stored = localStorage.getItem('rgc_current_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [currentPath, setCurrentPath] = useState<string>(() => {
    try {
      const storedPath = window.location.pathname;
      const savedClientCode = (localStorage.getItem('rgc_client_code') || '').trim().toLowerCase();
      if (savedClientCode === 'ceo@nrman' && (storedPath === '/ceo' || !storedPath || storedPath === '/')) {
        return '/ceo';
      }
      const verified = localStorage.getItem('rgc_client_code_verified') === 'true' || sessionStorage.getItem('rgc_client_code_verified') === 'true';
      if (storedPath && storedPath !== '/' && (storedPath === '/home' || verified)) return storedPath;
      
      const savedUser = localStorage.getItem('rgc_current_user');
      if (savedUser) {
        return '/hub';
      }
      return '/home';
    } catch {
      return '/home';
    }
  });

  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [sheetsState, setSheetsState] = useState<any>(() => getSheetsConnectionState());

  // Keep path synced with browser history
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/home');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Initialize auto sync loop & listen to state changes
  useEffect(() => {
    startAutoSyncLoop();
    const handleStatusChange = (e: any) => {
      if (e?.detail) {
        setSheetsState(e.detail);
      }
    };
    window.addEventListener('rgc_sheets_status_change', handleStatusChange);
    return () => {
      window.removeEventListener('rgc_sheets_status_change', handleStatusChange);
    };
  }, []);

  const navigateTo = (path: string) => {
    try {
      window.history.pushState({}, '', path);
    } catch (e) {
      console.warn('Navigation error:', e);
    }
    setCurrentPath(path);
  };

  const handleLoginSuccess = (loginPayload: any) => {
    const user = loginPayload?.user || loginPayload;
    const role = loginPayload?.designation || loginPayload?.role || user?.designation || user?.role || 'Accounts Assistant';
    const userSession = {
      ...user,
      role,
      designation: role
    };
    setCurrentUser(userSession);
    safeSetItem('rgc_current_user', JSON.stringify(userSession));
    try {
      syncAllFromCloud();
    } catch (_) {}

    // Open dashboard according to logined id and designation
    const roleLower = String(role).toLowerCase();
    if (roleLower.includes('manager') || roleLower.includes('director')) {
      navigateTo('/dashboard/manager');
    } else {
      navigateTo('/dashboard/assistant');
    }
  };

  const handleSelectCompany = (company: any) => {
    safeSetItem('rgc_active_company', JSON.stringify(company));
    window.dispatchEvent(new CustomEvent('rgc_company_changed', { detail: company }));
    // Clear employee user session when company is selected so Employee Login is prompted
    setCurrentUser(null);
    localStorage.removeItem('rgc_current_user');
    navigateTo('/login');
  };

  const handleClientCodeSuccess = (verifiedCode?: string) => {
    const code = (verifiedCode || localStorage.getItem('rgc_client_code') || '').trim().toLowerCase();
    if (code === 'ceo@nrman') {
      navigateTo('/ceo');
    } else {
      navigateTo('/hub');
    }
  };

  // Employee logout -> directs to employee login page
  const handleEmployeeLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('rgc_current_user');
    navigateTo('/login');
  };

  // Company Hub logout -> directs to NrMAN home page
  const handleHubLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('rgc_current_user');
    localStorage.removeItem('rgc_client_code_verified');
    navigateTo('/home');
  };

  // Session inactivity auto-logout protection (15 minutes idle limit)
  useEffect(() => {
    if (!currentUser) return;
    const cleanup = initSessionInactivityMonitor(() => {
      handleEmployeeLogout();
    });
    return cleanup;
  }, [currentUser]);

  // View Resolution Logic
  const clientCodeVerified = typeof window !== 'undefined' && (
    localStorage.getItem('rgc_client_code_verified') === 'true' ||
    sessionStorage.getItem('rgc_client_code_verified') === 'true'
  );
  const showHomePage = (currentPath === '/home' || currentPath === '/' || !currentPath);
  const protectedClientPath = currentPath === '/hub' || currentPath === '/ceo' || currentPath.startsWith('/dashboard/');

  useEffect(() => {
    if (protectedClientPath && !clientCodeVerified) navigateTo('/home');
  }, [protectedClientPath, clientCodeVerified]);

  return (
    <div className="min-h-screen w-full bg-slate-950 font-sans text-slate-100 flex flex-col assistant-scrollbar">
      {/* Global In-App Toast Notification Engine */}
      <ToastNotification />

      {/* Main View Container */}
      <div className="flex-1 flex flex-col w-full min-h-screen">
        {showHomePage ? (
          <div className="flex-1 w-full min-h-screen">
            <HomePage 
              onClientCodeVerified={handleClientCodeSuccess}
            />
          </div>
        ) : currentPath === '/ceo' ? (
          <div className="flex-1 w-full min-h-screen">
            <CeoDashboard 
              onLogout={handleHubLogout}
              onNavigateToHub={() => navigateTo('/hub')}
            />
          </div>
        ) : currentPath === '/hub' ? (
          <div className="flex-1 w-full min-h-screen">
            <CompanyHubPage
              currentUser={currentUser}
              onSelectCompany={handleSelectCompany}
              onLogout={handleHubLogout}
              onNavigateToCeo={() => navigateTo('/ceo')}
            />
          </div>
        ) : currentPath === '/login' ? (
          <div className="flex-1 w-full min-h-screen overflow-y-auto assistant-scrollbar">
            <LoginPage 
              onNavigate={navigateTo} 
              onLoginSuccess={handleLoginSuccess}
              onBackToHome={() => navigateTo('/home')}
            />
          </div>
        ) : currentPath === '/dashboard/manager' ? (
          <div className="flex-1 w-full min-h-screen">
            <ProtectedRoute allowedRoles={['Accounts Manager', 'Manager', 'Director']} currentUser={currentUser} onNavigate={navigateTo}>
              <ManagerDashboard 
                onNavigate={navigateTo} 
                currentUser={currentUser} 
                onLogout={handleEmployeeLogout}
                onOpenSheetsModal={() => setIsSheetsModalOpen(true)}
                onOpenCompanyModal={() => setIsCompanyModalOpen(true)}
                sheetsState={sheetsState}
              />
            </ProtectedRoute>
          </div>
        ) : currentPath === '/dashboard/assistant' ? (
          <div className="flex-1 w-full min-h-screen">
            <ProtectedRoute allowedRoles={['Accounts Assistant', 'Assistant']} currentUser={currentUser} onNavigate={navigateTo}>
              <AssistantDashboard 
                onNavigate={navigateTo} 
                currentUser={currentUser} 
                onLogout={handleEmployeeLogout}
                onOpenSheetsModal={() => setIsSheetsModalOpen(true)}
                onOpenCompanyModal={() => setIsCompanyModalOpen(true)}
                sheetsState={sheetsState}
              />
            </ProtectedRoute>
          </div>
        ) : (
          <div className="flex-1 w-full min-h-screen overflow-y-auto assistant-scrollbar">
            <LoginPage 
              onNavigate={navigateTo} 
              onLoginSuccess={handleLoginSuccess}
              onBackToHome={() => navigateTo('/home')}
            />
          </div>
        )}
      </div>

      {/* Google Sheets Live Data Gateway Modal */}
      <GoogleSheetsSyncModal 
        isOpen={isSheetsModalOpen} 
        onClose={() => setIsSheetsModalOpen(false)} 
      />

      {/* Automated Multi-Company Workspace Creation Pop-up Overlay */}
      {isCompanyModalOpen && (
        <CreateCompanyModal 
          isOpen={isCompanyModalOpen}
          onClose={() => setIsCompanyModalOpen(false)} 
          onCompanyCreated={() => {
            setIsCompanyModalOpen(false);
            try {
              syncAllFromCloud();
            } catch (_) {}
          }}
          onSuccess={() => {
            setIsCompanyModalOpen(false);
            try {
              syncAllFromCloud();
            } catch (_) {}
          }}
        />
      )}
    </div>
  );
}
