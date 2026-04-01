import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ShieldAlert, Database, User, ArrowLeft
} from "lucide-react";
import {
  useAdminListUsers,
  useAdminGetUserIds,
  getAdminListUsersQueryKey,
  getAdminGetUserIdsQueryKey
} from "@workspace/api-client-react";

export default function Admin() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const isAdmin = user?.isAdmin === true;

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdmin)) {
      setLocation("/dashboard"); // fallback or redirect
    }
  }, [authLoading, isAuthenticated, isAdmin, setLocation]);

  const { data, isLoading, isError, error } = useAdminListUsers({
    query: {
      enabled: isAdmin && !selectedUserId,
      queryKey: getAdminListUsersQueryKey()
    }
  });

  if (authLoading || !isAuthenticated || !isAdmin) return null;

  if (isError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center p-12 text-center border border-destructive/20 bg-destructive/5 rounded-xl text-destructive mt-8">
          <ShieldAlert className="h-12 w-12 mb-4" />
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="opacity-80">
            {error instanceof Error ? error.message : "You do not have permission to view this page."}
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <ShieldAlert className="h-8 w-8 text-primary" />
              Admin Control
            </h1>
            <p className="text-muted-foreground mt-1">System overview and user management.</p>
          </div>
          {selectedUserId && (
            <Button variant="outline" onClick={() => setSelectedUserId(null)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Users
            </Button>
          )}
        </div>

        {!selectedUserId ? (
          <>
            {/* Global Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-card border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{isLoading ? "-" : data?.totalUsers}</div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Global IDs Tracking</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-primary">{isLoading ? "-" : data?.totalIds}</div>
                </CardContent>
              </Card>
            </div>

            {/* Users List */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20">
                <h3 className="font-semibold">Registered Users</h3>
              </div>
              <div className="divide-y divide-border">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground animate-pulse">Loading users...</div>
                ) : !data?.users?.length ? (
                  <div className="p-8 text-center text-muted-foreground">No users found.</div>
                ) : (
                  data.users.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                          <User className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">
                            {u.firstName} {u.lastName} {u.id === user.id && <span className="text-xs text-primary ml-2">(You)</span>}
                          </div>
                          <div className="text-sm text-muted-foreground">{u.email || u.id}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="font-mono text-lg font-semibold">{u.totalIds}</div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wider">Total IDs</div>
                        </div>
                        <div className="text-right hidden sm:block">
                          <div className="font-mono text-lg font-semibold text-emerald-500">{u.visitedIds}</div>
                          <div className="text-xs text-muted-foreground uppercase tracking-wider">Visited</div>
                        </div>
                        <Button variant="secondary" onClick={() => setSelectedUserId(u.id)}>
                          View IDs
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <AdminUserDetail userId={selectedUserId} />
        )}
      </div>
    </Layout>
  );
}

function AdminUserDetail({ userId }: { userId: string }) {
  const { data, isLoading, isError } = useAdminGetUserIds(userId, {
    query: {
      enabled: !!userId,
      queryKey: getAdminGetUserIdsQueryKey(userId),
    }
  });

  if (isLoading) {
    return <div className="p-12 text-center text-muted-foreground animate-pulse border border-border rounded-xl bg-card">Loading user data...</div>;
  }

  if (isError || !data) {
    return <div className="p-12 text-center text-destructive border border-border rounded-xl bg-card">Failed to load user data.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-muted/20 border border-border rounded-xl mb-6">
        <Database className="h-5 w-5 text-primary" />
        <span className="font-medium">Viewing {data.items.length} items for user {userId}</span>
      </div>

      {!data.items.length ? (
        <div className="p-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
          User has no IDs.
        </div>
      ) : (
        <div className="space-y-2">
          {data.items.map(item => (
            <div key={item.id} className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
              <div className="flex items-center gap-3">
                <span className={`font-mono ${item.visited ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {item.uid}
                </span>
                {item.pinned && <span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded">Pinned</span>}
                {item.visited && <span className="text-xs bg-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded">Visited</span>}
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
