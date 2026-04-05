import { SunMoonAnimation } from "@/components/SunMoonAnimation";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function AnimationDemo() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Full-screen animation */}
      <SunMoonAnimation className="flex-1 min-h-screen" />

      {/* Back button overlay */}
      <button
        onClick={() => navigate("/")}
        className="fixed top-4 left-4 z-50 flex items-center gap-2 bg-black/30 backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-black/50 transition"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      {/* Label */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-center">
        <p className="text-white/60 text-xs font-mono tracking-widest uppercase">
          Newton's Sun & Moon
        </p>
      </div>
    </div>
  );
}
