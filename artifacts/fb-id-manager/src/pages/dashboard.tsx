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
  BookmarkCheck, CheckCircle,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

type SortMode = "newest" | "oldest" | "checked" | "unchecked" | "saved" | "alpha" | "recent" | "name";
type FilterMode = "all" | "checked" | "unchecked" | "saved" | "noted" | "tagged";
type CopyFormat = "both" | "uid" | "pass";

interface ProfileData {
  name: string | null;
  username: string | null;
  userId: string | null;
  followerCount: string | null;
  nationality: string | null;
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
  const [swipedId, setSwipedId] = useState<number | null>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const listBottomRef = useRef<HTMLDivElement>(null);
  const [profileData, setProfileData] = useState<Map<string, ProfileData>>(new Map());
  const fetchedUids = useRef<Set<string>>(new Set());
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
    try {
      const res = await fetch(`/api/profile-lookup?uid=${encodeURIComponent(uid)}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data: ProfileData = await res.json();
        if (data.name || data.username || data.followerCount) {
          setProfileData((prev) => new Map(prev).set(uid, data));
        }
      }
    } catch {
      // silent fail — no bar shown
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/login");
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    setVisibleCount(50);
  }, [filterMode, sortMode, searchQuery]);

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

  const incrementVisit = useCallback((uid: string) => {
    try {
      const key = `fb_visit_${uid}`;
      const next = Number(localStorage.getItem(key) ?? 0) + 1;
      localStorage.setItem(key, String(next));
      setVisitCounts((prev) => new Map(prev).set(uid, next));
    } catch {}
  }, []);

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

  const filteredItems = useMemo(() => {
    let items = [...allItems];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) => i.uid.toLowerCase().includes(q) || (i.note ?? "").toLowerCase().includes(q));
    }
    switch (filterMode) {
      case "checked": items = items.filter((i) => i.visited); break;
      case "unchecked": items = items.filter((i) => !i.visited); break;
      case "saved": items = items.filter((i) => i.pinned); break;
      case "noted": items = items.filter((i) => !!i.note); break;
      case "tagged": items = items.filter((i) => !!i.tag); break;
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
    }
    return items;
  }, [allItems, searchQuery, sortMode, filterMode, profileData]);

  useEffect(() => {
    if (idsLoading) return;
    const visible = filteredItems.slice(0, visibleCount);
    const timers: ReturnType<typeof setTimeout>[] = [];
    visible.forEach((item, idx) => {
      if (!fetchedUids.current.has(item.uid)) {
        const t = setTimeout(() => fetchProfile(item.uid), idx * 250);
        timers.push(t);
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [filteredItems, visibleCount, idsLoading, fetchProfile]);

  const total = statsData?.total ?? 0;
  const checked = statsData?.visited ?? 0;
  const left = statsData?.unvisited ?? 0;
  const saved = statsData?.pinned ?? 0;
  const checkedPct = total > 0 ? Math.round((checked / total) * 100) : 0;

  const formatText = (uid: string, password: string | null): string => {
    if (copyFormat === "uid") return uid;
    if (copyFormat === "pass") return password ?? uid;
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
    const text = selectedItems.map((i) => formatText(i.uid, i.password)).join("\n");
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
    const text = (selected.size > 0 ? selectedItems : filteredItems).map((i) => formatText(i.uid, i.password)).join("\n");
    copy(text, `Copied ${selected.size > 0 ? selectedItems.length : filteredItems.length} IDs`);
  };

  const handleSaveAll = () => {
    const targets = selected.size > 0 ? selectedItems : filteredItems;
    targets.forEach((i) => updateMutation.mutate({ id: i.id, data: { pinned: true } }));
    toast({ description: `💾 Saved ${targets.length} IDs` });
  };

  if (authLoading || !isAuthenticated) return null;

  const filterTabs: { key: FilterMode; label: string; count: number }[] = [
    { key: "all", label: "All", count: allItems.length },
    { key: "checked", label: "✅", count: allItems.filter((i) => i.visited).length },
    { key: "unchecked", label: "⏳", count: allItems.filter((i) => !i.visited).length },
    { key: "saved", label: "💾", count: allItems.filter((i) => i.pinned).length },
    { key: "noted", label: "📝", count: allItems.filter((i) => !!i.note).length },
    { key: "tagged", label: "🏷️", count: allItems.filter((i) => !!i.tag).length },
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
          <button onClick={() => { setShowCopyFmt((v) => !v); setShowSort(false); setShowSearch(false); }}
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Copy format">
            <Copy className="h-4 w-4" />
          </button>
          <button onClick={() => { setShowSearch((v) => !v); setShowSort(false); setShowCopyFmt(false); }}
            className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Search">
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
        <div className="bg-[#0c1122] border-b border-[#1a2540] px-3 py-2 flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase mr-1">Copy as:</span>
          {(["both", "uid", "pass"] as CopyFormat[]).map((f) => (
            <button key={f} onClick={() => { setCopyFormat(f); setShowCopyFmt(false); }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors
                ${copyFormat === f ? "bg-cyan-500 border-cyan-500 text-[#070b16] font-bold" : "border-[#1a2540] text-slate-400 hover:text-white"}`}>
              {f === "both" ? "UID|Pass" : f === "uid" ? "UID only" : "Pass only"}
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
            { key: "newest", label: "🆕 Newest" },
            { key: "oldest", label: "📅 Oldest" },
            { key: "alpha", label: "🔤 A→Z" },
            { key: "name", label: "👤 By Name" },
            { key: "recent", label: "🕐 Last visited" },
            { key: "checked", label: "✅ Checked first" },
            { key: "unchecked", label: "⏳ Unchecked first" },
            { key: "saved", label: "💾 Saved first" },
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
        <div className="fb-bulk-bar bg-[#0d1a2e] border-b border-cyan-500/30 px-3 py-2 flex items-center gap-2 sticky top-[45px] z-20">
          <span className="text-xs text-cyan-400 font-bold">{selected.size} selected</span>
          <div className="flex-1 flex flex-wrap gap-1.5">
            <button onClick={bulkCopy} className="text-[10px] bg-cyan-700/40 hover:bg-cyan-600/50 text-cyan-300 px-2 py-1 rounded flex items-center gap-1">
              <Copy className="h-2.5 w-2.5" /> Copy
            </button>
            <button onClick={() => bulkCheck(true)} className="text-[10px] bg-emerald-700/40 hover:bg-emerald-600/50 text-emerald-300 px-2 py-1 rounded">✅ Check</button>
            <button onClick={() => bulkCheck(false)} className="text-[10px] bg-slate-700/40 hover:bg-slate-600/50 text-slate-300 px-2 py-1 rounded">⬜ Uncheck</button>
            <button onClick={() => bulkSave(true)} className="text-[10px] bg-green-700/40 hover:bg-green-600/50 text-green-300 px-2 py-1 rounded">💾 Save</button>
            <button onClick={bulkDelete} className="text-[10px] bg-red-700/40 hover:bg-red-600/50 text-red-300 px-2 py-1 rounded flex items-center gap-1">
              <Trash2 className="h-2.5 w-2.5" /> Delete
            </button>
          </div>
          <button onClick={() => setSelected(new Set())} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
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
          <div className="h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${checkedPct}%`, background: "linear-gradient(90deg,#6366f1,#06b6d4,#22c55e)" }} />
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-4 gap-2">
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
        </div>

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
            const text = items.map((i) => formatText(i.uid, i.password)).join("\n");
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
                </div>
              </div>
            );
          })}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {filterTabs.map(({ key, label, count }) => (
            <button key={key} onClick={() => setFilterMode(key)}
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap flex items-center gap-1
                ${filterMode === key ? "bg-cyan-500 border-cyan-500 text-[#070b16] font-bold" : "border-[#1a2540] text-slate-400 hover:text-white hover:border-slate-500"}`}>
              {label}
              <span className={`text-[10px] font-bold px-1 rounded-full min-w-[16px] text-center
                ${filterMode === key ? "bg-[#070b16]/30 text-[#070b16]" : "bg-[#1a2540] text-slate-300"}`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Entry count row */}
        <div className="flex items-center gap-2 px-0.5">
          <label className="flex items-center gap-1.5 text-xs text-slate-500 select-none cursor-pointer">
            <input type="checkbox" checked={filteredItems.length > 0 && selected.size === filteredItems.length}
              onChange={toggleSelectAll} className="accent-cyan-500 h-3.5 w-3.5" />
            All
          </label>
          <span className="text-xs text-slate-600 flex-1">{filteredItems.length} entries</span>
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
              <Shield className="h-10 w-10 opacity-15" />
              <p className="text-sm">{searchQuery || filterMode !== "all" ? "No matches." : "No IDs yet. Tap + New to import."}</p>
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
                  </div>
                  <button
                    onClick={() => copy(formatText(item.uid, item.password), "Copied!")}
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

                  {/* Swipe overlay — Save / Check / Delete */}
                  {swipedId === item.id && (
                    <div className="absolute inset-0 bg-slate-900/95 flex items-center justify-center z-10 gap-5">
                      <button onClick={() => { updateMutation.mutate({ id: item.id, data: { pinned: !item.pinned } }); setSwipedId(null); }}
                        className={`flex flex-col items-center gap-1.5 active:scale-95 transition-transform
                          ${item.pinned ? "text-green-300" : "text-green-400"}`}>
                        <Save className="h-7 w-7" />
                        <span className="text-[11px] font-bold">{item.pinned ? "Unsave" : "Save"}</span>
                      </button>
                      <button onClick={() => { updateMutation.mutate({ id: item.id, data: { visited: !item.visited } }); setSwipedId(null); }}
                        className={`flex flex-col items-center gap-1.5 active:scale-95 transition-transform
                          ${item.visited ? "text-cyan-300" : "text-cyan-400"}`}>
                        {item.visited ? <CheckSquare className="h-7 w-7" /> : <Square className="h-7 w-7" />}
                        <span className="text-[11px] font-bold">{item.visited ? "Uncheck" : "Check"}</span>
                      </button>
                      <button onClick={() => deleteWithUndo(item)}
                        className="flex flex-col items-center gap-1.5 text-red-400 active:scale-95 transition-transform">
                        <Trash2 className="h-7 w-7" />
                        <span className="text-[11px] font-bold">Delete</span>
                      </button>
                      <button onClick={() => setSwipedId(null)}
                        className="absolute top-2 right-2 text-slate-500 hover:text-white">
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  )}

                  {/* Tag bar */}
                  {item.tag && (
                    <div className={`px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tagColor(item.tag)}`}>
                      🏷️ {item.tag}
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
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5 bg-blue-900/20 border-b border-blue-500/20 text-[11px]">
                          {profile.name ? (
                            <span className="text-blue-200 font-semibold truncate max-w-[120px]">{profile.name}</span>
                          ) : (
                            <span className="text-slate-500 italic">Name N/A</span>
                          )}
                          {profile.username && profile.username !== "profile.php" && (
                            <span className="text-cyan-400/80">@{profile.username}</span>
                          )}
                          {profile.followerCount && (
                            <span className="text-emerald-400/80 flex items-center gap-0.5">
                              <User className="h-2.5 w-2.5" />{profile.followerCount}
                            </span>
                          )}
                          {profile.nationality && (
                            <span className="text-orange-300/70">📍 {profile.nationality}</span>
                          )}
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

                  {/* Pass row */}
                  <div className="flex items-center gap-2 px-3 pb-1.5">
                    <div className="w-3.5 h-3.5 shrink-0" />
                    <div className="w-4 shrink-0" />
                    <span className="text-[10px] text-slate-500 shrink-0">Pass:</span>
                    {item.password ? (
                      <>
                        <span className={`font-mono ${fontClass(fontSize)} flex-1 min-w-0 truncate text-yellow-400/90`}>
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

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm px-2 pb-2">
          <div className="w-full max-w-lg bg-[#0c1122] border border-[#1a2540] rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Plus className="h-4 w-4 text-cyan-400" /> Import UIDs
              </h3>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <Textarea autoFocus
              className="min-h-[180px] font-mono text-sm bg-[#070b16] border-[#1a2540] text-slate-200 placeholder-slate-700 focus-visible:ring-cyan-500 resize-none"
              placeholder={"Paste UIDs here. One per line.\nFormat:  uid   OR   uid|password"}
              value={importText} onChange={(e) => setImportText(e.target.value)} />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">
                {importText.split("\n").filter((l) => l.trim()).length} lines
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
