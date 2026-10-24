import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import {
  findMatches,
  getDatabaseErrorMessage,
  isUuid,
  toPgStyleVector,
  toPgVector,
  toPgReasoningVector,
  RANKING_METHOD,
  RANKING_WEIGHTS,
} from "@/lib/soulvector-db";
import { calculateStylometry, STYLOMETRY_DIMENSIONS, STYLOMETRY_VERSION } from "@/lib/stylometry";
import { analyzeRussianMorphology } from "@/lib/russian-morphology";
import { analyzeReasoningProfile, REASONING_VERSION, type ReasoningAnalysisResult } from "@/lib/reasoning-analysis";

const EMBEDDING_MODEL = "bge-m3";
const EXPECTED_DIMENSIONS = 1024;
const MIN_POEMS = 1;
const MAX_POEMS = 5;
const MAX_TITLE_LENGTH = 160;
const MAX_TEXT_LENGTH = 12_000;
const OLLAMA_TIMEOUT_MS = 180_000;

type InputPoem = {
  id: string;
  title: string;
  text: string;
};

type OllamaEmbedResponse = {
  model?: unknown;
  embeddings?: unknown;
  error?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );

  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("The embedding vector cannot be normalized.");
  }

  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error("Embedding dimensions do not match.");
  }

  let dotProduct = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (let index = 0; index < a.length; index += 1) {
    dotProduct += a[index] * b[index];
    aMagnitude += a[index] * a[index];
    bMagnitude += b[index] * b[index];
  }

  const denominator = Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

function validatePoems(value: unknown): InputPoem[] | null {
  if (!Array.isArray(value) || value.length < MIN_POEMS || value.length > MAX_POEMS) {
    return null;
  }

  const poems: InputPoem[] = [];
  const ids = new Set<string>();

  for (const item of value) {
    if (!isRecord(item)) return null;

    const { id, title, text } = item;
    if (
      typeof id !== "string" ||
      typeof title !== "string" ||
      typeof text !== "string"
    ) {
      return null;
    }

    const cleanId = id.trim();
    const cleanTitle = title.trim();
    const cleanText = text.trim();

    if (
      !cleanId ||
      ids.has(cleanId) ||
      !cleanTitle ||
      !cleanText ||
      cleanTitle.length > MAX_TITLE_LENGTH ||
      cleanText.length > MAX_TEXT_LENGTH
    ) {
      return null;
    }

    ids.add(cleanId);
    poems.push({ id: cleanId, title: cleanTitle, text: cleanText });
  }

  return poems;
}

function isEmbedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === EXPECTED_DIMENSIONS &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function getOllamaUrl(): string {
  const configured = process.env.OLLAMA_BASE_URL?.trim();
  const baseUrl = configured || "http://127.0.0.1:11434";
  return `${baseUrl.replace(/\/+$/, "")}/api/embed`;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON в запросе." }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Ожидался объект с массивом poems." }, { status: 400 });
  }

  const poems = validatePoems(body.poems);
  const profileId = body.profileId;
  const displayName = typeof body.displayName === "string"
    ? body.displayName.trim().slice(0, 40)
    : "";
  // Discovery is enabled permanently for this MVP; do not accept a client opt-out.

  if (!poems) {
    return NextResponse.json(
      {
        error:
          "Добавь от одного до пяти стихотворений. Название — до 160 символов, текст — до 12 000 символов, идентификаторы должны быть уникальными.",
      },
      { status: 400 },
    );
  }

  if (!isUuid(profileId)) {
    return NextResponse.json(
      { error: "Не найден ID профиля. Обнови страницу и попробуй ещё раз." },
      { status: 400 },
    );
  }

  let vectors: number[][];
  try {
    const response = await fetch(getOllamaUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: poems.map((poem) => `${poem.title}\n\n${poem.text}`),
        truncate: false,
        keep_alive: "10m",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errorBody: unknown = await response.json();
        if (isRecord(errorBody) && typeof errorBody.error === "string") {
          detail = errorBody.error;
        }
      } catch {
        // Ollama may return a non-JSON error body.
      }

      console.error("Ollama embedding request failed:", response.status, detail);

      if (response.status === 404 || /model .* not found|try pulling/i.test(detail)) {
        return NextResponse.json(
          { error: "Модель bge-m3 не найдена. Выполни в терминале: ollama pull bge-m3" },
          { status: 503 },
        );
      }

      if (/context length|input length|too long|exceeds.*context/i.test(detail)) {
        return NextResponse.json(
          { error: "Одно из стихотворений превышает контекст модели. Сократи текст и попробуй ещё раз." },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { error: `Ollama вернула ошибку (${response.status}). ${detail || "Проверь, что Ollama запущена."}` },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as OllamaEmbedResponse;
    const rawEmbeddings = payload.embeddings;

    if (
      !Array.isArray(rawEmbeddings) ||
      rawEmbeddings.length !== poems.length ||
      !rawEmbeddings.every(isEmbedding)
    ) {
      console.error("Unexpected Ollama embedding response shape/dimensions.");
      return NextResponse.json(
        { error: `Ожидалось ${poems.length} векторов по ${EXPECTED_DIMENSIONS} чисел от модели bge-m3.` },
        { status: 502 },
      );
    }

    vectors = rawEmbeddings;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const errorName = error instanceof Error ? error.name : "";
    console.error("Local embedding request failed:", message);

    if (errorName === "TimeoutError" || errorName === "AbortError") {
      return NextResponse.json(
        { error: "Ollama слишком долго обрабатывала стихотворения. Проверь ресурсы компьютера и попробуй ещё раз." },
        { status: 504 },
      );
    }

    return NextResponse.json(
      { error: "Не удалось подключиться к Ollama. Проверь, что Ollama запущена и модель bge-m3 установлена." },
      { status: 503 },
    );
  }

  try {
    const averagedVector = Array.from({ length: EXPECTED_DIMENSIONS }, (_, dimension) => {
      const sum = vectors.reduce((total, vector) => total + vector[dimension], 0);
      return sum / vectors.length;
    });
    const profileVector = normalize(averagedVector);
    const profileVectorSql = toPgVector(profileVector);

    // Stage 2: use a local LLM to analyze observable reasoning patterns in the poems.
    // This scores features expressed in the text; it does not infer actual personality.
    let reasoningResult: ReasoningAnalysisResult;
    try {
      reasoningResult = await analyzeReasoningProfile(poems);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown reasoning analysis error";
      console.error("Local reasoning analysis failed:", detail);
      return NextResponse.json(
        { error: detail || "Не удалось выполнить анализ способов рассуждения." },
        { status: 503 },
      );
    }
    const reasoningVectorSql = toPgReasoningVector(reasoningResult.vector);

    // Stage 3: Russian morphology + stylometry. Titles are excluded from the style fingerprint.
    // The Python helper uses pymorphy3 locally; no poem text is sent to a third-party morphology API.
    // no poem text is sent to a third-party morphology API.
    let russianMorphology;
    try {
      russianMorphology = await analyzeRussianMorphology(poems.map((poem) => poem.text));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown morphology error";
      console.error("Russian morphology analysis failed:", detail);
      return NextResponse.json(
        { error: `Не удалось выполнить морфологический анализ русского текста. Установи зависимости командой py -3 -m pip install -r scripts/requirements-morphology.txt. Подробности: ${detail}` },
        { status: 503 },
      );
    }

    // Titles are excluded from the stylistic fingerprint.
    const authorStyle = calculateStylometry(poems.map((poem) => poem.text), russianMorphology);
    if (authorStyle.vector.length !== STYLOMETRY_DIMENSIONS) {
      throw new Error(`Expected ${STYLOMETRY_DIMENSIONS} stylometric features.`);
    }
    const authorStyleVectorSql = toPgStyleVector(authorStyle.vector);

    const poemResults = poems.map((poem, index) => ({
      id: poem.id,
      title: poem.title,
      similarityToProfile: Number(cosineSimilarity(vectors[index], profileVector).toFixed(3)),
    }));

    const pool = getPool();
    const client = await pool.connect();
    let storedProfile: {
      profileId: string;
      displayName: string;
      isDiscoverable: boolean;
      poemCount: number;
      updatedAt: string;
    } | null = null;

    try {
      await client.query("BEGIN");
      const profileResult = await client.query<{
        profileId: string;
        displayName: string;
        isDiscoverable: boolean;
        poemCount: number;
        updatedAt: Date;
      }>(
        `
          INSERT INTO public.sv_profiles (
            profile_id, display_name, is_discoverable, embedding,
            embedding_model, poem_count, author_style_embedding, style_version,
            style_word_count, style_metrics, reasoning_embedding, reasoning_version,
            reasoning_analysis, updated_at, last_analyzed_at
          )
          VALUES (
            $1::uuid,
            COALESCE(NULLIF(BTRIM($2::text), ''), 'Автор ' || SUBSTRING($1::text, 1, 6)),
            TRUE,
            $3::extensions.vector,
            $4::text,
            $5::smallint,
            $6::extensions.vector,
            $7::text,
            $8::integer,
            $9::jsonb,
            $10::extensions.vector,
            $11::text,
            $12::jsonb,
            now(),
            now()
          )
          ON CONFLICT (profile_id) DO UPDATE SET
            display_name = CASE
              WHEN NULLIF(BTRIM($2::text), '') IS NOT NULL THEN EXCLUDED.display_name
              ELSE public.sv_profiles.display_name
            END,
            is_discoverable = TRUE,
            embedding = EXCLUDED.embedding,
            embedding_model = EXCLUDED.embedding_model,
            poem_count = EXCLUDED.poem_count,
            author_style_embedding = EXCLUDED.author_style_embedding,
            style_version = EXCLUDED.style_version,
            style_word_count = EXCLUDED.style_word_count,
            style_metrics = EXCLUDED.style_metrics,
            reasoning_embedding = EXCLUDED.reasoning_embedding,
            reasoning_version = EXCLUDED.reasoning_version,
            reasoning_analysis = EXCLUDED.reasoning_analysis,
            updated_at = now(),
            last_analyzed_at = now()
          RETURNING
            profile_id::text AS "profileId",
            display_name AS "displayName",
            is_discoverable AS "isDiscoverable",
            poem_count AS "poemCount",
            updated_at AS "updatedAt"
        `,
        [
          profileId,
          displayName || null,
          profileVectorSql,
          EMBEDDING_MODEL,
          poems.length,
          authorStyleVectorSql,
          STYLOMETRY_VERSION,
          authorStyle.wordCount,
          JSON.stringify(authorStyle.metrics),
          reasoningVectorSql,
          REASONING_VERSION,
          JSON.stringify(reasoningResult.profile),
        ],
      );

      const profileRow = profileResult.rows[0];
      if (!profileRow) throw new Error("Profile upsert returned no row.");

      storedProfile = {
        profileId: profileRow.profileId,
        displayName: profileRow.displayName,
        isDiscoverable: profileRow.isDiscoverable,
        poemCount: Number(profileRow.poemCount),
        updatedAt: new Date(profileRow.updatedAt).toISOString(),
      };

      await client.query("DELETE FROM public.sv_poems WHERE profile_id = $1::uuid", [profileId]);

      for (let index = 0; index < poems.length; index += 1) {
        await client.query(
          `
            INSERT INTO public.sv_poems (
              profile_id, client_poem_id, title, body, embedding, embedding_model, updated_at
            )
            VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::extensions.vector, $6::text, now())
          `,
          [
            profileId,
            poems[index].id,
            poems[index].title,
            poems[index].text,
            toPgVector(vectors[index]),
            EMBEDDING_MODEL,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const profileToReturn = storedProfile;
    if (!profileToReturn) {
      throw new Error("Profile was not saved by the database transaction.");
    }

    const matches = await findMatches(
      pool,
      profileId,
      profileVectorSql,
      reasoningVectorSql,
      authorStyleVectorSql,
      10,
    );

    return NextResponse.json({
      model: EMBEDDING_MODEL,
      dimensions: profileVector.length,
      poemCount: poems.length,
      poems: poemResults,
      profileId,
      savedToDatabase: true,
      profile: profileToReturn,
      profileVectorPreview: profileVector.slice(0, 12).map((value) => Number(value.toFixed(6))),
      authorStyle: {
        version: authorStyle.version,
        dimensions: authorStyle.dimensions,
        wordCount: authorStyle.wordCount,
        metrics: authorStyle.metrics,
      },
      reasoningProfile: reasoningResult.profile,
      pipelineStages: [
        { id: "meaning", label: "Содержание и смысл", status: "completed", model: EMBEDDING_MODEL, details: `${profileVector.length} координат BGE-M3` },
        { id: "reasoning", label: "Способы развития мысли", status: "completed", model: reasoningResult.profile.model, details: `${reasoningResult.profile.dimensions} наблюдаемых признаков; ${poems.length} текст(а)` },
        { id: "style", label: "Стиль русского текста", status: "completed", model: `pymorphy3 · ${STYLOMETRY_VERSION}`, details: `${authorStyle.dimensions} стилометрических признаков` },
      ],
      ranking: {
        method: RANKING_METHOD,
        reasoningWeight: RANKING_WEIGHTS.reasoning,
        semanticWeight: RANKING_WEIGHTS.semantic,
        styleWeight: RANKING_WEIGHTS.style,
      },
      matches,
    });
  } catch (error) {
    console.error("SoulVector profile persistence failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: getDatabaseErrorMessage(error) },
      { status: 503 },
    );
  }
}
