# EvolvNex Business Growth OS

## What This Is

EvolvNex is a multi-tenant SaaS **Business Growth OS** for generic SMBs: one product where operators run CRM, talk to customers, and (later) POS, leads, HR, and ordering — not a pile of isolated tools. This repository is that OS, even though the current executable app is a client-scoped Next.js + Supabase CRM with WhatsApp as the first communication provider.

The current milestone makes the CRM a usable **doctor/clinic** product: appointment calendar, patient profile, consultation with printable prescription, and simple clinic billing. Clinic features are switched on per client through `client_tab_access`; cafe/POS clients keep their tabs. The WhatsApp Conversations/inbox work was paused on 2026-11-10 (existing WhatsApp code stays; campaigns, segments, automation, LEADS, HRM, and AirMenu remain later phases of the same OS).

## Core Value

A tenant's people and records live in one isolated system — each client sees only the tabs and workflows it needs — without mixing tenants or leaking secrets.

## Business Context

- **Customer**: Generic SMB operators; the first vertical configuration being deepened is small doctor/clinic practices (physio, dental, wellness)
- **Revenue model**: Multi-tenant SaaS (pricing/subscription persistence is not in this milestone)
- **Success metric**: One real clinic runs a week (book, consult, print, bill) without support calls and without seeing another tenant's data
- **Strategy notes**: Binding engineering law is `AGENTS.md.docx` and `EvolvNex Engineering Constitution.docx` in this repo. Numbered architecture specs live **outside** this repository and must be provided when a change needs them — do not invent a second architecture.

## Requirements

### Validated

<!-- Shipped in this repo. Depth and constitution alignment vary; see CONCERNS.md. -->

- ✓ Tenant mapping from authenticated user → `clients` / `clientId` — existing
- ✓ Login and session-gated dashboard — existing
- ✓ Tab access via `client_tab_access` / `tabs_info` — existing
- ✓ CRM contacts / customers (including outreach fields) — existing
- ✓ Appointments — existing
- ✓ Consultations — existing
- ✓ Promotions — existing
- ✓ Billing / POS-adjacent order flow (`createOrder` RPC) — existing (inventory RPC not versioned in repo)
- ✓ Inventory views — existing
- ✓ WhatsApp Cloud API send + inbound webhook + credential boxing — existing
- ✓ Auto-replies (WhatsApp-oriented) — existing
- ✓ Dark, dashboard-first UI shell with module navigation (CRM, POS, LEADS, HRM, AI Analytics) — existing

### Active

- [ ] Appointment calendar, patient profile, consultation vitals/uploads, letterhead print, and doctor billing (ROADMAP Phases 1-3)
- [ ] Keep existing CRM tabs working; extend existing tables and tabs, do not rebuild; per-client labels come from `client_tab_access.display_name`
- [ ] Live RLS hardening (applied 2026-11-08) tracked as a migration in the repo
- [ ] Provider-independent Communication boundaries (WhatsApp stays in `providers/whatsapp`, not in generic CRM/comms UI contracts)
- [ ] Constitution-grade tenant isolation: never trust client-provided tenant id; RLS on all tenant-owned tables; no service-role or provider secrets in the client
- [ ] Preferred layers: UI → API/route → validation → service → provider/repository → database / external API (move logic out of UI where the current app still inlines queries)
- [ ] Webhooks: verified, idempotent, tenant-aware, safe on duplicates / retries / out-of-order events
- [ ] External APIs: failures, rate limits, and partial success are handled; never assume send succeeded because the request left the app
- [ ] Align Communication navigation toward AGENTS.md (Dashboard, Conversations, Campaigns, Contacts, Segments, Templates, Automation, Settings) without shipping campaigns/automation in v1

### Out of Scope

- Drag-and-drop automation builder — Constitution forbids unless explicitly requested and architecturally approved
- WhatsApp Conversations inbox, webhook hardening, and appointment reminders — paused 2026-11-10 (code in `src/` stays untouched)
- Campaigns, segments, and step-based automation product — deferred
- Additional providers (Instagram, email, SMS, Telegram) — after a WhatsApp inbox exists
- Telemedicine, lab integrations, insurance claims, ICD coding, patient portal, ABDM — only when a paying clinic asks
- POS as a first-class v1 ship slice — exists in part; not the v1 goal
- LEADS / HRM / AI Analytics as complete modules — nav may exist; not v1
- AirMenu / QR ordering — separate workflow; do not mix into Communication
- Payment provider completion (Razorpay etc.) — keep payments out of Communication; not v1 inbox
- Replacing Next.js, React, TypeScript, or Supabase/PostgreSQL
- Disabling RLS, exposing service role, or “make it work” tenant bypasses

## Context

**Product law (from the two Word docs):**

- Source of truth: Constitution → architecture docs (external) → live schema → existing code → user request → AI assumptions. Security and multi-tenancy win conflicts with a feature request. If architecture is missing, stop and ask — do not invent.
- Multi-tenancy is non-negotiable. Verify ownership, authn, authz, RLS, relationships, and API boundaries on every tenant-owned resource.
- Communication is provider-independent. Future providers: WhatsApp, Instagram, Email, SMS, Telegram, others. Provider-specific behavior belongs in the provider layer.
- Automation (when built) is step-based, tenant-safe, traceable, deterministic, observable, provider-independent, failure-aware.
- UI: premium SaaS, minimal, modern, mobile-first, dark-theme-first, clear hierarchy, reuse components.
- Realtime only where it matters (messages, conversation updates, campaign/order status) — not everywhere.
- Payments stay separate from Communication. AirMenu stays separate from Communication.
- Agents inspect, reuse, extend, then create; smallest correct change; no drive-by refactors; no claiming shipped/tested/migrated unless true.
- Definition of done is not “UI rendered”: auth, tenant isolation, RLS, server/client boundary, validation, errors, loading/empty/failure states, mobile, no secrets, docs if architecture changed.

**This codebase today (2026-08-19 map):**

- Next.js 15 App Router, React 19, TypeScript, Tailwind, `@supabase/supabase-js`. Browser anon client for most CRUD; Node route handlers for WhatsApp webhook and credentials (`COMMUNICATION_ENCRYPTION_KEY`, service role).
- Dashboard is a tab shell (`src/components/dashboard/`) with hooks + `*-queries.ts`. WhatsApp lives under `src/lib/providers/whatsapp/` and `src/app/api/communication/whatsapp/`.
- Known gaps vs Constitution: much data access from the client; core schema/RLS not fully in git (only incremental WhatsApp/customer migrations); WhatsApp webhook tenant/signature issues; no test runner; README describes a different app (email CRM, `app/` tree).

**Prior artifacts:** `.planning/codebase/*` (map dated 2026-08-19). `AGENTS.md.docx` and `EvolvNex Engineering Constitution.docx` at repo root.

## Constraints

- **Tech stack**: Next.js + React + TypeScript + Supabase/PostgreSQL — Constitution and existing repo
- **Security**: No service-role, provider secrets, webhook secrets, payment secrets, or private keys in frontend or git; never disable RLS to ship a feature
- **Tenancy**: Never authorize with client-supplied `tenant_id` / `client_id` alone
- **Architecture**: Do not create parallel services/tables/components; search existing first. Folder layout follows the current `src/` app — do not invent `utils/`/`helpers/` trees that fight STRUCTURE.md
- **Change discipline**: Smallest safe change; Constitution over convenience
- **Docs**: Material architecture/schema/provider/API changes must update matching documentation (or flag that numbered specs live outside the repo)
- **Verification**: Typecheck, lint/build, migration + RLS, tenant isolation, API failure paths, mobile, empty/error/loading — not screenshot-only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| This repo is the full Growth OS, not a throwaway CRM demo | AGENTS.md states the repo *is* the Business Growth OS; nav already names POS/LEADS/HRM | — Pending |
| Current slice = doctor/clinic workflow on existing tabs (replaces inbox slice, 2026-11-10) | A usable clinic product needs calendar, profile, print, billing before communication | — Pending |
| Clinic billing = new `doctor-billing` tab on existing bills tables | Per-client tab access separates it from cafe POS without a parallel table | — Pending |
| Prescription print = body-only on pre-printed letterhead, margins in mm per client | Simplest print path, no PDF library | — Pending |
| Campaigns, segments, automation wait | Deferred behind the clinic slice | — Pending |
| RLS hardening applied directly to live Supabase (2026-11-08), synced to repo | Open policies exposed tenant data; fix could not wait for a phase | ✓ Applied |
| WhatsApp is first provider, not the Communication model | Constitution: provider-independent comms | — Pending |
| Customers are generic SMBs | Industry-agnostic OS; clinic-like tabs are current UI, not the product identity | — Pending |
| Do not rebuild CRM in v1 | Existing contacts/appointments/consultations/promotions stay; generalize labels later | — Pending |
| Constitution + AGENTS.md are mandatory | User directed GSD to take these as source of engineering truth | — Pending |
| External numbered architecture docs required when changing fundamentals | AGENTS.md: specs live outside the repo; do not invent architecture | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-10 after roadmap restructure to the doctor/clinic milestone*
