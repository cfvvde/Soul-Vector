import assert from "node:assert/strict";
import { calculateStylometry, STYLOMETRY_DIMENSIONS, STYLOMETRY_VERSION } from "../lib/stylometry";
import { analyzeRussianMorphology } from "../lib/russian-morphology";

const pushkinLike = `Я вас любил: любовь ещё, быть может,
В душе моей угасла не совсем;
Но пусть она вас больше не тревожит;
Я не хочу печалить вас ничем.`;
const reflectiveProseVerse = `Я думаю о том, как человек выбирает слова.
Но мысль меняется, когда я возвращаюсь к началу.
Возможно, ответ не один, и потому я задаю вопрос.`;

async function main() {
  const firstMorphology = await analyzeRussianMorphology([pushkinLike]);
  const repeatedMorphology = await analyzeRussianMorphology([pushkinLike]);
  const otherMorphology = await analyzeRussianMorphology([reflectiveProseVerse]);
  const first = calculateStylometry([pushkinLike], firstMorphology);
  const repeat = calculateStylometry([pushkinLike], repeatedMorphology);
  const other = calculateStylometry([reflectiveProseVerse], otherMorphology);

  assert.equal(first.dimensions, STYLOMETRY_DIMENSIONS);
  assert.equal(first.vector.length, 640);
  assert.equal(first.version, STYLOMETRY_VERSION);
  assert.deepEqual(first.vector, repeat.vector, "style vector must be deterministic");
  assert.notDeepEqual(first.vector, other.vector, "different forms should not yield identical fingerprints");
  const norm = Math.sqrt(first.vector.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-6, "style vector should be L2-normalized");
  assert.ok(firstMorphology.metrics.morphologyCoverage > 0.9, "Russian morphology should parse most tokens");
  console.log("Russian stylometry self-check passed:", {
    version: first.version,
    dimensions: first.dimensions,
    words: first.wordCount,
    norm: Number(norm.toFixed(8)),
    morphologyCoverage: firstMorphology.metrics.morphologyCoverage,
    nounsPer100: firstMorphology.metrics.posNounPer100,
    verbsPer100: firstMorphology.metrics.posVerbPer100,
  });
}

main().catch((error: unknown) => {
  console.error("Russian stylometry self-check failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
