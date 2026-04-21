import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAtsCheck, AtsCheckResult } from "@workspace/api-client-react";
import { useResume } from "@/store/ResumeContext";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, AlertCircle, Sparkles, Loader2, FileCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  jobDescription: z.string().min(10, "Job description is required for analysis"),
});

export default function AtsChecker() {
  const { resume } = useResume();
  const atsCheck = useAtsCheck();
  const [result, setResult] = useState<AtsCheckResult | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jobDescription: "",
    },
  });

  const getResumeText = () => {
    // Basic serialization for ATS check
    return `
${resume.name}
${resume.title}
${resume.location} | ${resume.phone} | ${resume.email}

SUMMARY
${resume.summary}

EXPERIENCE
${resume.experience.map(e => `${e.role} at ${e.company} (${e.duration})\n${e.bullets.join("\n")}`).join("\n\n")}

PROJECTS
${resume.projects}

SKILLS
${resume.skills}

EDUCATION
${resume.education}
    `;
  };

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    atsCheck.mutate(
      {
        data: {
          resumeText: getResumeText(),
          jobDescription: data.jobDescription,
        }
      },
      {
        onSuccess: (res) => {
          setResult(res);
        }
      }
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="container max-w-6xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">ATS Compatibility Checker</h1>
        <p className="text-muted-foreground">
          See how well your resume matches a specific job description. Our AI analyzes keywords, experience, and format to give you a detailed score and actionable feedback.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Job Description</CardTitle>
              <CardDescription>Paste the job posting you want to apply for.</CardDescription>
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
                            placeholder="Paste job description here..."
                            className="min-h-[300px] resize-y"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={atsCheck.isPending}
                  >
                    {atsCheck.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Run ATS Analysis
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {!result && !atsCheck.isPending && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-12 text-center text-muted-foreground">
              <FileCheck className="h-12 w-12 mb-4 text-muted" />
              <h3 className="text-lg font-medium text-foreground mb-1">Ready for analysis</h3>
              <p>Paste a job description and click analyze to see your score.</p>
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
              {/* Score Overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="col-span-2 md:col-span-4 bg-primary/5 border-primary/20">
                  <CardContent className="p-6 flex flex-col md:flex-row items-center gap-6">
                    <div className="relative flex items-center justify-center">
                      <svg className="w-32 h-32 transform -rotate-90">
                        <circle cx="64" cy="64" r="56" className="stroke-muted fill-none" strokeWidth="12" />
                        <circle 
                          cx="64" cy="64" r="56" 
                          className="stroke-primary fill-none transition-all duration-1000 ease-out" 
                          strokeWidth="12" 
                          strokeDasharray={`${(result.overallScore / 100) * 351} 351`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className={`text-4xl font-bold ${getScoreColor(result.overallScore)}`}>{result.overallScore}</span>
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">Overall</span>
                      </div>
                    </div>
                    <div className="flex-1 w-full space-y-4">
                      <div>
                        <div className="flex justify-between mb-1 text-sm font-medium">
                          <span>Keyword Match</span>
                          <span className={getScoreColor(result.keywordScore)}>{result.keywordScore}%</span>
                        </div>
                        <Progress value={result.keywordScore} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1 text-sm font-medium">
                          <span>Experience Relevance</span>
                          <span className={getScoreColor(result.experienceScore)}>{result.experienceScore}%</span>
                        </div>
                        <Progress value={result.experienceScore} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1 text-sm font-medium">
                          <span>Format & Structure</span>
                          <span className={getScoreColor(result.formatScore)}>{result.formatScore}%</span>
                        </div>
                        <Progress value={result.formatScore} className="h-2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Keywords */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center text-green-600">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Matched Keywords
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {result.matchedKeywords.length > 0 ? (
                        result.matchedKeywords.map((kw, i) => (
                          <Badge key={i} variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 border-none">
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
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center text-red-600">
                      <XCircle className="w-4 h-4 mr-2" />
                      Missing Keywords
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {result.missingKeywords.length > 0 ? (
                        result.missingKeywords.map((kw, i) => (
                          <Badge key={i} variant="outline" className="text-red-600 border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30">
                            {kw}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">Excellent! No missing keywords found.</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Feedback */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Detailed Feedback</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h4 className="font-semibold text-sm flex items-center mb-3">
                      <Sparkles className="w-4 h-4 mr-2 text-primary" />
                      Strengths
                    </h4>
                    <ul className="space-y-2">
                      {result.strengths.map((str, i) => (
                        <li key={i} className="flex items-start text-sm text-muted-foreground">
                          <span className="mr-2 text-green-500 mt-0.5">•</span>
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-semibold text-sm flex items-center mb-3 text-amber-600">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Areas for Improvement
                    </h4>
                    <ul className="space-y-3">
                      {result.suggestions.map((sug, i) => (
                        <li key={i} className="flex items-start text-sm text-muted-foreground bg-amber-50/50 dark:bg-amber-900/10 p-3 rounded-md">
                          <span className="mr-2 text-amber-500 mt-0.5">•</span>
                          <span>{sug}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
