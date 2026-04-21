# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### Resume Builder & ATS Checker (`artifacts/resume-builder`)
- React + Vite frontend at `/`
- Two-panel resume builder (editor + live preview)
- ATS Checker page at `/ats-checker` — 4-step flow: Upload resume (PDF/TXT, saved to localStorage) → Analyse → Fix with AI → Re-Analyse
- Pre-filled with Aravind's resume data; Builder resume can be loaded into ATS checker

### API Server (`artifacts/api-server`)
- Express 5 backend at `/api`
- `POST /api/resume/ats-check` — keyword, format, and experience analysis
- `POST /api/resume/parse` — parse uploaded PDF/TXT file and return extracted text (multer + pdf-parse@1.1.1 via lib path to avoid test-file bug)
- `POST /api/resume/fix` — AI-powered resume rewriter (uses Replit-managed OpenAI proxy); returns improved summary, skills, experience bullets, and full improved text
- `GET /api/resume/templates` — list of resume templates
- AI library: `lib/integrations-openai-ai-server` (Replit OpenAI integration, env: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
