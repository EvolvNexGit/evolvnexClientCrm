# Phase 2: Consultation and print - Context

**Gathered:** 2026-11-10 (user accepted the proposed decisions in chat; no discuss session)
**Status:** Ready for planning

<domain>
Phase 2 delivers CONS-01..03 and PRNT-01..02 for doctor clients: vitals on a consultation, a pinned patient strip on the consult form, private client-scoped file storage with signed URLs, per-client letterhead margins, and a body-only prescription print.
</domain>

<decisions>
- D-01: Vitals are one nullable `consultations.vitals jsonb` column with optional keys bp, pulse, temperature, weight, spo2. No new table.
- D-02: A pinned patient strip (name, age, allergies) stays visible at the top of the consult form; allergies are prominent. Data comes from the customers row (Phase 1 clinical fields).
- D-03: Attachments upload to a private Storage bucket `consultation-files`; object path starts with the owning client id; storage policies check `crm_can_access_client` on that folder segment; files open through short-lived signed URLs.
- D-04: Existing name+URL attachment rows stay readable (additive change); only new uploads go to the bucket. No data migration of legacy rows. (Assumption: default chosen by Claude, not discussed.)
- D-05: `print_settings` table, one row per client, columns header_mm, footer_mm, left_mm, right_mm (numeric, defaults 0, bounded), RLS via `crm_can_access_client`. Settings edited once from the consultation area.
- D-06: Body-only print: medications, advice and follow-up only (no clinic header, doctor block or footer; the letterhead is pre-printed). Margins applied through CSS `@page` / print container padding. Print is shared so Phase 3 receipts reuse it.
- D-07: Smallest safe change; no new dependencies; reuse existing consultation tab/queries; every new table and bucket policy has RLS; migrations idempotent and applied to live by Claude via Supabase MCP after user approval; docs updated.
- D-08: Out of scope: drug database, interaction checks, e-prescription signing, audit log (v2 CLIN-01/02).
- D-09: Temperature is stored as a plain number in degrees Celsius (label shows C). (User, 2026-11-10)
- D-10: Print body = one-line patient name/age/date, then medications (+ medication notes), advice, follow-up date/notes. Letterhead stays pre-printed. (User)
- D-11: Print entry points: queue 'Start Consult' becomes 'View / Print' for Completed rows (read-only, never un-completes); history rows get a Print button. Completed consults are not reopened for editing; hide/disable Save Draft for Completed. (User)
- D-12: Defaults accepted from research (not discussed): bucket limit 10 MB, MIME allow-list pdf/jpg/png/webp; margin bounds header/footer 0-100 mm, left/right 0-50 mm; print via portal + @page margin 0 with thead/tfoot spacers; explicit GRANT to authenticated on new tables (Supabase no longer auto-grants); plan task 1 runs read-only live probes from 02-RESEARCH.md before any migration.
</decisions>
