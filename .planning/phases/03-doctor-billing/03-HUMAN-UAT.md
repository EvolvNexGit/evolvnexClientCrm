---
phase: 03-doctor-billing
status: pending
created: 2026-11-11
requirements: [BILL-01, BILL-02, BILL-03, BILL-04, BILL-05]
---

# Phase 3 consolidated browser UAT

One checklist for the whole phase, built from the "needs browser verification" lists of 03-02 to 03-05 and the roadmap success criteria 1 to 5. Mark each item PASS / FAIL with a note.

**Test clients:** doctor client `eafea940-a6d1-4aa2-95e2-339f614502ea` and one cafe client (any tenant that uses Billing 004, Orders and Products). **Supported print browsers:** Chrome and Edge.

**Prerequisites (UAT cannot start before these):**
- Migrations A (`20261112_bills_order_source_clinic.sql`), B (`20261112_clinic_billing_schema.sql`) and C (`20261112_doctor_billing_tab.sql`) are applied, C last (plan 03-06), and the Phase 3 code is deployed (or `npm run dev` against live).
- The doctor signed out and in once after C (the tab list is cached for the session).
- At least one Completed consultation today with a patient, and a patient with a phone number.
- Print settings saved for the doctor client in Consultations (Phase 2).

Known limits to keep in mind, not defects: Safari is not a supported print browser; there is no void, edit or delete by design (D-05); an earlier day's consultation cannot be billed from the UI (D-02); fee items must be created in Services first; Clinic bills show the cafe table defaults (`Dine-In` / `T0`) in the Transactions tab (009), which also still includes them and has no payment status column; patient totals still include Clinic bills; the Pending Payments alert links to `/dashboard/transaction`; the push route was only reviewed statically before this UAT.

## A. Tab access (BILL-01, criterion 1)

- [ ] A1. After signing out and in, the doctor's POS module shows Billing (the new 015 tab) and Transactions, and no old Billing (004).
- [ ] A2. `/dashboard/doctor-billing` opens the billing tab and the sidebar highlights Billing.
- [ ] A3. A cafe client still sees its Billing (004), Orders and Products and no doctor-billing item; `/dashboard/doctor-billing` does not render a clinic bill list for it.
- [ ] A4. Transactions (009) still opens for the doctor.

## B. Fee items and Create bill (BILL-02, BILL-03, criteria 2 and 4)

- [ ] B1. With no product on the doctor client, Create bill shows "No fee items yet" with an Open Services link and no form.
- [ ] B2. After adding one active fee item in Services, it is preselected with quantity 1.
- [ ] B3. With two items neither is preselected, the same item cannot be picked on two lines, and Add item and Remove work.
- [ ] B4. Create bill appears only on Completed consultation rows in Today's Queue (mobile card list at 390px and the xl table at 1280px) and in the read-only Completed view; Waiting and In Progress rows and appointment-only rows show none.
- [ ] B5. Paid needs a payment mode before Create bill enables; Unpaid needs none.
- [ ] B6. A discount above the subtotal, 10.555, quantity 0 and quantity 100 are rejected inline.
- [ ] B7. Creating an unpaid bill shows the created panel with the receipt number and the server total; the Network tab shows the `create_clinic_bill` call carrying only product ids, quantities, the discount and the payment choice (no price, total, appointment or status).
- [ ] B8. A second Create bill for the same consult shows "This consultation is already billed." (already billed) and an Open Billing link.
- [ ] B9. A read-only SQL check of the new row shows `order_source` Clinic, `status` DELIVERED, the consultation and appointment linked, and a receipt number in `order_id`.
- [ ] B10. Another tenant's login cannot see the doctor's bills (Transactions list and a direct select).
- [ ] B11. Error paths against the live function (a product deactivated mid-modal, a consult not completed) show friendly messages, not raw SQL text.

## C. Billing tab and Mark paid (BILL-04, criterion 5)

- [ ] C1. Unpaid shows only unpaid bills and All shows both, newest first.
- [ ] C2. Mark paid requires a mode; the bill leaves Unpaid and shows Paid with the mode in All. A second Mark paid from another browser tab shows "Bill not found or already paid."
- [ ] C3. A read-only SQL check shows `payment_status` paid and the chosen mode.
- [ ] C4. The empty states read as specified and a forced list error shows the banner.
- [ ] C5. At 390px the list is cards with no horizontal scrollbar and Show more works.
- [ ] C6. There is no void, edit or delete control anywhere.

## D. Receipt print (BILL-04, criterion 5)

- [ ] D1. In Chrome, Margins Default, Save as PDF, dark theme on, Print on a paid and an unpaid bill produces only the receipt (receipt number equal to `order_id`, date, patient, items, subtotal, discount when present, total, "PAID - UPI" or "UNPAID"), black on white, inset by the saved margins, with no URL or date header text.
- [ ] D2. Print receipt from the created panel works.
- [ ] D3. With the `print_settings` request blocked the billing tab shows the error with Retry and every Print button is disabled.
- [ ] D4. With no saved print settings the tab shows the note linking to Consultations.
- [ ] D5. The receipt contains no clinic header or footer and no consultation data.
- [ ] D6. Open the print dialog, cancel, then switch Unpaid | All: Ctrl+P must not print a leftover receipt.

## E. Alerts, active orders and analytics (BILL-05, criterion 3)

- [ ] E1. With the doctor client open in a second browser with order alerts enabled, creating a bill gives no beep, toast or push, and the Orders tab (if present) never lists it after the 3 second poll.
- [ ] E2. The doctor summary (AI Insights) revenue includes a paid clinic bill and the earlier POS bills as before; an unpaid clinic bill appears in Pending Payments and not in revenue, Avg Bill or the hourly chart; after Mark paid and a refresh it counts as revenue.
- [ ] E3. A cafe client's Cafe summary and Orders show the same numbers as before the deploy, and a new POS checkout still alerts as before.
- [ ] E4. If the Supabase bills webhook is configured, the push route answers `skipped: clinic_order` for a Clinic bill (check the route response or logs), and a non-Clinic POS bill still pushes.

## F. Regression

- [ ] F1. Consultations queue, Start or Continue, Save as Draft, Save & Complete, the read-only view and prescription print behave as in Phase 2.
- [ ] F2. The patient profile totals and the Customers tab are unchanged.
- [ ] F3. The cafe client's Billing checkout and Transactions list are unchanged.
- [ ] F4. Appointments (List, Day, Week) are unchanged.

## Result

| Section | Result | Notes |
|---------|--------|-------|
| A Tab access | | |
| B Fee items and Create bill | | |
| C Billing tab and Mark paid | | |
| D Receipt print | | |
| E Alerts, orders and analytics | | |
| F Regression | | |
