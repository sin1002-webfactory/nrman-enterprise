import React, { useState, useEffect } from 'react';
import { LogIn, KeyRound, ShieldCheck, AlertCircle, ArrowRight, X, Sparkles, Building2, CheckCircle2 } from 'lucide-react';

interface LandingPageProps {
  onEnterLogin: () => void;
}

export default function LandingPage({ onEnterLogin }: LandingPageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientCode, setClientCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Check if client code was already verified in this session
  useEffect(() => {
    const verified = sessionStorage.getItem('rgc_client_code_verified') || localStorage.getItem('rgc_client_code_verified');
    if (verified === 'true') {
      // Optional: keep on landing or let user click login
    }
  }, []);

  const handleOpenModal = () => {
    setErrorMsg('');
    setSuccessMsg('');
    setClientCode('');
    setIsModalOpen(true);
  };

  const handleVerifyClientCode = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanCode = clientCode.trim().toLowerCase();
    const EXPECTED_CODE = 'rgc@nrman';

    if (!cleanCode) {
      setErrorMsg('Please enter your organization client code.');
      return;
    }

    setIsVerifying(true);

    setTimeout(() => {
      if (cleanCode === EXPECTED_CODE) {
        setSuccessMsg('Client code verified successfully! Access granted.');
        sessionStorage.setItem('rgc_client_code_verified', 'true');
        localStorage.setItem('rgc_client_code_verified', 'true');
        
        setTimeout(() => {
          setIsModalOpen(false);
          setIsVerifying(false);
          onEnterLogin();
        }, 600);
      } else {
        setIsVerifying(false);
        setErrorMsg('Invalid client code. Please check your credentials and try again.');
      }
    }, 350);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0a192f] select-none flex flex-col justify-between">
      {/* High-Resolution NRMAN Blueprint Background */}
      <div 
        className="absolute inset-0 w-full h-full bg-no-repeat bg-center bg-cover sm:bg-cover transition-transform duration-1000 ease-out"
        style={{ 
          backgroundImage: 'url(/nrman_home.jpg)',
          backgroundColor: '#0c2340'
        }}
      >
        {/* Subtle radial overlay to ensure high contrast and sleek depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#061426]/70 via-transparent to-[#061426]/40 pointer-events-none" />
      </div>

      {/* Top Navigation Bar with Login Button on the Top Right Corner */}
      <header className="relative z-20 w-full px-4 sm:px-8 py-4 sm:py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-950/60 backdrop-blur-md border border-cyan-500/30 px-3.5 py-1.5 rounded-full shadow-lg">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
            <span className="text-[11px] sm:text-xs font-bold tracking-widest uppercase text-cyan-200">
              NRMAN Portal
            </span>
          </div>
        </div>

        {/* Top Right Corner Login Button */}
        <div className="flex items-center gap-3">
          <button
            id="nrman-home-login-btn"
            onClick={handleOpenModal}
            className="group relative inline-flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-2.5 rounded-xl sm:rounded-2xl bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 hover:text-slate-950 border border-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.7)] backdrop-blur-md transition-all duration-200 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 text-xs sm:text-sm font-extrabold tracking-wider uppercase"
          >
            <LogIn className="w-4 h-4 text-slate-950 group-hover:scale-110 transition-transform stroke-[2.5]" />
            <span>Employee Login</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-950 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </header>

      {/* Center Action Container: Unobstructed view of blueprint graphic */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-end pb-8 sm:pb-12 px-4 pointer-events-none">
        <p className="pointer-events-auto text-[11px] sm:text-xs text-cyan-200/80 bg-slate-950/60 border border-slate-800/80 px-4 py-1.5 rounded-full tracking-wider font-medium text-center drop-shadow-md backdrop-blur-md">
          Construction Accounts & Inventory Management System
        </p>
      </main>

      {/* Bottom Footer bar */}
      <footer className="relative z-10 w-full py-3 px-4 sm:px-8 flex items-center justify-center text-center text-[10px] sm:text-[11px] text-slate-400/80 bg-gradient-to-t from-slate-950/90 to-transparent">
        <span>© {new Date().getFullYear()} NRMAN | Built For Builders</span>
      </footer>

      {/* Client Code Authentication Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div 
            className="relative w-full max-w-md bg-slate-900/95 border border-cyan-500/30 rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(6,182,212,0.2)] text-slate-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Accent Glow */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-teal-400 to-blue-500" />

            {/* Close button */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 mb-3 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                Client Code Verification
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Enter your authorized client code to unlock the portal login
              </p>
            </div>

            {/* Notifications */}
            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleVerifyClientCode} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-cyan-300 mb-1.5">
                  Client Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={clientCode}
                    onChange={(e) => setClientCode(e.target.value)}
                    placeholder="Enter client code"
                    className="w-full bg-slate-950/90 border border-slate-700 focus:border-cyan-400 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition shadow-inner font-mono"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                    🔑
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isVerifying ? (
                    <span>Verifying...</span>
                  ) : (
                    <>
                      <span>Verify Code</span>
                      <ArrowRight className="w-4 h-4" />
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
