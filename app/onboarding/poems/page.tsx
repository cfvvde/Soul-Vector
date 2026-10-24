"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import styles from "./page.module.css";

type Poem = {
  id: string;
  title: string;
  text: string;
};

type MatchProfile = {
  profileId: string;
  displayName: string;
  poemCount: number;
  sampleWords: number;
  similarity: number;
  reasoningSimilarity: number;
  styleSimilarity: number;
  semanticSimilarity: number;
};

type ReasoningFeature = {
  key: string;
  label: string;
  help?: string;
  score: number;
};

type ReasoningEvidence = {
  poemId: string;
  poemTitle: string;
  featureKey: string;
  featureLabel: string;
  quote: string;
  observation: string;
};

type ReasoningProfile = {
  version: string;
  model: string;
  dimensions: number;
  analyzedPoemCount: number;
  summary: string;
  features: ReasoningFeature[];
  poemAnalyses: Array<{
    poemId: string;
    title: string;
    summary: string;
    features: ReasoningFeature[];
    evidence: ReasoningEvidence[];
  }>;
  evidence: ReasoningEvidence[];
};

type PipelineStage = {
  id: string;
  label: string;
  status: string;
  model: string;
  details: string;
};

type StylometryReport = {
  version: string;
  dimensions: number;
  wordCount: number;
  metrics: {
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
  } | null;
};

type ProfileSummary = {
  profileId: string;
  displayName: string;
  isDiscoverable: boolean;
  poemCount: number;
  embeddingModel: string;
  updatedAt: string;
};

type EmbeddingAnalysis = {
  model: string;
  dimensions: number;
  poemCount: number;
  poems: Array<{
    id: string;
    title: string;
    similarityToProfile: number;
  }>;
  profileId: string;
  savedToDatabase: boolean;
  profile: ProfileSummary;
  profileVectorPreview: number[];
  authorStyle: StylometryReport | null;
  reasoningProfile: ReasoningProfile | null;
  pipelineStages: PipelineStage[];
  ranking?: {
    method: string;
    reasoningWeight: number;
    styleWeight: number;
    semanticWeight: number;
  };
  matches: MatchProfile[];
};

type ProfileApiResponse = {
  profile: ProfileSummary | null;
  poems: Poem[];
  analysis: EmbeddingAnalysis | null;
  matches: MatchProfile[];
  error?: string;
};

const PROFILE_STORAGE_KEY = "soulvector-profile-id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MIN_POEMS = 1;
const MAX_POEMS = 5;
const MAX_TEXT_LENGTH = 12000;

export default function PoemsPage() {
  const [poems, setPoems] = useState<Poem[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<EmbeddingAnalysis | null>(null);
  const [profileId, setProfileId] = useState("");
  const [profileExists, setProfileExists] = useState(false);
  const [profileSettingsLoaded, setProfileSettingsLoaded] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const hasMinimum = poems.length >= MIN_POEMS;
  const isAtLimit = poems.length >= MAX_POEMS;
  const progress = Math.min((poems.length / MAX_POEMS) * 100, 100);

  useEffect(() => {
    let active = true;

    async function loadSavedProfile() {
      try {
        let savedProfileId = window.localStorage.getItem(PROFILE_STORAGE_KEY);
        if (!savedProfileId || !UUID_PATTERN.test(savedProfileId)) {
          savedProfileId = window.crypto.randomUUID();
          window.localStorage.setItem(PROFILE_STORAGE_KEY, savedProfileId);
        }

        if (!active) return;
        setProfileId(savedProfileId);

        const response = await fetch(
          `/api/profile?profileId=${encodeURIComponent(savedProfileId)}`,
          { cache: "no-store" },
        );
        const result = (await response.json()) as ProfileApiResponse;

        if (!response.ok) {
          throw new Error(result.error || "Не удалось загрузить сохранённый профиль.");
        }
        if (!active) return;

        if (result.profile) {
          setProfileExists(true);
          setDisplayName(result.profile.displayName);
          setPoems(result.poems);
          setAnalysis(result.analysis);
        }
      } catch (error) {
        if (active) {
          setNotice(
            error instanceof Error
              ? error.message
              : "Не удалось загрузить профиль из PostgreSQL.",
          );
        }
      } finally {
        if (active) setProfileSettingsLoaded(true);
      }
    }

    void loadSavedProfile();
    return () => {
      active = false;
    };
  }, []);

  async function saveProfileSettings(payload: {
    displayName: string;
  }) {
    if (!profileId || !profileExists) return;

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, ...payload }),
      });
      const result = (await response.json()) as {
        profile?: ProfileSummary;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || "Не удалось сохранить настройки профиля.");
      }

      if (result.profile) {
        setDisplayName(result.profile.displayName);
        setAnalysis((current) => current
          ? { ...current, profile: result.profile as ProfileSummary }
          : current);
      }
      setNotice("Настройки профиля сохранены.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось сохранить настройки.");
      throw error;
    }
  }

  function resetForm() {
    setTitle("");
    setText("");
    setEditingId(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanTitle = title.trim();
    const cleanText = text.trim();

    if (!cleanTitle || !cleanText) {
      setNotice("Заполни название и текст стихотворения.");
      return;
    }

    setAnalysis(null);

    if (editingId) {
      setPoems((current) =>
        current.map((poem) =>
          poem.id === editingId
            ? { ...poem, title: cleanTitle, text: cleanText }
            : poem,
        ),
      );
      setNotice("Изменения сохранены.");
    } else {
      if (poems.length >= MAX_POEMS) {
        setNotice("Можно добавить не больше пяти стихотворений.");
        return;
      }

      const newPoem: Poem = {
        id: `${Date.now()}-${poems.length}`,
        title: cleanTitle,
        text: cleanText,
      };

      setPoems((current) => [...current, newPoem]);
      setNotice("Стихотворение добавлено.");
    }

    resetForm();
  }

  function handleEdit(poem: Poem) {
    setEditingId(poem.id);
    setTitle(poem.title);
    setText(poem.text);
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleDelete(id: string) {
    setAnalysis(null);
    setPoems((current) => current.filter((poem) => poem.id !== id));

    if (editingId === id) {
      resetForm();
    }

    setNotice("Стихотворение удалено.");
  }

  async function handlePrepareAnalysis() {
    if (!hasMinimum || isAnalyzing || !profileSettingsLoaded || !profileId) return;

    setIsAnalyzing(true);
    setAnalysis(null);
    setNotice("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poems, profileId, displayName, isDiscoverable: true }),
      });

      const result = (await response.json()) as EmbeddingAnalysis & { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "Не удалось выполнить анализ.");
      }

      setAnalysis(result);
      setProfileExists(true);
      setDisplayName(result.profile.displayName);
      setNotice("Анализ завершён: профиль и embeddings сохранены в PostgreSQL.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Не удалось связаться с сервером анализа. Попробуй ещё раз.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="SoulVector — главная">
          <span className={styles.brandMark} aria-hidden="true">
            <span />
          </span>
          <span>
            Soul<span className={styles.brandAccent}>Vector</span>
          </span>
        </Link>

        <Link className={styles.backLink} href="/">
          <span aria-hidden="true">←</span> На главную
        </Link>
      </header>

      <div className={styles.content}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>ШАГ 1 · ТВОИ ТЕКСТЫ</p>
          <h1>
            Покажи, <span>как ты думаешь.</span>
          </h1>
          <p className={styles.lead}>
            Добавь от одного до пяти собственных стихотворений. Мы будем
            анализировать темы, связи между идеями и то, как развивается мысль
            в тексте, чтобы находить людей со схожими способами мышления.
          </p>
        </div>

        <section className={styles.progressSection} aria-label="Прогресс добавления стихотворений">
          <div className={styles.progressHeader}>
            <span>Твои стихотворения</span>
            <span className={styles.progressCount}>{poems.length} из {MAX_POEMS}</span>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={MAX_POEMS}
            aria-valuenow={Math.min(poems.length, MAX_POEMS)}
            aria-label="Количество стихотворений для минимального набора"
          >
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <p className={styles.progressHint}>
            {hasMinimum
              ? "Уже можно анализировать. Дополнительные стихотворения помогут сделать профиль разнообразнее."
              : "Добавь первое стихотворение, чтобы построить профиль."}
          </p>
        </section>

        <div className={styles.layout}>
          <section className={styles.formCard}>
            <div className={styles.cardHeading}>
              <div>
                <p className={styles.cardEyebrow}>
                  {editingId ? "РЕДАКТИРОВАНИЕ" : "НОВОЕ ПРОИЗВЕДЕНИЕ"}
                </p>
                <h2>{editingId ? "Измени стихотворение" : "Добавить стихотворение"}</h2>
              </div>
              <span className={styles.cardNumber}>
                {editingId ? "✎" : "+"}
              </span>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.fieldLabel} htmlFor="poem-title">
                Название
              </label>
              <input
                id="poem-title"
                className={styles.input}
                type="text"
                placeholder="Название стихотворения"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                required
              />

              <div className={styles.textLabelRow}>
                <label className={styles.fieldLabel} htmlFor="poem-text">
                  Текст стихотворения
                </label>
                <span className={styles.characterCount}>
                  {text.length.toLocaleString("ru-RU")} / {MAX_TEXT_LENGTH.toLocaleString("ru-RU")}
                </span>
              </div>
              <textarea
                id="poem-text"
                className={styles.textarea}
                placeholder={"Вставь текст стихотворения здесь…"}
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={MAX_TEXT_LENGTH}
                rows={11}
                required
              />
              <p className={styles.fieldHint}>
                Сохраняй оригинальные формулировки и переносы строк. Не добавляй
                личные данные других людей без их согласия.
              </p>

              <div className={styles.formActions}>
                <button
                  className={styles.primaryButton}
                  type="submit"
                  disabled={!title.trim() || !text.trim() || (!editingId && isAtLimit)}
                >
                  {editingId ? "Сохранить изменения" : "Добавить стихотворение"}
                </button>
                {editingId && (
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={resetForm}
                  >
                    Отмена
                  </button>
                )}
              </div>
              {isAtLimit && !editingId && (
                <p className={styles.fieldHint}>
                  Добавлено пять стихотворений — это максимум для текущего сценария.
                </p>
              )}
            </form>
          </section>

          <aside className={styles.listSection}>
            <div className={styles.listHeading}>
              <div>
                <p className={styles.cardEyebrow}>ТВОЯ ПОДБОРКА</p>
                <h2>Добавленные тексты</h2>
              </div>
              <span className={styles.listCount}>{poems.length}</span>
            </div>

            {poems.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon} aria-hidden="true">＋</div>
                <h3>Пока здесь пусто</h3>
                <p>
                  Добавь первое стихотворение через форму. Оно появится в этом
                  списке, где его можно будет изменить или удалить.
                </p>
              </div>
            ) : (
              <div className={styles.poemList}>
                {poems.map((poem, index) => (
                  <article className={styles.poemCard} key={poem.id}>
                    <div className={styles.poemCardTop}>
                      <span className={styles.poemIndex}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className={styles.poemControls}>
                        <button
                          className={styles.textButton}
                          type="button"
                          onClick={() => handleEdit(poem)}
                          aria-label={`Редактировать: ${poem.title}`}
                        >
                          Изменить
                        </button>
                        <button
                          className={`${styles.textButton} ${styles.deleteButton}`}
                          type="button"
                          onClick={() => handleDelete(poem.id)}
                          aria-label={`Удалить: ${poem.title}`}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                    <h3>{poem.title}</h3>
                    <p className={styles.poemExcerpt}>
                      {poem.text.length > 240
                        ? `${poem.text.slice(0, 240).trimEnd()}…`
                        : poem.text}
                    </p>
                    <span className={styles.poemLength}>
                      {poem.text.length.toLocaleString("ru-RU")} символов
                    </span>
                  </article>
                ))}
              </div>
            )}

            <div className={styles.privacyNote}>
              <strong>Настройки профиля</strong>
              <label className={styles.profileFieldLabel} htmlFor="profile-display-name">
                Имя в рекомендациях
              </label>
              <input
                id="profile-display-name"
                className={styles.profileNameInput}
                type="text"
                placeholder="Например, Алекс"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                onBlur={() => {
                  if (profileExists && displayName.trim()) {
                    void saveProfileSettings({ displayName: displayName.trim() }).catch(() => undefined);
                  }
                }}
                maxLength={40}
              />
              <div className={styles.discoverabilityInfo}>
                <strong>Участие в поиске включено</strong>
                <p>
                  После анализа профиль автоматически появится в поиске единомышленников.
                  Другим участникам показываются имя профиля и показатель семантической
                  близости; сами тексты не публикуются в карточке совпадения.
                </p>
              </div>
              <p>
                При анализе стихи и векторы сохраняются в PostgreSQL. Векторы используются
                для поиска семантической близости текстов, а не для оценки личности.
              </p>
            </div>
          </aside>
        </div>

        <section className={styles.bottomAction}>
          <div>
            <h2>
              {hasMinimum
                ? analysis
                  ? "Семантический профиль построен"
                  : "Набор готов к анализу"
                : "Сначала добавь одно стихотворение"}
            </h2>
            <p>
              {hasMinimum
                ? "Модель преобразует тексты в векторы, сохраняет профиль и ищет ближайшие доступные профили в PostgreSQL."
                : "Добавь первое стихотворение, чтобы построить профиль и запустить поиск единомышленников."}
            </p>
          </div>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={!hasMinimum || isAnalyzing || !profileSettingsLoaded}
            onClick={handlePrepareAnalysis}
          >
            {!profileSettingsLoaded
              ? "Загружаем профиль…"
              : isAnalyzing
                ? "Анализируем тексты…"
                : analysis
                  ? "Пересчитать анализ"
                  : "Проанализировать тексты"}
            {!isAnalyzing && <span aria-hidden="true">→</span>}
          </button>
        </section>

        {notice && (
          <p className={styles.notice} role="status" aria-live="polite">
            {notice}
          </p>
        )}

        {analysis && (
          <section className={styles.analysisResult} aria-labelledby="analysis-title">
            <div className={styles.analysisHeader}>
              <div>
                <p className={styles.cardEyebrow}>АНАЛИЗ СТИЛЯ И СОДЕРЖАНИЯ</p>
                <h2 id="analysis-title">Профиль текста построен</h2>
              </div>
              <span className={styles.resultBadge}>Готово</span>
            </div>

            <div className={styles.analysisStats}>
              <div className={styles.analysisStat}>
                <span>Проанализировано текстов</span>
                <strong>{analysis.poemCount}</strong>
              </div>
              <div className={styles.analysisStat}>
                <span>Размерность вектора</span>
                <strong>{analysis.dimensions}</strong>
              </div>
              <div className={styles.analysisStat}>
                <span>Embedding-модель</span>
                <strong>{analysis.model}</strong>
              </div>
            </div>

            <p className={styles.analysisExplanation}>
              Обработка состоит из трёх независимых этапов: семантическое представление текста, локальный LLM-анализ наблюдаемых способов развития мысли и русская стилометрия. Текущие исследовательские веса — 60% рассуждения, 32% смысл, 8% стиль. Это гипотеза ранжирования, а не валидированная мера мышления или совместимости.
            </p>

            {analysis.pipelineStages?.length > 0 && (
              <section className={styles.pipelineGrid} aria-label="Этапы анализа">
                {analysis.pipelineStages.map((stage, index) => (
                  <article className={styles.pipelineCard} key={stage.id}>
                    <div className={styles.pipelineTopline}>
                      <span>ЭТАП 0{index + 1}</span>
                      <span className={styles.pipelineDone}>Завершён</span>
                    </div>
                    <h3>{stage.label}</h3>
                    <p>{stage.details}</p>
                    <small>{stage.model}</small>
                  </article>
                ))}
              </section>
            )}

            {analysis.reasoningProfile && (
              <section className={styles.reasoningPanel} aria-labelledby="reasoning-profile-title">
                <div className={styles.reasoningHeader}>
                  <div>
                    <p className={styles.cardEyebrow}>ЭТАП 2 · ЛОКАЛЬНАЯ LLM</p>
                    <h3 id="reasoning-profile-title">Наблюдаемые способы развития мысли</h3>
                  </div>
                  <span className={styles.reasoningModel}>{analysis.reasoningProfile.model}</span>
                </div>
                <p className={styles.reasoningSummary}>{analysis.reasoningProfile.summary}</p>
                <div className={styles.reasoningFeatureGrid}>
                  {analysis.reasoningProfile.features.map((feature) => (
                    <div className={styles.reasoningFeature} key={feature.key}>
                      <div className={styles.reasoningFeatureHeading}>
                        <span>{feature.label}</span>
                        <strong>{feature.score.toFixed(2)}</strong>
                      </div>
                      <div className={styles.reasoningTrack} role="img" aria-label={`${feature.label}: ${feature.score.toFixed(2)} из 1`}>
                        <div className={styles.reasoningFill} style={{ width: `${Math.max(0, Math.min(feature.score, 1)) * 100}%` }} />
                      </div>
                      {feature.help && <p>{feature.help}</p>}
                    </div>
                  ))}
                </div>
                {analysis.reasoningProfile.evidence.length > 0 ? (
                  <div className={styles.reasoningEvidenceSection}>
                    <p className={styles.cardEyebrow}>ПРИМЕРЫ ИЗ ТЕКСТА</p>
                    <div className={styles.reasoningEvidenceList}>
                      {analysis.reasoningProfile.evidence.map((evidence, index) => (
                        <article className={styles.reasoningEvidence} key={`${evidence.poemId}-${evidence.featureKey}-${index}`}>
                          <span>{evidence.poemTitle} · {evidence.featureLabel}</span>
                          <blockquote>«{evidence.quote}»</blockquote>
                          <p>{evidence.observation}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className={styles.authorStyleFootnote}>Модель не вернула цитаты, которые удалось подтвердить точным совпадением в исходном тексте. Оценки остаются экспериментальными и требуют проверки.</p>
                )}
                <p className={styles.authorStyleFootnote}>
                  Эти оценки описывают признаки, проявившиеся в стихотворениях, а не постоянные способности или психологические характеристики автора. Версия {analysis.reasoningProfile.version}; оценка локальной LLM не является независимым научным измерением.
                </p>
              </section>
            )}

            {!analysis.reasoningProfile && (
              <p className={styles.authorStyleFootnote}>
                Для этого профиля ещё нет этапа анализа рассуждений. Повторно запусти анализ после установки модели qwen3:4b-instruct и миграции 005.
              </p>
            )}

            {analysis.authorStyle?.metrics && (
              <section className={styles.authorStylePanel} aria-labelledby="author-style-title">
                <div className={styles.authorStyleHeader}>
                  <div>
                    <p className={styles.cardEyebrow}>СТИЛОМЕТРИЯ · ЭКСПЕРИМЕНТАЛЬНО</p>
                    <h3 id="author-style-title">Наблюдаемые особенности письма</h3>
                  </div>
                  <span className={styles.authorStyleCount}>{analysis.authorStyle.wordCount} слов</span>
                </div>
                <div className={styles.styleMetricGrid}>
                  <div className={styles.styleMetric}>
                    <span>Средняя длина слова</span>
                    <strong>{analysis.authorStyle.metrics.averageWordLength.toFixed(2)} символа</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Разнообразие слов</span>
                    <strong>{Math.round(analysis.authorStyle.metrics.lexicalDiversityRatio * 100)}%</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Слов в строке</span>
                    <strong>{analysis.authorStyle.metrics.averageWordsPerLine.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Местоимения «я / меня» на 100 слов</span>
                    <strong>{analysis.authorStyle.metrics.firstPersonPronounsPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Отрицания на 100 слов</span>
                    <strong>{analysis.authorStyle.metrics.negationsPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Пунктуационные знаки на 100 слов</span>
                    <strong>{analysis.authorStyle.metrics.punctuationPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Слова с дефисом</span>
                    <strong>{Math.round(analysis.authorStyle.metrics.hyphenatedWordRatio * 100)}%</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Повторяющиеся слова</span>
                    <strong>{Math.round(analysis.authorStyle.metrics.repeatedWordRatio * 100)}%</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Окончания прилагательных · эвристика на 100 слов</span>
                    <strong>{analysis.authorStyle.metrics.adjectiveEndingHeuristicPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Окончания наречий · эвристика на 100 слов</span>
                    <strong>{analysis.authorStyle.metrics.adverbEndingHeuristicPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Глагольные окончания · эвристика на 100 слов</span>
                    <strong>{analysis.authorStyle.metrics.verbEndingHeuristicPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Инфинитивные окончания · эвристика на 100 слов</span>
                    <strong>{analysis.authorStyle.metrics.infinitiveHeuristicPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Причастные окончания · эвристика на 100 слов</span>
                    <strong>{analysis.authorStyle.metrics.participleEndingHeuristicPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Деепричастные окончания · эвристика на 100 слов</span>
                    <strong>{analysis.authorStyle.metrics.gerundEndingHeuristicPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Гласных на слово · приблизительно</span>
                    <strong>{analysis.authorStyle.metrics.averageVowelsPerWord.toFixed(2)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Символьные n-граммы · заполнение словаря</span>
                    <strong>{Math.round(analysis.authorStyle.metrics.characterNgramCoverage * 100)}%</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Существительные на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.posNounPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Прилагательные на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.posAdjectivePer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Глаголы на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.posVerbPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Наречия на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.posAdverbPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Местоимения на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.posPronounPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Союзы на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.posConjunctionPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Предлоги на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.posPrepositionPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Частицы на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.posParticlePer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Инфинитивы на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.posInfinitivePer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Причастия на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.posParticiplePer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Деепричастия на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.posGerundPer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Родительный падеж на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.genitiveCasePer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Прошедшее время на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.pastTensePer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Настоящее время на 100 слов · pymorphy3</span>
                    <strong>{analysis.authorStyle.metrics.presentTensePer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Первое лицо в грамматической форме · на 100 слов</span>
                    <strong>{analysis.authorStyle.metrics.firstPersonGrammemePer100.toFixed(1)}</strong>
                  </div>
                  <div className={styles.styleMetric}>
                    <span>Доля токенов с распознанной частью речи</span>
                    <strong>{Math.round(analysis.authorStyle.metrics.morphologyCoverage * 100)}%</strong>
                  </div>
                </div>
                <p className={styles.authorStyleFootnote}>
                  Версия {analysis.authorStyle.version}: 80 статистических признаков, 128 морфологических, 216 обычных и 216 тематически ослабленных символьных n-грамм. POS-частоты рассчитаны pymorphy3 по наиболее вероятному словарному разбору без контекстной дизамбигуации. Эвристики окончаний остаются приближёнными. Эти признаки сравнивают форму письма, но не устанавливают характер или тип мышления. Для короткого стиха сигнал слабее.
                </p>
              </section>
            )}
            {!analysis.authorStyle && (
              <p className={styles.authorStyleFootnote}>
                Этот профиль рассчитан старой версией алгоритма. Запусти анализ повторно, чтобы создать стилометрический отпечаток и включить профиль в новый поиск.
              </p>
            )}

            <div className={styles.analysisPoemList}>
              {analysis.poems.map((poem) => {
                const score = Math.max(0, Math.min(poem.similarityToProfile, 1));
                return (
                  <div className={styles.analysisPoem} key={poem.id}>
                    <div className={styles.analysisPoemMeta}>
                      <span className={styles.analysisPoemTitle}>{poem.title}</span>
                      <span className={styles.analysisScore}>
                        {poem.similarityToProfile.toFixed(3)}
                      </span>
                    </div>
                    <div
                      className={styles.similarityTrack}
                      role="img"
                      aria-label={`Косинусная близость к вектору подборки: ${poem.similarityToProfile.toFixed(3)}`}
                    >
                      <div
                        className={styles.similarityFill}
                        style={{ width: `${score * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {analysis.poemCount === 1 && (
              <p className={styles.analysisFootnote}>
                В подборке один текст, поэтому его близость к собственному профильному
                вектору будет примерно 1.000 по построению. Это не показатель сходства
                с другими людьми. Для поиска единомышленников смотри результаты ниже.
              </p>
            )}
            <p className={styles.analysisFootnote}>
              Значение ближе к 1 означает, что текст ближе к усреднённому вектору
              этой подборки. Полоса — визуальная шкала числового показателя, не процент совместимости.
            </p>

            <div className={styles.vectorPreview}>
              <div className={styles.vectorPreviewHeading}>
                <strong>Вектор профиля сохранён</strong>
                <span>первые 12 из {analysis.dimensions} координат</span>
              </div>
              <code>{analysis.profileVectorPreview.join(", ")}</code>
            </div>

            <div className={styles.matchesSection}>
              <div className={styles.matchesHeading}>
                <div>
                  <p className={styles.cardEyebrow}>ПОИСК ЧЕРЕЗ PGVECTOR</p>
                  <h3>Найденные единомышленники</h3>
                </div>
                <span className={styles.listCount}>{analysis.matches.length}</span>
              </div>
              {analysis.matches.length > 0 ? (
                <div className={styles.matchList}>
                  {analysis.matches.map((match) => (
                    <article className={styles.matchCard} key={match.profileId}>
                      <div>
                        <strong>{match.displayName}</strong>
                        <p>{match.poemCount} стихотворения в профиле</p>
                      </div>
                      <div className={styles.matchScore}>
                        <span>{match.similarity.toFixed(3)}</span>
                        <small>индекс ранжирования · не процент</small>
                        <div
                          className={styles.similarityTrack}
                          role="img"
                          aria-label={`Гибридный индекс ранжирования: ${match.similarity.toFixed(3)}`}
                        >
                          <div
                            className={styles.similarityFill}
                            style={{ width: `${Math.max(0, Math.min(match.similarity, 1)) * 100}%` }}
                          />
                        </div>
                        <div className={styles.matchBreakdown}>
                          <span>Мышление: {match.reasoningSimilarity.toFixed(3)}</span>
                          <span>Смысл: {match.semanticSimilarity.toFixed(3)}</span>
                          <span>Стиль: {match.styleSimilarity.toFixed(3)}</span>
                        </div>
                        <small>{match.sampleWords} слов в выборке автора</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className={styles.noMatches}>
                  Пока нет других профилей в базе. Когда появятся другие участники,
                  здесь отобразятся ближайшие векторные профили и показатель их близости.
                </p>
              )}
              <p className={styles.analysisFootnote}>
                Экспериментальный рейтинг: 60% сходства наблюдаемых способов развития мысли, 32% семантической близости и 8% стилометрии русского текста. Старые профили нужно повторно проанализировать после установки локальной LLM и миграции 005. Числа — не проценты психологической совместимости.
              </p>
            </div>
          </section>
        )}

        <p className={styles.disclaimer}>
          Анализ будет описывать наблюдаемые особенности текстов, а не ставить
          диагноз или утверждать, каким человек является на самом деле.
        </p>
      </div>
    </main>
  );
}
