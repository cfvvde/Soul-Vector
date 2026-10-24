
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#F8F6F2] text-[#282624]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-2xl font-semibold tracking-tight">
          SoulVector<span className="text-violet-600">.</span>
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          <Link href="/login" className="hover:text-violet-700">
            Войти
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-[#282624] px-5 py-3 text-white transition hover:bg-violet-800"
          >
            Начать
          </Link>
        </nav>
      </header>

      <section className="mx-auto flex max-w-6xl flex-col px-6 pb-24 pt-20 md:pt-32">
        <p className="mb-6 text-sm uppercase tracking-[0.24em] text-violet-700">
          Поэзия соединяет
        </p>

        <h1 className="max-w-4xl text-5xl font-medium leading-tight tracking-tight md:text-7xl">
          Иногда один стих
          <br />
          говорит больше,
          <br />
          чем тысяча слов.
        </h1>

        <p className="mt-8 max-w-xl text-lg leading-8 text-stone-600">
          Находи людей, близких тебе по темам, образам
          и способу выражения мыслей. Начни со своих стихотворений.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/onboarding/poems"
            className="rounded-full bg-violet-700 px-7 py-4 font-medium text-white transition hover:bg-violet-800"
          >
            Найти созвучных авторов
          </Link>

          <Link
            href="/discover"
            className="rounded-full border border-stone-300 px-7 py-4 font-medium transition hover:bg-white"
          >
            Исследовать проект
          </Link>
        </div>

        <p className="mt-6 text-sm text-stone-500">
          Не тест личности, а исследование смыслов через поэзию.
        </p>
      </section>
    </main>
  );
}
