---
phase: quick-261117-3ns
plan: 01
subsystem: leads / communication (removal)
tags: [removal, whatsapp, cleanup, migration]
status: complete
requires: []
provides:
  - WhatsApp / communication feature fully removed from src/
  - Unapplied migration dropping five communication tables
affects: [leads nav, tabs normalization, .env.example, AGENTS.md]
key-files:
  deleted:
    - src/components/dashboard/tabs/templates-tab.tsx
    - src/components/dashboard/tabs/whatsapp-auto-reply-tab.tsx
    - src/components/dashboard/tabs/whatsapp-settings-tab.tsx
    - src/hooks/use-whatsapp-settings.ts
    - src/hooks/use-whatsapp-auto-replies.ts
    - src/hooks/use-message-templates.ts
    - src/lib/communication-queries.ts
    - src/lib/communication-types.ts
    - src/lib/communication-credentials.ts
    - src/lib/providers/whatsapp/cloud-api.ts
    - src/lib/providers/whatsapp/webhook.ts
    - src/lib/crypto/secret-box.ts
    - src/app/api/communication/whatsapp/credentials/route.ts
    - src/app/api/communication/whatsapp/webhook/route.ts
  modified:
    - src/components/dashboard/dashboard-page.tsx
    - src/lib/module-navigation.ts
    - src/lib/dashboard-tab-routes.ts
    - src/lib/tabs.ts
    - .env.example
    - AGENTS.md
  created:
    - supabase/migrations/20261117_drop_communication_tables.sql
decisions:
  - "Automation sidebar item kept (pathKey leads-automation, tabs_info 021 gate) but relabelled Automation; renders generic ComingSoonTab"
  - "RETIRED_DB_TAB_KEYS guard in tabs.ts drops tabs_info 019/020 rows at normalization"
  - "Migration is a file only; not applied to any Supabase project"
metrics:
  completed: 2026-11-17
  tasks: 3
  files_changed: 21
actuals:
  tokens: 40000
  tasks: 3
  commits: 3
plan_head_before: f109f8b0b11b49f518193a1fbcb4a78193200c7c
plan_head_after: 572e06d1037e16992189f459d55082e16e054689
---

# Phase quick-261117-3ns Plan 01: Remove WhatsApp / communication feature Summary

Removed the WhatsApp Templates, Settings and Auto Replies screens with all backing hooks, communication libs, Meta provider code, AES secret-box and both /api/communication/whatsapp routes; added (not applied) a migration dropping the five communication tables.

## Commits (branch chore/remove-whatsapp-communication, not pushed)

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | 21877c6 | Remove tab screens, hooks, nav/route registrations; add RETIRED_DB_TAB_KEYS guard |
| 2 | acb07a3 | Remove communication libs, WhatsApp provider, secret-box, API routes |
| 3 | 572e06d | Add drop-communication-tables migration; update .env.example and AGENTS.md |

## Verification

- `npm run clean && npx tsc --noEmit`: exit 0 (after each task and at the end).
- `npm run build`: exit 0. Routes now: `/`, `/dashboard`, `/dashboard/[tab]`, `/login`, `/api/notifications/new-order`.
- Plan grep checks for Tasks 1, 2 and 3 all pass (no references to deleted modules, env vars, or retired path keys; migration has all five tables, `drop table if exists`, no cascade word).
- Remaining `whatsapp|communication` hits in src/ are only contacts-tab.tsx subtitle copy and summary-tab.tsx `people.whatsapp_number`, both intentionally untouched.
- No Supabase MCP/CLI call was made; migration not applied.

## Items required by the plan

1. `src/lib/server/request-auth.ts` is now unreferenced. Kept deliberately (generic Bearer-auth helper named in AGENTS.md).
2. `.planning/codebase/*` docs still describe the removed code and were not rewritten. Suggest re-running codebase mapping.
3. `contacts-tab.tsx` subtitle still reads "Manage your WhatsApp contacts and audience." (left untouched per scope).
4. `tabs_info` rows 019/020 and per-client `client_tab_access` rows remain in the live DB; code ignores them via `RETIRED_DB_TAB_KEYS`. Row 021 still maps to `leads-automation`.
5. After the migration is applied (post-deploy), the host should unset `COMMUNICATION_ENCRYPTION_KEY` and `WHATSAPP_API_VERSION` and revoke any stored Meta access tokens.
6. The Automation sidebar item was relabelled from "Auto Replies" to "Automation" and now shows the generic coming-soon page.

## Deviations from Plan

None of substance. Minor wording notes:

- The migration header originally said "No CASCADE"; reworded to avoid the word "cascade" so the plan's `! grep -qi cascade` verify passes. The statement itself has no CASCADE.
- AGENTS.md: the "Layers" server-only block was repointed to `src/lib/server/`, `supabase-admin.ts`, `web-push-server.ts` (accurate surviving files) rather than deleted, and the migrations "Contains" line was reworded to drop WhatsApp-specific names. Vision narrative and the SQL language bullet's historical mention were left as planned.
- secret-box had no consumer outside the delete set, so it was removed as planned.

## Known Stubs

None introduced. Automation / Inbox / Campaigns / Segments render the pre-existing generic ComingSoonTab by design.

## Threat Flags

None. Attack surface only shrank (webhook and credentials routes removed).

## Self-Check: PASSED

- Deleted files confirmed absent; src/app/api/communication, src/lib/providers, src/lib/crypto removed.
- supabase-admin.ts, web-push-server.ts, request-auth.ts and notifications route still present.
- Commits 21877c6, acb07a3, 572e06d present on branch; commit count measured from ledger = 3.
