---
phase: 260826-4tb
plan: 01
subsystem: ui
tags: [supabase, rls, communication, leads, templates, react, nextjs]

requires: []
provides:
  - communication_message_templates table with RLS
  - MessageTemplateRecord/Payload + communication-queries CRUD
  - useMessageTemplates hook
  - LEADS Templates split-view tab wired via leads-templates
affects:
  - inbox-compose-template-consumers
  - leads-module

actuals:
  tokens: 4683
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "coming-soon pathKey + real tab override (same as leads-contacts)"
    - "communication_* provider-neutral table with crm_can_access_client RLS"

key-files:
  created:
    - supabase/migrations/20260826_communication_message_templates.sql
    - src/hooks/use-message-templates.ts
    - src/components/dashboard/tabs/templates-tab.tsx
  modified:
    - src/lib/communication-types.ts
    - src/lib/communication-queries.ts
    - src/components/dashboard/dashboard-page.tsx

key-decisions:
  - "Hard delete via .delete(); plain text title/body/category/notes only"
  - "Keep module-navigation templates as coming-soon; wire like Contacts via comingSoonKey"
  - "Table named communication_message_templates (provider-neutral)"

patterns-established:
  - "LEADS coming-soon keys render real tabs without promoting module-nav kind"

requirements-completed: [QUICK-4tb]

coverage:
  - id: D1
    description: "communication_message_templates migration with RLS and authenticated grants"
    requirement: QUICK-4tb
    verification:
      - kind: other
        ref: "rg communication_message_templates supabase/migrations/20260826_communication_message_templates.sql"
        status: pass
    human_judgment: true
    rationale: "Migration must be applied by user in Supabase before browser CRUD succeeds"
  - id: D2
    description: "Types, queries, and useMessageTemplates CRUD for title/body/category/notes with client_id filters"
    requirement: QUICK-4tb
    verification:
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D3
    description: "TemplatesTab split-view wired at comingSoonKey === leads-templates"
    requirement: QUICK-4tb
    verification:
      - kind: other
        ref: "rg comingSoonKey === .leads-templates. src/components/dashboard/dashboard-page.tsx; npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "UI create/edit/delete smoke check needs live session after migration apply"

duration: 12min
completed: 2026-08-26
status: complete
---

# Phase 260826-4tb Plan 01: LEADS Templates CRUD Summary

**Tenant-scoped `communication_message_templates` CRUD with RLS, plus a LEADS Templates split-view tab wired like Contacts via `leads-templates`.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-25T22:02:14Z
- **Completed:** 2026-08-25T22:15:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `communication_message_templates` migration (title/body/category/notes, index on client_id+updated_at, RLS via `crm_can_access_client`, grants to authenticated)
- Extended communication types/queries and `useMessageTemplates` for hard-delete CRUD with client_id filters
- Shipped split-view `TemplatesTab` and dashboard wire for `comingSoonKey === "leads-templates"` without changing module-nav kind

## Task Commits

1. **Task 1: Schema + data layer CRUD path** - `1e4cf45` (feat)
2. **Task 2: Split-view Templates tab + LEADS wire** - `d70981d` (feat)

## Files Created/Modified

- `supabase/migrations/20260826_communication_message_templates.sql` - Table + RLS + grants
- `src/lib/communication-types.ts` - MessageTemplateRecord / MessageTemplatePayload
- `src/lib/communication-queries.ts` - fetch/create/update/deleteMessageTemplate
- `src/hooks/use-message-templates.ts` - load/save/error bag
- `src/components/dashboard/tabs/templates-tab.tsx` - Split-view UI
- `src/components/dashboard/dashboard-page.tsx` - Dynamic import + leads-templates render

## Decisions Made

- Followed locked CONTEXT: plain text only, hard delete, split view, no Inbox/send wiring
- Left `module-navigation.ts` Templates as `coming-soon` with pathKey `leads-templates` (Contacts pattern)

## Deviations from Plan

None - plan executed exactly as written.

Note: Task 2 precondition (migration applied) was waived per executor instructions — code completion does not require the migration to be live; documented under User Setup.

## Issues Encountered

None

## User Setup Required

**Apply the migration before Templates CRUD works in the browser.**

1. Open Supabase Dashboard → SQL Editor (or run `db push`)
2. Apply `supabase/migrations/20260826_communication_message_templates.sql`
3. Sign in to the CRM, open **LEADS → Templates** (`/dashboard/leads-templates`)
4. Create, edit, and hard-delete a template to confirm RLS + UI

## Next Phase Readiness

- Templates store is ready for future Inbox/compose consumers (D-05 out of scope here)
- No compose/send or WhatsApp template API wiring added

## Self-Check: PASSED

- FOUND: migration, hook, templates-tab, dashboard wire
- FOUND: commits `1e4cf45`, `d70981d`
- `npx tsc --noEmit` passed after both tasks

---
*Phase: 260826-4tb*
*Completed: 2026-08-26*
