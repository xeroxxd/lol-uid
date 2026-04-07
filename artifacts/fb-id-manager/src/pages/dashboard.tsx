import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { useEffect, useState, useMemo, useRef, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListFacebookIds,
  useBulkImportFacebookIds,
  useClearAllFacebookIds,
  useDeleteFacebookId,
  useUpdateFacebookId,
  useGetFacebookIdStats,
  useGetDailyStats,
  getListFacebookIdsQueryKey,
  getGetFacebookIdStatsQueryKey,
  getGetDailyStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Zap, Trash2, LogOut, Plus, Search, Copy, Download,
  ArrowUpToLine, SortAsc, Loader2, X, Key, Shield,
  FileText, Tag, CheckSquare, Square, BarChart2, ChevronDown, ChevronUp,
  Settings, List, Grid3x3, Type, Undo2, User, ExternalLink, Sun, Moon, Save,
  BookmarkCheck, CheckCircle, RefreshCw, RotateCcw, Eye, EyeOff, TrendingUp,
  Crown, Flame, Wifi, WifiOff, Sparkles, Filter, AlarmClock,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

type SortMode = "newest" | "oldest" | "checked" | "unchecked" | "saved" | "alpha" | "recent" | "name" | "followers";
type FilterMode = "all" | "checked" | "unchecked" | "saved" | "noted" | "tagged" | "hasig" | "hasname" | "dead" | "hasnote" | "live" | "checkpoint" | "twofactor";
type CopyFormat = "both" | "uid" | "pass" | "named" | "token";
type LoginStatus = "live" | "dead" | "checkpoint" | "2fa" | "locked" | "disabled" | "wrongpass";

interface ProfileData {
  name: string | null;
  username: string | null;
  userId: string | null;
  followerCount: string | null;
  nationality: string | null;
  photoUrl: string | null;
  instagramUsername: string | null;
}

function ProfileAvatar({ profile, uid, size = 28 }: { profile: ProfileData; uid: string; size?: number }) {
  const [imgErr, setImgErr] = useState(false);
  const initials = (profile.name ?? uid).slice(0, 2).toUpperCase();
  const hue = uid.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  const gradient = `linear-gradient(135deg, hsl(${hue},70%,40%), hsl(${(hue + 60) % 360},70%,55%))`;
  const px = `${size}px`;
  if (profile.photoUrl && !imgErr) {
    return (
      <img
        src={profile.photoUrl}
        alt={initials}
        width={size}
        height={size}
        onError={() => setImgErr(true)}
        className="rounded-full object-cover shrink-0 border border-white/10"
        style={{ width: px, height: px, minWidth: px }}
      />
    );
  }
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center text-white font-bold border border-white/10"
      style={{ width: px, height: px, minWidth: px, background: gradient, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

type ValidatorStatus = "idle" | "running" | "done" | "aborted";
type VResult = { uid: string; name: string | null; username: string | null; followerCount: string | null; photoUrl: string | null; instagramUsername: string | null };
type FeedEntry = { uid: string; status: "live" | "dead"; name?: string | null; username?: string | null; followerCount?: string | null; photoUrl?: string | null };

function ValidatorAvatar({ uid, name, photoUrl }: { uid: string; name: string | null; photoUrl: string | null }) {
  const [err, setErr] = useState(false);
  const initials = (name ?? uid).slice(0, 2).toUpperCase();
  const hue = uid.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const grad = `linear-gradient(135deg,hsl(${hue},70%,40%),hsl(${(hue + 60) % 360},70%,55%))`;
  if (photoUrl && !err) {
    return <img src={photoUrl} alt={initials} onError={() => setErr(true)} className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" />;
  }
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold border border-white/10 shrink-0" style={{ background: grad }}>
      {initials}
    </div>
  );
}

function ValidatorPanel({ onClose, onImportLive, onImportDead }: { onClose: () => void; onImportLive: (uids: string[]) => void; onImportDead: (uids: string[]) => void }) {
  const [inputText, setInputText] = useState("");
  const [status, setStatus] = useState<ValidatorStatus>("idle");
  const [liveResults, setLiveResults] = useState<VResult[]>([]);
  const [deadResults, setDeadResults] = useState<string[]>([]);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<"live" | "dead">("live");
  const [isRateLimited, setIsRateLimited] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const uidCount = inputText.split("\n").filter((l) => l.trim()).length;
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  const startValidation = async () => {
    const uids = [...new Set(
      inputText.split("\n").map((l) => l.trim().split("|")[0].trim()).filter(Boolean),
    )];
    if (!uids.length) return;
    setStatus("running");
    setLiveResults([]); setDeadResults([]); setFeed([]);
    setProgress(0); setTotal(uids.length); setIsRateLimited(false);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/validate-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uids }),
        credentials: "include",
        signal: controller.signal,
      });
      if (!response.ok || !response.body) { setStatus("aborted"); return; }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.event === "done") {
              setStatus("done");
            } else if (evt.event === "rate_limited") {
              setIsRateLimited(true);
              setTimeout(() => setIsRateLimited(false), ((evt.retryAfter as number) ?? 30) * 1000 + 1000);
            } else if (evt.uid) {
              setProgress(evt.progress as number);
              const entry: FeedEntry = {
                uid: evt.uid as string,
                status: evt.status as "live" | "dead",
                name: (evt.name as string | null) ?? null,
                username: (evt.username as string | null) ?? null,
                followerCount: (evt.followerCount as string | null) ?? null,
                photoUrl: (evt.photoUrl as string | null) ?? null,
              };
              setFeed((prev) => [entry, ...prev].slice(0, 50));
              if (evt.status === "live") {
                setLiveResults((prev) => [...prev, {
                  uid: evt.uid as string,
                  name: (evt.name as string | null) ?? null,
                  username: (evt.username as string | null) ?? null,
                  followerCount: (evt.followerCount as string | null) ?? null,
                  photoUrl: (evt.photoUrl as string | null) ?? null,
                  instagramUsername: (evt.instagramUsername as string | null) ?? null,
                }]);
              } else {
                setDeadResults((prev) => [...prev, evt.uid as string]);
              }
            }
          } catch {}
        }
      }
      setStatus((s) => (s === "running" ? "done" : s));
    } catch {
      setStatus("aborted");
    }
  };

  const abort = () => { abortRef.current?.abort(); setStatus("aborted"); };
  const copyText = (t: string) => navigator.clipboard.writeText(t);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#070b16] text-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[#0c1122] border-b border-[#1a2540] sticky top-0">
        <Zap className="h-4 w-4 text-green-400 shrink-0" />
        <span className="font-bold text-sm flex-1">Bulk Live Validator</span>
        {status === "running" && (
          <button onClick={abort} className="text-[11px] bg-red-600/30 border border-red-500/40 text-red-300 px-3 py-1 rounded-lg hover:bg-red-600/50 transition-colors">
            Abort
          </button>
        )}
        <button onClick={() => { if (status === "running") abort(); onClose(); }} className="p-1.5 rounded text-slate-400 hover:text-white transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">

        {/* Idle: Input */}
        {status === "idle" && (
          <>
            <div className="bg-[#0c1122] rounded-xl border border-[#1a2540] p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Paste UIDs (one per line)</div>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={"100044388870940\njohnsmith\n100012345678..."}
                rows={10}
                className="w-full bg-[#070b16] border border-[#1a2540] text-cyan-300 placeholder-slate-700 text-xs font-mono rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500/50 resize-none"
              />
              <div className="text-[10px] text-slate-600 mt-1.5">{uidCount} UIDs entered · max 5,000</div>
            </div>
            <button
              onClick={startValidation}
              disabled={uidCount === 0}
              className="w-full py-3.5 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
            >
              <Zap className="h-4 w-4" /> Start Validation ({uidCount} UIDs)
            </button>
            <div className="text-[10px] text-slate-600 text-center px-4 pb-4">
              Each ID is checked live against Facebook. Live IDs (with profile data) and Dead IDs (no data) will be split into separate groups.
            </div>
          </>
        )}

        {/* Running: Progress + Feed */}
        {status === "running" && (
          <>
            <div className="bg-[#0c1122] rounded-xl border border-[#1a2540] p-3">
              <div className="flex items-center justify-between text-[11px] mb-2">
                <span className="text-slate-400 flex items-center gap-1.5">
                  {progress}/{total} validated
                  {isRateLimited && <span className="text-yellow-400 animate-pulse">⏳ Rate limited, pausing…</span>}
                </span>
                <span className="text-cyan-400 font-bold">{pct}%</span>
              </div>
              <div className="h-2.5 bg-[#1a2540] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#22c55e,#06b6d4)" }} />
              </div>
              <div className="flex gap-4 mt-2.5 text-[11px]">
                <span className="text-green-400 font-semibold">✅ {liveResults.length} Live</span>
                <span className="text-red-400 font-semibold">💀 {deadResults.length} Dead</span>
                <span className="text-slate-600 ml-auto">{total - progress} remaining</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider px-0.5 mb-1.5">Live Results Feed</div>
              <div className="flex flex-col gap-1 max-h-[55vh] overflow-y-auto">
                {feed.map((entry, i) => (
                  entry.status === "live" ? (
                    <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-green-900/20 border border-green-500/20">
                      <ValidatorAvatar uid={entry.uid} name={entry.name ?? null} photoUrl={entry.photoUrl ?? null} />
                      <div className="flex-1 min-w-0">
                        <div className="text-green-200 text-xs font-semibold truncate">{entry.name ?? entry.uid}</div>
                        <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                          {entry.username && <span className="text-cyan-400/80">@{entry.username}</span>}
                          {entry.followerCount && <span className="text-emerald-400">{entry.followerCount}</span>}
                          {!entry.name && <span className="text-slate-600 font-mono">{entry.uid}</span>}
                        </div>
                      </div>
                      <span className="text-green-400 text-xs shrink-0">✅</span>
                    </div>
                  ) : (
                    <div key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-red-900/10 border border-red-500/10 opacity-60">
                      <span className="text-red-400 text-xs">💀</span>
                      <span className="font-mono text-xs text-slate-500 truncate flex-1">{entry.uid}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          </>
        )}

        {/* Done / Aborted: Results */}
        {(status === "done" || status === "aborted") && (
          <>
            <div className="bg-[#0c1122] rounded-xl border border-[#1a2540] p-4 text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">
                {status === "done" ? "✅ Validation Complete" : "⚠️ Validation Aborted"}
              </div>
              <div className="flex justify-center gap-8">
                <div><div className="text-3xl font-bold text-green-400">{liveResults.length}</div><div className="text-[10px] text-slate-500 mt-0.5">Live IDs</div></div>
                <div><div className="text-3xl font-bold text-red-400">{deadResults.length}</div><div className="text-[10px] text-slate-500 mt-0.5">Dead IDs</div></div>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => setActiveTab("live")} className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-colors ${activeTab === "live" ? "bg-green-600/30 border-green-500/40 text-green-300" : "border-[#1a2540] text-slate-500 hover:text-white"}`}>✅ Live ({liveResults.length})</button>
              <button onClick={() => setActiveTab("dead")} className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-colors ${activeTab === "dead" ? "bg-red-600/30 border-red-500/40 text-red-300" : "border-[#1a2540] text-slate-500 hover:text-white"}`}>💀 Dead ({deadResults.length})</button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {activeTab === "live" ? (
                <>
                  <button onClick={() => onImportLive(liveResults.map((r) => r.uid))} disabled={liveResults.length === 0}
                    className="py-2.5 text-xs font-bold bg-green-600/30 border border-green-500/40 text-green-300 hover:bg-green-600/50 rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Import Live
                  </button>
                  <button onClick={() => copyText(liveResults.map((r) => r.uid).join("\n"))} disabled={liveResults.length === 0}
                    className="py-2.5 text-xs font-bold bg-[#1a2540] border border-[#1a2540] text-slate-300 hover:text-white rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5">
                    <Copy className="h-3.5 w-3.5" /> Copy Live UIDs
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => onImportDead(deadResults)} disabled={deadResults.length === 0}
                    className="py-2.5 text-xs font-bold bg-red-600/30 border border-red-500/40 text-red-300 hover:bg-red-600/50 rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Import Dead
                  </button>
                  <button onClick={() => copyText(deadResults.join("\n"))} disabled={deadResults.length === 0}
                    className="py-2.5 text-xs font-bold bg-[#1a2540] border border-[#1a2540] text-slate-300 hover:text-white rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5">
                    <Copy className="h-3.5 w-3.5" /> Copy Dead UIDs
                  </button>
                </>
              )}
            </div>
            <div className="flex flex-col gap-1.5 pb-4">
              {activeTab === "live"
                ? liveResults.map((r) => (
                    <div key={r.uid} className="flex items-center gap-2.5 bg-green-900/15 border border-green-500/20 rounded-xl px-3 py-2">
                      <ValidatorAvatar uid={r.uid} name={r.name} photoUrl={r.photoUrl} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {r.name && <span className="text-green-200 text-xs font-semibold truncate">{r.name}</span>}
                          {r.username && <span className="text-cyan-400/70 text-[10px]">@{r.username}</span>}
                          {r.followerCount && <span className="text-emerald-400 text-[10px]">{r.followerCount}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-slate-600 text-[10px] font-mono truncate">{r.uid}</span>
                          {r.instagramUsername && <span className="text-pink-400 text-[10px]">📷 @{r.instagramUsername}</span>}
                        </div>
                      </div>
                    </div>
                  ))
                : (
                  <div className="bg-[#0c1122] border border-[#1a2540] rounded-xl p-3 max-h-[60vh] overflow-y-auto">
                    {deadResults.map((uid, i) => (
                      <div key={i} className="text-[11px] text-slate-600 font-mono py-0.5">{uid}</div>
                    ))}
                  </div>
                )
              }
            </div>
            <button onClick={() => { setStatus("idle"); setLiveResults([]); setDeadResults([]); setFeed([]); setProgress(0); }}
              className="w-full py-2.5 border border-[#1a2540] text-slate-400 hover:text-white text-xs rounded-xl transition-colors mb-24 flex items-center justify-center gap-1.5">
              <RotateCcw className="h-3 w-3" /> Validate Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const LOGIN_STATUS_CONFIG: Record<LoginStatus, { label: string; color: string; dotClass: string; bgClass: string; borderClass: string }> = {
  live:       { label: "Live ✅",            color: "text-green-400",  dotClass: "bg-green-400",  bgClass: "bg-green-900/20",  borderClass: "border-green-500/30" },
  dead:       { label: "Dead ❌",            color: "text-red-500",    dotClass: "bg-red-500",    bgClass: "bg-red-900/15",    borderClass: "border-red-500/20" },
  checkpoint: { label: "Checkpoint 🔒",      color: "text-yellow-400", dotClass: "bg-yellow-400", bgClass: "bg-yellow-900/20", borderClass: "border-yellow-500/30" },
  "2fa":      { label: "2FA 🔑",             color: "text-blue-400",   dotClass: "bg-blue-400",   bgClass: "bg-blue-900/20",   borderClass: "border-blue-500/30" },
  locked:     { label: "Locked 🚫",          color: "text-orange-400", dotClass: "bg-orange-400", bgClass: "bg-orange-900/20", borderClass: "border-orange-500/30" },
  disabled:   { label: "Disabled 🛑",        color: "text-slate-500",  dotClass: "bg-slate-500",  bgClass: "bg-slate-900/30",  borderClass: "border-slate-600/30" },
  wrongpass:  { label: "Wrong Password 🔐",  color: "text-pink-400",   dotClass: "bg-pink-400",   bgClass: "bg-pink-900/20",   borderClass: "border-pink-500/30" },
};

type LCStatus = "idle" | "running" | "done" | "aborted";
interface LCResult {
  uid: string;
  password: string;
  status: LoginStatus;
  statusLabel: string;
  accessToken: string | null;
}

function LoginCheckerPanel({
  onClose,
  prefillPairs,
  onComplete,
}: {
  onClose: () => void;
  prefillPairs?: string;
  onComplete?: (results: LCResult[]) => void;
}) {
  const [inputText, setInputText] = useState(prefillPairs ?? "");
  const [workers, setWorkers] = useState(3);
  const [delay, setDelay] = useState(1);
  const [status, setStatus] = useState<LCStatus>("idle");
  const [results, setResults] = useState<LCResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<LoginStatus | "all">("all");
  const abortRef = useRef<AbortController | null>(null);

  const pairCount = inputText.split("\n").filter((l) => { const t = l.trim(); return t && (t.includes("|") || t.includes(":")); }).length;
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  const countsByStatus = useMemo(() => {
    const c: Partial<Record<LoginStatus, number>> = {};
    for (const r of results) {
      c[r.status] = (c[r.status] ?? 0) + 1;
    }
    return c;
  }, [results]);

  const filteredResults = useMemo(() => {
    if (activeTab === "all") return results;
    return results.filter((r) => r.status === activeTab);
  }, [results, activeTab]);

  const startCheck = async () => {
    const pairs = inputText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        if (l.includes("|")) {
          const parts = l.split("|");
          return { uid: parts[0]?.trim() ?? "", password: parts.slice(1).join("|").trim() };
        } else {
          const colonIdx = l.indexOf(":");
          if (colonIdx === -1) return { uid: l.trim(), password: "" };
          return { uid: l.slice(0, colonIdx).trim(), password: l.slice(colonIdx + 1).trim() };
        }
      })
      .filter((p) => p.uid && p.password);

    if (!pairs.length) return;

    setStatus("running");
    setResults([]);
    setProgress(0);
    setTotal(pairs.length);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/login-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs, workers, delay: delay * 1000 }),
        credentials: "include",
        signal: controller.signal,
      });
      if (!response.ok || !response.body) { setStatus("aborted"); return; }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as Record<string, unknown>;
            if (evt.event === "done") {
              setStatus("done");
            } else if (evt.uid) {
              setProgress(evt.progress as number);
              const r: LCResult = {
                uid: evt.uid as string,
                password: evt.password as string,
                status: evt.status as LoginStatus,
                statusLabel: evt.statusLabel as string,
                accessToken: (evt.accessToken as string | null) ?? null,
              };
              setResults((prev) => [r, ...prev]);
            }
          } catch {}
        }
      }
      setStatus((s) => (s === "running" ? "done" : s));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setStatus("aborted");
    }
  };

  const abort = () => { abortRef.current?.abort(); setStatus("aborted"); };

  const copyText = (t: string) => navigator.clipboard.writeText(t);

  const liveResults = results.filter((r) => r.status === "live");

  const exportLiveTokens = () => {
    const lines = liveResults.map((r) => r.accessToken ? `${r.uid}|${r.password}|${r.accessToken}` : `${r.uid}|${r.password}`);
    copyText(lines.join("\n"));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#070b16] text-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[#0c1122] border-b border-[#1a2540] sticky top-0 z-10">
        <Shield className="h-4 w-4 text-purple-400 shrink-0" />
        <span className="font-bold text-sm flex-1">Graph API Login Checker</span>
        {status === "running" && (
          <button onClick={abort} className="text-[11px] bg-red-600/30 border border-red-500/40 text-red-300 px-3 py-1 rounded-lg hover:bg-red-600/50 transition-colors">
            Stop
          </button>
        )}
        {(status === "done" || status === "aborted") && results.length > 0 && onComplete && (
          <button
            onClick={() => { onComplete(results); onClose(); }}
            className="text-[11px] bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 px-3 py-1 rounded-lg hover:bg-cyan-600/50 transition-colors">
            Apply to Dashboard
          </button>
        )}
        <button onClick={() => { if (status === "running") abort(); onClose(); }} className="p-1.5 rounded text-slate-400 hover:text-white transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">

        {/* Settings */}
        {status === "idle" && (
          <>
            <div className="bg-[#0c1122] rounded-xl border border-[#1a2540] p-3 space-y-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Paste uid|password lines</div>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={"100044388870940|mypassword123\n100012345678:another_pass\n(uid|pass or uid:pass)"}
                rows={8}
                className="w-full bg-[#070b16] border border-[#1a2540] text-cyan-300 placeholder-slate-700 text-xs font-mono rounded-lg px-3 py-2.5 outline-none focus:border-purple-500/50 resize-none"
              />
              <div className="text-[10px] text-slate-600">{pairCount} valid pairs · max 2,000</div>
            </div>

            <div className="bg-[#0c1122] rounded-xl border border-[#1a2540] p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Workers</span>
                <span className="text-xs font-bold text-purple-300">{workers}</span>
              </div>
              <input type="range" min={1} max={10} value={workers} onChange={(e) => setWorkers(Number(e.target.value))}
                className="w-full accent-purple-500" />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Delay Between Requests</span>
                <span className="text-xs font-bold text-purple-300">{delay}s</span>
              </div>
              <input type="range" min={0} max={5} step={0.5} value={delay} onChange={(e) => setDelay(Number(e.target.value))}
                className="w-full accent-purple-500" />
            </div>

            <div className="bg-[#0c1122] rounded-xl border border-purple-500/20 p-3">
              <div className="text-[10px] text-purple-400 font-semibold mb-1.5">Status Guide</div>
              <div className="grid grid-cols-2 gap-1">
                {(Object.entries(LOGIN_STATUS_CONFIG) as [LoginStatus, typeof LOGIN_STATUS_CONFIG[LoginStatus]][]).map(([, cfg]) => (
                  <div key={cfg.label} className="flex items-center gap-1.5 text-[10px]">
                    <div className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass} shrink-0`} />
                    <span className={cfg.color}>{cfg.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={startCheck}
              disabled={pairCount === 0}
              className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2">
              <Shield className="h-4 w-4" /> Start Login Check ({pairCount} pairs)
            </button>
          </>
        )}

        {/* Running */}
        {status === "running" && (
          <>
            <div className="bg-[#0c1122] rounded-xl border border-[#1a2540] p-3">
              <div className="flex items-center justify-between text-[11px] mb-2">
                <span className="text-slate-400">{progress}/{total} checked</span>
                <span className="text-purple-400 font-bold">{pct}%</span>
              </div>
              <div className="h-2.5 bg-[#1a2540] rounded-full overflow-hidden mb-3">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#a855f7,#6366f1)" }} />
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {countsByStatus.live ? <span className="text-green-400 font-semibold">✅ {countsByStatus.live} Live</span> : null}
                {countsByStatus.checkpoint ? <span className="text-yellow-400 font-semibold">🔒 {countsByStatus.checkpoint} Checkpoint</span> : null}
                {countsByStatus["2fa"] ? <span className="text-blue-400 font-semibold">🔑 {countsByStatus["2fa"]} 2FA</span> : null}
                {countsByStatus.wrongpass ? <span className="text-pink-400 font-semibold">🔐 {countsByStatus.wrongpass} WrongPass</span> : null}
                {countsByStatus.dead ? <span className="text-red-400 font-semibold">❌ {countsByStatus.dead} Dead</span> : null}
                {countsByStatus.locked ? <span className="text-orange-400 font-semibold">🚫 {countsByStatus.locked} Locked</span> : null}
                {countsByStatus.disabled ? <span className="text-slate-400 font-semibold">🛑 {countsByStatus.disabled} Disabled</span> : null}
                <span className="text-slate-600 ml-auto">{total - progress} left</span>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Live Feed</div>
            <div className="flex flex-col gap-1">
              {results.slice(0, 30).map((r, i) => {
                const cfg = LOGIN_STATUS_CONFIG[r.status] ?? LOGIN_STATUS_CONFIG.dead;
                return (
                  <div key={i} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border ${cfg.bgClass} ${cfg.borderClass}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
                    <span className="font-mono text-xs text-slate-300 truncate flex-1">{r.uid}</span>
                    <span className={`text-[10px] font-semibold ${cfg.color} shrink-0`}>{r.statusLabel}</span>
                    {r.accessToken && (
                      <button onClick={() => copyText(r.accessToken!)} className="text-[9px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded hover:bg-green-900/60 shrink-0">
                        Token
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Done / Aborted */}
        {(status === "done" || status === "aborted") && (
          <>
            <div className="bg-[#0c1122] rounded-xl border border-[#1a2540] p-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider text-center mb-3">
                {status === "done" ? "✅ Check Complete" : "⚠️ Aborted"}
              </div>
              <div className="flex flex-wrap justify-center gap-4">
                {(Object.entries(countsByStatus) as [LoginStatus, number][]).map(([s, cnt]) => {
                  const cfg = LOGIN_STATUS_CONFIG[s];
                  return (
                    <div key={s} className="text-center">
                      <div className={`text-2xl font-bold ${cfg.color}`}>{cnt}</div>
                      <div className="text-[10px] text-slate-500">{cfg.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Export live tokens */}
            {liveResults.length > 0 && (
              <div className="flex gap-1.5">
                <button onClick={exportLiveTokens}
                  className="flex-1 py-2.5 text-xs font-bold bg-green-600/30 border border-green-500/40 text-green-300 hover:bg-green-600/50 rounded-xl flex items-center justify-center gap-1.5 transition-colors">
                  <Copy className="h-3.5 w-3.5" /> Copy Live (uid|pass|token) ({liveResults.length})
                </button>
                <button onClick={() => copyText(liveResults.map((r) => `${r.uid}|${r.password}`).join("\n"))}
                  className="flex-1 py-2.5 text-xs font-bold bg-[#1a2540] border border-[#1a2540] text-slate-300 hover:text-white rounded-xl flex items-center justify-center gap-1.5 transition-colors">
                  <Copy className="h-3.5 w-3.5" /> Copy Live Pairs
                </button>
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-1 flex-wrap">
              <button onClick={() => setActiveTab("all")}
                className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${activeTab === "all" ? "bg-purple-500 border-purple-500 text-white font-bold" : "border-[#1a2540] text-slate-500 hover:text-white"}`}>
                All ({results.length})
              </button>
              {(Object.entries(countsByStatus) as [LoginStatus, number][]).map(([s, cnt]) => {
                const cfg = LOGIN_STATUS_CONFIG[s];
                return (
                  <button key={s} onClick={() => setActiveTab(s)}
                    className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${activeTab === s ? `${cfg.bgClass} ${cfg.borderClass} ${cfg.color} font-bold` : "border-[#1a2540] text-slate-500 hover:text-white"}`}>
                    {cfg.label} ({cnt})
                  </button>
                );
              })}
            </div>

            {/* Results list */}
            <div className="flex flex-col gap-1 pb-24">
              {filteredResults.map((r, i) => {
                const cfg = LOGIN_STATUS_CONFIG[r.status] ?? LOGIN_STATUS_CONFIG.dead;
                return (
                  <div key={i} className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${cfg.bgClass} ${cfg.borderClass}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs text-slate-200 truncate">{r.uid}</span>
                        <span className={`text-[10px] font-semibold ${cfg.color}`}>{r.statusLabel}</span>
                      </div>
                      {r.accessToken && (
                        <div className="text-[10px] text-green-400/70 font-mono truncate mt-0.5">{r.accessToken.slice(0, 40)}…</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => copyText(`${r.uid}|${r.password}`)}
                        className="text-[9px] bg-slate-700/50 hover:bg-slate-600/60 text-slate-300 px-1.5 py-0.5 rounded">
                        uid|pass
                      </button>
                      {r.accessToken && (
                        <button onClick={() => copyText(r.accessToken!)}
                          className="text-[9px] bg-green-900/40 hover:bg-green-900/60 text-green-400 px-1.5 py-0.5 rounded">
                          Token
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={() => { setStatus("idle"); setResults([]); setProgress(0); setActiveTab("all"); }}
              className="w-full py-2.5 border border-[#1a2540] text-slate-400 hover:text-white text-xs rounded-xl transition-colors mb-24 flex items-center justify-center gap-1.5">
              <RotateCcw className="h-3 w-3" /> Check Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function highlightText(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-400 text-black rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const TAG_OPTIONS = [
  { label: "VIP", color: "bg-yellow-500 text-black" },
  { label: "Hot", color: "bg-red-500 text-white" },
  { label: "New", color: "bg-blue-500 text-white" },
  { label: "Done", color: "bg-green-500 text-white" },
  { label: "Skip", color: "bg-slate-500 text-white" },
];

function tagColor(tag: string | null): string {
  const found = TAG_OPTIONS.find((t) => t.label === tag);
  return found ? found.color : "bg-purple-600 text-white";
}

function fontClass(size: "sm" | "base" | "lg"): string {
  if (size === "base") return "text-base";
  if (size === "lg") return "text-lg";
  return "text-sm";
}

export default function Dashboard() {
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const topRef = useRef<HTMLDivElement>(null);

  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [showSort, setShowSort] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [copyFormat, setCopyFormat] = useState<CopyFormat>("both");
  const [showCopyFmt, setShowCopyFmt] = useState(false);
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showTagPicker, setShowTagPicker] = useState<number | null>(null);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showCharts, setShowCharts] = useState(() => {
    try { return localStorage.getItem("fb_show_charts") === "true"; } catch { return false; }
  });
  const [chartPeriod, setChartPeriod] = useState<"7d" | "30d">("7d");
  const [extendedDays, setExtendedDays] = useState<{ date: string; count: number }[]>([]);
  const [tagStats, setTagStats] = useState<{ tag: string; count: number }[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">(() => {
    try { return (localStorage.getItem("fb_font_size") as "sm" | "base" | "lg") ?? "sm"; } catch { return "sm"; }
  });
  const [viewMode, setViewMode] = useState<"list" | "compact">(() => {
    try { return (localStorage.getItem("fb_view_mode") as "list" | "compact") ?? "list"; } catch { return "list"; }
  });
  const [visibleCount, setVisibleCount] = useState(50);
  const [undoItem, setUndoItem] = useState<{ id: number; uid: string; password: string | null; pinned: boolean; visited: boolean; note: string | null; tag: string | null } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try { return (localStorage.getItem("fb_theme") as "dark" | "light") ?? "dark"; } catch { return "dark"; }
  });
  const [visitCounts, setVisitCounts] = useState<Map<string, number>>(() => {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("fb_visit_"));
      const m = new Map<string, number>();
      for (const k of keys) m.set(k.slice("fb_visit_".length), Number(localStorage.getItem(k) ?? 0));
      return m;
    } catch { return new Map(); }
  });
  const [showValidator, setShowValidator] = useState(false);
  const [showLoginChecker, setShowLoginChecker] = useState(false);
  const [loginCheckerPrefill, setLoginCheckerPrefill] = useState<string | undefined>(undefined);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showBatchTagPicker, setShowBatchTagPicker] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fetchingUids, setFetchingUids] = useState<Set<string>>(new Set());
  const [showPasswords, setShowPasswords] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [swipedId, setSwipedId] = useState<number | null>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const listBottomRef = useRef<HTMLDivElement>(null);
  const [profileData, setProfileData] = useState<Map<string, ProfileData>>(new Map());
  const fetchedUids = useRef<Set<string>>(new Set());
  const [failedUids, setFailedUids] = useState<Set<string>>(new Set());
  const analyticsRef = useRef<HTMLDivElement>(null);
  const [activeNav, setActiveNav] = useState<"home" | "search" | "import" | "analytics" | "settings">("home");

  const { data: idsData, isLoading: idsLoading } = useListFacebookIds({
    query: { queryKey: getListFacebookIdsQueryKey() },
  });
  const { data: statsData } = useGetFacebookIdStats({
    query: { queryKey: getGetFacebookIdStatsQueryKey() },
  });
  const { data: dailyData } = useGetDailyStats({
    query: { queryKey: getGetDailyStatsQueryKey() },
  });

  const importMutation = useBulkImportFacebookIds({
    mutation: {
      onSuccess: (r) => {
        toast({ description: `✅ Imported ${r.imported}. Skipped ${r.duplicatesSkipped} duplicates.` });
        setImportText(""); setShowImport(false);
        queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFacebookIdStatsQueryKey() });
      },
      onError: (e) => toast({ description: e.data?.error ?? "Import failed", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteFacebookId({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFacebookIdStatsQueryKey() });
      },
    },
  });

  const importMutationForUndo = useBulkImportFacebookIds({ mutation: {} });

  const handleImportLive = useCallback(async (uids: string[]) => {
    if (!uids.length) return;
    try {
      const r = await fetch("/api/facebook-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: uids.join("\n") }),
        credentials: "include",
      });
      const data = await r.json() as { imported?: number };
      toast({ description: `✅ Imported ${data.imported ?? 0} live IDs.` });
      setShowValidator(false);
      queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetFacebookIdStatsQueryKey() });
    } catch {
      toast({ description: "Import failed", variant: "destructive" });
    }
  }, [queryClient, toast]);

  const handleImportDead = useCallback(async (uids: string[]) => {
    if (!uids.length) return;
    try {
      const r = await fetch("/api/facebook-ids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: uids.join("\n"), defaultTag: "Dead" }),
        credentials: "include",
      });
      const data = await r.json() as { imported?: number };
      toast({ description: `💀 Imported ${data.imported ?? 0} dead IDs (tagged "Dead").` });
      setShowValidator(false);
      queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetFacebookIdStatsQueryKey() });
    } catch {
      toast({ description: "Import failed", variant: "destructive" });
    }
  }, [queryClient, toast]);

  const deleteWithUndo = useCallback((item: { id: number; uid: string; password: string | null; pinned: boolean; visited: boolean; note: string | null; tag: string | null }) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoItem(item);
    deleteMutation.mutate({ id: item.id });
    setSwipedId(null);
    undoTimerRef.current = setTimeout(() => setUndoItem(null), 6000);
  }, [deleteMutation]);

  const handleUndo = useCallback(() => {
    if (!undoItem) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const line = undoItem.password ? `${undoItem.uid}|${undoItem.password}` : undoItem.uid;
    importMutationForUndo.mutate({ data: { rawText: line } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFacebookIdStatsQueryKey() });
        toast({ description: "↩️ Restored!" });
      },
    });
    setUndoItem(null);
  }, [undoItem, importMutationForUndo, queryClient, toast]);

  const updateMutation = useUpdateFacebookId({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFacebookIdStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDailyStatsQueryKey() });
      },
    },
  });

  const clearAllMutation = useClearAllFacebookIds({
    mutation: {
      onSuccess: (r) => {
        toast({ description: `🗑️ Deleted ${r.deleted} IDs.` });
        queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFacebookIdStatsQueryKey() });
      },
    },
  });

  const fetchProfile = useCallback(async (uid: string) => {
    if (fetchedUids.current.has(uid)) return;
    fetchedUids.current.add(uid);
    setFetchingUids((prev) => new Set(prev).add(uid));
    try {
      const res = await fetch(`/api/profile-lookup?uid=${encodeURIComponent(uid)}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data: ProfileData = await res.json();
        if (data.name || data.username || data.followerCount || data.instagramUsername) {
          setProfileData((prev) => new Map(prev).set(uid, data));
          setFailedUids((prev) => { const next = new Set(prev); next.delete(uid); return next; });
        } else {
          setFailedUids((prev) => new Set(prev).add(uid));
        }
      } else {
        setFailedUids((prev) => new Set(prev).add(uid));
      }
    } catch {
      setFailedUids((prev) => new Set(prev).add(uid));
    } finally {
      setFetchingUids((prev) => { const next = new Set(prev); next.delete(uid); return next; });
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/login");
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    setVisibleCount(50);
  }, [filterMode, sortMode, searchQuery, tagFilter]);

  useEffect(() => {
    if (idsLoading) return;
    const el = listBottomRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount((v) => v + 50);
      },
      { threshold: 0.1, rootMargin: "0px 0px 120px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [idsLoading]);

  useEffect(() => {
    document.documentElement.setAttribute("data-fb-theme", theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowSearch((v) => !v);
        setShowSort(false); setShowCopyFmt(false); setShowSettings(false);
      }
      if (e.key === "Escape") {
        setShowSearch(false); setShowSort(false); setShowCopyFmt(false);
        setShowSettings(false); setSwipedId(null);
        setSelected(new Set()); setShowBatchTagPicker(false);
        setEditingNote(null); setShowTagPicker(null);
      }
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSelected((prev) => prev.size === filteredItems.length ? new Set() : new Set(filteredItems.map((i) => i.id)));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredItems]);

  const retryAllFailed = useCallback(async () => {
    if (!failedUids.size) return;
    setRetryingAll(true);
    const uids = [...failedUids];
    for (const uid of uids) {
      fetchedUids.current.delete(uid);
    }
    setFailedUids(new Set());
    uids.forEach((uid, idx) => {
      setTimeout(() => fetchProfile(uid), idx * 400);
    });
    setTimeout(() => setRetryingAll(false), uids.length * 400 + 1000);
    toast({ description: `🔄 Retrying ${uids.length} failed profiles…` });
  }, [failedUids, fetchProfile, toast]);

  const incrementVisit = useCallback((uid: string) => {
    try {
      const key = `fb_visit_${uid}`;
      const next = Number(localStorage.getItem(key) ?? 0) + 1;
      localStorage.setItem(key, String(next));
      setVisitCounts((prev) => new Map(prev).set(uid, next));
    } catch {}
  }, []);

  const retryProfile = useCallback((uid: string) => {
    fetchedUids.current.delete(uid);
    setFailedUids((prev) => { const next = new Set(prev); next.delete(uid); return next; });
    fetchProfile(uid);
  }, [fetchProfile]);

  const handleRefetchAll = useCallback((visibleItems: { uid: string }[]) => {
    fetchedUids.current.clear();
    setFailedUids(new Set());
    setProfileData(new Map());
    visibleItems.forEach((item, idx) => {
      setTimeout(() => fetchProfile(item.uid), idx * 300);
    });
    toast({ description: "🔄 Re-fetching profiles…" });
  }, [fetchProfile, toast]);

  useEffect(() => {
    if (!showCharts) return;
    fetch("/api/facebook-ids/tag-stats", { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setTagStats(d.tags ?? []))
      .catch(() => {});
  }, [showCharts, idsData]);

  useEffect(() => {
    if (!showCharts || chartPeriod !== "30d") return;
    fetch("/api/facebook-ids/daily-stats?days=30", { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setExtendedDays(d.days ?? []))
      .catch(() => {});
  }, [showCharts, chartPeriod, idsData]);

  const allItems = idsData?.items ?? [];

  function parseFollowerNum(s: string | null): number {
    if (!s) return -1;
    const m = s.match(/^([\d.]+)([KMkm]?)$/);
    if (!m) return -1;
    const n = parseFloat(m[1]);
    const mul = m[2].toUpperCase() === "M" ? 1_000_000 : m[2].toUpperCase() === "K" ? 1_000 : 1;
    return n * mul;
  }

  const filteredItems = useMemo(() => {
    let items = [...allItems];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) =>
        i.uid.toLowerCase().includes(q) ||
        (i.note ?? "").toLowerCase().includes(q) ||
        (profileData.get(i.uid)?.name ?? "").toLowerCase().includes(q) ||
        (profileData.get(i.uid)?.instagramUsername ?? "").toLowerCase().includes(q),
      );
    }
    switch (filterMode) {
      case "checked":     items = items.filter((i) => i.visited); break;
      case "unchecked":   items = items.filter((i) => !i.visited); break;
      case "saved":       items = items.filter((i) => i.pinned); break;
      case "noted":       items = items.filter((i) => !!i.note); break;
      case "hasnote":     items = items.filter((i) => !!i.note); break;
      case "tagged":      items = items.filter((i) => !!i.tag); break;
      case "hasig":       items = items.filter((i) => !!profileData.get(i.uid)?.instagramUsername); break;
      case "hasname":     items = items.filter((i) => !!profileData.get(i.uid)?.name); break;
      case "dead":        items = items.filter((i) => i.tag === "Dead"); break;
      case "live":        items = items.filter((i) => (i as { loginStatus?: string | null }).loginStatus === "live"); break;
      case "checkpoint":  items = items.filter((i) => (i as { loginStatus?: string | null }).loginStatus === "checkpoint"); break;
      case "twofactor":   items = items.filter((i) => (i as { loginStatus?: string | null }).loginStatus === "2fa"); break;
    }
    if (tagFilter !== null) {
      items = items.filter((i) => i.tag === tagFilter);
    }
    switch (sortMode) {
      case "oldest": items.sort((a, b) => a.id - b.id); break;
      case "newest": items.sort((a, b) => b.id - a.id); break;
      case "checked": items.sort((a, b) => (b.visited ? 1 : 0) - (a.visited ? 1 : 0)); break;
      case "unchecked": items.sort((a, b) => (a.visited ? 1 : 0) - (b.visited ? 1 : 0)); break;
      case "saved": items.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)); break;
      case "alpha": items.sort((a, b) => a.uid.localeCompare(b.uid)); break;
      case "recent": items.sort((a, b) => {
        const ta = (a as { visitedAt?: string | null }).visitedAt ? new Date((a as { visitedAt: string }).visitedAt).getTime() : 0;
        const tb = (b as { visitedAt?: string | null }).visitedAt ? new Date((b as { visitedAt: string }).visitedAt).getTime() : 0;
        return tb - ta;
      }); break;
      case "name": items.sort((a, b) => {
        const na = profileData.get(a.uid)?.name ?? null;
        const nb = profileData.get(b.uid)?.name ?? null;
        if (na && nb) return na.localeCompare(nb);
        if (na) return -1;
        if (nb) return 1;
        return 0;
      }); break;
      case "followers": items.sort((a, b) =>
        parseFollowerNum(profileData.get(b.uid)?.followerCount ?? null) -
        parseFollowerNum(profileData.get(a.uid)?.followerCount ?? null)
      ); break;
    }
    return items;
  }, [allItems, searchQuery, sortMode, filterMode, profileData, tagFilter]);

  useEffect(() => {
    if (idsLoading) return;
    const visible = filteredItems.slice(0, visibleCount);
    const pending = visible.filter((item) => !fetchedUids.current.has(item.uid));
    if (pending.length === 0) return;
    const BATCH = 2;
    const DELAY = 800;
    const timers: ReturnType<typeof setTimeout>[] = [];
    pending.forEach((item, idx) => {
      const batchDelay = Math.floor(idx / BATCH) * DELAY;
      const t = setTimeout(() => fetchProfile(item.uid), batchDelay);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [filteredItems, visibleCount, idsLoading, fetchProfile]);

  const total = statsData?.total ?? 0;
  const checked = statsData?.visited ?? 0;
  const left = statsData?.unvisited ?? 0;
  const saved = statsData?.pinned ?? 0;
  const checkedPct = total > 0 ? Math.round((checked / total) * 100) : 0;

  function followerTier(count: string | null): { label: string; icon: string; cls: string } | null {
    const n = parseFollowerNum(count);
    if (n >= 1_000_000) return { label: "Mega", icon: "👑", cls: "bg-yellow-500 text-black" };
    if (n >= 100_000)  return { label: "Macro", icon: "🔥", cls: "bg-purple-600 text-white" };
    if (n >= 10_000)   return { label: "Micro", icon: "⭐", cls: "bg-blue-600 text-white" };
    if (n >= 1_000)    return { label: "Nano",  icon: "✦",  cls: "bg-slate-600 text-slate-200" };
    return null;
  }

  const downloadJson = (items: typeof allItems, filename: string) => {
    const data = items.map((i) => ({
      uid: i.uid, password: i.password ?? null, note: i.note ?? null,
      tag: i.tag ?? null, saved: i.pinned, checked: i.visited,
      profile: profileData.get(i.uid) ?? null,
    }));
    downloadFile(JSON.stringify(data, null, 2), filename);
  };

  const formatText = (uid: string, password: string | null, accessToken?: string | null): string => {
    if (copyFormat === "uid") return uid;
    if (copyFormat === "pass") return password ?? uid;
    if (copyFormat === "named") {
      const p = profileData.get(uid);
      const parts = [uid, password ?? "", p?.name ?? "", p?.instagramUsername ? `IG:${p.instagramUsername}` : ""].filter(Boolean);
      return parts.join("|");
    }
    if (copyFormat === "token") {
      if (accessToken) return `${uid}|${password ?? ""}|${accessToken}`;
      return password ? `${uid}|${password}` : uid;
    }
    return password ? `${uid}|${password}` : uid;
  };

  const copy = (text: string, label: string) =>
    navigator.clipboard.writeText(text).then(() => toast({ description: `📋 ${label}` }));

  const downloadFile = (text: string, filename: string) => {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const downloadCsv = (items: typeof allItems, filename: string) => {
    const rows = items.map((i) => `${i.uid},${i.password ?? ""},${i.note ?? ""},${i.tag ?? ""}`);
    downloadFile(["uid,password,note,tag", ...rows].join("\n"), filename);
  };

  const getBulk = (type: "checked" | "unchecked" | "saved") => {
    if (type === "checked") return allItems.filter((i) => i.visited);
    if (type === "unchecked") return allItems.filter((i) => !i.visited);
    return allItems.filter((i) => i.pinned);
  };

  const toggleSelect = (id: number) => setSelected((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const toggleSelectAll = () =>
    setSelected(selected.size === filteredItems.length ? new Set() : new Set(filteredItems.map((i) => i.id)));

  const selectedItems = filteredItems.filter((i) => selected.has(i.id));

  const bulkCheck = (val: boolean) => selectedItems.forEach((i) => updateMutation.mutate({ id: i.id, data: { visited: val } }));
  const bulkSave = (val: boolean) => selectedItems.forEach((i) => updateMutation.mutate({ id: i.id, data: { pinned: val } }));
  const bulkDelete = () => {
    if (!confirm(`Delete ${selectedItems.length} items?`)) return;
    selectedItems.forEach((i) => deleteMutation.mutate({ id: i.id }));
    setSelected(new Set());
  };
  const bulkCopy = () => {
    const text = selectedItems.map((i) => formatText(i.uid, i.password, (i as { accessToken?: string | null }).accessToken)).join("\n");
    copy(text, `Copied ${selectedItems.length} items`);
  };

  const saveNote = (id: number) => {
    updateMutation.mutate({ id, data: { note: noteText.trim() || null } });
    setEditingNote(null);
  };

  const setTag = (id: number, tag: string | null) => {
    updateMutation.mutate({ id, data: { tag } });
    setShowTagPicker(null);
  };

  const handleCopyAll = () => {
    const text = (selected.size > 0 ? selectedItems : filteredItems).map((i) => formatText(i.uid, i.password, (i as { accessToken?: string | null }).accessToken)).join("\n");
    copy(text, `Copied ${selected.size > 0 ? selectedItems.length : filteredItems.length} IDs`);
  };

  const handleSaveAll = () => {
    const targets = selected.size > 0 ? selectedItems : filteredItems;
    targets.forEach((i) => updateMutation.mutate({ id: i.id, data: { pinned: true } }));
    toast({ description: `💾 Saved ${targets.length} IDs` });
  };

  if (authLoading || !isAuthenticated) return null;

  const igCount = allItems.filter((i) => !!profileData.get(i.uid)?.instagramUsername).length;
  const nameCount = allItems.filter((i) => !!profileData.get(i.uid)?.name).length;
  const deadCount = allItems.filter((i) => i.tag === "Dead").length;
  const liveLoginCount = allItems.filter((i) => (i as { loginStatus?: string | null }).loginStatus === "live").length;
  const checkpointCount = allItems.filter((i) => (i as { loginStatus?: string | null }).loginStatus === "checkpoint").length;
  const twofaCount = allItems.filter((i) => (i as { loginStatus?: string | null }).loginStatus === "2fa").length;

  const filterTabs: { key: FilterMode; label: string; count: number }[] = [
    { key: "all",       label: "All",  count: allItems.length },
    { key: "checked",   label: "✅",   count: allItems.filter((i) => i.visited).length },
    { key: "unchecked", label: "⏳",   count: allItems.filter((i) => !i.visited).length },
    { key: "saved",     label: "💾",   count: allItems.filter((i) => i.pinned).length },
    { key: "hasnote",   label: "📝",   count: allItems.filter((i) => !!i.note).length },
    { key: "tagged",    label: "🏷️",  count: allItems.filter((i) => !!i.tag).length },
    ...(igCount > 0          ? [{ key: "hasig"      as FilterMode, label: "📷 IG",         count: igCount }] : []),
    ...(nameCount > 0        ? [{ key: "hasname"    as FilterMode, label: "👤 Name",        count: nameCount }] : []),
    ...(deadCount > 0        ? [{ key: "dead"       as FilterMode, label: "💀 Dead",        count: deadCount }] : []),
    ...(liveLoginCount > 0   ? [{ key: "live"       as FilterMode, label: "🔓 Live",        count: liveLoginCount }] : []),
    ...(checkpointCount > 0  ? [{ key: "checkpoint" as FilterMode, label: "🔒 Checkpoint",  count: checkpointCount }] : []),
    ...(twofaCount > 0       ? [{ key: "twofactor"  as FilterMode, label: "🔑 2FA",         count: twofaCount }] : []),
  ];

  return (
    <div id="fb-root" ref={topRef} data-theme={theme} className="min-h-screen bg-[#070b16] text-white flex flex-col">
      {/* Header */}
      <header className="fb-header bg-[#0c1122] border-b border-[#1a2540] px-3 py-2 flex items-center gap-2 sticky top-0 z-30">
        <Shield className="h-5 w-5 text-cyan-400 shrink-0" />
        <span className="font-bold text-sm text-white flex-1 truncate">
          FB UID Manager Pro <span className="text-cyan-400">v2</span>
        </span>
        {total > 0 && (
          <span className="text-[10px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded-full font-bold">
            {checkedPct}%
          </span>
        )}
        <div className="flex items-center gap-0.5">
          <button onClick={() => setShowPasswords((v) => !v)}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors ${showPasswords ? "text-yellow-400" : "text-slate-400 hover:text-white"}`}
            title={showPasswords ? "Hide passwords" : "Show passwords"}>
            {showPasswords ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <button onClick={() => { setShowCopyFmt((v) => !v); setShowSort(false); setShowSearch(false); }}
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Copy format">
            <Copy className="h-4 w-4" />
          </button>
          <button onClick={() => { setShowSearch((v) => !v); setShowSort(false); setShowCopyFmt(false); }}
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Search [/]">
            <Search className="h-4 w-4" />
          </button>
          <button onClick={() => { setShowSort((v) => !v); setShowSearch(false); setShowCopyFmt(false); setShowSettings(false); }}
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Sort">
            <SortAsc className="h-4 w-4" />
          </button>
          <button onClick={() => { setShowSettings((v) => !v); setShowSort(false); setShowSearch(false); setShowCopyFmt(false); }}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors ${showSettings ? "text-cyan-400" : "text-slate-400 hover:text-white"}`} title="Settings">
            <Settings className="h-4 w-4" />
          </button>
          <button onClick={() => {
              const source = selected.size > 0
                ? filteredItems.filter((i) => selected.has(i.id) && i.password)
                : allItems.filter((i) => i.password);
              const pairs = source.map((i) => `${i.uid}|${i.password}`).join("\n");
              setLoginCheckerPrefill(pairs);
              setShowLoginChecker(true);
            }}
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-purple-400 transition-colors" title={selected.size > 0 ? `Login Checker (${selected.size} selected)` : "Login Checker (all)"}>
            <Shield className="h-4 w-4" />
          </button>
          <button onClick={logout} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Logout">
            <LogOut className="h-4 w-4" />
          </button>
          <button onClick={() => setShowImport(true)}
            className="ml-1 flex items-center gap-1 bg-cyan-500 hover:bg-cyan-400 text-[#070b16] text-xs font-bold px-2.5 py-1.5 rounded transition-colors">
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>
      </header>

      {/* Copy format panel */}
      {showCopyFmt && (
        <div className="bg-[#0c1122] border-b border-[#1a2540] px-3 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-slate-500 uppercase mr-1">Copy as:</span>
          {([
            { key: "both",  label: "UID|Pass" },
            { key: "uid",   label: "UID only" },
            { key: "pass",  label: "Pass only" },
            { key: "named", label: "UID|Pass|Name|IG" },
            { key: "token", label: "UID|Pass|Token" },
          ] as { key: CopyFormat; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => { setCopyFormat(key); setShowCopyFmt(false); }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors
                ${copyFormat === key ? "bg-cyan-500 border-cyan-500 text-[#070b16] font-bold" : "border-[#1a2540] text-slate-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Search bar */}
      {showSearch && (
        <div className="bg-[#0c1122] border-b border-[#1a2540] px-3 py-2 flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search UIDs or notes..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none" />
          {searchQuery && <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>}
        </div>
      )}

      {/* Sort panel */}
      {showSort && (
        <div className="fb-panel bg-[#0c1122] border-b border-[#1a2540] px-3 py-2 flex flex-wrap gap-1.5">
          {([
            { key: "newest",    label: "🆕 Newest" },
            { key: "oldest",    label: "📅 Oldest" },
            { key: "alpha",     label: "🔤 A→Z" },
            { key: "name",      label: "👤 By Name" },
            { key: "followers", label: "👥 Most Followers" },
            { key: "recent",    label: "🕐 Last visited" },
            { key: "checked",   label: "✅ Checked first" },
            { key: "unchecked", label: "⏳ Unchecked first" },
            { key: "saved",     label: "💾 Saved first" },
          ] as { key: SortMode; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => { setSortMode(key); setShowSort(false); }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors
                ${sortMode === key ? "bg-cyan-500 border-cyan-500 text-[#070b16] font-bold" : "border-[#1a2540] text-slate-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="fb-panel bg-[#0c1122] border-b border-[#1a2540] px-3 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <Type className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider w-20">Font Size</span>
            <div className="flex gap-1.5">
              {(["sm", "base", "lg"] as const).map((s) => (
                <button key={s} onClick={() => { setFontSize(s); try { localStorage.setItem("fb_font_size", s); } catch {} }}
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors
                    ${fontSize === s ? "bg-cyan-500 border-cyan-500 text-[#070b16] font-bold" : "border-[#1a2540] text-slate-400 hover:text-white"}`}>
                  {s === "sm" ? "S" : s === "base" ? "M" : "L"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <List className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider w-20">View</span>
            <div className="flex gap-1.5">
              <button onClick={() => { setViewMode("list"); try { localStorage.setItem("fb_view_mode", "list"); } catch {} }}
                className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full border transition-colors
                  ${viewMode === "list" ? "bg-cyan-500 border-cyan-500 text-[#070b16] font-bold" : "border-[#1a2540] text-slate-400 hover:text-white"}`}>
                <List className="h-3 w-3" /> Full
              </button>
              <button onClick={() => { setViewMode("compact"); try { localStorage.setItem("fb_view_mode", "compact"); } catch {} }}
                className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full border transition-colors
                  ${viewMode === "compact" ? "bg-cyan-500 border-cyan-500 text-[#070b16] font-bold" : "border-[#1a2540] text-slate-400 hover:text-white"}`}>
                <Grid3x3 className="h-3 w-3" /> Compact
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {theme === "dark" ? <Moon className="h-3.5 w-3.5 text-slate-500 shrink-0" /> : <Sun className="h-3.5 w-3.5 text-yellow-400 shrink-0" />}
            <span className="text-[10px] text-slate-500 uppercase tracking-wider w-20">Theme</span>
            <div className="flex gap-1.5">
              {(["dark", "light"] as const).map((t) => (
                <button key={t} onClick={() => { setTheme(t); try { localStorage.setItem("fb_theme", t); } catch {} }}
                  className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full border transition-colors
                    ${theme === t ? "bg-cyan-500 border-cyan-500 text-[#070b16] font-bold" : "border-[#1a2540] text-slate-400 hover:text-white"}`}>
                  {t === "dark" ? <><Moon className="h-2.5 w-2.5" /> Dark</> : <><Sun className="h-2.5 w-2.5" /> Light</>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="fb-bulk-bar bg-[#0d1a2e] border-b border-cyan-500/30 px-3 py-2 sticky top-[45px] z-20">
          <div className="flex items-center gap-2">
            <span className="text-xs text-cyan-400 font-bold">{selected.size} selected</span>
            <div className="flex-1 flex flex-wrap gap-1.5">
              <button onClick={bulkCopy} className="text-[10px] bg-cyan-700/40 hover:bg-cyan-600/50 text-cyan-300 px-2 py-1 rounded flex items-center gap-1">
                <Copy className="h-2.5 w-2.5" /> Copy
              </button>
              <button onClick={() => bulkCheck(true)} className="text-[10px] bg-emerald-700/40 hover:bg-emerald-600/50 text-emerald-300 px-2 py-1 rounded">✅ Check</button>
              <button onClick={() => bulkCheck(false)} className="text-[10px] bg-slate-700/40 hover:bg-slate-600/50 text-slate-300 px-2 py-1 rounded">⬜ Uncheck</button>
              <button onClick={() => bulkSave(true)} className="text-[10px] bg-green-700/40 hover:bg-green-600/50 text-green-300 px-2 py-1 rounded">💾 Save</button>
              <button
                onClick={() => setShowBatchTagPicker((v) => !v)}
                className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-colors
                  ${showBatchTagPicker ? "bg-orange-600/60 text-orange-100" : "bg-orange-700/40 hover:bg-orange-600/50 text-orange-300"}`}>
                <Tag className="h-2.5 w-2.5" /> Tag
              </button>
              <button onClick={bulkDelete} className="text-[10px] bg-red-700/40 hover:bg-red-600/50 text-red-300 px-2 py-1 rounded flex items-center gap-1">
                <Trash2 className="h-2.5 w-2.5" /> Delete
              </button>
            </div>
            <button onClick={() => { setSelected(new Set()); setShowBatchTagPicker(false); }} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          {showBatchTagPicker && (
            <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-[#1a2540]">
              {[...TAG_OPTIONS, { label: "Dead", color: "bg-red-700 text-white" }].map(({ label, color }) => (
                <button key={label} onClick={() => {
                  selectedItems.forEach((i) => updateMutation.mutate({ id: i.id, data: { tag: label } }));
                  setShowBatchTagPicker(false); setSelected(new Set());
                }} className={`text-[10px] font-bold px-3 py-1 rounded-full ${color}`}>
                  {label}
                </button>
              ))}
              <button onClick={() => {
                selectedItems.forEach((i) => updateMutation.mutate({ id: i.id, data: { tag: null } }));
                setShowBatchTagPicker(false); setSelected(new Set());
              }} className="text-[10px] bg-slate-700/60 text-slate-300 px-3 py-1 rounded-full">
                Clear Tag
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-2 py-3 gap-3">

        {/* Stats */}
        <div className="bg-[#0c1122] rounded-xl border border-[#1a2540] p-3">
          <div className="grid grid-cols-4 gap-1 mb-3">
            {[
              { label: "Total", val: total, color: "text-white" },
              { label: "Checked", val: checked, color: "text-purple-400" },
              { label: "Left", val: left, color: "text-red-400" },
              { label: "Saved", val: saved, color: "text-green-400" },
            ].map(({ label, val, color }) => (
              <div key={label} className="text-center">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
                <div className={`text-2xl font-bold ${color}`}>{val}</div>
              </div>
            ))}
          </div>
          <div className="h-1.5 bg-[#1a2540] rounded-full overflow-hidden mb-2">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${checkedPct}%`, background: "linear-gradient(90deg,#6366f1,#06b6d4,#22c55e)" }} />
          </div>
          {/* Quick stat pills */}
          <div className="flex gap-1.5 flex-wrap">
            {profileData.size > 0 && (
              <span className="text-[9px] bg-purple-900/30 border border-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">
                👤 {profileData.size} profiles
              </span>
            )}
            {igCount > 0 && (
              <button onClick={() => { setFilterMode("hasig"); setTagFilter(null); }}
                className="text-[9px] bg-pink-900/30 border border-pink-500/20 text-pink-300 px-2 py-0.5 rounded-full hover:bg-pink-900/50 transition-colors">
                📷 {igCount} with IG
              </button>
            )}
            {deadCount > 0 && (
              <button onClick={() => { setFilterMode("dead"); setTagFilter(null); }}
                className="text-[9px] bg-red-900/30 border border-red-500/20 text-red-300 px-2 py-0.5 rounded-full hover:bg-red-900/50 transition-colors">
                💀 {deadCount} dead
              </button>
            )}
            {tagFilter !== null && (
              <span className="text-[9px] bg-amber-900/30 border border-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                🏷️ Filter: {tagFilter}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-5 gap-1.5">
          {[
            { label: "SEARCH", icon: <Search className="h-3.5 w-3.5" />, action: () => { setShowSearch((v) => !v); setShowSort(false); } },
            { label: "SAVE ALL", icon: <Download className="h-3.5 w-3.5" />, action: handleSaveAll },
            { label: "COPY ALL", icon: <Copy className="h-3.5 w-3.5" />, action: handleCopyAll },
            { label: "SORT", icon: <SortAsc className="h-3.5 w-3.5" />, action: () => { setShowSort((v) => !v); setShowSearch(false); } },
          ].map(({ label, icon, action }) => (
            <button key={label} onClick={action}
              className="flex flex-col items-center gap-1 bg-[#0c1122] border border-[#1a2540] rounded-lg py-2 px-1 text-[10px] font-bold text-slate-400 hover:text-white hover:border-cyan-500/40 transition-colors">
              {icon}{label}
            </button>
          ))}
          <button
            onClick={() => handleRefetchAll(filteredItems.slice(0, visibleCount))}
            title="Re-fetch all visible profiles"
            className="flex flex-col items-center gap-1 bg-[#0c1122] border border-[#1a2540] rounded-lg py-2 px-1 text-[10px] font-bold text-purple-400 hover:text-purple-200 hover:border-purple-500/40 transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />REFETCH
          </button>
        </div>
        {/* Validate button — full-width below the 5-column grid */}
        <button
          onClick={() => setShowValidator(true)}
          className="w-full flex items-center justify-center gap-2 bg-green-900/20 border border-green-500/30 hover:border-green-400/50 text-green-400 hover:text-green-200 rounded-xl py-2.5 text-[11px] font-bold transition-colors">
          <Zap className="h-3.5 w-3.5" /> BULK VALIDATE — LIVE / DEAD CHECK
        </button>

        {/* Analytics toggle */}
        <button
          ref={analyticsRef as React.RefObject<HTMLButtonElement>}
          onClick={() => {
            const next = !showCharts;
            setShowCharts(next);
            try { localStorage.setItem("fb_show_charts", String(next)); } catch {}
          }}
          className="flex items-center justify-between w-full bg-[#0c1122] border border-[#1a2540] rounded-xl px-3 py-2.5 text-xs text-slate-400 hover:text-white hover:border-cyan-500/40 transition-colors"
        >
          <span className="flex items-center gap-1.5"><BarChart2 className="h-3.5 w-3.5" /> Analytics</span>
          {showCharts ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {/* Charts panel */}
        {showCharts && (() => {
          const tagColors = ["#f59e0b", "#ef4444", "#3b82f6", "#22c55e", "#64748b", "#8b5cf6", "#06b6d4", "#f97316"];
          const FIXED_TAG_BUCKETS = ["VIP", "Hot", "New", "Done", "Skip", "Untagged"];
          const tagMap = new Map(tagStats.map((t) => [t.tag, t.count]));
          const normalizedTags = FIXED_TAG_BUCKETS.map((t) => ({ tag: t, count: tagMap.get(t) ?? 0 }));
          const hasAnyTag = normalizedTags.some((t) => t.count > 0);
          const sortedTags = hasAnyTag ? normalizedTags.sort((a, b) => b.count - a.count) : [];
          const chartDays = chartPeriod === "30d" ? extendedDays : (dailyData?.days ?? []);
          const barSize = chartPeriod === "30d" ? 6 : 16;
          return (
            <div className="bg-[#0c1122] rounded-xl border border-[#1a2540] p-3 space-y-4">

              {/* Stat row: profiles fetched */}
              {profileData.size > 0 && (
                <div className="flex items-center gap-2 bg-purple-900/20 border border-purple-500/20 rounded-lg px-3 py-2">
                  <User className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  <span className="text-[11px] text-purple-300 font-semibold">{profileData.size} profile{profileData.size !== 1 ? "s" : ""} with info fetched this session</span>
                </div>
              )}

              {/* Pie: Status Breakdown */}
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Status Breakdown</div>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Checked", value: checked || 0 },
                        { name: "Unchecked", value: left || 0 },
                        { name: "Saved", value: saved || 0 },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={68}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      <Cell fill="#a855f7" />
                      <Cell fill="#ef4444" />
                      <Cell fill="#22c55e" />
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#0c1122", border: "1px solid #1a2540", borderRadius: 8, fontSize: 11 }}
                      itemStyle={{ color: "#e2e8f0" }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      formatter={(v) => <span style={{ fontSize: 10, color: "#94a3b8" }}>{v}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Pie: Tag Distribution */}
              {sortedTags.length > 0 && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Tag Distribution</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={sortedTags}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={68}
                        paddingAngle={3}
                        dataKey="count"
                        nameKey="tag"
                      >
                        {sortedTags.map((_, i) => (
                          <Cell key={i} fill={tagColors[i % tagColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#0c1122", border: "1px solid #1a2540", borderRadius: 8, fontSize: 11 }}
                        itemStyle={{ color: "#e2e8f0" }}
                        formatter={(v, n) => [`${v} IDs`, n]}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={(v) => <span style={{ fontSize: 10, color: "#94a3b8" }}>{v}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Bar: Activity chart with period toggle */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                    Check Activity
                  </div>
                  <div className="flex gap-1">
                    {(["7d", "30d"] as const).map((p) => (
                      <button key={p} onClick={() => setChartPeriod(p)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors
                          ${chartPeriod === p ? "bg-cyan-500 border-cyan-500 text-[#070b16] font-bold" : "border-[#1a2540] text-slate-400 hover:text-white"}`}>
                        {p === "7d" ? "7 Days" : "30 Days"}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartDays} barSize={barSize}>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => {
                        const dt = new Date(d + "T00:00:00");
                        return `${dt.getMonth() + 1}/${dt.getDate()}`;
                      }}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                      interval={chartPeriod === "30d" ? 4 : 0}
                    />
                    <Tooltip
                      contentStyle={{ background: "#0c1122", border: "1px solid #1a2540", borderRadius: 8, fontSize: 11 }}
                      itemStyle={{ color: "#e2e8f0" }}
                      labelFormatter={(d: string) => {
                        const dt = new Date(d + "T00:00:00");
                        return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                      }}
                    />
                    <Bar dataKey="count" name="Checks" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })()}

        {/* Export rows */}
        <div className="bg-[#0c1122] rounded-xl border border-[#1a2540] overflow-hidden divide-y divide-[#1a2540]">
          {[
            { label: "✅ Checked", type: "checked" as const },
            { label: "⏳ Unchecked", type: "unchecked" as const },
            { label: "💾 Saved", type: "saved" as const },
          ].map(({ label, type }) => {
            const items = getBulk(type);
            const text = items.map((i) => formatText(i.uid, i.password, (i as { accessToken?: string | null }).accessToken)).join("\n");
            return (
              <div key={type} className="flex items-center px-3 py-2.5 gap-2">
                <span className="text-xs text-slate-300 flex-1 font-medium">{label}
                  <span className="ml-1.5 text-[10px] text-slate-600">({items.length})</span>
                </span>
                <div className="flex gap-1.5">
                  <button onClick={() => copy(text, `Copied ${items.length}`)}
                    className="text-[10px] bg-[#1a2540] hover:bg-[#243050] text-slate-300 hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-1">
                    <Copy className="h-2.5 w-2.5" /> Copy
                  </button>
                  <button onClick={() => downloadFile(text, `${type}.txt`)}
                    className="text-[10px] bg-[#1a2540] hover:bg-[#243050] text-slate-300 hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-1">
                    <Download className="h-2.5 w-2.5" /> .txt
                  </button>
                  <button onClick={() => downloadCsv(items, `${type}.csv`)}
                    className="text-[10px] bg-[#1a2540] hover:bg-[#243050] text-slate-300 hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-1">
                    <Download className="h-2.5 w-2.5" /> .csv
                  </button>
                  <button onClick={() => downloadJson(items, `${type}.json`)}
                    className="text-[10px] bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-300 hover:text-emerald-100 px-2 py-1 rounded transition-colors flex items-center gap-1">
                    <Download className="h-2.5 w-2.5" /> .json
                  </button>
                </div>
              </div>
            );
          })}
          {/* Export All JSON */}
          <div className="flex items-center px-3 py-2.5 gap-2">
            <span className="text-xs text-slate-300 flex-1 font-medium">🌐 All IDs + Profiles
              <span className="ml-1.5 text-[10px] text-slate-600">({allItems.length})</span>
            </span>
            <div className="flex gap-1.5">
              <button onClick={() => downloadJson(allItems, "all-facebook-ids.json")}
                className="text-[10px] bg-cyan-900/40 hover:bg-cyan-800/50 text-cyan-300 hover:text-cyan-100 px-2 py-1 rounded transition-colors flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" /> Full JSON
              </button>
              {(() => { const igs = allItems.filter(i => profileData.get(i.uid)?.instagramUsername).map(i => profileData.get(i.uid)!.instagramUsername); return igs.length > 0 ? (
                <button onClick={() => { copy(igs.join("\n"), `${igs.length} IG usernames copied!`); }}
                  className="text-[10px] bg-pink-900/40 hover:bg-pink-800/50 text-pink-300 hover:text-pink-100 px-2 py-1 rounded transition-colors flex items-center gap-1">
                  <Copy className="h-2.5 w-2.5" /> All IGs ({igs.length})
                </button>
              ) : null; })()}
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {filterTabs.map(({ key, label, count }) => (
            <button key={key} onClick={() => { setFilterMode(key); setTagFilter(null); }}
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap flex items-center gap-1
                ${filterMode === key && tagFilter === null ? "bg-cyan-500 border-cyan-500 text-[#070b16] font-bold" : "border-[#1a2540] text-slate-400 hover:text-white hover:border-slate-500"}`}>
              {label}
              <span className={`text-[10px] font-bold px-1 rounded-full min-w-[16px] text-center
                ${filterMode === key && tagFilter === null ? "bg-[#070b16]/30 text-[#070b16]" : "bg-[#1a2540] text-slate-300"}`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Tag quick-filter chips */}
        {(() => {
          const allTagCounts = [...TAG_OPTIONS, { label: "Dead", color: "bg-red-700 text-white" }]
            .map(({ label, color }) => ({ label, color, cnt: allItems.filter((i) => i.tag === label).length }))
            .filter(({ cnt }) => cnt > 0);
          if (allTagCounts.length === 0) return null;
          return (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <span className="shrink-0 text-[9px] text-slate-600 uppercase tracking-wider self-center pr-1">Tags:</span>
              {tagFilter !== null && (
                <button onClick={() => setTagFilter(null)}
                  className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border border-slate-500/40 text-slate-400 hover:text-white whitespace-nowrap">
                  ✕ All
                </button>
              )}
              {allTagCounts.map(({ label, color, cnt }) => (
                <button key={label} onClick={() => { setTagFilter(tagFilter === label ? null : label); setFilterMode("all"); }}
                  className={`shrink-0 text-[10px] px-2.5 py-0.5 rounded-full border transition-all whitespace-nowrap flex items-center gap-1 font-bold
                    ${tagFilter === label
                      ? `${color} border-transparent ring-2 ring-white/30`
                      : "border-[#1a2540] text-slate-400 hover:text-white"}`}>
                  {label}
                  <span className="text-[9px] opacity-80">{cnt}</span>
                </button>
              ))}
            </div>
          );
        })()}

        {/* Retry all failed banner */}
        {failedUids.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-orange-900/20 border border-orange-700/30 rounded-xl">
            <WifiOff className="h-3.5 w-3.5 text-orange-400 shrink-0" />
            <span className="text-[11px] text-orange-300 flex-1">{failedUids.size} profiles failed to load</span>
            <button onClick={retryAllFailed} disabled={retryingAll}
              className="text-[10px] bg-orange-700/50 hover:bg-orange-600/60 text-orange-100 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-60">
              {retryingAll ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RotateCcw className="h-2.5 w-2.5" />}
              Retry All
            </button>
          </div>
        )}

        {/* Copy all IGs banner (when IG filter active) */}
        {filterMode === "hasig" && (() => {
          const igs = filteredItems.map(i => profileData.get(i.uid)?.instagramUsername).filter(Boolean) as string[];
          return igs.length > 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-pink-900/20 border border-pink-700/30 rounded-xl">
              <svg className="h-3.5 w-3.5 text-pink-400 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              <span className="text-[11px] text-pink-300 flex-1">{igs.length} Instagram usernames</span>
              <button onClick={() => copy(igs.join("\n"), `${igs.length} IG usernames copied!`)}
                className="text-[10px] bg-pink-700/50 hover:bg-pink-600/60 text-pink-100 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors">
                <Copy className="h-2.5 w-2.5" /> Copy All IGs
              </button>
            </div>
          ) : null;
        })()}

        {/* Entry count row */}
        <div className="flex items-center gap-2 px-0.5">
          <label className="flex items-center gap-1.5 text-xs text-slate-500 select-none cursor-pointer">
            <input type="checkbox" checked={filteredItems.length > 0 && selected.size === filteredItems.length}
              onChange={toggleSelectAll} className="accent-cyan-500 h-3.5 w-3.5" />
            All
          </label>
          <span className="text-xs text-slate-600 flex-1">{filteredItems.length} entries
            {fetchingUids.size > 0 && <span className="ml-1.5 text-cyan-600/60 text-[10px]">({fetchingUids.size} loading…)</span>}
          </span>
          {selected.size > 0 && <span className="text-xs text-cyan-400 font-bold">{selected.size} selected</span>}
          <button onClick={() => topRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="text-[10px] text-slate-500 hover:text-white flex items-center gap-1 transition-colors">
            <ArrowUpToLine className="h-3 w-3" /> Top
          </button>
          {allItems.length > 0 && (
            <button onClick={() => { if (confirm("Delete ALL data?")) clearAllMutation.mutate(); }}
              className="text-[10px] text-red-500 hover:text-red-300 flex items-center gap-1 transition-colors">
              <Trash2 className="h-3 w-3" /> Wipe
            </button>
          )}
        </div>

        {/* ID List */}
        <div className="flex flex-col gap-2 pb-32">
          {idsLoading ? (
            <div className="flex flex-col items-center py-12 text-slate-600 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />Loading...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-600 gap-3">
              {searchQuery || filterMode !== "all" || tagFilter ? (
                <>
                  <Search className="h-10 w-10 opacity-20" />
                  <p className="text-sm text-slate-500">No results found.</p>
                  <button onClick={() => { setFilterMode("all"); setTagFilter(null); setSearchQuery(""); setShowSearch(false); }}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-4 py-1.5 rounded-full transition-colors">
                    Clear all filters
                  </button>
                </>
              ) : (
                <>
                  <Sparkles className="h-12 w-12 opacity-15 text-cyan-400" />
                  <p className="text-base font-semibold text-slate-400">No IDs yet</p>
                  <p className="text-xs text-slate-600 text-center max-w-[200px]">Import Facebook IDs to get started. Auto-fetch profiles on import.</p>
                  <button onClick={() => setShowImport(true)}
                    className="mt-1 flex items-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-[#070b16] text-xs font-bold px-4 py-2 rounded-xl transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Import IDs
                  </button>
                </>
              )}
            </div>
          ) : viewMode === "compact" ? (
            /* Compact mode: 2-column dense grid */
            <div className="grid grid-cols-2 gap-1.5">
              {filteredItems.slice(0, visibleCount).map((item, idx) => (
                <div key={item.id}
                  className={`rounded-lg border p-2 transition-all duration-150 relative overflow-hidden
                    ${item.pinned ? "fb-card-pinned border-green-500/30 bg-[#0b1a10]" : "fb-card border-[#1a2540] bg-[#0c1122]"}
                    ${selected.has(item.id) ? "ring-1 ring-cyan-500/50" : ""}`}
                  onPointerDown={(e) => {
                    if ((e.target as Element).closest("button,a,input")) return;
                    touchStartX.current = e.clientX;
                    touchStartY.current = e.clientY;
                    longPressFired.current = false;
                    if (longPressTimer.current) clearTimeout(longPressTimer.current);
                    longPressTimer.current = setTimeout(() => {
                      longPressFired.current = true;
                      toggleSelect(item.id);
                      try { navigator.vibrate?.(40); } catch {}
                    }, 500);
                  }}
                  onPointerMove={(e) => {
                    const dx = Math.abs(e.clientX - touchStartX.current);
                    const dy = Math.abs(e.clientY - (touchStartY.current ?? e.clientY));
                    if (dx > 8 || dy > 8) { if (longPressTimer.current) clearTimeout(longPressTimer.current); }
                  }}
                  onPointerUp={(e) => {
                    if (longPressTimer.current) clearTimeout(longPressTimer.current);
                    if (!longPressFired.current) {
                      const dx = touchStartX.current - e.clientX;
                      if (dx > 60) setSwipedId(swipedId === item.id ? null : item.id);
                      else if (dx < -30) setSwipedId(null);
                    }
                  }}
                  onPointerLeave={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}>
                  {swipedId === item.id && (
                    <div className="absolute inset-0 bg-slate-900/95 flex items-center justify-evenly z-10">
                      <button onClick={() => { updateMutation.mutate({ id: item.id, data: { pinned: !item.pinned } }); setSwipedId(null); }}
                        className="flex flex-col items-center gap-0.5 text-green-300 active:scale-90">
                        <BookmarkCheck className="h-4 w-4" />
                        <span className="text-[9px] font-bold">{item.pinned ? "Unsave" : "Save"}</span>
                      </button>
                      <button onClick={() => { updateMutation.mutate({ id: item.id, data: { visited: !item.visited } }); setSwipedId(null); }}
                        className="flex flex-col items-center gap-0.5 text-cyan-300 active:scale-90">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-[9px] font-bold">{item.visited ? "Uncheck" : "Check"}</span>
                      </button>
                      <button onClick={() => { deleteWithUndo(item); setSwipedId(null); }}
                        className="flex flex-col items-center gap-0.5 text-red-300 active:scale-90">
                        <Trash2 className="h-4 w-4" />
                        <span className="text-[9px] font-bold">Delete</span>
                      </button>
                      <button onClick={() => setSwipedId(null)} className="absolute top-1 right-1 text-slate-400">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-1 mb-1">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)}
                      className="accent-cyan-500 h-3 w-3 shrink-0" />
                    <span className="text-[9px] text-slate-600">{idx + 1}</span>
                    {item.tag && <span className={`text-[8px] font-bold px-1 rounded ${tagColor(item.tag)}`}>{item.tag}</span>}
                    {item.pinned && <span className="text-[9px] text-green-400">💾</span>}
                    {(() => {
                      const ls = (item as { loginStatus?: string | null }).loginStatus as LoginStatus | null | undefined;
                      if (!ls || !LOGIN_STATUS_CONFIG[ls]) return null;
                      const cfg = LOGIN_STATUS_CONFIG[ls];
                      return <div className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass} shrink-0`} title={cfg.label} />;
                    })()}
                  </div>
                  <button
                    onClick={() => copy(formatText(item.uid, item.password, (item as { accessToken?: string | null }).accessToken), "Copied!")}
                    className={`font-mono block truncate text-left w-full transition-colors active:opacity-60 ${fontClass(fontSize)}
                      ${item.visited ? "line-through text-slate-500" : "text-slate-200"}`}>
                    {highlightText(item.uid, searchQuery)}
                  </button>
                  {item.password && (
                    <div className="flex items-center gap-0.5 mt-0.5">
                      <Key className="h-2 w-2 text-yellow-400 shrink-0" />
                      <span className="text-[10px] font-mono text-yellow-400/70 truncate">{item.password}</span>
                    </div>
                  )}
                  <div className="flex gap-1 mt-1.5 flex-wrap items-center">
                    <a href={`https://facebook.com/${item.uid}`} target="_blank" rel="noreferrer"
                      onClick={() => { incrementVisit(item.uid); if (!item.visited) updateMutation.mutate({ id: item.id, data: { visited: true } }); }}
                      className="text-[9px] bg-blue-900/40 text-blue-400 hover:text-blue-200 px-1.5 py-0.5 rounded">🔗</a>
                    {(visitCounts.get(item.uid) ?? 0) > 0 && (
                      <span className="text-[8px] bg-violet-600/40 text-violet-300 px-1 py-0.5 rounded font-bold leading-none">
                        {visitCounts.get(item.uid)}×
                      </span>
                    )}
                    <button onClick={() => updateMutation.mutate({ id: item.id, data: { visited: !item.visited } })}
                      className={`text-[9px] px-1.5 py-0.5 rounded ${item.visited ? "bg-emerald-700/50 text-emerald-300" : "bg-slate-700/40 text-slate-400"}`}>
                      {item.visited ? "✅" : "○"}
                    </button>
                    <button onClick={() => updateMutation.mutate({ id: item.id, data: { pinned: !item.pinned } })}
                      className={`text-[9px] px-1.5 py-0.5 rounded ${item.pinned ? "bg-green-700/50 text-green-300" : "bg-slate-700/40 text-slate-400"}`}>
                      💾
                    </button>
                    <button onClick={() => deleteWithUndo(item)}
                      className="text-[9px] bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded">✕</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Full list mode */
            filteredItems.slice(0, visibleCount).map((item, idx) => {
              const profile = profileData.get(item.uid);
              const visitCount = visitCounts.get(item.uid) ?? 0;
              const startLongPress = (id: number) => {
                longPressFired.current = false;
                if (longPressTimer.current) clearTimeout(longPressTimer.current);
                longPressTimer.current = setTimeout(() => {
                  longPressFired.current = true;
                  if (navigator.vibrate) navigator.vibrate(40);
                  toggleSelect(id);
                }, 500);
              };
              const cancelLongPress = () => {
                if (longPressTimer.current) clearTimeout(longPressTimer.current);
              };
              return (
                <div key={item.id}
                  className={`rounded-xl border transition-all duration-150 overflow-hidden relative
                    ${item.pinned ? "fb-card-pinned border-green-500/30 bg-[#0b1a10]" : "fb-card border-[#1a2540] bg-[#0c1122]"}
                    ${selected.has(item.id) ? "ring-1 ring-cyan-500/50" : ""}`}
                  onPointerDown={(e) => {
                    if ((e.target as Element).closest("button,a,input,textarea")) return;
                    touchStartX.current = e.clientX;
                    touchStartY.current = e.clientY;
                    startLongPress(item.id);
                  }}
                  onPointerMove={(e) => {
                    const dx = Math.abs(e.clientX - touchStartX.current);
                    const dy = Math.abs(e.clientY - touchStartY.current);
                    if (dx > 8 || dy > 8) cancelLongPress();
                  }}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                  onTouchEnd={(e) => {
                    cancelLongPress();
                    if (longPressFired.current) return;
                    const dx = touchStartX.current - e.changedTouches[0].clientX;
                    if (dx > 70) setSwipedId(swipedId === item.id ? null : item.id);
                    else if (dx < -30) setSwipedId(null);
                  }}>

                  {/* Swipe overlay — expanded actions */}
                  {swipedId === item.id && (() => {
                    const igUser = profile?.instagramUsername;
                    return (
                      <div className="absolute inset-0 bg-slate-900/97 flex items-center justify-center z-10 gap-4 px-2">
                        <button onClick={() => { updateMutation.mutate({ id: item.id, data: { pinned: !item.pinned } }); setSwipedId(null); }}
                          className={`flex flex-col items-center gap-1.5 active:scale-95 transition-transform ${item.pinned ? "text-green-300" : "text-green-400"}`}>
                          <Save className="h-6 w-6" />
                          <span className="text-[10px] font-bold">{item.pinned ? "Unsave" : "Save"}</span>
                        </button>
                        <button onClick={() => { updateMutation.mutate({ id: item.id, data: { visited: !item.visited } }); setSwipedId(null); }}
                          className={`flex flex-col items-center gap-1.5 active:scale-95 transition-transform ${item.visited ? "text-cyan-300" : "text-cyan-400"}`}>
                          {item.visited ? <CheckSquare className="h-6 w-6" /> : <Square className="h-6 w-6" />}
                          <span className="text-[10px] font-bold">{item.visited ? "Uncheck" : "Check"}</span>
                        </button>
                        <button onClick={() => copy(formatText(item.uid, item.password, (item as { accessToken?: string | null }).accessToken), "Copied!")} className="flex flex-col items-center gap-1.5 text-sky-400 active:scale-95 transition-transform">
                          <Copy className="h-6 w-6" />
                          <span className="text-[10px] font-bold">Copy</span>
                        </button>
                        {igUser && (
                          <a href={`https://instagram.com/${igUser}`} target="_blank" rel="noreferrer"
                            onClick={() => setSwipedId(null)}
                            className="flex flex-col items-center gap-1.5 text-pink-400 active:scale-95 transition-transform">
                            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                            </svg>
                            <span className="text-[10px] font-bold">Instagram</span>
                          </a>
                        )}
                        <button onClick={() => deleteWithUndo(item)}
                          className="flex flex-col items-center gap-1.5 text-red-400 active:scale-95 transition-transform">
                          <Trash2 className="h-6 w-6" />
                          <span className="text-[10px] font-bold">Delete</span>
                        </button>
                        <button onClick={() => setSwipedId(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Tag bar */}
                  {item.tag && (
                    <div className={`px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tagColor(item.tag)}`}>
                      🏷️ {item.tag}
                    </div>
                  )}

                  {/* Profile loading skeleton */}
                  {fetchingUids.has(item.uid) && !profile && (
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/20 animate-pulse bg-slate-900/30">
                      <div className="w-8 h-8 rounded-full bg-slate-700/50 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2.5 bg-slate-700/50 rounded-full w-28" />
                        <div className="h-2 bg-slate-700/30 rounded-full w-20" />
                      </div>
                      <Loader2 className="h-3 w-3 text-cyan-600/50 animate-spin shrink-0" />
                    </div>
                  )}

                  {/* Profile info bar (AnimatePresence) */}
                  <AnimatePresence>
                    {profile && (
                      <motion.div
                        key="profile-bar"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden">
                        <div className="px-3 py-2 bg-gradient-to-r from-blue-900/20 to-indigo-900/10 border-b border-blue-500/20 text-[11px]">
                          <div className="flex items-center gap-2">
                            {/* Avatar with completeness ring */}
                            <div className="relative shrink-0">
                              <ProfileAvatar profile={profile} uid={item.uid} size={34} />
                              {/* Completeness dots */}
                              <div className="absolute -bottom-0.5 -right-0.5 flex gap-0.5">
                                {[!!profile.name, !!profile.followerCount, !!profile.instagramUsername].map((has, i) => (
                                  <div key={i} className={`w-1.5 h-1.5 rounded-full border border-[#070b16] ${has ? "bg-emerald-400" : "bg-slate-700"}`} />
                                ))}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              {/* Row 1: name + username */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {profile.name && (
                                  <button onClick={() => copy(profile.name!, "Name copied!")}
                                    className="text-blue-200 font-semibold truncate max-w-[150px] hover:text-white transition-colors text-left">
                                    {profile.name}
                                  </button>
                                )}
                                {profile.username && profile.username !== "profile.php" && (
                                  <span className="text-cyan-400/70 text-[10px]">@{profile.username}</span>
                                )}
                                {profile.followerCount && (
                                  <span className="text-emerald-400/80 flex items-center gap-0.5 text-[10px]">
                                    <User className="h-2 w-2" />{profile.followerCount}
                                  </span>
                                )}
                                {(() => { const t = followerTier(profile.followerCount ?? null); return t ? (
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none ${t.cls}`}>
                                    {t.icon} {t.label}
                                  </span>
                                ) : null; })()}
                                {profile.nationality && (
                                  <span className="text-orange-300/60 text-[10px]">📍 {profile.nationality}</span>
                                )}
                              </div>
                              {/* Row 2: IG + open buttons */}
                              {profile.instagramUsername && (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <a href={`https://instagram.com/${profile.instagramUsername}`} target="_blank" rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-0.5 text-pink-400 hover:text-pink-300 transition-colors font-medium text-[10px]">
                                    <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                    </svg>
                                    @{profile.instagramUsername}
                                  </a>
                                  <button onClick={() => copy(profile.instagramUsername!, "IG username copied!")}
                                    className="text-[9px] text-pink-600 hover:text-pink-400 transition-colors">
                                    <Copy className="h-2 w-2" />
                                  </button>
                                </div>
                              )}
                            </div>
                            {/* Quick action buttons */}
                            <div className="flex flex-col gap-1 shrink-0">
                              <a href={`https://facebook.com/${item.uid}`} target="_blank" rel="noreferrer"
                                onClick={() => { incrementVisit(item.uid); if (!item.visited) updateMutation.mutate({ id: item.id, data: { visited: true } }); }}
                                className="flex items-center gap-0.5 text-[9px] bg-blue-800/50 hover:bg-blue-700/60 text-blue-300 px-1.5 py-0.5 rounded transition-colors">
                                <ExternalLink className="h-2.5 w-2.5" /> FB
                              </a>
                              {profile.instagramUsername && (
                                <a href={`https://instagram.com/${profile.instagramUsername}`} target="_blank" rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-0.5 text-[9px] bg-pink-900/50 hover:bg-pink-800/60 text-pink-300 px-1.5 py-0.5 rounded transition-colors">
                                  <ExternalLink className="h-2.5 w-2.5" /> IG
                                </a>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); retryProfile(item.uid); }}
                                title="Re-fetch profile"
                                className="flex items-center gap-0.5 text-[9px] bg-slate-800/50 hover:bg-slate-700/60 text-slate-400 hover:text-cyan-300 px-1.5 py-0.5 rounded transition-colors">
                                <RefreshCw className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                    {!profile && failedUids.has(item.uid) && (
                      <motion.div
                        key="retry-bar"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/30 border-b border-slate-700/30 text-[10px]">
                          <span className="text-slate-600 flex-1">Profile unavailable</span>
                          <button
                            onClick={() => retryProfile(item.uid)}
                            className="flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition-colors">
                            <RotateCcw className="h-2.5 w-2.5" /> Retry
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* UID row */}
                  <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)}
                      className="accent-cyan-500 h-3.5 w-3.5 shrink-0" />
                    <span className="text-[10px] text-slate-600 shrink-0 w-4 text-right">{idx + 1}</span>
                    <span className="text-[10px] text-slate-500 shrink-0">UID:</span>
                    <a
                      href={`https://facebook.com/${item.uid}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        incrementVisit(item.uid);
                        if (!item.visited) updateMutation.mutate({ id: item.id, data: { visited: true } });
                      }}
                      className={`font-mono ${fontClass(fontSize)} flex-1 min-w-0 truncate transition-colors flex items-center gap-1
                        ${item.visited ? "line-through text-slate-500" : "text-cyan-300 hover:text-cyan-100"}`}>
                      {highlightText(item.uid, searchQuery)}
                      <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" />
                    </a>
                    {visitCount > 0 && (
                      <span className="shrink-0 text-[9px] bg-violet-600/40 text-violet-300 px-1 py-0.5 rounded font-bold leading-none">
                        {visitCount}×
                      </span>
                    )}
                    <button
                      onClick={() => copy(item.uid, "UID copied!")}
                      title="Copy UID"
                      className="shrink-0 text-[10px] bg-slate-700/50 hover:bg-slate-600/60 text-slate-300 hover:text-white px-2 py-0.5 rounded flex items-center gap-0.5 active:scale-95 transition-all">
                      <Copy className="h-2.5 w-2.5" />UID
                    </button>
                  </div>

                  {/* Login status badge */}
                  {(() => {
                    const ls = (item as { loginStatus?: string | null }).loginStatus as LoginStatus | null | undefined;
                    if (!ls || !LOGIN_STATUS_CONFIG[ls]) return null;
                    const cfg = LOGIN_STATUS_CONFIG[ls];
                    const token = (item as { accessToken?: string | null }).accessToken;
                    return (
                      <div className={`flex items-center gap-1.5 px-3 pb-1 text-[10px]`}>
                        <div className="w-3.5 h-3.5 shrink-0" />
                        <div className="w-4 shrink-0" />
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border ${cfg.bgClass} ${cfg.borderClass} flex-wrap`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass} shrink-0`} />
                          <span className={`font-semibold ${cfg.color}`}>{cfg.label}</span>
                          {token && (
                            <button onClick={() => copy(token, "Token copied!")}
                              className="text-[9px] bg-green-900/40 text-green-400 hover:bg-green-900/60 px-1.5 py-0.5 rounded ml-auto">
                              Copy Token
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Pass row */}
                  <div className="flex items-center gap-2 px-3 pb-1.5">
                    <div className="w-3.5 h-3.5 shrink-0" />
                    <div className="w-4 shrink-0" />
                    <span className="text-[10px] text-slate-500 shrink-0">Pass:</span>
                    {item.password ? (
                      <>
                        <span className={`font-mono ${fontClass(fontSize)} flex-1 min-w-0 truncate text-yellow-400/90 transition-all duration-200 ${showPasswords ? "" : "blur-sm select-none"}`}>
                          {item.password}
                        </span>
                        <button
                          onClick={() => copy(item.password!, "Pass copied!")}
                          title="Copy Password"
                          className="shrink-0 text-[10px] bg-yellow-900/40 hover:bg-yellow-800/50 text-yellow-300 hover:text-yellow-100 px-2 py-0.5 rounded flex items-center gap-0.5 active:scale-95 transition-all">
                          <Key className="h-2.5 w-2.5" />Pass
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] text-slate-600 italic flex-1">—</span>
                    )}
                  </div>

                  {/* Note display (collapsed) */}
                  {item.note && editingNote !== item.id && (
                    <div className="flex items-start gap-1.5 px-3 pb-1">
                      <div className="w-3.5 h-3.5 shrink-0" />
                      <div className="w-4 shrink-0" />
                      <FileText className="h-2.5 w-2.5 text-blue-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-blue-300/80 break-words leading-snug">{item.note}</p>
                    </div>
                  )}

                  {/* Note editor */}
                  {editingNote === item.id && (
                    <div className="px-3 pb-2">
                      <textarea
                        autoFocus
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Add a note..."
                        rows={2}
                        className="fb-note-input w-full bg-[#0a1020] border border-blue-500/40 text-blue-200 placeholder-slate-600 text-xs rounded-lg px-2 py-1.5 outline-none resize-none focus:border-blue-400/60"
                      />
                      <div className="flex gap-1.5 mt-1">
                        <button onClick={() => saveNote(item.id)}
                          className="text-[10px] bg-blue-600/60 hover:bg-blue-500/70 text-blue-100 px-2.5 py-1 rounded">Save</button>
                        <button onClick={() => { setEditingNote(null); }}
                          className="text-[10px] bg-slate-700/40 text-slate-400 hover:text-white px-2.5 py-1 rounded">Cancel</button>
                        {item.note && (
                          <button onClick={() => { setNoteText(""); saveNote(item.id); }}
                            className="text-[10px] text-red-400 hover:text-red-300 px-1 py-1">Clear</button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tag picker */}
                  {showTagPicker === item.id && (
                    <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                      {TAG_OPTIONS.map((t) => (
                        <button key={t.label} onClick={() => setTag(item.id, item.tag === t.label ? null : t.label)}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-all
                            ${item.tag === t.label ? "ring-2 ring-white/60 scale-105" : "opacity-80 hover:opacity-100"} ${t.color}`}>
                          {t.label}
                        </button>
                      ))}
                      {item.tag && (
                        <button onClick={() => setTag(item.id, null)}
                          className="text-[10px] bg-slate-700/50 text-slate-400 hover:text-white px-2.5 py-1 rounded-full">
                          Clear
                        </button>
                      )}
                    </div>
                  )}

                  {/* Action row */}
                  <div className="flex gap-1 px-3 pb-3 pt-1 flex-wrap">
                    <button onClick={() => updateMutation.mutate({ id: item.id, data: { pinned: !item.pinned } })}
                      className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-0.5
                        ${item.pinned ? "bg-green-700/60 hover:bg-green-600/70 text-green-100" : "bg-green-900/30 hover:bg-green-800/40 text-green-400"}`}>
                      💾 {item.pinned ? "Saved" : "Save"}
                    </button>
                    <button onClick={() => updateMutation.mutate({ id: item.id, data: { visited: !item.visited } })}
                      className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-0.5
                        ${item.visited ? "bg-emerald-700/60 hover:bg-emerald-600/70 text-emerald-100" : "bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-emerald-300"}`}>
                      {item.visited ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                      {item.visited ? "Done" : "Check"}
                    </button>
                    <button onClick={() => deleteWithUndo(item)}
                      className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-red-900/30 hover:bg-red-800/50 text-red-400 hover:text-red-200 transition-colors flex items-center justify-center gap-0.5">
                      <Trash2 className="h-3 w-3" />Del
                    </button>
                    <button onClick={() => {
                      if (editingNote === item.id) { setEditingNote(null); }
                      else { setEditingNote(item.id); setNoteText(item.note ?? ""); setShowTagPicker(null); }
                    }}
                      className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-0.5
                        ${item.note ? "bg-blue-700/50 text-blue-200" : "bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-blue-300"}`}>
                      <FileText className="h-3 w-3" />Note
                    </button>
                    <button onClick={() => {
                      setShowTagPicker(showTagPicker === item.id ? null : item.id);
                      setEditingNote(null);
                    }}
                      className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-0.5
                        ${item.tag ? "bg-orange-700/50 text-orange-200" : "bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-orange-300"}`}>
                      <Tag className="h-3 w-3" />Tag
                    </button>
                    {profile?.instagramUsername && (
                      <a href={`https://instagram.com/${profile.instagramUsername}`} target="_blank" rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-pink-900/40 hover:bg-pink-800/60 text-pink-300 hover:text-pink-100 transition-colors flex items-center justify-center gap-0.5">
                        <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                        IG
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {/* Infinite scroll sentinel */}
          <div ref={listBottomRef} className="h-4" />
          {filteredItems.length > visibleCount && (
            <div className="flex flex-col items-center gap-2 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-600" />
              <button
                onClick={() => setVisibleCount((v) => v + 50)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-4 py-1.5 rounded-full transition-colors"
              >
                আরো দেখুন ({filteredItems.length - visibleCount} বাকি)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Magic Bottom Navigation */}
      {(() => {
        const navItems = [
          { key: "home" as const, icon: <Shield className="h-5 w-5" />, label: "Home" },
          { key: "search" as const, icon: <Search className="h-5 w-5" />, label: "Search" },
          { key: "import" as const, icon: <Plus className="h-5 w-5" />, label: "Import" },
          { key: "analytics" as const, icon: <BarChart2 className="h-5 w-5" />, label: "Charts" },
          { key: "settings" as const, icon: <Settings className="h-5 w-5" />, label: "Config" },
        ] as const;
        const activeIdx = navItems.findIndex((n) => n.key === activeNav);
        return (
          <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-2 px-3 pointer-events-none">
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 300, damping: 30 }}
              className="pointer-events-auto bg-[#0c1122]/95 backdrop-blur-md border border-[#1a2540] rounded-2xl px-2 py-1.5 flex items-center gap-0.5 relative shadow-2xl shadow-black/60"
              style={{ maxWidth: 320, width: "100%" }}
            >
              {/* Animated pill indicator */}
              <motion.div
                className="absolute top-1.5 bottom-1.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30"
                animate={{ left: `calc(${activeIdx} * 20% + 8px)`, width: "calc(20% - 4px)" }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
              />
              {navItems.map(({ key, icon, label }) => (
                <button
                  key={key}
                  onClick={() => {
                    setActiveNav(key);
                    if (key === "home") {
                      topRef.current?.scrollIntoView({ behavior: "smooth" });
                    } else if (key === "search") {
                      setShowSearch((v) => !v);
                      setShowSort(false); setShowCopyFmt(false); setShowSettings(false);
                    } else if (key === "import") {
                      setShowImport(true);
                    } else if (key === "analytics") {
                      const next = !showCharts;
                      setShowCharts(next);
                      try { localStorage.setItem("fb_show_charts", String(next)); } catch {}
                      setTimeout(() => analyticsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                    } else if (key === "settings") {
                      setShowSettings((v) => !v);
                      setShowSort(false); setShowSearch(false); setShowCopyFmt(false);
                    }
                  }}
                  className="relative z-10 flex-1 flex flex-col items-center gap-0.5 py-1.5"
                >
                  <motion.span
                    animate={{ color: activeNav === key ? "#06b6d4" : "#64748b" }}
                    transition={{ duration: 0.2 }}
                  >
                    {icon}
                  </motion.span>
                  <motion.span
                    className="text-[9px] font-semibold"
                    animate={{ color: activeNav === key ? "#06b6d4" : "#475569" }}
                    transition={{ duration: 0.2 }}
                  >
                    {label}
                  </motion.span>
                </button>
              ))}
            </motion.div>
          </div>
        );
      })()}

      {/* Undo delete bar */}
      {undoItem && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#1a2540] border border-cyan-500/40 text-white text-sm px-4 py-3 rounded-2xl shadow-2xl shadow-black/60 max-w-xs w-[90vw]">
          <Undo2 className="h-4 w-4 text-cyan-400 shrink-0" />
          <span className="flex-1 text-xs text-slate-300 truncate">Deleted <span className="font-mono text-white">{undoItem.uid}</span></span>
          <button onClick={handleUndo}
            className="text-xs font-bold text-cyan-400 hover:text-cyan-200 transition-colors shrink-0 bg-cyan-500/20 px-2.5 py-1 rounded-lg">
            Undo
          </button>
          <button onClick={() => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); setUndoItem(null); }}
            className="text-slate-500 hover:text-white shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Validator Overlay */}
      {showValidator && (
        <ValidatorPanel
          onClose={() => setShowValidator(false)}
          onImportLive={handleImportLive}
          onImportDead={handleImportDead}
        />
      )}

      {/* Login Checker Overlay */}
      {showLoginChecker && (
        <LoginCheckerPanel
          onClose={() => setShowLoginChecker(false)}
          prefillPairs={loginCheckerPrefill}
          onComplete={(results) => {
            results.forEach((r) => {
              const item = allItems.find((i) => i.uid === r.uid);
              if (!item) return;
              const isLive = r.status === "live";
              const isDead = r.status === "dead" || r.status === "wrongpass" || r.status === "disabled";
              updateMutation.mutate({
                id: item.id,
                data: {
                  loginStatus: r.status,
                  accessToken: r.accessToken ?? null,
                  ...(isLive ? { visited: true } : {}),
                  ...(isDead && !item.tag ? { tag: "Dead" } : {}),
                } as Parameters<typeof updateMutation.mutate>[0]["data"],
              });
            });
            queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
          }}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm px-2 pb-2">
          <div className="w-full max-w-lg bg-[#0c1122] border border-[#1a2540] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Plus className="h-4 w-4 text-cyan-400" /> Import UIDs
              </h3>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            {/* Drag-drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => setImportText(ev.target?.result as string ?? "");
                reader.readAsText(file);
              }}
              className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl py-3 transition-colors cursor-pointer text-center
                ${dragOver ? "border-cyan-400 bg-cyan-500/10 text-cyan-300" : "border-[#1a2540] text-slate-600 hover:border-slate-500 hover:text-slate-400"}`}>
              <Download className="h-5 w-5" />
              <span className="text-xs font-medium">Drop a .txt file here</span>
              <label className="text-[10px] underline cursor-pointer">
                or browse
                <input type="file" accept=".txt,.csv" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => setImportText(ev.target?.result as string ?? "");
                  reader.readAsText(file);
                  e.target.value = "";
                }} />
              </label>
            </div>
            <Textarea autoFocus
              className="min-h-[150px] font-mono text-sm bg-[#070b16] border-[#1a2540] text-slate-200 placeholder-slate-700 focus-visible:ring-cyan-500 resize-none"
              placeholder={"Paste UIDs here. One per line.\nFormat:  uid   OR   uid|password"}
              value={importText} onChange={(e) => setImportText(e.target.value)} />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">
                {importText.split("\n").filter((l) => l.trim()).length} lines · deduplicated on import
              </span>
              <div className="flex gap-2">
                <button onClick={() => setShowImport(false)}
                  className="text-sm px-4 py-2 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 transition-colors">
                  Cancel
                </button>
                <button onClick={() => importMutation.mutate({ data: { rawText: importText } })}
                  disabled={!importText.trim() || importMutation.isPending}
                  className="text-sm px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#070b16] font-bold transition-colors disabled:opacity-50 flex items-center gap-2">
                  {importMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
