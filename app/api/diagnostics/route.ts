import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getDatabaseErrorMessage, isUuid } from "@/lib/soulvector-db";
import { STYLOMETRY_DIMENSIONS, STYLOMETRY_VERSION } from "@/lib/stylometry";
import { REASONING_DIMENSIONS, REASONING_VERSION } from "@/lib/reasoning-analysis";

// This diagnostics endpoint is intended for local development only.
// It only exposes demo profiles plus the current browser profile, and never returns raw vectors or poems.
type ProfileRow = {
  profileId: string;
  displayName: string;
  poemCount: number | string;
  styleWordCount: number | string | null;
  styleVersion: string | null;
  reasoningVersion: string | null;
  semanticVectorText: string;
  styleVectorText: string | null;
  reasoningVectorText: string | null;
};

type DiagnosticProfile = {
  profileId: string;
  displayName: string;
  poemCount: number;
  styleWordCount: number;
  isCurrentProfile: boolean;
  styleReady: boolean;
  reasoningReady: boolean;
  semanticVector: number[];
  styleVector: number[] | null;
  reasoningVector: number[] | null;
};

function parseVector(value: unknown, expectedDimensions: number): number[] | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const values = trimmed.slice(1, -1).split(",").map((part) => Number(part.trim()));
  if (values.length !== expectedDimensions || values.some((value) => !Number.isFinite(value))) return null;
  return values;
}

function cosine(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  let dot = 0;
  let aSquare = 0;
  let bSquare = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aSquare += a[i] * a[i];
    bSquare += b[i] * b[i];
  }
  const denominator = Math.sqrt(aSquare) * Math.sqrt(bSquare);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  // Displayed values follow the app's existing 0..1 similarity scale.
  return Number(Math.max(0, Math.min(1, dot / denominator)).toFixed(4));
}

function euclideanSimilarity(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  const squaredDistance = a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);
  const scaledDistance = Math.sqrt(squaredDistance) / Math.sqrt(REASONING_DIMENSIONS);
  return Number(Math.max(0, Math.min(1, 1 - scaledDistance)).toFixed(4));
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Диагностика доступна только в режиме разработки." }, { status: 404 });
  }

  const url = new URL(request.url);
  const rawProfileId = url.searchParams.get("profileId");
  if (rawProfileId && !isUuid(rawProfileId)) {
    return NextResponse.json({ error: "Некорректный ID профиля." }, { status: 400 });
  }
  const currentProfileId = rawProfileId || null;

  try {
    const pool = getPool();
    const result = await pool.query<ProfileRow>(
      `
        SELECT
          profile_id::text AS "profileId",
          display_name AS "displayName",
          poem_count AS "poemCount",
          COALESCE(style_word_count, 0) AS "styleWordCount",
          style_version AS "styleVersion",
          reasoning_version AS "reasoningVersion",
          embedding::text AS "semanticVectorText",
          author_style_embedding::text AS "styleVectorText",
          reasoning_embedding::text AS "reasoningVectorText"
        FROM public.sv_profiles
        WHERE is_discoverable = TRUE
          AND (
            display_name LIKE 'ДЕМО · %'
            OR ($1::uuid IS NOT NULL AND profile_id = $1::uuid)
          )
        ORDER BY
          CASE WHEN profile_id = $1::uuid THEN 0 ELSE 1 END,
          display_name ASC
        LIMIT 30
      `,
      [currentProfileId],
    );

    const profiles: DiagnosticProfile[] = result.rows.flatMap((row) => {
      const semanticVector = parseVector(row.semanticVectorText, 1024);
      if (!semanticVector) return [];
      const styleVector = row.styleVersion === STYLOMETRY_VERSION
        ? parseVector(row.styleVectorText, STYLOMETRY_DIMENSIONS)
        : null;
      const reasoningVector = row.reasoningVersion === REASONING_VERSION
        ? parseVector(row.reasoningVectorText, REASONING_DIMENSIONS)
        : null;
      return [{
        profileId: row.profileId,
        displayName: row.displayName,
        poemCount: Number(row.poemCount),
        styleWordCount: Number(row.styleWordCount ?? 0),
        isCurrentProfile: row.profileId === currentProfileId,
        styleReady: Boolean(styleVector),
        reasoningReady: Boolean(reasoningVector),
        semanticVector,
        styleVector,
        reasoningVector,
      }];
    });

    const publicProfiles = profiles.map((profile) => ({
      profileId: profile.profileId,
      displayName: profile.displayName,
      poemCount: profile.poemCount,
      styleWordCount: profile.styleWordCount,
      isCurrentProfile: profile.isCurrentProfile,
      styleReady: profile.styleReady,
      reasoningReady: profile.reasoningReady,
    }));
    const pairs: Array<{
      key: string;
      left: (typeof publicProfiles)[number];
      right: (typeof publicProfiles)[number];
      semanticSimilarity: number | null;
      styleSimilarity: number | null;
      reasoningSimilarity: number | null;
    }> = [];

    for (let i = 0; i < profiles.length; i += 1) {
      for (let j = i + 1; j < profiles.length; j += 1) {
        const left = profiles[i];
        const right = profiles[j];
        const semanticSimilarity = cosine(left.semanticVector, right.semanticVector);
        const styleSimilarity = left.styleVector && right.styleVector
          ? cosine(left.styleVector, right.styleVector)
          : null;
        const reasoningSimilarity = left.reasoningVector && right.reasoningVector
          ? euclideanSimilarity(left.reasoningVector, right.reasoningVector)
          : null;
        const ids = [left.profileId, right.profileId].sort();
        pairs.push({
          key: `${ids[0]}::${ids[1]}`,
          left: publicProfiles[i],
          right: publicProfiles[j],
          semanticSimilarity,
          styleSimilarity,
          reasoningSimilarity,
        });
      }
    }

    return NextResponse.json({
      currentProfileId,
      profiles: publicProfiles,
      pairs,
      styleVersion: STYLOMETRY_VERSION,
      reasoningVersion: REASONING_VERSION,
      developmentOnly: true,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("SoulVector diagnostics API failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: getDatabaseErrorMessage(error) }, { status: 503 });
  }
}
