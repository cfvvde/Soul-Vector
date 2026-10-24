/**
 * Russian-focused experimental stylometry for SoulVector.
 * v3 combines interpretable statistics, real dictionary morphology from
 * pymorphy3, raw Russian character n-grams, and a content-masked n-gram view.
 * It compares writing features; it does not measure personality or cognition.
 */


export const STYLOMETRY_VERSION = "ru-stylometry-v3-pymorphy3-chargrams";
export const STYLOMETRY_DIMENSIONS = 640;
export const MORPHOLOGY_DIMENSIONS = 128;
const HANDCRAFTED_DIMENSIONS = 80;
const RAW_NGRAM_DIMENSIONS = 216;
const MASKED_NGRAM_DIMENSIONS = 216;

export type StylometryMetrics = {
  averageWordLength: number;
  lexicalDiversityRatio: number;
  averageWordsPerLine: number;
  averageWordsPerSegment: number;
  firstPersonPronounsPer100: number;
  secondPersonPronounsPer100: number;
  negationsPer100: number;
  punctuationPer100: number;
  repeatedWordRatio: number;
  shortWordRatio: number;
  hyphenatedWordRatio: number;
  commonFunctionWordsPer100: number;
  adjectiveEndingHeuristicPer100: number;
  adverbEndingHeuristicPer100: number;
  verbEndingHeuristicPer100: number;
  infinitiveHeuristicPer100: number;
  participleEndingHeuristicPer100: number;
  gerundEndingHeuristicPer100: number;
  averageVowelsPerWord: number;
  averageCharactersPerLine: number;
  repeatedLineEndingRatio: number;
  characterNgramCoverage: number;
  posNounPer100: number;
  posAdjectivePer100: number;
  posVerbPer100: number;
  posAdverbPer100: number;
  posPronounPer100: number;
  posConjunctionPer100: number;
  posPrepositionPer100: number;
  posParticlePer100: number;
  posInfinitivePer100: number;
  posParticiplePer100: number;
  posGerundPer100: number;
  genitiveCasePer100: number;
  pastTensePer100: number;
  presentTensePer100: number;
  firstPersonGrammemePer100: number;
  morphologyCoverage: number;
  averageDictionaryParsesPerWord: number;
};

export type RussianMorphologyMetricSet = Pick<StylometryMetrics,
  | "posNounPer100" | "posAdjectivePer100" | "posVerbPer100" | "posAdverbPer100"
  | "posPronounPer100" | "posConjunctionPer100" | "posPrepositionPer100" | "posParticlePer100"
  | "posInfinitivePer100" | "posParticiplePer100" | "posGerundPer100" | "genitiveCasePer100"
  | "pastTensePer100" | "presentTensePer100" | "firstPersonGrammemePer100" | "morphologyCoverage"
  | "averageDictionaryParsesPerWord"
>;

export type RussianMorphologyFeatureInput = {
  vector: number[];
  analyzedTokens: number;
  metrics: RussianMorphologyMetricSet;
};

export type StylometryProfile = {
  version: string;
  dimensions: number;
  wordCount: number;
  vector: number[];
  metrics: StylometryMetrics;
};

const WORD_RE = /[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*/gu;
const VOWELS = new Set(["а", "е", "ё", "и", "о", "у", "ы", "э", "ю", "я"]);

const FIRST_SINGULAR = new Set(["я", "меня", "мне", "мной", "мною"]);
const SECOND_SINGULAR = new Set(["ты", "тебя", "тебе", "тобой", "тобою"]);
const THIRD_PERSON = new Set(["он", "она", "оно", "они", "его", "ее", "её", "ему", "ей", "им", "ими", "них", "него", "нее", "неё"]);
const FIRST_PLURAL = new Set(["мы", "нас", "нам", "нами"]);
const SECOND_PLURAL = new Set(["вы", "вас", "вам", "вами"]);
const POSSESSIVES = new Set(["мой", "моя", "мое", "моё", "мои", "твой", "твоя", "твое", "твоё", "твои", "наш", "наша", "наше", "наши", "ваш", "ваша", "ваше", "ваши", "свой", "своя", "свое", "своё", "свои"]);
const CONJUNCTIONS = new Set(["и", "а", "но", "или", "либо", "да", "однако", "зато", "хотя", "если", "чтобы", "пока", "будто", "словно", "как", "когда", "потому", "поскольку", "ибо", "чем", "чтоб"]);
const PREPOSITIONS = new Set(["в", "во", "на", "с", "со", "к", "ко", "у", "от", "до", "по", "из", "за", "под", "над", "при", "для", "без", "через", "между", "около", "перед", "после", "об", "обо", "о", "про", "сквозь"]);
const PARTICLES = new Set(["бы", "б", "ли", "же", "ж", "ведь", "вот", "лишь", "даже", "только", "пусть", "уж", "все-таки", "то", "неужели", "разве"]);
const NEGATIONS = new Set(["не", "ни", "нет", "нельзя", "никогда", "нигде", "ничего", "никто", "никак", "нисколько", "нимало"]);
const ADVERSATIVES = new Set(["но", "однако", "зато", "хотя", "впрочем", "напротив", "вместо"]);
const CAUSAL = new Set(["потому", "поскольку", "ибо", "поэтому", "значит", "следовательно", "ведь", "оттого"]);
const MODAL_UNCERTAINTY = new Set(["может", "возможно", "вероятно", "кажется", "наверное", "пожалуй", "будто", "видимо", "должен", "должна", "нужно", "надо", "следует", "думаю", "полагаю", "верно", "точно"]);
const TEMPORAL = new Set(["сегодня", "вчера", "завтра", "теперь", "тогда", "потом", "затем", "сначала", "раньше", "позже", "всегда", "никогда", "уже", "ещё", "еще", "пока", "вскоре", "ныне", "прежде"]);
const SPATIAL = new Set(["здесь", "там", "туда", "сюда", "оттуда", "где", "куда", "рядом", "вокруг", "внутри", "снаружи", "вдали", "близко", "впереди", "вверху", "внизу"]);
const COMMON_FUNCTION_WORDS = new Set([
  ...FIRST_SINGULAR, ...SECOND_SINGULAR, ...THIRD_PERSON, ...FIRST_PLURAL, ...SECOND_PLURAL,
  ...POSSESSIVES, ...CONJUNCTIONS, ...PREPOSITIONS, ...PARTICLES, ...NEGATIONS,
  "что", "это", "тот", "та", "те", "то", "кто", "чей", "чья", "чье", "чьи", "весь", "вся", "всё", "все", "сам", "сама", "само", "сами",
  "ли", "уж", "ведь", "лишь", "же", "ж", "бы", "б", "пусть", "даже", "только", "уже", "еще", "ещё", "нибудь", "либо",
]);

// These are legacy ending-based diagnostic heuristics, not true POS tags.
// The v3 vector uses the separate local pymorphy3 analysis for actual dictionary POS features.
const ADJECTIVE_ENDING = /(?:ыми|ими|ого|его|ому|ему|ыми|ими|ая|яя|ое|ее|ые|ие|ый|ий|ой|ую|юю|ым|им|ых|их|ою|ею)$/u;
const ADVERB_ENDING = /(?:ски|цки|ически|чески|еньки|оньки|ому|ему|о|е)$/u;
const FINITE_VERB_ENDING = /(?:ешься|ишься|ются|утся|атся|ятся|ится|ется|ешь|ишь|ете|ите|ете|ите|ем|им|ют|ут|ат|ят|ет|ёт|ла|ло|ли|лся|лась|лось|лись|лся|ется|ются|у|ю)$/u;
const INFINITIVE_ENDING = /(?:ться|тись|чься|ть|ти|чь)$/u;
const PARTICIPLE_ENDING = /(?:вшийся|вшаяся|вшееся|вшиеся|вший|вшая|вшее|вшие|ющийся|ющаяся|ющееся|ющиеся|ющий|ющая|ющее|ющие|ащий|ящая|ящее|ящие|емый|емая|емое|емые|имый|имая|имое|имые|анный|янный|енный|ённый|вленный|тый|тая|тое|тые)$/u;
const GERUND_ENDING = /(?:вшись|вши|ши|ясь|ав|яв|ив|ыв)$/u;
const NOMINALIZER_ENDING = /(?:ание|яние|ение|ение|тие|ние|ость|есть|ство|ция|знь)$/u;

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function ratePerHundred(count: number, totalWords: number, saturation = 20): number {
  if (!totalWords) return 0;
  return clamp01((count / totalWords) * 100 / saturation);
}

function countMatching(words: string[], vocabulary: Set<string>): number {
  return words.reduce((count, word) => count + Number(vocabulary.has(word)), 0);
}

function countRegex(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function normalizeVector(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) return values.map(() => 0);
  return values.map((value) => value / norm);
}

function entropyRatio(values: string[], expectedBins: number): number {
  if (!values.length) return 0;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / values.length;
    entropy -= probability * Math.log(probability);
  }
  return clamp01(entropy / Math.log(expectedBins));
}

function repeatedRatio(items: string[]): number {
  if (!items.length) return 0;
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  const repeated = [...counts.values()].reduce((total, count) => total + (count > 1 ? count : 0), 0);
  return clamp01(repeated / items.length);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Replace topical stems with length+suffix signatures while retaining exact
 * Russian function words, punctuation, and line breaks. This deliberately
 * dampens topic words but cannot remove all subject-matter signal.
 */
function createContentMaskedProjection(text: string): string {
  return text
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/gu, "е")
    .replace(WORD_RE, (token) => {
      if (COMMON_FUNCTION_WORDS.has(token)) return ` F${token} `;
      const chars = [...token];
      const bucket = chars.length <= 3 ? "1" : chars.length <= 5 ? "2" : chars.length <= 8 ? "3" : "4";
      const suffix = chars.slice(-3).join("");
      return ` C${bucket}${suffix} `;
    });
}

function characterNgramVector(text: string, dimensions: number, maskContent: boolean): { vector: number[]; coverage: number } {
  const projection = maskContent
    ? createContentMaskedProjection(text)
    : text.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е").replace(/[\t ]+/gu, " ");
  const chars = [...projection];
  const buckets = new Array<number>(dimensions).fill(0);
  let gramCount = 0;

  for (const n of [3, 4, 5]) {
    for (let index = 0; index <= chars.length - n; index += 1) {
      const gram = chars.slice(index, index + n).join("");
      if (!/[а-яa-z]/iu.test(gram) || !gram.trim()) continue;
      const hash = stableHash(`${n}:${gram}`);
      const bucket = hash % dimensions;
      const sign = (hash & 0x80000000) === 0 ? 1 : -1;
      buckets[bucket] += sign;
      gramCount += 1;
    }
  }

  const sublinear = buckets.map((value) => Math.sign(value) * Math.log1p(Math.abs(value)));
  return {
    vector: normalizeVector(sublinear),
    coverage: clamp01(new Set(buckets.map((value, index) => value !== 0 ? index : -1).filter((index) => index >= 0)).size / dimensions),
  };
}

function getLineEndingWords(lines: string[]): string[] {
  return lines.map((line) => {
    const words = line.match(WORD_RE) ?? [];
    return (words.at(-1) ?? "").toLocaleLowerCase("ru-RU").replace(/ё/gu, "е");
  }).filter(Boolean);
}

export function calculateStylometry(
  texts: string[],
  morphology: RussianMorphologyFeatureInput,
): StylometryProfile {
  if (morphology.vector.length !== MORPHOLOGY_DIMENSIONS) {
    throw new Error(`Expected ${MORPHOLOGY_DIMENSIONS} morphology features; got ${morphology.vector.length}.`);
  }
  const text = texts.filter((item) => item.trim()).join("\n\u241e\n");
  const originalTokens = [...text.matchAll(WORD_RE)];
  const originalWords = originalTokens.map((token) => token[0]);
  const words = originalWords.map((word) => word.toLocaleLowerCase("ru-RU"));
  const wordCount = words.length;
  if (!wordCount) throw new Error("Stylometry requires at least one Russian word.");

  const wordLengths = words.map((word) => [...word].length);
  const wordFrequencies = new Map<string, number>();
  for (const word of words) wordFrequencies.set(word, (wordFrequencies.get(word) ?? 0) + 1);
  const lines = text.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  const lineTokens = lines
    .map((line) => (line.match(WORD_RE) ?? []).map((word) => word.toLocaleLowerCase("ru-RU")))
    .filter((lineWords) => lineWords.length > 0);
  const lineInitialWords = lineTokens.map((lineWords) => lineWords[0]);
  const lineWordCounts = lines.map((line) => (line.match(WORD_RE) ?? []).length).filter((count) => count > 0);
  const lineCharCounts = lines.map((line) => [...line.trim()].length).filter((count) => count > 0);
  const segments = text.split(/[.!?…]+|\r?\n+/u).map((segment) => (segment.match(WORD_RE) ?? []).length).filter((count) => count > 0);
  const uniqueWordCount = wordFrequencies.size;
  const hapaxCount = [...wordFrequencies.values()].filter((count) => count === 1).length;
  const repeatedOccurrences = [...wordFrequencies.values()].reduce((sum, count) => sum + (count > 1 ? count : 0), 0);
  const punctuationCount = countRegex(text, /[,.;:!?…—–\-()[\]{}«»"“”„]/gu);
  const countPunctuation = (pattern: RegExp) => countRegex(text, pattern);

  const firstSingular = countMatching(words, FIRST_SINGULAR);
  const secondSingular = countMatching(words, SECOND_SINGULAR);
  const thirdPerson = countMatching(words, THIRD_PERSON);
  const firstPlural = countMatching(words, FIRST_PLURAL);
  const secondPlural = countMatching(words, SECOND_PLURAL);
  const possessive = countMatching(words, POSSESSIVES);
  const conjunctions = countMatching(words, CONJUNCTIONS);
  const prepositions = countMatching(words, PREPOSITIONS);
  const particles = countMatching(words, PARTICLES);
  const negations = countMatching(words, NEGATIONS);
  const adversatives = countMatching(words, ADVERSATIVES);
  const causal = countMatching(words, CAUSAL);
  const modal = countMatching(words, MODAL_UNCERTAINTY);
  const temporal = countMatching(words, TEMPORAL);
  const spatial = countMatching(words, SPATIAL);
  const functionWords = countMatching(words, COMMON_FUNCTION_WORDS);

  const longWords = words.filter((word) => [...word].length >= 9).length;
  const shortWords = words.filter((word) => [...word].length <= 3).length;
  const hyphenatedWords = words.filter((word) => /[’'-]/u.test(word)).length;
  const firstWords = lines.map((line) => (line.match(WORD_RE)?.[0] ?? "").toLocaleLowerCase("ru-RU")).filter(Boolean);
  const lineEndingWords = getLineEndingWords(lines);
  const firstChars = words.map((word) => [...word][0] ?? "");
  const endSuffix2 = lineEndingWords.map((word) => [...word].slice(-2).join(""));
  const endSuffix3 = lineEndingWords.map((word) => [...word].slice(-3).join(""));
  const initialLetters = firstWords.map((word) => [...word][0] ?? "");
  const vowelsInWord = words.map((word) => [...word].filter((char) => VOWELS.has(char)).length);
  const vowelCount = words.reduce((total, word) => total + [...word].filter((char) => VOWELS.has(char)).length, 0);
  const consonantCount = words.reduce((total, word) => total + [...word].filter((char) => /[а-я]/iu.test(char) && !VOWELS.has(char)).length, 0);
  const lineStartsUpper = lines.filter((line) => /^[\s«"“”„([{]*[А-ЯЁ]/u.test(line)).length;
  const tokenIndicesAtLineStarts = new Set<number>();
  for (const token of originalTokens) {
    const before = text.slice(0, token.index ?? 0);
    const previousNewline = before.lastIndexOf("\n");
    const afterNewline = before.slice(previousNewline + 1);
    if (!afterNewline.trim()) tokenIndicesAtLineStarts.add(token.index ?? 0);
  }
  const uppercaseNonInitial = originalTokens.reduce((count, token) => {
    const index = token.index ?? 0;
    return count + (tokenIndicesAtLineStarts.has(index) ? 0 : Number(/^[А-ЯЁ]/u.test(token[0])));
  }, 0);
  const allCaps = originalWords.filter((word) => [...word].length > 1 && word === word.toLocaleUpperCase("ru-RU")).length;
  const adjacentBigrams = words.slice(1).map((word, index) => `${words[index]} ${word}`);
  const commonFunctionBigrams = adjacentBigrams.filter((bigram) => {
    const [left, right] = bigram.split(" ");
    return COMMON_FUNCTION_WORDS.has(left) && COMMON_FUNCTION_WORDS.has(right);
  }).length;
  const lineStartsWithPronoun = lineInitialWords.filter((word) =>
    FIRST_SINGULAR.has(word) || SECOND_SINGULAR.has(word) || THIRD_PERSON.has(word) ||
    FIRST_PLURAL.has(word) || SECOND_PLURAL.has(word) || POSSESSIVES.has(word),
  ).length;
  const lineStartsWithConjunction = countMatching(lineInitialWords, CONJUNCTIONS);
  const lineStartsWithPreposition = countMatching(lineInitialWords, PREPOSITIONS);
  const lineStartsWithParticle = countMatching(lineInitialWords, PARTICLES);
  const lineStartsWithNegation = countMatching(lineInitialWords, NEGATIONS);
  const lineEndsWithQuestion = lines.filter((line) => /\?\s*[»"”)]*$/u.test(line)).length;
  const lineEndsWithExclamation = lines.filter((line) => /!\s*[»"”)]*$/u.test(line)).length;
  const lineEndsWithEllipsis = lines.filter((line) => /(?:…|\.\.\.)\s*[»"”)]*$/u.test(line)).length;
  const adjectiveEndingCount = words.filter((word) => ADJECTIVE_ENDING.test(word)).length;
  const adverbEndingCount = words.filter((word) => ADVERB_ENDING.test(word)).length;
  const finiteVerbEndingCount = words.filter((word) => FINITE_VERB_ENDING.test(word) && !INFINITIVE_ENDING.test(word)).length;
  const infinitiveCount = words.filter((word) => INFINITIVE_ENDING.test(word)).length;
  const participleEndingCount = words.filter((word) => PARTICIPLE_ENDING.test(word)).length;
  const reflexiveEndingCount = words.filter((word) => /(?:ся|сь)$/u.test(word)).length;
  const gerundEndingCount = words.filter((word) => GERUND_ENDING.test(word)).length;
  const nominalizerCount = words.filter((word) => NOMINALIZER_ENDING.test(word)).length;
  const punctuationPerHundred = safeDivide(punctuationCount, wordCount) * 100;
  const repeatedWordRatio = safeDivide(repeatedOccurrences, wordCount);
  const charCount = [...text].length;
  const lettersCount = countRegex(text, /[\p{L}\p{M}]/gu);
  const latinCount = countRegex(text, /[A-Za-z]/gu);
  const rawNgramResult = characterNgramVector(text, RAW_NGRAM_DIMENSIONS, false);
  const maskedNgramResult = characterNgramVector(text, MASKED_NGRAM_DIMENSIONS, true);

  const rawFeatures = [
    clamp01(mean(wordLengths) / 12),                                      // 00 average word length
    clamp01(standardDeviation(wordLengths) / 6),                          // 01 word length variation
    clamp01(uniqueWordCount / wordCount),                                 // 02 type-token ratio
    clamp01(hapaxCount / wordCount),                                      // 03 hapax ratio
    clamp01(mean(lineWordCounts) / 25),                                   // 04 words per line
    clamp01(standardDeviation(lineWordCounts) / 12),                      // 05 line word variation
    clamp01(mean(lineCharCounts) / 120),                                  // 06 characters per line
    clamp01(standardDeviation(lineCharCounts) / 60),                      // 07 line character variation
    clamp01(mean(segments) / 30),                                         // 08 words per segment
    clamp01(standardDeviation(segments) / 20),                            // 09 segment variation
    clamp01(punctuationPerHundred / 35),                                  // 10 all punctuation
    ratePerHundred(countPunctuation(/,/gu), wordCount, 20),               // 11 commas
    ratePerHundred(countPunctuation(/\./gu), wordCount, 20),             // 12 periods
    ratePerHundred(countPunctuation(/:/gu), wordCount, 10),               // 13 colons
    ratePerHundred(countPunctuation(/;/gu), wordCount, 10),               // 14 semicolons
    ratePerHundred(countPunctuation(/[—–-]/gu), wordCount, 20),           // 15 dashes
    ratePerHundred(countPunctuation(/\?/gu), wordCount, 10),             // 16 questions
    ratePerHundred(countPunctuation(/!/gu), wordCount, 10),               // 17 exclamations
    ratePerHundred(countPunctuation(/…|\.\.\./gu), wordCount, 10),     // 18 ellipses
    ratePerHundred(countPunctuation(/[()[\]{}«»"“”„]/gu), wordCount, 10), // 19 quote/bracket marks
    ratePerHundred(firstSingular, wordCount, 10),                         // 20 first singular
    ratePerHundred(secondSingular, wordCount, 10),                        // 21 second singular
    ratePerHundred(thirdPerson, wordCount, 10),                           // 22 third person
    ratePerHundred(firstPlural, wordCount, 10),                            // 23 first plural
    ratePerHundred(secondPlural, wordCount, 10),                          // 24 second plural
    ratePerHundred(possessive, wordCount, 10),                            // 25 possessives
    ratePerHundred(firstSingular + secondSingular + thirdPerson + firstPlural + secondPlural + possessive, wordCount, 30), // 26 all pronoun classes
    ratePerHundred(conjunctions, wordCount, 25),                          // 27 conjunctions
    ratePerHundred(prepositions, wordCount, 25),                          // 28 prepositions
    ratePerHundred(particles, wordCount, 20),                             // 29 particles
    ratePerHundred(negations, wordCount, 10),                             // 30 negation
    ratePerHundred(adversatives, wordCount, 10),                          // 31 contrast connectors
    ratePerHundred(causal, wordCount, 10),                                // 32 causal connectors
    ratePerHundred(modal, wordCount, 10),                                 // 33 modal/uncertainty markers
    ratePerHundred(temporal, wordCount, 10),                              // 34 temporal markers
    ratePerHundred(spatial, wordCount, 10),                               // 35 spatial markers
    clamp01(longWords / wordCount),                                       // 36 long words
    clamp01(shortWords / wordCount),                                      // 37 short words
    ratePerHundred(functionWords, wordCount, 60),                         // 38 function words
    clamp01(hyphenatedWords / wordCount),                                 // 39 hyphenated words
    clamp01(repeatedWordRatio),                                           // 40 repeated tokens
    repeatedRatio(firstWords),                                             // 41 repeated line starts
    entropyRatio(firstChars, 33),                                         // 42 initial-letter entropy
    clamp01(uppercaseNonInitial / wordCount),                             // 43 uppercase away from line starts
    clamp01(allCaps / wordCount),                                         // 44 uppercase tokens
    ratePerHundred(countMatching(words, new Set(["и"])), wordCount, 15), // 45 «и»
    ratePerHundred(countMatching(words, new Set(["а"])), wordCount, 15), // 46 «а»
    ratePerHundred(countMatching(words, new Set(["но"])), wordCount, 15),// 47 «но»
    ratePerHundred(countMatching(words, new Set(["что"])), wordCount, 15), // 48 «что»
    ratePerHundred(countMatching(words, new Set(["как"])), wordCount, 15), // 49 «как»
    ratePerHundred(countMatching(words, new Set(["не", "ни"])), wordCount, 15), // 50 «не/ни»
    ratePerHundred(countMatching(words, new Set(["я"])), wordCount, 15), // 51 «я»
    ratePerHundred(countMatching(words, new Set(["ты"])), wordCount, 15), // 52 «ты»
    ratePerHundred(countMatching(words, new Set(["в"])), wordCount, 15), // 53 «в»
    ratePerHundred(countMatching(words, new Set(["на"])), wordCount, 15), // 54 «на»
    ratePerHundred(countMatching(words, new Set(["бы", "б"])), wordCount, 15), // 55 «бы/б»
    clamp01(safeDivide(lineStartsWithPronoun, lineInitialWords.length)),   // 56 line starts with pronouns/possessives
    clamp01(safeDivide(lineStartsWithConjunction, lineInitialWords.length)),// 57 line starts with conjunctions
    clamp01(safeDivide(lineStartsWithPreposition, lineInitialWords.length)),// 58 line starts with prepositions
    clamp01(safeDivide(lineStartsWithParticle, lineInitialWords.length)),  // 59 line starts with particles
    clamp01(safeDivide(lineStartsWithNegation, lineInitialWords.length)),  // 60 line starts with negation
    clamp01(safeDivide(lineEndsWithQuestion, lines.length)),              // 61 line-ending questions
    clamp01(safeDivide(lineEndsWithExclamation, lines.length)),            // 62 line-ending exclamations
    clamp01(safeDivide(lineEndsWithEllipsis, lines.length)),                // 63 line-ending ellipses
    clamp01(mean(vowelsInWord) / 6),                                     // 64 vowels / word (rough syllable proxy)
    clamp01(safeDivide(consonantCount, Math.max(vowelCount, 1)) / 3),     // 65 consonant-to-vowel ratio
    repeatedRatio(endSuffix2),                                            // 66 repeated line-end suffix 2
    repeatedRatio(endSuffix3),                                            // 67 repeated line-end suffix 3
    repeatedRatio(initialLetters),                                        // 68 repeated initial letters
    repeatedRatio(lineEndingWords),                                       // 69 repeated line-ending words
    clamp01(safeDivide(lines.filter((line) => /[.!?…;:]\s*[»"”)]*$/u.test(line)).length, Math.max(lines.length, 1))), // 70 terminal punctuation at line end
    clamp01(words.filter((word) => VOWELS.has([...word][0] ?? "")).length / wordCount), // 71 words start vowel
    clamp01(words.filter((word) => VOWELS.has([...word].at(-1) ?? "")).length / wordCount), // 72 words end vowel
    clamp01(words.filter((word) => word.includes("ё")).length / wordCount), // 73 yo usage
    clamp01(standardDeviation(vowelsInWord) / 3),                         // 74 syllable-proxy variation
    repeatedRatio(adjacentBigrams),                                        // 75 repeated adjacent word bigrams
    ratePerHundred(commonFunctionBigrams, wordCount, 15),                // 76 function-word bigrams
    clamp01(lineStartsUpper / Math.max(lines.length, 1)),                 // 77 uppercase line starts
    clamp01(safeDivide(punctuationCount, Math.max(charCount - wordCount, 1))), // 78 punctuation density by nonword chars
    clamp01(latinCount / Math.max(lettersCount, 1)),                      // 79 Latin letters among letters
  ];

  if (rawFeatures.length !== HANDCRAFTED_DIMENSIONS) {
    throw new Error(`Expected ${HANDCRAFTED_DIMENSIONS} handcrafted features; got ${rawFeatures.length}.`);
  }

  const handcrafted = normalizeVector(rawFeatures);
  const vector = normalizeVector([
    ...handcrafted.map((value) => value * Math.sqrt(0.25)),
    ...morphology.vector.map((value) => value * Math.sqrt(0.35)),
    ...rawNgramResult.vector.map((value) => value * Math.sqrt(0.20)),
    ...maskedNgramResult.vector.map((value) => value * Math.sqrt(0.20)),
  ]);
  if (vector.length !== STYLOMETRY_DIMENSIONS) {
    throw new Error(`Expected ${STYLOMETRY_DIMENSIONS} style features; got ${vector.length}.`);
  }

  const metrics: StylometryMetrics = {
    averageWordLength: Number(mean(wordLengths).toFixed(2)),
    lexicalDiversityRatio: Number((uniqueWordCount / wordCount).toFixed(3)),
    averageWordsPerLine: Number(mean(lineWordCounts).toFixed(2)),
    averageWordsPerSegment: Number(mean(segments).toFixed(2)),
    firstPersonPronounsPer100: Number((safeDivide(firstSingular, wordCount) * 100).toFixed(2)),
    secondPersonPronounsPer100: Number((safeDivide(secondSingular, wordCount) * 100).toFixed(2)),
    negationsPer100: Number((safeDivide(negations, wordCount) * 100).toFixed(2)),
    punctuationPer100: Number(punctuationPerHundred.toFixed(2)),
    repeatedWordRatio: Number(repeatedWordRatio.toFixed(3)),
    shortWordRatio: Number((shortWords / wordCount).toFixed(3)),
    hyphenatedWordRatio: Number((hyphenatedWords / wordCount).toFixed(3)),
    commonFunctionWordsPer100: Number((safeDivide(functionWords, wordCount) * 100).toFixed(2)),
    adjectiveEndingHeuristicPer100: Number((safeDivide(adjectiveEndingCount, wordCount) * 100).toFixed(2)),
    adverbEndingHeuristicPer100: Number((safeDivide(adverbEndingCount, wordCount) * 100).toFixed(2)),
    verbEndingHeuristicPer100: Number((safeDivide(finiteVerbEndingCount, wordCount) * 100).toFixed(2)),
    infinitiveHeuristicPer100: Number((safeDivide(infinitiveCount, wordCount) * 100).toFixed(2)),
    participleEndingHeuristicPer100: Number((safeDivide(participleEndingCount, wordCount) * 100).toFixed(2)),
    gerundEndingHeuristicPer100: Number((safeDivide(gerundEndingCount, wordCount) * 100).toFixed(2)),
    averageVowelsPerWord: Number(mean(vowelsInWord).toFixed(2)),
    averageCharactersPerLine: Number(mean(lineCharCounts).toFixed(2)),
    repeatedLineEndingRatio: Number(repeatedRatio(lineEndingWords).toFixed(3)),
    characterNgramCoverage: Number(((rawNgramResult.coverage + maskedNgramResult.coverage) / 2).toFixed(3)),
    ...morphology.metrics,
  };

  return {
    version: STYLOMETRY_VERSION,
    dimensions: STYLOMETRY_DIMENSIONS,
    wordCount,
    vector,
    metrics,
  };
}

export function parseStylometryMetrics(value: unknown): StylometryMetrics | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys: (keyof StylometryMetrics)[] = [
    "averageWordLength", "lexicalDiversityRatio", "averageWordsPerLine", "averageWordsPerSegment",
    "firstPersonPronounsPer100", "secondPersonPronounsPer100", "negationsPer100",
    "punctuationPer100", "repeatedWordRatio", "shortWordRatio", "hyphenatedWordRatio",
    "commonFunctionWordsPer100", "adjectiveEndingHeuristicPer100", "adverbEndingHeuristicPer100",
    "verbEndingHeuristicPer100", "infinitiveHeuristicPer100", "participleEndingHeuristicPer100",
    "gerundEndingHeuristicPer100", "averageVowelsPerWord", "averageCharactersPerLine",
    "repeatedLineEndingRatio", "characterNgramCoverage", "posNounPer100", "posAdjectivePer100",
    "posVerbPer100", "posAdverbPer100", "posPronounPer100", "posConjunctionPer100",
    "posPrepositionPer100", "posParticlePer100", "posInfinitivePer100", "posParticiplePer100",
    "posGerundPer100", "genitiveCasePer100", "pastTensePer100", "presentTensePer100",
    "firstPersonGrammemePer100", "morphologyCoverage", "averageDictionaryParsesPerWord",
  ];
  for (const key of keys) {
    if (typeof record[key] !== "number" || !Number.isFinite(record[key])) return null;
  }
  return record as unknown as StylometryMetrics;
}
