import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Database } from "lucide-react";

export default function Login() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background dark text-foreground">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Database className="h-12 w-12 text-primary" />
          <p className="text-muted-foreground font-medium">Loading command center...</p>
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
        
        <div className="pt-4 border-t border-border">
          <Button 
            size="lg" 
            className="w-full text-base font-semibold"
            onClick={() => login()}
          >
            Authenticate
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            Secure access required.
          </p>
        </div>
      </div>
    </div>
  );
}
