"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type WeightKey = "thinking" | "meaning" | "style";
type Weights = Record<WeightKey, number>;
type DiagnosticProfile = {
  profileId: string;
  displayName: string;
  poemCount: number;
  styleWordCount: number;
  isCurrentProfile: boolean;
  styleReady: boolean;
  reasoningReady: boolean;
};
type Pair = {
  key: string;
  left: DiagnosticProfile;
  right: DiagnosticProfile;
  semanticSimilarity: number | null;
  styleSimilarity: number | null;
  reasoningSimilarity: number | null;
};
type DiagnosticsResponse = {
  currentProfileId: string | null;
  profiles: DiagnosticProfile[];
  pairs: Pair[];
  styleVersion: string;
  reasoningVersion: string;
  error?: string;
};

type PairRatings = Record<string, number>;

const PROFILE_STORAGE_KEY = "soulvector-profile-id";
const WEIGHTS_STORAGE_KEY = "soulvector-algorithm-weights-v1";
const RATINGS_STORAGE_KEY = "soulvector-thinking-ratings-v1";
const DEFAULT_WEIGHTS: Weights = { thinking: 60, meaning: 32, style: 8 };
const WEIGHT_KEYS: WeightKey[] = ["thinking", "meaning", "style"];

function clampScore(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.max(0, Math.min(1, value));
}

function toPct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function adjustWeights(current: Weights, changedKey: WeightKey, nextValue: number): Weights {
  const next = Math.max(0, Math.min(100, Math.round(nextValue)));
  const others = WEIGHT_KEYS.filter((key) => key !== changedKey);
  const oldOtherTotal = current[others[0]] + current[others[1]];
  const remainder = 100 - next;
  let first: number;
  if (oldOtherTotal === 0) first = Math.round(remainder / 2);
  else first = Math.round((current[others[0]] / oldOtherTotal) * remainder);
  const second = remainder - first;
  return { ...current, [changedKey]: next, [others[0]]: first, [others[1]]: second };
}

function liveAvailableScore(pair: Pair, weights: Weights): number | null {
  const components: Array<{ score: number | null; weight: number }> = [
    { score: clampScore(pair.reasoningSimilarity), weight: weights.thinking },
    { score: clampScore(pair.semanticSimilarity), weight: weights.meaning },
    { score: clampScore(pair.styleSimilarity), weight: weights.style },
  ].filter((entry) => entry.score !== null && entry.weight > 0);
  const denominator = components.reduce((sum, entry) => sum + entry.weight, 0);
  if (!denominator) return null;
  return components.reduce((sum, entry) => sum + (entry.score as number) * entry.weight, 0) / denominator;
}

function simulatedScore(pair: Pair, weights: Weights, thinkingRating: number | undefined): number | null {
  const components: Array<{ score: number | null; weight: number }> = [
    { score: thinkingRating === undefined ? clampScore(pair.reasoningSimilarity) : thinkingRating / 100, weight: weights.thinking },
    { score: clampScore(pair.semanticSimilarity), weight: weights.meaning },
    { score: clampScore(pair.styleSimilarity), weight: weights.style },
  ].filter((entry) => entry.score !== null && entry.weight > 0);
  const denominator = components.reduce((sum, entry) => sum + entry.weight, 0);
  if (!denominator) return null;
  return components.reduce((sum, entry) => sum + (entry.score as number) * entry.weight, 0) / denominator;
}

function scoreLabel(value: number | null): string {
  return value === null ? "Нет данных" : value.toFixed(3);
}

export default function AlgorithmPage() {
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [ratings, setRatings] = useState<PairRatings>({});
  const [ratingsLoaded, setRatingsLoaded] = useState(false);
  const [weightsLoaded, setWeightsLoaded] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showOnlyUserPairs, setShowOnlyUserPairs] = useState(true);

  const loadDiagnostics = useCallback(async (id: string) => {
    setIsLoading(true);
    setError("");
    try {
      const query = id ? `?profileId=${encodeURIComponent(id)}` : "";
      const response = await fetch(`/api/diagnostics${query}`, { cache: "no-store" });
      const payload = (await response.json()) as DiagnosticsResponse;
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить диагностику.");
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки диагностики.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.localStorage.getItem(PROFILE_STORAGE_KEY) || "";
    setProfileId(id);

    try {
      const savedWeights = window.localStorage.getItem(WEIGHTS_STORAGE_KEY);
      if (savedWeights) {
        const parsed = JSON.parse(savedWeights) as Partial<Weights>;
        if (WEIGHT_KEYS.every((key) => typeof parsed[key] === "number" && Number.isFinite(parsed[key]))) {
          const total = WEIGHT_KEYS.reduce((sum, key) => sum + (parsed[key] as number), 0);
          if (total > 0) {
            const thinking = Math.max(0, Math.min(100, Math.round(((parsed.thinking as number) / total) * 100)));
            const meaning = Math.max(0, Math.min(100 - thinking, Math.round(((parsed.meaning as number) / total) * 100)));
            const style = 100 - thinking - meaning;
            setWeights({ thinking, meaning, style });
          }
        }
      }
      const savedRatings = window.localStorage.getItem(RATINGS_STORAGE_KEY);
      if (savedRatings) {
        const parsed = JSON.parse(savedRatings) as PairRatings;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) setRatings(parsed);
      }
    } catch {
      // Invalid local diagnostics data is ignored; defaults remain usable.
    }
    setRatingsLoaded(true);
    setWeightsLoaded(true);
    void loadDiagnostics(id);
  }, [loadDiagnostics]);

  useEffect(() => {
    if (weightsLoaded) window.localStorage.setItem(WEIGHTS_STORAGE_KEY, JSON.stringify(weights));
  }, [weights, weightsLoaded]);

  useEffect(() => {
    if (ratingsLoaded) window.localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(ratings));
  }, [ratings, ratingsLoaded]);

  const visiblePairs = useMemo(() => {
    const pairs = (data?.pairs ?? []).filter((pair) =>
      !showOnlyUserPairs || pair.left.isCurrentProfile || pair.right.isCurrentProfile,
    );
    return [...pairs].sort((a, b) => {
      const aHasManualRating = ratings[a.key] !== undefined;
      const bHasManualRating = ratings[b.key] !== undefined;
      // Keep the two ranking modes distinct: simulated scores are not directly
      // comparable to the available-signal fallback until both pairs are manually rated.
      if (aHasManualRating !== bHasManualRating) return aHasManualRating ? -1 : 1;
      const aScore = aHasManualRating
        ? simulatedScore(a, weights, ratings[a.key])
        : liveAvailableScore(a, weights);
      const bScore = bHasManualRating
        ? simulatedScore(b, weights, ratings[b.key])
        : liveAvailableScore(b, weights);
      return (bScore ?? -1) - (aScore ?? -1);
    });
  }, [data, ratings, showOnlyUserPairs, weights]);

  function changeWeight(key: WeightKey, value: number) {
    setWeights((current) => adjustWeights(current, key, value));
  }

  function resetWeights() {
    setWeights(DEFAULT_WEIGHTS);
  }

  function exportReport() {
    if (!data) return;
    const report = {
      exportedAt: new Date().toISOString(),
      proposedWeights: weights,
      note: "Reasoning similarity comes from a local-LLM rubric over poem text; manual ratings are separate evaluation labels. Weights in this report only simulate ranking and do not directly change production configuration.",
      pairs: visiblePairs.map((pair) => ({
        left: pair.left.displayName,
        right: pair.right.displayName,
        reasoningSimilarity: pair.reasoningSimilarity,
        semanticSimilarity: pair.semanticSimilarity,
        styleSimilarity: pair.styleSimilarity,
        manualThinkingSimilarity: ratings[pair.key] ?? null,
        currentAvailableScore: liveAvailableScore(pair, weights),
        simulatedScore: simulatedScore(pair, weights, ratings[pair.key]),
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "soulvector-algorithm-diagnostics.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="SoulVector — главная">SoulVector<span>.</span></Link>
        <nav className={styles.nav}>
          <Link href="/onboarding/poems">Мои стихотворения</Link>
          <span className={styles.navCurrent}>Лаборатория алгоритма</span>
        </nav>
        <span className={styles.devBadge}><span /> DEV TOOL</span>
      </header>

      <section className={styles.intro}>
        <p className={styles.eyebrow}>SOULVECTOR / RESEARCH</p>
        <h1>Лаборатория<br />алгоритма совпадений.</h1>
        <p className={styles.lead}>
          Сравниваем доступные сигналы отдельно и проверяем, как веса меняют порядок пар.
          Это исследовательский экран: изменения здесь не меняют рабочие рекомендации.
        </p>
        <div className={styles.notice}>
          <strong>Рабочая гипотеза весов:</strong> мышление — 60%, смысл — 32%, стиль письма — 8%.
          Анализ способов развития мысли теперь выполняется локальной LLM по текстовым свидетельствам. Ручная оценка ниже остаётся независимой меткой для проверки модели; веса здесь меняют только диагностическую симуляцию.
        </div>
      </section>

      <section className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>01 / ПАРАМЕТРЫ</p>
              <h2>Веса модели</h2>
            </div>
            <button className={styles.textButton} type="button" onClick={resetWeights}>Сбросить</button>
          </div>
          <p className={styles.panelDescription}>Все веса автоматически нормализуются до 100%.</p>

          {([
            { key: "thinking" as const, title: "Способ рассуждения", detail: "Как развиваются идеи и противоречия", color: "thinking" },
            { key: "meaning" as const, title: "Содержание и смысл", detail: "Общие темы, вопросы и идеи", color: "meaning" },
            { key: "style" as const, title: "Стиль письма", detail: "Морфология и формальные привычки", color: "style" },
          ]).map((item) => (
            <div className={styles.weightControl} key={item.key}>
              <div className={styles.weightLabelRow}>
                <label htmlFor={`weight-${item.key}`}>{item.title}</label>
                <strong>{weights[item.key]}%</strong>
              </div>
              <p>{item.detail}</p>
              <input
                id={`weight-${item.key}`}
                className={item.key === "thinking" ? styles.range_thinking : item.key === "meaning" ? styles.range_meaning : styles.range_style}
                type="range"
                min={0}
                max={100}
                step={1}
                value={weights[item.key]}
                onChange={(event) => changeWeight(item.key, Number(event.target.value))}
              />
            </div>
          ))}

          <div className={styles.totalWeight}><span>Сумма весов</span><strong>{WEIGHT_KEYS.reduce((sum, key) => sum + weights[key], 0)}%</strong></div>
          <div className={styles.weightBar} aria-label="Распределение весов">
            <span className={styles.weightThinking} style={{ width: `${weights.thinking}%` }} />
            <span className={styles.weightMeaning} style={{ width: `${weights.meaning}%` }} />
            <span className={styles.weightStyle} style={{ width: `${weights.style}%` }} />
          </div>
          <div className={styles.weightLegend}>
            <span><i className={styles.legendThinking} />Мышление</span>
            <span><i className={styles.legendMeaning} />Смысл</span>
            <span><i className={styles.legendStyle} />Стиль</span>
          </div>
          <div className={styles.panelFootnote}>
            Все три сигнала теперь вычисляются отдельно. Изменение весов в лаборатории меняет только диагностический рейтинг, но не формулу рабочего поиска.
          </div>
        </aside>

        <section className={styles.results}>
          <div className={styles.resultsHeader}>
            <div>
              <p className={styles.eyebrow}>02 / СРАВНЕНИЕ</p>
              <h2>Пары профилей</h2>
              <p className={styles.panelDescription}>
                Значения считаются из сохранённых векторов Supabase. Сырые векторы не передаются браузеру.
              </p>
            </div>
            <button className={styles.secondaryButton} type="button" onClick={() => void loadDiagnostics(profileId)} disabled={isLoading}>
              {isLoading ? "Загрузка…" : "Обновить данные"}
            </button>
          </div>

          <div className={styles.toolbar}>
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={showOnlyUserPairs} onChange={(event) => setShowOnlyUserPairs(event.target.checked)} />
              Только пары с моим профилем
            </label>
            <button className={styles.textButton} type="button" onClick={exportReport} disabled={!data || visiblePairs.length === 0}>
              Экспорт JSON ↗
            </button>
          </div>

          {isLoading && <div className={styles.emptyState}>Загружаем профили из тестовой базы…</div>}
          {!isLoading && error && (
            <div className={styles.errorState}>
              <strong>Не удалось загрузить диагностику</strong>
              <p>{error}</p>
              <button className={styles.secondaryButton} type="button" onClick={() => void loadDiagnostics(profileId)}>Повторить</button>
            </div>
          )}
          {!isLoading && !error && !data?.profiles.length && (
            <div className={styles.emptyState}>
              <h3>Пока нет профилей для сравнения</h3>
              <p>Сначала проанализируй стихотворение на странице профиля или запусти скрипт тестовых данных.</p>
              <Link href="/onboarding/poems" className={styles.primaryButton}>Добавить стихотворение</Link>
            </div>
          )}
          {!isLoading && !error && data && data.profiles.length > 0 && (
            <>
              <div className={styles.datasetSummary}>
                <div><strong>{data.profiles.length}</strong><span>профилей загружено</span></div>
                <div><strong>{data.pairs.length}</strong><span>пар рассчитано</span></div>
                <div><strong>{data.profiles.filter((profile) => profile.reasoningReady).length}</strong><span>с анализом рассуждений</span></div>
              </div>
              {!data.currentProfileId && (
                <p className={styles.inlineNote}>
                  ID текущего профиля в этом браузере не найден. Показаны демо-профили; чтобы сравнить их с собой, сначала открой «Мои стихотворения» и выполни анализ.
                </p>
              )}
              {visiblePairs.length === 0 ? (
                <div className={styles.emptyState}>Для выбранного фильтра пока нет пар. Отключи фильтр или создай второй профиль.</div>
              ) : (
                <div className={styles.pairList}>
                  {visiblePairs.map((pair, index) => {
                    const currentScore = liveAvailableScore(pair, weights);
                    const thinkingRating = ratings[pair.key];
                    const simulated = simulatedScore(pair, weights, thinkingRating);
                    const hasUserPair = pair.left.isCurrentProfile || pair.right.isCurrentProfile;
                    return (
                      <article className={styles.pairCard} key={pair.key}>
                        <div className={styles.pairTopline}>
                          <span className={styles.rank}>#{index + 1}</span>
                          {hasUserPair && <span className={styles.youTag}>МОЙ ПРОФИЛЬ</span>}
                          <span className={styles.pairPoems}>{pair.left.poemCount} + {pair.right.poemCount} стих.</span>
                        </div>
                        <div className={styles.pairNames}>
                          <div><span>Профиль A</span><strong>{pair.left.displayName}</strong></div>
                          <span className={styles.pairConnector}>↔</span>
                          <div><span>Профиль B</span><strong>{pair.right.displayName}</strong></div>
                        </div>
                        <div className={styles.scoresGrid}>
                          <div className={styles.scoreItem}>
                            <div className={styles.scoreHeading}><span>Способы рассуждения</span><strong>{scoreLabel(pair.reasoningSimilarity)}</strong></div>
                            <div className={styles.scoreTrack}><span className={styles.thinkingFill} style={{ width: `${(pair.reasoningSimilarity ?? 0) * 100}%` }} /></div>
                          </div>
                          <div className={styles.scoreItem}>
                            <div className={styles.scoreHeading}><span>Содержание</span><strong>{scoreLabel(pair.semanticSimilarity)}</strong></div>
                            <div className={styles.scoreTrack}><span className={styles.meaningFill} style={{ width: `${(pair.semanticSimilarity ?? 0) * 100}%` }} /></div>
                          </div>
                          <div className={styles.scoreItem}>
                            <div className={styles.scoreHeading}><span>Стиль письма</span><strong>{scoreLabel(pair.styleSimilarity)}</strong></div>
                            <div className={styles.scoreTrack}><span className={styles.styleFill} style={{ width: `${(pair.styleSimilarity ?? 0) * 100}%` }} /></div>
                          </div>
                        </div>
                        <div className={styles.scoreSummary}>
                          <div><span>Индекс по доступным сигналам</span><strong>{toPct(currentScore)}</strong></div>
                          <p>Используются доступные оценки трёх компонентов; для старых профилей без reasoning-вектора компонент мышления пропускается.</p>
                        </div>
                        <details className={styles.thinkingDetails}>
                          <summary>{thinkingRating === undefined ? "Добавить ручную оценку мышления" : `Ручная оценка мышления: ${thinkingRating}%`}</summary>
                          <p>Поставь независимую ручную оценку того, насколько похоже авторы развивают мысли. Она нужна, чтобы проверять оценки локальной LLM, а не подменять их незаметно.</p>
                          <div className={styles.manualRatingRow}>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={thinkingRating ?? 50}
                              onChange={(event) => setRatings((current) => ({ ...current, [pair.key]: Number(event.target.value) }))}
                              aria-label="Ручная оценка сходства мышления"
                            />
                            <strong>{thinkingRating === undefined ? "—" : `${thinkingRating}%`}</strong>
                          </div>
                          <div className={styles.ratingActions}>
                            <span>0 — совсем не похожи, 100 — очень похожи</span>
                            {thinkingRating !== undefined && <button type="button" className={styles.textButton} onClick={() => setRatings((current) => { const next = { ...current }; delete next[pair.key]; return next; })}>Удалить оценку</button>}
                          </div>
                          {thinkingRating !== undefined && (
                            <div className={styles.simulatedSummary}>
                              <span>Симуляция по выбранным весам</span>
                              <strong>{toPct(simulated)}</strong>
                              <small>Использует ручную оценку мышления и реальные сигналы содержания/стиля. Только для исследования.</small>
                            </div>
                          )}
                        </details>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </section>

      <footer className={styles.footer}>
        <p>Диагностическая лаборатория · не влияет на публичные рекомендации</p>
        <Link href="/onboarding/poems">Назад к стихотворениям →</Link>
      </footer>
    </main>
  );
}
