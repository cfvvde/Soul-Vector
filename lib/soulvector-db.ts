import type { Pool, PoolClient } from "pg";
import { STYLOMETRY_DIMENSIONS, STYLOMETRY_VERSION } from "@/lib/stylometry";
import { REASONING_DIMENSIONS, REASONING_VERSION } from "@/lib/reasoning-analysis";

export type MatchProfile = {
  profileId: string;
  displayName: string;
  poemCount: number;
  sampleWords: number;
  similarity: number;
  reasoningSimilarity: number;
  semanticSimilarity: number;
  styleSimilarity: number;
};

export const RANKING_WEIGHTS = {
  reasoning: 0.6,
  semantic: 0.32,
  style: 0.08,
} as const;
export const RANKING_METHOD = "reasoning-60-semantic-32-style-8-v1";

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function vectorLiteral(values: number[], expectedDimensions: number, label: string): string {
  if (values.length !== expectedDimensions || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid ${label} vector; expected ${expectedDimensions} finite numbers.`);
  }
  return `[${values.join(",")}]`;
}

export function toPgVector(values: number[]): string {
  return vectorLiteral(values, 1024, "semantic");
}

export function toPgStyleVector(values: number[]): string {
  return vectorLiteral(values, STYLOMETRY_DIMENSIONS, "stylometric");
}

export function toPgReasoningVector(values: number[]): string {
  return vectorLiteral(values, REASONING_DIMENSIONS, "reasoning");
}

function parseVector(value: unknown, expectedDimensions: number): number[] | null {
  if (typeof value !== "string" || value.length < 3) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const numbers = trimmed.slice(1, -1).split(",").map((part) => Number(part.trim()));
  if (numbers.length !== expectedDimensions || numbers.some((number) => !Number.isFinite(number))) return null;
  return numbers;
}

export function parsePgVector(value: unknown): number[] | null {
  return parseVector(value, 1024);
}

export function parsePgStyleVector(value: unknown): number[] | null {
  return parseVector(value, STYLOMETRY_DIMENSIONS);
}

export function parsePgReasoningVector(value: unknown): number[] | null {
  return parseVector(value, REASONING_DIMENSIONS);
}

/**
 * Find candidates from the union of nearest-neighbour sets for all three signals.
 * The reasoning feature vector stores 12 rubric scores in [0,1]; its Euclidean
 * distance is scaled by sqrt(12) before being presented as a 0..1 similarity.
 */
export async function findMatches(
  db: Pool | PoolClient,
  profileId: string,
  semanticVectorLiteral: string,
  reasoningVectorLiteral: string,
  styleVectorLiteral: string,
  limit = 10,
): Promise<MatchProfile[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 20);
  const candidateLimit = Math.min(Math.max(safeLimit * 10, 100), 250);
  const result = await db.query<{
    profileId: string;
    displayName: string;
    poemCount: number | string;
    sampleWords: number | string;
    similarity: number | string;
    reasoningSimilarity: number | string;
    semanticSimilarity: number | string;
    styleSimilarity: number | string;
  }>(
    `
      WITH candidate_ids AS (
        (
          SELECT profile_id FROM public.sv_profiles
          WHERE is_discoverable = TRUE AND profile_id <> $1::uuid
            AND embedding_model = 'bge-m3'
            AND style_version = $5::text
            AND reasoning_version = $6::text
            AND author_style_embedding IS NOT NULL
            AND reasoning_embedding IS NOT NULL
          ORDER BY reasoning_embedding OPERATOR(extensions.<->) $3::extensions.vector
          LIMIT $7::integer
        )
        UNION
        (
          SELECT profile_id FROM public.sv_profiles
          WHERE is_discoverable = TRUE AND profile_id <> $1::uuid
            AND embedding_model = 'bge-m3'
            AND style_version = $5::text
            AND reasoning_version = $6::text
            AND author_style_embedding IS NOT NULL
            AND reasoning_embedding IS NOT NULL
          ORDER BY embedding OPERATOR(extensions.<=>) $2::extensions.vector
          LIMIT $7::integer
        )
        UNION
        (
          SELECT profile_id FROM public.sv_profiles
          WHERE is_discoverable = TRUE AND profile_id <> $1::uuid
            AND embedding_model = 'bge-m3'
            AND style_version = $5::text
            AND reasoning_version = $6::text
            AND author_style_embedding IS NOT NULL
            AND reasoning_embedding IS NOT NULL
          ORDER BY author_style_embedding OPERATOR(extensions.<=>) $4::extensions.vector
          LIMIT $7::integer
        )
      ), distances AS (
        SELECT
          p.profile_id,
          p.display_name,
          p.poem_count,
          p.style_word_count,
          p.reasoning_embedding OPERATOR(extensions.<->) $3::extensions.vector AS reasoning_distance,
          p.embedding OPERATOR(extensions.<=>) $2::extensions.vector AS semantic_distance,
          p.author_style_embedding OPERATOR(extensions.<=>) $4::extensions.vector AS style_distance
        FROM public.sv_profiles p
        INNER JOIN candidate_ids c ON c.profile_id = p.profile_id
        WHERE p.is_discoverable = TRUE
          AND p.profile_id <> $1::uuid
          AND p.embedding_model = 'bge-m3'
          AND p.style_version = $5::text
          AND p.reasoning_version = $6::text
          AND p.author_style_embedding IS NOT NULL
          AND p.reasoning_embedding IS NOT NULL
      ), component_scores AS (
        SELECT
          profile_id,
          display_name,
          poem_count,
          COALESCE(style_word_count, 0) AS sample_words,
          GREATEST(0.0, LEAST(1.0, 1.0 - (reasoning_distance / sqrt(${REASONING_DIMENSIONS}.0)))) AS reasoning_similarity,
          GREATEST(0.0, LEAST(1.0, 1.0 - semantic_distance)) AS semantic_similarity,
          GREATEST(0.0, LEAST(1.0, 1.0 - style_distance)) AS style_similarity
        FROM distances
      )
      SELECT
        profile_id::text AS "profileId",
        display_name AS "displayName",
        poem_count AS "poemCount",
        sample_words AS "sampleWords",
        reasoning_similarity AS "reasoningSimilarity",
        semantic_similarity AS "semanticSimilarity",
        style_similarity AS "styleSimilarity",
        ($8::float8 * reasoning_similarity + $9::float8 * semantic_similarity + $10::float8 * style_similarity) AS similarity
      FROM component_scores
      ORDER BY similarity DESC
      LIMIT $11::integer
    `,
    [
      profileId,
      semanticVectorLiteral,
      reasoningVectorLiteral,
      styleVectorLiteral,
      STYLOMETRY_VERSION,
      REASONING_VERSION,
      candidateLimit,
      RANKING_WEIGHTS.reasoning,
      RANKING_WEIGHTS.semantic,
      RANKING_WEIGHTS.style,
      safeLimit,
    ],
  );

  return result.rows.map((row) => ({
    profileId: row.profileId,
    displayName: row.displayName,
    poemCount: Number(row.poemCount),
    sampleWords: Number(row.sampleWords),
    similarity: Number(Number(row.similarity).toFixed(4)),
    reasoningSimilarity: Number(Number(row.reasoningSimilarity).toFixed(4)),
    semanticSimilarity: Number(Number(row.semanticSimilarity).toFixed(4)),
    styleSimilarity: Number(Number(row.styleSimilarity).toFixed(4)),
  }));
}

export function getDatabaseErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/DATABASE_URL не задан/.test(message)) return message;
  if (/relation "(?:public\.)?sv_profiles" does not exist|relation "(?:public\.)?sv_poems" does not exist/i.test(message)) {
    return "Таблицы SoulVector ещё не созданы. Выполни SQL-файл database/soulvector.sql в Supabase SQL Editor.";
  }
  if (/column .*reasoning_embedding.* does not exist|column .*reasoning_version.* does not exist|column .*reasoning_analysis.* does not exist|expected 12 dimensions, not|vector dimensions must match/i.test(message)) {
    return "База не обновлена для третьего этапа анализа. Выполни database/migrations/005_reasoning_analysis.sql в Supabase SQL Editor.";
  }
  if (/expected (?:512|640) dimensions, not|expected 48 dimensions, not 512|expected 512 dimensions, not 640|different vector dimensions/i.test(message)) {
    return "Размерность стилометрии изменилась. Выполни database/migrations/004_russian_stylometry_v3.sql в Supabase SQL Editor, затем пересчитай профили.";
  }
  if (/column .*author_style_embedding.* does not exist|column .*style_version.* does not exist|column .*style_metrics.* does not exist/i.test(message)) {
    return "База ещё не обновлена для стилометрии. Выполни миграции 002_stylometry_profile.sql, 003_russian_stylometry_v2.sql и 004_russian_stylometry_v3.sql.";
  }
  if (/violates check constraint "sv_profiles_poem_count_check"/i.test(message)) {
    return "База всё ещё требует минимум три стихотворения. Выполни миграцию 001_single_poem_default_discoverable.sql.";
  }
  if (/schema "extensions" does not exist|type "extensions\.vector" does not exist|operator does not exist.*<=>|operator class .*vector_cosine_ops|operator does not exist.*<->/i.test(message)) {
    return "Расширение pgvector не настроено в схеме extensions. Включи расширение vector в Supabase и выполни database/soulvector.sql.";
  }
  if (/password authentication failed|no password supplied|invalid authorization specification/i.test(message)) {
    return "PostgreSQL отклонил подключение. Проверь DATABASE_URL и пароль базы в .env.local.";
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|connection terminated|Connection terminated unexpectedly/i.test(message)) {
    return "Не удалось подключиться к PostgreSQL. Проверь DATABASE_URL, сетевое подключение и доступность базы.";
  }

  console.error("SoulVector database operation failed:", message);
  return "Не удалось сохранить профиль в PostgreSQL. Проверь строку подключения и SQL-миграции SoulVector.";
}
