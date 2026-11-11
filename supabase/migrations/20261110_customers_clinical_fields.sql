-- Doctor clients: clinical basics on customers (patients). Nullable, additive.
-- No RLS change: existing customers_*_own policies already cover the table.
-- Apply to live BEFORE deploying code that selects these columns (CUSTOMER_SELECT
-- references them; an unknown column fails every customers query for every tenant).

alter table public.customers
  add column if not exists gender text,
  add column if not exists blood_group text,
  add column if not exists allergies text,
  add column if not exists chronic_conditions text;
