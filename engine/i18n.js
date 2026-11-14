// =====================================================================
//  TechLab · языки интерфейса: русский (ru), румынский (ro), английский (en)
//  Выбор хранится на устройстве (localStorage "techlab_lang"). По умолчанию — русский.
//  Как добавить фразу: впишите ключ во все три словаря ниже и вызывайте t("ключ").
//  Содержание уроков и тестов (вопросы, названия работ) остаётся на языке урока.
// =====================================================================
const KEY = "techlab_lang";
export const LANGS = [["ru", "RU", "Русский"], ["ro", "RO", "Română"], ["en", "EN", "English"]];

export function getLang() {
  try { const v = localStorage.getItem(KEY); if (v === "ru" || v === "ro" || v === "en") return v; } catch (e) {}
  return "ru";
}
export function setLang(l) { try { localStorage.setItem(KEY, l); } catch (e) {} }
export const LANG = getLang();
export const LOCALE = { ru: "ru-RU", ro: "ro-RO", en: "en-GB" }[LANG];
try { document.documentElement.lang = LANG; } catch (e) {}

// ---------------------------------------------------------------------
const D = {
// ============================== РУССКИЙ ==============================
ru: {
  nav_home: "Главная", grade_word: "класс",
  subs: "Информатика · География · Технологическое воспитание",
  lead: "Выбери предмет и класс. Тест или миссию открывает учитель — она появится в блоке «Сейчас на уроке».",
  install_btn: "📲 Установить приложение",
  f_parent: "кабинет родителя", f_demo: "демо-режим", f_privacy: "конфиденциальность", f_teacher: "вход для учителя", f_start: "стартовая страница",
  lite_on: "⚡ лёгкий режим (для слабых компьютеров)", lite_off: "✨ обычный режим",
  // стартовая
  retake: "Пересдача", now: "Сейчас на уроке", start_mission: "Начать миссию →", start: "Начать →",
  now_empty: "Учитель ещё не открыл задание. Выбери предмет ниже или подожди.",
  tab_home: "ГЛАВНАЯ", tab_all: "Все предметы", tab_subj: "ПРЕДМЕТ",
  pl_exp: ["экспедиция", "экспедиции", "экспедиций"], pl_task: ["задание", "задания", "заданий"], pl_mat: ["материал", "материала", "материалов"],
  soon_tasks: "скоро появятся задания", choose_subject: "Выбери предмет", choose_grade: "выбери класс",
  week_plan: "📅 План недели", days: ["Пн", "Вт", "Ср", "Чт", "Пт"],
  f_all: "Все", f_retakes: "🔁 Пересдачи", f_materials: "📎 Материалы", exps_h: "🚀 Экспедиции и квесты", mission: "МИССИЯ",
  b_open_f: "открыта", b_closed_f: "закрыта", b_soon: "🔒 скоро", b_open_m: "открыт", b_closed_m: "закрыт",
  no_tasks: "Заданий пока нет.", no_kind: "Работ этого типа пока нет.", materials_h: "📎 Материалы к урокам", no_materials: "Материалов пока нет.",
  // портал и игровой центр
  sign_in: "Войти", loading_progress: "Загружаю твой прогресс…",
  p_tag: "ЦИФРОВОЙ КАБИНЕТ УРОКА", p_h1: "Задания, оценки и прогресс — в одном месте",
  p_text: "Выполняй тесты, квесты и практические работы на уроке, получай опыт и награды. Родители видят оценки и советы, что повторить.",
  p_demo: "▶ Попробовать демо без входа",
  r_student: "Я ученик", r_student_s: "Вход по личному коду",
  r_parent: "Я родитель", r_parent_s: "Оценки и прогресс ребёнка по коду родителя",
  r_teacher: "Я учитель", r_teacher_s: "Центр управления · вход через Google",
  login_h: "Вход ученика", login_p: "Введи личный код с карточки, которую выдал учитель.", code_label: "Личный код", cancel: "Отмена",
  login_small: "Не помнишь код — спроси учителя. На чужом компьютере не забудь выйти.",
  err_parent_code: "Это код родителя. Родителям — кнопка «Я родитель».", err_s: "Проверь код: он начинается с буквы S.",
  checking: "Проверяю…", err_nocode: "Такого кода нет. Проверь буквы и цифры.", err_net: "Нет связи с сервером. Попробуй ещё раз.",
  hello: "Привет, {n}!", level: "Уровень {n} · {name}", xp_next: "Ещё {x} XP до уровня «{next}» · всего {total} XP",
  pl_honest: ["работа подряд без нарушений", "работы подряд без нарушений", "работ подряд без нарушений"],
  avg_grade: "средняя оценка", pl_awards_of: ["награда из {n}", "награды из {n}", "наград из {n}"],
  not_me: "Это не я — выйти", my_works: "Мои работы", waiting_check: "ждёт проверки",
  no_works_student: "Пока нет проверенных работ. Выполни задание на уроке — оно появится здесь после проверки учителем.",
  tip_last: "Совет из последнего разбора:", battle: "Битва классов", yours: "твой",
  board_empty: "Рейтинг появится после первых проверенных работ.",
  board_note: "Очки класса — средний XP на одного ученика: честно для больших и маленьких классов.",
  awards: "Награды", awards_hint: "Наведи на награду, чтобы узнать, как её получить.",
  // кабинет родителя
  parent_title: "Кабинет родителя · TechLab", p_badge: "КАБИНЕТ РОДИТЕЛЯ", loading: "Загрузка…",
  pl_h1: "Успехи вашего ребёнка",
  pl_p: "Введите код родителя с карточки, которую выдал учитель. Вы увидите оценки, выполненные работы и советы, что повторить.",
  pcode_label: "Код родителя", pl_small: "Код начинается с буквы P. Детей несколько — после входа можно добавить второй код.",
  pe_student: "Это код ученика. Нужен код родителя — он начинается с P.", pe_p: "Проверьте код: он начинается с буквы P.",
  pe_none: "Такого кода нет. Проверьте буквы и цифры.", pe_net: "Нет связи с сервером. Попробуйте ещё раз.",
  pe_expired: "Код больше не действует — попросите у учителя новый.", pe_nostudent: "Ученик не найден — попросите у учителя новый код.",
  p_nonet_h: "Нет связи с сервером", p_nonet_p: "Обновите страницу чуть позже.",
  child: "Ребёнок:", add_child: "+ добавить ещё ребёнка", sign_out: "Выйти", confirm_out: "Выйти и забыть коды на этом устройстве?",
  p_success: "Успехи: {n}", ps_avg: "Средняя оценка", by: "по", pl_checked: ["проверенной работе", "проверенным работам", "проверенным работам"],
  ps_qualnote: " · техн. воспитание оценивается квалификативами (ОХ, Х, У, Н)",
  ps_done: "Выполнено работ", ps_pending: "{n} ждёт проверки учителем", ps_allchecked: "все проверены",
  ps_level: "Уровень на платформе", ps_level_s: "{name} · {xp} XP · наград: {a}",
  ps_viol: "Нарушения в тестах", ps_viol_y: "уход со вкладки, попытки копирования", ps_viol_n: "честная работа",
  works_h: "Работы", retake_l: "пересдача", pts: "б.", checking_w: "проверяется",
  p_noworks: "Пока нет работ. Они появятся здесь после того, как учитель проверит первую работу.",
  ai_h: "Разбор последней работы", ai_good: "Получается хорошо:", ai_gaps: "Есть пробелы:", ai_adv: "Что повторить дома:",
  by_subj: "По предметам", no_checked: "Нет проверенных работ.", how_h: "Как читать оценки",
  how_p: "Оценки по 10-балльной шкале; технологическое воспитание — квалификативами: ОХ — очень хорошо, Х — хорошо, У — удовлетворительно, Н — неудовлетворительно. Развёрнутые ответы проверяются с помощью ИИ, окончательную оценку утверждает учитель. «…» — работа сдана и ждёт проверки.",
  upd: " Данные обновлены {d}.",
  // установка приложения
  inst_h: "📲 Установить TechLab", inst_ios: "На iPhone и iPad:", inst_and: "На телефоне Android:", inst_pc: "На компьютере:",
  inst_note: "Приложение бесплатное, весит меньше 1 МБ и обновляется само. Для тестов нужен интернет.", ok: "Понятно",
  inst_done: "✓ TechLab установлен — ищи значок на рабочем столе",
  inst_steps_ios: [["Открой сайт в <b>Safari</b>", "в Chrome на iPhone установка не работает"], ["Нажми кнопку <b>«Поделиться»</b>", "квадрат со стрелкой вверх внизу экрана"], ["Выбери <b>«На экран „Домой“»</b>", "прокрути список вниз"], ["Нажми <b>«Добавить»</b>", "значок TechLab появится на экране"]],
  inst_steps_and: [["Открой сайт в <b>Chrome</b>", ""], ["Нажми меню <b>⋮</b>", "три точки справа вверху"], ["Выбери <b>«Установить приложение»</b>", "или «Добавить на главный экран»"], ["Подтверди <b>«Установить»</b>", "значок TechLab появится среди приложений"]],
  inst_steps_pc: [["Открой сайт в <b>Chrome</b> или <b>Edge</b>", "в Firefox установка недоступна"], ["Найди значок <b>«Установить»</b>", "справа в адресной строке (монитор со стрелкой) или меню ⋮ → «Установить TechLab»"], ["Нажми <b>«Установить»</b>", "TechLab откроется отдельным окном"], ["Готово!", "ярлык появится на рабочем столе и в меню «Пуск»"]],
  // согласие
  c_h: "Перед началом",
  c_p: "TechLab сохраняет <b>твои фамилию, имя, класс и ответы</b>, чтобы учитель проверил работу и поставил оценку. Их видит только учитель (и ты или родители — по личному коду). Без рекламы и без продажи данных.",
  c_l: "Политика конфиденциальности", c_ok: "Понятно, я согласен(на)",
  // нет интернета
  off_title: "Нет интернета · TechLab", off_h: "Нет подключения к интернету",
  off_p: "Тесты и миссии TechLab работают только онлайн — ответы сразу сохраняются у учителя. Проверь Wi-Fi или мобильный интернет и попробуй снова.",
  off_btn: "↻ Попробовать снова",
  lang_aria: "Язык интерфейса",
},

// ============================== ROMÂNĂ ===============================
ro: {
  nav_home: "Acasă", grade_word: "clasa",
  subs: "Informatică · Geografie · Educație tehnologică",
  lead: "Alege disciplina și clasa. Testul sau misiunea o deschide profesorul — va apărea în blocul „Acum la lecție”.",
  install_btn: "📲 Instalează aplicația",
  f_parent: "cabinetul părintelui", f_demo: "modul demo", f_privacy: "confidențialitate", f_teacher: "intrare profesor", f_start: "pagina principală",
  lite_on: "⚡ mod ușor (pentru calculatoare slabe)", lite_off: "✨ mod obișnuit",
  retake: "Reluare", now: "Acum la lecție", start_mission: "Începe misiunea →", start: "Începe →",
  now_empty: "Profesorul încă nu a deschis sarcina. Alege o disciplină mai jos sau așteaptă.",
  tab_home: "ACASĂ", tab_all: "Toate disciplinele", tab_subj: "DISCIPLINA",
  pl_exp: ["expediție", "expediții"], pl_task: ["sarcină", "sarcini"], pl_mat: ["material", "materiale"],
  soon_tasks: "sarcinile vor apărea în curând", choose_subject: "Alege disciplina", choose_grade: "alege clasa",
  week_plan: "📅 Planul săptămânii", days: ["Lu", "Ma", "Mi", "Jo", "Vi"],
  f_all: "Toate", f_retakes: "🔁 Reluări", f_materials: "📎 Materiale", exps_h: "🚀 Expediții și quest-uri", mission: "MISIUNEA",
  b_open_f: "deschisă", b_closed_f: "închisă", b_soon: "🔒 în curând", b_open_m: "deschis", b_closed_m: "închis",
  no_tasks: "Deocamdată nu sunt sarcini.", no_kind: "Deocamdată nu sunt lucrări de acest tip.", materials_h: "📎 Materiale pentru lecții", no_materials: "Deocamdată nu sunt materiale.",
  sign_in: "Intră", loading_progress: "Îți încarc progresul…",
  p_tag: "CABINETUL DIGITAL AL LECȚIEI", p_h1: "Sarcini, note și progres — într-un singur loc",
  p_text: "Rezolvă teste, quest-uri și lucrări practice la lecție, primește experiență și premii. Părinții văd notele și sfaturi despre ce trebuie repetat.",
  p_demo: "▶ Încearcă demo fără autentificare",
  r_student: "Sunt elev", r_student_s: "Intrare cu codul personal",
  r_parent: "Sunt părinte", r_parent_s: "Notele și progresul copilului cu codul părintelui",
  r_teacher: "Sunt profesor", r_teacher_s: "Centrul de control · intrare prin Google",
  login_h: "Intrarea elevului", login_p: "Introdu codul personal de pe cartonașul primit de la profesor.", code_label: "Codul personal", cancel: "Anulează",
  login_small: "Nu-ți amintești codul? Întreabă profesorul. Pe un calculator străin nu uita să ieși.",
  err_parent_code: "Acesta este codul părintelui. Părinții folosesc butonul „Sunt părinte”.", err_s: "Verifică codul: începe cu litera S.",
  checking: "Verific…", err_nocode: "Acest cod nu există. Verifică literele și cifrele.", err_net: "Nu există conexiune cu serverul. Încearcă din nou.",
  hello: "Salut, {n}!", level: "Nivelul {n} · {name}", xp_next: "Încă {x} XP până la nivelul „{next}” · în total {total} XP",
  pl_honest: ["lucrare la rând fără încălcări", "lucrări la rând fără încălcări"],
  avg_grade: "nota medie", pl_awards_of: ["premiu din {n}", "premii din {n}"],
  not_me: "Nu sunt eu — ieși", my_works: "Lucrările mele", waiting_check: "așteaptă verificarea",
  no_works_student: "Deocamdată nu ai lucrări verificate. Rezolvă o sarcină la lecție — va apărea aici după verificarea profesorului.",
  tip_last: "Sfat din ultima analiză:", battle: "Lupta claselor", yours: "a ta",
  board_empty: "Clasamentul va apărea după primele lucrări verificate.",
  board_note: "Punctele clasei sunt media XP pe elev: corect pentru clase mari și mici.",
  awards: "Premii", awards_hint: "Ține mouse-ul pe un premiu ca să afli cum îl obții.",
  parent_title: "Cabinetul părintelui · TechLab", p_badge: "CABINETUL PĂRINTELUI", loading: "Se încarcă…",
  pl_h1: "Succesele copilului dumneavoastră",
  pl_p: "Introduceți codul părintelui de pe cartonașul primit de la profesor. Veți vedea notele, lucrările realizate și sfaturi despre ce trebuie repetat.",
  pcode_label: "Codul părintelui", pl_small: "Codul începe cu litera P. Dacă aveți mai mulți copii, după intrare puteți adăuga încă un cod.",
  pe_student: "Acesta este codul elevului. Este nevoie de codul părintelui — începe cu P.", pe_p: "Verificați codul: începe cu litera P.",
  pe_none: "Acest cod nu există. Verificați literele și cifrele.", pe_net: "Nu există conexiune cu serverul. Încercați din nou.",
  pe_expired: "Codul nu mai este valabil — cereți profesorului unul nou.", pe_nostudent: "Elevul nu a fost găsit — cereți profesorului un cod nou.",
  p_nonet_h: "Nu există conexiune cu serverul", p_nonet_p: "Reîncărcați pagina puțin mai târziu.",
  child: "Copilul:", add_child: "+ adaugă încă un copil", sign_out: "Ieși", confirm_out: "Ieșiți și ștergeți codurile de pe acest dispozitiv?",
  p_success: "Succese: {n}", ps_avg: "Nota medie", by: "pentru", pl_checked: ["lucrare verificată", "lucrări verificate"],
  ps_qualnote: " · educația tehnologică se apreciază prin calificative (FB, B, S, I)",
  ps_done: "Lucrări realizate", ps_pending: "{n} așteaptă verificarea profesorului", ps_allchecked: "toate verificate",
  ps_level: "Nivelul pe platformă", ps_level_s: "{name} · {xp} XP · premii: {a}",
  ps_viol: "Încălcări la teste", ps_viol_y: "ieșiri din filă, încercări de copiere", ps_viol_n: "lucru cinstit",
  works_h: "Lucrări", retake_l: "reluare", pts: "p.", checking_w: "se verifică",
  p_noworks: "Deocamdată nu sunt lucrări. Vor apărea aici după ce profesorul verifică prima lucrare.",
  ai_h: "Analiza ultimei lucrări", ai_good: "Reușește bine:", ai_gaps: "Sunt lacune:", ai_adv: "Ce trebuie repetat acasă:",
  by_subj: "Pe discipline", no_checked: "Nu sunt lucrări verificate.", how_h: "Cum se citesc notele",
  how_p: "Notele sunt pe scala de 10 puncte; educația tehnologică se apreciază prin calificative: FB — foarte bine, B — bine, S — suficient, I — insuficient. Răspunsurile deschise se verifică cu ajutorul IA, iar nota finală o aprobă profesorul. „…” — lucrarea este predată și așteaptă verificarea.",
  upd: " Date actualizate: {d}.",
  inst_h: "📲 Instalează TechLab", inst_ios: "Pe iPhone și iPad:", inst_and: "Pe telefonul Android:", inst_pc: "Pe calculator:",
  inst_note: "Aplicația este gratuită, are mai puțin de 1 MB și se actualizează singură. Pentru teste este nevoie de internet.", ok: "Am înțeles",
  inst_done: "✓ TechLab este instalat — caută pictograma pe desktop",
  inst_steps_ios: [["Deschide site-ul în <b>Safari</b>", "în Chrome pe iPhone instalarea nu funcționează"], ["Apasă butonul <b>„Partajare”</b>", "pătratul cu săgeată în sus, jos pe ecran"], ["Alege <b>„Adaugă pe ecranul principal”</b>", "derulează lista în jos"], ["Apasă <b>„Adaugă”</b>", "pictograma TechLab va apărea pe ecran"]],
  inst_steps_and: [["Deschide site-ul în <b>Chrome</b>", ""], ["Apasă meniul <b>⋮</b>", "trei puncte în dreapta sus"], ["Alege <b>„Instalează aplicația”</b>", "sau „Adaugă pe ecranul principal”"], ["Confirmă <b>„Instalează”</b>", "pictograma TechLab va apărea printre aplicații"]],
  inst_steps_pc: [["Deschide site-ul în <b>Chrome</b> sau <b>Edge</b>", "în Firefox instalarea nu este disponibilă"], ["Găsește pictograma <b>„Instalează”</b>", "în dreapta barei de adrese (monitor cu săgeată) sau meniul ⋮ → „Instalează TechLab”"], ["Apasă <b>„Instalează”</b>", "TechLab se va deschide într-o fereastră separată"], ["Gata!", "scurtătura va apărea pe desktop și în meniul Start"]],
  c_h: "Înainte de a începe",
  c_p: "TechLab păstrează <b>numele, clasa și răspunsurile tale</b>, ca profesorul să-ți verifice lucrarea și să-ți pună nota. Le vede doar profesorul (și tu sau părinții — cu codul personal). Fără publicitate și fără vânzarea datelor.",
  c_l: "Politica de confidențialitate", c_ok: "Am înțeles, sunt de acord",
  off_title: "Fără internet · TechLab", off_h: "Nu există conexiune la internet",
  off_p: "Testele și misiunile TechLab funcționează doar online — răspunsurile se salvează imediat la profesor. Verifică Wi-Fi-ul sau internetul mobil și încearcă din nou.",
  off_btn: "↻ Încearcă din nou",
  lang_aria: "Limba interfeței",
},

// ============================== ENGLISH ==============================
en: {
  nav_home: "Home", grade_word: "grade",
  subs: "Informatics · Geography · Technology education",
  lead: "Choose a subject and grade. The teacher opens a test or mission — it will appear in the “Now in class” block.",
  install_btn: "📲 Install the app",
  f_parent: "parent dashboard", f_demo: "demo mode", f_privacy: "privacy", f_teacher: "teacher sign-in", f_start: "start page",
  lite_on: "⚡ lite mode (for slow computers)", lite_off: "✨ normal mode",
  retake: "Retake", now: "Now in class", start_mission: "Start mission →", start: "Start →",
  now_empty: "The teacher hasn't opened a task yet. Choose a subject below or wait.",
  tab_home: "HOME", tab_all: "All subjects", tab_subj: "SUBJECT",
  pl_exp: ["expedition", "expeditions"], pl_task: ["task", "tasks"], pl_mat: ["material", "materials"],
  soon_tasks: "tasks coming soon", choose_subject: "Choose a subject", choose_grade: "choose a grade",
  week_plan: "📅 Week plan", days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  f_all: "All", f_retakes: "🔁 Retakes", f_materials: "📎 Materials", exps_h: "🚀 Expeditions and quests", mission: "MISSION",
  b_open_f: "open", b_closed_f: "closed", b_soon: "🔒 soon", b_open_m: "open", b_closed_m: "closed",
  no_tasks: "No tasks yet.", no_kind: "No work of this type yet.", materials_h: "📎 Lesson materials", no_materials: "No materials yet.",
  sign_in: "Sign in", loading_progress: "Loading your progress…",
  p_tag: "DIGITAL CLASSROOM", p_h1: "Tasks, grades and progress — in one place",
  p_text: "Do tests, quests and practical tasks in class, earn experience and awards. Parents see grades and tips on what to review.",
  p_demo: "▶ Try the demo without signing in",
  r_student: "I'm a student", r_student_s: "Sign in with your personal code",
  r_parent: "I'm a parent", r_parent_s: "Your child's grades and progress with the parent code",
  r_teacher: "I'm a teacher", r_teacher_s: "Control center · Google sign-in",
  login_h: "Student sign-in", login_p: "Enter the personal code from the card your teacher gave you.", code_label: "Personal code", cancel: "Cancel",
  login_small: "Forgot your code? Ask your teacher. Don't forget to sign out on a shared computer.",
  err_parent_code: "This is a parent code. Parents should use the “I'm a parent” button.", err_s: "Check the code: it starts with the letter S.",
  checking: "Checking…", err_nocode: "This code doesn't exist. Check the letters and digits.", err_net: "No connection to the server. Try again.",
  hello: "Hi, {n}!", level: "Level {n} · {name}", xp_next: "{x} XP to the “{next}” level · {total} XP in total",
  pl_honest: ["assignment in a row with no violations", "assignments in a row with no violations"],
  avg_grade: "average grade", pl_awards_of: ["award of {n}", "awards of {n}"],
  not_me: "Not me — sign out", my_works: "My work", waiting_check: "awaiting review",
  no_works_student: "No reviewed work yet. Complete a task in class — it will appear here after the teacher reviews it.",
  tip_last: "Tip from the latest review:", battle: "Battle of Classes", yours: "yours",
  board_empty: "The ranking will appear after the first reviewed work.",
  board_note: "Class points are the average XP per student — fair for big and small classes.",
  awards: "Awards", awards_hint: "Hover over an award to see how to get it.",
  parent_title: "Parent dashboard · TechLab", p_badge: "PARENT DASHBOARD", loading: "Loading…",
  pl_h1: "Your child's progress",
  pl_p: "Enter the parent code from the card the teacher gave you. You'll see grades, completed work and tips on what to review.",
  pcode_label: "Parent code", pl_small: "The code starts with the letter P. Several children? You can add another code after signing in.",
  pe_student: "This is a student code. You need the parent code — it starts with P.", pe_p: "Check the code: it starts with the letter P.",
  pe_none: "This code doesn't exist. Check the letters and digits.", pe_net: "No connection to the server. Please try again.",
  pe_expired: "The code is no longer valid — ask the teacher for a new one.", pe_nostudent: "Student not found — ask the teacher for a new code.",
  p_nonet_h: "No connection to the server", p_nonet_p: "Reload the page a bit later.",
  child: "Child:", add_child: "+ add another child", sign_out: "Sign out", confirm_out: "Sign out and forget the codes on this device?",
  p_success: "Progress: {n}", ps_avg: "Average grade", by: "across", pl_checked: ["reviewed work", "reviewed works"],
  ps_qualnote: " · technology education is graded with descriptors (VG, G, S, U)",
  ps_done: "Completed work", ps_pending: "{n} awaiting teacher review", ps_allchecked: "all reviewed",
  ps_level: "Platform level", ps_level_s: "{name} · {xp} XP · awards: {a}",
  ps_viol: "Test violations", ps_viol_y: "leaving the tab, copy attempts", ps_viol_n: "honest work",
  works_h: "Work", retake_l: "retake", pts: "pts", checking_w: "being reviewed",
  p_noworks: "No work yet. It will appear here after the teacher reviews the first one.",
  ai_h: "Latest work review", ai_good: "Doing well:", ai_gaps: "Gaps:", ai_adv: "What to review at home:",
  by_subj: "By subject", no_checked: "No reviewed work.", how_h: "How to read the grades",
  how_p: "Grades use a 10-point scale; technology education uses descriptors: VG — very good, G — good, S — satisfactory, U — unsatisfactory. Open answers are checked with AI help; the final grade is approved by the teacher. “…” — the work is submitted and awaiting review.",
  upd: " Data updated {d}.",
  inst_h: "📲 Install TechLab", inst_ios: "On iPhone and iPad:", inst_and: "On an Android phone:", inst_pc: "On a computer:",
  inst_note: "The app is free, takes less than 1 MB and updates itself. Tests need an internet connection.", ok: "Got it",
  inst_done: "✓ TechLab is installed — look for the icon on your desktop",
  inst_steps_ios: [["Open the site in <b>Safari</b>", "installing from Chrome on iPhone doesn't work"], ["Tap the <b>Share</b> button", "the square with an up arrow at the bottom"], ["Choose <b>Add to Home Screen</b>", "scroll down the list"], ["Tap <b>Add</b>", "the TechLab icon will appear on the screen"]],
  inst_steps_and: [["Open the site in <b>Chrome</b>", ""], ["Tap the <b>⋮</b> menu", "three dots at the top right"], ["Choose <b>Install app</b>", "or Add to Home screen"], ["Confirm <b>Install</b>", "the TechLab icon will appear among your apps"]],
  inst_steps_pc: [["Open the site in <b>Chrome</b> or <b>Edge</b>", "installing isn't available in Firefox"], ["Find the <b>Install</b> icon", "at the right of the address bar (a monitor with an arrow) or menu ⋮ → Install TechLab"], ["Click <b>Install</b>", "TechLab will open in its own window"], ["Done!", "a shortcut will appear on the desktop and in the Start menu"]],
  c_h: "Before you start",
  c_p: "TechLab saves <b>your name, class and answers</b> so the teacher can check your work and give a grade. Only the teacher sees them (and you or your parents — with a personal code). No ads and no selling of data.",
  c_l: "Privacy policy (Russian / Romanian)", c_ok: "Got it, I agree",
  off_title: "No internet · TechLab", off_h: "No internet connection",
  off_p: "TechLab tests and missions only work online — answers are saved for the teacher right away. Check your Wi-Fi or mobile data and try again.",
  off_btn: "↻ Try again",
  lang_aria: "Interface language",
},
};

// ---------------------------------------------------------------------
//  Функции
// ---------------------------------------------------------------------
export function t(key, vars) {
  let s = D[LANG][key] ?? D.ru[key] ?? key;
  if (vars && typeof s === "string") s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

// Число + слово в нужной форме: pl(5, "pl_task") → «5 заданий» / «5 sarcini» / «5 tasks»
export function plw(n, key, vars) {
  const f = t(key);
  let w;
  if (LANG === "ru") w = n % 10 === 1 && n % 100 !== 11 ? f[0] : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? f[1] : f[2];
  else w = n === 1 ? f[0] : f[1];
  if (LANG === "ro" && n !== 1 && (n % 100 === 0 || n % 100 >= 20)) w = "de " + w;   // «20 de sarcini»
  if (vars) w = w.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return w;
}
export const pl = (n, key, vars) => `${n} ${plw(n, key, vars)}`;

// «11 класс» / «clasa a 11-a» / «Grade 11»
export function gradeLabel(g) {
  if (LANG === "ro") return `clasa a ${g}-a`;
  if (LANG === "en") return `Grade ${g}`;
  return `${g} класс`;
}

// Предметы и типы работ (названия из tests.js переводятся по id)
const SUBJ = {
  geo: { ru: "География", ro: "Geografie", en: "Geography" },
  inf: { ru: "Информатика", ro: "Informatică", en: "Informatics" },
  tech: { ru: "Технологическое воспитание", ro: "Educație tehnologică", en: "Technology education" },
  math: { ru: "Математика", ro: "Matematică", en: "Mathematics" },
};
const SUBJ_SHORT = { tech: { ru: "Техн. воспитание", ro: "Educ. tehnologică", en: "Tech education" } };
export const subjName = (s) => (s && SUBJ[s.id]?.[LANG]) || s?.name || "";
export const subjShort = (s) => (s && SUBJ_SHORT[s.id]?.[LANG]) || subjName(s);

const KIND = {
  so:     { ro: ["Sumativă", "Evaluare sumativă"],         en: ["Summative", "Summative assessment"] },
  to:     { ro: ["Curentă", "Evaluare curentă"],           en: ["Ongoing", "Ongoing assessment"] },
  sr:     { ro: ["Independentă", "Lucrări independente"],  en: ["Independent", "Independent work"] },
  pr:     { ro: ["Practică", "Lucrări practice"],          en: ["Practical", "Practical work"] },
  quest:  { ro: ["Quest", "Quest-uri și misiuni"],         en: ["Quest", "Quests and missions"] },
  blitz:  { ro: ["Blitz", "Încălzire blitz"],              en: ["Blitz", "Blitz warm-up"] },
  hw:     { ro: ["Tema", "Tema pentru acasă"],             en: ["Homework", "Homework"] },
  train:  { ro: ["Antrenament", "Antrenament"],            en: ["Practice", "Practice"] },
  battle: { ro: ["Lupta claselor", "Lupta claselor"],      en: ["Battle of Classes", "Battle of Classes"] },
};
// Возвращает копию типа работы с переведёнными short и name
export function kindT(k) {
  if (!k || LANG === "ru" || !KIND[k.id]) return k;
  const [short, name] = KIND[k.id][LANG];
  return { ...k, short, name };
}
export const kindShortById = (id, fallback = "") => (LANG !== "ru" && KIND[id]?.[LANG]?.[0]) || fallback;

// Квалификативы технологического воспитания: в базе хранятся ОХ/Х/У/Н
const QUAL = { ro: { "ОХ": "FB", "Х": "B", "У": "S", "Н": "I" }, en: { "ОХ": "VG", "Х": "G", "У": "S", "Н": "U" } };
export const qualShow = (q) => (LANG !== "ru" && QUAL[LANG][q]) || q;

// Уровни и награды
export const LEVEL_NAMES = {
  ru: ["Новичок", "Стажёр", "Исследователь", "Аналитик", "Эксперт", "Мастер", "Гуру", "Легенда"],
  ro: ["Începător", "Stagiar", "Explorator", "Analist", "Expert", "Maestru", "Guru", "Legendă"],
  en: ["Beginner", "Trainee", "Explorer", "Analyst", "Expert", "Master", "Guru", "Legend"],
}[LANG];
export const AWARD_TEXT = {
  ru: { first: ["1", "Первая работа", "сдать первую работу"], ten: ["10", "Десятка", "получить оценку 10"], honest: ["3×", "Честная игра", "3 работы подряд без нарушений"],
        five: ["5", "Пятёрка работ", "сдать 5 работ"], star: ["9+", "Отличник", "средняя оценка от 9 (минимум 3 работы)"], multi: ["2П", "Универсал", "работы по двум предметам"],
        pr: ["ПР", "Практик", "сдать практическую работу"], max: ["100", "Без единой ошибки", "набрать максимум баллов"] },
  ro: { first: ["1", "Prima lucrare", "predă prima lucrare"], ten: ["10", "Nota 10", "obține nota 10"], honest: ["3×", "Joc cinstit", "3 lucrări la rând fără încălcări"],
        five: ["5", "Cinci lucrări", "predă 5 lucrări"], star: ["9+", "Eminent", "media de la 9 (minimum 3 lucrări)"], multi: ["2D", "Universal", "lucrări la două discipline"],
        pr: ["LP", "Practician", "predă o lucrare practică"], max: ["100", "Fără nicio greșeală", "obține punctajul maxim"] },
  en: { first: ["1", "First work", "submit your first work"], ten: ["10", "Perfect 10", "get a 10"], honest: ["3×", "Fair play", "3 works in a row with no violations"],
        five: ["5", "Five works", "submit 5 works"], star: ["9+", "Top student", "average of 9 or higher (at least 3 works)"], multi: ["2S", "All-rounder", "work in two subjects"],
        pr: ["PW", "Practitioner", "submit a practical work"], max: ["100", "Flawless", "get the maximum score"] },
}[LANG];

// Дата в языке интерфейса
export const fmtDate = (d, opt) => new Date(d).toLocaleDateString(LOCALE, opt);
export const fmtDateTime = (d, opt) => new Date(d).toLocaleString(LOCALE, opt);

// Подставляет переводы в статичную разметку: data-i18n="ключ" (текст), data-i18n-html, data-i18n-title
export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => { document.title = t(el.dataset.i18nTitle); });
}

// Переключатель языков RU · RO · EN. Вставляется в элемент-контейнер.
export function mountLangSwitch(el) {
  if (!el) return;
  if (!document.getElementById("tl-lang-css")) {
    const st = document.createElement("style"); st.id = "tl-lang-css";
    st.textContent = `.lang-sw{display:inline-flex;gap:2px;background:#E8EDFF;border-radius:999px;padding:3px}
      .lang-sw button{font:inherit;font-size:13px;font-weight:800;letter-spacing:.04em;border:0;background:transparent;color:#2E4BFF;border-radius:999px;padding:5px 11px;cursor:pointer}
      .lang-sw button[aria-pressed="true"]{background:#2E4BFF;color:#fff}
      .lang-sw button:focus-visible{outline:3px solid #FFD36B;outline-offset:1px}`;
    document.head.appendChild(st);
  }
  el.innerHTML = `<div class="lang-sw" role="group" aria-label="${t("lang_aria")}">${LANGS.map(([id, ab, full]) =>
    `<button type="button" lang="${id}" data-lang="${id}" title="${full}" aria-pressed="${id === LANG}">${ab}</button>`).join("")}</div>`;
  el.querySelectorAll("[data-lang]").forEach((b) => b.onclick = () => {
    if (b.dataset.lang === LANG) return;
    setLang(b.dataset.lang); location.reload();
  });
}
