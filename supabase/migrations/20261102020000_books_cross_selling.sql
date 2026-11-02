-- =============================================================================
-- Books, Amazon purchase links & cross-selling
-- Purchases always happen on Amazon. This schema stores admin-supplied links
-- and records website engagement (impressions, detail views, outbound clicks)
-- — never sales.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Types
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.book_event_type as enum ('book_impression', 'book_detail_view', 'amazon_link_click');
exception when duplicate_object then null; end $$;

-- Placement keys used across recommendations, placements and events.
create or replace function public.is_valid_placement(p text)
returns boolean language sql immutable as $$
  select p in ('homepage_featured', 'homepage_carousel', 'reader_sidebar', 'reader_footer',
               'download_success', 'publication_page', 'related_books', 'books_landing')
$$;

-- Accepts Amazon storefronts and official short links (amzn.to, a.co…).
create or replace function public.is_amazon_url(u text)
returns boolean language sql immutable as $$
  select u ~* '^https://([a-z0-9-]+\.)*(amazon\.(com|in|co\.uk|de|fr|it|es|ca|com\.au|co\.jp|ae|sa|sg|nl|se|pl|com\.br|com\.mx|com\.tr|eg|com\.be)|amzn\.(to|in|eu|com|asia)|a\.co|audible\.(com|in|co\.uk))(/|\?|$)'
$$;

-- ----------------------------------------------------------------------------
-- Book categories
-- ----------------------------------------------------------------------------
create table if not exists public.book_categories (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 80),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description    text,
  display_order  integer not null default 0,
  status         text not null default 'active' check (status in ('active', 'hidden')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists book_categories_touch on public.book_categories;
create trigger book_categories_touch before update on public.book_categories
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Books
-- ----------------------------------------------------------------------------
create table if not exists public.books (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null check (char_length(title) between 1 and 200),
  slug               text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  subtitle           text,
  author             text,
  short_description  text not null default '',
  full_description   text not null default '',
  learn_points       text[] not null default '{}',   -- "What readers will learn"
  audience           text,                           -- "Who should read this book"
  key_takeaways      text[] not null default '{}',
  cover_image_path   text,
  category_id        uuid references public.book_categories (id) on delete restrict,
  isbn_10            text check (isbn_10 is null or isbn_10 ~ '^[0-9]{9}[0-9X]$'),
  isbn_13            text check (isbn_13 is null or isbn_13 ~ '^97[89][0-9]{10}$'),
  publisher          text,
  page_count         integer check (page_count is null or page_count > 0),
  edition            text,
  formats            text[] not null default '{}' check (formats <@ array['paperback', 'hardcover', 'kindle', 'audiobook']::text[]),
  language           text default 'en',
  publication_date   date,
  tags               text[] not null default '{}',
  is_featured        boolean not null default false,
  status             public.publication_status not null default 'draft',
  published_at       timestamptz,
  seo_title          text check (seo_title is null or char_length(seo_title) <= 120),
  meta_description   text check (meta_description is null or char_length(meta_description) <= 320),
  og_image_path      text,
  canonical_url      text check (canonical_url is null or canonical_url ~ '^https?://'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint book_publish_requirements check (
    status <> 'published' or (char_length(short_description) > 0 and published_at is not null)
  )
);
create index if not exists books_status_idx on public.books (status, published_at desc);
create index if not exists books_category_idx on public.books (category_id);
drop trigger if exists books_touch on public.books;
create trigger books_touch before update on public.books
  for each row execute function public.touch_updated_at();

create or replace function public.is_book_public(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.books where id = p_id and status = 'published' and published_at <= now());
$$;

-- ----------------------------------------------------------------------------
-- Purchase links (stored exactly as supplied — affiliate tags preserved)
-- ----------------------------------------------------------------------------
create table if not exists public.book_purchase_links (
  id               uuid primary key default gen_random_uuid(),
  book_id          uuid not null references public.books (id) on delete cascade,
  marketplace      text not null check (marketplace in ('amazon_in', 'amazon_us', 'amazon_uk', 'other')),
  marketplace_name text,                                  -- label for "other" (e.g. Amazon.de)
  format           text not null check (format in ('paperback', 'hardcover', 'kindle', 'audiobook')),
  product_url      text not null check (char_length(product_url) <= 2048 and public.is_amazon_url(product_url)),
  display_label    text check (display_label is null or char_length(display_label) <= 80),
  displayed_price  numeric(10, 2) check (displayed_price is null or displayed_price >= 0),
  currency         text check (currency is null or currency ~ '^[A-Z]{3}$'),
  show_price       boolean not null default true,
  is_primary       boolean not null default false,
  status           text not null default 'active' check (status in ('active', 'inactive')),
  display_order    integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists purchase_links_book_idx on public.book_purchase_links (book_id, display_order);
create unique index if not exists purchase_links_one_primary on public.book_purchase_links (book_id) where is_primary;
drop trigger if exists purchase_links_touch on public.book_purchase_links;
create trigger purchase_links_touch before update on public.book_purchase_links
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Placements & recommendations
-- publication_id NULL = global (placement-level selection, e.g. homepage).
-- ----------------------------------------------------------------------------
create table if not exists public.promotional_placements (
  id             uuid primary key default gen_random_uuid(),
  placement_key  text not null unique check (public.is_valid_placement(placement_key)),
  heading        text not null,
  description    text,
  max_books      integer not null default 3 check (max_books between 1 and 24),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists placements_touch on public.promotional_placements;
create trigger placements_touch before update on public.promotional_placements
  for each row execute function public.touch_updated_at();

insert into public.promotional_placements (placement_key, heading, description, max_books) values
  ('homepage_featured', 'Books Worth Exploring', 'Hand-picked books to read alongside the essays.', 3),
  ('homepage_carousel', 'Explore More Books', 'Discover more ideas, knowledge and inspiration through our curated collection of books.', 12),
  ('reader_sidebar', 'You May Also Like', null, 3),
  ('reader_footer', 'Enjoyed this publication?', 'Continue exploring more ideas through our books.', 3),
  ('download_success', 'While You''re Here, Explore More', 'Take your learning further with these recommended books.', 1),
  ('publication_page', 'Books by the Author', 'Longer reads from the same writer.', 3),
  ('related_books', 'Related Books', null, 4),
  ('books_landing', 'Recommended Reading', 'Curated collections to read next.', 6)
on conflict (placement_key) do nothing;

create table if not exists public.publication_book_recommendations (
  id              uuid primary key default gen_random_uuid(),
  publication_id  uuid references public.publications (id) on delete cascade,
  book_id         uuid not null references public.books (id) on delete cascade,
  placement       text not null check (public.is_valid_placement(placement)),
  priority        integer not null default 0,
  display_order   integer not null default 0,
  is_featured     boolean not null default false,
  is_active       boolean not null default true,
  start_date      timestamptz,
  end_date        timestamptz,
  created_at      timestamptz not null default now(),
  constraint rec_dates check (start_date is null or end_date is null or end_date > start_date)
);
create unique index if not exists recs_unique on public.publication_book_recommendations
  (coalesce(publication_id, '00000000-0000-0000-0000-000000000000'::uuid), book_id, placement);
create index if not exists recs_lookup_idx on public.publication_book_recommendations (placement, publication_id, is_active);

-- ----------------------------------------------------------------------------
-- Book events (engagement only; clicks are NOT sales)
-- ----------------------------------------------------------------------------
create table if not exists public.book_events (
  id                uuid primary key default gen_random_uuid(),
  book_id           uuid not null references public.books (id) on delete cascade,
  purchase_link_id  uuid references public.book_purchase_links (id) on delete set null,
  event_type        public.book_event_type not null,
  session_id        text check (session_id is null or char_length(session_id) <= 64),
  placement         text check (placement is null or public.is_valid_placement(placement) or placement in ('book_detail', 'books_grid')),
  publication_id    uuid references public.publications (id) on delete set null,
  marketplace       text,   -- snapshot so analytics survive link edits/deletion
  format            text,
  created_at        timestamptz not null default now()
);
create index if not exists book_events_book_idx on public.book_events (book_id, event_type, created_at desc);
create index if not exists book_events_time_idx on public.book_events (created_at desc);

-- Fill marketplace/format snapshots from the link on insert (clients can't spoof them).
create or replace function public.book_event_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.purchase_link_id is not null then
    select marketplace, format into new.marketplace, new.format
    from public.book_purchase_links where id = new.purchase_link_id and book_id = new.book_id;
    if not found then new.purchase_link_id := null; new.marketplace := null; new.format := null; end if;
  else
    new.marketplace := null; new.format := null;
  end if;
  return new;
end $$;
drop trigger if exists book_events_snapshot on public.book_events;
create trigger book_events_snapshot before insert on public.book_events
  for each row execute function public.book_event_snapshot();

-- ----------------------------------------------------------------------------
-- Site settings: affiliate disclosure & author website
-- ----------------------------------------------------------------------------
alter table public.site_settings add column if not exists amazon_associate boolean not null default false;
alter table public.site_settings add column if not exists affiliate_disclosure text not null default 'As an Amazon Associate, we earn from qualifying purchases.';
alter table public.site_settings add column if not exists author_website_url text
  check (author_website_url is null or author_website_url ~ '^https?://');

-- ----------------------------------------------------------------------------
-- Views
-- ----------------------------------------------------------------------------
create or replace view public.admin_book_overview with (security_invoker = true) as
select b.*,
  c.name as category_name,
  (select count(*) from public.book_purchase_links l where l.book_id = b.id)::int as link_count,
  (select count(*) from public.book_purchase_links l where l.book_id = b.id and l.status = 'active')::int as active_link_count,
  (select count(*) from public.book_events e where e.book_id = b.id and e.event_type = 'amazon_link_click')::int as click_count
from public.books b
left join public.book_categories c on c.id = b.category_id;

create or replace view public.book_category_overview with (security_invoker = true) as
select c.*, (select count(*) from public.books b where b.category_id = c.id)::int as book_count
from public.book_categories c;

-- ----------------------------------------------------------------------------
-- Analytics RPC — engagement & outbound clicks only.
-- ----------------------------------------------------------------------------
create or replace function public.admin_book_analytics(p_from timestamptz, p_to timestamptz, p_tz text default 'UTC')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  with ev as (select * from book_events where created_at >= p_from and created_at < p_to),
  days as (
    select generate_series((p_from at time zone p_tz)::date, ((p_to - interval '1 second') at time zone p_tz)::date, interval '1 day')::date as day
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'published_books', (select count(*) from books where status = 'published' and published_at <= now()),
      'impressions', (select count(*) from ev where event_type = 'book_impression'),
      'detail_views', (select count(*) from ev where event_type = 'book_detail_view'),
      'clicks', (select count(*) from ev where event_type = 'amazon_link_click')),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
        'date', d.day,
        'impressions', (select count(*) from ev where event_type = 'book_impression' and (created_at at time zone p_tz)::date = d.day),
        'detail_views', (select count(*) from ev where event_type = 'book_detail_view' and (created_at at time zone p_tz)::date = d.day),
        'clicks', (select count(*) from ev where event_type = 'amazon_link_click' and (created_at at time zone p_tz)::date = d.day)
      ) order by d.day) from days d), '[]'::jsonb),
    'books', coalesce((select jsonb_agg(x order by x.clicks desc, x.detail_views desc) from (
        select b.id, b.title, b.slug, b.cover_image_path, b.status,
          count(*) filter (where ev.event_type = 'book_impression') as impressions,
          count(*) filter (where ev.event_type = 'book_detail_view') as detail_views,
          count(*) filter (where ev.event_type = 'amazon_link_click') as clicks
        from books b left join ev on ev.book_id = b.id group by b.id) x), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(x order by x.clicks desc) from (
        select l.id, l.book_id, b.title as book_title, l.display_label, l.marketplace, l.format, count(ev.id) as clicks
        from book_purchase_links l join books b on b.id = l.book_id
        left join ev on ev.purchase_link_id = l.id and ev.event_type = 'amazon_link_click'
        group by l.id, b.title) x), '[]'::jsonb),
    'marketplaces', coalesce((select jsonb_agg(x order by x.clicks desc) from (
        select coalesce(marketplace, 'unknown') as key, count(*) as clicks from ev where event_type = 'amazon_link_click' group by 1) x), '[]'::jsonb),
    'formats', coalesce((select jsonb_agg(x order by x.clicks desc) from (
        select coalesce(format, 'unknown') as key, count(*) as clicks from ev where event_type = 'amazon_link_click' group by 1) x), '[]'::jsonb),
    'placements', coalesce((select jsonb_agg(x order by x.clicks desc, x.impressions desc) from (
        select coalesce(placement, 'unknown') as key,
          count(*) filter (where event_type = 'book_impression') as impressions,
          count(*) filter (where event_type = 'amazon_link_click') as clicks
        from ev group by 1) x), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke execute on function public.admin_book_analytics(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_book_analytics(timestamptz, timestamptz, text) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.book_categories                   enable row level security;
alter table public.books                             enable row level security;
alter table public.book_purchase_links               enable row level security;
alter table public.promotional_placements            enable row level security;
alter table public.publication_book_recommendations  enable row level security;
alter table public.book_events                       enable row level security;

drop policy if exists "public reads active book categories" on public.book_categories;
create policy "public reads active book categories" on public.book_categories
  for select to anon, authenticated using (status = 'active' or public.is_admin());
drop policy if exists "admins manage book categories" on public.book_categories;
create policy "admins manage book categories" on public.book_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads live books" on public.books;
create policy "public reads live books" on public.books
  for select to anon, authenticated using ((status = 'published' and published_at <= now()) or public.is_admin());
drop policy if exists "admins manage books" on public.books;
create policy "admins manage books" on public.books
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads active links of live books" on public.book_purchase_links;
create policy "public reads active links of live books" on public.book_purchase_links
  for select to anon, authenticated using ((status = 'active' and public.is_book_public(book_id)) or public.is_admin());
drop policy if exists "admins manage links" on public.book_purchase_links;
create policy "admins manage links" on public.book_purchase_links
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads placements" on public.promotional_placements;
create policy "public reads placements" on public.promotional_placements
  for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists "admins manage placements" on public.promotional_placements;
create policy "admins manage placements" on public.promotional_placements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads live recommendations" on public.publication_book_recommendations;
create policy "public reads live recommendations" on public.publication_book_recommendations
  for select to anon, authenticated using (
    (is_active and (start_date is null or start_date <= now()) and (end_date is null or end_date > now())
      and public.is_book_public(book_id))
    or public.is_admin());
drop policy if exists "admins manage recommendations" on public.publication_book_recommendations;
create policy "admins manage recommendations" on public.publication_book_recommendations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "visitors record book events" on public.book_events;
create policy "visitors record book events" on public.book_events
  for insert to anon, authenticated with check (public.is_book_public(book_id));
drop policy if exists "admins read book events" on public.book_events;
create policy "admins read book events" on public.book_events
  for select to authenticated using (public.is_admin());

-- Book covers share the public covers bucket under a books/ prefix (policies already cover admins).
