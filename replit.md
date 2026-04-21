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
- ATS Checker page at `/ats-checker` — paste a job description and get a detailed compatibility score
- Pre-filled with Aravind's resume data

### API Server (`artifacts/api-server`)
- Express 5 backend at `/api`
- `POST /api/resume/ats-check` — keyword, format, and experience analysis
- `GET /api/resume/templates` — list of resume templates

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
