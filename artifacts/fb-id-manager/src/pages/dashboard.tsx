import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  useListFacebookIds,
  useBulkImportFacebookIds,
  useClearAllFacebookIds,
  useDeleteFacebookId,
  useUpdateFacebookId,
  useGetFacebookIdStats,
  getListFacebookIdsQueryKey,
  getGetFacebookIdStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, Trash2, LogOut, Plus, Search, Copy, Download,
  ArrowUpToLine, SortAsc, Loader2, X, Key,
  FileText, CheckSquare, Square,
  Undo2, ExternalLink,
  BookmarkCheck, CheckCircle, RefreshCw, RotateCcw, Eye, EyeOff,
  WifiOff,
} from "lucide-react";

type SortMode = "newest" | "oldest" | "checked" | "unchecked" | "saved" | "alpha" | "recent" | "name" | "followers";
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

const LOGIN_STATUS_CONFIG: Record<LoginStatus, { label: string; dotClass: string; badgeClass: string }> = {
  live:       { label: "Live",       dotClass: "bg-green-500",  badgeClass: "bg-green-900/40 text-green-300 border-green-500/30" },
  dead:       { label: "Dead",       dotClass: "bg-red-500",    badgeClass: "bg-red-900/40 text-red-300 border-red-500/30" },
  checkpoint: { label: "Checkpoint", dotClass: "bg-amber-400",  badgeClass: "bg-amber-900/40 text-amber-300 border-amber-500/30" },
  "2fa":      { label: "2FA",        dotClass: "bg-blue-400",   badgeClass: "bg-blue-900/40 text-blue-300 border-blue-500/30" },
  locked:     { label: "Locked",     dotClass: "bg-orange-400", badgeClass: "bg-orange-900/40 text-orange-300 border-orange-500/30" },
  disabled:   { label: "Disabled",   dotClass: "bg-slate-500",  badgeClass: "bg-slate-800/60 text-slate-400 border-slate-600/30" },
  wrongpass:  { label: "Wrong Pass", dotClass: "bg-pink-400",   badgeClass: "bg-pink-900/40 text-pink-300 border-pink-500/30" },
};

function ProfileAvatar({ profile, uid, size = 28 }: { profile: ProfileData; uid: string; size?: number }) {
  const [imgErr, setImgErr] = useState(false);
  const initials = (profile.name ?? uid).slice(0, 2).toUpperCase();
  const hue = uid.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  const gradient = `linear-gradient(135deg, hsl(${hue},70%,40%), hsl(${(hue + 60) % 360},70%,55%))`;
  const px = `${size}px`;
  if (profile.photoUrl && !imgErr) {
    return (
      <img src={profile.photoUrl} alt={initials} width={size} height={size}
        onError={() => setImgErr(true)}
        className="rounded-full object-cover shrink-0 border border-white/10"
        style={{ width: px, height: px, minWidth: px }} />
    );
  }
  return (
    <div className="rounded-full shrink-0 flex items-center justify-center text-white font-bold border border-white/10"
      style={{ width: px, height: px, minWidth: px, background: gradient, fontSize: size * 0.38 }}>
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

function ValidatorPanel({ onClose, onImportLive, soundEnabled, onPlayChime }: {
  onClose: () => void;
  onImportLive: (uids: string[]) => void;
  soundEnabled?: boolean;
  onPlayChime?: () => void;
}) {
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
                uid: evt.uid as string, status: evt.status as "live" | "dead",
                name: (evt.name as string | null) ?? null,
                username: (evt.username as string | null) ?? null,
                followerCount: (evt.followerCount as string | null) ?? null,
                photoUrl: (evt.photoUrl as string | null) ?? null,
              };
              setFeed((prev) => [entry, ...prev].slice(0, 50));
              if (evt.status === "live") {
                setLiveResults((prev) => [...prev, {
                  uid: evt.uid as string, name: (evt.name as string | null) ?? null,
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
      setStatus((s) => {
        if (s === "running") { if (soundEnabled && onPlayChime) onPlayChime(); return "done"; }
        return s;
      });
    } catch { setStatus("aborted"); }
  };

  const abort = () => { abortRef.current?.abort(); setStatus("aborted"); };
  const copyText = (t: string) => navigator.clipboard.writeText(t);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#09090b] text-white">
      <div className="flex items-center gap-2 px-4 py-3 bg-[#18181b] border-b border-[#27272a] sticky top-0">
        <Zap className="h-4 w-4 text-green-400 shrink-0" />
        <span className="font-bold text-sm flex-1">Bulk Live Validator</span>
        {status === "running" && (
          <button onClick={abort} className="text-[11px] bg-red-600/30 border border-red-500/40 text-red-300 px-3 py-1 rounded-lg hover:bg-red-600/50 transition-colors">
            Stop
          </button>
        )}
        <button onClick={() => { if (status === "running") abort(); onClose(); }} className="p-1.5 rounded text-slate-400 hover:text-white transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {status === "idle" && (
          <>
            <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-4">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Paste UIDs (one per line)</div>
              <textarea value={inputText} onChange={(e) => setInputText(e.target.value)}
                placeholder={"100044388870940\njohnsmith\n100012345678..."}
                rows={10}
                className="w-full bg-[#09090b] border border-[#27272a] text-blue-300 placeholder-slate-700 text-xs font-mono rounded-xl px-3 py-2.5 outline-none focus:border-blue-500/50 resize-none" />
              <div className="text-[10px] text-slate-600 mt-2">{uidCount} UIDs · max 5,000</div>
            </div>
            <button onClick={startValidation} disabled={uidCount === 0}
              className="w-full py-3.5 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-sm transition-all flex items-center justify-center gap-2">
              <Zap className="h-4 w-4" /> Start Validation ({uidCount})
            </button>
            <p className="text-[10px] text-slate-600 text-center px-4 pb-4">
              Each ID is checked live against Facebook. Live and Dead IDs are split into separate groups.
            </p>
          </>
        )}

        {status === "running" && (
          <>
            <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-4">
              <div className="flex items-center justify-between text-[11px] mb-2">
                <span className="text-slate-400 flex items-center gap-1.5">
                  {progress}/{total}
                  {isRateLimited && <span className="text-yellow-400 animate-pulse ml-1">⏳ Rate limited…</span>}
                </span>
                <span className="text-blue-400 font-bold">{pct}%</span>
              </div>
              <div className="h-2 bg-[#27272a] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#22c55e,#06b6d4)" }} />
              </div>
              <div className="flex gap-4 mt-3 text-[11px]">
                <span className="text-green-400 font-semibold">✅ {liveResults.length} Live</span>
                <span className="text-red-400 font-semibold">💀 {deadResults.length} Dead</span>
                <span className="text-slate-600 ml-auto">{total - progress} left</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 max-h-[55vh] overflow-y-auto">
              {feed.map((entry, i) => (
                entry.status === "live" ? (
                  <div key={i} className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-green-900/20 border border-green-500/20">
                    <ValidatorAvatar uid={entry.uid} name={entry.name ?? null} photoUrl={entry.photoUrl ?? null} />
                    <div className="flex-1 min-w-0">
                      <div className="text-green-200 text-xs font-semibold truncate">{entry.name ?? entry.uid}</div>
                      <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                        {entry.username && <span className="text-blue-400/80">@{entry.username}</span>}
                        {entry.followerCount && <span className="text-emerald-400">{entry.followerCount}</span>}
                      </div>
                    </div>
                    <span className="text-green-400 text-xs">✅</span>
                  </div>
                ) : (
                  <div key={i} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-red-900/15 border border-red-500/15">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-500 shrink-0">?</div>
                    <span className="text-red-300/70 text-xs font-mono flex-1 truncate">{entry.uid}</span>
                    <span className="text-red-400 text-xs">💀</span>
                  </div>
                )
              ))}
            </div>
          </>
        )}

        {(status === "done" || status === "aborted") && (
          <>
            <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-4">
              <div className="text-sm font-bold text-white mb-1">
                {status === "done" ? "Validation Complete" : "Stopped"}
              </div>
              <div className="flex gap-6 text-[12px]">
                <span className="text-green-400 font-bold">✅ {liveResults.length} Live</span>
                <span className="text-red-400 font-bold">💀 {deadResults.length} Dead</span>
              </div>
            </div>
            <div className="flex gap-2">
              {(["live", "dead"] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-colors border
                    ${activeTab === tab
                      ? tab === "live" ? "bg-green-600/30 border-green-500/50 text-green-200" : "bg-red-600/30 border-red-500/50 text-red-200"
                      : "border-[#27272a] text-slate-500 hover:text-white"}`}>
                  {tab === "live" ? `✅ Live (${liveResults.length})` : `💀 Dead (${deadResults.length})`}
                </button>
              ))}
            </div>

            {activeTab === "live" && liveResults.length > 0 && (
              <>
                <div className="flex gap-1.5">
                  <button onClick={() => copyText(liveResults.map((r) => r.uid).join("\n"))}
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] bg-[#18181b] border border-[#27272a] text-slate-300 hover:text-white px-3 py-2 rounded-xl transition-colors">
                    <Copy className="h-3 w-3" /> Copy UIDs
                  </button>
                  <button onClick={() => onImportLive(liveResults.map((r) => r.uid))}
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] bg-green-600/30 border border-green-500/40 text-green-200 hover:text-green-100 px-3 py-2 rounded-xl transition-colors">
                    <Plus className="h-3 w-3" /> Import to List
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
                  {liveResults.map((r) => (
                    <div key={r.uid} className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-[#18181b] border border-[#27272a]">
                      <ValidatorAvatar uid={r.uid} name={r.name} photoUrl={r.photoUrl} />
                      <div className="flex-1 min-w-0">
                        {r.name && <div className="text-white text-xs font-semibold truncate">{r.name}</div>}
                        <div className="text-slate-500 text-[10px] font-mono truncate">{r.uid}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === "dead" && deadResults.length > 0 && (
              <>
                <button onClick={() => copyText(deadResults.join("\n"))}
                  className="flex items-center justify-center gap-1.5 text-[11px] bg-[#18181b] border border-[#27272a] text-slate-300 hover:text-white px-3 py-2 rounded-xl transition-colors">
                  <Copy className="h-3 w-3" /> Copy Dead UIDs ({deadResults.length})
                </button>
                <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto">
                  {deadResults.map((uid) => (
                    <div key={uid} className="text-red-300/60 text-xs font-mono px-3 py-1.5 bg-red-900/10 border border-red-500/10 rounded-lg">{uid}</div>
                  ))}
                </div>
              </>
            )}

            <button onClick={() => { setStatus("idle"); setInputText(""); setLiveResults([]); setDeadResults([]); setFeed([]); }}
              className="w-full py-2.5 border border-[#27272a] text-slate-400 hover:text-white text-[11px] font-bold rounded-xl transition-colors">
              New Validation
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function playChime(): void {
  try {
    const ctx = new AudioContext();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.start(t); osc.stop(t + 0.26);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch {}
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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [copyFormat, setCopyFormat] = useState<CopyFormat>("both");
  const [showCopyFmt, setShowCopyFmt] = useState(false);
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const [undoItem, setUndoItem] = useState<{ id: number; uid: string; password: string | null; pinned: boolean; visited: boolean; note: string | null; tag: string | null } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = "dark" as const;
  const [visitCounts, setVisitCounts] = useState<Map<string, number>>(() => {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("fb_visit_"));
      const m = new Map<string, number>();
      for (const k of keys) m.set(k.slice("fb_visit_".length), Number(localStorage.getItem(k) ?? 0));
      return m;
    } catch { return new Map(); }
  });
  const [showValidator, setShowValidator] = useState(false);
  const soundEnabled = true;
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
  const profileDataRef = useRef<Map<string, ProfileData>>(new Map());
  profileDataRef.current = profileData;
  const fetchedUids = useRef<Set<string>>(new Set());
  const [failedUids, setFailedUids] = useState<Set<string>>(new Set());

  const { data: idsData, isLoading: idsLoading } = useListFacebookIds({
    query: { queryKey: getListFacebookIdsQueryKey() },
  });
  const { data: statsData } = useGetFacebookIdStats({
    query: { queryKey: getGetFacebookIdStatsQueryKey() },
  });

  const importMutation = useBulkImportFacebookIds({
    mutation: {
      onSuccess: (r) => {
        toast({ description: `✅ Imported ${r.imported}. Skipped ${r.duplicatesSkipped} duplicates.` });
        setImportText(""); setShowImport(false);
        queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFacebookIdStatsQueryKey() });
        if (r.imported > 0) {
          setTimeout(() => setShowValidator(true), 600);
        }
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
      onMutate: async (variables) => {
        await queryClient.cancelQueries({ queryKey: getListFacebookIdsQueryKey() });
        const prev = queryClient.getQueryData(getListFacebookIdsQueryKey());
        queryClient.setQueryData(getListFacebookIdsQueryKey(), (old: any) => {
          if (!old?.items) return old;
          return { ...old, items: old.items.map((it: any) => it.id === variables.id ? { ...it, ...variables.data, ...(variables.data.visited !== undefined ? { visitedAt: variables.data.visited ? new Date().toISOString() : null } : {}) } : it) };
        });
        return { prev };
      },
      onError: (_err: any, _vars: any, ctx: any) => {
        if (ctx?.prev) queryClient.setQueryData(getListFacebookIdsQueryKey(), ctx.prev);
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFacebookIdStatsQueryKey() });
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
      const res = await fetch(`/api/profile-lookup?uid=${encodeURIComponent(uid)}`, { credentials: "include" });
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

  useEffect(() => { if (!authLoading && !isAuthenticated) setLocation("/login"); }, [authLoading, isAuthenticated, setLocation]);
  useEffect(() => { setVisibleCount(50); }, [sortMode, searchQuery]);

  useEffect(() => {
    if (idsLoading) return;
    const el = listBottomRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisibleCount((v) => v + 50); },
      { threshold: 0, rootMargin: "0px 0px 300px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [idsLoading]);

  useEffect(() => { document.documentElement.setAttribute("data-fb-theme", theme); }, [theme]);

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
        setShowSort(false); setShowCopyFmt(false);
      }
      if (e.key === "Escape") {
        setShowSearch(false); setShowSort(false); setShowCopyFmt(false);
        setSwipedId(null);
        setSelected(new Set()); setEditingNote(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const retryAllFailed = useCallback(async () => {
    if (!failedUids.size) return;
    setRetryingAll(true);
    const uids = [...failedUids];
    uids.forEach((uid) => { fetchedUids.current.delete(uid); });
    setFailedUids(new Set());
    uids.forEach((uid, idx) => { setTimeout(() => fetchProfile(uid), idx * 400); });
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
    visibleItems.forEach((item, idx) => { setTimeout(() => fetchProfile(item.uid), idx * 300); });
    toast({ description: "🔄 Re-fetching profiles…" });
  }, [fetchProfile, toast]);


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
    const pd = profileDataRef.current;
    let items = [...allItems];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) =>
        i.uid.toLowerCase().includes(q) ||
        (i.note ?? "").toLowerCase().includes(q) ||
        (pd.get(i.uid)?.name ?? "").toLowerCase().includes(q) ||
        (pd.get(i.uid)?.instagramUsername ?? "").toLowerCase().includes(q),
      );
    }
    switch (sortMode) {
      case "oldest": items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); break;
      case "newest": items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case "checked": items.sort((a, b) => (b.visited ? 1 : 0) - (a.visited ? 1 : 0)); break;
      case "unchecked": items.sort((a, b) => (a.visited ? 1 : 0) - (b.visited ? 1 : 0)); break;
      case "saved": items.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)); break;
      case "alpha": items.sort((a, b) => a.uid.localeCompare(b.uid)); break;
      case "recent": items.sort((a, b) => {
        const ta = a.visitedAt ? new Date(a.visitedAt).getTime() : 0;
        const tb = b.visitedAt ? new Date(b.visitedAt).getTime() : 0;
        return tb - ta;
      }); break;
      case "name": items.sort((a, b) => {
        const na = pd.get(a.uid)?.name ?? null; const nb = pd.get(b.uid)?.name ?? null;
        if (na && nb) return na.localeCompare(nb);
        if (na) return -1; if (nb) return 1; return 0;
      }); break;
      case "followers": items.sort((a, b) =>
        parseFollowerNum(pd.get(b.uid)?.followerCount ?? null) - parseFollowerNum(pd.get(a.uid)?.followerCount ?? null)
      ); break;
    }
    return items;
  }, [allItems, searchQuery, sortMode]);

  useEffect(() => {
    if (idsLoading) return;
    const visible = filteredItems.slice(0, visibleCount);
    const pending = visible.filter((item) => !fetchedUids.current.has(item.uid));
    if (pending.length === 0) return;
    const BATCH = 2; const DELAY = 800;
    const timers: ReturnType<typeof setTimeout>[] = [];
    pending.forEach((item, idx) => {
      const t = setTimeout(() => fetchProfile(item.uid), Math.floor(idx / BATCH) * DELAY);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [filteredItems, visibleCount, idsLoading, fetchProfile]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSelected((prev) => prev.size === filteredItems.length ? new Set() : new Set(filteredItems.map((i) => i.id)));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredItems]);

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

  function highlightText(text: string, query: string) {
    if (!query.trim()) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return <>{text.slice(0, idx)}<mark className="bg-blue-500/30 text-blue-200 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>{text.slice(idx + query.length)}</>;
  }

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
    const text = selectedItems.map((i) => formatText(i.uid, i.password, i.accessToken)).join("\n");
    copy(text, `Copied ${selectedItems.length} items`);
  };

  const saveNote = (id: number) => {
    updateMutation.mutate({ id, data: { note: noteText.trim() || null } });
    setEditingNote(null);
  };

  const handleCopyAll = () => {
    const text = (selected.size > 0 ? selectedItems : filteredItems).map((i) => formatText(i.uid, i.password, i.accessToken)).join("\n");
    copy(text, `Copied ${selected.size > 0 ? selectedItems.length : filteredItems.length}`);
  };

  const handleSaveAll = () => {
    const targets = selected.size > 0 ? selectedItems : filteredItems.filter((i) => !i.pinned);
    targets.forEach((i) => updateMutation.mutate({ id: i.id, data: { pinned: true } }));
    toast({ description: `💾 Saved ${targets.length} IDs` });
  };

  if (authLoading || !isAuthenticated) return null;

  return (
    <div id="fb-root" ref={topRef} data-theme={theme} className="min-h-screen bg-[#09090b] text-white flex flex-col">

      {/* Validator fullscreen */}
      {showValidator && (
        <ValidatorPanel
          onClose={() => setShowValidator(false)}
          onImportLive={handleImportLive}
          soundEnabled={soundEnabled}
          onPlayChime={playChime}
        />
      )}

      {/* Undo toast */}
      {undoItem && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#18181b] border border-[#27272a] rounded-lg px-4 py-2.5 shadow-2xl">
          <span className="text-xs text-slate-400">Deleted</span>
          <button onClick={handleUndo} className="flex items-center gap-1.5 text-xs text-blue-400 font-bold hover:text-blue-300">
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#09090b]">
          <div className="flex items-center gap-2 px-4 py-3 bg-[#18181b] border-b border-[#27272a]">
            <Plus className="h-4 w-4 text-blue-400 shrink-0" />
            <span className="font-bold text-sm flex-1">Import IDs</span>
            <button onClick={() => setShowImport(false)} className="p-1.5 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 flex flex-col gap-3 px-4 py-4">
            <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-4">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Paste UIDs</div>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                autoFocus
                placeholder={"100044388870940\n100044388870940|password\nusername"}
                rows={14}
                className="w-full bg-[#09090b] border border-[#27272a] text-blue-300 placeholder-slate-700 text-xs font-mono rounded-xl px-3 py-2.5 outline-none focus:border-blue-500/50 resize-none"
              />
              <div className="text-[10px] text-slate-600 mt-2">
                {importText.split("\n").filter((l) => l.trim()).length} lines · format: UID or UID|password
              </div>
            </div>
            <button
              onClick={() => importMutation.mutate({ data: { rawText: importText } })}
              disabled={!importText.trim() || importMutation.isPending}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg text-sm transition-all flex items-center justify-center gap-2">
              {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Import
            </button>
          </div>
        </div>
      )}

      {/* ─── HEADER ─────────────────────────────────── */}
      <header className="fb-header bg-[#18181b] border-b border-[#27272a] px-4 py-3 flex items-center gap-2 sticky top-0 z-30">
        <span className="font-bold text-base text-white flex-1 tracking-tight">FB UIDs</span>

        <div className="flex items-center gap-0.5">
          <button onClick={() => setShowPasswords((v) => !v)}
            className={`p-1.5 rounded-lg transition-colors ${showPasswords ? "text-yellow-400 bg-yellow-400/10" : "text-slate-500 hover:text-white hover:bg-white/5"}`}>
            {showPasswords ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <button onClick={() => { setShowSearch((v) => !v); setShowSort(false); setShowCopyFmt(false); }}
            className={`p-1.5 rounded-lg transition-colors ${showSearch ? "text-blue-400 bg-blue-400/10" : "text-slate-500 hover:text-white hover:bg-white/5"}`}>
            <Search className="h-4 w-4" />
          </button>
          <button onClick={() => { setShowSort((v) => !v); setShowSearch(false); setShowCopyFmt(false); }}
            className={`p-1.5 rounded-lg transition-colors ${showSort ? "text-blue-400 bg-blue-400/10" : "text-slate-500 hover:text-white hover:bg-white/5"}`}>
            <SortAsc className="h-4 w-4" />
          </button>
          <button onClick={logout}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
          <button onClick={() => setShowImport(true)}
            className="ml-1 flex items-center gap-1 bg-blue-500 hover:bg-blue-400 text-[#09090b] text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </header>

      {/* Search bar */}
      {showSearch && (
        <div className="fb-panel bg-[#18181b] border-b border-[#27272a] px-4 py-2.5 flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-500 shrink-0" />
          <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search UIDs, names, notes…"
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none" />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>
          )}
        </div>
      )}

      {/* Sort panel */}
      {showSort && (
        <div className="fb-panel bg-[#18181b] border-b border-[#27272a] px-4 py-3 flex flex-wrap gap-1.5">
          {([
            { key: "newest",    label: "🆕 Newest" },
            { key: "oldest",    label: "📅 Oldest" },
            { key: "alpha",     label: "🔤 A→Z" },
            { key: "name",      label: "👤 Name" },
            { key: "followers", label: "👥 Followers" },
            { key: "recent",    label: "🕐 Last visited" },
            { key: "checked",   label: "✅ Checked" },
            { key: "unchecked", label: "⏳ Unchecked" },
            { key: "saved",     label: "💾 Saved" },
          ] as { key: SortMode; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => { setSortMode(key); setShowSort(false); }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors
                ${sortMode === key ? "bg-blue-500 border-blue-500 text-[#09090b] font-bold" : "border-[#27272a] text-slate-400 hover:text-white hover:border-slate-500"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Copy format panel */}
      {showCopyFmt && (
        <div className="fb-panel bg-[#18181b] border-b border-[#27272a] px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-slate-600 uppercase tracking-wider mr-1">Copy as:</span>
          {([
            { key: "both",  label: "UID|Pass" },
            { key: "uid",   label: "UID only" },
            { key: "pass",  label: "Pass only" },
            { key: "named", label: "UID|Pass|Name|IG" },
            { key: "token", label: "UID|Pass|Token" },
          ] as { key: CopyFormat; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => { setCopyFormat(key); setShowCopyFmt(false); }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors
                ${copyFormat === key ? "bg-blue-500 border-blue-500 text-[#09090b] font-bold" : "border-[#27272a] text-slate-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
      )}


      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="fb-bulk-bar bg-[#1f1f23] border-b border-blue-500/25 px-4 py-2.5 sticky top-[45px] z-20">
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-400 font-bold shrink-0">{selected.size} selected</span>
            <div className="flex-1 flex flex-wrap gap-1.5">
              <button onClick={bulkCopy}
                className="text-[10px] bg-blue-700/30 hover:bg-blue-600/40 text-blue-300 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors">
                <Copy className="h-2.5 w-2.5" /> Copy
              </button>
              <button onClick={() => bulkCheck(true)}
                className="text-[10px] bg-emerald-700/30 hover:bg-emerald-600/40 text-emerald-300 px-2.5 py-1 rounded-lg transition-colors">✅ Check</button>
              <button onClick={() => bulkCheck(false)}
                className="text-[10px] bg-slate-700/30 hover:bg-slate-600/40 text-slate-300 px-2.5 py-1 rounded-lg transition-colors">⬜ Uncheck</button>
              <button onClick={() => bulkSave(true)}
                className="text-[10px] bg-green-700/30 hover:bg-green-600/40 text-green-300 px-2.5 py-1 rounded-lg transition-colors">💾 Save</button>
              <button onClick={bulkDelete}
                className="text-[10px] bg-red-700/30 hover:bg-red-600/40 text-red-300 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors">
                <Trash2 className="h-2.5 w-2.5" /> Delete
              </button>
            </div>
            <button onClick={() => setSelected(new Set())} className="text-slate-500 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── MAIN CONTENT ───────────────────────────── */}
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-4 gap-4">

        {/* Stats row */}
        <div className="bg-[#18181b] rounded-lg border border-[#27272a] px-4 py-3.5">
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { label: "Total",   val: total,   color: "text-zinc-100" },
              { label: "Checked", val: checked, color: "text-purple-400" },
              { label: "Saved",   val: saved,   color: "text-green-400" },
              { label: "Left",    val: left,    color: "text-red-400" },
            ].map(({ label, val, color }) => (
              <div key={label} className="text-center">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{label}</div>
                <div className={`text-xl font-bold tabular-nums ${color}`}>{val}</div>
              </div>
            ))}
          </div>
          <div className="h-1.5 bg-[#27272a] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-blue-500 transition-all duration-700"
              style={{ width: `${checkedPct}%` }} />
          </div>
          {fetchingUids.size > 0 && (
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" /> {fetchingUids.size} loading…
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="flex gap-1.5">
          <button onClick={() => setShowValidator(true)}
            className="flex-1 flex items-center justify-center gap-1.5 bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] text-green-400 hover:text-green-300 rounded-lg py-2.5 text-xs font-medium transition-colors">
            <Zap className="h-3.5 w-3.5" /> Validate
          </button>
          <button onClick={handleCopyAll}
            className="flex-1 flex items-center justify-center gap-1.5 bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] text-zinc-400 hover:text-white rounded-lg py-2.5 text-xs font-medium transition-colors">
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
          <button onClick={handleSaveAll}
            className="flex-1 flex items-center justify-center gap-1.5 bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] text-zinc-400 hover:text-white rounded-lg py-2.5 text-xs font-medium transition-colors">
            <Download className="h-3.5 w-3.5" /> Save
          </button>
          <button onClick={() => handleRefetchAll(filteredItems.slice(0, visibleCount))}
            className="flex-1 flex items-center justify-center gap-1.5 bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] text-zinc-400 hover:text-white rounded-lg py-2.5 text-xs font-medium transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Refetch
          </button>
        </div>


        {/* Retry failed banner */}
        {failedUids.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-orange-900/15 border border-orange-700/25 rounded-xl">
            <WifiOff className="h-3.5 w-3.5 text-orange-400 shrink-0" />
            <span className="text-[11px] text-orange-300 flex-1">{failedUids.size} profiles failed to load</span>
            <button onClick={retryAllFailed} disabled={retryingAll}
              className="text-[10px] bg-orange-700/40 hover:bg-orange-600/50 text-orange-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-60">
              {retryingAll ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RotateCcw className="h-2.5 w-2.5" />}
              Retry
            </button>
          </div>
        )}

        {/* List controls row */}
        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-2 text-xs text-zinc-500 select-none cursor-pointer shrink-0">
            <input type="checkbox" checked={filteredItems.length > 0 && selected.size === filteredItems.length}
              onChange={toggleSelectAll} className="accent-blue-500 h-4 w-4" />
            All
          </label>
          <span className="text-xs text-zinc-500 flex-1">
            {filteredItems.length} {filteredItems.length === 1 ? "entry" : "entries"}
          </span>
          {selected.size > 0 && <span className="text-xs text-blue-400 font-bold">{selected.size} selected</span>}
          <button onClick={() => topRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="text-xs text-zinc-600 hover:text-white flex items-center gap-1 transition-colors">
            <ArrowUpToLine className="h-3.5 w-3.5" />
          </button>
          {allItems.length > 0 && (
            <button onClick={() => { if (confirm("Delete ALL data?")) clearAllMutation.mutate(); }}
              className="text-xs text-red-600 hover:text-red-400 flex items-center gap-1 transition-colors">
              <Trash2 className="h-3.5 w-3.5" /> Wipe
            </button>
          )}
        </div>

        {/* ─── ID LIST ─────────────────────────────── */}
        <div className="flex flex-col gap-3 pb-32">
          {idsLoading ? (
            <div className="flex flex-col items-center py-20 text-zinc-600 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center py-24 gap-4">
              {searchQuery ? (
                <>
                  <Search className="h-12 w-12 text-zinc-700" />
                  <p className="text-base text-zinc-500">No results for "{searchQuery}"</p>
                  <button onClick={() => { setSearchQuery(""); setShowSearch(false); }}
                    className="text-sm text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/25 px-5 py-2 rounded-lg transition-colors">
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <Zap className="h-14 w-14 text-zinc-700" />
                  <p className="text-base font-semibold text-zinc-400">No IDs yet</p>
                  <p className="text-sm text-zinc-600 text-center">Tap Add to import Facebook UIDs.</p>
                  <button onClick={() => setShowImport(true)}
                    className="mt-1 flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-[#09090b] text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
                    <Plus className="h-4 w-4" /> Add IDs
                  </button>
                </>
              )}
            </div>
          ) : (
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

              return (
                <div key={item.id}
                  className={`bg-[#18181b] border rounded-lg overflow-hidden transition-colors relative
                    ${selected.has(item.id) ? "border-blue-500/40 bg-blue-900/10" : "border-[#27272a]"}`}
                  onTouchStart={(e) => {
                    touchStartX.current = e.touches[0].clientX;
                    touchStartY.current = e.touches[0].clientY;
                    startLongPress(item.id);
                  }}
                  onTouchEnd={(e) => {
                    if (longPressTimer.current) clearTimeout(longPressTimer.current);
                    const dx = e.changedTouches[0].clientX - touchStartX.current;
                    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
                    if (!longPressFired.current && dx < -50 && dy < 40) setSwipedId(item.id);
                    if (!longPressFired.current && dx > 50 && dy < 40) setSwipedId(null);
                  }}>

                  {/* Swipe overlay */}
                  {swipedId === item.id && (
                    <div className="absolute inset-0 bg-[#18181b]/97 flex items-center justify-evenly z-10">
                      <button onClick={() => { updateMutation.mutate({ id: item.id, data: { pinned: !item.pinned } }); setSwipedId(null); }}
                        className="flex flex-col items-center gap-1.5 text-green-300 active:scale-90">
                        <BookmarkCheck className="h-6 w-6" />
                        <span className="text-xs font-bold">{item.pinned ? "Unsave" : "Save"}</span>
                      </button>
                      <button onClick={() => { updateMutation.mutate({ id: item.id, data: { visited: !item.visited } }); setSwipedId(null); }}
                        className="flex flex-col items-center gap-1.5 text-blue-300 active:scale-90">
                        <CheckCircle className="h-6 w-6" />
                        <span className="text-xs font-bold">{item.visited ? "Uncheck" : "Check"}</span>
                      </button>
                      <button onClick={() => { deleteWithUndo(item); setSwipedId(null); }}
                        className="flex flex-col items-center gap-1.5 text-red-300 active:scale-90">
                        <Trash2 className="h-6 w-6" />
                        <span className="text-xs font-bold">Delete</span>
                      </button>
                      <button onClick={() => setSwipedId(null)} className="absolute top-3 right-3 text-zinc-500">
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  )}

                  {/* Profile + UID section */}
                  <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)}
                      onMouseDown={startLongPress.bind(null, item.id)}
                      className="accent-blue-500 h-4 w-4 shrink-0 mt-1" />

                    {profile ? (
                      <ProfileAvatar profile={profile} uid={item.uid} size={44} />
                    ) : fetchingUids.has(item.uid) ? (
                      <div className="w-11 h-11 rounded-full bg-zinc-800 shrink-0 animate-pulse" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-zinc-800/50 shrink-0 flex items-center justify-center text-zinc-600 text-sm font-bold">
                        {item.uid.slice(-2)}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Name + followers */}
                      {profile?.name && (
                        <div className="text-sm text-white font-semibold truncate leading-tight">{profile.name}</div>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        {profile?.username && <span className="text-xs text-zinc-400">@{profile.username}</span>}
                        {profile?.followerCount && <span className="text-xs text-blue-400 font-medium">{profile.followerCount}</span>}
                        {profile?.nationality && <span className="text-xs text-zinc-500">{profile.nationality}</span>}
                      </div>

                      {/* UID row */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">#{idx + 1}</span>
                        <a href={`https://facebook.com/${item.uid}`} target="_blank" rel="noreferrer"
                          onClick={() => { incrementVisit(item.uid); if (!item.visited) updateMutation.mutate({ id: item.id, data: { visited: true } }); }}
                          className={`font-mono text-xs flex-1 min-w-0 truncate transition-colors
                            ${item.visited ? "line-through text-zinc-600" : "text-blue-300 hover:text-blue-200"}`}>
                          {highlightText(item.uid, searchQuery)}
                        </a>
                        {(() => {
                          const ls = item.loginStatus as LoginStatus | null | undefined;
                          if (!ls || !LOGIN_STATUS_CONFIG[ls]) return null;
                          const cfg = LOGIN_STATUS_CONFIG[ls];
                          return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.badgeClass}`}>{cfg.label}</span>;
                        })()}
                      </div>

                      {/* Password row */}
                      {item.password && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Key className="h-3 w-3 text-yellow-500/50 shrink-0" />
                          <span className="text-xs font-mono text-yellow-500/50 truncate">
                            {showPasswords ? item.password : "••••••••"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right side actions */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <button onClick={() => copy(formatText(item.uid, item.password, item.accessToken), "Copied!")}
                        className="text-zinc-600 hover:text-blue-400 transition-colors p-1">
                        <Copy className="h-4 w-4" />
                      </button>
                      {item.pinned && <span className="text-xs text-green-500">💾</span>}
                      {visitCount > 0 && <span className="text-[10px] bg-violet-700/30 text-violet-300 px-1.5 py-0.5 rounded font-bold">{visitCount}×</span>}
                    </div>
                  </div>

                  {/* Social links */}
                  {profile && (
                    <div className="flex items-center gap-2 px-4 pb-3">
                      <a href={`https://facebook.com/${item.uid}`} target="_blank" rel="noreferrer"
                        onClick={() => { incrementVisit(item.uid); if (!item.visited) updateMutation.mutate({ id: item.id, data: { visited: true } }); }}
                        className="flex items-center gap-1 text-[11px] bg-blue-900/25 hover:bg-blue-800/40 text-blue-300 px-2.5 py-1 rounded-lg transition-colors">
                        <ExternalLink className="h-3 w-3" /> Facebook
                      </a>
                      {profile.instagramUsername && (
                        <a href={`https://instagram.com/${profile.instagramUsername}`} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-[11px] bg-pink-900/25 hover:bg-pink-800/40 text-pink-300 px-2.5 py-1 rounded-lg transition-colors">
                          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                          Instagram
                        </a>
                      )}
                    </div>
                  )}

                  {/* Failed retry */}
                  {failedUids.has(item.uid) && !profile && (
                    <div className="flex items-center gap-2 px-4 pb-3">
                      <span className="text-xs text-zinc-600 flex-1">Profile not available</span>
                      <button onClick={() => retryProfile(item.uid)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1">
                        <RotateCcw className="h-3.5 w-3.5" /> Retry
                      </button>
                    </div>
                  )}

                  {/* Note display */}
                  {item.note && editingNote !== item.id && (
                    <div className="px-4 pb-3">
                      <div className="text-xs text-zinc-400 bg-zinc-800/40 rounded-lg px-3 py-2 truncate">
                        {item.note}
                      </div>
                    </div>
                  )}

                  {/* Note editor */}
                  {editingNote === item.id && (
                    <div className="px-4 pb-3 flex gap-2">
                      <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveNote(item.id); } }}
                        autoFocus placeholder="Add a note…" rows={2}
                        className="flex-1 bg-[#09090b] border border-[#27272a] text-zinc-300 text-xs px-3 py-2 rounded-lg outline-none focus:border-blue-500/50 resize-none placeholder-zinc-700" />
                      <div className="flex flex-col gap-1.5">
                        <button onClick={() => saveNote(item.id)} className="text-xs bg-blue-500/20 text-blue-400 hover:text-blue-200 px-3 py-1.5 rounded-lg">Save</button>
                        <button onClick={() => setEditingNote(null)} className="text-xs text-zinc-600 hover:text-white px-3 py-1.5 rounded-lg">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="flex border-t border-[#27272a]/50 divide-x divide-[#27272a]/50">
                    <button onClick={() => updateMutation.mutate({ id: item.id, data: { pinned: !item.pinned } })}
                      className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors
                        ${item.pinned ? "text-green-400 bg-green-900/10" : "text-zinc-500 hover:text-green-400"}`}>
                      <BookmarkCheck className="h-3.5 w-3.5" /> {item.pinned ? "Saved" : "Save"}
                    </button>
                    <button onClick={() => updateMutation.mutate({ id: item.id, data: { visited: !item.visited } })}
                      className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors
                        ${item.visited ? "text-emerald-400 bg-emerald-900/10" : "text-zinc-500 hover:text-emerald-400"}`}>
                      {item.visited ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                      {item.visited ? "Done" : "Check"}
                    </button>
                    <button onClick={() => {
                      if (editingNote === item.id) { setEditingNote(null); }
                      else { setEditingNote(item.id); setNoteText(item.note ?? ""); }
                    }}
                      className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors
                        ${item.note ? "text-blue-400 bg-blue-900/10" : "text-zinc-500 hover:text-blue-400"}`}>
                      <FileText className="h-3.5 w-3.5" /> Note
                    </button>
                    <button onClick={() => deleteWithUndo(item)}
                      className="flex-1 py-2.5 text-xs font-medium text-zinc-500 hover:text-red-400 flex items-center justify-center gap-1 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
          <div ref={listBottomRef} className="h-4" />
        </div>
      </div>
    </div>
  );
}
