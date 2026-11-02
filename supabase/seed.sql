-- Starter categories. Publications are added through the admin dashboard
-- (uploading a PDF stores it privately and generates the cover automatically).
insert into public.categories (name, slug, description, display_order) values
  ('Guides', 'guides', 'Practical, step-by-step guides.', 1),
  ('Reports', 'reports', 'Research reports and annual surveys.', 2),
  ('Whitepapers', 'whitepapers', 'Deep dives into a single topic.', 3),
  ('Playbooks', 'playbooks', 'Operational playbooks and frameworks.', 4)
on conflict (slug) do nothing;
