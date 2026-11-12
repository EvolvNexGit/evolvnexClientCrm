---
phase: 02-consultation-and-print
plan: 06
subsystem: docs-and-gates
tags: [docs, gates, uat, changelog, concerns]
status: complete
requirements: [CONS-01, CONS-02, CONS-03, PRNT-01, PRNT-02]
commits: 2
plan_head_before: 6db9d896ea83394cd6468551690ca70fef0b6911
plan_head_after: 93819623aad6697890deedeeacbc424f1d4bc332
actuals:
  tasks: 2
  commits: 2
provides:
  - "CHANGELOG Phase 2 entry with contracts, D-09/D-10/D-11, deploy-order rule and live-apply record"
  - "INTEGRATIONS: private consultation-files bucket and print_settings documented"
  - "STRUCTURE: new folders, components, hooks, lib modules and three 20261111 migrations"
  - "CONCERNS: Phase 2 known limits and dated isolation evidence"
  - "02-HUMAN-UAT.md: one consolidated browser checklist for the phase"
key-files:
  modified:
    - .planning/codebase/CHANGELOG.md
    - .planning/codebase/INTEGRATIONS.md
    - .planning/codebase/STRUCTURE.md
    - .planning/codebase/CONCERNS.md
  created:
    - .planning/phases/02-consultation-and-print/02-HUMAN-UAT.md
key-decisions:
  - "Docs record the three 20261111 migrations as applied to live 2026-11-10: vitals via MCP execute_sql, print_settings and storage run by the user in the Supabase SQL Editor"
  - "Safari and HEIC recorded as known limits (not defects)"
coverage:
  - id: TSC
    description: "npx tsc --noEmit, errors outside src/lib/web-push-server.ts: 0"
    status: pass
  - id: SMOKE
    description: "combined node smoke test (vitals, files, print settings) prints 'phase 2 pure helpers ok'"
    status: pass
  - id: PKG
    description: "package.json and package-lock.json unchanged; no commit since 3ec7abf~1 touches them"
    status: pass
  - id: SEC
    description: "no admin client, secret box or service role import in Phase 2 files; no console.log/debug/info; no raw href={attachment.file_url}; no eslint-disable in src; migrations free of RLS-off, always-true, anon grant and storage update policy"
    status: pass
  - id: BUILD
    description: "npm run build fails only on src/lib/web-push-server.ts (Module not found: web-push), the known baseline"
    status: pass-baseline
  - id: HUMAN
    description: "Consolidated checklist in 02-HUMAN-UAT.md"
    status: needs-browser-verification
---

# Plan 02-06 summary

Phase 2 docs now match what shipped, the automated phase gates are green, and one consolidated browser UAT checklist covers CONS-01, CONS-02, CONS-03, PRNT-01 and PRNT-02.

## Tasks

1. Docs (f05153a): CHANGELOG entry "Phase 2: consultation and print" (contracts, D-09, D-10, D-11, deploy-order rule, apply record, files); INTEGRATIONS File Storage rewritten for the private `consultation-files` bucket, `print_settings` added to the Clinic tables and the three migrations to the schema list; STRUCTURE lists `patient-strip.tsx`, the new `consultation/` and `print/` folders, both hooks, four lib modules and the three migrations.
2. Limits and gates (9381962): CONCERNS gets the versioned-policies note, the dated isolation-evidence note, and a "Print and attachments (Phase 2)" group (Chrome/Edge only and Safari margins, A4 test print, repeating thead/tfoot, HEIC rejected, orphan risk, Completed read-only, legacy URL rows, print buttons disabled while settings are not ready). All phase gates run; results below.

## Gate results

- TypeScript gate (errors outside web-push-server.ts): 0. Only the baseline error `src/lib/web-push-server.ts(1,21) TS2307 Cannot find module 'web-push'` remains.
- Smoke test: `phase 2 pure helpers ok`.
- Package files unchanged; no admin client / secret box / service role imports; no console log calls; no unguarded attachment href; migrations clean; no `eslint-disable` anywhere in `src`.
- `npm run build`: Failed to compile. The only error is `./src/lib/web-push-server.ts Module not found: Can't resolve 'web-push'` (trace via `src/app/api/notifications/new-order/route.ts`), the known baseline; no Phase 2 file is implicated.

## Deviations from Plan

None to the plan's behaviour. Notes:

- The plan's deploy-order text says all three migrations were applied through Supabase MCP `execute_sql`. Per the orchestrator, the docs instead record the true history: vitals via MCP, `print_settings` and storage run by the user in the SQL Editor.
- The header comments in `supabase/migrations/20261111_print_settings.sql` and `20261111_consultation_files_storage.sql` (and the vitals file) still say "Applied to live through Supabase MCP execute_sql". This is inaccurate for the two files the user ran by hand. Not patched because this plan forbids source edits; worth a one-line comment fix later.
- Extra docs vs the plan: the CHANGELOG also names the known limits (Safari, HEIC, A4) and the apply record; CONCERNS has an extra bullet about print buttons being disabled until settings are ready.

## Needs human / browser verification

Everything in `02-HUMAN-UAT.md` (sections A to E, 34 items). No item has been run.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

CHANGELOG, INTEGRATIONS, STRUCTURE, CONCERNS and 02-HUMAN-UAT.md exist; commits f05153a and 9381962 are on branch feature/doctor-crm-phase1.
