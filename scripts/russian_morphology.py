#!/usr/bin/env python3
"""JSON-in/JSON-out Russian morphology features powered by pymorphy3.

Input:  {"texts": ["...", "..."]}
Output: {"vector": [128 floats], "metrics": {...}, "analyzedTokens": N}
Only best dictionary parse per token is used; this is not contextual disambiguation.
"""
from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter
from typing import Any

TOKEN_RE = re.compile(r"[А-Яа-яЁё]+(?:[-’'][А-Яа-яЁё]+)*", re.UNICODE)

POS_ORDER = [
    "NOUN", "ADJF", "ADJS", "COMP", "VERB", "INFN", "PRTF", "PRTS",
    "GRND", "NUMR", "ADVB", "NPRO", "PRED", "PREP", "CONJ", "PRCL",
    "INTJ", "LATN", "UNKN", "OTHER",
]
POS_SET = set(POS_ORDER)

# Twenty-four broad grammeme rates. Frequencies are normalized by all word tokens.
GRAMMEME_ORDER = [
    "nomn", "gent", "datv", "accs", "ablt", "loct",  # case (6)
    "sing", "plur",                                       # number (2)
    "masc", "femn", "neut",                             # gender (3)
    "1per", "2per", "3per",                             # person (3)
    "past", "pres", "futr",                             # tense (3)
    "perf", "impf",                                      # aspect (2)
    "indc", "impr",                                      # mood (2)
    "anim", "inan",                                      # animacy (2)
    "refl",                                               # reflexive form (1)
]
assert len(POS_ORDER) == 20 and len(GRAMMEME_ORDER) == 24

POS_BIGRAM_DIMS = 64
POS_TRIGRAM_DIMS = 20
MORPH_DIMS = 128


def normalize(values: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in values))
    return [value / norm for value in values] if norm > 0 else [0.0] * len(values)


def stable_hash(value: str) -> int:
    # FNV-1a 32-bit on UTF-8 bytes; deterministic across operating systems.
    h = 2166136261
    for byte in value.encode("utf-8"):
        h ^= byte
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def hashed_counts(counter: Counter[str], dims: int) -> list[float]:
    buckets = [0.0] * dims
    for feature, count in counter.items():
        h = stable_hash(feature)
        bucket = h % dims
        sign = 1.0 if (h & 0x80000000) == 0 else -1.0
        buckets[bucket] += sign * count
    return normalize([math.copysign(math.log1p(abs(value)), value) if value else 0.0 for value in buckets])


def rate_per_100(count: int, total: int) -> float:
    return round(100.0 * count / total, 4) if total else 0.0


def make_features(texts: list[str]) -> dict[str, Any]:
    try:
        import pymorphy3
    except Exception as exc:  # handled as a useful stderr detail by caller
        raise RuntimeError(
            "pymorphy3 is not installed. Run: py -3 -m pip install -r scripts/requirements-morphology.txt"
        ) from exc

    morph = pymorphy3.MorphAnalyzer(lang="ru")
    pos_counts: Counter[str] = Counter()
    gram_counts: Counter[str] = Counter()
    bigrams: Counter[str] = Counter()
    trigrams: Counter[str] = Counter()
    total_tokens = 0
    analyzed_tokens = 0
    parse_ambiguity_total = 0
    adjective_count = verb_count = adverb_count = pronoun_count = 0
    conjunction_count = preposition_count = particle_count = 0
    infinitive_count = participle_count = gerund_count = 0
    genitive_count = past_count = present_count = first_person_count = 0

    for text in texts:
        # Respect line/poem boundaries: never create POS transitions across them.
        for line in text.splitlines() or [text]:
            words = [word.lower().replace("ё", "е") for word in TOKEN_RE.findall(line)]
            pos_sequence: list[str] = []
            for word in words:
                total_tokens += 1
                parses = morph.parse(word)
                if not parses:
                    pos = "UNKN"
                    grammemes: set[str] = set()
                    parse_ambiguity_total += 1
                else:
                    parse = parses[0]  # most probable dictionary analysis, not contextual disambiguation
                    tag = parse.tag
                    raw_pos = getattr(tag, "POS", None)
                    pos = raw_pos if raw_pos in POS_SET else ("LATN" if re.search(r"[a-z]", word) else "UNKN")
                    grammemes = set(getattr(tag, "grammemes", []))
                    parse_ambiguity_total += len(parses)
                    analyzed_tokens += int(pos not in {"UNKN", "OTHER"})

                pos_counts[pos] += 1
                for grammeme in GRAMMEME_ORDER:
                    if grammeme == "refl":
                        if word.endswith(("ся", "сь")):
                            gram_counts[grammeme] += 1
                    elif grammeme in grammemes:
                        gram_counts[grammeme] += 1

                pos_sequence.append(pos)
                adjective_count += int(pos in {"ADJF", "ADJS", "COMP"})
                verb_count += int(pos == "VERB")
                adverb_count += int(pos == "ADVB")
                pronoun_count += int(pos == "NPRO")
                conjunction_count += int(pos == "CONJ")
                preposition_count += int(pos == "PREP")
                particle_count += int(pos == "PRCL")
                infinitive_count += int(pos == "INFN")
                participle_count += int(pos in {"PRTF", "PRTS"})
                gerund_count += int(pos == "GRND")
                genitive_count += int("gent" in grammemes)
                past_count += int("past" in grammemes)
                present_count += int("pres" in grammemes)
                first_person_count += int("1per" in grammemes)

            for index in range(len(pos_sequence) - 1):
                bigrams[f"{pos_sequence[index]}>{pos_sequence[index + 1]}"] += 1
            for index in range(len(pos_sequence) - 2):
                trigrams[f"{pos_sequence[index]}>{pos_sequence[index + 1]}>{pos_sequence[index + 2]}"] += 1

    if total_tokens == 0:
        raise RuntimeError("No Russian word tokens were found in supplied poem text.")

    pos_vector = normalize([pos_counts.get(pos, 0) for pos in POS_ORDER])
    gram_vector = normalize([gram_counts.get(grammeme, 0) for grammeme in GRAMMEME_ORDER])
    bigram_vector = hashed_counts(bigrams, POS_BIGRAM_DIMS)
    trigram_vector = hashed_counts(trigrams, POS_TRIGRAM_DIMS)

    # Equalize feature groups so POS n-grams don't overwhelm the compact tag frequencies.
    vector = (
        [value * math.sqrt(0.25) for value in pos_vector]
        + [value * math.sqrt(0.25) for value in gram_vector]
        + [value * math.sqrt(0.30) for value in bigram_vector]
        + [value * math.sqrt(0.20) for value in trigram_vector]
    )
    vector = normalize(vector)
    if len(vector) != MORPH_DIMS:
        raise RuntimeError(f"Morphology vector must have {MORPH_DIMS} dimensions; got {len(vector)}")

    return {
        "vector": [round(value, 8) for value in vector],
        "analyzedTokens": analyzed_tokens,
        "metrics": {
            "posNounPer100": rate_per_100(pos_counts.get("NOUN", 0), total_tokens),
            "posAdjectivePer100": rate_per_100(adjective_count, total_tokens),
            "posVerbPer100": rate_per_100(verb_count, total_tokens),
            "posAdverbPer100": rate_per_100(adverb_count, total_tokens),
            "posPronounPer100": rate_per_100(pronoun_count, total_tokens),
            "posConjunctionPer100": rate_per_100(conjunction_count, total_tokens),
            "posPrepositionPer100": rate_per_100(preposition_count, total_tokens),
            "posParticlePer100": rate_per_100(particle_count, total_tokens),
            "posInfinitivePer100": rate_per_100(infinitive_count, total_tokens),
            "posParticiplePer100": rate_per_100(participle_count, total_tokens),
            "posGerundPer100": rate_per_100(gerund_count, total_tokens),
            "genitiveCasePer100": rate_per_100(genitive_count, total_tokens),
            "pastTensePer100": rate_per_100(past_count, total_tokens),
            "presentTensePer100": rate_per_100(present_count, total_tokens),
            "firstPersonGrammemePer100": rate_per_100(first_person_count, total_tokens),
            "morphologyCoverage": round(analyzed_tokens / total_tokens, 4),
            "averageDictionaryParsesPerWord": round(parse_ambiguity_total / total_tokens, 3),
        },
    }


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        texts = payload.get("texts") if isinstance(payload, dict) else None
        if not isinstance(texts, list) or not texts or not all(isinstance(text, str) for text in texts):
            raise RuntimeError('Expected JSON object: {"texts": ["Russian poem text", ...]}')
        result = make_features(texts)
        sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
