import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import {
  findMatches,
  getDatabaseErrorMessage,
  isUuid,
  parsePgVector,
  parsePgStyleVector,
  parsePgReasoningVector,
  toPgStyleVector,
  toPgVector,
  toPgReasoningVector,
  RANKING_METHOD,
  RANKING_WEIGHTS,
} from "@/lib/soulvector-db";
import { parseStylometryMetrics, STYLOMETRY_VERSION } from "@/lib/stylometry";
import { parseReasoningProfile, REASONING_VERSION } from "@/lib/reasoning-analysis";


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function databaseFailure(error: unknown) {
  console.error(
    "SoulVector profile API failed:",
    error instanceof Error ? error.message : error,
  );
  return NextResponse.json({ error: getDatabaseErrorMessage(error) }, { status: 503 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId");

  if (!isUuid(profileId)) {
    return NextResponse.json(
      { error: "Нужен корректный ID профиля." },
      { status: 400 },
    );
  }

  try {
    const pool = getPool();
    const profileResult = await pool.query<{
      profileId: string;
      displayName: string;
      isDiscoverable: boolean;
      poemCount: number;
      embeddingModel: string;
      embeddingText: string;
      authorStyleVectorText: string | null;
      styleVersion: string | null;
      styleWordCount: number | null;
      styleMetrics: unknown;
      reasoningVectorText: string | null;
      reasoningVersion: string | null;
      reasoningAnalysis: unknown;
      updatedAt: Date;
    }>(
      `
        SELECT
          profile_id::text AS "profileId",
          display_name AS "displayName",
          is_discoverable AS "isDiscoverable",
          poem_count AS "poemCount",
          embedding_model AS "embeddingModel",
          embedding::text AS "embeddingText",
          author_style_embedding::text AS "authorStyleVectorText",
          style_version AS "styleVersion",
          style_word_count AS "styleWordCount",
          style_metrics AS "styleMetrics",
          reasoning_embedding::text AS "reasoningVectorText",
          reasoning_version AS "reasoningVersion",
          reasoning_analysis AS "reasoningAnalysis",
          updated_at AS "updatedAt"
        FROM public.sv_profiles
        WHERE profile_id = $1::uuid
      `,
      [profileId],
    );

    const row = profileResult.rows[0];
    if (!row) {
      return NextResponse.json({ profile: null, poems: [], analysis: null, matches: [] });
    }

    const profileVector = parsePgVector(row.embeddingText);
    if (!profileVector) {
      return NextResponse.json(
        { error: "Не удалось прочитать сохранённый вектор профиля." },
        { status: 500 },
      );
    }

    const profileVectorSql = toPgVector(profileVector);
    const styleVector = parsePgStyleVector(row.authorStyleVectorText);
    const styleVectorSql = styleVector ? toPgStyleVector(styleVector) : null;
    const reasoningVector = row.reasoningVersion === REASONING_VERSION
      ? parsePgReasoningVector(row.reasoningVectorText)
      : null;
    const reasoningVectorSql = reasoningVector ? toPgReasoningVector(reasoningVector) : null;
    const reasoningProfile = row.reasoningVersion === REASONING_VERSION
      ? parseReasoningProfile(row.reasoningAnalysis)
      : null;
    const authorStyle =
      row.styleVersion === STYLOMETRY_VERSION && styleVector && Number(row.styleWordCount) > 0
        ? {
            version: row.styleVersion,
            dimensions: styleVector.length,
            wordCount: Number(row.styleWordCount),
            metrics: parseStylometryMetrics(row.styleMetrics),
          }
        : null;
    const poemResult = await pool.query<{
      id: string;
      title: string;
      text: string;
      similarityToProfile: number | string;
    }>(
      `
        SELECT
          client_poem_id AS id,
          title,
          body AS text,
          1.0 - (embedding OPERATOR(extensions.<=>) $2::extensions.vector) AS "similarityToProfile"
        FROM public.sv_poems
        WHERE profile_id = $1::uuid
        ORDER BY created_at ASC, id ASC
      `,
      [profileId, profileVectorSql],
    );

    const poems = poemResult.rows.map((poem) => ({
      id: poem.id,
      title: poem.title,
      text: poem.text,
    }));

    const poemScores = poemResult.rows.map((poem) => ({
      id: poem.id,
      title: poem.title,
      similarityToProfile: Number(Number(poem.similarityToProfile).toFixed(3)),
    }));

    const matches = styleVectorSql && reasoningVectorSql && reasoningProfile
      ? await findMatches(pool, profileId, profileVectorSql, reasoningVectorSql, styleVectorSql, 10)
      : [];
    const profile = {
      profileId: row.profileId,
      displayName: row.displayName,
      isDiscoverable: row.isDiscoverable,
      poemCount: Number(row.poemCount),
      embeddingModel: row.embeddingModel,
      updatedAt: new Date(row.updatedAt).toISOString(),
    };

    return NextResponse.json({
      profile,
      poems,
      matches,
      analysis: {
        model: row.embeddingModel,
        dimensions: profileVector.length,
        poemCount: Number(row.poemCount),
        poems: poemScores,
        profileId: row.profileId,
        savedToDatabase: true,
        profile,
        profileVectorPreview: profileVector.slice(0, 12).map((value) => Number(value.toFixed(6))),
        authorStyle,
        reasoningProfile,
        pipelineStages: reasoningProfile ? [
          { id: "meaning", label: "Содержание и смысл", status: "completed", model: row.embeddingModel, details: `${profileVector.length} координат BGE-M3` },
          { id: "reasoning", label: "Способы развития мысли", status: "completed", model: reasoningProfile.model, details: `${reasoningProfile.dimensions} наблюдаемых признаков; ${reasoningProfile.analyzedPoemCount} текст(а)` },
          { id: "style", label: "Стиль русского текста", status: "completed", model: `pymorphy3 · ${STYLOMETRY_VERSION}`, details: `${authorStyle?.dimensions ?? 0} стилометрических признаков` },
        ] : [],
        ranking: {
          method: RANKING_METHOD,
          reasoningWeight: RANKING_WEIGHTS.reasoning,
          semanticWeight: RANKING_WEIGHTS.semantic,
          styleWeight: RANKING_WEIGHTS.style,
        },
        matches,
      },
    });
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON в запросе." }, { status: 400 });
  }

  if (!isRecord(body) || !isUuid(body.profileId)) {
    return NextResponse.json({ error: "Нужен корректный ID профиля." }, { status: 400 });
  }

  if (typeof body.displayName !== "string") {
    return NextResponse.json({ error: "Не передано имя профиля для обновления." }, { status: 400 });
  }

  const displayName = body.displayName.trim().slice(0, 40);
  if (displayName.length === 0) {
    return NextResponse.json({ error: "Имя профиля не может быть пустым." }, { status: 400 });
  }

  try {
    const pool = getPool();
    const result = await pool.query<{
      profileId: string;
      displayName: string;
      isDiscoverable: boolean;
    }>(
      `
        UPDATE public.sv_profiles
        SET
          display_name = $2::text,
          is_discoverable = TRUE,
          updated_at = now()
        WHERE profile_id = $1::uuid
        RETURNING
          profile_id::text AS "profileId",
          display_name AS "displayName",
          is_discoverable AS "isDiscoverable"
      `,
      [body.profileId, displayName],
    );

    const profile = result.rows[0];
    if (!profile) {
      return NextResponse.json(
        { error: "Профиль ещё не создан. Сначала проанализируй хотя бы одно стихотворение." },
        { status: 404 },
      );
    }

    return NextResponse.json({ profile });
  } catch (error) {
    return databaseFailure(error);
  }
}
