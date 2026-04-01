import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { useEffect, useState, useMemo, useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Zap, Trash2, LogOut, Plus, Search, Copy, Download,
  ArrowUpToLine, SortAsc, Loader2, X, Key, Shield,
} from "lucide-react";

type SortMode = "newest" | "oldest" | "checked" | "unchecked" | "saved";

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
        setImportText("");
        setShowImport(false);
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

  const updateMutation = useUpdateFacebookId({
    mutation: {
      onSuccess: () => {
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

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/login");
  }, [authLoading, isAuthenticated, setLocation]);

  const allItems = idsData?.items ?? [];

  const filteredItems = useMemo(() => {
    let items = [...allItems];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) => i.uid.toLowerCase().includes(q));
    }
    switch (sortMode) {
      case "oldest": items.sort((a, b) => a.id - b.id); break;
      case "newest": items.sort((a, b) => b.id - a.id); break;
      case "checked": items.sort((a, b) => (b.visited ? 1 : 0) - (a.visited ? 1 : 0)); break;
      case "unchecked": items.sort((a, b) => (a.visited ? 1 : 0) - (b.visited ? 1 : 0)); break;
      case "saved": items.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)); break;
    }
    return items;
  }, [allItems, searchQuery, sortMode]);

  const total = statsData?.total ?? 0;
  const checked = statsData?.visited ?? 0;
  const left = statsData?.unvisited ?? 0;
  const saved = statsData?.pinned ?? 0;
  const checkedPct = total > 0 ? Math.round((checked / total) * 100) : 0;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ description: `📋 ${label}` }));
  };

  const downloadFile = (text: string, filename: string) => {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const downloadCsv = (items: typeof allItems, filename: string) => {
    const header = "uid,password";
    const rows = items.map((i) => `${i.uid},${i.password ?? ""}`);
    downloadFile([header, ...rows].join("\n"), filename);
  };

  const getBulk = (type: "checked" | "unchecked" | "saved") => {
    if (type === "checked") return allItems.filter((i) => i.visited);
    if (type === "unchecked") return allItems.filter((i) => !i.visited);
    return allItems.filter((i) => i.pinned);
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleSaveAll = () => {
    const targets = selected.size > 0
      ? filteredItems.filter((i) => selected.has(i.id))
      : filteredItems;
    targets.forEach((i) => updateMutation.mutate({ id: i.id, data: { pinned: true } }));
    toast({ description: `💾 Saved ${targets.length} IDs` });
  };

  const handleCopyAll = () => {
    const targets = selected.size > 0
      ? filteredItems.filter((i) => selected.has(i.id))
      : filteredItems;
    const text = targets.map((i) => i.password ? `${i.uid}|${i.password}` : i.uid).join("\n");
    copy(text, `Copied ${targets.length} IDs`);
  };

  if (authLoading || !isAuthenticated) return null;

  return (
    <div ref={topRef} className="min-h-screen bg-[#0a0e1a] text-white dark flex flex-col">
      {/* Header */}
      <header className="bg-[#0d1226] border-b border-[#1e2a45] px-3 py-2 flex items-center gap-2 sticky top-0 z-20">
        <Shield className="h-5 w-5 text-cyan-400 shrink-0" />
        <span className="font-bold text-sm text-white flex-1 truncate">FB UID Manager Pro <span className="text-cyan-400">v2</span></span>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowSearch((v) => !v)} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Search">
            <Search className="h-4 w-4" />
          </button>
          <button onClick={() => setShowSort((v) => !v)} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Sort">
            <SortAsc className="h-4 w-4" />
          </button>
          <button onClick={logout} className="p-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors" title="Logout">
            <LogOut className="h-4 w-4" />
          </button>
          <button onClick={() => setShowImport(true)} className="ml-1 flex items-center gap-1 bg-cyan-500 hover:bg-cyan-400 text-[#0a0e1a] text-xs font-bold px-2.5 py-1.5 rounded transition-colors">
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>
      </header>

      {/* Search bar */}
      {showSearch && (
        <div className="bg-[#0d1226] border-b border-[#1e2a45] px-3 py-2 flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search UIDs..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Sort panel */}
      {showSort && (
        <div className="bg-[#0d1226] border-b border-[#1e2a45] px-3 py-2 flex flex-wrap gap-2">
          {(["newest","oldest","checked","unchecked","saved"] as SortMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setSortMode(m); setShowSort(false); }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors capitalize
                ${sortMode === m ? "bg-cyan-500 border-cyan-500 text-[#0a0e1a] font-bold" : "border-[#1e2a45] text-slate-400 hover:text-white hover:border-slate-500"}`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-2 py-3 gap-3">

        {/* Stats */}
        <div className="bg-[#0d1226] rounded-xl border border-[#1e2a45] p-3">
          <div className="grid grid-cols-4 gap-1 mb-3">
            {[
              { label: "Total", val: total, color: "text-white" },
              { label: "Checked", val: checked, color: "text-purple-400" },
              { label: "Left", val: left, color: "text-red-400" },
              { label: "Saved", val: saved, color: "text-green-400" },
            ].map(({ label, val, color }) => (
              <div key={label} className="text-center">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
                <div className={`text-2xl font-bold ${color}`}>{val}</div>
              </div>
            ))}
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-[#1e2a45] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${checkedPct}%`,
                background: "linear-gradient(90deg, #6366f1, #06b6d4, #22c55e)",
              }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "SEARCH", icon: <Search className="h-3.5 w-3.5" />, action: () => setShowSearch((v) => !v) },
            { label: "SAVE ALL", icon: <Download className="h-3.5 w-3.5" />, action: handleSaveAll },
            { label: "COPY ALL", icon: <Copy className="h-3.5 w-3.5" />, action: handleCopyAll },
            { label: "SORT", icon: <SortAsc className="h-3.5 w-3.5" />, action: () => setShowSort((v) => !v) },
          ].map(({ label, icon, action }) => (
            <button
              key={label}
              onClick={action}
              className="flex flex-col items-center gap-1 bg-[#0d1226] border border-[#1e2a45] rounded-lg py-2 px-1 text-[10px] font-bold text-slate-300 hover:text-white hover:border-cyan-500/50 transition-colors"
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Export category rows */}
        <div className="bg-[#0d1226] rounded-xl border border-[#1e2a45] overflow-hidden divide-y divide-[#1e2a45]">
          {[
            { label: "✅ Checked", type: "checked" as const },
            { label: "⏳ Unchecked", type: "unchecked" as const },
            { label: "💾 Saved", type: "saved" as const },
          ].map(({ label, type }) => {
            const items = getBulk(type);
            const text = items.map((i) => i.password ? `${i.uid}|${i.password}` : i.uid).join("\n");
            return (
              <div key={type} className="flex items-center px-3 py-2.5 gap-2">
                <span className="text-xs text-slate-300 flex-1 font-medium">{label}</span>
                <div className="flex gap-1.5">
                  <button onClick={() => copy(text, `Copied ${items.length} ${type}`)} className="text-[10px] bg-[#1e2a45] hover:bg-[#2a3a5e] text-slate-300 hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-1">
                    <Copy className="h-2.5 w-2.5" /> Copy
                  </button>
                  <button onClick={() => downloadFile(text, `${type}.txt`)} className="text-[10px] bg-[#1e2a45] hover:bg-[#2a3a5e] text-slate-300 hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-1">
                    <Download className="h-2.5 w-2.5" /> .txt
                  </button>
                  <button onClick={() => downloadCsv(items, `${type}.csv`)} className="text-[10px] bg-[#1e2a45] hover:bg-[#2a3a5e] text-slate-300 hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-1">
                    <Download className="h-2.5 w-2.5" /> .csv
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Entry count + select all + top */}
        <div className="flex items-center gap-2 px-1">
          <label className="flex items-center gap-1.5 text-xs text-slate-400 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={filteredItems.length > 0 && selected.size === filteredItems.length}
              onChange={toggleSelectAll}
              className="accent-cyan-500 h-3.5 w-3.5"
            />
            All
          </label>
          <span className="text-xs text-slate-500 flex-1">{filteredItems.length} entries</span>
          {selected.size > 0 && (
            <span className="text-xs text-cyan-400 font-medium">{selected.size} selected</span>
          )}
          <button
            onClick={() => topRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            <ArrowUpToLine className="h-3 w-3" /> Top
          </button>
          {allItems.length > 0 && (
            <button
              onClick={() => { if (confirm("Delete ALL data?")) clearAllMutation.mutate(); }}
              className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Wipe
            </button>
          )}
        </div>

        {/* ID List */}
        <div className="flex flex-col gap-2 pb-20">
          {idsLoading ? (
            <div className="text-center py-12 text-slate-500 flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
              Loading...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-16 text-slate-500 flex flex-col items-center gap-3">
              <Shield className="h-10 w-10 opacity-20" />
              <p className="text-sm">{searchQuery ? "No results found." : "No IDs yet. Tap + New to import."}</p>
            </div>
          ) : (
            filteredItems.map((item, idx) => (
              <div
                key={item.id}
                className={`rounded-xl border transition-all duration-150
                  ${item.pinned ? "border-green-500/40 bg-[#0d1f14]" : "border-[#1e2a45] bg-[#0d1226]"}
                  ${selected.has(item.id) ? "ring-1 ring-cyan-500/40" : ""}
                `}
              >
                <div className="flex items-start gap-2 px-3 pt-3 pb-2">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="accent-cyan-500 mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  {/* Number */}
                  <span className="text-[10px] text-slate-500 mt-0.5 shrink-0 w-5 text-center">{idx + 1}</span>
                  {/* UID + Pass */}
                  <div className="flex-1 min-w-0">
                    <a
                      href={`https://facebook.com/${item.uid}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => { if (!item.visited) updateMutation.mutate({ id: item.id, data: { visited: true } }); }}
                      className={`font-mono text-sm block truncate transition-colors hover:text-cyan-300
                        ${item.visited ? "line-through text-slate-500" : "text-slate-200"}`}
                    >
                      {item.uid}
                    </a>
                    {item.password && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Key className="h-2.5 w-2.5 text-yellow-400 shrink-0" />
                        <span className="text-[11px] font-mono text-yellow-400/80 truncate">{item.password}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons row */}
                <div className="flex flex-wrap gap-1 px-3 pb-2">
                  <button
                    onClick={() => copy(item.uid, "UID copied")}
                    className="text-[10px] bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 hover:text-white px-2 py-1 rounded transition-colors"
                  >
                    UID
                  </button>
                  <button
                    onClick={() => item.password ? copy(item.password, "Pass copied") : toast({ description: "No password" })}
                    className="text-[10px] bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 hover:text-white px-2 py-1 rounded transition-colors"
                  >
                    <Key className="h-2.5 w-2.5 inline mr-0.5" />Pass
                  </button>
                  <button
                    onClick={() => copy(item.password ? `${item.uid}|${item.password}` : item.uid, "Both copied")}
                    className="text-[10px] bg-purple-700/70 hover:bg-purple-600/70 text-purple-200 hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-0.5"
                  >
                    <Zap className="h-2.5 w-2.5" />Both
                  </button>
                  <button
                    onClick={() => updateMutation.mutate({ id: item.id, data: { visited: !item.visited } })}
                    className={`text-[10px] px-2 py-1 rounded transition-colors
                      ${item.visited
                        ? "bg-emerald-700/60 hover:bg-emerald-600/60 text-emerald-200"
                        : "bg-slate-700/60 hover:bg-emerald-700/60 text-slate-300 hover:text-emerald-200"}`}
                  >
                    {item.visited ? "✅ Done" : "⬜ Check"}
                  </button>
                </div>

                {/* Save / Del row */}
                <div className="flex gap-1.5 px-3 pb-3">
                  <button
                    onClick={() => updateMutation.mutate({ id: item.id, data: { pinned: !item.pinned } })}
                    className={`flex-1 text-[11px] font-semibold py-1.5 rounded transition-colors flex items-center justify-center gap-1
                      ${item.pinned
                        ? "bg-green-700/80 hover:bg-green-600/80 text-green-100"
                        : "bg-green-800/50 hover:bg-green-700/60 text-green-300"}`}
                  >
                    💾 {item.pinned ? "Saved" : "Save"}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate({ id: item.id })}
                    className="flex-1 text-[11px] font-semibold py-1.5 rounded bg-red-800/50 hover:bg-red-700/70 text-red-300 hover:text-red-100 transition-colors flex items-center justify-center gap-1"
                  >
                    <X className="h-3 w-3" /> Del
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-2">
          <div className="w-full max-w-lg bg-[#0d1226] border border-[#1e2a45] rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Plus className="h-4 w-4 text-cyan-400" /> Import UIDs
              </h3>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Textarea
              autoFocus
              className="min-h-[180px] font-mono text-sm bg-[#080d1a] border-[#1e2a45] text-slate-200 placeholder-slate-600 focus-visible:ring-cyan-500 resize-none"
              placeholder={"Paste UIDs here. One per line.\nFormat: uid  OR  uid|password"}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {importText.split("\n").filter((l) => l.trim()).length} lines
              </span>
              <div className="flex gap-2">
                <button onClick={() => setShowImport(false)} className="text-sm px-4 py-2 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => importMutation.mutate({ data: { rawText: importText } })}
                  disabled={!importText.trim() || importMutation.isPending}
                  className="text-sm px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#0a0e1a] font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {importMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
