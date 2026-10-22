-- Greenlight Market database
-- Run once in the Supabase SQL editor. Safe to re-run (drops and recreates functions and policies).

-- ============ tables ============
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'New member' check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 300),
  created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  type text not null check (type in ('game','concept','idea')),
  title text not null check (char_length(title) between 1 and 80),
  tagline text not null check (char_length(tagline) between 1 and 180),
  description text not null check (char_length(description) between 1 and 5000),
  genre text not null check (char_length(genre) <= 40),
  platform text not null check (char_length(platform) <= 40),
  price integer not null default 0 check (price >= 0 and price <= 10000000),
  price_mode text not null default 'fixed' check (price_mode in ('fixed','offers')),
  includes text[] not null default '{}',
  stats jsonb not null default '{}'::jsonb,
  link text not null default '' check (char_length(link) <= 300),
  photos text[] not null default '{}' check (cardinality(photos) <= 8),
  status text not null default 'active' check (status in ('active','sold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists listings_created_idx on public.listings (created_at desc);
create index if not exists listings_seller_idx on public.listings (seller_id);

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  offer jsonb,
  last_text text not null default '',
  last_at timestamptz not null default now(),
  last_from uuid,
  buyer_read_at timestamptz not null default 'epoch',
  seller_read_at timestamptz not null default 'epoch',
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id)
);
create index if not exists threads_buyer_idx on public.threads (buyer_id);
create index if not exists threads_seller_idx on public.threads (seller_id);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.threads(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text','sys')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_thread_idx on public.messages (thread_id, created_at);

create table if not exists public.saved (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- ============ row level security ============
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.saved enable row level security;

drop policy if exists "profiles readable" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "listings readable" on public.listings;
drop policy if exists "listings insert own" on public.listings;
drop policy if exists "listings update own" on public.listings;
drop policy if exists "listings delete own" on public.listings;
create policy "listings readable" on public.listings for select using (true);
create policy "listings insert own" on public.listings for insert to authenticated with check (seller_id = auth.uid());
create policy "listings update own" on public.listings for update to authenticated using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create policy "listings delete own" on public.listings for delete to authenticated using (seller_id = auth.uid());

-- Conversations are private to the buyer and seller.
drop policy if exists "threads participants read" on public.threads;
drop policy if exists "threads buyer insert" on public.threads;
create policy "threads participants read" on public.threads for select to authenticated using (auth.uid() in (buyer_id, seller_id));
create policy "threads buyer insert" on public.threads for insert to authenticated with check (buyer_id = auth.uid());

drop policy if exists "messages participants read" on public.messages;
drop policy if exists "messages participants send" on public.messages;
create policy "messages participants read" on public.messages for select to authenticated
  using (exists (select 1 from public.threads t where t.id = thread_id and auth.uid() in (t.buyer_id, t.seller_id)));
create policy "messages participants send" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and kind = 'text'
    and exists (select 1 from public.threads t where t.id = thread_id and auth.uid() in (t.buyer_id, t.seller_id)));

drop policy if exists "saved own" on public.saved;
create policy "saved own" on public.saved for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ triggers ============
-- Every new account gets a public profile.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'), 40), ''), left(split_part(new.email, '@', 1), 40), 'New member'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Sellers can't reassign a listing or change when it was posted.
create or replace function public.listing_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  new.seller_id := old.seller_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists listing_before_update on public.listings;
create trigger listing_before_update before update on public.listings for each row execute function public.listing_before_update();

-- A conversation always belongs to the listing's real seller, and nobody messages themselves.
create or replace function public.thread_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare l public.listings;
begin
  select * into l from public.listings where id = new.listing_id;
  if l.id is null then raise exception 'Listing not found'; end if;
  new.buyer_id := auth.uid();
  new.seller_id := l.seller_id;
  new.offer := null;
  if new.buyer_id = new.seller_id then raise exception 'You cannot message yourself'; end if;
  return new;
end $$;
drop trigger if exists thread_before_insert on public.threads;
create trigger thread_before_insert before insert on public.threads for each row execute function public.thread_before_insert();

-- Keep the inbox preview and read markers up to date.
create or replace function public.on_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.threads set
    last_text = left(new.body, 160), last_at = new.created_at, last_from = new.sender_id,
    buyer_read_at = case when new.sender_id = buyer_id then new.created_at else buyer_read_at end,
    seller_read_at = case when new.sender_id = seller_id then new.created_at else seller_read_at end
  where id = new.thread_id;
  return new;
end $$;
drop trigger if exists on_message on public.messages;
create trigger on_message after insert on public.messages for each row execute function public.on_message();

-- ============ functions the site calls ============
create or replace function public.mark_read(p_thread uuid) returns void
language sql security definer set search_path = public as $$
  update public.threads set
    buyer_read_at = case when buyer_id = auth.uid() then now() else buyer_read_at end,
    seller_read_at = case when seller_id = auth.uid() then now() else seller_read_at end
  where id = p_thread and auth.uid() in (buyer_id, seller_id);
$$;

-- Every offer and deal step goes through here, so each side can only take the steps that are theirs.
create or replace function public.deal_action(p_thread uuid, p_action text, p_amount integer default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.threads; l public.listings; uid uuid := auth.uid(); who text;
  o jsonb; st text; amt integer; msg text;
begin
  select * into t from public.threads where id = p_thread for update;
  if t.id is null then raise exception 'Conversation not found'; end if;
  if uid = t.buyer_id then who := 'buyer'; elsif uid = t.seller_id then who := 'seller'; else raise exception 'Not allowed'; end if;
  select * into l from public.listings where id = t.listing_id;
  o := t.offer; st := o->>'status'; amt := (o->>'amount')::integer;

  if p_action = 'offer' and who = 'buyer' and (o is null or st = 'declined') then
    if p_amount is null or p_amount < 1 or p_amount > 10000000 then raise exception 'Enter an offer between $1 and $10,000,000'; end if;
    if l.status <> 'active' then raise exception 'This listing is no longer available'; end if;
    o := jsonb_build_object('amount', p_amount, 'kind', 'offer', 'status', 'pending');
    msg := 'Buyer offered $' || to_char(p_amount, 'FM999,999,999') || '.';
  elsif p_action = 'buy' and who = 'buyer' and (o is null or st = 'declined') then
    if l.price < 1 or l.status <> 'active' then raise exception 'This listing has no Buy now price'; end if;
    o := jsonb_build_object('amount', l.price, 'kind', 'buy', 'status', 'accepted');
    msg := 'Buyer chose Buy now at $' || to_char(l.price, 'FM999,999,999') || '. Next: buyer pays into escrow.';
  elsif p_action = 'accept' and ((who = 'seller' and st = 'pending') or (who = 'buyer' and st = 'countered')) then
    o := jsonb_set(o, '{status}', '"accepted"');
    msg := 'Offer of $' || to_char(amt, 'FM999,999,999') || ' accepted. Next: buyer pays into escrow.';
  elsif p_action = 'counter' and who = 'seller' and st = 'pending' then
    if p_amount is null or p_amount < 1 or p_amount > 10000000 then raise exception 'Enter a counter-offer between $1 and $10,000,000'; end if;
    o := jsonb_build_object('amount', p_amount, 'kind', 'offer', 'status', 'countered');
    msg := 'Seller countered with $' || to_char(p_amount, 'FM999,999,999') || '.';
  elsif p_action = 'decline' and ((who = 'seller' and st = 'pending') or (who = 'buyer' and st = 'countered')) then
    o := jsonb_set(o, '{status}', '"declined"');
    msg := 'Offer of $' || to_char(amt, 'FM999,999,999') || ' declined.';
  elsif p_action = 'withdraw' and who = 'buyer' and st in ('pending', 'countered') then
    o := null; msg := 'Buyer withdrew the offer.';
  elsif p_action = 'pay' and who = 'buyer' and st = 'accepted' then
    o := jsonb_set(o, '{status}', '"escrow"');
    msg := '$' || to_char(amt, 'FM999,999,999') || ' paid into escrow (demo). Next: seller delivers the files.';
  elsif p_action = 'deliver' and who = 'seller' and st = 'escrow' then
    o := jsonb_set(o, '{status}', '"transferred"');
    msg := 'Seller marked the files as delivered. Next: buyer checks them and confirms.';
  elsif p_action = 'confirm' and who = 'buyer' and st = 'transferred' then
    o := jsonb_set(o, '{status}', '"complete"');
    msg := 'Deal complete. $' || to_char(amt, 'FM999,999,999') || ' released to the seller (demo).';
    update public.listings set status = 'sold' where id = t.listing_id;
  else
    raise exception 'That step isn''t available right now.';
  end if;

  update public.threads set offer = o where id = p_thread;
  insert into public.messages (thread_id, sender_id, kind, body) values (p_thread, uid, 'sys', msg);
end $$;

revoke all on function public.mark_read(uuid) from public, anon;
revoke all on function public.deal_action(uuid, text, integer) from public, anon;
grant execute on function public.mark_read(uuid) to authenticated;
grant execute on function public.deal_action(uuid, text, integer) to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.thread_before_insert() from public, anon, authenticated;
revoke all on function public.on_message() from public, anon, authenticated;

-- Threads only change through deal_action / mark_read / the message trigger.
revoke update, delete on public.threads from anon, authenticated;
revoke update, delete on public.messages from anon, authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, bio) on public.profiles to authenticated;

-- ============ live updates ============
do $$ begin
  begin alter publication supabase_realtime add table public.threads; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
end $$;

-- ============ listing photos ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "listing photos upload own folder" on storage.objects;
drop policy if exists "listing photos delete own folder" on storage.objects;
create policy "listing photos upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "listing photos delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

select 'Greenlight Market database is ready' as status;
