import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Database, Eye, EyeOff, Loader2 } from "lucide-react";

export default function Login() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setError("");
    setSubmitting(true);
    const result = await login(password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Invalid password");
      setPassword("");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background dark text-foreground">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Database className="h-12 w-12 text-primary" />
          <p className="text-muted-foreground font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background dark p-4">
      <div className="max-w-sm w-full space-y-8 text-center">
        <div className="space-y-4">
          <div className="bg-primary/10 p-4 rounded-2xl inline-flex mb-2">
            <Database className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">FB ID Manager</h1>
          <p className="text-muted-foreground text-lg">
            High-density account tracking and management dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="pt-4 border-t border-border space-y-3">
          <div className="relative">
            <Input
              type={showPass ? "text" : "password"}
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10 text-center font-mono text-base bg-background border-border focus-visible:ring-primary"
              autoFocus
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <p className="text-sm text-destructive font-medium">{error}</p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full text-base font-semibold"
            disabled={!password.trim() || submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? "Checking..." : "Enter"}
          </Button>
        </form>
      </div>
    </div>
  );
}
