import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAtsCheck, useFixResume, AtsCheckResult, ResumeFixResult } from "@workspace/api-client-react";
import { useResume } from "@/store/ResumeContext";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, AlertCircle, Sparkles, Loader2, FileCheck, Wand2, ArrowRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const formSchema = z.object({
  jobDescription: z.string().optional(),
});

export default function AtsChecker() {
  const { resume, updateResume, updateExperience } = useResume();
  const atsCheck = useAtsCheck();
  const fixResume = useFixResume();
  const [result, setResult] = useState<AtsCheckResult | null>(null);
  const [fixResult, setFixResult] = useState<ResumeFixResult | null>(null);
  const [isTargeted, setIsTargeted] = useState(false);
  const [lastJD, setLastJD] = useState<string | undefined>(undefined);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { jobDescription: "" },
  });

  const getResumeText = () => {
    return `
${resume.name}
${resume.title}
${resume.location} | ${resume.phone} | ${resume.email}

SUMMARY
${resume.summary}

EXPERIENCE
${resume.experience.map((e, i) => `[${i}] ${e.role} at ${e.company} (${e.duration})\n${e.bullets.join("\n")}`).join("\n\n")}

PROJECTS
${resume.projects}

SKILLS
${resume.skills}

EDUCATION
${resume.education}
    `.trim();
  };

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    const hasJD = !!(data.jobDescription && data.jobDescription.trim().length > 10);
    setIsTargeted(hasJD);
    setLastJD(hasJD ? data.jobDescription : undefined);
    setFixResult(null);
    setApplied(new Set());
    atsCheck.mutate(
      {
        data: {
          resumeText: getResumeText(),
          ...(hasJD ? { jobDescription: data.jobDescription } : {}),
        }
      },
      { onSuccess: (res) => setResult(res) }
    );
  };

  const onFixResume = () => {
    if (!result) return;
    fixResume.mutate(
      {
        data: {
          resumeText: getResumeText(),
          ...(lastJD ? { jobDescription: lastJD } : {}),
          missingKeywords: result.missingKeywords,
          suggestions: result.suggestions,
        }
      },
      { onSuccess: (res) => setFixResult(res) }
    );
  };

  const applyFix = (key: string) => {
    if (!fixResult) return;

    if (key === "summary") {
      updateResume({ summary: fixResult.improvedSummary });
    } else if (key === "skills") {
      updateResume({ skills: fixResult.improvedSkills });
    } else if (key.startsWith("exp-")) {
      const idx = parseInt(key.replace("exp-", ""), 10);
      const improvement = fixResult.experienceImprovements.find((e) => e.index === idx);
      if (improvement && resume.experience[idx]) {
        updateExperience(resume.experience[idx].id, { bullets: improvement.improvedBullets });
      }
    }

    setApplied((prev) => new Set([...prev, key]));
  };

  const applyAll = () => {
    if (!fixResult) return;
    const keys = ["summary", "skills", ...fixResult.experienceImprovements.map((e) => `exp-${e.index}`)];
    keys.forEach(applyFix);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getScoreStroke = (score: number) => {
    if (score >= 80) return "stroke-green-500";
    if (score >= 60) return "stroke-yellow-500";
    return "stroke-red-500";
  };

  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">ATS Compatibility Checker</h1>
        <p className="text-muted-foreground">
          Run a general ATS check on your resume, or paste a job description for a targeted keyword match. Use AI to automatically improve your resume based on the findings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Job Description</CardTitle>
              <CardDescription>Optional — paste a job posting for a targeted match, or leave blank for a general ATS scan.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="jobDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            placeholder="Paste job description here (optional)..."
                            className="min-h-[260px] resize-y"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={atsCheck.isPending}>
                    {atsCheck.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing...</>
                    ) : (
                      <><Sparkles className="mr-2 h-4 w-4" />Run ATS Analysis</>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {result && !atsCheck.isPending && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  AI Resume Fix
                </CardTitle>
                <CardDescription>
                  Let AI automatically rewrite your summary, skills, and experience bullets to address the ATS findings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={onFixResume}
                  disabled={fixResume.isPending}
                >
                  {fixResume.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Rewriting...</>
                  ) : (
                    <><Wand2 className="mr-2 h-4 w-4" />Fix Resume with AI</>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {!result && !atsCheck.isPending && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-12 text-center text-muted-foreground">
              <FileCheck className="h-12 w-12 mb-4 opacity-30" />
              <h3 className="text-lg font-medium text-foreground mb-1">Ready for analysis</h3>
              <p>Click "Run ATS Analysis" to get your score. Optionally paste a job description for a targeted keyword match.</p>
            </div>
          )}

          {atsCheck.isPending && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center border rounded-lg p-12 text-center bg-muted/10">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <h3 className="text-lg font-medium">Scanning against ATS criteria...</h3>
              <p className="text-muted-foreground text-sm mt-2">Checking keywords, experience, and format compatibility.</p>
            </div>
          )}

          {result && !atsCheck.isPending && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-6 flex flex-col md:flex-row items-center gap-6">
                  <div className="relative flex items-center justify-center flex-shrink-0">
                    <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 128 128">
                      <circle cx="64" cy="64" r="52" className="stroke-muted fill-none" strokeWidth="12" />
                      <circle
                        cx="64" cy="64" r="52"
                        className={`${getScoreStroke(result.overallScore)} fill-none transition-all duration-1000 ease-out`}
                        strokeWidth="12"
                        strokeDasharray={`${(result.overallScore / 100) * 326} 326`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className={`text-3xl font-bold ${getScoreColor(result.overallScore)}`}>{result.overallScore}</span>
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Overall</span>
                    </div>
                  </div>
                  <div className="flex-1 w-full space-y-3">
                    {[
                      { label: "Keyword Match", value: result.keywordScore },
                      { label: "Experience Relevance", value: result.experienceScore },
                      { label: "Format & Structure", value: result.formatScore },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div className="flex justify-between mb-1 text-sm font-medium">
                          <span>{label}</span>
                          <span className={getScoreColor(value)}>{value}%</span>
                        </div>
                        <Progress value={value} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center text-green-600">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {isTargeted ? "Matched Keywords" : "Skills Found"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {result.matchedKeywords.length > 0 ? (
                        result.matchedKeywords.map((kw, i) => (
                          <Badge key={i} variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 border-none text-xs">
                            {kw}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">No matching keywords found.</span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center text-red-600">
                      <XCircle className="w-4 h-4 mr-2" />
                      {isTargeted ? "Missing Keywords" : "Skills to Consider Adding"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {result.missingKeywords.length > 0 ? (
                        result.missingKeywords.map((kw, i) => (
                          <Badge key={i} variant="outline" className="text-red-600 border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30 text-xs">
                            {kw}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">Excellent — no missing keywords.</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Detailed Feedback</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <h4 className="font-semibold text-sm flex items-center mb-3">
                      <Sparkles className="w-4 h-4 mr-2 text-primary" />
                      Strengths
                    </h4>
                    <ul className="space-y-1.5">
                      {result.strengths.map((str, i) => (
                        <li key={i} className="flex items-start text-sm text-muted-foreground">
                          <span className="mr-2 text-green-500 mt-0.5">•</span>
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="font-semibold text-sm flex items-center mb-3 text-amber-600">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Areas for Improvement
                    </h4>
                    <ul className="space-y-2">
                      {result.suggestions.map((sug, i) => (
                        <li key={i} className="flex items-start text-sm text-muted-foreground bg-amber-50/60 dark:bg-amber-900/10 p-2.5 rounded-md">
                          <span className="mr-2 text-amber-500 mt-0.5 flex-shrink-0">•</span>
                          <span>{sug}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {fixResume.isPending && (
            <Card className="border-primary/30">
              <CardContent className="p-8 flex flex-col items-center text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                <h3 className="font-semibold text-lg mb-1">AI is rewriting your resume...</h3>
                <p className="text-sm text-muted-foreground">Improving your summary, skills, and experience bullets based on the ATS findings.</p>
              </CardContent>
            </Card>
          )}

          {fixResult && !fixResume.isPending && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Wand2 className="h-5 w-5 text-primary" />
                        AI Improvements Ready
                      </CardTitle>
                      <CardDescription className="mt-1">{fixResult.overallChanges}</CardDescription>
                    </div>
                    <Button
                      size="sm"
                      onClick={applyAll}
                      disabled={applied.size === (2 + fixResult.experienceImprovements.length)}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Apply All Changes
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              <FixSection
                label="Professional Summary"
                fixKey="summary"
                before={resume.summary}
                after={fixResult.improvedSummary}
                applied={applied.has("summary")}
                onApply={() => applyFix("summary")}
              />

              <FixSection
                label="Skills"
                fixKey="skills"
                before={resume.skills}
                after={fixResult.improvedSkills}
                applied={applied.has("skills")}
                onApply={() => applyFix("skills")}
              />

              {fixResult.experienceImprovements.map((imp) => {
                const exp = resume.experience[imp.index];
                if (!exp) return null;
                const key = `exp-${imp.index}`;
                return (
                  <FixSection
                    key={key}
                    label={`Experience: ${exp.role} at ${exp.company}`}
                    fixKey={key}
                    before={exp.bullets.join("\n")}
                    after={imp.improvedBullets.join("\n")}
                    applied={applied.has(key)}
                    onApply={() => applyFix(key)}
                    isBullets
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FixSection({
  label,
  before,
  after,
  applied,
  onApply,
  isBullets,
}: {
  label: string;
  fixKey: string;
  before: string;
  after: string;
  applied: boolean;
  onApply: () => void;
  isBullets?: boolean;
}) {
  return (
    <Card className={applied ? "border-green-400/50 bg-green-50/30 dark:bg-green-900/10" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold">{label}</CardTitle>
          <Button
            size="sm"
            variant={applied ? "outline" : "default"}
            onClick={onApply}
            disabled={applied}
            className={applied ? "text-green-600 border-green-400" : ""}
          >
            {applied ? (
              <><Check className="mr-1.5 h-3.5 w-3.5" />Applied</>
            ) : (
              <><ArrowRight className="mr-1.5 h-3.5 w-3.5" />Apply</>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground font-medium mb-1.5 uppercase tracking-wide text-[10px]">Before</p>
            <div className="bg-muted/50 rounded p-2.5 text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {isBullets
                ? before.split("\n").map((b, i) => <div key={i} className="mb-0.5">• {b.replace(/^[-•*]\s*/, "")}</div>)
                : before}
            </div>
          </div>
          <div>
            <p className="text-primary font-medium mb-1.5 uppercase tracking-wide text-[10px]">After (AI Improved)</p>
            <div className="bg-primary/5 border border-primary/20 rounded p-2.5 leading-relaxed whitespace-pre-wrap">
              {isBullets
                ? after.split("\n").map((b, i) => <div key={i} className="mb-0.5">• {b.replace(/^[-•*]\s*/, "")}</div>)
                : after}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
