/**
 * Idempotently seeds a small Russian poetry test corpus into the local SoulVector DB.
 * Only use in development/testing. Profiles are labelled DEMO and made searchable.
 * Requires: Ollama + bge-m3 + qwen3:4b-instruct, DATABASE_URL, migrations 003/004/005, Python + pymorphy3, and `tsx`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPool } from "../lib/db";
import { calculateStylometry, STYLOMETRY_VERSION, STYLOMETRY_DIMENSIONS } from "../lib/stylometry";
import { analyzeRussianMorphology } from "../lib/russian-morphology";
import { analyzeReasoningProfile, REASONING_VERSION } from "../lib/reasoning-analysis";
import { printDemoSimilarityReport } from "./demo-similarity-report";

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadLocalEnv();

const EMBEDDING_MODEL = "bge-m3";
const EMBEDDING_DIMENSIONS = 1024;
const OLLAMA_URL = `${(process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434").replace(/\/+$/, "")}/api/embed`;
const FORCE = process.argv.includes("--force");
const CONFIRMED = process.argv.includes("--confirm-demo-data");

type SeedPoem = { id: string; title: string; text: string; sourceUrl: string };
type SeedProfile = { id: string; displayName: string; poems: SeedPoem[] };

const DEMO_PROFILES: SeedProfile[] = [
  {
    id: "f0000000-0000-4000-8000-000000000101",
    displayName: "ДЕМО · Пушкин — личная лирика",
    poems: [
      {
        id: "demo-pushkin-ya-vas-lyubil",
        title: "Я вас любил",
        sourceUrl: "https://ru.wikisource.org/wiki/Я_вас_любил:_любовь_ещё,_быть_может_(Пушкин)",
        text: `Я вас любил: любовь ещё, быть может,
В душе моей угасла не совсем;
Но пусть она вас больше не тревожит;
Я не хочу печалить вас ничем.

Я вас любил безмолвно, безнадежно,
То робостью, то ревностью томим;
Я вас любил так искренно, так нежно,
Как дай вам Бог любимой быть другим.`,
      },
      {
        id: "demo-pushkin-chudnoe-mgnovenie",
        title: "К *** (Я помню чудное мгновенье)",
        sourceUrl: "https://ru.wikisource.org/wiki/К_***_(«Я_помню_чудное_мгновенье…»)_(Пушкин)",
        text: `Я помню чудное мгновенье:
Передо мной явилась ты,
Как мимолетное виденье,
Как гений чистой красоты.

В томленьях грусти безнадежной,
В тревогах шумной суеты,
Звучал мне долго голос нежный
И снились милые черты.

Шли годы. Бурь порыв мятежный
Рассеял прежние мечты,
И я забыл твой голос нежный,
Твои небесные черты.

В глуши, во мраке заточенья
Тянулись тихо дни мои
Без божества, без вдохновенья,
Без слез, без жизни, без любви.

Душе настало пробужденье:
И вот опять явилась ты,
Как мимолетное виденье,
Как гений чистой красоты.

И сердце бьется в упоенье,
И для него воскресли вновь
И божество, и вдохновенье,
И жизнь, и слезы, и любовь.`,
      },
      {
        id: "demo-pushkin-gruzia",
        title: "На холмах Грузии",
        sourceUrl: "https://ru.wikisource.org/wiki/На_холмах_Грузии_лежит_ночная_мгла_(Пушкин)",
        text: `На холмах Грузии лежит ночная мгла;
Шумит Арагва предо мною.
Мне грустно и легко; печаль моя светла;
Печаль моя полна тобою,
Тобой, одной тобой... Унынья моего
Ничто не мучит, не тревожит,
И сердце вновь горит и любит — оттого,
Что не любить оно не может.`,
      },
    ],
  },
  {
    id: "f0000000-0000-4000-8000-000000000102",
    displayName: "ДЕМО · Пушкин — философские тексты",
    poems: [
      {
        id: "demo-pushkin-anchar",
        title: "Анчар",
        sourceUrl: "https://ru.wikisource.org/wiki/Анчар_(Пушкин)",
        text: `В пустыне чахлой и скупой,
На почве, зноем раскаленной,
Анчар, как грозный часовой,
Стоит — один во всей вселенной.

Природа жаждущих степей
Его в день гнева породила,
И зелень мертвую ветвей
И корни ядом напоила.

Яд каплет сквозь его кору,
К полудню растопясь от зною,
И застывает ввечеру
Густой прозрачною смолою.

К нему и птица не летит,
И тигр нейдет: лишь вихорь черный
На древо смерти набежит —
И мчится прочь, уже тлетворный.

И если туча оросит,
Блуждая, лист его дремучий,
С его ветвей, уж ядовит,
Стекает дождь в песок горючий.

Но человека человек
Послал к анчару властным взглядом,
И тот послушно в путь потек
И к утру возвратился с ядом.

Принес он смертную смолу
Да ветвь с увядшими листами,
И пот по бледному челу
Струился хладными ручьями;

Принес — и ослабел и лег
Под сводом шалаша на лыки,
И умер бедный раб у ног
Непобедимого владыки.

А царь тем ядом напитал
Свои послушливые стрелы
И с ними гибель разослал
К соседям в чуждые пределы.`,
      },
      {
        id: "demo-pushkin-prorok",
        title: "Пророк",
        sourceUrl: "https://ru.wikisource.org/wiki/Пророк_(Пушкин)",
        text: `Духовной жаждою томим,
В пустыне мрачной я влачился, —
И шестикрылый серафим
На перепутье мне явился.

Перстами легкими как сон
Моих зениц коснулся он.
Отверзлись вещие зеницы,
Как у испуганной орлицы.

Моих ушей коснулся он, —
И их наполнил шум и звон:
И внял я неба содроганье,
И горний ангелов полет,
И гад морских подводный ход,
И дольней лозы прозябанье.

И он к устам моим приник,
И вырвал грешный мой язык,
И празднословный и лукавый,
И жало мудрыя змеи
В уста замершие мои
Вложил десницею кровавой.

И он мне грудь рассек мечом,
И сердце трепетное вынул,
И угль, пылающий огнем,
Во грудь отверстую водвинул.

Как труп в пустыне я лежал,
И бога глас ко мне воззвал:
«Восстань, пророк, и виждь, и внемли,
Исполнись волею моей,
И, обходя моря и земли,
Глаголом жги сердца людей».`,
      },
      {
        id: "demo-pushkin-monument",
        title: "Я памятник себе воздвиг нерукотворный",
        sourceUrl: "https://ru.wikisource.org/wiki/Я_памятник_себе_воздвиг_нерукотворный_(Пушкин)",
        text: `Я памятник себе воздвиг нерукотворный,
К нему не зарастет народная тропа,
Вознесся выше он главою непокорной
Александрийского столпа.

Нет, весь я не умру — душа в заветной лире
Мой прах переживет и тленья убежит —
И славен буду я, доколь в подлунном мире
Жив будет хоть один пиит.

Слух обо мне пройдет по всей Руси великой,
И назовет меня всяк сущий в ней язык,
И гордый внук славян, и финн, и ныне дикой
Тунгус, и друг степей калмык.

И долго буду тем любезен я народу,
Что чувства добрые я лирой пробуждал,
Что в мой жестокий век восславил я Свободу
И милость к падшим призывал.

Веленью божию, о муза, будь послушна,
Обиды не страшась, не требуя венца,
Хвалу и клевету приемли равнодушно
И не оспоривай глупца.`,
      },
    ],
  },
  {
    id: "f0000000-0000-4000-8000-000000000103",
    displayName: "ДЕМО · Лермонтов — контрольный профиль",
    poems: [
      {
        id: "demo-lermontov-parus",
        title: "Парус",
        sourceUrl: "https://ru.wikisource.org/wiki/Парус_(Лермонтов)",
        text: `Белеет парус одинокой
В тумане моря голубом!..
Что ищет он в стране далекой?
Что кинул он в краю родном?.. 

Играют волны — ветер свищет,
И мачта гнется и скрыпит...
Увы! он счастия не ищет,
И не от счастия бежит!

Под ним струя светлей лазури,
Над ним луч солнца золотой...
А он, мятежный, просит бури,
Как будто в бурях есть покой!`,
      },
      {
        id: "demo-lermontov-tuchi",
        title: "Тучи",
        sourceUrl: "https://ru.wikisource.org/wiki/Тучи_(Лермонтов)",
        text: `Тучки небесные, вечные странники!
Степью лазурною, цепью жемчужною
Мчитесь вы, будто как я же, изгнанники
С милого севера в сторону южную.

Кто же вас гонит: судьбы ли решение?
Зависть ли тайная? злоба ль открытая?
Или на вас тяготит преступление?
Или друзей клевета ядовитая?

Нет, вам наскучили нивы бесплодные…
Чужды вам страсти и чужды страдания;
Вечно холодные, вечно свободные,
Нет у вас родины, нет вам изгнания.`,
      },
      {
        id: "demo-lermontov-road",
        title: "Выхожу один я на дорогу",
        sourceUrl: "https://ru.wikisource.org/wiki/Выхожу_один_я_на_дорогу_(Лермонтов)",
        text: `Выхожу один я на дорогу;
Сквозь туман кремнистый путь блестит;
Ночь тиха. Пустыня внемлет Богу,
И звезда с звездою говорит.

В небесах торжественно и чудно!
Спит земля в сиянье голубом...
Что же мне так больно и так трудно?
Жду ль чего? жалею ли о чём?

Уж не жду от жизни ничего я,
И не жаль мне прошлого ничуть;
Я ищу свободы и покоя!
Я б хотел забыться и заснуть!

Но не тем холодным сном могилы...
Я б желал навеки так заснуть,
Чтоб в груди дремали жизни силы,
Чтоб, дыша, вздымалась тихо грудь;

Чтоб всю ночь, весь день мой слух лелея,
Про любовь мне сладкий голос пел,
Надо мной чтоб, вечно зеленея,
Тёмный дуб склонялся и шумел.`,
      },
    ],
  },
  {
    id: "f0000000-0000-4000-8000-000000000104",
    displayName: "ДЕМО · Лермонтов — природа и рефлексия",
    poems: [
      {
        id: "demo-lermontov-yellowing-field",
        title: "Когда волнуется желтеющая нива",
        sourceUrl: "https://ru.wikisource.org/wiki/Когда_волнуется_желтеющая_нива_(Лермонтов)",
        text: `Когда волнуется желтеющая нива,
И свежий лес шумит при звуке ветерка,
И прячется в саду малиновая слива
Под тенью сладостной зеленого листка;

Когда росой обрызганный душистой,
Румяным вечером иль утра в час златой,
Из-под куста мне ландыш серебристый
Приветливо кивает головой;

Когда студеный ключ играет по оврагу
И, погружая мысль в какой-то смутный сон,
Лепечет мне таинственную сагу
Про мирный край, откуда мчится он, —

Тогда смиряется души моей тревога,
Тогда расходятся морщины на челе, —
И счастье я могу постигнуть на земле,
И в небесах я вижу Бога.`,
      },
      {
        id: "demo-lermontov-rodina",
        title: "Родина",
        sourceUrl: "https://ru.wikisource.org/wiki/Родина_(Лермонтов)",
        text: `Люблю отчизну я, но странною любовью!
Не победит ее рассудок мой.
Ни слава, купленная кровью,
Ни полный гордого доверия покой,
Ни темной старины заветные преданья
Не шевелят во мне отрадного мечтанья.

Но я люблю — за что, не знаю сам —
Ее степей холодное молчанье,
Ее лесов безбрежных колыханье,
Разливы рек ее, подобные морям;
Проселочным путем люблю скакать в телеге
И, взором медленным пронзая ночи тень,
Встречать по сторонам, вздыхая о ночлеге,
Дрожащие огни печальных деревень;

Люблю дымок спаленной жнивы,
В степи ночующий обоз
И на холме средь желтой нивы
Чету белеющих берез.
С отрадой, многим незнакомой,
Я вижу полное гумно,
Избу, покрытую соломой,
С резными ставнями окно;
И в праздник, вечером росистым,
Смотреть до полночи готов
На пляску с топаньем и свистом
Под говор пьяных мужичков.`,
      },
      {
        id: "demo-lermontov-prayer",
        title: "Молитва (В минуту жизни трудную)",
        sourceUrl: "https://ru.wikisource.org/wiki/Молитва_(В_минуту_жизни_трудную)_(Лермонтов)",
        text: `В минуту жизни трудную
Теснится ль в сердце грусть:
Одну молитву чудную
Твержу я наизусть.

Есть сила благодатная
В созвучье слов живых,
И дышит непонятная,
Святая прелесть в них.

С души как бремя скатится,
Сомненье далеко —
И верится, и плачется,
И так легко, легко...`,
      },
    ],
  },
  {
    id: "f0000000-0000-4000-8000-000000000105",
    displayName: "ДЕМО · Тютчев — мысль и природа",
    poems: [
      {
        id: "demo-tyutchev-silentium",
        title: "Silentium!",
        sourceUrl: "https://ru.wikisource.org/wiki/Silentium!_(Тютчев)",
        text: `Молчи, скрывайся и таи
И чувства и мечты свои —
Пускай в душевной глубине
Встают и заходят оне
Безмолвно, как звезды в ночи, —
Любуйся ими — и молчи.

Как сердцу высказать себя?
Другому как понять тебя?
Поймет ли он, чем ты живешь?
Мысль изреченная есть ложь.
Взрывая, возмутишь ключи, —
Питайся ими — и молчи.

Лишь жить в себе самом умей —
Есть целый мир в душе твоей
Таинственно-волшебных дум;
Их оглушит наружный шум,
Дневные разгонят лучи, —
Внимай их пенью — и молчи!..`,
      },
      {
        id: "demo-tyutchev-russia",
        title: "Умом Россию не понять",
        sourceUrl: "https://ru.wikisource.org/wiki/Умом_Россию_не_понять_(Тютчев)",
        text: `Умом Россию не понять,
Аршином общим не измерить:
У ней особенная стать —
В Россию можно только верить.`,
      },
      {
        id: "demo-tyutchev-autumn",
        title: "Есть в осени первоначальной",
        sourceUrl: "https://ru.wikisource.org/wiki/Есть_в_осени_первоначальной_(Тютчев)",
        text: `Есть в осени первоначальной
Короткая, но дивная пора —
Весь день стоит как бы хрустальный,
И лучезарны вечера...

Где бодрый серп гулял и падал колос,
Теперь уж пусто всё — простор везде, —
Лишь паутины тонкий волос
Блестит на праздной борозде.

Пустеет воздух, птиц не слышно боле,
Но далеко ещё до первых зимних бурь —
И льётся чистая и тёплая лазурь
На отдыхающее поле...`,
      },
    ],
  },
  {
    id: "f0000000-0000-4000-8000-000000000106",
    displayName: "ДЕМО · Фет — наблюдение и образность",
    poems: [
      {
        id: "demo-fet-whisper",
        title: "Шёпот, робкое дыханье",
        sourceUrl: "https://ru.wikisource.org/wiki/Шёпот,_робкое_дыханье_(Фет)",
        text: `Шёпот, робкое дыханье,
Трели соловья,
Серебро и колыханье
Сонного ручья,

Свет ночной, ночные тени,
Тени без конца,
Ряд волшебных изменений
Милого лица,

В дымных тучках пурпур розы,
Отблеск янтаря,
И лобзания, и слёзы,
И заря, заря!..`,
      },
      {
        id: "demo-fet-greeting",
        title: "Я пришёл к тебе с приветом",
        sourceUrl: "https://ru.wikisource.org/wiki/Я_пришёл_к_тебе_с_приветом_(Фет)",
        text: `Я пришёл к тебе с приветом,
Рассказать, что солнце встало,
Что оно горячим светом
По листам затрепетало;

Рассказать, что лес проснулся,
Весь проснулся, веткой каждой,
Каждой птицей встрепенулся
И весенней полон жаждой;

Рассказать, что с той же страстью,
Как вчера, пришёл я снова,
Что душа всё так же счастью
И тебе служить готова;

Рассказать, что отовсюду
На меня весельем веет,
Что не знаю сам, что буду
Петь — но только песня зреет.`,
      },
      {
        id: "demo-fet-morning",
        title: "Это утро, радость эта",
        sourceUrl: "https://ru.wikisource.org/wiki/Это_утро,_радость_эта_(Фет)",
        text: `Это утро, радость эта,
Эта мощь и дня и света,
Этот синий свод,
Этот крик и вереницы,
Эти стаи, эти птицы,
Этот говор вод,

Эти ивы и берёзы,
Эти капли — эти слёзы,
Этот пух — не лист,
Эти горы, эти долы,
Эти мошки, эти пчёлы,
Этот зык и свист,

Эти зори без затменья,
Этот вздох ночной селенья,
Эта ночь без сна,
Эта мгла и жар постели,
Эта дробь и эти трели,
Это всё — весна.`,
      },
    ],
  },
  {
    id: "f0000000-0000-4000-8000-000000000107",
    displayName: "ДЕМО · Некрасов — наблюдение и общество",
    poems: [
      {
        id: "demo-nekrasov-yesterday",
        title: "Вчерашний день, часу в шестом",
        sourceUrl: "https://ru.wikisource.org/wiki/Вчерашний_день,_часу_в_шестом_(Некрасов)",
        text: `Вчерашний день, часу в шестом,
Зашёл я на Сенную;
Там били женщину кнутом,
Крестьянку молодую.

Ни звука из её груди,
Лишь бич свистал, играя...
И Музе я сказал: «Гляди!
Сестра твоя родная!»`,
      },
      {
        id: "demo-nekrasov-entrance",
        title: "Размышления у парадного подъезда (фрагмент)",
        sourceUrl: "https://ru.wikisource.org/wiki/Размышления_у_парадного_подъезда_(Некрасов)",
        text: `Вот парадный подъезд. По торжественным дням,
Одержимый холопским недугом,
Целый город с каким-то испугом
Подъезжает к заветным дверям;
Записав своё имя и званье,
Разъезжаются гости домой,
Так глубоко довольны собой,
Что подумаешь — в том их призванье!

А в обычные дни этот пышный подъезд
Осаждают убогие лица:
Прожектёры, искатели мест,
И преклонный старик, и вдовица.
От него и к нему то и знай по утрам
Всё курьеры с бумагами скачут.
Возвращаясь, иной напевает «трам-трам»,
А иные просители плачут.`,
      },
      {
        id: "demo-nekrasov-unreaped-strip",
        title: "Несжатая полоса (фрагмент)",
        sourceUrl: "https://ru.wikisource.org/wiki/Несжатая_полоса_(Некрасов)",
        text: `Поздняя осень. Грачи улетели,
Лес обнажился, поля опустели,
Только одна полоска не сжата...
Грустную думу наводит она.

Кажется, шепчут колосья друг другу:
«Скучно нам слушать осеннюю вьюгу,
Скучно склоняться до самой земли,
Тучные зёрна купая в пыли!»`,
      },
    ],
  },
  {
    id: "f0000000-0000-4000-8000-000000000108",
    displayName: "ДЕМО · Жуковский — созерцание",
    poems: [
      {
        id: "demo-zhukovsky-sea",
        title: "Море",
        sourceUrl: "https://ru.wikisource.org/wiki/Море_(Жуковский)",
        text: `Безмолвное море, лазурное море,
Стою очарован над бездной твоей.
Ты живо; ты дышишь; смятенной любовью,
Тревожною думой наполнено ты.

Безмолвное море, лазурное море,
Открой мне глубокую тайну твою.
Что движет твое необъятное лоно?
Чем дышит твоя напряженная грудь?
Иль тянет тебя из земной неволи
Далекое, светлое небо к себе?

Таинственной, сладостной полное жизни,
Ты чисто в присутствии чистом его:
Ты льёшься его светозарной лазурью,
Вечерним и утренним светом горишь,
Ласкаешь его облака золотые
И радостно блещешь звёздами его.

Когда же сбираются тёмные тучи,
Чтоб ясное небо отнять у тебя —
Ты бьёшься, ты воешь, ты волны подъемлешь,
Ты рвёшь и терзаешь враждебную мглу...
И мгла исчезает, и тучи уходят,
Но, полное прошлой тревоги своей,
Ты долго вздымаешь испуганны волны,
И сладостный блеск возвращённых небес
Не вовсе тебе тишину возвращает;
Обманчив твоей неподвижности вид:
Ты в бездне покойной скрываешь смятенье,
Ты, небом любуясь, дрожишь за него.`,
      },
      {
        id: "demo-zhukovsky-lark",
        title: "Жаворонок",
        sourceUrl: "https://ru.wikisource.org/wiki/Жаворонок_(Жуковский)",
        text: `На солнце темный лес зардел,
В долине пар белеет тонкий,
И песню раннюю запел
В лазури жаворонок звонкий.

Он голосисто с вышины
Поёт на солнышке, сверкая:
«Весна пришла к нам молодая,
Я здесь пою приход весны!»`,
      },
      {
        id: "demo-zhukovsky-svetlana-fragment",
        title: "Светлана (начало, фрагмент)",
        sourceUrl: "https://ru.wikisource.org/wiki/Светлана_(Жуковский)",
        text: `Раз в крещенский вечерок
Девушки гадали:
За ворота башмачок,
Сняв с ноги, бросали;
Снег пололи; под окном
Слушали; кормили
Счётным курицу зерном;
Ярый воск топили;
В чашу с чистою водой
Клали перстень золотой,
Серьги изумрудны;
Расстилали белый плат
И над чашей пели в лад
Песенки подблюдны.`,
      },
    ],
  },
  {
    id: "f0000000-0000-4000-8000-000000000109",
    displayName: "ДЕМО · Баратынский — рефлексия",
    poems: [
      {
        id: "demo-baratynsky-gift",
        title: "Мой дар убог и голос мой не громок",
        sourceUrl: "https://ru.wikisource.org/wiki/Мой_дар_убог_и_голос_мой_не_громок_(Боратынский)",
        text: `Мой дар убог и голос мой не громок,
Но я живу, и на земли мое
Кому-нибудь любезно бытие:
Его найдёт далёкий мой потомок
В моих стихах; как знать, душа моя
Окажется с душой его в сношенье,
И как нашёл я друга в поколенье,
Читателя найду в потомстве я.`,
      },
      {
        id: "demo-baratynsky-spring",
        title: "Весна, весна! как воздух чист! (фрагмент)",
        sourceUrl: "https://ru.wikisource.org/wiki/Весна,_весна!_как_воздух_чист!_(Боратынский)",
        text: `Весна, весна! как воздух чист!
Как ясен небосклон!
Своей лазурию живой
Слепит мне очи он.

Весна, весна! высоко
На крыльях ветерка,
Ласкаясь к солнечным лучам,
Летают облака.

Шумят ручьи! блестят ручьи!
Взревев, река несёт
На торжествующем хребте
Поднятый ею лёд.`,
      },
      {
        id: "demo-baratynsky-not-blinded",
        title: "Не ослеплён я музою моею (фрагмент)",
        sourceUrl: "https://ru.wikisource.org/wiki/Муза_(Боратынский)",
        text: `Не ослеплён я Музою моею:
Красавицей её не назовут
И юноши, узрев её, за нею
Влюблённою толпой не побегут.

Приманивать изысканным убором,
Игрою глаз, блестящим разговором,
Ни склонности у ней, ни дара нет;
Но поражён бывает мельком свет
Её лица необщим выраженьем,
Её речей спокойной простотой;
И он, скорей чем едким осужденьем,
Её почтит небрежной похвалой.`,
      },
    ],
  },
  {
    id: "f0000000-0000-4000-8000-000000000110",
    displayName: "ДЕМО · Есенин — память и природа",
    poems: [
      {
        id: "demo-esenin-no-regrets",
        title: "Не жалею, не зову, не плачу",
        sourceUrl: "https://ru.wikisource.org/wiki/Не_жалею,_не_зову,_не_плачу_(Есенин)",
        text: `Не жалею, не зову, не плачу,
Всё пройдёт, как с белых яблонь дым.
Увяданья золотом охваченный,
Я не буду больше молодым.

Ты теперь не так уж будешь биться,
Сердце, тронутое холодком,
И страна берёзового ситца
Не заманит шляться босиком.

Дух бродяжий, ты всё реже, реже
Расшевеливаешь пламень уст.
О моя утраченная свежесть,
Буйство глаз и половодье чувств.

Я теперь скупее стал в желаньях,
Жизнь моя, иль ты приснилась мне?
Словно я весенней гулкой ранью
Проскакал на розовом коне.

Все мы, все мы в этом мире тленны,
Тихо льётся с клёнов листьев медь...
Будь же ты вовек благословенно,
Что пришло процвесть и умереть.`,
      },
      {
        id: "demo-esenin-birch",
        title: "Берёза",
        sourceUrl: "https://ru.wikisource.org/wiki/Берёза_(Есенин)",
        text: `Белая берёза
Под моим окном
Принакрылась снегом,
Точно серебром.

На пушистых ветках
Снежною каймой
Распустились кисти
Белой бахромой.

И стоит берёза
В сонной тишине,
И горят снежинки
В золотом огне.

А заря, лениво
Обходя кругом,
Обсыпает ветки
Новым серебром.`,
      },
      {
        id: "demo-esenin-maple",
        title: "Клён ты мой опавший",
        sourceUrl: "https://ru.wikisource.org/wiki/Клён_ты_мой_опавший,_клён_заледенелый_(Есенин)",
        text: `Клён ты мой опавший, клён заледенелый,
Что стоишь, нагнувшись, под метелью белой?
Или что увидел? Или что услышал?
Словно за деревню погулять ты вышел.

И, как пьяный сторож, выйдя на дорогу,
Утонул в сугробе, приморозил ногу.
Ах, и сам я нынче что-то стал нестойкий,
Не дойду до дома с дружеской попойки.

Там вон встретил вербу, там сосну приметил,
Распевал им песни под метель о лете.
Сам себе казался я таким же клёном,
Только не опавшим, а вовсю зелёным.`,
      },
    ],
  },
  {
    id: "f0000000-0000-4000-8000-000000000111",
    displayName: "ДЕМО · Блок — город и экзистенциальная рефлексия",
    poems: [
      {
        id: "demo-blok-night-street-lamp",
        title: "Ночь, улица, фонарь, аптека",
        sourceUrl: "https://ru.wikisource.org/wiki/Ночь,_улица,_фонарь,_аптека_(Блок)/1914_(ДО)",
        text: `Ночь, улица, фонарь, аптека,
Бессмысленный и тусклый свет.
Живи ещё хоть четверть века —
Всё будет так. Исхода нет.

Умрёшь — начнёшь опять сначала,
И повторится всё, как встарь:
Ночь, ледяная рябь канала,
Аптека, улица, фонарь.`,
      },
      {
        id: "demo-blok-want-to-live",
        title: "О, я хочу безумно жить",
        sourceUrl: "https://ru.wikisource.org/wiki/О,_я_хочу_безумно_жить_(Блок)",
        text: `О, я хочу безумно жить:
Всё сущее — увековечить,
Безличное — вочеловечить,
Несбывшееся — воплотить!

Пусть душит жизни сон тяжёлый,
Пусть задыхаюсь в этом сне, —
Быть может, юноша весёлый
В грядущем скажет обо мне:

«Простим угрюмство — разве это
Сокрытый двигатель его?
Он весь — дитя добра и света,
Он весь — свободы торжество!»`,
      },
      {
        id: "demo-blok-church-choir",
        title: "Девушка пела в церковном хоре",
        sourceUrl: "https://ru.wikisource.org/wiki/Девушка_пела_в_церковном_хоре_(Блок)",
        text: `Девушка пела в церковном хоре
О всех усталых в чужом краю,
О всех кораблях, ушедших в море,
О всех, забывших радость свою.

Так пел её голос, летящий в купол,
И луч сиял на белом плече,
И каждый из мрака смотрел и слушал,
Как белое платье пело в луче.

И всем казалось, что радость будет,
Что в тихой заводи все корабли,
Что на чужбине усталые люди
Светлую жизнь себе обрели.

И голос был сладок, и луч был тонок,
И только высоко, у Царских Врат,
Причастный Тайнам, — плакал ребёнок
О том, что никто не придёт назад.`,
      },
    ],
  }
];

function asVectorLiteral(values: number[], dimensions: number): string {
  if (values.length !== dimensions || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid vector: expected ${dimensions} finite values.`);
  }
  return `[${values.join(",")}]`;
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm || !Number.isFinite(norm)) throw new Error("Cannot normalize an empty vector.");
  return vector.map((value) => value / norm);
}

async function embedPoems(poems: SeedPoem[]): Promise<number[][]> {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: poems.map((poem) => `${poem.title}\n\n${poem.text}`),
      truncate: false,
      keep_alive: "10m",
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const details = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error: unknown }).error)
      : `HTTP ${response.status}`;
    throw new Error(`Ollama embedding error: ${details}. Confirm Ollama is running and bge-m3 is installed.`);
  }
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { embeddings?: unknown }).embeddings)) {
    throw new Error("Ollama returned an unexpected /api/embed response.");
  }
  const embeddings = (payload as { embeddings: unknown[] }).embeddings;
  if (embeddings.length !== poems.length) throw new Error("Ollama returned the wrong number of embeddings.");
  for (const embedding of embeddings) {
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS || embedding.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      throw new Error(`Ollama must return one ${EMBEDDING_DIMENSIONS}-dimensional vector per poem.`);
    }
  }
  return embeddings as number[][];
}

async function isCurrent(pool: ReturnType<typeof getPool>, seed: SeedProfile): Promise<boolean> {
  const result = await pool.query<{
    styleVersion: string | null;
    reasoningVersion: string | null;
    reasoningReady: boolean;
    embeddingModel: string;
    poemCount: number;
    storedPoems: string;
  }>(
    `SELECT p.style_version AS "styleVersion", p.reasoning_version AS "reasoningVersion",
            (p.reasoning_embedding IS NOT NULL) AS "reasoningReady",
            p.embedding_model AS "embeddingModel", p.poem_count AS "poemCount",
            COUNT(po.id)::text AS "storedPoems"
     FROM public.sv_profiles p
     LEFT JOIN public.sv_poems po ON po.profile_id = p.profile_id
     WHERE p.profile_id = $1::uuid
     GROUP BY p.profile_id`,
    [seed.id],
  );
  const row = result.rows[0];
  if (!row || row.styleVersion !== STYLOMETRY_VERSION || row.reasoningVersion !== REASONING_VERSION ||
      !row.reasoningReady || row.embeddingModel !== EMBEDDING_MODEL || Number(row.poemCount) !== seed.poems.length ||
      Number(row.storedPoems) !== seed.poems.length) {
    return false;
  }

  // Compare content too, so edits to the fixture corpus are detected even when poem count stays the same.
  const stored = await pool.query<{ clientPoemId: string; title: string; body: string }>(
    `SELECT client_poem_id AS "clientPoemId", title, body
     FROM public.sv_poems WHERE profile_id = $1::uuid ORDER BY client_poem_id ASC`,
    [seed.id],
  );
  const expectedPoems = [...seed.poems].sort((a, b) => a.id.localeCompare(b.id));
  return expectedPoems.every((poem, index) => {
    const existing = stored.rows[index];
    return Boolean(existing && existing.clientPoemId === poem.id && existing.title === poem.title && existing.body === poem.text);
  });
}

async function seedProfile(pool: ReturnType<typeof getPool>, seed: SeedProfile): Promise<void> {
  console.log(`Preparing ${seed.displayName} (${seed.poems.length} poems)...`);
  const vectors = await embedPoems(seed.poems);
  const average = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, dimension) =>
    vectors.reduce((total, vector) => total + vector[dimension], 0) / vectors.length,
  );
  const profileVector = normalize(average);
  const russianMorphology = await analyzeRussianMorphology(seed.poems.map((poem) => poem.text));
  const style = calculateStylometry(seed.poems.map((poem) => poem.text), russianMorphology);
  if (style.dimensions !== STYLOMETRY_DIMENSIONS) {
    throw new Error(`Russian style vector dimensions mismatch: ${style.dimensions}`);
  }
  console.log(`  Analyzing observable reasoning patterns with ${process.env.OLLAMA_REASONING_MODEL || "qwen3:4b-instruct"}...`);
  const reasoning = await analyzeReasoningProfile(seed.poems);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO public.sv_profiles (
         profile_id, display_name, is_discoverable, embedding, embedding_model, poem_count,
         author_style_embedding, style_version, style_word_count, style_metrics,
         reasoning_embedding, reasoning_version, reasoning_analysis, updated_at, last_analyzed_at
       ) VALUES (
         $1::uuid, $2::text, TRUE, $3::extensions.vector, $4::text, $5::smallint,
         $6::extensions.vector, $7::text, $8::integer, $9::jsonb,
         $10::extensions.vector, $11::text, $12::jsonb, now(), now()
       ) ON CONFLICT (profile_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
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
         last_analyzed_at = now()`,
      [
        seed.id,
        seed.displayName,
        asVectorLiteral(profileVector, EMBEDDING_DIMENSIONS),
        EMBEDDING_MODEL,
        seed.poems.length,
        asVectorLiteral(style.vector, STYLOMETRY_DIMENSIONS),
        STYLOMETRY_VERSION,
        style.wordCount,
        JSON.stringify(style.metrics),
        asVectorLiteral(reasoning.vector, 12),
        REASONING_VERSION,
        JSON.stringify(reasoning.profile),
      ],
    );

    await client.query("DELETE FROM public.sv_poems WHERE profile_id = $1::uuid", [seed.id]);
    for (let index = 0; index < seed.poems.length; index += 1) {
      const poem = seed.poems[index];
      await client.query(
        `INSERT INTO public.sv_poems (
           profile_id, client_poem_id, title, body, embedding, embedding_model, updated_at
         ) VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::extensions.vector, $6::text, now())`,
        [seed.id, poem.id, poem.title, poem.text, asVectorLiteral(vectors[index], EMBEDDING_DIMENSIONS), EMBEDDING_MODEL],
      );
    }
    await client.query("COMMIT");
    console.log(`  Saved ${seed.poems.length} poems; profile id: ${seed.id}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  if (!CONFIRMED) {
    throw new Error(
      "This command writes public DEMO profiles and poems into DATABASE_URL. " +
      "Review .env.local and re-run with --confirm-demo-data only against a development/test database.",
    );
  }

  const pool = getPool();
  try {
    // Fail early with a clear message if the schema migration has not been applied.
    await pool.query("SELECT NULL::extensions.vector(640), NULL::extensions.vector(12)");
    await pool.query("SELECT reasoning_embedding, reasoning_version, reasoning_analysis FROM public.sv_profiles LIMIT 0");
    const statuses = await Promise.all(DEMO_PROFILES.map(async (profile) => ({ profile, current: !FORCE && await isCurrent(pool, profile) })));
    const todo = statuses.filter((entry) => !entry.current);
    if (!todo.length) {
      console.log(`Demo corpus is already current (${STYLOMETRY_VERSION} + ${REASONING_VERSION}); no seed updates needed.`);
    } else {
      console.log(`\nDemo corpus contains ${DEMO_PROFILES.length} profiles and ${DEMO_PROFILES.reduce((total, profile) => total + profile.poems.length, 0)} poems.`);
      console.log(`Profiles to create/update: ${todo.length}.`);
      for (const entry of todo) await seedProfile(pool, entry.profile);
      console.log("\nDemo profiles are ready. Run a normal poem analysis to see them in match results.");
      console.log("These are public, clearly labelled development fixtures. Do not seed them into production.");
    }

    // Always report pairwise similarities, including when the seed corpus was already current.
    await printDemoSimilarityReport(pool);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Demo seeding failed:", error instanceof Error ? error.message : error);
  console.error("Check DATABASE_URL, migrations 003/004/005, Python/pymorphy3, and Ollama models bge-m3 + qwen3:4b-instruct.");
  process.exitCode = 1;
});
