import { Router } from "express";
import { AtsCheckBody, AtsCheckResponse, GetResumeTemplatesResponse } from "@workspace/api-zod";

const router = Router();

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "from", "as", "is", "was", "are", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "may", "might", "shall", "can",
  "not", "no", "nor", "so", "yet", "both", "either", "neither", "each", "few", "more", "most",
  "other", "some", "such", "than", "too", "very", "just", "we", "you", "they", "it", "this",
  "that", "these", "those", "i", "he", "she", "our", "your", "their", "its", "my", "his", "her",
  "all", "any", "both", "if", "then", "than", "when", "where", "why", "how", "what", "which",
  "who", "whom", "use", "used", "using", "also", "well", "new", "work", "within", "across",
  "ensure", "including", "strong", "ability", "experience", "year", "years", "role", "roles",
  "team", "teams", "business", "company", "environment", "environments", "system", "systems",
  "solution", "solutions", "support", "working", "responsible",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9#+.\-/\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function extractKeyPhrases(text: string): Set<string> {
  const words = tokenize(text);
  const phrases = new Set<string>();

  for (const word of words) {
    phrases.add(word);
  }

  const lowerText = text.toLowerCase();
  const multiWordPatterns = [
    /c#/g, /\.net(?: core)?/g, /asp\.net(?: web api)?/g, /node\.js/g,
    /rest(?:ful)?(?: api[s]?)?/g, /ci\/cd/g, /azure devops/g,
    /machine learning/g, /natural language processing/g, /nlp/g,
    /deep learning/g, /data science/g, /software engineer/g,
    /backend developer/g, /frontend developer/g, /full.?stack/g,
    /microservices architecture/g, /api gateway/g, /sql server/g,
    /postgresql/g, /docker/g, /kubernetes/g, /jenkins/g, /devops/g,
    /unit test/g, /integration test/g, /agile/g, /scrum/g,
    /version control/g, /source control/g, /role.based access/g,
    /jwt/g, /oauth/g, /entity framework/g, /linq/g, /typescript/g,
    /javascript/g, /python/g, /powershell/g, /git/g, /redis/g,
    /mongodb/g, /elasticsearch/g, /message queue/g, /rabbitmq/g,
    /azure/g, /aws/g, /gcp/g, /cloud/g, /serverless/g,
    /vector database/g, /rag/g, /llm/g, /openai/g, /generative ai/g,
    /performance tuning/g, /database migration/g, /etl/g,
    /wpf/g, /mvc/g, /signalr/g, /grpc/g, /graphql/g,
  ];

  for (const pattern of multiWordPatterns) {
    const matches = lowerText.match(pattern);
    if (matches) {
      for (const m of matches) {
        phrases.add(m.trim());
      }
    }
  }

  return phrases;
}

function scoreFormat(resumeText: string): number {
  let score = 60;

  const hasContactInfo = /\b[\w.-]+@[\w.-]+\.\w+\b/.test(resumeText) || /\+?\d[\d\s-]{7,}/.test(resumeText);
  if (hasContactInfo) score += 10;

  const hasSections = ["experience", "education", "skills", "projects", "summary"].filter((s) =>
    resumeText.toLowerCase().includes(s)
  ).length;
  score += Math.min(hasSections * 4, 20);

  const bulletCount = (resumeText.match(/[-•*]\s+\w/g) || []).length;
  if (bulletCount > 5) score += 10;

  return Math.min(score, 100);
}

function scoreExperience(resumeText: string, jobText: string): number {
  let score = 50;
  const resume = resumeText.toLowerCase();
  const job = jobText.toLowerCase();

  const yearsMatch = job.match(/(\d+)\+?\s*years?/);
  if (yearsMatch) {
    const required = parseInt(yearsMatch[1], 10);
    const resumeYears = resume.match(/(\d+)\+?\s*years?/);
    if (resumeYears) {
      const actual = parseInt(resumeYears[1], 10);
      if (actual >= required) score += 30;
      else if (actual >= required - 2) score += 15;
    }
  } else {
    score += 20;
  }

  const seniorTerms = ["senior", "lead", "principal", "architect", "manager"];
  const jobNeedsSenior = seniorTerms.some((t) => job.includes(t));
  const resumeHasSenior = seniorTerms.some((t) => resume.includes(t));
  if (jobNeedsSenior && resumeHasSenior) score += 20;
  else if (!jobNeedsSenior) score += 10;

  return Math.min(score, 100);
}

const RESUME_TEMPLATES = [
  { id: "professional", name: "Professional", description: "Clean, classic layout ideal for corporate roles" },
  { id: "technical", name: "Technical", description: "Skills-forward layout for engineering and tech roles" },
  { id: "modern", name: "Modern", description: "Contemporary design with a bold header section" },
];

router.post("/resume/ats-check", async (req, res): Promise<void> => {
  const parsed = AtsCheckBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid ATS check request");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { resumeText, jobDescription } = parsed.data;

  const resumeKeywords = extractKeyPhrases(resumeText);
  const jobKeywords = extractKeyPhrases(jobDescription);

  const matched: string[] = [];
  const missing: string[] = [];

  for (const keyword of jobKeywords) {
    if (keyword.length < 3) continue;
    const found = resumeText.toLowerCase().includes(keyword.toLowerCase());
    if (found) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  }

  const uniqueMatched = [...new Set(matched)].slice(0, 30);
  const uniqueMissing = [...new Set(missing)]
    .filter((k) => !STOP_WORDS.has(k) && k.length > 2)
    .slice(0, 20);

  const keywordScore = jobKeywords.size > 0
    ? Math.round((uniqueMatched.length / Math.min(jobKeywords.size, uniqueMatched.length + uniqueMissing.length)) * 100)
    : 70;

  const formatScore = scoreFormat(resumeText);
  const experienceScore = scoreExperience(resumeText, jobDescription);
  const overallScore = Math.round(keywordScore * 0.5 + formatScore * 0.25 + experienceScore * 0.25);

  const suggestions: string[] = [];

  if (uniqueMissing.length > 0) {
    suggestions.push(
      `Add these missing keywords to your resume: ${uniqueMissing.slice(0, 5).join(", ")}`
    );
  }
  if (keywordScore < 60) {
    suggestions.push("Tailor your summary and skills section to include more keywords from the job description.");
  }
  if (!(/(quantif|measur|\d+%|\d+x|\$\d)/i.test(resumeText))) {
    suggestions.push("Quantify your achievements with numbers (e.g., 'reduced latency by 40%', 'managed team of 5').");
  }
  if (!/action|led|built|designed|implemented|developed|delivered|improved|optimized/i.test(resumeText)) {
    suggestions.push("Start bullet points with strong action verbs (e.g., Led, Built, Designed, Implemented).");
  }
  if (resumeText.length < 500) {
    suggestions.push("Your resume appears brief. Consider adding more detail to your experience sections.");
  }
  if (uniqueMissing.length > 5) {
    suggestions.push("Consider adding a dedicated 'Technical Skills' or 'Key Competencies' section listing relevant technologies.");
  }
  if (suggestions.length < 3) {
    suggestions.push("Use industry-standard section headings (Experience, Education, Skills) for better ATS parsing.");
    suggestions.push("Avoid tables, columns, or graphics — they can confuse ATS parsers. Use plain text formatting.");
  }

  const strengths: string[] = [];
  if (uniqueMatched.length > 10) strengths.push("Strong keyword alignment with the job description.");
  if (uniqueMatched.length > 5) strengths.push(`Good match on key terms: ${uniqueMatched.slice(0, 3).join(", ")}.`);
  if (/\d+%/.test(resumeText)) strengths.push("Includes quantified achievements, which ATS systems value highly.");
  if (/senior|lead|principal/i.test(resumeText)) strengths.push("Demonstrates senior-level experience and leadership.");
  if (/azure|aws|cloud/i.test(resumeText) && /azure|aws|cloud/i.test(jobDescription)) {
    strengths.push("Cloud platform experience aligns with the job requirements.");
  }
  if (uniqueMatched.some((k) => ["c#", ".net", "rest", "api", "microservices"].includes(k))) {
    strengths.push("Core backend technology stack matches the role.");
  }
  if (strengths.length === 0) {
    strengths.push("Resume includes relevant professional experience.");
  }

  const result = AtsCheckResponse.parse({
    overallScore: Math.min(Math.max(overallScore, 0), 100),
    keywordScore: Math.min(Math.max(keywordScore, 0), 100),
    formatScore: Math.min(Math.max(formatScore, 0), 100),
    experienceScore: Math.min(Math.max(experienceScore, 0), 100),
    matchedKeywords: uniqueMatched,
    missingKeywords: uniqueMissing,
    suggestions,
    strengths,
  });

  req.log.info({ overallScore: result.overallScore }, "ATS check complete");
  res.json(result);
});

router.get("/resume/templates", async (_req, res): Promise<void> => {
  const result = GetResumeTemplatesResponse.parse({ templates: RESUME_TEMPLATES });
  res.json(result);
});

export default router;
