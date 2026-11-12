---
quick_id: 261113-1lq
status: complete
date: 2026-11-13
branch: chore/mobile-ui-audit
follows: 261112-wx7
---

# Mobile sweep follow-up fixes

Source: Playwright sweep (system Chrome) of every permitted tab at 360/390/768/1280 on a doctor tenant after 261112-wx7.

## Fixed
1. Doctor summary charts clipped y-axis ticks ("00" for 1500) and last x tick ("11 PM") — `margin.left: -18` → shared `CHART_MARGIN` (left 0, right 16), YAxis width 48/32. Ticks 12px below xl (via `useMediaQuery`), 10px on desktop. Bug also present on desktop; fix applies there too.
2. Appointment cards truncated name/phone on phones — status badge moved to the time row below xl (desktop badge position unchanged), phone no longer truncated below xl, group/card padding p-3 below sm, group header 44px.
3. Login form started ~670px down at 360x740 — marketing stats + trust strip shown from lg only; form now starts ~300px.
4. Transaction filters filled a phone screen — From/To share a row from 380px (360px stays stacked: native date control clipped the year).
5. Doctor summary bell had its own row below lg — now shares the location row; lg+ unchanged.
6. Tap targets: doctor/cafe summary "View all" links, doctor-billing Unpaid/All tabs (min-w), tablet module tabs (max-xl:min-h-11).
8. `useMediaQuery` subscribe memoized (no resubscribe per render); Contacts Import/Add share one row on phones (nowrap, compact padding below sm).

## Not changed
- Inline "Consultations" text link in doctor-billing notice (inline prose link).
- Transaction expand toggle (28px box has a pseudo-element hit area).
- Search placeholder truncation at 360px.
- Cafe/POS-only tabs (recipes, promos, orders, subscription, billing) not reachable on the test tenant — not visually verified.
- Desktop (1280) KPI values truncate ("₹1,50…") in the 5-col doctor summary row — pre-existing desktop issue, out of scope.

## Verification
- `npx tsc --noEmit`: 0 errors. `npm run build`: pass.
- Re-sweep: 0 horizontal overflow at all widths, 0 text <12px below xl, remaining sub-40px items limited to the exceptions above.
