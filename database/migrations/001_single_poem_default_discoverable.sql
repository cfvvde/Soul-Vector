-- SoulVector migration: allow a profile built from one poem and enable search by default.
-- Run once in the Supabase SQL Editor after the original SoulVector schema has been applied.

BEGIN;

ALTER TABLE public.sv_profiles
  ALTER COLUMN is_discoverable SET DEFAULT TRUE;

-- The product requirement is to include profiles in discovery without a checkbox.
UPDATE public.sv_profiles
SET is_discoverable = TRUE
WHERE is_discoverable IS DISTINCT FROM TRUE;

-- The original schema required 3–5 poems. Replace that constraint with 1–5.
ALTER TABLE public.sv_profiles
  DROP CONSTRAINT IF EXISTS sv_profiles_poem_count_check;

ALTER TABLE public.sv_profiles
  ADD CONSTRAINT sv_profiles_poem_count_check
  CHECK (poem_count BETWEEN 1 AND 5);

COMMIT;
