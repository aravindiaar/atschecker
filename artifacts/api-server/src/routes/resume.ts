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

function isValidSkillEntry(skill: string, strictTechOnly = false): boolean {
  const trimmed = skill.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || trimmed.length < 2) return false;
  if (/[.,;:!?]$/.test(lower)) return false;
  const words = lower.split(/\s+/);
  if (words.length > 7) return false;
  // Always block pure noise words regardless of mode
  if (words.every(w => NOISE_SKILLS.has(w))) return false;
  if (words.length === 1) {
    // Single words must be known tech terms when in strict mode
    if (strictTechOnly) return TECH_INDICATORS.has(lower) || /[#/+\d]/.test(lower);
    // In permissive mode, allow any single word not in NOISE_SKILLS (for non-tech resumes)
    return !NOISE_SKILLS.has(lower);
  }
  // Multi-word phrases: keep unless majority of words are noise
  const noiseCount = words.filter(w => NOISE_SKILLS.has(w)).length;
  if (noiseCount >= Math.ceil(words.length / 2)) return false;
  return true;
}

function isTechnicalResume(resumeText: string): boolean {
  const lower = resumeText.toLowerCase();
  let hits = 0;
  for (const term of TECH_INDICATORS) {
    if (lower.includes(term)) hits++;
    if (hits >= 3) return true;
  }
  return false;
}

function cleanSkillsList(commaSeparated: string, strictTechOnly = false): string {
  const cleaned = commaSeparated
    .split(",")
    .filter(s => isValidSkillEntry(s, strictTechOnly))
    .map(s => s.trim())
    .join(", ");
  return cleaned;
}

function cleanResumeSkillsSection(resumeText: string): string {
  const strictTechOnly = isTechnicalResume(resumeText);
  const lines = resumeText.split("\n");
  let inSkillsSection = false;

  return lines.map(line => {
    const upper = line.trim().toUpperCase();

    if (/^(TECHNICAL SKILLS|SKILLS|CORE SKILLS|KEY SKILLS|TECHNICAL COMPETENCIES|COMPETENCIES)/.test(upper)) {
      inSkillsSection = true;
      return line;
    }

    if (/^(EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT|EDUCATION|PROJECTS|CERTIFICATIONS|SUMMARY|PROFESSIONAL SUMMARY|OBJECTIVE|VOLUNTEER|AWARDS|PUBLICATIONS|REFERENCES)/.test(upper)) {
      inSkillsSection = false;
      return line;
    }

    if (inSkillsSection && line.trim().length > 0) {
      // Handle "Category Label: skill1, skill2, skill3" format
      const colonIdx = line.indexOf(":");
      if (colonIdx !== -1) {
        const label = line.substring(0, colonIdx).trim();
        const skillsPart = line.substring(colonIdx + 1).trim();
        if ((skillsPart.match(/,/g) || []).length >= 1) {
          const cleaned = cleanSkillsList(skillsPart, strictTechOnly);
          return cleaned.length > 0 ? `${label}: ${cleaned}` : line;
        }
        return line;
      }

      // Handle plain comma-separated or bullet-per-line lists
      const commaCount = (line.match(/,/g) || []).length;
      if (commaCount >= 2) {
        const cleaned = cleanSkillsList(line, strictTechOnly);
        return cleaned.length > 0 ? cleaned : line;
      }
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

  const aiPrompt = `You are an expert ATS (Applicant Tracking System) analyst and senior recruiter. ${hasJD ? "Evaluate how well this resume matches the provided job description." : "Evaluate this resume for general ATS compliance and professional quality."}

RESUME:
${resumeText.substring(0, 3000)}
${hasJD ? `\nJOB DESCRIPTION:\n${jobDescription!.substring(0, 1500)}` : ""}

Return ONLY a JSON object (no markdown, no backticks):
{
  "overallScore": <integer 0-100>,
  "keywordScore": <integer 0-100: ${hasJD ? "semantic alignment of resume skills/experience with JD requirements" : "breadth and relevance of skills and keywords in the resume"}>,
  "formatScore": <integer 0-100: resume structure, sections, readability, contact info, bullet usage>,
  "experienceScore": <integer 0-100: ${hasJD ? "how well the candidate's experience level and background fits the role" : "depth, quality, and presentation of work history"}>,
  "matchedKeywords": ["keyword or phrase 1", ...],
  "missingKeywords": ["missing term 1", ...],
  "suggestions": ["specific actionable suggestion 1", ...],
  "strengths": ["specific genuine strength 1", ...]
}

Rules:
- overallScore: weighted average — keyword 50%, format 25%, experience 25% (when JD provided); 40%/35%/25% otherwise
- matchedKeywords: up to 15 specific, meaningful role-relevant terms/phrases from the ${hasJD ? "JD" : "industry"} that ARE present in the resume — no filler words ("the", "a", "will", "role")
- missingKeywords: up to 10 specific terms from the ${hasJD ? "JD" : "industry"} that are absent and would genuinely improve the resume
- suggestions: 3–5 specific, actionable improvements that reference the actual resume content
- strengths: 2–4 genuine, specific strengths that reference actual resume content
- All scores must be honest and consistent with each other`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 800,
      messages: [{ role: "user", content: aiPrompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const aiResult = jsonMatch ? JSON.parse(jsonMatch[0]) as {
      overallScore: number;
      keywordScore: number;
      formatScore: number;
      experienceScore: number;
      matchedKeywords: string[];
      missingKeywords: string[];
      suggestions: string[];
      strengths: string[];
    } : null;

    if (!aiResult) throw new Error("Could not parse AI scoring response");

    const result = AtsCheckResponse.parse({
      overallScore:     Math.min(100, Math.max(0, Math.round(aiResult.overallScore))),
      keywordScore:     Math.min(100, Math.max(0, Math.round(aiResult.keywordScore))),
      formatScore:      Math.min(100, Math.max(0, Math.round(aiResult.formatScore))),
      experienceScore:  Math.min(100, Math.max(0, Math.round(aiResult.experienceScore))),
      matchedKeywords:  (aiResult.matchedKeywords ?? []).slice(0, 30),
      missingKeywords:  (aiResult.missingKeywords ?? []).slice(0, 20),
      suggestions:      (aiResult.suggestions ?? []).slice(0, 6),
      strengths:        (aiResult.strengths ?? []).slice(0, 5),
    });

    req.log.info({ overallScore: result.overallScore, mode: hasJD ? "jd-match" : "general" }, "AI ATS check complete");
    void incrementStat("totalAnalyses");
    res.json(result);
    return;
  } catch (err) {
    req.log.warn({ err }, "AI ATS scoring failed — falling back to rule-based");
  }

  // ── Rule-based fallback (only runs if AI above fails) ────────────────────────
  const fbFormat = scoreFormat(resumeText);
  const fbExperience = scoreExperience(resumeText, hasJD ? jobDescription : undefined);
  const fbGen = generalKeywordScore(resumeText);
  const fbKeyword = hasJD ? 60 : fbGen.score;
  const fbOverall = Math.round(fbKeyword * 0.4 + fbFormat * 0.35 + fbExperience * 0.25);

  const fallbackResult = AtsCheckResponse.parse({
    overallScore:    Math.min(Math.max(fbOverall, 0), 100),
    keywordScore:    Math.min(Math.max(fbKeyword, 0), 100),
    formatScore:     Math.min(Math.max(fbFormat, 0), 100),
    experienceScore: Math.min(Math.max(fbExperience, 0), 100),
    matchedKeywords: fbGen.present.slice(0, 20),
    missingKeywords: fbGen.missing.slice(0, 10),
    suggestions:     ["Tailor your resume language to match the job description.", "Add more measurable achievements."],
    strengths:       ["Resume includes relevant professional experience."],
  });

  req.log.info({ overallScore: fallbackResult.overallScore }, "ATS check complete (fallback)");
  void incrementStat("totalAnalyses");
  res.json(fallbackResult);
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

  const isTechResume = isTechnicalResume(resumeText);
  const filteredKeywords = missingKeywords
    ? (isTechResume ? filterTechnicalKeywords(missingKeywords) : missingKeywords).slice(0, 15)
    : [];
  const keywordsContext = filteredKeywords.length > 0
    ? `\nMissing keywords from the JD (only add ones the candidate can truthfully claim based on their existing resume experience): ${filteredKeywords.join(", ")}`
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
  "improvedSkills": "flat comma-separated skills list — concrete technologies only, for display as chips (e.g. 'C#, Docker, CI/CD, PostgreSQL, AWS')",
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
- CRITICAL for the Skills/Key Skills section in improvedResumeText: ${isTechResume
  ? `rewrite it using clean category groupings relevant to the candidate's tech stack. Each category on its own line, format: "Category Name: Skill1, Skill2, Skill3". Adapt category names to fit the actual skills (e.g. Languages & Frameworks, Cloud & DevOps, Databases & Caching, Tools & Practices). Only include concrete technologies — no soft skills or vague words.`
  : `rewrite it as clean category groupings that match the nature of the role. Each category on its own line, format "Category Name: Skill1, Skill2, Skill3". Use categories that make sense for the job (e.g. Physical & Outdoor Skills, Customer Service, Licences & Certifications, Availability & Reliability). Keep skills specific and honest — no generic fluff.`
}`;

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

router.post("/resume/ai-feedback", async (req, res): Promise<void> => {
  const { resumeText, jobDescription } = req.body as { resumeText?: string; jobDescription?: string };

  if (!resumeText || resumeText.trim().length < 50) {
    res.status(400).json({ error: "Resume text is required." });
    return;
  }

  const hasJD = !!jobDescription && jobDescription.trim().length > 10;

  const prompt = `You are a senior technical recruiter and resume expert. Analyse the following resume${hasJD ? " against the provided job description" : ""} and give honest, specific feedback.

RESUME:
${resumeText.substring(0, 3500)}
${hasJD ? `\nJOB DESCRIPTION:\n${jobDescription!.substring(0, 1500)}` : ""}

Return ONLY a JSON object with no markdown or backticks:
{
  "fitScore": <integer 0-100 representing how well this resume matches the ${hasJD ? "job description" : "typical tech industry expectations"}>,
  "fitLevel": "<one of: Excellent | Good | Fair | Poor>",
  "summary": "<2-3 sentence overall assessment — be direct and specific, reference actual content from the resume>",
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "gaps": ["<specific gap or weakness 1>", "<specific gap 2>", "<specific gap 3>"],
  "recommendations": ["<actionable recommendation 1>", "<actionable recommendation 2>", "<actionable recommendation 3>"]
}

Rules:
- fitScore must be consistent with fitLevel (Excellent=80-100, Good=60-79, Fair=40-59, Poor=0-39)
- strengths, gaps, and recommendations must each have 3-5 items
- Be specific — reference real technologies, roles, or sections from the resume
- Recommendations must be concrete and actionable, not generic advice`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
    } catch {
      req.log.error({ raw }, "Failed to parse AI feedback JSON");
      res.status(500).json({ error: "Failed to parse AI response." });
      return;
    }

    req.log.info("AI feedback complete");
    res.json(parsed);
  } catch (err) {
    req.log.error({ err }, "AI feedback failed");
    res.status(500).json({ error: "AI feedback request failed." });
  }
});

export default router;
