import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { FileCheck, Eye, BarChart2, Wand2, Upload } from "lucide-react";

interface Stats {
  totalVisits: number;
  totalAnalyses: number;
  totalFixes: number;
  totalUploads: number;
}

function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats/visit", { method: "POST" }).catch(() => {});
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  return stats;
}

function StatItem({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={label}>
      <span className="text-primary/70">{icon}</span>
      <span className="font-semibold tabular-nums text-foreground">{value.toLocaleString()}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const stats = useStats();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center px-4">
          <div className="mr-4 flex flex-1 items-center">
            <Link href="/" className="mr-6 flex items-center space-x-2">
              <span className="font-bold tracking-tight text-primary">ResumePro</span>
            </Link>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              <Link
                href="/"
                className={`transition-colors hover:text-foreground/80 ${
                  location === "/" ? "text-foreground" : "text-foreground/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4" />
                  <span>ATS Checker</span>
                </div>
              </Link>
            </nav>
          </div>

          {stats && (
            <div className="flex items-center gap-4 border-l pl-4">
              <StatItem icon={<Eye className="h-3.5 w-3.5" />} value={stats.totalVisits} label="visits" />
              <StatItem icon={<BarChart2 className="h-3.5 w-3.5" />} value={stats.totalAnalyses} label="analyses" />
              <StatItem icon={<Wand2 className="h-3.5 w-3.5" />} value={stats.totalFixes} label="AI fixes" />
              <StatItem icon={<Upload className="h-3.5 w-3.5" />} value={stats.totalUploads} label="uploads" />
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
