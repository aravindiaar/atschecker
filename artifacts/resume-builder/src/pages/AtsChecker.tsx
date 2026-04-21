import React, { useState, useRef, useCallback } from "react";
import { useAtsCheck, useFixResume, AtsCheckResult, ResumeFixResult } from "@workspace/api-client-react";
import { useResume } from "@/store/ResumeContext";
import { useResumeStore } from "@/hooks/useResumeStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle, XCircle, AlertCircle, Sparkles, Loader2,
  Upload, FileText, Wand2, ArrowRight, Check, RotateCcw,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Eye, EyeOff,
} from "lucide-react";

export default function AtsChecker() {
  const { resume } = useResume();
  const { resumeText, filename, hydrated, saveResume, clearResume } = useResumeStore();
  const atsCheck = useAtsCheck();
  const fixResume = useFixResume();

  const [showUploader, setShowUploader] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jobDescription, setJobDescription] = useState("");
  const [analysis, setAnalysis] = useState<AtsCheckResult | null>(null);
  const [fixResult, setFixResult] = useState<ResumeFixResult | null>(null);
  const [reAnalysis, setReAnalysis] = useState<AtsCheckResult | null>(null);
  const [appliedSections, setAppliedSections] = useState<Set<string>>(new Set());

  const [showFixDetails, setShowFixDetails] = useState(true);
  const [showResumePreview, setShowResumePreview] = useState(true);
  const [showFixedPreview, setShowFixedPreview] = useState(true);

  const activeResume = resumeText;
  const hasResume = hydrated && !!activeResume;
  const hasAnalysis = !!analysis;
  const hasFix = !!fixResult;
  const hasReAnalysis = !!reAnalysis;

  const getBuilderResumeText = () => `${resume.name}
${resume.title}
${resume.location} | ${resume.phone} | ${resume.email}

PROFESSIONAL SUMMARY
${resume.summary}

EXPERIENCE
${resume.experience.map((e, i) => `[${i}] ${e.role} at ${e.company} (${e.duration})
${e.bullets.map(b => `• ${b}`).join("\n")}`).join("\n\n")}

SKILLS
${resume.skills}

EDUCATION
${resume.education}`.trim();

  const parseFile = useCallback(async (file: File) => {
    setUploadError(null);
    setIsParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/resume/parse", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Upload failed");
      }
      const data = (await res.json()) as { text: string; filename: string };
      saveResume(data.text, data.filename);
      setShowUploader(false);
      setAnalysis(null);
      setFixResult(null);
      setReAnalysis(null);
      setAppliedSections(new Set());
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setIsParsing(false);
    }
  }, [saveResume]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const useBuilderResume = () => {
    const text = getBuilderResumeText();
    saveResume(text, "Resume Builder");
    setShowUploader(false);
    setAnalysis(null);
    setFixResult(null);
    setReAnalysis(null);
    setAppliedSections(new Set());
  };

  const runAnalysis = (text: string) => {
    atsCheck.mutate(
      { data: { resumeText: text, ...(jobDescription.trim().length > 10 ? { jobDescription } : {}) } },
      { onSuccess: (res) => setAnalysis(res) }
    );
  };

  const onAnalyse = () => {
    if (!activeResume) return;
    setAnalysis(null);
    setFixResult(null);
    setReAnalysis(null);
    setAppliedSections(new Set());
    runAnalysis(activeResume);
  };

  const onFix = () => {
    if (!activeResume || !analysis) return;
    fixResume.mutate(
      {
        data: {
          resumeText: activeResume,
          ...(jobDescription.trim().length > 10 ? { jobDescription } : {}),
          missingKeywords: analysis.missingKeywords,
          suggestions: analysis.suggestions,
        }
      },
      { onSuccess: (res) => { setFixResult(res); setShowFixDetails(true); } }
    );
  };

  const applySection = (key: string) => {
    setAppliedSections(prev => new Set([...prev, key]));
  };

  const onReAnalyse = () => {
    if (!fixResult) return;
    setReAnalysis(null);
    runAnalysis(fixResult.improvedResumeText);
  };

  return (
    <div className="container max-w-4xl py-8 space-y-5">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-1">ATS Checker & Resume Fixer</h1>
        <p className="text-muted-foreground">Upload your resume once, then analyse, fix with AI, and re-analyse to see your score improve.</p>
      </div>

      {/* ── STEP 1: Resume ── */}
      <StepCard
        step={1}
        title="Your Resume"
        done={hasResume && !showUploader}
        summary={hasResume && !showUploader ? (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <FileText className="h-4 w-4 text-primary" />
              <span className="font-medium">{filename}</span>
              <span className="text-muted-foreground">— resume loaded</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowUploader(true)} className="text-xs h-7">
              Change resume
            </Button>
          </div>
        ) : null}
      >
        {(!hasResume || showUploader) && (
          <div className="space-y-4">
            <div
              className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              {isParsing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Parsing resume...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="h-8 w-8 text-muted-foreground/60" />
                  <div>
                    <p className="font-medium">Drop your resume here, or click to browse</p>
                    <p className="text-sm text-muted-foreground mt-0.5">Supports PDF and .txt files · Max 10MB</p>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,text/plain,application/pdf"
                className="hidden"
                onChange={onFileChange}
              />
            </div>

            {uploadError && (
              <p className="text-sm text-red-600 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />{uploadError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <Button variant="outline" className="w-full" onClick={useBuilderResume}>
              <FileText className="mr-2 h-4 w-4" />
              Use resume from Builder
            </Button>
            {showUploader && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowUploader(false)}>
                Cancel
              </Button>
            )}
          </div>
        )}

        {hasResume && !showUploader && (
          <TextPreview
            text={activeResume!}
            label="Extracted resume text"
            show={showResumePreview}
            onToggle={() => setShowResumePreview(v => !v)}
          />
        )}
      </StepCard>

      {/* ── STEP 2: Analyse ── */}
      <StepCard
        step={2}
        title="ATS Analysis"
        locked={!hasResume}
        done={hasAnalysis}
        summary={hasAnalysis ? (
          <div className="flex items-center gap-3 flex-wrap">
            <ScorePill score={analysis!.overallScore} label="Score" />
            <span className="text-sm text-muted-foreground">{analysis!.matchedKeywords.length} keywords matched · {analysis!.missingKeywords.length} missing</span>
            <Button variant="ghost" size="sm" className="text-xs h-7 ml-auto" onClick={onAnalyse} disabled={atsCheck.isPending}>
              <RotateCcw className="h-3 w-3 mr-1" />Re-run
            </Button>
          </div>
        ) : null}
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Job Description <span className="text-muted-foreground font-normal">(optional — leave blank for general ATS scan)</span>
            </label>
            <Textarea
              placeholder="Paste the job description here for a targeted keyword match..."
              className="min-h-[140px] resize-y"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              disabled={!hasResume || atsCheck.isPending}
            />
          </div>
          <Button onClick={onAnalyse} disabled={!hasResume || atsCheck.isPending} className="w-full sm:w-auto">
            {atsCheck.isPending && !hasFix ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analysing...</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" />Analyse Resume</>
            )}
          </Button>

          {analysis && <AtsResults result={analysis} isTargeted={jobDescription.trim().length > 10} />}
        </div>
      </StepCard>

      {/* ── STEP 3: Fix ── */}
      <StepCard
        step={3}
        title="AI Resume Fix"
        locked={!hasAnalysis}
        done={hasFix}
        summary={hasFix ? (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-muted-foreground">{fixResult!.overallChanges.substring(0, 90)}…</span>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowFixDetails(v => !v)}>
              {showFixDetails ? <><ChevronUp className="h-3 w-3 mr-1" />Hide</>  : <><ChevronDown className="h-3 w-3 mr-1" />Show</>}
            </Button>
          </div>
        ) : null}
      >
        {!hasFix ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              AI will rewrite your summary, skills, and experience bullets to improve ATS compatibility — only based on what's already in your resume.
            </p>
            <Button onClick={onFix} disabled={!hasAnalysis || fixResume.isPending} className="w-full sm:w-auto">
              {fixResume.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Rewriting resume...</>
              ) : (
                <><Wand2 className="mr-2 h-4 w-4" />Fix with AI</>
              )}
            </Button>
          </div>
        ) : (
          fixResult && (
            <div className="space-y-3 mt-1">
              {showFixDetails && (
                <>
                  <p className="text-sm text-muted-foreground bg-primary/5 border border-primary/15 rounded-lg p-3">
                    {fixResult.overallChanges}
                  </p>
                  <FixSection label="Professional Summary" before={analysis!.strengths[0] ? resumeText?.substring(0, 400) ?? "" : ""} after={fixResult.improvedSummary} originalText={resumeText ?? ""} sectionKey="summary" applied={appliedSections.has("summary")} onApply={() => applySection("summary")} />
                  <FixSection label="Skills" before="" after={fixResult.improvedSkills} originalText="" sectionKey="skills" applied={appliedSections.has("skills")} onApply={() => applySection("skills")} showBefore={false} />
                  {fixResult.experienceImprovements.map((imp) => (
                    <FixSection
                      key={`exp-${imp.index}`}
                      label={`Experience #${imp.index + 1}`}
                      before=""
                      after={imp.improvedBullets.map(b => `• ${b}`).join("\n")}
                      originalText=""
                      sectionKey={`exp-${imp.index}`}
                      applied={appliedSections.has(`exp-${imp.index}`)}
                      onApply={() => applySection(`exp-${imp.index}`)}
                      showBefore={false}
                    />
                  ))}
                </>
              )}
              <Separator />
              <TextPreview
                text={fixResult.improvedResumeText}
                label="Full improved resume text"
                show={showFixedPreview}
                onToggle={() => setShowFixedPreview(v => !v)}
                accent
              />
            </div>
          )
        )}
      </StepCard>

      {/* ── STEP 4: Re-Analyse ── */}
      <StepCard
        step={4}
        title="Re-Analyse"
        locked={!hasFix}
        done={hasReAnalysis}
        summary={hasReAnalysis ? (
          <div className="flex items-center gap-3 flex-wrap">
            <ScorePill score={reAnalysis!.overallScore} label="New Score" />
            <ScoreDelta before={analysis!.overallScore} after={reAnalysis!.overallScore} />
          </div>
        ) : null}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Run ATS analysis again on the AI-improved version to see your score improvement.
          </p>
          <Button onClick={onReAnalyse} disabled={!hasFix || atsCheck.isPending} className="w-full sm:w-auto">
            {atsCheck.isPending && hasFix ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analysing...</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" />Analyse Again</>
            )}
          </Button>

          {reAnalysis && analysis && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 rounded-xl bg-muted/40 border">
                  <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Original</p>
                  <p className={`text-4xl font-bold ${scoreColor(analysis.overallScore)}`}>{analysis.overallScore}</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <p className="text-xs text-primary mb-1 uppercase tracking-wide font-medium">After Fix</p>
                  <p className={`text-4xl font-bold ${scoreColor(reAnalysis.overallScore)}`}>{reAnalysis.overallScore}</p>
                  <ScoreDelta before={analysis.overallScore} after={reAnalysis.overallScore} className="justify-center mt-1" />
                </div>
              </div>
              <AtsResults result={reAnalysis} isTargeted={jobDescription.trim().length > 10} />
            </div>
          )}
        </div>
      </StepCard>
    </div>
  );
}

function StepCard({ step, title, locked, done, summary, children }: {
  step: number;
  title: string;
  locked?: boolean;
  done?: boolean;
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className={`transition-opacity ${locked ? "opacity-50 pointer-events-none" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${done ? "bg-green-500 text-white" : "bg-primary text-primary-foreground"}`}>
            {done ? <Check className="h-4 w-4" /> : step}
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            {done && summary && <div className="mt-1.5">{summary}</div>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {children}
      </CardContent>
    </Card>
  );
}

function AtsResults({ result, isTargeted }: { result: AtsCheckResult; isTargeted: boolean }) {
  return (
    <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-muted/30 rounded-xl border">
        <div className="relative flex items-center justify-center flex-shrink-0">
          <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="38" className="stroke-muted fill-none" strokeWidth="10" />
            <circle
              cx="48" cy="48" r="38"
              className={`fill-none transition-all duration-700 ${scoreStroke(result.overallScore)}`}
              strokeWidth="10"
              strokeDasharray={`${(result.overallScore / 100) * 238.8} 238.8`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute text-center">
            <span className={`text-2xl font-bold ${scoreColor(result.overallScore)}`}>{result.overallScore}</span>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Overall</p>
          </div>
        </div>
        <div className="flex-1 w-full space-y-2.5">
          {[
            { label: "Keyword Match", value: result.keywordScore },
            { label: "Experience", value: result.experienceScore },
            { label: "Format & Structure", value: result.formatScore },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="flex justify-between mb-1 text-xs font-medium">
                <span>{label}</span>
                <span className={scoreColor(value)}>{value}%</span>
              </div>
              <Progress value={value} className="h-1.5" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/20">
          <p className="text-xs font-semibold text-green-700 dark:text-green-400 flex items-center gap-1 mb-2">
            <CheckCircle className="h-3.5 w-3.5" />{isTargeted ? "Matched Keywords" : "Skills Found"}
          </p>
          <div className="flex flex-wrap gap-1">
            {result.matchedKeywords.slice(0, 12).map((kw, i) => (
              <Badge key={i} variant="secondary" className="text-[11px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-none">{kw}</Badge>
            ))}
            {result.matchedKeywords.length > 12 && <span className="text-xs text-muted-foreground">+{result.matchedKeywords.length - 12} more</span>}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1 mb-2">
            <XCircle className="h-3.5 w-3.5" />{isTargeted ? "Missing Keywords" : "Skills to Add"}
          </p>
          <div className="flex flex-wrap gap-1">
            {result.missingKeywords.slice(0, 12).map((kw, i) => (
              <Badge key={i} variant="outline" className="text-[11px] text-red-600 border-red-200 bg-transparent">{kw}</Badge>
            ))}
            {result.missingKeywords.length === 0 && <span className="text-xs text-muted-foreground">None — great!</span>}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Strengths</p>
          <ul className="space-y-1">
            {result.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="text-green-500 mt-0.5 flex-shrink-0">•</span>{s}
              </li>
            ))}
          </ul>
        </div>
        <Separator />
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            <AlertCircle className="inline h-3.5 w-3.5 mr-1 text-amber-500" />Suggestions
          </p>
          <ul className="space-y-1.5">
            {result.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground bg-amber-50/50 dark:bg-amber-900/10 px-3 py-2 rounded-md">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">•</span>{s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FixSection({ label, after, sectionKey, applied, onApply, showBefore = true, before, originalText }: {
  label: string;
  before: string;
  after: string;
  originalText: string;
  sectionKey: string;
  applied: boolean;
  onApply: () => void;
  showBefore?: boolean;
}) {
  void before; void originalText; void sectionKey;
  return (
    <div className={`rounded-lg border p-3 ${applied ? "border-green-400/50 bg-green-50/30 dark:bg-green-900/10" : "border-border"}`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <Button size="sm" variant={applied ? "outline" : "default"} onClick={onApply} disabled={applied}
          className={`text-xs h-7 ${applied ? "text-green-600 border-green-400" : ""}`}>
          {applied ? <><Check className="h-3 w-3 mr-1" />Applied</> : <><ArrowRight className="h-3 w-3 mr-1" />Apply</>}
        </Button>
      </div>
      <div className={showBefore ? "grid grid-cols-2 gap-2 text-xs" : ""}>
        <div className="bg-primary/5 border border-primary/20 rounded p-2.5 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
          {after}
        </div>
      </div>
    </div>
  );
}

function TextPreview({ text, label, show, onToggle, accent = false }: {
  text: string;
  label: string;
  show: boolean;
  onToggle: () => void;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-lg border ${accent ? "border-primary/25 bg-primary/5" : "border-border bg-muted/20"}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/30 transition-colors rounded-lg"
      >
        <span className={`flex items-center gap-2 text-sm font-medium ${accent ? "text-primary" : "text-foreground"}`}>
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {label}
          <span className="text-xs font-normal text-muted-foreground">({text.split("\n").length} lines)</span>
        </span>
        {show ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {show && (
        <div className="px-3 pb-3">
          <pre className={`text-xs leading-relaxed whitespace-pre-wrap font-mono max-h-72 overflow-y-auto rounded-md p-3 border ${accent ? "bg-white dark:bg-background border-primary/15 text-foreground" : "bg-background border-border text-muted-foreground"}`}>
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}

function ScorePill({ score, label }: { score: number; label: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-sm font-semibold border ${score >= 80 ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400" : score >= 60 ? "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400" : "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400"}`}>
      {label}: {score}
    </div>
  );
}

function ScoreDelta({ before, after, className = "" }: { before: number; after: number; className?: string }) {
  const delta = after - before;
  if (delta === 0) return <span className={`flex items-center gap-1 text-xs text-muted-foreground ${className}`}><Minus className="h-3 w-3" />No change</span>;
  const positive = delta > 0;
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${positive ? "text-green-600" : "text-red-600"} ${className}`}>
      {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {positive ? "+" : ""}{delta} points
    </span>
  );
}

function scoreColor(s: number) {
  return s >= 80 ? "text-green-500" : s >= 60 ? "text-yellow-500" : "text-red-500";
}
function scoreStroke(s: number) {
  return s >= 80 ? "stroke-green-500" : s >= 60 ? "stroke-yellow-500" : "stroke-red-500";
}
