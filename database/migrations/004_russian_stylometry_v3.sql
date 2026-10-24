-- SoulVector Russian stylometry v3: real dictionary morphology + character n-grams.
-- Requires migration 003 to have been applied first. Clears older v2 style vectors,
-- but preserves poem text and 1024D BGE-M3 semantic embeddings.

DROP INDEX IF EXISTS public.sv_profiles_author_style_hnsw_idx;

ALTER TABLE public.sv_profiles
  ALTER COLUMN author_style_embedding
  TYPE extensions.vector(640)
  USING NULL::extensions.vector(640);

UPDATE public.sv_profiles
SET
  style_version = NULL,
  style_word_count = NULL,
  style_metrics = NULL,
  updated_at = now();

CREATE INDEX IF NOT EXISTS sv_profiles_author_style_hnsw_idx
  ON public.sv_profiles
  USING hnsw (author_style_embedding extensions.vector_cosine_ops)
  WHERE author_style_embedding IS NOT NULL;

COMMENT ON COLUMN public.sv_profiles.author_style_embedding IS
  'Experimental 640D Russian stylometric fingerprint: 80 statistical features, 128 pymorphy3 morphology features, 216 raw character n-grams, and 216 content-masked character n-grams. Not a personality/cognition measure.';

COMMENT ON COLUMN public.sv_profiles.style_version IS
  'Stylometry schema version used to compute author_style_embedding. Profiles need re-analysis whenever this version changes.';
