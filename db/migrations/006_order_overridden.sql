-- Slice 4 QA (second pass): editing a generated shopping line no longer
-- converts it to a duplicate manual line — it overrides the generated line
-- in place instead. `overridden` marks a generated row (key IS NOT NULL)
-- whose name/quantity/unit/aisle/checked were hand-edited and must be
-- preserved verbatim across regeneration, until "Undo edit" clears it.

ALTER TABLE fm_shopping_items ADD COLUMN IF NOT EXISTS overridden boolean not null default false;
