-- =====================================================================
-- AAFE's REAL project only (never the demo): the 2026 gala and its sponsorship levels from AAFE's 2026
-- flyer (decided Oct 5 and Oct 14, docs/decisions.md), and the 2027 gala in planning (Thursday, May 27, 2027,
-- from the Oct 14 call). No people, no money, no guests. The staff app needs one open gala to load, so on day one
-- a gala admin opens Sponsorship levels and presses "Start from 2026's levels" for 2027, then fills in Gala
-- information. Later years use "Start next year's gala".
--
-- Run once, after schema.sql and backend.sql, in a new project with no demo data. The tool refuses to mix
-- demo and real galas, so this file fails in a project that holds demo data (that's intended).
-- Change a value below only if AAFE's flyer said otherwise; 2027's levels are set in the staff app.
-- =====================================================================
begin;

insert into gala_events (id, year, name, event_date, status, is_synthetic)
values ('ev-2026', 2026, 'AAFE 52nd Annual Gala', '2026-05-21', 'closed', false),
       ('ev-2027', 2027, 'AAFE 53rd Annual Gala', '2027-05-27', 'planning', false)
on conflict (id) do nothing;

insert into sponsorship_tiers (id, event_id, sort_order, name, contribution_amount, included_seat_count, tier_category, guaranteed_seating, required_materials) values
  ('platinum-2026',  'ev-2026', 1, 'Platinum',  50000, 12, 'sponsorship',      true,  '{logo,full_page_ad}'),
  ('gold-2026',      'ev-2026', 2, 'Gold',      30000, 10, 'sponsorship',      true,  '{logo,full_page_ad}'),
  ('silver-2026',    'ev-2026', 3, 'Silver',    25000, 10, 'sponsorship',      true,  '{logo,half_page_ad}'),
  ('bronze-2026',    'ev-2026', 4, 'Bronze',    15000,  8, 'sponsorship',      true,  '{logo,half_page_ad}'),
  ('champion-2026',  'ev-2026', 5, 'Champion',   7500,  6, 'sponsorship',      true,  '{logo}'),
  ('friend-2026',    'ev-2026', 6, 'Friend',     2500,  2, 'sponsorship',      false, '{logo}'),
  ('supporter-2026', 'ev-2026', 7, 'Supporter',  1000,  1, 'sponsorship',      false, '{}'),
  ('fullad-2026',    'ev-2026', 8, 'Full-page ad', 1000, 0, 'advertising_only', false, '{full_page_ad}'),
  ('halfad-2026',    'ev-2026', 9, 'Half-page ad',  500, 0, 'advertising_only', false, '{half_page_ad}')
on conflict (id) do nothing;

commit;
