import React from "react";
import { ResumeEditor } from "@/components/ResumeEditor";
import { ResumePreview } from "@/components/ResumePreview";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { FileCheck, Download } from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";

export default function Home() {
  const { data: health } = useHealthCheck();

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Editor Panel */}
      <div className="w-1/2 border-r bg-muted/20 overflow-y-auto custom-scrollbar">
        <div className="p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Resume Builder</h1>
              <p className="text-muted-foreground text-sm">Edit your resume details below.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/ats-checker" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2">
                <FileCheck className="mr-2 h-4 w-4" />
                Check ATS Score
              </Link>
            </div>
          </div>
          <ResumeEditor />
        </div>
      </div>

      {/* Preview Panel */}
      <div className="w-1/2 bg-gray-100 overflow-y-auto p-8 flex justify-center custom-scrollbar">
        <div className="max-w-[800px] w-full">
          <ResumePreview />
        </div>
      </div>
    </div>
  );
}
