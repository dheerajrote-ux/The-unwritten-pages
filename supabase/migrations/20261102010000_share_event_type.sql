-- Separate migration: a new enum value must be committed before it can be used.
alter type public.publication_event_type add value if not exists 'publication_share';
