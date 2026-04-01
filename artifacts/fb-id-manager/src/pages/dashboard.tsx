import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { useEffect, useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Copy, Download, Pin, PinOff, Trash2, ShieldAlert,
  Loader2, CheckCircle2, Circle, Database
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useListFacebookIds,
  useBulkImportFacebookIds,
  useClearAllFacebookIds,
  useDeleteFacebookId,
  useUpdateFacebookId,
  useGetFacebookIdStats,
  getListFacebookIdsQueryKey,
  getGetFacebookIdStatsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Dashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [importText, setImportText] = useState("");

  const { data: idsData, isLoading: idsLoading } = useListFacebookIds({
    query: { queryKey: getListFacebookIdsQueryKey() }
  });

  const { data: statsData, isLoading: statsLoading } = useGetFacebookIdStats({
    query: { queryKey: getGetFacebookIdStatsQueryKey() }
  });

  const importMutation = useBulkImportFacebookIds({
    mutation: {
      onSuccess: (result) => {
        toast({
          title: "Import Complete",
          description: `Added ${result.imported} IDs. Skipped ${result.duplicatesSkipped} duplicates.`,
        });
        setImportText("");
        queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFacebookIdStatsQueryKey() });
      },
      onError: (err) => {
        toast({
          title: "Import Failed",
          description: err.data?.error ?? "An error occurred",
          variant: "destructive"
        });
      }
    }
  });

  const deleteMutation = useDeleteFacebookId({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFacebookIdStatsQueryKey() });
      }
    }
  });

  const updateMutation = useUpdateFacebookId({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFacebookIdStatsQueryKey() });
      }
    }
  });

  const clearAllMutation = useClearAllFacebookIds({
    mutation: {
      onSuccess: (res) => {
        toast({
          title: "Data Cleared",
          description: `Deleted ${res.deleted} IDs.`,
        });
        queryClient.invalidateQueries({ queryKey: getListFacebookIdsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFacebookIdStatsQueryKey() });
      }
    }
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const lineCount = useMemo(() => {
    if (!importText) return 0;
    return importText.split('\n').filter(l => l.trim()).length;
  }, [importText]);

  const handleImport = () => {
    if (!importText.trim()) return;
    importMutation.mutate({ data: { rawText: importText } });
  };

  const handleCopy = (text: string, description: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ description });
    });
  };

  const handleDownload = (text: string, filename: string) => {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyBulk = (type: 'all' | 'pinned' | 'unchecked') => {
    const items = idsData?.items || [];
    let filtered = items;
    if (type === 'pinned') filtered = items.filter(i => i.pinned);
    if (type === 'unchecked') filtered = items.filter(i => !i.visited);
    const text = filtered.map(i => i.password ? `${i.uid}|${i.password}` : i.uid).join('\n');
    handleCopy(text, `Copied ${filtered.length} ${type} IDs.`);
  };

  const downloadBulk = (type: 'all' | 'pinned' | 'unchecked') => {
    const items = idsData?.items || [];
    let filtered = items;
    if (type === 'pinned') filtered = items.filter(i => i.pinned);
    if (type === 'unchecked') filtered = items.filter(i => !i.visited);
    const text = filtered.map(i => i.password ? `${i.uid}|${i.password}` : i.uid).join('\n');
    handleDownload(text, `fb_ids_${type}.txt`);
  };

  const togglePin = (id: number, current: boolean) => {
    updateMutation.mutate({ id, data: { pinned: !current } });
  };

  const markVisited = (id: number) => {
    updateMutation.mutate({ id, data: { visited: true } });
  };

  const deleteId = (id: number) => {
    deleteMutation.mutate({ id });
  };

  if (authLoading || !isAuthenticated) return null;

  return (
    <Layout>
      <div className="flex flex-col gap-6 max-w-5xl mx-auto">
        {/* Import Section */}
        <section className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
            <h2 className="font-semibold flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Import Data
            </h2>
            <Badge variant="secondary" className="font-mono">{lineCount} lines</Badge>
          </div>
          <div className="p-4 space-y-4">
            <Textarea 
              className="min-h-[160px] font-mono text-sm bg-background border-border focus-visible:ring-primary"
              placeholder="Paste UIDs here. One per line.&#10;Format: uid OR uid|password"
              value={importText}
              onChange={e => setImportText(e.target.value)}
            />
            <div className="flex justify-end">
              <Button 
                onClick={handleImport} 
                disabled={!importText.trim() || importMutation.isPending}
                className="w-full sm:w-auto"
              >
                {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {lineCount > 0 ? lineCount : ''} IDs
              </Button>
            </div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center shadow-sm">
            <span className="text-muted-foreground text-sm font-medium">Total</span>
            <span className="text-3xl font-bold mt-1 text-foreground">
              {statsLoading ? "-" : statsData?.total ?? 0}
            </span>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center shadow-sm">
            <span className="text-muted-foreground text-sm font-medium">Pinned</span>
            <span className="text-3xl font-bold mt-1 text-primary">
              {statsLoading ? "-" : statsData?.pinned ?? 0}
            </span>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center shadow-sm">
            <span className="text-muted-foreground text-sm font-medium">Visited</span>
            <span className="text-3xl font-bold mt-1 text-emerald-500">
              {statsLoading ? "-" : statsData?.visited ?? 0}
            </span>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col items-center justify-center shadow-sm">
            <span className="text-muted-foreground text-sm font-medium">Unvisited</span>
            <span className="text-3xl font-bold mt-1 text-orange-500">
              {statsLoading ? "-" : statsData?.unvisited ?? 0}
            </span>
          </div>
        </section>

        {/* Bulk Actions */}
        <section className="flex flex-wrap items-center gap-2 p-4 bg-muted/10 border border-border rounded-xl">
          <Button variant="outline" size="sm" onClick={() => copyBulk('pinned')} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" /> Pinned
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadBulk('pinned')} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Pinned
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="outline" size="sm" onClick={() => copyBulk('unchecked')} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" /> Unchecked
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadBulk('unchecked')} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Unchecked
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="outline" size="sm" onClick={() => copyBulk('all')} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" /> All
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadBulk('all')} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> All
          </Button>
          
          <div className="flex-1" />
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={() => {
              if(confirm("Are you sure you want to delete ALL data? This cannot be undone.")) {
                clearAllMutation.mutate();
              }
            }}
            disabled={clearAllMutation.isPending || !idsData?.items?.length}
            className="gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" /> Wipe Data
          </Button>
        </section>

        {/* ID List */}
        <section className="space-y-3 pb-20">
          {idsLoading ? (
            <div className="text-center p-8 text-muted-foreground animate-pulse">Loading items...</div>
          ) : !idsData?.items?.length ? (
            <div className="text-center p-16 border border-dashed border-border rounded-xl text-muted-foreground flex flex-col items-center gap-3 bg-muted/5">
              <Database className="h-8 w-8 opacity-20" />
              <p>No IDs found. Import some data to get started.</p>
            </div>
          ) : (
            idsData.items.map(item => (
              <div 
                key={item.id} 
                className={`group flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 
                  ${item.visited ? 'opacity-60 bg-background border-border/50 hover:opacity-100' : 'bg-card border-border hover:border-primary/50'}
                  ${item.pinned ? 'border-l-4 border-l-yellow-500' : ''}
                `}
              >
                {/* Status Indicator */}
                <div className="shrink-0 pt-0.5">
                  {item.visited ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                {/* UID Link */}
                <div className="flex-1 min-w-0">
                  <a 
                    href={`https://facebook.com/${item.uid}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      if (!item.visited) markVisited(item.id);
                    }}
                    className={`font-mono text-lg truncate block hover:underline ${
                      item.visited ? 'text-muted-foreground' : 'text-foreground font-medium'
                    }`}
                  >
                    {item.uid}
                  </a>
                  {item.password && (
                    <span className="text-xs font-mono text-muted-foreground mt-0.5 block truncate">
                      ***{item.password.slice(-3)}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => handleCopy(item.uid, "Copied UID")}
                    title="Copy UID"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8"
                    disabled={!item.password}
                    onClick={() => item.password && handleCopy(item.password, "Copied Password")}
                    title={item.password ? "Copy Password" : "No password"}
                  >
                    <ShieldAlert className={`h-4 w-4 ${item.password ? 'text-primary' : 'opacity-30'}`} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-8 w-8 ${item.pinned ? 'text-yellow-500' : ''}`}
                    onClick={() => togglePin(item.id, item.pinned)}
                    title={item.pinned ? "Unpin" : "Pin"}
                  >
                    {item.pinned ? <Pin className="h-4 w-4 fill-current" /> : <PinOff className="h-4 w-4" />}
                  </Button>
                  <div className="w-px h-4 bg-border mx-1" />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => deleteId(item.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </Layout>
  );
}
