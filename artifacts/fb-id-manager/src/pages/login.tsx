import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import { Eye, EyeOff, Loader2, ShieldCheck, Lock, Fingerprint, Cpu, Globe } from "lucide-react";
import { motion, useAnimation, AnimatePresence } from "framer-motion";

const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 2.5 + 0.5,
  duration: Math.random() * 12 + 8,
  delay: Math.random() * 6,
  opacity: Math.random() * 0.4 + 0.1,
}));

const DOTS = Array.from({ length: 5 }, (_, i) => ({
  id: i,
  delay: i * 0.15,
}));

function PulsingRing() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {[1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-cyan-500/10"
          style={{ width: i * 140, height: i * 140 }}
          animate={{ scale: [1, 1.06, 1], opacity: [0.3, 0.1, 0.3] }}
          transition={{ repeat: Infinity, duration: 4 + i, delay: i * 0.8, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export default function Login() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [success, setSuccess] = useState(false);
  const shakeControls = useAnimation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAuthenticated) setLocation("/dashboard");
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    const target = "FB UID Manager Pro";
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setCharCount(i);
      if (i >= target.length) clearInterval(interval);
    }, 55);
    return () => clearInterval(interval);
  }, []);

  const titleFull = "FB UID Manager Pro";
  const titleVisible = titleFull.slice(0, charCount);

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
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 1.8 }}
          className="flex flex-col items-center gap-4"
        >
          <ShieldCheck className="h-14 w-14 text-cyan-400" />
          <div className="flex gap-1.5">
            {DOTS.map((d) => (
              <motion.div
                key={d.id}
                className="h-1.5 w-1.5 rounded-full bg-cyan-500/60"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: d.delay }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative overflow-hidden p-4">

      {/* Deep background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#111111] to-[#0a0a0a]" />

      {/* Ambient orbs */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 600, height: 600,
          background: "radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 70%)",
          top: "-15%", left: "-15%",
        }}
        animate={{ scale: [1, 1.15, 1], x: [0, 40, 0], y: [0, 25, 0] }}
        transition={{ repeat: Infinity, duration: 14, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 500, height: 500,
          background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)",
          bottom: "-10%", right: "-10%",
        }}
        animate={{ scale: [1, 1.2, 1], x: [0, -30, 0], y: [0, -20, 0] }}
        transition={{ repeat: Infinity, duration: 16, ease: "easeInOut", delay: 3 }}
      />
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 250, height: 250,
          background: "radial-gradient(circle, rgba(34,197,94,0.04) 0%, transparent 70%)",
          top: "60%", right: "15%",
        }}
        animate={{ scale: [1, 1.4, 1] }}
        transition={{ repeat: Infinity, duration: 9, ease: "easeInOut", delay: 1.5 }}
      />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(6,182,212,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.025) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Floating particles */}
      {PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-cyan-400"
          style={{
            width: p.size, height: p.size,
            left: `${p.x}%`, top: `${p.y}%`,
            opacity: p.opacity,
          }}
          animate={{ y: [-15, 15, -15], opacity: [p.opacity * 0.4, p.opacity, p.opacity * 0.4] }}
          transition={{ repeat: Infinity, duration: p.duration, delay: p.delay, ease: "easeInOut" }}
        />
      ))}

      {/* Pulsing rings behind card */}
      <PulsingRing />

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Glass card */}
        <div
          className="relative rounded-3xl overflow-hidden"
          style={{
            background: "linear-gradient(145deg, rgba(14,14,14,0.96) 0%, rgba(10,10,10,0.99) 100%)",
            border: "1px solid rgba(34,211,238,0.1)",
            boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(6,182,212,0.05), inset 0 1px 0 rgba(255,255,255,0.04)",
            backdropFilter: "blur(24px)",
          }}
        >
          {/* Top accent line */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.5), rgba(99,102,241,0.5), transparent)" }}
          />

          {/* Inner glow */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 pointer-events-none"
            style={{ background: "radial-gradient(ellipse, rgba(34,211,238,0.04) 0%, transparent 70%)" }}
          />

          <div className="px-8 pt-10 pb-9">

            {/* Logo area */}
            <div className="flex flex-col items-center mb-9">

              {/* Animated shield icon */}
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.25, duration: 0.6, type: "spring", stiffness: 180 }}
                className="relative mb-6"
              >
                {/* Outer glow ring */}
                <motion.div
                  className="absolute inset-0 rounded-2xl"
                  style={{ boxShadow: "0 0 40px rgba(34,211,238,0.2)" }}
                  animate={{ opacity: [0.4, 0.8, 0.4] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                />
                {/* Icon box */}
                <div
                  className="relative p-5 rounded-2xl"
                  style={{
                    background: "linear-gradient(135deg, rgba(6,182,212,0.15), rgba(99,102,241,0.12))",
                    border: "1px solid rgba(34,211,238,0.2)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)",
                  }}
                >
                  <motion.div
                    animate={{ scale: success ? [1, 1.2, 1] : 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    {success
                      ? <ShieldCheck className="h-10 w-10 text-emerald-400" />
                      : <Lock className="h-10 w-10 text-cyan-400" />
                    }
                  </motion.div>
                </div>
              </motion.div>

              {/* App name with typewriter */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="text-center"
              >
                <h1 className="text-[26px] font-black tracking-tight text-white leading-none">
                  <span
                    style={{
                      background: "linear-gradient(135deg, #e2e8f0 0%, #94a3b8 50%, #e2e8f0 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    {titleVisible}
                  </span>
                  <motion.span
                    className="inline-block w-[2px] h-6 bg-cyan-400 ml-1 align-middle rounded-full"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ repeat: Infinity, duration: 0.75 }}
                    style={{ display: charCount < titleFull.length ? "inline-block" : "none" }}
                  />
                </h1>
                <p className="text-slate-500 text-[13px] mt-2 font-medium tracking-wide">
                  Secure · Private · Per-Device
                </p>
              </motion.div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-7">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent to-slate-700/50" />
              <span className="text-slate-600 text-[11px] font-medium tracking-widest uppercase">Access Portal</span>
              <div className="flex-1 h-px bg-gradient-to-l from-transparent to-slate-700/50" />
            </div>

            {/* Form */}
            <motion.form
              animate={shakeControls}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {/* Password label */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2 ml-1">
                  Master Password
                </label>

                {/* Input wrapper */}
                <div className="relative">
                  <motion.div
                    animate={{
                      boxShadow: focused
                        ? "0 0 0 2px rgba(6,182,212,0.35), 0 0 24px rgba(34,211,238,0.1)"
                        : error
                        ? "0 0 0 2px rgba(239,68,68,0.35)"
                        : "0 0 0 1px rgba(30,30,30,0.8)",
                    }}
                    transition={{ duration: 0.25 }}
                    className="rounded-xl overflow-hidden"
                  >
                    <div
                      className="relative flex items-center"
                      style={{ background: "rgba(10,10,10,0.85)" }}
                    >
                      <div className="pl-4 pr-2 text-slate-600">
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
                        className="flex-1 bg-transparent text-white font-mono text-[15px] px-2 py-4 outline-none placeholder-slate-700 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        tabIndex={-1}
                        className="px-4 text-slate-600 hover:text-slate-400 transition-colors"
                      >
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </motion.div>
                </div>
              </div>

              {/* Error message */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -6, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}
                    >
                      <div className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                      <p className="text-red-400 text-[12px] font-medium">{error}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit button */}
              <motion.button
                type="submit"
                disabled={!password.trim() || submitting || success}
                whileTap={{ scale: 0.98 }}
                whileHover={{ scale: 1.01 }}
                className="w-full relative overflow-hidden rounded-xl py-4 font-bold text-[14px] tracking-wide disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                style={{
                  background: success
                    ? "linear-gradient(135deg, #10b981, #059669)"
                    : "linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%)",
                  boxShadow: "0 8px 24px rgba(6,182,212,0.2)",
                  color: "white",
                }}
              >
                {/* Moving shimmer */}
                {!submitting && !success && password.trim() && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12"
                    animate={{ x: ["-120%", "220%"] }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
                  />
                )}
                <span className="relative flex items-center justify-center gap-2.5">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {success && <ShieldCheck className="h-4 w-4" />}
                  {submitting ? "Verifying..." : success ? "Access Granted" : "Unlock Dashboard"}
                </span>
              </motion.button>
            </motion.form>

            {/* Security badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.6 }}
              className="flex items-center justify-center gap-4 mt-8"
            >
              {[
                { icon: Fingerprint, label: "Per-Device" },
                { icon: Cpu, label: "Encrypted" },
                { icon: Globe, label: "Private" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <div
                    className="p-2 rounded-xl"
                    style={{ background: "rgba(34,211,238,0.04)", border: "1px solid rgba(6,182,212,0.1)" }}
                  >
                    <Icon className="h-3.5 w-3.5 text-cyan-600" />
                  </div>
                  <span className="text-[10px] text-slate-700 font-medium tracking-wide">{label}</span>
                </div>
              ))}
            </motion.div>

          </div>

          {/* Bottom bar */}
          <div
            className="px-8 py-3.5 flex items-center justify-between"
            style={{ borderTop: "1px solid rgba(255,255,255,0.03)", background: "rgba(0,0,0,0.2)" }}
          >
            <span className="text-[10px] text-slate-700 font-mono tracking-wider">v2.0.0</span>
            <div className="flex items-center gap-1.5">
              <motion.div
                className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <span className="text-[10px] text-slate-600 font-medium">System Operational</span>
            </div>
          </div>
        </div>

        {/* Bottom hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="text-center text-[11px] text-slate-800 mt-5 tracking-wide"
        >
          Protected by end-to-end device isolation
        </motion.p>
      </motion.div>
    </div>
  );
}
