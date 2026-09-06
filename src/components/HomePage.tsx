import React, { useState, useEffect, useRef } from 'react';
import { LogIn, KeyRound, AlertCircle, CheckCircle2, ArrowRight, ShieldCheck, X, Eye, EyeOff } from 'lucide-react';
import homeBgImage from '../assets/images/nrman_built_for_builders_1788107397006.jpg';

interface HomePageProps {
  onLoginClick?: () => void;
  onClientCodeVerified: (verifiedCode?: string) => void;
}

export default function HomePage({ onClientCodeVerified }: HomePageProps) {
  const REQUIRED_CLIENT_CODE = 'rgc@nrman';
  const [showClientCodeModal, setShowClientCodeModal] = useState<boolean>(false);
  const [clientCode, setClientCode] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showClientCodeModal && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [showClientCodeModal]);

  const handleOpenModal = () => {
    setErrorMsg('');
    setClientCode('');
    setIsSuccess(false);
    setShowClientCodeModal(true);
  };

  const handleVerifyCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    const trimmed = clientCode.trim().toLowerCase();

    if (!trimmed) {
      setErrorMsg('Please enter the client code.');
      inputRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/client/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientCode: trimmed })
      });
      const result = await response.json();
      if (!response.ok || !result?.verified) {
        throw new Error(result?.error || 'Invalid client code');
      }

      setIsSuccess(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('rgc_client_code_verified', 'true');
        localStorage.setItem('rgc_client_code_verified', 'true');
        localStorage.setItem('rgc_client_code', trimmed);
      }
      setTimeout(() => {
        setLoading(false);
        setShowClientCodeModal(false);
        onClientCodeVerified(trimmed);
      }, 350);
    } catch (error: any) {
      setLoading(false);
      setErrorMsg(error?.message || 'Invalid client code. The CEO must generate it first.');
      setClientCode('');
      inputRef.current?.focus();
    }
  };

  const handleLoginTrigger = () => {
    handleOpenModal();
  };

  return (
    <div 
      id="nrman-home-page"
      className="relative min-h-screen w-full bg-[#0c2340] text-slate-100 flex flex-col justify-between overflow-x-hidden overflow-y-auto select-none"
    >
      {/* Absolute Static Brand Asset - Rendered Exactly as Provided */}
      <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden bg-[#0c2340]">
        <img 
          src={homeBgImage} 
          alt="NrMAN BUILT FOR BUILDERS" 
          className="w-full h-full object-cover object-center"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/nrman_home.jpg';
          }}
        />
        {/* Subtle vignette for contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/30 pointer-events-none" />
      </div>

      {/* Top Navigation Bar with Login Button on the Top Right Corner */}
      <header className="relative z-20 w-full px-4 sm:px-8 py-4 sm:py-6 flex items-center justify-between">
        {/* Left: Subtle Portal Badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-950/70 backdrop-blur-md border border-cyan-500/40 px-3.5 py-1.5 rounded-full shadow-lg">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]" />
            <span className="text-[11px] sm:text-xs font-black tracking-widest uppercase text-cyan-200">
              NRMAN Portal
            </span>
          </div>
        </div>

        {/* Top Right Corner: High-Visibility Login Button */}
        <div className="flex items-center gap-3">
          <button
            id="home-login-btn"
            type="button"
            onClick={handleLoginTrigger}
            className="group relative inline-flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-2.5 rounded-xl sm:rounded-2xl bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 hover:text-slate-950 border border-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.5)] hover:shadow-[0_0_30px_rgba(6,182,212,0.8)] backdrop-blur-md transition-all duration-200 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 text-xs sm:text-sm font-black tracking-wider uppercase"
          >
            <LogIn className="w-4 h-4 text-slate-950 group-hover:scale-110 transition-transform stroke-[2.5]" />
            <span>Login</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-950 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </header>

      {/* Center Canvas Area */}
      <main className="relative z-10 w-full flex-1 flex flex-col items-center justify-end pb-8 sm:pb-10 px-4 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 bg-slate-950/70 border border-slate-800/80 px-4 py-1.5 rounded-full backdrop-blur-md shadow-xl text-cyan-200/90 text-[11px] sm:text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span>Construction Accounts & Inventory Management System</span>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full py-3 px-4 sm:px-8 flex items-center justify-center text-center text-[10px] sm:text-[11px] text-slate-400 bg-gradient-to-t from-slate-950/90 to-transparent">
        <span>© {new Date().getFullYear()} NRMAN | Built For Builders</span>
      </footer>

      {/* Client Code Verification Modal */}
      {showClientCodeModal && (
        <div 
          id="client-code-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn"
          onClick={() => setShowClientCodeModal(false)}
        >
          <div 
            id="client-code-modal-card"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-slate-900 border border-cyan-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-cyan-950/60 overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-600 via-teal-400 to-blue-600" />

            <button
              id="close-client-code-modal"
              type="button"
              onClick={() => setShowClientCodeModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-3 shadow-inner shadow-cyan-500/20">
                {isSuccess ? (
                  <CheckCircle2 className="w-7 h-7 text-emerald-400 animate-bounce" />
                ) : (
                  <KeyRound className="w-7 h-7 text-cyan-400" />
                )}
              </div>
              <h3 className="text-xl font-extrabold text-white tracking-tight">
                Client Code Verification
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                Enter your company client code to access the employee portal.
              </p>
            </div>

            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-cyan-300 mb-1.5 text-left">
                  Client Code
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    id="client-code-input"
                    type={showPassword ? 'text' : 'password'}
                    value={clientCode}
                    onChange={(e) => {
                      setClientCode(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="Enter client code"
                    className={`w-full bg-slate-950 border ${
                      errorMsg 
                        ? 'border-rose-500 focus:border-rose-400' 
                        : isSuccess 
                        ? 'border-emerald-500 focus:border-emerald-400' 
                        : 'border-slate-700 focus:border-cyan-400'
                    } text-white pl-4 pr-11 py-3 rounded-xl text-sm outline-none transition-all font-mono`}
                    autoComplete="off"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                    aria-label={showPassword ? 'Hide client code' : 'Show client code'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {isSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Client Code Verified! Opening Portal...</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClientCodeModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="client-code-submit-btn"
                  type="submit"
                  disabled={loading || isSuccess}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 disabled:opacity-50 text-slate-950 py-2.5 rounded-xl text-xs font-black tracking-wide shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <span>Verifying...</span>
                  ) : isSuccess ? (
                    <span>Authorized</span>
                  ) : (
                    <>
                      <span>Verify & Enter</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
