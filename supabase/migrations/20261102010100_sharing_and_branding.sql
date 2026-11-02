-- =============================================================================
-- Sharing, public site URL and "The Unwritten Pages" branding
-- =============================================================================

-- Public site URL used for share links, canonical URLs and social previews.
alter table public.site_settings add column if not exists site_url text
  check (site_url is null or site_url ~ '^https?://[^\s]+$');

alter table public.site_settings alter column site_name set default 'The Unwritten Pages';
update public.site_settings set site_name = 'The Unwritten Pages' where site_name = 'Digital Library';

-- Visitors may also record that they shared a live publication.
drop policy if exists "visitors record reading events" on public.publication_events;
create policy "visitors record reading events" on public.publication_events
  for insert to anon, authenticated
  with check (event_type in ('publication_view', 'reader_open', 'publication_share')
              and public.is_publication_public(publication_id));

-- Analytics now include shares (range total + per publication).
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
      count(*) filter (where ev.event_type = 'publication_share') as shares,
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
        'shares', (select count(*) from ev where event_type = 'publication_share'),
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
