begin;

alter table public.promotions enable row level security;
alter table public.promotion_targets enable row level security;
alter table public.promotion_usages enable row level security;

drop policy if exists promotions_select_own_client on public.promotions;
create policy promotions_select_own_client
on public.promotions
for select
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = promotions.client_id
      and c.crm_user_id = auth.uid()
  )
);

drop policy if exists promotions_insert_own_client on public.promotions;
create policy promotions_insert_own_client
on public.promotions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.clients c
    where c.id = promotions.client_id
      and c.crm_user_id = auth.uid()
  )
);

drop policy if exists promotions_update_own_client on public.promotions;
create policy promotions_update_own_client
on public.promotions
for update
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = promotions.client_id
      and c.crm_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.clients c
    where c.id = promotions.client_id
      and c.crm_user_id = auth.uid()
  )
);

drop policy if exists promotions_delete_own_client on public.promotions;
create policy promotions_delete_own_client
on public.promotions
for delete
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = promotions.client_id
      and c.crm_user_id = auth.uid()
  )
);

drop policy if exists promotion_targets_select_own_client on public.promotion_targets;
create policy promotion_targets_select_own_client
on public.promotion_targets
for select
to authenticated
using (
  exists (
    select 1
    from public.promotions p
    join public.clients c on c.id = p.client_id
    where p.id = promotion_targets.promotion_id
      and c.crm_user_id = auth.uid()
  )
);

drop policy if exists promotion_targets_insert_own_client on public.promotion_targets;
create policy promotion_targets_insert_own_client
on public.promotion_targets
for insert
to authenticated
with check (
  exists (
    select 1
    from public.promotions p
    join public.clients c on c.id = p.client_id
    where p.id = promotion_targets.promotion_id
      and c.crm_user_id = auth.uid()
  )
);

drop policy if exists promotion_targets_delete_own_client on public.promotion_targets;
create policy promotion_targets_delete_own_client
on public.promotion_targets
for delete
to authenticated
using (
  exists (
    select 1
    from public.promotions p
    join public.clients c on c.id = p.client_id
    where p.id = promotion_targets.promotion_id
      and c.crm_user_id = auth.uid()
  )
);

drop policy if exists promotion_usages_select_own_client on public.promotion_usages;
create policy promotion_usages_select_own_client
on public.promotion_usages
for select
to authenticated
using (
  exists (
    select 1
    from public.promotions p
    join public.clients c on c.id = p.client_id
    where p.id = promotion_usages.promotion_id
      and c.crm_user_id = auth.uid()
  )
);

commit;