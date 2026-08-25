# Technology Stack

**Analysis Date:** 2026-08-19

## Languages

**Primary:**
- TypeScript 5.9.3 - Application source under `src/` (`strict: true` in `tsconfig.json`; `target`/`lib` ES2020; JSX preserved for Next)
- SQL - Schema changes in `supabase/migrations/` (WhatsApp communication tables, customer outreach/contact fields)

**Secondary:**
- CSS - Global theme tokens and dark shell in `src/app/globals.css`; Tailwind utility classes in components
- JSON - `package.json`, `package-lock.json`, `tsconfig.json`, `.vscode/mcp.json`

## Runtime

**Environment:**
- Node.js ^18.18.0 || ^19.8.0 || >= 20.0.0 (Next 15.5.15 engines in `package-lock.json`); README documents Node.js 18+
- Browser: React 19 client components (`"use client"`) for dashboard, auth, and data hooks
- Next.js Route Handlers for WhatsApp use `export const runtime = "nodejs"` in `src/app/api/communication/whatsapp/webhook/route.ts` and `src/app/api/communication/whatsapp/credentials/route.ts`

**Package Manager:**
- npm (scripts and lockfile); README also mentions yarn as optional
- Lockfile: `package-lock.json` present (lockfileVersion 3)

## Frameworks

**Core:**
- Next.js 15.5.15 (range `^15.3.1` in `package.json`) - App Router under `src/app/` (`page.tsx`, `layout.tsx`, `dashboard/`, `login/`, `api/`)
- React 19.2.5 / react-dom matching - UI tree; path alias `@/*` → `src/*` in `tsconfig.json`
- Tailwind CSS 3.4.19 - Utility styling; theme extension in `tailwind.config.ts` maps to CSS variables in `src/app/globals.css`
- PostCSS + Autoprefixer - `postcss.config.mjs`

**Testing:**
- Not detected - no test runner in `package.json`, no `*.test.*` / `*.spec.*` files

**Build/Dev:**
- `next dev` / `next build` / `next start` - `package.json` scripts
- `next lint` - script present; ESLint config and `eslint` package not declared in `package.json`
- `npm run clean` - deletes `.next` via Node `fs.rmSync`
- TypeScript compiler (`noEmit: true`) for typecheck via Next plugin in `tsconfig.json`
- `next.config.ts` enables `typedRoutes: true`

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` 2.103.0 - Auth, Postgres REST, and Realtime (`src/lib/supabase.ts`, `src/lib/supabase-admin.ts`, query modules)
- `next` 15.5.15 - SSR/RSC, routing, Route Handlers
- `react` / `react-dom` 19.2.5 - Component model

**Infrastructure:**
- `lucide-react` ^0.511.0 - Icons (`src/lib/module-navigation.ts`, login and dashboard tabs)
- `recharts` 3.10.1 - Charts on summary/analytics tabs
- Node built-in `crypto` - AES-256-GCM secret boxing (`src/lib/crypto/secret-box.ts`) and HMAC webhook verification (`src/lib/providers/whatsapp/webhook.ts`)
- `@types/node` ^22.15.3, `@types/react`, `@types/react-dom` - Dev typings

## Configuration

**Environment:**
- Next.js loads env from `.env.local` (documented in `README.md` and `src/lib/supabase.ts` error copy)
- Template: `.env.example` (names only). A `.env` file is present at repo root — treat as secrets; do not commit values
- Required for browser client: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`src/lib/supabase.ts`)
- Server-only: `SUPABASE_SERVICE_ROLE_KEY` (`src/lib/supabase-admin.ts`), `COMMUNICATION_ENCRYPTION_KEY` (`src/lib/crypto/secret-box.ts`), optional `WHATSAPP_API_VERSION` default `v21.0` (`src/lib/providers/whatsapp/cloud-api.ts`)
- Gitignore: `.env`, `.env.local`, `.env.development.local`, `.env.production.local` in `.gitignore`

**Build:**
- `next.config.ts` - typed routes only; no custom webpack/image domains
- `tsconfig.json` - bundler module resolution, `@/*` alias
- `tailwind.config.ts` - content globs `./src/**/*.{ts,tsx}` (also unused `./app` and `./components` at repo root)
- No `.nvmrc`, no `engines` field in `package.json`

## Platform Requirements

**Development:**
- Node.js 18.18+ (prefer 20+) and npm
- Copy `.env.example` → `.env.local` with a live or local Supabase project (`README.md`)
- `npm install` then `npm run dev` → `http://localhost:3000`
- Optional Cursor MCP: `.vscode/mcp.json` points at official Supabase MCP (editor-only, not an app runtime)

**Production:**
- `next build` + `next start` (Node server). No `Dockerfile`, `vercel.json`, or CI workflow detected
- Host must inject the env vars above; webhook route needs a public HTTPS URL for Meta
- Next engines imply Node 18.18+ / 20+ on the host

---

*Stack analysis: 2026-08-19*
