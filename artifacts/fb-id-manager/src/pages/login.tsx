import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { SunMoonAnimation } from "@/components/SunMoonAnimation";

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 2 + 1,
  duration: Math.random() * 8 + 6,
  delay: Math.random() * 5,
}));

export default function Login() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const shakeControls = useAnimation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAuthenticated) setLocation("/dashboard");
  }, [isAuthenticated, setLocation]);

  // Typewriter counter effect on title
  useEffect(() => {
    const target = "FB ID Manager Pro";
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setCharCount(i);
      if (i >= target.length) clearInterval(interval);
    }, 60);
    return () => clearInterval(interval);
  }, []);

  const titleFull = "FB ID Manager Pro";
  const titleVisible = titleFull.slice(0, charCount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setError("");
    setSubmitting(true);
    const result = await login(password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Wrong password");
      setPassword("");
      shakeControls.start({
        x: [0, -10, 10, -8, 8, -4, 4, 0],
        transition: { duration: 0.5 },
      });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070b16]">
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
          className="flex flex-col items-center gap-3"
        >
          <ShieldCheck className="h-12 w-12 text-cyan-400" />
          <span className="text-slate-500 text-sm font-medium tracking-wider">Loading...</span>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b16] flex flex-col items-center justify-center relative overflow-hidden p-4">
      {/* Animated background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute rounded-full blur-3xl opacity-10"
          style={{ width: 400, height: 400, background: "radial-gradient(circle, #06b6d4, transparent)", top: "-10%", left: "-10%" }}
          animate={{ scale: [1, 1.2, 1], x: [0, 30, 0], y: [0, 20, 0] }}
          transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute rounded-full blur-3xl opacity-8"
          style={{ width: 350, height: 350, background: "radial-gradient(circle, #6366f1, transparent)", bottom: "-5%", right: "-5%" }}
          animate={{ scale: [1, 1.15, 1], x: [0, -25, 0], y: [0, -15, 0] }}
          transition={{ repeat: Infinity, duration: 12, ease: "easeInOut", delay: 2 }}
        />
        <motion.div
          className="absolute rounded-full blur-2xl opacity-5"
          style={{ width: 200, height: 200, background: "radial-gradient(circle, #22c55e, transparent)", top: "40%", right: "10%" }}
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ repeat: Infinity, duration: 8, ease: "easeInOut", delay: 1 }}
        />
      </div>

      {/* Grid lines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(#06b6d4 1px, transparent 1px), linear-gradient(90deg, #06b6d4 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Floating particles */}
      {PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-cyan-400/30"
          style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%` }}
          animate={{ y: [-10, 10, -10], opacity: [0.2, 0.6, 0.2] }}
          transition={{ repeat: Infinity, duration: p.duration, delay: p.delay, ease: "easeInOut" }}
        />
      ))}

      {/* Sun & Moon Animation header */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mb-4 rounded-2xl overflow-hidden"
        style={{ width: "100%", maxWidth: 360 }}
      >
        <SunMoonAnimation className="w-full h-24 rounded-2xl" />
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, duration: 0.5, type: "spring", stiffness: 200 }}
            className="relative mb-5"
          >
            <div className="absolute inset-0 rounded-2xl bg-cyan-500/20 blur-xl scale-150" />
            <div className="relative bg-[#0c1122] border border-cyan-500/30 p-4 rounded-2xl shadow-xl shadow-cyan-500/10">
              <ShieldCheck className="h-10 w-10 text-cyan-400" />
            </div>
          </motion.div>

          <h1 className="text-2xl font-extrabold tracking-tight text-white relative">
            {titleVisible}
            <motion.span
              className="inline-block w-0.5 h-6 bg-cyan-400 ml-0.5 align-middle"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              style={{ display: charCount < titleFull.length ? "inline-block" : "none" }}
            />
          </h1>
          <p className="text-slate-500 text-sm mt-1.5 text-center">
            Secure account tracking dashboard
          </p>
        </div>

        {/* Form */}
        <motion.form
          animate={shakeControls}
          onSubmit={handleSubmit}
          className="space-y-3"
        >
          {/* Input */}
          <div className="relative">
            <motion.div
              animate={{
                boxShadow: focused
                  ? "0 0 0 2px rgba(6,182,212,0.4), 0 0 20px rgba(6,182,212,0.15)"
                  : "0 0 0 1px rgba(26,37,64,1)",
              }}
              transition={{ duration: 0.2 }}
              className="rounded-xl overflow-hidden"
            >
              <input
                ref={inputRef}
                type={showPass ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoFocus
                disabled={submitting}
                className="w-full bg-[#0c1122] text-white text-center font-mono text-base px-4 py-3.5 pr-11 outline-none placeholder-slate-600 disabled:opacity-50"
              />
            </motion.div>
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                key="error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="text-red-400 text-xs text-center font-medium"
              >
                ⚠️ {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Submit button */}
          <motion.button
            type="submit"
            disabled={!password.trim() || submitting}
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.01 }}
            className="w-full relative overflow-hidden rounded-xl py-3.5 font-bold text-sm text-[#070b16] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            style={{ background: "linear-gradient(135deg, #06b6d4, #6366f1)" }}
          >
            {/* Shimmer */}
            {!submitting && password.trim() && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                animate={{ x: ["-100%", "200%"] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
              />
            )}
            <span className="relative flex items-center justify-center gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Verifying..." : "Enter"}
            </span>
          </motion.button>
        </motion.form>

        {/* Bottom note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-[11px] text-slate-700 mt-6"
        >
          Per-device isolated data · End-to-end secure
        </motion.p>
      </motion.div>
    </div>
  );
}
