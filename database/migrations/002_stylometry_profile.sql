-- SoulVector stylometry v1 migration.
-- Adds a separate 48-dimensional writing-style fingerprint beside BGE-M3 semantic vectors.
-- Existing profiles will have NULL style vectors until their owners re-run analysis.

ALTER TABLE public.sv_profiles
  ADD COLUMN IF NOT EXISTS author_style_embedding extensions.vector(48),
  ADD COLUMN IF NOT EXISTS style_version text,
  ADD COLUMN IF NOT EXISTS style_word_count integer,
  ADD COLUMN IF NOT EXISTS style_metrics jsonb;

CREATE INDEX IF NOT EXISTS sv_profiles_author_style_hnsw_idx
  ON public.sv_profiles
  USING hnsw (author_style_embedding extensions.vector_cosine_ops)
  WHERE author_style_embedding IS NOT NULL;

COMMENT ON COLUMN public.sv_profiles.author_style_embedding IS
  'Experimental 48-dimensional stylometric fingerprint. Not a personality or cognitive-trait measurement.';
COMMENT ON COLUMN public.sv_profiles.style_metrics IS
  'Descriptive text-level statistics. Adjective/adverb/verb endings are approximate regex heuristics, not POS tags.';
