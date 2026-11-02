-- =============================================================================
-- Digital Flipbook Library — schema, RLS, storage and analytics
-- Run with `supabase db push` (or paste into the SQL editor once).
-- =============================================================================

-- gen_random_uuid() is built into PostgreSQL 13+, no extension required.

-- ----------------------------------------------------------------------------
-- Types
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.publication_status as enum ('draft', 'published', 'unpublished');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.admin_role as enum ('owner', 'admin', 'editor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.publication_event_type as enum
    ('publication_view', 'reader_open', 'download_form_submit', 'download_success');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- Admin profiles (no public registration: rows are provisioned by an owner)
-- ----------------------------------------------------------------------------
create table if not exists public.admin_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  role        public.admin_role not null default 'admin',
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_profiles where id = auth.uid());
$$;

-- Promote an existing auth user to admin. Callable only from the SQL editor /
-- service role (execute is revoked from client roles below).
create or replace function public.promote_admin(p_email text, p_full_name text default null,
                                                p_role public.admin_role default 'admin')
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'No auth user with email %', p_email;
  end if;
  insert into public.admin_profiles (id, full_name, role)
  values (v_id, p_full_name, p_role)
  on conflict (id) do update set full_name = coalesce(excluded.full_name, admin_profiles.full_name),
                                 role = excluded.role;
  return v_id;
end $$;

revoke execute on function public.promote_admin(text, text, public.admin_role) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Categories
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 80),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description    text,
  image_path     text,
  display_order  integer not null default 0,
  status         text not null default 'active' check (status in ('active', 'hidden')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Publications
-- ----------------------------------------------------------------------------
create table if not exists public.publications (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (char_length(title) between 1 and 200),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description       text not null default '',
  pdf_storage_path  text,
  cover_image_path  text,
  cover_source      text not null default 'auto' check (cover_source in ('auto', 'custom')),
  category_id       uuid references public.categories (id) on delete restrict,
  author            text,
  publisher         text,
  language          text default 'en',
  page_count        integer check (page_count is null or page_count > 0),
  file_size         bigint check (file_size is null or file_size > 0),
  tags              text[] not null default '{}',
  status            public.publication_status not null default 'draft',
  is_featured       boolean not null default false,
  publication_date  date,
  published_at      timestamptz,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Never allow a publication to be published without its assets.
  constraint publish_requires_assets check (
    status <> 'published'
    or (pdf_storage_path is not null and cover_image_path is not null
        and category_id is not null and published_at is not null)
  )
);

create index if not exists publications_status_idx on public.publications (status, published_at desc);
create index if not exists publications_category_idx on public.publications (category_id);
create index if not exists publications_tags_idx on public.publications using gin (tags);

drop trigger if exists publications_touch on public.publications;
create trigger publications_touch before update on public.publications
  for each row execute function public.touch_updated_at();

-- A publication is publicly visible once published and its publish time has
-- passed (a future published_at = scheduled publication, no cron required).
create or replace function public.is_publication_public(p_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.publications
    where id = p_id and status = 'published' and published_at <= now()
  );
$$;

-- ----------------------------------------------------------------------------
-- Reader settings & SEO (1:1 with publications, created automatically)
-- ----------------------------------------------------------------------------
create table if not exists public.publication_settings (
  id                            uuid primary key default gen_random_uuid(),
  publication_id                uuid not null unique references public.publications (id) on delete cascade,
  flipbook_enabled              boolean not null default true,
  double_page_mode              boolean not null default true,
  fullscreen_enabled            boolean not null default true,
  zoom_enabled                  boolean not null default true,
  thumbnail_navigation_enabled  boolean not null default true,
  download_enabled              boolean not null default true
);

create table if not exists public.publication_seo (
  id                uuid primary key default gen_random_uuid(),
  publication_id    uuid not null unique references public.publications (id) on delete cascade,
  seo_title         text check (seo_title is null or char_length(seo_title) <= 120),
  meta_description  text check (meta_description is null or char_length(meta_description) <= 320),
  og_image_path     text,
  canonical_url     text
);

create or replace function public.create_publication_children()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.publication_settings (publication_id) values (new.id) on conflict do nothing;
  insert into public.publication_seo (publication_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists publications_children on public.publications;
create trigger publications_children after insert on public.publications
  for each row execute function public.create_publication_children();

-- ----------------------------------------------------------------------------
-- Leads, downloads, events
-- ----------------------------------------------------------------------------
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text not null check (char_length(full_name) between 1 and 120),
  email              text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company            text check (company is null or char_length(company) <= 160),
  designation        text check (designation is null or char_length(designation) <= 120),
  marketing_consent  boolean not null default false,
  consent_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- One lead per email (case-insensitive). Returning visitors are re-used.
create unique index if not exists leads_email_unique on public.leads (lower(email));
create index if not exists leads_created_idx on public.leads (created_at desc);

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

create table if not exists public.downloads (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            uuid not null references public.leads (id) on delete cascade,
  publication_id     uuid references public.publications (id) on delete set null,
  publication_title  text not null,  -- snapshot, survives publication deletion
  downloaded_at      timestamptz not null default now(),
  download_status    text not null default 'link_issued' check (download_status in ('link_issued', 'failed'))
);

create index if not exists downloads_pub_idx on public.downloads (publication_id, downloaded_at desc);
create index if not exists downloads_lead_idx on public.downloads (lead_id, publication_id);
create index if not exists downloads_time_idx on public.downloads (downloaded_at desc);

create table if not exists public.publication_events (
  id              uuid primary key default gen_random_uuid(),
  publication_id  uuid not null references public.publications (id) on delete cascade,
  event_type      public.publication_event_type not null,
  session_id      text check (session_id is null or char_length(session_id) <= 64),
  created_at      timestamptz not null default now()
);

create index if not exists events_pub_type_idx on public.publication_events (publication_id, event_type, created_at desc);
create index if not exists events_time_idx on public.publication_events (created_at desc);

-- Rate limiting buckets (written only by Edge Functions via service role)
create table if not exists public.rate_limit_hits (
  id          bigserial primary key,
  bucket      text not null,
  key         text not null,
  created_at  timestamptz not null default now()
);
create index if not exists rate_limit_idx on public.rate_limit_hits (bucket, key, created_at desc);

-- ----------------------------------------------------------------------------
-- Site settings (single row)
-- ----------------------------------------------------------------------------
create table if not exists public.site_settings (
  id                  integer primary key default 1 check (id = 1),
  site_name           text not null default 'Digital Library',
  tagline             text not null default 'Discover publications, insights, guides and resources. Read online or download your favourite publications.',
  privacy_policy_url  text,
  contact_email       text,
  max_pdf_mb          integer not null default 50 check (max_pdf_mb between 1 and 500),
  default_reader      jsonb not null default '{"flipbook_enabled":true,"double_page_mode":true,"fullscreen_enabled":true,"zoom_enabled":true,"thumbnail_navigation_enabled":true,"download_enabled":true}',
  updated_at          timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict do nothing;

drop trigger if exists site_settings_touch on public.site_settings;
create trigger site_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Admin views (security_invoker => RLS of underlying tables applies)
-- ----------------------------------------------------------------------------
create or replace view public.admin_publication_overview
with (security_invoker = true) as
select
  p.*,
  c.name as category_name,
  (select count(*) from public.downloads d where d.publication_id = p.id)::int as download_count,
  (select count(*) from public.publication_events e
     where e.publication_id = p.id and e.event_type = 'publication_view')::int as view_count
from public.publications p
left join public.categories c on c.id = p.category_id;

create or replace view public.lead_downloads
with (security_invoker = true) as
select
  l.id as lead_id,
  l.full_name, l.email, l.company, l.designation, l.marketing_consent, l.consent_at,
  l.created_at as lead_created_at,
  d.publication_id,
  max(coalesce(p.title, d.publication_title)) as publication_title,
  min(d.downloaded_at) as first_downloaded_at,
  max(d.downloaded_at) as last_downloaded_at,
  count(*)::int as download_count
from public.downloads d
join public.leads l on l.id = d.lead_id
left join public.publications p on p.id = d.publication_id
group by l.id, d.publication_id;

create or replace view public.category_overview
with (security_invoker = true) as
select c.*,
  (select count(*) from public.publications p where p.category_id = c.id)::int as publication_count
from public.categories c;

-- ----------------------------------------------------------------------------
-- Analytics RPC — every number is computed from recorded rows.
-- ----------------------------------------------------------------------------
create or replace function public.admin_analytics(p_from timestamptz, p_to timestamptz, p_tz text default 'UTC')
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  with
  ev as (
    select * from publication_events where created_at >= p_from and created_at < p_to
  ),
  dl as (
    select * from downloads where downloaded_at >= p_from and downloaded_at < p_to
  ),
  ld as (
    select * from leads where created_at >= p_from and created_at < p_to
  ),
  days as (
    select generate_series((p_from at time zone p_tz)::date, ((p_to - interval '1 second') at time zone p_tz)::date, interval '1 day')::date as day
  ),
  daily as (
    select d.day,
      (select count(*) from ev where (ev.created_at at time zone p_tz)::date = d.day and ev.event_type = 'publication_view') as views,
      (select count(*) from ev where (ev.created_at at time zone p_tz)::date = d.day and ev.event_type = 'reader_open') as reader_opens,
      (select count(*) from dl where (dl.downloaded_at at time zone p_tz)::date = d.day) as downloads,
      (select count(*) from ld where (ld.created_at at time zone p_tz)::date = d.day) as leads
    from days d
  ),
  per_pub as (
    select p.id, p.title, p.slug, p.cover_image_path, p.status,
      count(*) filter (where ev.event_type = 'publication_view') as views,
      count(*) filter (where ev.event_type = 'reader_open') as reader_opens,
      count(*) filter (where ev.event_type = 'download_form_submit') as form_submits,
      (select count(*) from dl where dl.publication_id = p.id) as downloads
    from publications p
    left join ev on ev.publication_id = p.id
    group by p.id
  )
  select jsonb_build_object(
    'inventory', (select jsonb_build_object(
        'total', count(*),
        'published', count(*) filter (where status = 'published'),
        'drafts', count(*) filter (where status = 'draft'),
        'unpublished', count(*) filter (where status = 'unpublished'))
      from publications),
    'all_time', jsonb_build_object(
        'downloads', (select count(*) from downloads),
        'leads', (select count(*) from leads),
        'readers', (select count(distinct session_id) from publication_events where event_type = 'reader_open')),
    'range', jsonb_build_object(
        'views', (select count(*) from ev where event_type = 'publication_view'),
        'reader_opens', (select count(*) from ev where event_type = 'reader_open'),
        'readers', (select count(distinct session_id) from ev where event_type = 'reader_open'),
        'form_submits', (select count(*) from ev where event_type = 'download_form_submit'),
        'downloads', (select count(*) from dl),
        'leads', (select count(*) from ld)),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
        'date', day, 'views', views, 'reader_opens', reader_opens,
        'downloads', downloads, 'leads', leads) order by day) from daily), '[]'::jsonb),
    'publications', coalesce((select jsonb_agg(to_jsonb(per_pub) order by downloads desc, views desc) from per_pub), '[]'::jsonb),
    'recent_downloads', coalesce((select jsonb_agg(x) from (
        select d.id, d.downloaded_at, l.full_name, l.email, coalesce(p.title, d.publication_title) as publication_title
        from downloads d join leads l on l.id = d.lead_id left join publications p on p.id = d.publication_id
        order by d.downloaded_at desc limit 8) x), '[]'::jsonb),
    'recent_leads', coalesce((select jsonb_agg(x) from (
        select id, full_name, email, company, designation, marketing_consent, created_at
        from leads order by created_at desc limit 8) x), '[]'::jsonb)
  ) into result;

  return result;
end $$;

revoke execute on function public.admin_analytics(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_analytics(timestamptz, timestamptz, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.admin_profiles        enable row level security;
alter table public.categories            enable row level security;
alter table public.publications          enable row level security;
alter table public.publication_settings  enable row level security;
alter table public.publication_seo       enable row level security;
alter table public.leads                 enable row level security;
alter table public.downloads             enable row level security;
alter table public.publication_events    enable row level security;
alter table public.rate_limit_hits       enable row level security;
alter table public.site_settings         enable row level security;

-- admin_profiles: admins can see the team; each admin may edit only their name.
drop policy if exists "admins read profiles" on public.admin_profiles;
create policy "admins read profiles" on public.admin_profiles
  for select to authenticated using (public.is_admin());
drop policy if exists "admin updates own profile" on public.admin_profiles;
create policy "admin updates own profile" on public.admin_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.admin_profiles from anon, authenticated;
grant update (full_name) on public.admin_profiles to authenticated;

-- categories
drop policy if exists "public reads active categories" on public.categories;
create policy "public reads active categories" on public.categories
  for select to anon, authenticated using (status = 'active' or public.is_admin());
drop policy if exists "admins manage categories" on public.categories;
create policy "admins manage categories" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- publications
drop policy if exists "public reads live publications" on public.publications;
create policy "public reads live publications" on public.publications
  for select to anon, authenticated
  using ((status = 'published' and published_at <= now()) or public.is_admin());
drop policy if exists "admins manage publications" on public.publications;
create policy "admins manage publications" on public.publications
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- settings / seo follow their publication's visibility
drop policy if exists "public reads live settings" on public.publication_settings;
create policy "public reads live settings" on public.publication_settings
  for select to anon, authenticated
  using (public.is_publication_public(publication_id) or public.is_admin());
drop policy if exists "admins manage settings" on public.publication_settings;
create policy "admins manage settings" on public.publication_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads live seo" on public.publication_seo;
create policy "public reads live seo" on public.publication_seo
  for select to anon, authenticated
  using (public.is_publication_public(publication_id) or public.is_admin());
drop policy if exists "admins manage seo" on public.publication_seo;
create policy "admins manage seo" on public.publication_seo
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- leads & downloads: written ONLY by the request-download Edge Function
-- (service role bypasses RLS). Admins can read and delete.
drop policy if exists "admins read leads" on public.leads;
create policy "admins read leads" on public.leads
  for select to authenticated using (public.is_admin());
drop policy if exists "admins delete leads" on public.leads;
create policy "admins delete leads" on public.leads
  for delete to authenticated using (public.is_admin());

drop policy if exists "admins read downloads" on public.downloads;
create policy "admins read downloads" on public.downloads
  for select to authenticated using (public.is_admin());

-- events: visitors may record views / reader opens for live publications only.
drop policy if exists "visitors record reading events" on public.publication_events;
create policy "visitors record reading events" on public.publication_events
  for insert to anon, authenticated
  with check (event_type in ('publication_view', 'reader_open')
              and public.is_publication_public(publication_id));
drop policy if exists "admins read events" on public.publication_events;
create policy "admins read events" on public.publication_events
  for select to authenticated using (public.is_admin());

-- site settings
drop policy if exists "public reads site settings" on public.site_settings;
create policy "public reads site settings" on public.site_settings
  for select to anon, authenticated using (true);
drop policy if exists "admins update site settings" on public.site_settings;
create policy "admins update site settings" on public.site_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- rate_limit_hits: no client policies at all (service role only).

-- ----------------------------------------------------------------------------
-- Storage buckets & policies
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('publications', 'publications', false, 524288000, array['application/pdf']),
  ('publication-covers', 'publication-covers', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('publication-previews', 'publication-previews', false, 52428800, null)
on conflict (id) do update set public = excluded.public,
                               file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- Private PDFs: admins only. Visitors get short-lived signed URLs from Edge Functions.
drop policy if exists "admins read pdfs" on storage.objects;
create policy "admins read pdfs" on storage.objects for select to authenticated
  using (bucket_id in ('publications', 'publication-previews') and public.is_admin());
drop policy if exists "admins write pdfs" on storage.objects;
create policy "admins write pdfs" on storage.objects for insert to authenticated
  with check (bucket_id in ('publications', 'publication-previews', 'publication-covers') and public.is_admin());
drop policy if exists "admins update files" on storage.objects;
create policy "admins update files" on storage.objects for update to authenticated
  using (bucket_id in ('publications', 'publication-previews', 'publication-covers') and public.is_admin());
drop policy if exists "admins delete files" on storage.objects;
create policy "admins delete files" on storage.objects for delete to authenticated
  using (bucket_id in ('publications', 'publication-previews', 'publication-covers') and public.is_admin());
-- Covers are served through the public bucket URL (no select policy needed for public reads).
drop policy if exists "admins list covers" on storage.objects;
create policy "admins list covers" on storage.objects for select to authenticated
  using (bucket_id = 'publication-covers' and public.is_admin());
