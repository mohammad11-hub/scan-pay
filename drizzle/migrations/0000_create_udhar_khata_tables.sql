create table public.udhar_entries (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  mobile text,
  notes text,
  entry_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.udhar_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.udhar_entries(id) on delete cascade,
  item_name text not null,
  quantity numeric not null default 1 check (quantity > 0),
  price numeric not null default 0 check (price >= 0)
);

create table public.udhar_payments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.udhar_entries(id) on delete cascade,
  amount numeric not null check (amount > 0),
  note text,
  paid_at timestamptz not null default now()
);

grant select, insert, update, delete on public.udhar_entries to anon, authenticated;
grant select, insert, update, delete on public.udhar_items to anon, authenticated;
grant select, insert, update, delete on public.udhar_payments to anon, authenticated;
grant all on public.udhar_entries to service_role;
grant all on public.udhar_items to service_role;
grant all on public.udhar_payments to service_role;

alter table public.udhar_entries enable row level security;
alter table public.udhar_items enable row level security;
alter table public.udhar_payments enable row level security;

create policy "udhar entries access" on public.udhar_entries for all using (true) with check (true);
create policy "udhar items access" on public.udhar_items for all using (true) with check (true);
create policy "udhar payments access" on public.udhar_payments for all using (true) with check (true);