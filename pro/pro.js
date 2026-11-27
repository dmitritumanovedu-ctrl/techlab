// =====================================================================
//  TechLab Pro · страницы для учителей: лендинг (index.html) и тарифы (pricing.html)
//  Три языка: ru / ro / en. Язык общий со всем сайтом (localStorage "techlab_lang").
//  Цены и почта для заявок — в блоке CONFIG ниже.
// =====================================================================
export const CONFIG = {
  priceMonth: "$5.99", priceYear: "$59",
  aiChecks: 1000,                                   // проверок ИИ в месяц в Pro
  freeWorks: 3,                                     // работ в бесплатном тарифе
  freeClasses: 1,                                   // классов в бесплатном тарифе
  trialDays: 14,                                    // пробный период Pro
  requestEmail: "dmitri.tumanov.edu@gmail.com",     // куда приходят заявки на Pro, пока оплата картой не подключена
  payUrl: "",                                       // ссылка на оплату (Paddle / Lemon Squeezy) — впишите, когда будет готова
};
const KEY = "techlab_lang";
export let LANG = (() => { try { const v = localStorage.getItem(KEY); return ["ru", "ro", "en"].includes(v) ? v : "ru"; } catch (e) { return "ru"; } })();
export const PAGE = document.body.dataset.page;

// ---------- иконки ----------
const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  build: I('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 14v7M14 17.5h7"/>'),
  magic: I('<path d="M15 4V2M15 10V8M11 6h2M17 6h2M4 20l10-10"/><path d="M19 13l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>'),
  copy:  I('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a2 2 0 0 1 2-2h11"/>'),
  check: I('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  lock:  I('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  fam:   I('<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 21v-1a6 6 0 0 1 12 0v1M15 21v-1a4 4 0 0 1 6-3.5"/>'),
  lib:   I('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M8 7h8M8 11h6"/>'),
  globe: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>'),
};

// ---------- тексты ----------
export const T = {
ru: {
  menu: ["Возможности", "Как это работает", "Библиотека", "Тарифы", "Вопросы"], login: "Войти", start: "Начать бесплатно",
  kick: "Для учителей · TechLab Pro",
  h1: 'Тесты, которые <span>проверяют себя сами</span>',
  lead: "Соберите тест в конструкторе или по учебнику с помощью ИИ, раздайте классу разные варианты и получите проверенные работы — даже развёрнутые ответы.",
  see: "Смотреть тарифы", note: "Без карты. Для учеников и родителей — всегда бесплатно.",
  mock: { live: "Идёт сейчас · 11 «Б»", work: "Суммативное · «Население»", left: "осталось 21 мин", w: "пишут", d: "сдали", out: "выходили из окна",
          ai: "проверок ИИ в месяц", saved: "сэкономлено в ноябре", hours: "6,9 ч",
          aiT: "Развёрнутый ответ · задание 8", aiC: "3 нейросети: 5, 5, 4 → 5 из 6. Не хватило причины — урбанизации." },
  fH: "Всё, что нужно для работ в классе", fS: "Одна платформа вместо бумажных вариантов, таблиц с оценками и вечеров с проверкой.",
  feats: [
    ["build", "#EAF0FF", "#2747D6", "Конструктор заданий", "Выбор ответа, соответствие, числа, порядок, схемы, развёрнутые ответы — для любого предмета.", ""],
    ["magic", "#EFE5FF", "#4F2A99", "ИИ составит тест", "Загрузите страницы учебника или напишите тему — получите черновик с ответами и критериями.", ""],
    ["copy", "#FFF1DE", "#7A4300", "Варианты для всего класса", "Каждый ученик получает свой вариант и свой порядок заданий. Списать у соседа не выйдет.", ""],
    ["check", "#DDF4EA", "#1E8A5A", "ИИ проверяет развёрнутые ответы", "2–3 нейросети ставят баллы по вашим критериям и пишут комментарий. Спорное — вам на просмотр.", ""],
    ["lock", "#FFE3E3", "#8C1D1D", "Честный урок", "Таймер, блокировка, учёт выходов из окна. Вы видите в реальном времени, кто пишет и кто сдал.", ""],
    ["fam", "#E6EDF5", "#33435E", "Родители в курсе", "Родитель видит оценки, комментарии и что повторить дома — без звонков и сообщений.", ""],
  ],
  soon: "скоро",
  hH: "Как это работает", hS: "Три шага — и первый класс пишет работу.",
  steps: [["Подключите класс", "Входите через Google, создаёте класс и получаете код. Ученики вводят его один раз."],
          ["Выдайте работу", "Шаблон из библиотеки, свой тест или черновик от ИИ по учебнику — и время урока."],
          ["Получите оценки", "Автопроверка сразу, развёрнутые ответы — через пару минут. Оценки видят и родители."]],
  rH: "Удобно всем троим",
  roles: [["Учитель", "#EAF0FF", "#2747D6", ["Работы из шаблонов и конструктора", "Проверка ИИ и сводная таблица оценок", "Экспорт в CSV и PDF"]],
          ["Ученик", "#FFF1DE", "#7A4300", ["Вход по коду, без почты и паролей", "Свой вариант и таймер", "Разбор ошибок и тренажёры"]],
          ["Родитель", "#DDF4EA", "#145C3E", ["Оценки и комментарии учителя", "Сроки ближайших работ", "Советы, что повторить дома"]]],
  pH: "Простые тарифы", pS: "Начните бесплатно. Pro — когда захочется проверки ИИ и всех шаблонов.", pMore: "Все тарифы и сравнение",
  qH: "Частые вопросы",
  faq: [["Ученикам и родителям нужно платить?", "Нет. Платит только учитель, и только если ему нужен Pro. Ученики и родители пользуются TechLab бесплатно."],
        ["Подойдёт для моего предмета?", "Да. Задания в конструкторе не привязаны к предмету: история, биология, языки, математика, география, информатика — всё собирается из одних и тех же блоков."],
        ["Можно ли доверять оценке ИИ?", "ИИ проверяет по вашим критериям, а каждый ответ смотрят 2–3 разные нейросети. Если их баллы расходятся, работа попадает к вам на просмотр. Последнее слово всегда за учителем."],
        ["На каких языках работает сайт?", "На русском, румынском и английском. Вопросы в работах — на языке вашего урока."],
        ["Что с данными учеников?", "Ученики входят по коду без почты. Результаты видят только их учитель и родители. Без рекламы и без продажи данных."]],
  fnH: "Попробуйте на ближайшем уроке", fnP: "Бесплатный тариф без ограничений по времени. Pro можно включить позже.",
  foot: ["Главная сайта", "Кабинет родителя", "Вход для учителя", "Конфиденциальность"],
  // тарифы
  prH: "Тарифы для учителей", prS: "Ученики и родители пользуются TechLab бесплатно. Платит только учитель — и только за Pro.",
  month: "в месяц", orYear: (y) => `или ${y} в год — 2 месяца в подарок`, popular: "Выбирают чаще",
  plans: [
    { n: "Бесплатный", who: "Чтобы попробовать", price: "$0", per: "навсегда",
      yes: [`${CONFIG.freeClasses} класс, ${CONFIG.freeWorks} работы`, "Конструктор и автопроверка", "Классы, коды, кабинет родителя", "Варианты для каждого ученика"],
      no: ["Проверка развёрнутых ответов ИИ", "Платные шаблоны библиотеки"], btn: "Начать бесплатно" },
    { n: "Учитель Pro", who: "Для работы каждый день", hot: 1,
      yes: ["Работ без ограничений", `Проверка ИИ — ${CONFIG.aiChecks} ответов в месяц`, "Все шаблоны библиотеки", "ИИ составляет тест по учебнику", "Продажа своих шаблонов", "Сводные таблицы, CSV и PDF"],
      no: [], btn: "Подключить Pro" },
    { n: "Школа", who: "Для лицея или кафедры", price: "по запросу", per: "",
      yes: ["Pro для всех учителей школы", "Общая библиотека школы", "Договор и счёт в леях", "Помощь при подключении"],
      no: [], btn: "Написать нам" },
  ],
  freeBand: "<b>Ученикам и родителям — бесплатно всегда.</b> Ни подписок, ни карт, ни рекламы.",
  cmpH: "Сравнение тарифов", cmpCols: ["", "Бесплатный", "Pro", "Школа"],
  cmp: [["Классов", String(CONFIG.freeClasses), "без ограничений", "без ограничений"], ["Работ", String(CONFIG.freeWorks), "без ограничений", "без ограничений"], ["Конструктор, автопроверка, варианты", 1, 1, 1], ["Классы и кабинет родителя", 1, 1, 1],
        ["Проверка развёрнутых ответов ИИ", 0, `${CONFIG.aiChecks} / мес`, `${CONFIG.aiChecks} / мес на учителя`], ["Шаблоны библиотеки", "бесплатные", "все", "все + школьные"],
        ["Продажа своих шаблонов", 0, 1, 1], ["Счёт для бухгалтерии", 0, 0, 1]],
  pq: [["Как оплатить?", "Банковской картой — Visa или Mastercard, в долларах. Первые 14 дней бесплатно, за 3 дня до списания пришлём напоминание. Отменить можно в один клик, Pro останется до конца оплаченного месяца."],
       ["Что будет, если отменить Pro?", "Все ваши работы, классы и оценки сохранятся. Просто включатся ограничения бесплатного тарифа."],
       ["Хватит ли 1000 проверок ИИ?", "Одна проверка — это один развёрнутый ответ одного ученика. Работа с 5 такими заданиями на класс из 27 учеников — 135 проверок. Обычно хватает на 6–7 таких работ в месяц."],
       ["Может ли школа оплатить за учителей?", "Да, тариф «Школа»: договор и счёт в леях. Напишите нам — подготовим предложение."]],
  dH: "Подключить Учитель Pro", dP: "Оплата картой скоро появится прямо на сайте. Пока оставьте почту — пришлём ссылку на оплату и включим Pro.",
  dMail: "Почта, с которой вы входите в TechLab", dPlan: "Тариф", dM: "Помесячно", dY: "На год", dSend: "Отправить заявку", dCancel: "Отмена",
  dSubj: "Заявка на TechLab Pro", dSchool: "TechLab для школы",
},
ro: {
  menu: ["Funcții", "Cum funcționează", "Bibliotecă", "Tarife", "Întrebări"], login: "Intră", start: "Începe gratuit",
  kick: "Pentru profesori · TechLab Pro",
  h1: 'Teste care <span>se verifică singure</span>',
  lead: "Creați un test în constructor sau după manual cu ajutorul IA, dați clasei variante diferite și primiți lucrările verificate — chiar și răspunsurile deschise.",
  see: "Vezi tarifele", note: "Fără card. Pentru elevi și părinți — mereu gratuit.",
  mock: { live: "În desfășurare · a XI-a „B”", work: "Evaluare sumativă · „Populația”", left: "au rămas 21 min", w: "scriu", d: "au predat", out: "au ieșit din fereastră",
          ai: "verificări IA pe lună", saved: "economisit în noiembrie", hours: "6,9 h",
          aiT: "Răspuns deschis · itemul 8", aiC: "3 rețele neuronale: 5, 5, 4 → 5 din 6. A lipsit cauza — urbanizarea." },
  fH: "Tot ce trebuie pentru lucrările la clasă", fS: "O singură platformă în locul variantelor pe hârtie, tabelelor cu note și serilor de corectare.",
  feats: [
    ["build", "#EAF0FF", "#2747D6", "Constructor de itemi", "Alegere multiplă, asociere, numere, ordonare, scheme, răspunsuri deschise — pentru orice disciplină.", ""],
    ["magic", "#EFE5FF", "#4F2A99", "IA creează testul", "Încărcați paginile din manual sau scrieți tema — primiți o ciornă cu răspunsuri și criterii.", ""],
    ["copy", "#FFF1DE", "#7A4300", "Variante pentru toată clasa", "Fiecare elev primește varianta sa și ordinea sa a itemilor. Copiatul de la coleg nu merge.", ""],
    ["check", "#DDF4EA", "#1E8A5A", "IA verifică răspunsurile deschise", "2–3 rețele neuronale acordă puncte după criteriile dvs. și scriu un comentariu. Cazurile discutabile ajung la dvs.", ""],
    ["lock", "#FFE3E3", "#8C1D1D", "Lecție corectă", "Cronometru, blocare, evidența ieșirilor din fereastră. Vedeți în timp real cine scrie și cine a predat.", ""],
    ["fam", "#E6EDF5", "#33435E", "Părinții sunt la curent", "Părintele vede notele, comentariile și ce trebuie repetat acasă — fără apeluri și mesaje.", ""],
  ],
  soon: "în curând",
  hH: "Cum funcționează", hS: "Trei pași — și prima clasă scrie lucrarea.",
  steps: [["Conectați clasa", "Intrați cu Google, creați clasa și primiți un cod. Elevii îl introduc o singură dată."],
          ["Dați lucrarea", "Un șablon din bibliotecă, testul dvs. sau o ciornă de la IA după manual — și ora lecției."],
          ["Primiți notele", "Verificarea automată imediat, răspunsurile deschise — în câteva minute. Notele le văd și părinții."]],
  rH: "Comod pentru toți trei",
  roles: [["Profesor", "#EAF0FF", "#2747D6", ["Lucrări din șabloane și constructor", "Verificare IA și tabel centralizat de note", "Export CSV și PDF"]],
          ["Elev", "#FFF1DE", "#7A4300", ["Intrare cu cod, fără e-mail și parole", "Varianta proprie și cronometru", "Analiza greșelilor și exerciții"]],
          ["Părinte", "#DDF4EA", "#145C3E", ["Notele și comentariile profesorului", "Termenele lucrărilor apropiate", "Sfaturi ce să repete acasă"]]],
  pH: "Tarife simple", pS: "Începeți gratuit. Pro — când veți dori verificare IA și toate șabloanele.", pMore: "Toate tarifele și comparația",
  qH: "Întrebări frecvente",
  faq: [["Elevii și părinții trebuie să plătească?", "Nu. Plătește doar profesorul și doar dacă are nevoie de Pro. Elevii și părinții folosesc TechLab gratuit."],
        ["Se potrivește pentru disciplina mea?", "Da. Itemii din constructor nu țin de o anumită disciplină: istorie, biologie, limbi, matematică, geografie, informatică — totul se construiește din aceleași blocuri."],
        ["Pot avea încredere în nota dată de IA?", "IA verifică după criteriile dvs., iar fiecare răspuns e analizat de 2–3 rețele neuronale diferite. Dacă punctajele diferă, lucrarea ajunge la dvs. Ultimul cuvânt îl are mereu profesorul."],
        ["În ce limbi funcționează site-ul?", "În rusă, română și engleză. Întrebările din lucrări sunt în limba lecției dvs."],
        ["Ce se întâmplă cu datele elevilor?", "Elevii intră cu un cod, fără e-mail. Rezultatele le văd doar profesorul și părinții lor. Fără reclamă și fără vânzarea datelor."]],
  fnH: "Încercați la cea mai apropiată lecție", fnP: "Tariful gratuit nu are limită de timp. Pro se poate activa mai târziu.",
  foot: ["Pagina principală", "Cabinetul părintelui", "Intrare pentru profesor", "Confidențialitate"],
  prH: "Tarife pentru profesori", prS: "Elevii și părinții folosesc TechLab gratuit. Plătește doar profesorul — și doar pentru Pro.",
  month: "pe lună", orYear: (y) => `sau ${y} pe an — 2 luni cadou`, popular: "Cel mai ales",
  plans: [
    { n: "Gratuit", who: "Pentru a încerca", price: "$0", per: "pentru totdeauna",
      yes: [`${CONFIG.freeClasses} clasă, ${CONFIG.freeWorks} lucrări`, "Constructor și verificare automată", "Clase, coduri, cabinetul părintelui", "Variante pentru fiecare elev"],
      no: ["Verificarea IA a răspunsurilor deschise", "Șabloane plătite din bibliotecă"], btn: "Începe gratuit" },
    { n: "Profesor Pro", who: "Pentru lucrul zilnic", hot: 1,
      yes: ["Lucrări nelimitate", `Verificare IA — ${CONFIG.aiChecks} răspunsuri pe lună`, "Toate șabloanele din bibliotecă", "IA creează testul după manual", "Vânzarea șabloanelor proprii", "Tabele centralizate, CSV și PDF"],
      no: [], btn: "Activează Pro" },
    { n: "Școală", who: "Pentru liceu sau catedră", price: "la cerere", per: "",
      yes: ["Pro pentru toți profesorii școlii", "Biblioteca comună a școlii", "Contract și factură în lei", "Ajutor la conectare"],
      no: [], btn: "Scrieți-ne" },
  ],
  freeBand: "<b>Pentru elevi și părinți — mereu gratuit.</b> Fără abonamente, carduri sau reclamă.",
  cmpH: "Compararea tarifelor", cmpCols: ["", "Gratuit", "Pro", "Școală"],
  cmp: [["Clase", String(CONFIG.freeClasses), "nelimitat", "nelimitat"], ["Lucrări", String(CONFIG.freeWorks), "nelimitat", "nelimitat"], ["Constructor, verificare automată, variante", 1, 1, 1], ["Clase și cabinetul părintelui", 1, 1, 1],
        ["Verificarea IA a răspunsurilor deschise", 0, `${CONFIG.aiChecks} / lună`, `${CONFIG.aiChecks} / lună per profesor`], ["Șabloane din bibliotecă", "gratuite", "toate", "toate + ale școlii"],
        ["Vânzarea șabloanelor proprii", 0, 1, 1], ["Factură pentru contabilitate", 0, 0, 1]],
  pq: [["Cum se plătește?", "Cu cardul bancar — Visa sau Mastercard, în dolari. Primele 14 zile sunt gratuite, cu 3 zile înainte de plată trimitem un memento. Anularea — dintr-un clic, Pro rămâne până la sfârșitul lunii plătite."],
       ["Ce se întâmplă dacă anulez Pro?", "Toate lucrările, clasele și notele se păstrează. Pur și simplu se aplică limitele tarifului gratuit."],
       ["Ajung 1000 de verificări IA?", "O verificare înseamnă un răspuns deschis al unui elev. O lucrare cu 5 astfel de itemi pentru o clasă de 27 de elevi înseamnă 135 de verificări. De obicei ajunge pentru 6–7 asemenea lucrări pe lună."],
       ["Poate școala să plătească pentru profesori?", "Da, tariful „Școală”: contract și factură în lei. Scrieți-ne — pregătim o ofertă."]],
  dH: "Activează Profesor Pro", dP: "Plata cu cardul va apărea în curând direct pe site. Deocamdată lăsați e-mailul — vă trimitem linkul de plată și activăm Pro.",
  dMail: "E-mailul cu care intrați în TechLab", dPlan: "Tarif", dM: "Lunar", dY: "Anual", dSend: "Trimite cererea", dCancel: "Anulează",
  dSubj: "Cerere TechLab Pro", dSchool: "TechLab pentru școală",
},
en: {
  menu: ["Features", "How it works", "Library", "Pricing", "FAQ"], login: "Sign in", start: "Start for free",
  kick: "For teachers · TechLab Pro",
  h1: 'Tests that <span>mark themselves</span>',
  lead: "Build a test in the editor or from your textbook with AI, give every student a different version and get the work back graded — even open-ended answers.",
  see: "See pricing", note: "No card needed. Always free for students and parents.",
  mock: { live: "Live now · 11B", work: "Summative · “Population”", left: "21 min left", w: "writing", d: "submitted", out: "left the window",
          ai: "AI checks per month", saved: "saved in November", hours: "6.9 h",
          aiT: "Open answer · task 8", aiC: "3 AI models: 5, 5, 4 → 5 of 6. Missing the cause — urbanisation." },
  fH: "Everything you need for classroom tests", fS: "One platform instead of paper versions, grade spreadsheets and evenings spent marking.",
  feats: [
    ["build", "#EAF0FF", "#2747D6", "Task editor", "Multiple choice, matching, numbers, ordering, diagrams, open answers — for any subject.", ""],
    ["magic", "#EFE5FF", "#4F2A99", "AI drafts the test", "Upload textbook pages or type a topic — get a draft with answer keys and criteria.", ""],
    ["copy", "#FFF1DE", "#7A4300", "Versions for the whole class", "Every student gets their own version and task order. Copying from a neighbour won't work.", ""],
    ["check", "#DDF4EA", "#1E8A5A", "AI marks open answers", "2–3 AI models score against your criteria and leave a comment. Disputed cases go to you.", ""],
    ["lock", "#FFE3E3", "#8C1D1D", "Fair lessons", "Timer, lock screen, window-exit tracking. See live who is writing and who has submitted.", ""],
    ["fam", "#E6EDF5", "#33435E", "Parents stay informed", "Parents see grades, comments and what to revise at home — no calls or messages needed.", ""],
  ],
  soon: "soon",
  hH: "How it works", hS: "Three steps and your first class is writing.",
  steps: [["Connect a class", "Sign in with Google, create a class and get a code. Students enter it once."],
          ["Assign work", "A library template, your own test or an AI draft from your textbook — plus the lesson time."],
          ["Get the grades", "Auto-marking at once, open answers in a couple of minutes. Parents see the grades too."]],
  rH: "Easy for all three",
  roles: [["Teacher", "#EAF0FF", "#2747D6", ["Tests from templates and the editor", "AI marking and a grade summary", "CSV and PDF export"]],
          ["Student", "#FFF1DE", "#7A4300", ["Sign in with a code — no email or password", "Own version and timer", "Mistake review and practice"]],
          ["Parent", "#DDF4EA", "#145C3E", ["Grades and teacher comments", "Upcoming deadlines", "Tips on what to revise at home"]]],
  pH: "Simple pricing", pS: "Start for free. Go Pro when you want AI marking and every template.", pMore: "All plans and comparison",
  qH: "Frequently asked questions",
  faq: [["Do students and parents pay?", "No. Only the teacher pays, and only for Pro. Students and parents use TechLab for free."],
        ["Will it work for my subject?", "Yes. Editor tasks aren't tied to a subject: history, biology, languages, maths, geography, computing — all built from the same blocks."],
        ["Can I trust the AI's marks?", "AI marks against your criteria, and every answer is checked by 2–3 different models. If their scores differ, the work goes to you. The teacher always has the final say."],
        ["Which languages does the site support?", "Russian, Romanian and English. Questions in tests stay in the language of your lesson."],
        ["What about student data?", "Students sign in with a code, no email. Only their teacher and parents see the results. No ads, no selling data."]],
  fnH: "Try it in your next lesson", fnP: "The free plan has no time limit. You can switch on Pro later.",
  foot: ["Site home", "Parent area", "Teacher sign-in", "Privacy"],
  prH: "Pricing for teachers", prS: "Students and parents use TechLab for free. Only the teacher pays — and only for Pro.",
  month: "per month", orYear: (y) => `or ${y} per year — 2 months free`, popular: "Most popular",
  plans: [
    { n: "Free", who: "To try it out", price: "$0", per: "forever",
      yes: [`${CONFIG.freeClasses} class, ${CONFIG.freeWorks} tests`, "Editor and auto-marking", "Classes, codes, parent area", "A version for every student"],
      no: ["AI marking of open answers", "Paid library templates"], btn: "Start for free" },
    { n: "Teacher Pro", who: "For everyday teaching", hot: 1,
      yes: ["Unlimited tests", `AI marking — ${CONFIG.aiChecks} answers a month`, "Every library template", "AI drafts tests from your textbook", "Sell your own templates", "Grade summaries, CSV and PDF"],
      no: [], btn: "Get Pro" },
    { n: "School", who: "For a school or department", price: "on request", per: "",
      yes: ["Pro for every teacher in the school", "Shared school library", "Contract and invoice in lei", "Onboarding help"],
      no: [], btn: "Contact us" },
  ],
  freeBand: "<b>Always free for students and parents.</b> No subscriptions, cards or ads.",
  cmpH: "Compare plans", cmpCols: ["", "Free", "Pro", "School"],
  cmp: [["Classes", String(CONFIG.freeClasses), "unlimited", "unlimited"], ["Tests", String(CONFIG.freeWorks), "unlimited", "unlimited"], ["Editor, auto-marking, versions", 1, 1, 1], ["Classes and parent area", 1, 1, 1],
        ["AI marking of open answers", 0, `${CONFIG.aiChecks} / mo`, `${CONFIG.aiChecks} / mo per teacher`], ["Library templates", "free ones", "all", "all + school's own"],
        ["Sell your templates", 0, 1, 1], ["Invoice for accounting", 0, 0, 1]],
  pq: [["How do I pay?", "By bank card — Visa or Mastercard, in US dollars. The first 14 days are free and we remind you 3 days before the first charge. Cancel in one click; Pro stays on until the end of the paid month."],
       ["What happens if I cancel Pro?", "All your tests, classes and grades are kept. The free plan's limits simply apply again."],
       ["Are 1000 AI checks enough?", "One check is one open answer from one student. A test with 5 such tasks for a class of 27 is 135 checks — usually enough for 6–7 such tests a month."],
       ["Can a school pay for its teachers?", "Yes — the School plan: contract and invoice in lei. Write to us and we'll prepare an offer."]],
  dH: "Get Teacher Pro", dP: "Card payment is coming to the site soon. For now, leave your email — we'll send a payment link and switch Pro on.",
  dMail: "The email you use to sign in to TechLab", dPlan: "Plan", dM: "Monthly", dY: "Yearly", dSend: "Send request", dCancel: "Cancel",
  dSubj: "TechLab Pro request", dSchool: "TechLab for schools",
},
};

// ---------- общие куски ----------
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const TEACHER = "../teacher/";
export const START = "checkout.html";
export function header(t) {
  const links = [["./#features", "home"], ["./#how", "home"], ["library.html", "library"], ["pricing.html", "pricing"], [PAGE === "pricing" ? "#faq" : "./#faq", "home"]];
  return `<header class="top"><div class="in">
    <a class="logo" href="./"><i>T</i>TechLab <small>PRO</small></a>
    <nav class="menu" aria-label="${esc(t.menu.join(", "))}">${t.menu.map((m, i) => `<a href="${links[i][0]}"${PAGE === links[i][1] && PAGE !== "home" ? ' class="on"' : ""}>${esc(m)}</a>`).join("")}</nav>
    <div class="langs" role="group" aria-label="Language">${[["ru", "RU"], ["ro", "RO"], ["en", "EN"]].map(([id, ab]) => `<button type="button" data-lang="${id}" lang="${id}" aria-pressed="${id === LANG}">${ab}</button>`).join("")}</div>
    <a class="btn g" href="${TEACHER}">${esc(t.login)}</a>
    <a class="btn p" href="${START}">${esc(t.start)}</a>
  </div></header>`;
}
export function footer(t) {
  const links = [["../", t.foot[0]], ["../parent/", t.foot[1]], [TEACHER, t.foot[2]], ["../privacy.html", t.foot[3]]];
  return `<footer><div class="in"><b style="color:#13213B">TechLab</b><nav>${links.map(([h, n]) => `<a href="${h}">${esc(n)}</a>`).join("")}</nav><span>© ${new Date().getFullYear()} TechLab · Chișinău</span></div></footer>`;
}
export const faqHtml = (list) => `<div class="faq">${list.map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>`;
function plansHtml(t) {
  return `<div class="plans">${t.plans.map((p, i) => {
    const price = p.hot ? `<div class="price">${CONFIG.priceMonth} <small>${esc(t.month)}</small></div><div class="yr">${esc(t.orYear(CONFIG.priceYear))}</div>`
                        : `<div class="price">${esc(p.price)}${p.per ? ` <small>${esc(p.per)}</small>` : ""}</div>`;
    const act = i === 0 ? `<a class="btn g" href="${START}?plan=free">${esc(p.btn)}</a>` : i === 1 ? `<a class="btn p" href="${START}?plan=month">${esc(p.btn)}</a>` : `<button type="button" class="btn g" data-buy="school">${esc(p.btn)}</button>`;
    return `<article class="plan${p.hot ? " hot" : ""}">${p.hot ? `<span class="badge">${esc(t.popular)}</span>` : ""}<h3>${esc(p.n)}</h3><div class="who">${esc(p.who)}</div>${price}
      <ul>${p.yes.map((x) => `<li>${esc(x)}</li>`).join("")}${p.no.map((x) => `<li class="no">${esc(x)}</li>`).join("")}</ul>${act}</article>`;
  }).join("")}</div><div class="free-band">${t.freeBand}</div>`;
}
function dialogHtml(t) {
  return `<dialog id="buy"><form class="dlg" method="dialog" id="buyForm">
    <h3 id="buyH">${esc(t.dH)}</h3><p>${esc(t.dP)}</p>
    <label>${esc(t.dMail)}<input type="email" name="mail" required autocomplete="email" placeholder="name@gmail.com"></label>
    <label id="planRow">${esc(t.dPlan)}<select name="plan"><option value="month">${esc(t.dM)} · ${CONFIG.priceMonth}</option><option value="year">${esc(t.dY)} · ${CONFIG.priceYear}</option></select></label>
    <div class="row"><button type="button" class="btn g" data-close>${esc(t.dCancel)}</button><button type="submit" class="btn p">${esc(t.dSend)}</button></div>
  </form></dialog>`;
}

// ---------- лендинг ----------
function home(t) {
  const m = t.mock;
  return `${header(t)}<main>
  <section class="hero"><div class="in">
    <div><div class="kick">${esc(t.kick)}</div><h1>${t.h1}</h1><p class="lead">${esc(t.lead)}</p>
      <div class="cta"><a class="btn p big" href="${START}">${esc(t.start)}</a><a class="btn g big" href="pricing.html">${esc(t.see)}</a></div>
      <div class="note">${esc(t.note)}</div></div>
    <div class="mock" aria-hidden="true">
      <div class="mock-live"><span class="chip" style="background:#F29A3A;color:#2B1600">● ${esc(m.live)}</span><b style="margin-top:8px">${esc(m.work)}</b><small>${esc(m.left)}</small>
        <div class="mock-nums"><span><b>18</b> ${esc(m.w)}</span><span><b>7</b> ${esc(m.d)}</span><span><b style="color:#8C1D1D">2</b> ${esc(m.out)}</span></div></div>
      <div class="mock-row"><div class="mock-card"><div class="v" style="color:#2747D6">412 / ${CONFIG.aiChecks}</div><div class="l">${esc(m.ai)}</div><div class="bar"><i style="width:41%"></i></div></div>
        <div class="mock-card"><div class="v" style="color:#1E8A5A">${esc(m.hours)}</div><div class="l">${esc(m.saved)}</div><div class="bar"><i style="width:69%;background:#1E8A5A"></i></div></div></div>
      <div class="ai"><span class="g">5</span><div><b>${esc(m.aiT)}</b><small>${esc(m.aiC)}</small></div></div>
    </div>
  </div></section>

  <section class="s white" id="features"><div class="in"><h2>${esc(t.fH)}</h2><p class="sub">${esc(t.fS)}</p>
    <div class="grid3">${t.feats.map(([ic, bg, fg, h, p, soon]) => `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><span class="ico" style="background:${bg};color:${fg}">${IC[ic]}</span>${soon ? `<span class="chip" style="background:#EFE5FF;color:#4F2A99">${esc(soon)}</span>` : ""}</div><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div></div></section>

  <section class="s" id="how"><div class="in"><h2>${esc(t.hH)}</h2><p class="sub">${esc(t.hS)}</p>
    <div class="grid3">${t.steps.map(([h, p], i) => `<div class="card"><span class="num">${i + 1}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div></div></section>

  <section class="s white"><div class="in"><h2>${esc(t.rH)}</h2><div class="grid3 roles" style="margin-top:22px">${t.roles.map(([n, bg, fg, li]) => `<div class="card"><span class="chip tag" style="background:${bg};color:${fg};font-size:14px;padding:5px 12px">${esc(n)}</span><ul>${li.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</div></div></section>

  <section class="s" id="pricing"><div class="in"><h2>${esc(t.pH)}</h2><p class="sub">${esc(t.pS)} <a href="pricing.html">${esc(t.pMore)} →</a></p>${plansHtml(t)}</div></section>

  <section class="s white" id="faq"><div class="in"><h2>${esc(t.qH)}</h2><div style="margin-top:22px">${faqHtml(t.faq)}</div></div></section>

  <section class="s"><div class="in"><div class="final"><div><h2>${esc(t.fnH)}</h2><p>${esc(t.fnP)}</p></div><a class="btn w big" href="${START}">${esc(t.start)}</a></div></div></section>
  </main>${footer(t)}${dialogHtml(t)}`;
}

// ---------- тарифы ----------
function pricing(t) {
  const cell = (v) => v === 1 ? '<span class="y" aria-label="✓">✓</span>' : v === 0 ? '<span class="n" aria-label="—">—</span>' : esc(v);
  return `${header(t)}<main id="top">
  <section class="s" style="padding-top:52px"><div class="in"><h1 style="font-size:44px">${esc(t.prH)}</h1><p class="sub">${esc(t.prS)}</p>${plansHtml(t)}</div></section>
  <section class="s white"><div class="in"><h2>${esc(t.cmpH)}</h2><div style="overflow-x:auto;margin-top:20px"><table class="cmp">
    <thead><tr>${t.cmpCols.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${t.cmp.map((r) => `<tr><th scope="row" style="font-weight:600">${esc(r[0])}</th>${r.slice(1).map((v) => `<td>${cell(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div></section>
  <section class="s" id="faq"><div class="in"><h2>${esc(t.qH)}</h2><div style="margin-top:22px">${faqHtml(t.pq)}</div></div></section>
  <section class="s" style="padding-top:0"><div class="in"><div class="final"><div><h2>${esc(t.fnH)}</h2><p>${esc(t.fnP)}</p></div><a class="btn w big" href="${START}">${esc(t.start)}</a></div></div></section>
  </main>${footer(t)}${dialogHtml(t)}`;
}

// ---------- запуск ----------
// Другие страницы (library, checkout) передают свою функцию отрисовки в boot()
let RENDER = null;
export function setLang(l) { LANG = l; try { localStorage.setItem(KEY, l); } catch (err) {} }
export function boot(fn) { RENDER = fn; draw(); }
function draw() {
  document.documentElement.lang = LANG;
  if (RENDER) return RENDER();
  const t = T[LANG];
  document.title = PAGE === "pricing" ? `${t.prH} · TechLab` : `TechLab Pro — ${t.h1.replace(/<[^>]+>/g, "")}`;
  document.getElementById("app").innerHTML = PAGE === "pricing" ? pricing(t) : home(t);
}
document.addEventListener("click", (e) => {
  const l = e.target.closest("[data-lang]");
  if (l) { setLang(l.dataset.lang); if (RENDER && RENDER.reload) location.reload(); else draw(); return; }
  const b = e.target.closest("[data-buy]");
  if (b) {
    const t = T[LANG], d = document.getElementById("buy");
    d.dataset.kind = b.dataset.buy;
    document.getElementById("buyH").textContent = b.dataset.buy === "school" ? t.dSchool : t.dH;
    document.getElementById("planRow").hidden = b.dataset.buy === "school";
    d.showModal(); return;
  }
  if (e.target.closest("[data-close]")) document.getElementById("buy").close();
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "buyForm") return;
  const t = T[LANG], f = e.target, kind = document.getElementById("buy").dataset.kind;
  const subj = kind === "school" ? t.dSchool : `${t.dSubj} · ${f.plan.value === "year" ? t.dY : t.dM}`;
  const body = `${t.dMail}: ${f.mail.value}\n${kind === "school" ? "" : `${t.dPlan}: ${f.plan.value === "year" ? `${t.dY} ${CONFIG.priceYear}` : `${t.dM} ${CONFIG.priceMonth}`}\n`}Lang: ${LANG}`;
  location.href = `mailto:${CONFIG.requestEmail}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
});
if (PAGE === "home" || PAGE === "pricing") draw();
