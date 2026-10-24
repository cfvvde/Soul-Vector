import type { Pool } from "pg";
import { STYLOMETRY_DIMENSIONS, STYLOMETRY_VERSION } from "../lib/stylometry";
import { REASONING_DIMENSIONS, REASONING_VERSION } from "../lib/reasoning-analysis";

const SEMANTIC_DIMENSIONS = 1024;
const REASONING_WEIGHT = 0.60;
const SEMANTIC_WEIGHT = 0.32;
const STYLE_WEIGHT = 0.08;

type DemoProfileRow = {
  profileId: string;
  displayName: string;
  poemCount: number | string;
  embeddingModel: string;
  styleVersion: string | null;
  reasoningVersion: string | null;
  semanticVectorText: string;
  styleVectorText: string | null;
  reasoningVectorText: string | null;
};

type DemoProfile = {
  profileId: string;
  displayName: string;
  author: string;
  poemCount: number;
  semanticVector: number[];
  styleVector: number[];
  reasoningVector: number[];
};

type SimilarityPair = {
  a: DemoProfile;
  b: DemoProfile;
  semantic: number;
  style: number;
  reasoning: number;
  combined: number;
  sameAuthor: boolean;
};

function parseVector(value: unknown, expectedDimensions: number): number[] | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const values = trimmed.slice(1, -1).split(",").map((part) => Number(part.trim()));
  if (values.length !== expectedDimensions || values.some((number) => !Number.isFinite(number))) return null;
  return values;
}

function cosineSimilarity(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length === 0) return null;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return Math.max(0, Math.min(1, dot / denominator));
}

function reasoningSimilarity(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length === 0) return null;
  const squareDistance = left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0);
  const normalizedDistance = Math.sqrt(squareDistance) / Math.sqrt(left.length);
  return Math.max(0, Math.min(1, 1 - normalizedDistance));
}

function authorKey(displayName: string): string {
  return displayName
    .replace(/^ДЕМО\s*·\s*/u, "")
    .split(/\s+—\s+/u)[0]
    .trim()
    .toLocaleLowerCase("ru-RU");
}

function fmt(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(3);
}

export async function printDemoSimilarityReport(pool: Pool): Promise<void> {
  const result = await pool.query<DemoProfileRow>(`
    SELECT
      profile_id::text AS "profileId",
      display_name AS "displayName",
      poem_count AS "poemCount",
      embedding_model AS "embeddingModel",
      style_version AS "styleVersion",
      reasoning_version AS "reasoningVersion",
      embedding::text AS "semanticVectorText",
      author_style_embedding::text AS "styleVectorText",
      reasoning_embedding::text AS "reasoningVectorText"
    FROM public.sv_profiles
    WHERE display_name LIKE 'ДЕМО · %'
    ORDER BY display_name ASC
  `);

  const profiles: DemoProfile[] = [];
  const skipped: string[] = [];
  for (const row of result.rows) {
    const semanticVector = row.embeddingModel === "bge-m3" ? parseVector(row.semanticVectorText, SEMANTIC_DIMENSIONS) : null;
    const styleVector = row.styleVersion === STYLOMETRY_VERSION ? parseVector(row.styleVectorText, STYLOMETRY_DIMENSIONS) : null;
    const reasoningVector = row.reasoningVersion === REASONING_VERSION ? parseVector(row.reasoningVectorText, REASONING_DIMENSIONS) : null;
    if (!semanticVector || !styleVector || !reasoningVector) {
      const missing = [!semanticVector ? "semantic" : null, !styleVector ? "style" : null, !reasoningVector ? "reasoning" : null].filter(Boolean).join(" + ");
      skipped.push(`${row.displayName} (missing/outdated ${missing})`);
      continue;
    }
    profiles.push({
      profileId: row.profileId,
      displayName: row.displayName,
      author: authorKey(row.displayName),
      poemCount: Number(row.poemCount),
      semanticVector,
      styleVector,
      reasoningVector,
    });
  }

  console.log("\n============================================================");
  console.log("SoulVector · three-stage demo-author similarity report");
  console.log("============================================================");
  console.log(`Demo profiles in database: ${result.rows.length}`);
  console.log(`Profiles ready for comparison: ${profiles.length}`);
  console.log(`Reasoning profile: ${REASONING_VERSION} (${REASONING_DIMENSIONS} rubric dimensions)`);
  console.log(`Style profile: ${STYLOMETRY_VERSION} (${STYLOMETRY_DIMENSIONS} dimensions)`);
  console.log("Ranking formula (experimental): 60% reasoning + 32% meaning + 8% writing style");

  if (skipped.length) {
    console.warn("\nProfiles skipped because their vectors are missing/outdated:");
    for (const name of skipped) console.warn(`  - ${name}`);
    console.warn("Run seed-demo.ts with --force to regenerate the full three-stage profile.");
  }

  const pairs: SimilarityPair[] = [];
  for (let i = 0; i < profiles.length; i += 1) {
    for (let j = i + 1; j < profiles.length; j += 1) {
      const a = profiles[i];
      const b = profiles[j];
      const semantic = cosineSimilarity(a.semanticVector, b.semanticVector);
      const style = cosineSimilarity(a.styleVector, b.styleVector);
      const reasoning = reasoningSimilarity(a.reasoningVector, b.reasoningVector);
      if (semantic === null || style === null || reasoning === null) continue;
      pairs.push({
        a,
        b,
        semantic,
        style,
        reasoning,
        combined: REASONING_WEIGHT * reasoning + SEMANTIC_WEIGHT * semantic + STYLE_WEIGHT * style,
        sameAuthor: a.author === b.author,
      });
    }
  }

  if (!pairs.length) {
    console.log("Not enough current profiles for a pairwise report. Run the seed script after migration 005 and install the reasoning model.\n");
    return;
  }

  const compare = (left: SimilarityPair, right: SimilarityPair) => right.combined - left.combined;
  pairs.sort(compare);
  const sameAuthorPairs = pairs.filter((pair) => pair.sameAuthor).sort(compare);
  const crossAuthorPairs = pairs.filter((pair) => !pair.sameAuthor).sort(compare);

  console.log(`\nComparisons calculated: ${pairs.length}\n`);
  console.log("SAME-AUTHOR CONTROLS (different thematic subsets, if available)");
  if (!sameAuthorPairs.length) console.log("  No same-author control pairs in the current demo corpus.");
  else for (const pair of sameAuthorPairs) {
    console.log(`  ${fmt(pair.combined)} total | reasoning ${fmt(pair.reasoning)} | semantic ${fmt(pair.semantic)} | style ${fmt(pair.style)} | ${pair.a.displayName}  <->  ${pair.b.displayName}`);
  }

  console.log("\nTOP CROSS-AUTHOR PAIRS (sorted by 60/32/8 score)");
  for (const [index, pair] of crossAuthorPairs.slice(0, 30).entries()) {
    console.log(`  ${(index + 1).toString().padStart(2, "0")}. ${fmt(pair.combined)} total | reasoning ${fmt(pair.reasoning)} | semantic ${fmt(pair.semantic)} | style ${fmt(pair.style)} | ${pair.a.displayName}  <->  ${pair.b.displayName}`);
  }

  console.log("\nALL PAIRS (descending by score)");
  for (const pair of pairs) {
    console.log(`  ${fmt(pair.combined)} | reasoning=${fmt(pair.reasoning)} | sem=${fmt(pair.semantic)} | style=${fmt(pair.style)} | ${pair.sameAuthor ? "SAME-AUTHOR" : "CROSS-AUTHOR"} | ${pair.a.displayName}  <->  ${pair.b.displayName}`);
  }
  console.log("\nReminder: reasoning scores are local-LLM rubric similarities based on text evidence. These values are exploratory and not validated measures of actual thinking/personality.\n");
}
