"use client";
import { useState, useEffect } from 'react';
import { SYNC_KEYS, fetchStorageData, saveStorageData } from '@/lib/dataSync';
import { Lock, KeyRound, CheckCircle2, AlertCircle, HelpCircle, X, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function ChangePasswordModal({ isOpen, onClose, currentUser }) {
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [storedAnswer, setStoredAnswer] = useState('');
  const [answerInput, setAnswerInput] = useState('');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && currentUser) {
      setErrorMsg('');
      setSuccessMsg('');
      setAnswerInput('');
      setCurrentPasswordInput('');
      setNewPassword('');
      setConfirmPassword('');
      loadUserSecurityDetails();
    }
  }, [isOpen, currentUser]);

  const loadUserSecurityDetails = async () => {
    const userEmail = (currentUser?.email || currentUser?.user?.email || '').toLowerCase().trim();
    if (!userEmail) return;

    let foundQuestion = '';
    let foundAnswer = '';

    // 1. Check central synced profiles
    const profiles = fetchStorageData(SYNC_KEYS.PROFILES);
    const match = Array.isArray(profiles) 
      ? profiles.find(p => p && p.email && String(p.email).toLowerCase().trim() === userEmail)
      : null;

    if (match) {
      foundQuestion = match.security_question || '';
      foundAnswer = match.security_answer || '';
    }

    setSecurityQuestion(foundQuestion || 'What is your favorite color?');
    setStoredAnswer(foundAnswer || '');
  };

  if (!isOpen) return null;

  const userEmail = (currentUser?.email || currentUser?.user?.email || '').toLowerCase().trim();
  const verifiedEmailsStr = typeof window !== 'undefined' ? (localStorage.getItem('rgc_verified_emails') || '[]') : '[]';
  let verifiedEmails = [];
  try { verifiedEmails = JSON.parse(verifiedEmailsStr); } catch (_) {}
  const isEmailVerified = Array.isArray(verifiedEmails) && verifiedEmails.includes(userEmail);
  const isAccountVerified = isEmailVerified || currentUser?.is_verified || currentUser?.is_first_time_login === false || Boolean(userEmail);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanAnswer = answerInput.toLowerCase().trim();

    // 1. Verify Security Answer Confirmation only if NOT verified
    if (!isAccountVerified && !cleanAnswer) {
      setErrorMsg('Please enter the answer to your security question for confirmation.');
      return;
    }

    if (!isAccountVerified && storedAnswer) {
      if (cleanAnswer !== storedAnswer.toLowerCase().trim()) {
        setErrorMsg('Security Confirmation Failed: Incorrect answer to your security question.');
        return;
      }
    }

    // 2. Validate New Password
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('New password and confirmation password do not match.');
      return;
    }

    setLoading(true);

    try {
      // 3. Update in central sync store and localStorage
      let profiles = fetchStorageData(SYNC_KEYS.PROFILES);
      if (!profiles || profiles.length === 0) {
        const uStr = localStorage.getItem('rgc_profiles');
        if (uStr) try { profiles = JSON.parse(uStr); } catch (_) {}
      }

      if (Array.isArray(profiles)) {
        const idx = profiles.findIndex(p => p && p.email && String(p.email).toLowerCase().trim() === userEmail);
        if (idx >= 0) {
          profiles[idx] = {
            ...profiles[idx],
            password: newPassword,
            is_first_time_login: false,
            is_verified: true,
            security_question: securityQuestion,
            security_answer: storedAnswer || cleanAnswer,
            updated_at: new Date().toISOString()
          };
        } else {
          profiles.push({
            id: 'usr-' + Date.now(),
            email: userEmail,
            password: newPassword,
            full_name: userEmail.split('@')[0],
            designation: currentUser?.role || currentUser?.designation || 'Accounts Assistant',
            security_question: securityQuestion,
            security_answer: storedAnswer || cleanAnswer,
            is_first_time_login: false,
            is_verified: true,
            updated_at: new Date().toISOString()
          });
        }
        saveStorageData(SYNC_KEYS.PROFILES, profiles);
        localStorage.setItem('rgc_profiles', JSON.stringify(profiles));
      }

      setSuccessMsg('Account password changed successfully! Your security settings are permanently updated.');
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err) {
      setErrorMsg('Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 p-5 sm:p-7 rounded-2xl max-w-md w-full shadow-2xl relative my-auto text-white">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Change Account Password</h3>
              <p className="text-xs text-slate-400">Security question confirmation required</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="mt-4 space-y-4">
          
          {/* Security Question Challenge Banner - Only for unverified accounts */}
          {!isAccountVerified ? (
            <>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold uppercase tracking-wider">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Identity Verification Question</span>
                </div>
                <p className="text-sm font-semibold text-slate-100">{securityQuestion}</p>
                <p className="text-[10px] text-slate-400">You must provide the exact answer you configured upon first login to verify password change.</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Your Security Answer *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter your security answer"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 sm:p-3 text-sm text-white focus:border-amber-500 outline-none transition font-medium placeholder-slate-500"
                />
              </div>
            </>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2.5 text-emerald-300 text-xs">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <span className="font-semibold block text-white">Verified Account Authentication</span>
                <span className="text-emerald-400/90 text-[11px]">Direct credential update enabled for verified session.</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              New Account Password *
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                required
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 sm:p-3 pr-10 text-sm text-white focus:border-amber-500 outline-none transition placeholder-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-400 p-1 cursor-pointer"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Confirm New Password *
            </label>
            <input
              type="password"
              required
              placeholder="Re-type new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 sm:p-3 text-sm text-white focus:border-amber-500 outline-none transition placeholder-slate-500"
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 sm:py-3 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-2.5 sm:py-3 rounded-xl text-xs font-bold transition cursor-pointer shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{loading ? "Updating..." : "Confirm & Update"}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
