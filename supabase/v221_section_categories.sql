-- v221 — the curated Section picker (STUDIO_COMPOSITION §14 refinement).
-- Adds an editorial category to section_types and files the known vocabulary
-- into the reviewer's groups: Food · Event · Operations · Presentation.
-- Anything uncategorized (including tenant-coined types) renders under
-- General — the picker degrades gracefully on a pre-migration database.
alter table section_types add column if not exists category text;

update section_types set category = 'Food' where category is null and lower(name) in
  ('cocktail hour','dinner','dessert','late night','buffet','stations',
   'passed hors d''oeuvres','kids','beverage','beverages');
update section_types set category = 'Event' where category is null and lower(name) in
  ('ceremony','reception','welcome','timeline');
update section_types set category = 'Operations' where category is null and lower(name) in
  ('rentals','staffing','logistics');
update section_types set category = 'Presentation' where category is null and lower(name) in
  ('floral','lighting','photography','entertainment');
