"use client";
import { useState } from 'react';
import { checkRateLimit, recordAttempt, clearRateLimit, sanitizeInput } from '@/lib/security';
import { SYNC_KEYS, fetchStorageData, saveStorageData, syncAllFromCloud } from '@/lib/dataSync';
import { Shield, KeyRound, ArrowRight, Lock, CheckCircle2, AlertCircle, Building2, HelpCircle, Eye, EyeOff, Home } from 'lucide-react';

export default function LoginPage({ onNavigate, onLoginSuccess, onBackToHome }) {
  const [loading, setLoading] = useState(false);
  const [activeCompany, setActiveCompany] = useState(() => {
    try {
      const saved = localStorage.getItem('rgc_active_company');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [clientCode, setClientCode] = useState(() => {
    try {
      return localStorage.getItem('rgc_client_code') || 'rgc@nrman';
    } catch {
      return 'rgc@nrman';
    }
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [designation, setDesignation] = useState('Accounts Assistant');
  const [errorMsg, setErrorMsg] = useState('');

  // First Time Login States
  const [showInitModal, setShowInitModal] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState('What is your favorite color?');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [tempUserId, setTempUserId] = useState(null);
  const [savingInit, setSavingInit] = useState(false);

  // Forgot Password States
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [challengeQuestion, setChallengeQuestion] = useState('');
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState(1); // 1: Email, 2: Question, 3: New Pass
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const cleanClient = clientCode.trim().toLowerCase();
    const cleanEmail = email.toLowerCase().trim();

    if (!cleanClient) {
      setErrorMsg('Client Code is required to access your database workspace.');
      setLoading(false);
      return;
    }

    try {
      localStorage.setItem('rgc_client_code', cleanClient);
    } catch (_) {}

    // Cybersecurity Brute-Force Rate Limiting Shield
    const rateCheck = checkRateLimit(`login_${cleanEmail}`, 5, 60000);
    if (!rateCheck.allowed) {
      setErrorMsg(`🛡️ Security Lockout: Too many failed login attempts. Account temporarily locked for ${rateCheck.retryAfterSec} seconds to prevent brute-force attacks.`);
      setLoading(false);
      return;
    }

    if (!cleanEmail || !password || !designation) {
      setErrorMsg('All fields (Client Code, Email, Password, and Designation) are required to log in.');
      setLoading(false);
      return;
    }

    await checkLocalAndProfileLogin();
    setLoading(false);
  };

  const checkLocalAndProfileLogin = async () => {
    let localProfiles = fetchStorageData(SYNC_KEYS.PROFILES);
    if (!localProfiles || localProfiles.length === 0) {
      const uStr = localStorage.getItem('rgc_profiles');
      if (uStr) {
        try { localProfiles = JSON.parse(uStr); } catch (e) {}
      }
    }

    const isSameRole = (d1, d2) => {
      if (!d1 || !d2) return false;
      const c1 = d1.toLowerCase().trim();
      const c2 = d2.toLowerCase().trim();
      if (c1 === c2) return true;
      if (c1.includes('director') && c2.includes('director')) return true;
      if (c1.includes('manager') && c2.includes('manager')) return true;
      if (c1.includes('assistant') && c2.includes('assistant')) return true;
      return false;
    };

    const cleanEmail = email.toLowerCase().trim();
    const match = localProfiles.find(u => u.email && u.email.toLowerCase().trim() === cleanEmail);

    // 1. EMAIL VERIFICATION: If profiles exist in the system, email must be registered
    if (localProfiles.length > 0 && !match) {
      recordAttempt(`login_${cleanEmail}`, 5, 60000);
      setErrorMsg(`Authentication Failed: Unregistered email address '${email}'. Access is restricted to registered staff accounts.`);
      return;
    }

    if (!match) {
      // First time initial setup when no profiles exist in the system yet
      const newId = 'usr-' + Date.now();
      setTempUserId(newId);
      setShowInitModal(true);
      return;
    }

    // 2. DESIGNATION VERIFICATION: Selected designation MUST match registered profile designation
    if (match.designation && !isSameRole(designation, match.designation)) {
      recordAttempt(`login_${cleanEmail}`, 5, 60000);
      setErrorMsg(`Authentication Failed: Designation mismatch! Account '${email}' is registered as '${match.designation}', but '${designation}' was selected. All three (Email, Password, and Designation) must match.`);
      return;
    }

    // 3. PASSWORD VERIFICATION: Password MUST match
    if (match.password) {
      if (match.password !== password) {
        recordAttempt(`login_${cleanEmail}`, 5, 60000);
        setErrorMsg('Authentication Failed: Incorrect password. All three (Email, Password, and Designation) must match.');
        return;
      }
    } else if (password) {
      // Store password for initial user login
      match.password = password;
      const existingIdx = localProfiles.findIndex(p => p.id === match.id || (p && p.email && String(p.email).toLowerCase().trim() === cleanEmail));
      if (existingIdx >= 0) {
        localProfiles[existingIdx] = { ...localProfiles[existingIdx], password };
      } else {
        localProfiles.push({ id: match.id || 'usr-' + Date.now(), email: cleanEmail, password, designation, is_first_time_login: false, is_verified: true });
      }
      saveStorageData(SYNC_KEYS.PROFILES, localProfiles);
    } else {
      recordAttempt(`login_${cleanEmail}`, 5, 60000);
      setErrorMsg('Authentication Failed: Password is required.');
      return;
    }

    clearRateLimit(`login_${cleanEmail}`);

    // ALL THREE MATCHED SUCCESSFULLY (Email, Password & Designation)
    // Check if email was already verified previously across sessions or in local cache
    const verifiedEmailsStr = localStorage.getItem('rgc_verified_emails') || '[]';
    let verifiedEmails = [];
    try { verifiedEmails = JSON.parse(verifiedEmailsStr); } catch (_) {}
    
    const isEmailInVerifiedList = Array.isArray(verifiedEmails) && verifiedEmails.includes(cleanEmail);
    const isProfileVerified = 
      isEmailInVerifiedList || 
      match.is_verified === true || 
      match.is_verified === 'true' || 
      match.is_first_time_login === false || 
      match.is_first_time_login === 'false' ||
      Boolean(match.password); // All registered verified accounts

    // Never ask security questions for verified accounts
    if (isProfileVerified) {
      if (!isEmailInVerifiedList) {
        verifiedEmails.push(cleanEmail);
        localStorage.setItem('rgc_verified_emails', JSON.stringify(verifiedEmails));
      }
      completeLogin({ id: match.id, email: match.email }, match.designation || designation);
    } else if (match.is_first_time_login === true || match.is_first_time_login === 'true') {
      setTempUserId(match.id || 'usr-' + Date.now());
      setShowInitModal(true);
    } else {
      if (!isEmailInVerifiedList) {
        verifiedEmails.push(cleanEmail);
        localStorage.setItem('rgc_verified_emails', JSON.stringify(verifiedEmails));
      }
      completeLogin({ id: match.id, email: match.email }, match.designation || designation);
    }
  };

  const completeLogin = (user, role) => {
    const loginPayload = { user, role, designation: role };
    try {
      localStorage.setItem('rgc_current_user', JSON.stringify({
        user,
        role,
        designation: role,
        email: user?.email || ''
      }));
    } catch (e) {
      console.error('Failed to save current user session:', e);
    }
    
    // Pull fresh data from central store upon login
    try {
      syncAllFromCloud();
    } catch (_) {}

    if (onLoginSuccess) {
      onLoginSuccess(loginPayload);
    } else if (onNavigate) {
      if (role === 'Accounts Manager') onNavigate('/dashboard/manager');
      else if (role === 'Accounts Assistant') onNavigate('/dashboard/assistant');
      else onNavigate('/dashboard/director');
    }
  };

  const handleInitAccount = async () => {
    if (!securityAnswer.trim()) {
      alert('Please enter your response to the security question.');
      return;
    }

    setSavingInit(true);
    const cleanAnswer = securityAnswer.toLowerCase().trim();
    const cleanEmail = email.trim();

    // Update profiles in central synced store
    let profiles = fetchStorageData(SYNC_KEYS.PROFILES);
    if (!profiles || profiles.length === 0) {
      const uStr = localStorage.getItem('rgc_profiles');
      if (uStr) try { profiles = JSON.parse(uStr); } catch (e) {}
    }
    
    const existingIdx = Array.isArray(profiles) ? profiles.findIndex(p => p && (p.id === tempUserId || (p.email && String(p.email).toLowerCase().trim() === cleanEmail.toLowerCase()))) : -1;

    const updatedProfile = {
      id: tempUserId || 'usr-' + Date.now(),
      email: cleanEmail,
      password: password,
      full_name: cleanEmail.split('@')[0],
      designation: designation,
      security_question: securityQuestion,
      security_answer: cleanAnswer,
      is_first_time_login: false,
      is_verified: true,
      is_active: true,
      updated_at: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      profiles[existingIdx] = { ...profiles[existingIdx], ...updatedProfile };
    } else {
      profiles.push(updatedProfile);
    }

    saveStorageData(SYNC_KEYS.PROFILES, profiles);
    localStorage.setItem('rgc_profiles', JSON.stringify(profiles));

    // Permanently remember that this email address has been verified so security questions are never asked again
    const verifiedEmailsStr = localStorage.getItem('rgc_verified_emails') || '[]';
    let verifiedEmails = [];
    try { verifiedEmails = JSON.parse(verifiedEmailsStr); } catch (_) {}
    if (!verifiedEmails.includes(cleanEmail.toLowerCase())) {
      verifiedEmails.push(cleanEmail.toLowerCase());
      localStorage.setItem('rgc_verified_emails', JSON.stringify(verifiedEmails));
    }

    setShowInitModal(false);
    setSavingInit(false);
    completeLogin({ id: updatedProfile.id, email: updatedProfile.email }, designation);
  };

  const handleForgotFlow = async () => {
    setForgotError('');
    setForgotSuccess('');

    if (forgotStep === 1) {
      if (!forgotEmail.trim()) {
        setForgotError('Please enter a valid email handle.');
        return;
      }

      // Query database/local profiles for email security question
      let foundQuestion = null;
      const profiles = fetchStorageData(SYNC_KEYS.PROFILES);
      const match = Array.isArray(profiles) ? profiles.find(p => p && p.email && String(p.email).toLowerCase() === String(forgotEmail || '').toLowerCase()) : null;
      if (match && match.security_question) {
        foundQuestion = match.security_question;
      }

      if (foundQuestion) {
        setChallengeQuestion(foundQuestion);
        setForgotStep(2);
      } else {
        setChallengeQuestion('What is your favorite color?');
        setForgotStep(2);
      }
    } else if (forgotStep === 2) {
      if (!challengeAnswer.trim()) {
        setForgotError('Please enter your response.');
        return;
      }

      let storedAnswer = null;
      const profiles = fetchStorageData(SYNC_KEYS.PROFILES);
      const match = Array.isArray(profiles) ? profiles.find(p => p && p.email && String(p.email).toLowerCase() === String(forgotEmail || '').toLowerCase()) : null;
      if (match && match.security_answer) storedAnswer = match.security_answer;

      const cleanStored = String(storedAnswer || '').toLowerCase().trim();
      const cleanChallenge = String(challengeAnswer || '').toLowerCase().trim();

      if (cleanStored && cleanStored === cleanChallenge) {
        setForgotStep(3);
      } else if (!cleanStored && cleanChallenge.length >= 2) {
        // In case security answer wasn't set originally
        setForgotStep(3);
      } else {
        setForgotError('Incorrect Answer. Security verification failed.');
      }
    } else if (forgotStep === 3) {
      if (!newPassword || newPassword.length < 6) {
        setForgotError('Password must be at least 6 characters long.');
        return;
      }

      // Save updated password in local profile storage and central sync store
      let profiles = fetchStorageData(SYNC_KEYS.PROFILES);
      if (!profiles || profiles.length === 0) {
        const uStr = localStorage.getItem('rgc_profiles');
        if (uStr) try { profiles = JSON.parse(uStr); } catch (e) {}
      }

      profiles = (Array.isArray(profiles) ? profiles : []).map(p => {
        if (p && p.email && String(p.email).toLowerCase().trim() === String(forgotEmail || '').toLowerCase().trim()) {
          return { ...p, password: newPassword, is_first_time_login: false };
        }
        return p;
      });

      saveStorageData(SYNC_KEYS.PROFILES, profiles);
      localStorage.setItem('rgc_profiles', JSON.stringify(profiles));

      setForgotSuccess('Account Password updated successfully! Please log in using your new credentials.');
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotStep(1);
        setForgotError('');
        setForgotSuccess('');
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-between p-3 sm:p-6 lg:p-8 font-sans relative overflow-x-hidden">
      {/* Background Subtle Accent Pattern */}
      <div className="absolute inset-0 bg-slate-900/40 pointer-events-none"></div>

      {/* Header Bar */}
      <header className="relative z-10 flex flex-wrap items-center justify-between max-w-7xl mx-auto w-full gap-2 py-2">
        <div className="flex items-center gap-2.5 sm:gap-3">
          {activeCompany?.logo || activeCompany?.logoBase64 ? (
            <img 
              src={activeCompany.logo || activeCompany.logoBase64} 
              alt={activeCompany.name} 
              className="h-9 sm:h-11 w-auto max-w-[50px] object-contain rounded-lg border border-slate-700 bg-slate-900 p-1 shrink-0" 
            />
          ) : (
            <img src="/logo.svg" alt="Company Logo" className="h-8 sm:h-10 w-auto object-contain shrink-0" />
          )}
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight leading-tight uppercase">
              {activeCompany?.name || activeCompany?.companyName || 'Enterprise ERP Portal'}
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-400 flex items-center gap-1.5">
              <span>Employee Desk Authentication</span>
              {activeCompany?.prefix && (
                <span className="text-amber-400 font-mono font-bold">[{activeCompany.prefix}]</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate ? onNavigate('/hub') : (window.location.href = '/hub')}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl transition cursor-pointer"
            title="Switch to another company workspace"
          >
            <Building2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xs:inline">Company Hub</span>
          </button>

          {onBackToHome && (
            <button
              id="login-back-to-home-btn"
              type="button"
              onClick={onBackToHome}
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-xl transition cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Home Page</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Authentication Card */}
      <main className="relative z-10 my-auto py-6 sm:py-10 flex items-center justify-center w-full px-1">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600"></div>

          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-500/10 text-amber-400 mb-2.5 sm:mb-3 border border-amber-500/20">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Employee Login</h2>
            <p className="text-xs text-slate-400 mt-1">
              Sign in with your staff credentials and designation
            </p>

            {/* Active Company Context Badge */}
            {activeCompany && (
              <div className="mt-3 p-2 bg-slate-950/80 border border-slate-800 rounded-xl text-[11px] flex items-center justify-between text-left">
                <div className="truncate">
                  <div className="font-bold text-amber-400 truncate">{activeCompany.name || activeCompany.companyName}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Sheet ID: {activeCompany.spreadsheetId || `sheet_${activeCompany.prefix?.toLowerCase()}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate ? onNavigate('/hub') : (window.location.href = '/hub')}
                  className="text-[10px] text-amber-400 hover:text-amber-300 font-bold px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 shrink-0 ml-2"
                >
                  Change &rarr;
                </button>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-300">
                  Client Code
                </label>
                <span className="text-[10px] text-amber-400 font-mono">Master Database Identifier</span>
              </div>
              <div className="relative">
                <input 
                  type="text" 
                  required 
                  value={clientCode}
                  placeholder="Enter client code"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition font-mono" 
                  onChange={(e) => setClientCode(e.target.value)} 
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                Work Email Handle
              </label>
              <input 
                type="email" 
                required 
                value={email}
                placeholder="e.g. admin@royalgokul.com"
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition" 
                onChange={(e) => setEmail(e.target.value)} 
              />
            </div>

            <div>
              <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                Account Password
              </label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  required 
                  value={password}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition" 
                  onChange={(e) => setPassword(e.target.value)} 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-400 transition cursor-pointer p-1"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                Designation Role
              </label>
              <select 
                value={designation}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition font-medium cursor-pointer" 
                onChange={(e) => setDesignation(e.target.value)}
              >
                <option value="Accounts Assistant">Accounts Assistant</option>
                <option value="Accounts Manager">Accounts Manager</option>
              </select>
            </div>

            <button 
              type="submit" 
              disabled={loading} 
              className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold py-3 sm:py-3.5 rounded-xl transition-all duration-200 shadow-lg shadow-amber-500/20 cursor-pointer flex items-center justify-center gap-2 text-sm"
            >
              <span>{loading ? "Verifying Credentials..." : "Authenticate & Sign In"}</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </form>

          <div className="mt-5 pt-4 sm:mt-6 sm:pt-5 border-t border-slate-800 text-center">
            <button 
              type="button"
              onClick={() => { setShowForgotModal(true); setForgotStep(1); setForgotEmail(email); }} 
              className="text-slate-400 hover:text-amber-400 text-xs font-medium transition cursor-pointer inline-flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] sm:text-xs">Forgot Password? Recover via Security Question</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center text-[10px] sm:text-xs text-slate-500 py-3 border-t border-slate-900">
        <p>© 2026 Royal Gokul Constructions. All Rights Reserved. Restricted Enterprise Systems.</p>
      </footer>

      {/* FIRST-TIME ACCOUNT LOCK TRIGGER INITIALIZATION MODAL */}
      {showInitModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/40 p-5 sm:p-8 rounded-2xl max-w-md w-full shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-3 sm:mb-4 border border-amber-500/30">
              <Lock className="w-5 h-5" />
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-white mb-1">First-Time Account Initialization</h2>
            <p className="text-slate-400 text-xs mb-5 sm:mb-6 leading-relaxed">
              For security compliance, first-time logins require setting a personal Security Question for account recovery before entering the portal.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Select Security Question
                </label>
                <select 
                  className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-xl text-xs sm:text-sm focus:border-amber-500 outline-none" 
                  value={securityQuestion} 
                  onChange={(e) => setSecurityQuestion(e.target.value)}
                >
                  <option value="What is your favorite color?">What is your favorite color?</option>
                  <option value="What is your mother’s maiden name?">What is your mother’s maiden name?</option>
                  <option value="What was the name of your first pet?">What was the name of your first pet?</option>
                  <option value="In what city were you born?">In what city were you born?</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Your Answer Response *
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="Type response answer..." 
                  value={securityAnswer}
                  className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-xl text-xs sm:text-sm focus:border-amber-500 outline-none" 
                  onChange={(e) => setSecurityAnswer(e.target.value)} 
                />
              </div>
            </div>

            <button 
              type="button"
              disabled={savingInit}
              onClick={handleInitAccount} 
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 py-3 sm:py-3.5 rounded-xl font-bold transition text-xs sm:text-sm cursor-pointer shadow-lg shadow-amber-500/20"
            >
              {savingInit ? "Saving Security Lock..." : "Save Configuration & Unlock Workspace"}
            </button>
          </div>
        </div>
      )}

      {/* FORGOT PASSWORD RESET MECHANISM MODAL */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 p-5 sm:p-8 rounded-2xl max-w-md w-full shadow-2xl my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5 sm:mb-6">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <h2 className="text-base sm:text-lg font-bold text-white">Password Recovery Wizard</h2>
              </div>
              <span className="text-[11px] bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full font-mono shrink-0">
                Step {forgotStep} of 3
              </span>
            </div>

            {forgotError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {forgotError}
              </div>
            )}

            {forgotSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{forgotSuccess}</span>
              </div>
            )}

            {forgotStep === 1 && (
              <div className="space-y-4 mb-6">
                <p className="text-xs text-slate-400">Enter your registered email address to fetch your security challenge.</p>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Registered Email Address
                  </label>
                  <input 
                    type="email" 
                    value={forgotEmail}
                    className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-xl text-xs sm:text-sm focus:border-amber-500 outline-none" 
                    onChange={(e) => setForgotEmail(e.target.value)} 
                  />
                </div>
              </div>
            )}

            {forgotStep === 2 && (
              <div className="space-y-4 mb-6">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
                  <span className="font-bold uppercase tracking-wider block text-[10px] text-amber-400 mb-1">Security Question Challenge</span>
                  {challengeQuestion}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Enter Your Security Answer Response
                  </label>
                  <input 
                    type="text" 
                    placeholder="Your answer..." 
                    value={challengeAnswer}
                    className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-xl text-xs sm:text-sm focus:border-amber-500 outline-none" 
                    onChange={(e) => setChallengeAnswer(e.target.value)} 
                  />
                </div>
              </div>
            )}

            {forgotStep === 3 && (
              <div className="space-y-4 mb-6">
                <p className="text-xs text-emerald-400 font-medium">Identity verified! Please set a new password for your account.</p>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                    New Account Password
                  </label>
                  <input 
                    type="password" 
                    placeholder="At least 6 characters" 
                    value={newPassword}
                    className="w-full bg-slate-950 border border-slate-700 text-white p-3 rounded-xl text-xs sm:text-sm focus:border-amber-500 outline-none" 
                    onChange={(e) => setNewPassword(e.target.value)} 
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 sm:gap-3">
              <button 
                type="button"
                onClick={() => setShowForgotModal(false)} 
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 sm:py-3 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleForgotFlow} 
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-2.5 sm:py-3 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {forgotStep === 3 ? "Update Password" : "Next Step"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
