import Link from "next/link";

const thinkingPatterns = [
  "Саморефлексия",
  "Мышление через образы",
  "Поиск причин",
  "Работа с противоречиями",
];

const principles = [
  {
    number: "01",
    title: "Способ мышления, а не вкус",
    description:
      "Ищем сходство в том, как люди рассуждают, связывают идеи и осмысляют собственный опыт.",
  },
  {
    number: "02",
    title: "Несколько текстов",
    description:
      "Сопоставляем несколько стихотворений, чтобы увидеть повторяющиеся способы выражения и развития мысли.",
  },
  {
    number: "03",
    title: "Объяснимые совпадения",
    description:
      "Показываем, какие особенности текстов похожи, и приводим основания для каждого наблюдения.",
  },
];

const steps = [
  {
    number: "01 / ТЕКСТЫ",
    title: "Добавь стихотворения",
    description:
      "Добавь от трёх до пяти своих произведений. Перед анализом их можно отредактировать или удалить.",
  },
  {
    number: "02 / АНАЛИЗ",
    title: "Посмотри на свой способ мышления",
    description:
      "Система исследует, как в текстах развиваются идеи, связываются образы, формулируются вопросы и раскрываются противоречия.",
  },
  {
    number: "03 / ПОИСК",
    title: "Найди единомышленников",
    description:
      "Изучай людей со схожими мыслительными паттернами и смотри, на каких особенностях текстов основано сходство.",
  },
];

export default function HomePage() {
  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="button-primary" href="/onboarding/poems">
          Добавить стихотворения <span aria-hidden="true">→</span>
        </Link>

        <nav className="nav-links" aria-label="Основная навигация">
          <a href="#principles">О проекте</a>
          <a href="#how-it-works">Как это работает</a>
        </nav>

        <div className="top-actions">
          <span className="launch-pill">
            <span className="status-dot" />
            Концепция MVP
          </span>
          <a className="top-cta" href="#how-it-works">
            Узнать больше <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <main>
        <section className="hero" id="concept">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-line" aria-hidden="true" />
              ПОИСК ЕДИНОМЫШЛЕННИКОВ ПО ТЕКСТАМ
            </div>

            <h1>
              Найди людей,
              <br />
              <span className="gradient-text">которые думают похоже.</span>
            </h1>

            <p className="hero-lead">
              SoulVector анализирует не литературный вкус, а то, как человек
              развивает мысли, связывает идеи, использует образы и осмысляет
              свой опыт. По сходству этих текстовых особенностей сервис помогает
              находить единомышленников.
            </p>

            <div className="hero-actions">
              <a className="button-primary" href="#how-it-works">
                Как это работает <span aria-hidden="true">↗</span>
              </a>
              <a className="button-quiet" href="#principles">
                О проекте <span aria-hidden="true">↓</span>
              </a>
            </div>

            <div className="hero-note">
              <div>
                <strong>Начни со своих стихотворений.</strong>
                <p>Смотрим на то, как выражается мысль, а не только на тему.</p>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <article
              className="profile-card"
              aria-label="Пример анализа особенностей мышления в тексте"
            >
              <div className="card-topline">
                <span>ПРОФИЛЬ МЫШЛЕНИЯ ПО ТЕКСТАМ</span>
                <span className="demo-label">ПРИМЕР</span>
              </div>

              <div className="profile-main">
                <div className="profile-monogram" aria-hidden="true">
                  SV
                </div>
                <div>
                  <h2>Пример анализа</h2>
                  <p>Демонстрационные данные · 5 стихотворений</p>
                </div>
              </div>

              <div className="card-divider" />

              <div className="mini-section-label">
                ВОЗМОЖНЫЕ ОСОБЕННОСТИ ТЕКСТА
              </div>
              <div className="themes-list">
                {thinkingPatterns.map((pattern) => (
                  <span className="theme-chip" key={pattern}>
                    {pattern}
                  </span>
                ))}
              </div>

              <div className="profile-explanation">
                <div className="mini-section-label">ЧТО МЫ ИССЛЕДУЕМ</div>
                <p>
                  Как автор строит рассуждения, соединяет идеи, использует
                  метафоры и подходит к противоречиям. Затем эти наблюдения
                  сравниваются с анализом других текстов.
                </p>
              </div>

              <div className="quote-box">
                <p>
                  Это пример интерфейса, а не результат реального анализа.
                  Тексты могут показать особенности выражения мысли, но не дают
                  полного или окончательного описания личности.
                </p>
              </div>

              <div className="card-bottom">
                <span className="card-bottom-dot" aria-hidden="true" />
                Сходство мыслительных паттернов в текстах
              </div>
            </article>
          </div>
        </section>

        <section
          className="principles"
          id="principles"
          aria-label="Принципы сервиса"
        >
          {principles.map((principle) => (
            <article className="principle-item" key={principle.number}>
              <div className="principle-icon">{principle.number}</div>
              <div>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="steps-section" id="how-it-works">
          <div className="section-heading">
            <div>
              <p className="section-kicker">ТРИ ПРОСТЫХ ШАГА</p>
              <h2>
                От стихотворений
                <br />
                к поиску единомышленников.
              </h2>
            </div>

            <p className="section-description">
              Добавь несколько стихотворений. SoulVector выделит особенности
              мышления, заметные в текстах, и поможет найти авторов со схожими
              способами осмысления идей и опыта.
            </p>
          </div>

          <div className="step-grid">
            {steps.map((step) => (
              <article className="step-card" key={step.number}>
                <span className="step-index">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="closing-cta">
          <p className="section-kicker">SOULVECTOR</p>
          <h2>
            Найди людей,
            <br />
            с которыми похожим образом мыслишь.
          </h2>
          <p className="closing-description">
            Начни с нескольких стихотворений. Сервис сопоставит особенности
            выражения и развития мысли и покажет, на чём основано сходство.
          </p>
          <a className="button-primary" href="#concept">
            Вернуться к началу <span aria-hidden="true">↑</span>
          </a>
        </section>
      </main>

      <footer className="footer">
        <Link
          className="brand footer-brand"
          href="/"
          aria-label="SoulVector — главная"
        >
          <span className="brand-symbol" aria-hidden="true">
            <span />
          </span>
          <span className="brand-name">
            Soul<span>Vector</span>
          </span>
        </Link>
        <p>Поиск единомышленников по способу мышления.</p>
        <span className="footer-year">MVP · 2026</span>
      </footer>
    </div>
  );
}
