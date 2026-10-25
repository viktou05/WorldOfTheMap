-- Reisatlas: database voor accounts.
-- Plak dit in Supabase onder SQL Editor → New query en klik Run.
-- Elke gebruiker krijgt één rij met zijn eigen kaart (als JSON).

create table if not exists public.atlases (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.atlases enable row level security;

drop policy if exists "eigen atlas lezen" on public.atlases;
drop policy if exists "eigen atlas maken" on public.atlases;
drop policy if exists "eigen atlas bijwerken" on public.atlases;
drop policy if exists "eigen atlas verwijderen" on public.atlases;

create policy "eigen atlas lezen" on public.atlases
  for select to authenticated using (auth.uid() = user_id);
create policy "eigen atlas maken" on public.atlases
  for insert to authenticated with check (auth.uid() = user_id);
create policy "eigen atlas bijwerken" on public.atlases
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "eigen atlas verwijderen" on public.atlases
  for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.atlases to authenticated;
