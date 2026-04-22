import { Router } from "express";
import multer from "multer";
// Import the internal lib to avoid the test-file bug in pdf-parse@1.1.1 root index
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import { AtsCheckBody, AtsCheckResponse, FixResumeBody, FixResumeResponse, GetResumeTemplatesResponse } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { incrementStat } from "./stats";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

const TECH_INDICATORS = new Set([
  "python", "java", "javascript", "js", "typescript", "ts", "golang", "go", "rust",
  "swift", "kotlin", "ruby", "php", "scala", "perl", "bash", "powershell", "c#",
  "react", "angular", "vue", "nextjs", "nuxt", "svelte", "django", "flask", "fastapi",
  "spring", "express", "rails", "laravel", "dotnet", "net",
  "docker", "kubernetes", "k8s", "terraform", "ansible", "jenkins", "git", "github",
  "gitlab", "bitbucket", "circleci",
  "aws", "azure", "gcp", "cloud", "serverless", "lambda",
  "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch", "sqlite",
  "cassandra", "dynamodb", "firestore", "kafka", "rabbitmq",
  "graphql", "grpc", "rest", "soap", "websocket", "http", "https", "tls", "ssl",
  "api", "sdk", "cli", "orm", "cdn", "dns",
  "html", "css", "sass", "scss", "webpack", "vite", "babel", "npm", "pnpm", "yarn",
  "jwt", "oauth", "saml", "sso", "rbac",
  "microservices", "devops", "agile", "scrum", "kanban",
  "linux", "unix", "macos", "windows",
  "etl", "sql", "nosql", "mvc", "mvvm", "oop", "ddd", "tdd",
  "jira", "confluence", "figma", "prometheus", "grafana", "nginx", "apache",
]);

const NOISE_SKILLS = new Set([
  "collaborative", "leadership", "proactive", "mentoring", "participating",
  "architectural", "pragmatic", "creation", "delivery", "proficiency",
  "familiarity", "commitment", "mindset", "breathe", "expertise",
  "proven", "modern", "depth", "implementing", "building", "refining",
  "decisions", "approach", "practices", "tooling", "continuously",
  "improve", "learn", "managing", "ability", "passion", "focus",
  "strong", "solid", "excellent", "outstanding", "automation", "modular",
  "scalable", "code", "pragmatic", "personal", "continuous", "hands-on",
  "engineering", "technical", "professional", "live", "overview",
]);

function isValidSkillEntry(skill: string): boolean {
  const trimmed = skill.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || trimmed.length < 2) return false;
  if (/[.,;:!?]$/.test(lower)) return false;
  const words = lower.split(/\s+/);
  if (words.length > 5) return false;
  if (words.some(w => NOISE_SKILLS.has(w))) return false;
  if (words.length === 1) {
    return TECH_INDICATORS.has(lower) || /[#/+\d]/.test(lower);
  }
  return words.some(w => TECH_INDICATORS.has(w) || /[#/+\d]/.test(w));
}

function cleanSkillsList(commaSeparated: string): string {
  const cleaned = commaSeparated
    .split(",")
    .filter(s => isValidSkillEntry(s))
    .map(s => s.trim())
    .join(", ");
  return cleaned;
}

function cleanResumeSkillsSection(resumeText: string): string {
  return resumeText.split("\n").map(line => {
    const commaCount = (line.match(/,/g) || []).length;
    if (commaCount >= 4 && line.length > 40) {
      const cleaned = cleanSkillsList(line);
      return cleaned.length > 0 ? cleaned : line;
    }
    return line;
  }).join("\n");
}

function filterTechnicalKeywords(keywords: string[]): string[] {
  return keywords.filter(kw => {
    const trimmed = kw.trim();
    const lower = trimmed.toLowerCase();
    if (/[.,;:!?]$/.test(lower)) return false;
    if (lower.length < 2) return false;
    if (trimmed.includes(" ")) return true;
    if (/[#/+]/.test(lower)) return true;
    if (/\d/.test(lower)) return true;
    if (TECH_INDICATORS.has(lower)) return true;
    return false;
  });
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

function scoreExperience(resumeText: string, jobText?: string): number {
  let score = 50;
  const resume = resumeText.toLowerCase();

  if (!jobText) {
    // General experience scoring when no JD provided
    const yearsInResume = resume.match(/(\d+)\+?\s*years?/);
    if (yearsInResume) {
      const yrs = parseInt(yearsInResume[1], 10);
      if (yrs >= 8) score += 40;
      else if (yrs >= 5) score += 30;
      else if (yrs >= 2) score += 15;
    }
    const seniorTerms = ["senior", "lead", "principal", "architect", "manager"];
    if (seniorTerms.some((t) => resume.includes(t))) score += 10;
    return Math.min(score, 100);
  }

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

const TECH_KEYWORDS = [
  "c#", ".net", ".net core", "asp.net", "rest", "api", "microservices", "docker",
  "azure", "postgresql", "sql", "redis", "jwt", "oauth", "ci/cd", "devops",
  "node.js", "python", "javascript", "typescript", "git", "jenkins", "powershell",
  "kubernetes", "cloud", "grpc", "graphql", "rabbitmq", "elasticsearch",
  "agile", "scrum", "etl", "mvc", "entity framework", "linq", "signalr",
];

function generalKeywordScore(resumeText: string): { score: number; present: string[]; missing: string[] } {
  const lower = resumeText.toLowerCase();
  const present: string[] = [];
  const missing: string[] = [];

  for (const kw of TECH_KEYWORDS) {
    if (lower.includes(kw)) present.push(kw);
    else missing.push(kw);
  }

  const score = Math.round((present.length / TECH_KEYWORDS.length) * 100);
  return { score: Math.min(score, 100), present, missing };
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
  const hasJD = !!jobDescription && jobDescription.trim().length > 10;

  const formatScore = scoreFormat(resumeText);
  const experienceScore = scoreExperience(resumeText, hasJD ? jobDescription : undefined);

  const suggestions: string[] = [];
  const strengths: string[] = [];

  let keywordScore: number;
  let uniqueMatched: string[];
  let uniqueMissing: string[];

  if (hasJD) {
    // Targeted JD-match mode — only score against meaningful technical keywords
    const rawJobKeywords = [...extractKeyPhrases(jobDescription!)];
    const jobKeywords = filterTechnicalKeywords(rawJobKeywords);
    const matched: string[] = [];
    const missing: string[] = [];

    for (const keyword of jobKeywords) {
      if (keyword.length < 2) continue;
      if (resumeText.toLowerCase().includes(keyword.toLowerCase())) {
        matched.push(keyword);
      } else {
        missing.push(keyword);
      }
    }

    // Score based on raw counts BEFORE slicing/filtering (avoids denominator distortion)
    const eligibleTotal = matched.length + missing.length;
    keywordScore = eligibleTotal > 0
      ? Math.round((matched.length / eligibleTotal) * 100)
      : 70;

    // Sliced/filtered lists are for display only
    uniqueMatched = [...new Set(matched)].slice(0, 30);
    uniqueMissing = [...new Set(missing)].slice(0, 20);

    if (uniqueMissing.length > 0) {
      suggestions.push(`Add these missing keywords to your resume: ${uniqueMissing.slice(0, 5).join(", ")}`);
    }
    if (keywordScore < 60) {
      suggestions.push("Tailor your summary and skills section to include more keywords from the job description.");
    }
    if (uniqueMissing.length > 5) {
      suggestions.push("Consider adding a dedicated 'Technical Skills' section listing relevant technologies from the JD.");
    }
    if (uniqueMatched.length > 10) strengths.push("Strong keyword alignment with the job description.");
    if (uniqueMatched.length > 5) strengths.push(`Good match on key terms: ${uniqueMatched.slice(0, 3).join(", ")}.`);
    if (/azure|aws|cloud/i.test(resumeText) && /azure|aws|cloud/i.test(jobDescription!)) {
      strengths.push("Cloud platform experience aligns with the job requirements.");
    }
    if (uniqueMatched.some((k) => ["c#", ".net", "rest", "api", "microservices"].includes(k))) {
      strengths.push("Core backend technology stack matches the role.");
    }
  } else {
    // General ATS check mode — evaluate resume on its own merit
    const gen = generalKeywordScore(resumeText);
    keywordScore = gen.score;
    uniqueMatched = gen.present.slice(0, 30);
    uniqueMissing = gen.missing.slice(0, 20);

    if (uniqueMissing.length > 0) {
      suggestions.push(`Consider adding these commonly sought tech skills if applicable: ${uniqueMissing.slice(0, 5).join(", ")}`);
    }
    if (keywordScore < 50) {
      suggestions.push("Your skills section could be broader. List all technologies, frameworks, and tools you have used.");
    }

    if (uniqueMatched.length > 10) strengths.push("Wide range of technical skills and technologies listed.");
    if (uniqueMatched.some((k) => ["c#", ".net", "docker", "azure"].includes(k))) {
      strengths.push("Core backend and cloud technologies are well represented.");
    }
  }

  // Shared suggestions
  if (!(/(quantif|measur|\d+%|\d+x|\$\d)/i.test(resumeText))) {
    suggestions.push("Quantify your achievements with numbers (e.g., 'reduced latency by 40%', 'managed team of 5').");
  }
  if (!/led|built|designed|implemented|developed|delivered|improved|optimized/i.test(resumeText)) {
    suggestions.push("Start bullet points with strong action verbs (e.g., Led, Built, Designed, Implemented).");
  }
  if (resumeText.length < 500) {
    suggestions.push("Your resume appears brief. Consider adding more detail to your experience sections.");
  }
  if (suggestions.length < 3) {
    suggestions.push("Use industry-standard section headings (Experience, Education, Skills) for better ATS parsing.");
    suggestions.push("Avoid tables, columns, or graphics — they can confuse ATS parsers. Use plain text formatting.");
  }

  // Shared strengths
  if (/\d+%/.test(resumeText)) strengths.push("Includes quantified achievements, which ATS systems value highly.");
  if (/senior|lead|principal/i.test(resumeText)) strengths.push("Demonstrates senior-level experience and leadership.");
  if (strengths.length === 0) {
    strengths.push("Resume includes relevant professional experience.");
  }

  const overallScore = hasJD
    ? Math.round(keywordScore * 0.5 + formatScore * 0.25 + experienceScore * 0.25)
    : Math.round(keywordScore * 0.4 + formatScore * 0.35 + experienceScore * 0.25);

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

  req.log.info({ overallScore: result.overallScore, mode: hasJD ? "jd-match" : "general" }, "ATS check complete");
  void incrementStat("totalAnalyses");
  res.json(result);
});

router.post("/resume/fix", async (req, res): Promise<void> => {
  const parsed = FixResumeBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid fix resume request");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { resumeText, jobDescription, missingKeywords, suggestions } = parsed.data;

  const jdContext = jobDescription
    ? `\nThe resume is being tailored for this job description:\n${jobDescription.substring(0, 1500)}`
    : "";

  const filteredKeywords = missingKeywords ? filterTechnicalKeywords(missingKeywords).slice(0, 15) : [];
  const keywordsContext = filteredKeywords.length > 0
    ? `\nMissing technical keywords from the JD (only add ones the candidate can truthfully claim based on their existing resume experience): ${filteredKeywords.join(", ")}`
    : "";

  const suggestionsContext = suggestions && suggestions.length > 0
    ? `\nATS suggestions to address:\n${suggestions.map(s => `- ${s}`).join("\n")}`
    : "";

  const prompt = `You are an expert resume writer and ATS specialist. Improve the following resume based on the ATS analysis findings.

CURRENT RESUME:
${resumeText}
${jdContext}
${keywordsContext}
${suggestionsContext}

Return ONLY a JSON object with this exact structure (no markdown, no backticks):
{
  "improvedSummary": "rewritten professional summary (2-4 sentences, strong action-oriented, includes relevant keywords naturally)",
  "improvedSkills": "improved comma-separated skills list — concrete technologies, tools, frameworks, languages, and methodologies only (e.g. 'Python, Docker, CI/CD, PostgreSQL, AWS')",
  "experienceImprovements": [
    {
      "index": 0,
      "improvedBullets": ["improved bullet 1", "improved bullet 2", "..."]
    }
  ],
  "overallChanges": "brief 2-3 sentence explanation of what was improved and why",
  "improvedResumeText": "the full rewritten resume as plain text, with all improvements applied — preserve the general structure and headings from the original but replace the relevant sections with the improved content"
}

Rules:
- Only improve what's there — do not fabricate experience or skills
- Make bullet points start with strong action verbs and include measurable results where possible
- Keep the tone professional and concise
- Naturally incorporate relevant missing keywords without keyword stuffing
- CRITICAL for improvedSkills: only include concrete, recognisable skills — specific languages, frameworks, tools, platforms, or named methodologies. Never include vague words, adjectives, soft-skill phrases, sentence fragments, or words ending in punctuation (e.g. never "mindset", "breathe", "depth", "modern", "hands-on", "pipelines.", "infrastructure-as-code.", "collaborative", "expertise")
- Include improvements for ALL experience entries found in the resume
- improvedResumeText must be the complete resume text with all improvements incorporated
- CRITICAL for improvedResumeText: preserve every specific technology name, framework, and tool from the original resume exactly as written — never replace specific terms (e.g. "ASP.NET Core Web API", ".NET Core", "Azure DevOps") with generic alternatives. You may ADD keywords but never remove or genericise existing ones.
- In improvedResumeText, the Technical Skills line must include ALL skills from the original, plus ONLY missing JD keywords that the candidate can truthfully claim — do NOT add keywords just because they appear in the JD if they are not evidenced by the resume's actual experience`;

  req.log.info("Starting AI resume fix");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    let parsed_result: unknown;
    try {
      const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      parsed_result = JSON.parse(cleaned);
    } catch {
      req.log.error({ raw }, "Failed to parse AI response as JSON");
      res.status(500).json({ error: "Failed to parse AI response. Please try again." });
      return;
    }

    const result = FixResumeResponse.parse(parsed_result);

    // Post-process: strip noise words from skills regardless of what the AI returned
    const cleanedResult = {
      ...result,
      improvedSkills: cleanSkillsList(result.improvedSkills),
      improvedResumeText: cleanResumeSkillsSection(result.improvedResumeText),
    };

    req.log.info({ experienceCount: cleanedResult.experienceImprovements.length }, "AI resume fix complete");
    void incrementStat("totalFixes");
    res.json(cleanedResult);
  } catch (err) {
    req.log.error({ err }, "AI resume fix failed");
    res.status(500).json({ error: "AI improvement failed. Please try again." });
  }
});

function htmlToResumeText(html: string): string {
  let t = html;
  t = t.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_m: string, c: string) =>
    `\n\n${c.replace(/<[^>]+>/g, "").trim().toUpperCase()}\n`
  );
  t = t.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m: string, c: string) =>
    `• ${c.replace(/<[^>]+>/g, "").trim()}\n`
  );
  t = t.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m: string, c: string) =>
    `${c.replace(/<[^>]+>/g, "").trim()}\n`
  );
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2013;/g, "–")
    .replace(/&#x2014;/g, "—")
    .replace(/&#x2019;/g, "'");
  t = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

router.post("/resume/parse", upload.single("file"), async (req, res): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded." });
    return;
  }

  try {
    let text = "";
    const name = file.originalname.toLowerCase();
    const isPdf = file.mimetype === "application/pdf" || name.endsWith(".pdf");
    const isDocx =
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx");

    if (isPdf) {
      const pdfData = await pdfParse(file.buffer);
      text = pdfData.text;
    } else if (isDocx) {
      const result = await mammoth.convertToHtml({ buffer: file.buffer });
      text = htmlToResumeText(result.value);
    } else {
      text = file.buffer.toString("utf-8");
    }

    text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!text || text.length < 50) {
      res.status(400).json({ error: "Could not extract text from the file. Please try a different file." });
      return;
    }

    req.log.info({ bytes: text.length, filename: file.originalname }, "Resume parsed");
    void incrementStat("totalUploads");
    res.json({ text, filename: file.originalname });
  } catch (err) {
    req.log.error({ err }, "Failed to parse resume file");
    res.status(500).json({ error: "Failed to parse the file. Please try a text (.txt) or PDF file instead." });
  }
});

router.get("/resume/templates", async (_req, res): Promise<void> => {
  const result = GetResumeTemplatesResponse.parse({ templates: RESUME_TEMPLATES });
  res.json(result);
});

export default router;
