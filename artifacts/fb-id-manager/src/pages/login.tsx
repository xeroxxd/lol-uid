import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import { Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import { motion, useAnimation, AnimatePresence } from "framer-motion";

export default function Login() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [success, setSuccess] = useState(false);
  const shakeControls = useAnimation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAuthenticated) setLocation("/dashboard");
  }, [isAuthenticated, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setError("");
    setSubmitting(true);
    const result = await login(password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Incorrect password. Please try again.");
      setPassword("");
      shakeControls.start({
        x: [0, -12, 12, -9, 9, -5, 5, 0],
        transition: { duration: 0.55 },
      });
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSuccess(true);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          <span className="text-sm text-zinc-400">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="px-8 pt-10 pb-8">

            <div className="flex flex-col items-center mb-8">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, duration: 0.3 }}
                className="mb-5"
              >
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  {success
                    ? <ShieldCheck className="h-8 w-8 text-emerald-400" />
                    : <Lock className="h-8 w-8 text-blue-400" />
                  }
                </div>
              </motion.div>

              <h1 className="text-xl font-bold text-white tracking-tight">FB UID Manager Pro</h1>
              <p className="text-zinc-500 text-sm mt-1.5">Secure · Private · Per-Device</p>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-zinc-600 text-[10px] font-medium tracking-widest uppercase">Login</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            <motion.form animate={shakeControls} onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2 ml-0.5">Password</label>
                <div
                  className={`flex items-center rounded-xl border transition-colors ${
                    error ? "border-red-500/50" : focused ? "border-blue-500/50" : "border-zinc-700"
                  } bg-zinc-950`}
                >
                  <div className="pl-3.5 pr-2 text-zinc-500">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    ref={inputRef}
                    type={showPass ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => { setFocused(true); setError(""); }}
                    onBlur={() => setFocused(false)}
                    autoFocus
                    autoComplete="current-password"
                    disabled={submitting || success}
                    className="flex-1 bg-transparent text-white text-sm px-2 py-3.5 outline-none placeholder-zinc-600 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    tabIndex={-1}
                    className="px-3.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: -4, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -4, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                      <div className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                      <p className="text-red-400 text-xs">{error}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={!password.trim() || submitting || success}
                className={`w-full rounded-xl py-3.5 font-semibold text-sm tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  success
                    ? "bg-emerald-600 text-white"
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {success && <ShieldCheck className="h-4 w-4" />}
                  {submitting ? "Verifying..." : success ? "Access Granted" : "Unlock Dashboard"}
                </span>
              </button>
            </motion.form>
          </div>

          <div className="px-8 py-3 flex items-center justify-between border-t border-zinc-800 bg-zinc-950/50">
            <span className="text-[10px] text-zinc-600 font-mono">v2.0.0</span>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-zinc-500">Online</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
