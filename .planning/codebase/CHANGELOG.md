# Codebase Change Log (living blueprint)

Newest first. Each entry: what changed, files, contracts. Structural changes are also patched into STRUCTURE.md / ARCHITECTURE.md.

## 2026-11-20 — Scheduling package payments (quick-261114-22k, Wave 3 plan C2): upfront, installments, per visit, templates, reschedule guard

**Status:** `supabase/migrations/20261120_packages_payment_rpcs.sql` is authored but NOT applied to live. Apply order: `20261120_packages_schema.sql`, `20261120_packages_rpcs.sql`, `20261120_packages_payment_rpcs.sql` (re-apply it straight after any re-apply of the rpcs file: that file recreates the 12-argument `sell_package` and the C1 trigger), deploy the code, `20261120_packages_tab_access.sql` last. Dry run: `supabase/tests/20261120_packages_all_dryrun.sql` (one transaction, always rolls back, ends in `ALL PASS`; regenerate with `node scripts/build-packages-dryrun.mjs`).

**Database**
- `sell_package` now has 13 arguments (trailing optional `p_idempotency_key`); the 12-argument C1 signature is dropped explicitly first so no overload remains. Upfront, installments (jsonb schedule, count 1..120, sum must equal `price_total`) and per visit; optional initial payment created atomically. Sale idempotency: `customer_packages.idempotency_key` / `idempotency_fingerprint` / `initial_payment_id`, partial unique index per tenant; replay returns the stored package, other details raise 23505. The app sends a per-submission key.
- New `record_package_payment` (final signature, optional trailing `p_idempotency_key`; column `package_payments.idempotency_key` plus partial unique index per tenant) and `cancel_package` (voids scheduled and undecided sessions, keeps payments). Same R-10 hardening as C1.
- Appointments trigger function replaced with a reschedule guard (a scheduled, completed or missed_pending package link cannot move past `valid_until`, 22023; rolled_over and forfeited links are skipped); trigger recreated on `status, deleted_at, date`.

**App**
- Sell modal: plan selector, template pick, installment schedule editor (count, first due, split evenly with remainder on the last row, live sum check), collect-now. Detail drawer: payments list, record-payment form (idempotent per submission), installment schedule with overdue highlighting, per-visit amounts owed, cancel package. Packages tab: template management (catalog CRUD) and plan shown on each card.
- `package-ledger.ts` gained the integer-paise money module; `check-package-ledger.mjs` asserts all three plans, overdue in the clinic time zone, per-visit accrual with `charge_on_forfeit`, overpayment and a seeded random walk.
- Appointments tab shows a readable message when a save or status change is rejected by the package triggers.

**Not done (by design):** refunds (R-17), revenue reporting integration (R-14).

## 2026-11-20 — Scheduling packages core (quick-261114-22k, Wave 3 plan C1): sell, attach, consume, missed-session decision

**Problem:** Clinics sell bundles of sessions (physio courses, salon memberships) but had nowhere to record them, consume them on visits, or decide what happens to a missed visit.

**Status:** migrations `20261120_packages_schema.sql` and `20261120_packages_rpcs.sql` are authored but NOT applied to live. Apply them by hand (after the Wave 1 `client_settings` migration) BEFORE deploying this code; apply `20261120_packages_tab_access.sql` LAST (tabs_info 028 only, no access backfill: grant per tenant by hand; users sign in again). Self-checking rolled-back probe: `supabase/tests/20261120_packages_probes.sql`.

**Contracts introduced**
- Tables `package_templates` (browser CRUD, own client), `customer_packages`, `package_installments`, `package_sessions`, `package_payments` (browser SELECT only; no write grant at all). Session status machine: scheduled, completed, missed_pending, rolled_over, forfeited, voided; consumed = completed + forfeited, held = scheduled + missed_pending.
- Definer RPCs (search_path '', schema-qualified, tenant gate `crm_can_access_client(p_client_id)` with auth.uid(), execute revoked from public and anon): `sell_package` (FINAL signature; C1 body accepts the upfront plan only, Task 7 replaces the body), `attach_package_session`, `detach_package_session`, `mark_session_missed`, `resolve_missed_session`. SQLSTATE contract 42501 / P0002 / 22023 / 23505 / 23514, mapped in `package-queries.ts`.
- Trigger `appointments_package_session_sync` (AFTER UPDATE OF status, deleted_at; definer; raises on failure): completed consumes, cancelled opens missed_pending, un-cancel reverts an unresolved decision, completed back to booked reverts consumption (blocked when a payment references the visit), soft delete voids a scheduled link.
- `client_settings` namespace `packages`: `missed_default` (rollover), `rollover_extends_validity_days` (R-15, 0 to 365, default 0), `forfeit_charges_per_visit` (R-16, default true), `labels`. SQL mirror `package_settings_for`. Snapshots on the session row: `validity_extended_days`, `charge_on_forfeit`, `resolution_overrode_default`.
- `createAppointment` now returns the new id (additive). The appointment form gains "Use package" (only for tenants holding the packages tab and a picked customer); attach runs after save and is skipped when none is chosen.

**Files**
- Added: `supabase/migrations/20261120_{packages_schema,packages_rpcs,packages_tab_access}.sql`, `supabase/tests/20261120_packages_probes.sql`, `src/lib/{package-types,package-ledger,package-queries}.ts`, `src/hooks/use-packages.ts`, `src/components/dashboard/tabs/packages-tab.tsx`, `src/components/dashboard/packages/{sell-package-modal,package-detail-drawer,appointment-package-field,missed-session-dialog,package-settings-section}.tsx`, `scripts/check-package-ledger.mjs`
- Modified: `src/lib/{appointment-queries,client-settings-types,tabs,dashboard-tab-routes,module-navigation}.ts`, `src/components/dashboard/{dashboard-page.tsx,tabs/appointments-tab.tsx}`, `scripts/check-client-settings.mjs`

**Not done in C1 (delivered by plan C2 above):** installments and per-visit selling, payments, `cancel_package`, templates UI. Revenue reporting (R-14) and refunds (R-17) stay out of scope.

## 2026-11-19 — Scheduling reminders (quick-261114-22k, Wave 2): clinic-wide lead time, time zone, look-ahead

**Problem:** The appointment reminder lead time was a hard-coded 5 minutes, "now" was hard-coded to IST, only today was scanned, and nothing was shared between devices.

**Status:** no migration. Wave 2 stores its values in `client_settings` (jsonb, namespace pattern already accepted by the live check), which the Wave 1 migration `20261119_client_settings.sql` creates; that file must be applied first (authored, NOT applied to live). With nothing saved, behaviour is the old one: 5 minutes, Asia/Kolkata.

**Contracts introduced**
- `client_settings` namespace `reminders` (`lead_minutes`, default 5, integer 1 to 1440; clamped on read, rejected on strict save). `scheduling.timezone` now also drives reminders.
- `src/lib/appointment-reminder-window.ts` (import-free): `zonedNow`, `getReminderHorizonDays` (lead 5 -> 0, 1440 -> 1, 1500 -> 2; a short lead near midnight also reaches into tomorrow), `computeReminders`, `formatLeadLabel`, `describeWait`, `shiftIsoDate`.
- `useAppointmentReminders(clientId, alertsEnabled, { leadMinutes, timeZone })`: both options travel by ref (the 30 s timer never restarts); the fetch range is today through today plus the horizon; the fired key is `id|appointment date|start` (the appointment's own date, so a look-ahead alert for tomorrow does not fire again when tomorrow becomes today). `APPOINTMENT_REMINDER_LEAD_MINUTES` is removed; the default lives in the registry.
- `OrderAlertProvider` loads `reminders` and `scheduling` through `useClientSettings` (window focus, same-tab save event, 5 minute poll) only when the tenant has the `doctor-summary` tab, and exposes `remindersApplicable` and `leadMinutes`.
- My Profile gets `AppointmentReminderSettingsCard` (presets 5, 10, 15, 30, 60, 120, 1440, custom 1 to 1440, time zone select) below the order alert card, hidden when reminders do not apply. The per-device On/Off toggle is unchanged. The bell copy uses `formatLeadLabel` and shows "Tomorrow" for next-day rows.

**Files**
- Added: `src/lib/appointment-reminder-window.ts`, `src/components/dashboard/appointment-reminder-settings-card.tsx`, `scripts/check-reminder-window.mjs`
- Modified: `src/lib/client-settings-types.ts`, `src/hooks/use-appointment-reminders.ts`, `src/contexts/order-alert-context.tsx`, `src/components/dashboard/{appointment-reminders-bell.tsx,tabs/summary-tab.tsx}`, `scripts/check-client-settings.mjs`

**Not done (by design):** widening the reminder gate beyond `doctor-summary` (OQ-2); moving other screens off IST; closed-browser reminders.

## 2026-11-19 — Scheduling foundation (quick-261114-22k, Wave 1): staff_members, client_settings, Staff tab

**Problem:** Appointment staff was free text (`appointments.staff_name`), so there was no staff list to reuse, rename safely or assign, and tenant-wide settings had no home.

**Status:** migrations `20261119_staff_members.sql`, `20261119_client_settings.sql` and `20261119_staff_tab_access.sql` are authored but NOT applied to live. Apply the first two by hand in the SQL Editor BEFORE deploying this code; apply `20261119_staff_tab_access.sql` LAST, after deploy (users sign in again to see the tab).

**Contracts introduced**
- `staff_members` (tenant-scoped, deactivate never delete, own-client RLS, unique `(client_id, lower(btrim(display_name)))`). `appointments.staff_member_id` with composite tenant FK; the form dual-writes `staff_member_id` and `staff_name`, and every existing reader (calendar columns, conflict check, print profiles, summaries) keeps reading `staff_name`. Renaming a staff member rewrites `staff_name` on its appointments and the matching print profile through a trigger.
- `client_settings` keyed `(client_id, namespace)`; the code registry is the allow-list. Readers never throw (defaults), writers validate strictly. Only `scheduling` (`timezone`) exists now.
- Staff is a dedicated CRM tab (`tabs_info` 027, key `staff`), gated by `client_tab_access`; HRM keys 023 to 026 untouched.
- Appointment form staff field is `StaffPickerField` (active bookable staff plus inline add); calendar columns and filters use the union of bookable staff names and distinct `staff_name` values.

**Files**
- Added: `supabase/migrations/20261119_{staff_members,client_settings,staff_tab_access}.sql`, `src/lib/{staff-member-types,staff-member-queries,client-settings-types,client-settings-queries}.ts`, `src/hooks/{use-staff-members,use-client-settings}.ts`, `src/components/dashboard/tabs/staff-tab.tsx`, `src/components/dashboard/staff-picker-field.tsx`, `scripts/check-client-settings.mjs`
- Modified: `src/lib/{appointment-queries,tabs,dashboard-tab-routes,module-navigation}.ts`, `src/components/dashboard/{dashboard-page.tsx,tabs/appointments-tab.tsx}`

**Not done (by design):** moving readers off `staff_name` (Stage B) and dropping it (Stage C); per-staff logins; contact fields on staff.

## 2026-11-13 — Responsive pass 261112-wx7: phones and tablets

**Problem:** A static mobile audit found drawer-only section switching, one scroll-only table (contacts), 10/11px text, controls under 44px, `vh` units, and overlong stacked forms and filters on 360/390/768px viewports.

**Behaviour changes (all below xl; xl and up render as before)**
- Section strip: `TopNavigation` renders `SectionTabs` below xl, a horizontal chip strip fed by the tab-access-filtered `sidebarItems` (same list as the drawer and sidebar), active chip has `aria-current` and is centered; phones also get a leading module chip that opens the drawer. New shared helper `ResponsiveScrollStrip` in `src/components/ui/responsive.tsx`.
- Contacts: record cards below xl (44px actions menu, same Edit and Block or Unblock handlers); table kept at xl.
- Global field floor: text-like inputs and `select` get `min-height: 2.75rem` inside the existing `max-width: 1279px` block in `globals.css`.
- Full-screen wrappers use `min-h-dvh`; dashboard scroll area has `max-xl:scroll-pb-24` and safe-area bottom padding; calendar scroller uses `70dvh`.
- Cafe summary charts: phone-only (`max-width: 639px`) x-axis interval 5, narrower y-axis and margin via `useMediaQuery`.
- 10px and 11px text is `text-xs` below xl with the original size restored at xl; touched controls are `min-h-11` / `h-11` below xl; card shells use `p-4` below sm; recipe add-ingredient row stacks on phones; promos day picker and filters are 2-up on phones.

**Files**
- Added: `src/hooks/use-media-query.ts`
- Modified: `src/components/ui/{responsive,list-pagination-controls}.tsx`, `src/components/dashboard/{top-navigation,dashboard-page,user-menu,order-alert-settings-card,appointments-calendar}.tsx`, `src/app/{page.tsx,globals.css}`, `src/components/dashboard/tabs/{contacts,templates,whatsapp-auto-reply,whatsapp-settings,recipe,ingredient,promos,subscription,billing,summary,cafe-summary,doctor-summary,consultation}-tab.tsx`, `src/components/dashboard/leads/{leads-tab-header,slide-editor-panel}.tsx`, `src/components/dashboard/billing/{transaction-list,order-list}.tsx`, `src/components/dashboard/consultation/{consultation-summary,vitals-card}.tsx`, `src/components/dashboard/patient/patient-visits-panel.tsx`

**Not done (by design):** calendar time-slot grid height (24px precision grid), the inert X button in the consultation history aside, recharts axis tick font sizes (SVG props, not classes). Viewport matrix still needs a device or emulator run.

## 2026-11-12 — Doctor CRM tester feedback: print profiles, appointment reminders

**Problem:** Receipts could only print body-only on a pre-printed letterhead, with no way to print a clinic/doctor header for plain paper or to vary it per doctor. The AI Analytics bell was a dead icon and nothing warned staff before an appointment. Twelve smaller UI issues came out of tester feedback (see `RELEASE-NOTES-doctor-crm.md`).

**Status:** migration `20261114_doctor_print_profiles.sql` is authored but NOT applied to live. Apply it by hand in the SQL Editor BEFORE deploying this code (receipt printing reads the table).

**Contracts introduced**
- Table `doctor_print_profiles` (client_id, doctor_name unique per client, mode `letterhead` | `standard`, header text fields, nullable margin overrides, `is_default`). RLS through `crm_can_access_client` for select/insert/update/delete, revoked from public/anon, partial unique index so a client has at most one default.
- `resolvePrintProfile({ doctorName, profiles, letterheadMargins })` in `doctor-print-profile-types.ts`. Order: doctor profile (trimmed, case-insensitive name), then the default profile, then plain letterhead (unchanged behaviour). Identity guard: when the default profile is used, only clinic-level header fields (clinic name, address, phone, GST) print; doctor name, qualification and registration number are dropped. Standard mode starts from `STANDARD_PRINT_MARGINS` (10/10/12/12 mm); letterhead mode starts from the client margins; profile overrides replace individual keys; everything goes through `clampPrintMargins`.
- `useClinicReceiptPrint` resolves per print (profiles plus the visit's `staff_name` through `fetchAppointmentStaffName`) and returns `printMargins` and `printHeader`; a profile load failure aborts the print with a visible error rather than printing the wrong template. `ClinicReceiptPrint` takes an optional `header`.
- `useAppointmentReminders(clientId, alertsEnabled)`: scans today's appointments (IST) every 30 s, a reminder fires when 0 < minutes until start <= 5, once per `id|date|start` key persisted in localStorage; cancelled and completed visits are skipped; gated by the existing order-alert opt-in; only scanned for tenants with the doctor-summary tab. `showAppNotification` is the generic browser-notification helper; `showOrderNotification` delegates to it.

**Behaviour decisions**
- Profiles apply to clinic receipts only; prescription print still uses `print_settings` margins (follow-up).
- Reminders work only while the tab is open; no push or service worker.

**Files**
- Added: `supabase/migrations/20261114_doctor_print_profiles.sql`, `src/lib/{doctor-print-profile-types,doctor-print-profile-queries}.ts`, `src/hooks/{use-doctor-print-profiles,use-appointment-reminders}.ts`, `src/components/dashboard/print/doctor-print-profiles-section.tsx`, `src/components/dashboard/appointment-reminders-bell.tsx`
- Modified: `src/lib/{appointment-queries,order-notifications}.ts`, `src/hooks/use-clinic-receipt-print.ts`, `src/contexts/order-alert-context.tsx`, `src/components/dashboard/print/{print-settings-modal,clinic-receipt-print}.tsx`, `src/components/dashboard/tabs/{consultation-tab,doctor-billing-tab,doctor-summary-tab,appointments-tab}.tsx`, `src/components/dashboard/billing/{clinic-bill-modal,customer-table}.tsx`

## 2026-11-11 — Phase 3: doctor billing

**Problem:** Doctor clients were billed through the cafe POS tab, with no consultation link, no paid/unpaid state, no receipt on their letterhead, and no way to keep clinic bills out of cafe analytics and order alerts.

**Status at time of writing:** migrations A and B are applied to live (2026-11-11, probes V1-V10 in the 03-01 SUMMARY) and the code is committed on `feature/doctor-crm-phase1`. Migration C (`20261112_doctor_billing_tab.sql`) is authored but NOT applied; plan 03-06 applies it last. Until then no client can see the new tab.

**Update 2026-11-11 (after review):** migration C is applied (doctor client has 015 "Billing", 004 disabled; other clients unchanged). Code review `03-REVIEW.md` found CR-01 (direct writes could tamper with Clinic bills); migration D (`20261113_clinic_bills_write_guard.sql`, applied by the user) adds `bills_clinic_guard` and `bill_items_clinic_guard` triggers and re-creates `create_clinic_bill` with the `app.clinic_rpc` flag. Fixes for WR-01..WR-05, IN-02, IN-05 and a Billing-tab empty-state hint are in `03-REVIEW-FIX.md`. Deploy order is now A, B, code, C, D.

**Contracts introduced**
- `order_source` enum gains the label `Clinic` (migration A, alone).
- `bills` columns `payment_status` (lowercase `paid` / `unpaid`), `payment_mode` (`CASH`, `UPI`, `CARD`, `OTHER`), `consultation_id` and `appointment_id` (columns and FKs were already live; recorded with guards). Scoped CHECK `bills_clinic_payment_chk`: the mode rule applies to `Clinic` rows only (`coalesce(order_source::text, '') <> 'Clinic'` short-circuits), so the 597 legacy paid/NULL-mode rows stay valid. Clinic rows: paid needs a mode, unpaid has none.
- Partial unique index `bills_consultation_id_uniq` (one bill per consultation) and `bills_clinic_unpaid_idx` (unpaid Clinic list).
- `public.create_clinic_bill`: SECURITY INVOKER, `search_path = public`, execute for `authenticated` only (revoked from public and anon). Arguments (the browser sends no price, total, appointment or status): `p_client_id`, consultation id, customer id, `p_items` (product ids and quantities), flat discount, payment status, payment mode. Checks: tenant through `crm_can_access_client` (42501 Not allowed); consultation belongs to the client, matches the patient and is COMPLETED (P0002); products belong to the client, are active, 1-20 distinct lines, quantity 1-99 (22023 Invalid items); discount between 0 and the subtotal (22023 Invalid discount); paid needs a mode (22023 Invalid payment); second bill for the same consult (23505 This consultation is already billed). Price is read from `products`, appointment is derived from the consultation, an advisory lock serialises per consultation, status is stored `DELIVERED`, source `Clinic`. Unpaid with a mode stores a NULL mode.
- `src/lib/clinic-billing-types.ts` (import-free: payment constants, guards, `describeClinicPayment`, integer-paise money helpers `parseMoneyInput`, `parseQuantity`, `toPaise`, `computeTotalsPaise`, payload types) and `src/lib/clinic-billing-queries.ts` (clinic-only `CLINIC_BILL_SELECT`, `fetchClinicBillsPage`, `fetchClinicBillById`, `markClinicBillPaid`, `createClinicBill` RPC wrapper with SQLSTATE mapping, `fetchNonPaidBillStatusesSince`).
- Hooks `useClinicBills` (paged Unpaid | All list, Mark paid) and `useClinicReceiptPrint` (usePrintSettings + usePrintJob + by-id fetch).
- `doctor-billing` tab for DB key `015` (sidebar label Billing under POS), registered in `tabs.ts`, `dashboard-tab-routes.ts`, `module-navigation.ts` and `dashboard-page.tsx`. `ClinicBillModal` (create) and `ClinicReceiptPrint` (receipt body through `PrintSheet`, receipt number is `bills.order_id`, date in IST, one payment line `PAID - UPI` / `UNPAID`, margins read only, no clinic header or footer).
- Exclusion guards through `isClinicOrderSource` (NULL-safe, JS-side, in the import-free `order-alert-policy.ts`; there is no database-side Clinic filter and the shared `BILL_TRANSACTION_SELECT` is byte-identical): E1 `fetchActiveOrders` (orders list, alert hydrate, 3 s poll); E2 `fetchTransactionsSince` excludes Clinic unless `{ includeClinic: true }`; E3 realtime INSERT alert handler returns early; E4 `shouldSendOrderPush` and the new-order route (`{ ok: true, skipped: "clinic_order" }`).
- Doctor summary opts in with `includeClinic`: only paid Clinic bills count as revenue, order count, Avg Bill and hourly revenue; unpaid Clinic bills appear under Pending Payments. A second small read (`fetchNonPaidBillStatusesSince`) supplies payment status; Clinic bills missing from its map are treated as paid.

**Behaviour decisions**
- D-01: fee items are active products from Services (008); one active product is preselected, none shows an empty state with an Open Services link.
- D-02: bill only from a Completed consultation, one bill per consult; Create bill is offered on Completed consultation-source rows of today's queue (mobile cards and xl table) and in the read-only Completed view, both gated by the doctor-billing tab.
- D-03: no price override, flat discount only; the database decides every amount.
- D-04: lowercase `paid` / `unpaid`, four payment modes, Mark paid is a scoped update that requires a mode.
- D-05: no void, edit, refund or delete in v1.
- D-11: the existing `bills_insert_own` residual (foreign consultation id existence oracle) is accepted and recorded in CONCERNS.md.

**Deploy-order rule:** apply `20261112_bills_order_source_clinic.sql` ALONE first (an enum value must commit before use), then `20261112_clinic_billing_schema.sql`, BEFORE deploying this code (the code selects the new fields and calls `create_clinic_bill`). Apply `20261112_doctor_billing_tab.sql` LAST, after the code is deployed: it adds the 015 access row for the doctor client and disables 004 (kept, not deleted), so running it earlier leaves the doctor without a working billing screen. All are applied by the user in the Supabase SQL Editor after approval, never `supabase db push` (the live migration table does not list repo files). A and B were applied on 2026-11-11 with rolled-back probes recorded in the 03-01 SUMMARY; C is applied in plan 03-06. The doctor must sign out and in after C because the tab list is cached for the session.

**Known limits (details in CONCERNS.md):** Clinic bills carry the cafe defaults `Dine-In` / `T0` in the Transaction tab, which still lists them (and patient totals still include them) with no payment status column; only today's consultations are billable from the UI; `fetchNonPaidBillStatusesSince` has no row cap (PostgREST default 1000); the Pending Payments alert still links to `/dashboard/transaction`; the push route is verified statically only; `crm_can_access_client` is still executable by anon (pre-existing, returns false without a session); Chrome and Edge are the supported print browsers.

**Files**
- Added: `supabase/migrations/20261112_{bills_order_source_clinic,clinic_billing_schema,doctor_billing_tab}.sql`, `src/lib/{clinic-billing-types,clinic-billing-queries}.ts`, `src/hooks/{use-clinic-bills,use-clinic-receipt-print}.ts`, `src/components/dashboard/tabs/doctor-billing-tab.tsx`, `src/components/dashboard/billing/clinic-bill-modal.tsx`, `src/components/dashboard/print/clinic-receipt-print.tsx`
- Modified: `src/lib/{billing-types,billing-queries,tabs,dashboard-tab-routes,module-navigation,order-alert-policy,web-push-server,doctor-summary-analytics}.ts`, `src/hooks/{use-order-alerts,use-doctor-summary}.ts`, `src/app/api/notifications/new-order/route.ts`, `src/components/dashboard/dashboard-page.tsx`, `src/components/dashboard/tabs/{consultation-tab,doctor-summary-tab}.tsx`

## 2026-11-10 — Phase 2: consultation and print

**Problem:** Consultations had no vitals, allergies were not visible while writing notes, attachments were bare name+URL rows with no real file behind them, and there was no way to print a prescription on a clinic's pre-printed letterhead.

**Contracts introduced**
- `consultations.vitals` jsonb: five keys (`bp`, `pulse`, `temperature`, `weight`, `spo2`), shape CHECK, max 256 bytes. Temperature is stored as a plain number in degrees Celsius (D-09); Fahrenheit-looking input such as 98.6 is rejected with a Celsius message. Blank vitals store SQL null.
- `src/lib/consultation-vitals.ts`: import-free `parseVitals`, `normalizeVitals`, `vitalsToForm`, `VITAL_FIELDS`, `VITAL_RANGES`; verifiable with plain node. `updateConsultation` writes vitals only when `payload.vitals !== undefined`, so status-only updates keep stored vitals. `VitalsCard` renders the inputs; both save handlers validate through `normalizeVitals` before any request.
- `PatientStrip` (`src/components/dashboard/patient/patient-strip.tsx`): sticky name, age and allergies strip in the consult editor with three allergy states (recorded text as a red pill, "not recorded" when null or blank, "unavailable"). Null or blank allergies is never shown as "none".
- Private storage bucket `consultation-files` (10 MB, pdf, jpeg, png, webp). Object path is `client_id/consultation_id/uuid-name`. Three `storage.objects` policies (select, insert, delete; no update) key on `crm_can_access_client` of the first path segment, with a guard so a non-uuid segment cannot raise inside the policy.
- `consultation_attachments.storage_path` (new, with a client-prefix check) and `file_url` made nullable: legacy name+URL rows keep working and need no data migration (D-04).
- `src/lib/consultation-files.ts`: import-free `validateConsultationFile`, `safeFileName`, `isUuid`, `buildStoragePath`, `isSafeHttpUrl`, bucket constants. `uploadConsultationFile` (`upsert: false`, best-effort object cleanup if the row insert fails), `getConsultationFileUrl`, `fetchConsultationAttachments`, `deleteConsultationFile` in `consultation-queries.ts` (object removed first and must report exactly one removed object before the row is deleted).
- `AttachmentOpenButton` (`src/components/dashboard/consultation/attachment-open-button.tsx`): the single Open control, creating a 300 second signed URL at click time, shared by the consult editor and the Patient Files panel. Legacy URL rows render as a link only when the URL is http or https.
- `print_settings` table: one row per client (`client_id` primary key), header and footer 0-100 mm, left and right 0-50 mm, one decimal, RLS on, explicit grants to `authenticated` only (default anon/public grants revoked).
- `src/lib/print-settings-types.ts` (import-free `clampPrintMargins`, `parseMarginMm`, `parseMarginsForm`, `marginsToForm`), `print-settings-queries.ts` (`fetchPrintSettings` with `maybeSingle`, `savePrintSettings` clamped upsert on `client_id`), `usePrintSettings` (with a `ready` flag that is false while loading or after a failed load), `PrintSettingsModal` with Test print.
- Shared print mechanism, reusable by Phase 3 receipts: `PrintSheet` (body portal, `data-print-root`, static `@page { margin: 0; }`, thead and tfoot mm spacers so margins repeat on every page), `usePrintJob<T>`, `TestPrintBody`, and one global `@media print` block in `src/app/globals.css` that hides everything else and forces black on white. Only numbers from `clampPrintMargins` reach inline styles.
- `PrescriptionPrint` (body-only sheet) and `ConsultationSummaryBody` (shared by the history summary and the read-only completed view, now including vitals).

**Behaviour decisions**
- D-09: temperature in degrees Celsius.
- D-10: the print contains only the patient line (name, age, date), medications with notes, advice, and follow-up date and notes. No vitals, findings, assessment, exercises or app chrome. An empty consult prints "No prescription content recorded."
- D-11: the queue shows View / Print on Completed consults, Patient History has a Print button per Completed visit, and Completed consults open read-only (no Save as Draft, Save & Complete, Cancel Consult or upload) and are never un-completed from that screen.

**Deploy-order rule:** apply the three `20261111_*.sql` migrations (`20261111_consultations_vitals.sql`, `20261111_print_settings.sql`, `20261111_consultation_files_storage.sql`) to live BEFORE deploying this code. The consultation select lists `vitals` and the strip selects `customers.allergies`, so consultation queries fail for every tenant until the objects exist. All three are idempotent and were applied to live on 2026-11-10 after user approval: the vitals migration through Supabase MCP `execute_sql`, and the `print_settings` and storage migrations run by the user in the Supabase SQL Editor (the MCP tool prompt declined that DDL). The probes and rolled-back cross-tenant role simulation are recorded in the 02-01 SUMMARY. Do not use `supabase db push`: the live migration table does not list repo files.

**Known limits (details in CONCERNS.md):** Chrome and Edge are the supported print browsers (Safari does not honour `@page` margins reliably); HEIC photo uploads are rejected by design because the bucket allow-list is pdf, jpg, png and webp (D-12), so export as JPG first; the test print assumes A4.

**Files**
- Added: `supabase/migrations/20261111_{consultations_vitals,print_settings,consultation_files_storage}.sql`, `src/lib/{consultation-vitals,consultation-files,print-settings-types,print-settings-queries}.ts`, `src/hooks/{use-print-settings,use-print-job}.ts`, `src/components/dashboard/patient/patient-strip.tsx`, `src/components/dashboard/consultation/{vitals-card,attachment-open-button,consultation-summary,prescription-print}.tsx`, `src/components/dashboard/print/{print-sheet,print-settings-modal,test-print-body}.tsx`
- Modified: `src/lib/consultation-types.ts`, `src/lib/consultation-queries.ts`, `src/hooks/use-consultations.ts`, `src/components/dashboard/tabs/consultation-tab.tsx`, `src/components/dashboard/patient/patient-files-panel.tsx`, `src/app/globals.css`

## 2026-11-10 — Phase 1: doctor appointments and patients

**Problem:** Receptionists had only a grouped list of appointments, no clinical basics on patient rows, and the live RLS hardening of 2026-11-08 existed only as hand-applied SQL.

**Contracts introduced**
- `src/lib/appointment-queries.ts` write functions: `createAppointment`, `updateAppointment`, `setAppointmentStatus`, plus `fetchAppointmentsRange` (capped at `APPOINTMENT_RANGE_MAX`, ISO date validation, `deleted_at` null). Every write filters `client_id` (and `id` on update) and fails loudly with "Appointment not found." on zero rows. `appointments-tab.tsx` has no direct Supabase table calls.
- `src/lib/appointment-schedule.ts`: import-free pure helpers (slots, staff columns, lane layout, week dates, `findAppointmentConflicts`, `getConflictingIds`), verifiable with plain node.
- `src/hooks/use-appointments-range.ts`: range hook with stale-response guard.
- `src/components/dashboard/appointments-calendar.tsx`: Day (staff columns) and Week views, click-to-book and click-to-edit via the existing modal, advisory overlap warning (amber banner in the modal, amber outline on cards; never blocks save, D-04). `getAppointmentStatusTone` is the single status pill source, shared with the list.
- Customers clinical fields (migration `20261110_customers_clinical_fields.sql`): nullable text `gender`, `blood_group`, `allergies`, `chronic_conditions`; inputs gated by the `consultation` tab. Empty is stored as null; update skips undefined keys.
- Patient profile drawer under `src/components/dashboard/patient/` (Overview with red allergy pills, Visits, Files) and `fetchPatientAttachments` in `consultation-queries.ts`.
- `supabase/migrations/20261108_phase0_tighten_rls.sql` records the live RLS hardening (tasks/products/counters RLS, own-client policies, dropped open policies, function EXECUTE revokes, `search_path` pins). Verified read-only against live on 2026-11-10; the `generate_order_id` service_role grant was removed from the file because live has none.

**Deploy-order rule:** apply `20261110_customers_clinical_fields.sql` to live BEFORE deploying this code. `CUSTOMER_SELECT` references the four new columns, so every customers query fails for every tenant until they exist. Applied to live on 2026-11-10. Do not use `supabase db push`: the live migration table does not list repo files.

**Time storage finding (assumption A-01, resolved):** live `appointments.start_time` / `end_time` are `time without time zone` and `date` is `date`. The calendar renders stored clock time as is; the list view still converts times through IST in `src/lib/time-utils.ts`, so list and calendar may show different times for the same row. Compare during UAT and reconcile in a later plan if they differ.

**Files**
- Added: `src/lib/appointment-schedule.ts`, `src/hooks/use-appointments-range.ts`, `src/components/dashboard/appointments-calendar.tsx`, `src/components/dashboard/patient/{patient-profile-drawer,patient-overview-panel,patient-visits-panel,patient-files-panel}.tsx`, `supabase/migrations/20261108_phase0_tighten_rls.sql`, `supabase/migrations/20261110_customers_clinical_fields.sql`
- Modified: `src/lib/appointment-queries.ts`, `src/lib/billing-types.ts`, `src/lib/billing-queries.ts`, `src/lib/consultation-queries.ts`, `src/components/dashboard/billing/customer-table.tsx`, `src/components/dashboard/tabs/{appointments,customer}-tab.tsx`

## 2026-11-04 — Appointments: collapsible date groups

`appointments-tab.tsx`: Today / Tomorrow / Upcoming / Past group headers are now toggle buttons (chevron, `aria-expanded`). Local `collapsedGroups` state (not persisted): Today open, other groups collapsed on every load. Removed the non-functional "View all" button. Summary cards and filters unchanged.

## 2026-11-04 — Sidebar labels driven by client_tab_access.display_name

**Problem:** Sidebar/drawer labels for existing tabs came from the static `MODULES` config ("Customers"), ignoring per-client names set in the DB (e.g. "Patients").

**Change:** `TabDefinition.customLabel` (src/lib/types.ts) is set in `normalizeTab` (src/lib/tabs.ts) from `client_tab_access.display_name` (null if empty). `getSidebarItemsForModule` (src/lib/module-navigation.ts) uses `customLabel ?? config.label` for `existing-tab` items. Static label remains the fallback only; no hardcoded patient naming. Specialty summary tabs still show "AI-Analytics".

**Files:** `src/lib/types.ts`, `src/lib/tabs.ts`, `src/lib/module-navigation.ts`

**Open:** Headings inside tab bodies (e.g. "customer" wording in forms, "Add customer") are still static copy; extend if the DB label should apply there too. Sidebar and mobile drawer share the resolved items, so both are covered.

## 2026-11-01 — Billing stock alerts + inventory unit safety

**Problem:** POS billing showed permanent red cards for stock issues; mixed units (l stock vs ml recipe) produced false "short by 190 l" because raw numbers were compared.

**Contracts introduced**
- `src/lib/inventory-units.ts` — unit families (weight g/kg, volume ml/l, count unit). Exports `INVENTORY_UNITS`, `getUnitFamily`, `areUnitsCompatible`, `getCompatibleUnits`, `convertQuantity` (null if incompatible), `convertQuantityRounded`, `describeUnitMismatch`. All unit logic must go through this module; no local `units` arrays.
- Recipe unit must be in the same family as the ingredient's stock unit. Enforced in UI (filtered dropdown) and in `inventory-queries.ts` (`createRecipe`/`updateRecipe` throw on mismatch).
- Ingredient unit may change only within its family when recipes use it (`updateIngredient` throws otherwise). `countRecipesForIngredient(clientId, ingredientId)` is exported.

**Behaviour changes**
- `orderService.validateInventory`: recipe qty converted to stock unit before comparing, aggregated per ingredient in stock unit. Incompatible units → one fix-recipe warning, no shortage maths. Message format: `Out of stock: X (short by N u)`, `Low stock: X (N u left)`. Checkout remains non-blocking.
- `billing-tab.tsx`: removed permanent warning cards and `isLowStock`/`isOutOfStock` state; new warnings (diffed vs previous cart) show via `StockAlertToast` (5s auto-dismiss, click to dismiss, max 3 lines + "+N more").
- `recipe-tab.tsx`: unit dropdown limited to ingredient's family; unit defaults to stock unit on ingredient pick; add-to-recipe blocked on mismatch; editing a legacy mismatched row resets unit to stock unit with a notice.
- `ingredient-tab.tsx`: when editing, unit change converts quantity+threshold within family; family change blocked (and options limited) when ingredient is used in recipes.

**Files**
- Added: `src/lib/inventory-units.ts`, `src/components/dashboard/billing/stock-alert-toast.tsx`
- Modified: `src/lib/orderService.ts`, `src/lib/inventory-queries.ts`, `src/components/dashboard/tabs/{billing,recipe,ingredient}-tab.tsx`

**Not done / open**
- DB RPC `create_order_with_inventory` is not in `supabase/migrations/`; unknown whether it converts units on stock deduction. Needs SQL review + migration (`convert_qty`, compat check).
- Legacy mismatched recipe rows are not yet badged in the Recipes list.
- `web-push` missing from local node_modules (tsc error, unrelated); run `npm install`.
