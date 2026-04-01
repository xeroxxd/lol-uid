import { useAuth } from "@workspace/replit-auth-web";
import { Link, useLocation } from "wouter";
import { LogOut, Shield, Database } from "lucide-react";
import { Button } from "./ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const isAdmin = user?.isAdmin === true;

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground dark">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2 font-bold tracking-tight text-primary">
              <Database className="h-5 w-5" />
              <span>FB ID MGR</span>
            </Link>
            
            {user && (
              <nav className="flex items-center gap-1">
                <Link
                  href="/dashboard"
                  className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                    location === "/dashboard"
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  Dashboard
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                      location === "/admin"
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <Shield className="h-4 w-4" />
                    Admin
                  </Link>
                )}
              </nav>
            )}
          </div>

          {user && (
            <div className="flex items-center gap-4">
              <div className="text-sm flex flex-col items-end">
                <span className="font-medium leading-none">{user.firstName} {user.lastName}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
              <Button variant="outline" size="icon" onClick={() => logout()} title="Logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 container mx-auto p-4 md:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
