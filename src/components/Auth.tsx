import React, { useState } from "react";
import { dbService } from "../utils/db";
import { UserProfile } from "../types";
import { Lock, Mail, RefreshCw, Eye, EyeOff, ShieldAlert, CheckCircle, HelpCircle } from "lucide-react";

interface AuthProps {
  onAuthSuccess: (user: UserProfile) => void;
}

export default function Auth({ onAuthSuccess }: AuthProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verifyPassword, setVerifyPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  // Recovery
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [newPassword, setNewPassword] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [requestResetLoading, setRequestResetLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const cleanNotifications = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleRequestRecoveryEmail = async () => {
    cleanNotifications();
    if (!email) {
      setErrorMsg("Please enter your registered email address first to request a recovery PIN.");
      return;
    }

    setRequestResetLoading(true);
    try {
      const res = await (dbService as any).sendRecoveryEmail(email);
      if (res.success) {
        if (res.recoveryPin) {
          // Simulated dispatch showing the user the PIN
          setSuccessMsg(`[Simulated Verified Mail Service]\nAn email with verification instructions was sent to: ${email}.\n\nSecure PIN Code: ${res.recoveryPin}\nInput this code below along with your new password to verify and reset.`);
          setRecoveryPhrase(res.recoveryPin);
        } else {
          setSuccessMsg(`A password reset link/instructions have been sent to your email: ${email}. Contact Firebase administrator if you don't receive it.`);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to trigger recovery email. Please ensure the email is registered.");
    } finally {
      setRequestResetLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    cleanNotifications();

    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    if (isRegister && password !== verifyPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        const profile = await dbService.registerUser(email, password);
        setSuccessMsg(`Registration complete! Your secure Backup Recovery code is: ${profile.recoveryPhrase}. Write this down now to reset your password if needed.`);
        setIsRegister(false);
        setPassword("");
        setVerifyPassword("");
      } else {
        const profile = await dbService.loginUser(email, password);
        onAuthSuccess(profile);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    cleanNotifications();

    if (!email || !recoveryPhrase || !newPassword) {
      setErrorMsg("Please fill in email, recovery PIN, and new password.");
      return;
    }

    setLoading(true);
    try {
      await dbService.resetPassword(email, recoveryPhrase, newPassword);
      setSuccessMsg("Password successfully updated. You can now login using your new credentials.");
      setIsForgotPassword(false);
      setRecoveryPhrase("");
      setNewPassword("");
      setPassword("");
    } catch (err: any) {
      setErrorMsg(err.message || "Could not reset password. Ensure recovery PIN matches.");
    } finally {
      setLoading(false);
    }
  };

  const isFirebase = dbService.isUsingFirebase();

  return (
    <div className="min-h-screen bg-[#0B0E11] flex flex-col justify-center items-center px-4 py-8">
      {/* Visual background decorations styled with glowing gradients (No Tech-Larping) */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500 opacity-10 rounded-full filter blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#0ecb81]/5 rounded-full filter blur-[100px] pointer-events-none" />
 
      {/* Brand Header */}
      <div className="mb-8 text-center max-w-md relative">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#181A20] border border-slate-800 text-xs font-mono text-emerald-400 mb-4">
          <span className="flex h-2 w-2 relative">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 bg-emerald-500`}></span>
          </span>
          {isFirebase ? "SECURE FIREBASE DATABASE CLOUD CONNECTED" : "OFFLINE-SECURE SANDBOX LOCAL ACTIVE"}
        </div>
        <h1 className="text-3xl font-extrabold font-sans text-white tracking-tight flex items-center justify-center gap-3">
          <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" strokeDasharray="none" />
          </svg>
          ApexTerminal
        </h1>
        <p className="text-sm text-slate-400 mt-2">
          Decentralized DCA & Trade Signal Automation Gateway
        </p>
      </div>
 
      {/* Auth Card container */}
      <div id="auth_card" className="w-full max-w-md bg-[#1E2329] border border-slate-800 rounded-xl shadow-2xl p-8 relative overflow-hidden">
        
        {/* Alerts / States */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-500/30 text-xs text-red-200 flex gap-2 items-start animate-fadeIn">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-300">Authentication Alert</p>
              <p className="mt-1 leading-relaxed">{errorMsg}</p>
            </div>
          </div>
        )}
 
        {successMsg && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-200 flex gap-2 items-start animate-fadeIn">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-300">Operation Successful</p>
              <p className="mt-1 leading-relaxed whitespace-pre-line">{successMsg}</p>
            </div>
          </div>
        )}
 
        {/* 1. Main Login / Register View */}
        {!isForgotPassword ? (
          <form onSubmit={handleAuthSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="text-xs uppercase font-mono font-medium tracking-wider text-slate-400 flex items-center justify-between">
                Email Address
                <span className="text-[10px] text-slate-500 lowercase">(unique ID)</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="auth_email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition"
                  required
                />
              </div>
            </div>
 
            <div className="space-y-1">
              <label className="text-xs uppercase font-mono font-medium tracking-wider text-slate-400 flex items-center justify-between">
                Account Password
                {!isRegister && (
                  <button
                    type="button"
                    onClick={() => {
                      cleanNotifications();
                      setIsForgotPassword(true);
                    }}
                    className="text-xs lowercase text-emerald-450 text-emerald-400 hover:text-emerald-300 font-mono"
                  >
                    recover/reset key?
                  </button>
                )}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="auth_password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg py-2.5 pl-10 pr-10 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition"
                  min={6}
                  required
                />
                <button
                   type="button"
                   onClick={() => setShowPassword(!showPassword)}
                   className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
 
            {isRegister && (
              <div className="space-y-1 animate-fadeIn">
                <label className="text-xs uppercase font-mono font-medium tracking-wider text-slate-400">
                  Verify Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    id="auth_verify_password"
                    type={showPassword ? "text" : "password"}
                    value={verifyPassword}
                    onChange={(e) => setVerifyPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition"
                    required={isRegister}
                  />
                </div>
              </div>
            )}
 
            <button
              id="auth_submit_btn"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none mt-2"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isRegister ? "Launch Account" : "Access Terminal"}
            </button>
          </form>
        ) : (
          /* 2. Forgot Password / Recovery Code View */
          <form onSubmit={handlePasswordReset} className="space-y-5">
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider mb-2 border-b border-slate-800 pb-2">
              Recovery Key Portal
            </h3>
            
            <div className="space-y-1">
              <label className="text-xs uppercase font-mono font-medium tracking-wider text-slate-400">
                Registered Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="reset_email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleRequestRecoveryEmail}
                  disabled={requestResetLoading || loading}
                  className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  title="Validate email and dispatch secure reset code"
                >
                  {requestResetLoading ? <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" /> : null}
                  ✉️ Email Recovery PIN / Code
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase font-mono font-medium tracking-wider text-slate-400">
                  Recovery PIN or Phrase
                </label>
                <div className="group relative">
                  <HelpCircle className="w-4 h-4 text-slate-500 cursor-help" />
                  <div className="absolute right-0 bottom-6 hidden group-hover:block bg-[#0B0E11] border border-slate-800 p-2.5 rounded-lg w-52 text-[10px] text-slate-400 font-mono leading-relaxed z-50">
                    Use the unique numeric pin issued to you instantly upon first registering this email account.
                  </div>
                </div>
              </div>
              <input
                id="reset_pin"
                type="text"
                value={recoveryPhrase}
                onChange={(e) => setRecoveryPhrase(e.target.value)}
                placeholder="6-digit unique recovery PIN"
                className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg py-2.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase font-mono font-medium tracking-wider text-slate-400">
                Define New Password
              </label>
              <input
                id="reset_new_password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full bg-[#0B0E11] border border-slate-800 rounded-lg py-2.5 px-4 text-sm text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div className="flex gap-2.5 mt-2">
              <button
                type="button"
                onClick={() => {
                  cleanNotifications();
                  setIsForgotPassword(false);
                }}
                className="flex-1 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-xs font-semibold hover:bg-slate-800 transition"
              >
                Back to Login
              </button>
              <button
                id="reset_submit_btn"
                type="submit"
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition flex items-center justify-center gap-1.5"
              >
                {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Confirm Reset
              </button>
            </div>
          </form>
        )}

        {/* Option Toggle */}
        {!isForgotPassword && (
          <div className="mt-6 pt-5 border-t border-slate-800/60 text-center">
            <button
              id="toggle_auth_mode_btn"
              type="button"
              onClick={() => {
                cleanNotifications();
                setIsRegister(!isRegister);
              }}
              className="text-xs text-slate-400 hover:text-white transition font-sans cursor-pointer"
            >
              {isRegister ? (
                <>Existing User? <span className="text-emerald-400 font-semibold underline">Verify Credentials & Account</span></>
              ) : (
                <>New to TradeBot? <span className="text-emerald-400 font-semibold underline">Register Secure Terminal</span></>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="mt-8 text-center text-[11px] text-slate-500 font-mono tracking-wide max-w-sm leading-relaxed">
        Zero-knowledge local architecture. Your exchange credentials, secrets, and trade histories are isolated cleanly.
      </div>
    </div>
  );
}
