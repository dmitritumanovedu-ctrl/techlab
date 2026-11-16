import { readDb, cacheGet, cachePut } from "./engine/fbrest.js?v=1";
import { SUBJECTS, TESTS as TESTS_RAW, EXPEDITIONS, KINDS as KINDS_RAW, kindOf as kindOfRaw } from "./tests.js?v=8";
let TESTS = TESTS_RAW;   // + тесты из конструктора (pubIndex)
import { t, pl, gradeLabel, subjName, subjShort, kindT, LOCALE, LANG } from "./engine/i18n.js?v=1";
import { getSession, clsKey, SESSION_EVENT } from "./engine/people.js?v=3";
const kindOf = (x, S) => kindT(kindOfRaw(x, S));
const KINDS = KINDS_RAW.map(kindT);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const subj = (id) => SUBJECTS.find((s) => s.id === id);

let CURRENT = null, LINKS = {}, OPEN = {}, SET = {}, PLAN = {}, FILTER = "all", LASTGRADE = "";

// ---------- ученик вошёл по личному коду: показываем только его предметы и его класс ----------
let ME = getSession();
let MYGRADE = ME ? String(ME.cls).split(" ")[0] : "";
let MYSUBJ = null;                                   // null = учитель не выбрал предметы → видно всё
// Вход или выход ученика: сразу пересчитываем «Мои предметы», чтобы не оставалось следов прошлого ученика
function onSession() {
  ME = getSession();
  MYGRADE = ME ? String(ME.cls).split(" ")[0] : "";
  MYSUBJ = ME ? classSubjects(SET) : null;
  renderNow(); render();
  refresh();
}
const classSubjects = (s) => { const cs = ME && s?.classSubjects?.[clsKey(ME.cls)]; return cs ? Object.keys(cs) : null; };
window.addEventListener(SESSION_EVENT, onSession);
const L3 = (ru, ro, en) => ({ ru, ro, en })[LANG] || ru;
const mySubjects = () => MYSUBJ ? SUBJECTS.filter((s) => MYSUBJ.includes(s.id)) : SUBJECTS;
const mine = () => !!(ME && MYSUBJ);
const ktag = (k) => `<span class="ktag k-${k.id}">${esc(k.short)}</span>`;
const rtag = `<span class="ktag k-retake">${t("retake")}</span>`;
// аккуратные линейные иконки вместо эмодзи (стиль «Строгий сервис»)
const SV = (d) => `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const IC = {
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  retake: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
  geo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  inf: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>',
  tech: '<path d="M14.5 5.5a4 4 0 0 0 4 4l-8.5 8.5a2.1 2.1 0 0 1-3-3z"/><path d="M4 4l5 5"/>',
  math: '<path d="M4 20L20 4v16z"/><path d="M9 20v-2M13 20v-3M17 20v-2"/>',
};
const subjIcon = (id) => SV(IC[id] || IC.doc);

// ---------- лёгкий режим для слабых компьютеров ----------
const LITE = (() => { try { const v = localStorage.getItem("techlab_lite"); if (v) return v === "1"; } catch (e) {}
  return (navigator.hardwareConcurrency || 8) <= 2; })();
if (LITE) document.documentElement.classList.add("lite");

function tick() {
  const d = new Date();
  $("#clock").innerHTML = d.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }) +
    "<br><b>" + d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" }) + "</b>";
}
tick(); setInterval(tick, 15000);

// ---------- данные из базы ----------
// Стартовая страница не держит постоянное подключение к базе: раз в 20 секунд
// делает короткий HTTPS-запрос (с таймаутом и повтором). Последние данные хранятся
// на компьютере — при медленном интернете страница показывается сразу.
function apply(s, pi) {
  s = s || {};
  const BT = Object.entries(pi || {}).map(([id, x]) => ({ id, type: "test", kind: x.kind || "to", subject: x.subject, grade: x.grade, title: x.title,
    note: [pl(x.n || 0, "pl_task"), x.minutes ? x.minutes + (LANG === "ru" ? " мин" : " min") : ""].filter(Boolean).join(" · "), path: `b/?t=${id}` }));
  TESTS = TESTS_RAW.concat(BT);
  SET = s; CURRENT = s.current || null;
  MYSUBJ = classSubjects(s);
  LINKS = s.links || {}; PLAN = s.plan || {}; OPEN = {};
  for (const t of TESTS) OPEN[t.id] = !!(s[t.id] && s[t.id].open);
}
const cached = cacheGet("start", 3 * 864e5);
if (cached) apply(cached.s, cached.pi);
let busy = false;
async function refresh() {
  if (document.hidden || busy) return;
  busy = true;
  try {
    const [s, pi] = await Promise.all([readDb("settings", { tries: 2 }), readDb("pubIndex", { tries: 2 }).catch(() => null)]);
    cachePut("start", { s, pi });
    apply(s, pi);
  } catch (e) { console.warn(e); }
  finally { busy = false; renderNow(); render(); }
}
refresh();
setInterval(refresh, 20000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

// ---------- «Сейчас на уроке» ----------
function renderNow() {
  const box = $("#now");
  const forMe = !mine() || !CURRENT || (MYSUBJ.includes(CURRENT.subject) && (!CURRENT.grade || CURRENT.grade === MYGRADE));
  if (CURRENT && CURRENT.path && forMe) {
    const s = subj(CURRENT.subject);
    const T = TESTS.find((t) => t.id === CURRENT.id);
    const mission = T?.type === "mission";
    const K = T ? kindOf(T, SET) : null;
    box.innerHTML = `<a class="now" data-s="${esc(CURRENT.subject || "")}" href="${esc(CURRENT.path)}">
      <span class="now-ic">${subjIcon(CURRENT.subject)}</span>
      <div><div class="lbl"><span class="pulse"></span>${t("now")}${K ? ` <span class="now-k">${esc(K.name)}</span>` : ""}</div>
        <div class="ttl">${esc(CURRENT.title)}</div>
        <div class="sub">${s ? esc(subjName(s)) : ""}${CURRENT.grade ? " · " + esc(gradeLabel(CURRENT.grade)) : ""}</div></div>
      <span class="go">${mission ? t("start_mission") : t("start")}</span></a>`;
  } else {
    box.innerHTML = `<div class="now empty"><div><div class="lbl">${t("now")}</div>
      <div class="sub" style="margin-top:4px">${t("now_empty")}</div></div></div>`;
  }
}

// ---------- страницы ----------
addEventListener("hashchange", () => { render(); scrollTo(0, 0); });

function renderTabs(active) {
  $("#tabs").innerHTML = `<a class="tab${active ? "" : " on"}" href="#"><b>${mine() ? L3("Мои предметы", "Disciplinele mele", "My subjects") : t("tab_all")}</b></a>` +
    mySubjects().map((s, i) => `<a class="tab${active === s.id ? " on" : ""}" data-s="${s.id}" href="#${s.id}${mine() ? "-" + MYGRADE : ""}"><b>${esc(subjShort(s))}</b></a>`).join("");
}

function render() {
  const [sid, grade] = decodeURIComponent(location.hash.slice(1)).split("-");
  document.body.dataset.view = SPECIAL.includes(sid) ? sid : "";
  if (SPECIAL.includes(sid)) { renderTabs(""); return renderSpecial(sid); }
  let s = subj(sid);
  if (s && mine() && !MYSUBJ.includes(s.id)) s = null;          // чужой предмет — на главную
  renderTabs(s ? s.id : "");
  if (!s) return renderHome();
  if (mine() && grade !== MYGRADE) return renderGrade(s, MYGRADE);   // ученик видит только свой класс
  if (!grade || !s.grades.includes(grade)) return renderSubject(s);
  renderGrade(s, grade);
}

function stats(sid, grade) {
  const items = TESTS.filter((x) => x.subject === sid && (!grade || x.grade === grade));
  const ready = items.filter((x) => x.path).length;
  const links = Object.values(LINKS).filter((x) => x.subject === sid && (!grade || x.grade === grade)).length;
  const exps = EXPEDITIONS.filter((x) => x.subject === sid && (!grade || x.grade === grade)).length;
  return { total: items.length, ready, links, exps };
}
function statLine(st) {
  const parts = [];
  if (st.exps) parts.push(pl(st.exps, "pl_exp"));
  if (st.ready) parts.push(pl(st.ready, "pl_task"));
  if (st.links) parts.push(pl(st.links, "pl_mat"));
  return parts.join(" · ") || t("soon_tasks");
}

function renderHome() {
  if (mine()) {
    $("#view").innerHTML = `<h2>${L3("Мои предметы", "Disciplinele mele", "My subjects")} · ${esc(ME.cls)}</h2>
      ${mySubjects().length ? `<div class="tiles">${mySubjects().map((s) => `<a class="tile" data-s="${s.id}" href="#${s.id}-${MYGRADE}">
        <div class="ic">${s.icon}</div><div class="nm">${esc(subjName(s))}</div>
        <div class="ds">${statLine(stats(s.id, MYGRADE))}</div>${tileState(s.id, MYGRADE)}
        <div class="cls"><b>${esc(ME.cls)}</b></div></a>`).join("")}</div>`
      : `<div class="empty-note">${L3("Учитель ещё не добавил предметы для твоего класса.", "Profesorul încă nu a adăugat disciplinele pentru clasa ta.", "Your teacher has not added subjects for your class yet.")}</div>`}`;
    return;
  }
  $("#view").innerHTML = `<h2>${t("choose_subject")}</h2><div class="tiles">${SUBJECTS.map((s) => {
    const st = stats(s.id);
    const pr = st.total ? Math.round(st.ready / st.total * 100) : 0;
    const on = Math.max(1, Math.round(pr / 25));
    return `<a class="tile" data-s="${s.id}" href="#${s.id}">
      <div class="ic">${s.icon}</div><div class="nm">${esc(subjName(s))}</div>
      <div class="ds">${statLine(st)}</div>${tileState(s.id)}
      <div class="cls">${s.grades.map((g) => `<b>${esc(gradeLabel(g))}</b>`).join("")}</div>
      <div class="seg">${[0, 1, 2, 3].map((i) => `<span${i < on ? ' class="on"' : ""}></span>`).join("")}</div></a>`;
  }).join("")}</div>`;
}

// ---------- разделы левого меню: календарь, мои задания, материалы, помощь ----------
const SPECIAL = ["calendar", "tasks", "materials", "help"];
const COLOR = { geo: "#188038", inf: "#1967d2", tech: "#e37400", math: "#9334e6" };
const seeable = (sid, g) => !ME || ((!g || g === MYGRADE) && (!MYSUBJ || MYSUBJ.includes(sid)));
function tileState(sid, g) {
  if (CURRENT && CURRENT.subject === sid && (!g || !CURRENT.grade || CURRENT.grade === g))
    return `<div class="t-st live">${L3("идёт урок", "lecție în curs", "in class now")}</div>`;
  const n = TESTS.filter((t) => t.subject === sid && (!g || t.grade === g) && OPEN[t.id]).length;
  return n ? `<div class="t-st">${L3("открыто", "deschise", "open")}: ${n}</div>` : "";
}
function planEvents() {
  const out = [];
  for (const [key, list] of Object.entries(PLAN || {})) {
    const [s, g] = key.split("-");
    if (!seeable(s, g)) continue;
    for (const e of Object.values(list || {})) if (e && e.d) out.push({ ...e, s, g });
  }
  return out.sort((a, b) => (a.d + (a.at || 0)).localeCompare(b.d + (b.at || 0)));
}
const where = (sid, g) => `${esc(subjName(subj(sid)) || sid)}${g ? ", " + esc(gradeLabel(g)) : ""}`;
const evRow = (e) => { const k = KINDS.find((x) => x.id === e.k);
  return `<div class="row ev-row" style="--c:${COLOR[e.s] || "#1a73e8"}"><span class="ri">${subjIcon(e.s)}</span>
    <span><div class="rt">${esc(e.t)}</div><div class="rs">${where(e.s, e.g)}</div></span><span class="rb">${k ? ktag(k) : ""}</span></div>`; };

function renderSpecial(id) {
  const crumbs = `<div class="crumbs"><a href="#">${t("nav_home")}</a> › `;
  const today = iso(new Date());
  let html = "";
  if (id === "calendar") {
    const ev = planEvents().filter((e) => e.d >= today);
    const days = [...new Set(ev.map((e) => e.d))].slice(0, 15);
    html = `${crumbs}${L3("Календарь", "Calendar", "Calendar")}</div><h2>${L3("Календарь работ", "Calendarul lucrărilor", "Work calendar")}</h2>` +
      (days.length ? days.map((d) => `<h3>${esc(new Date(d + "T12:00").toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }))}${d === today ? " · " + L3("сегодня", "astăzi", "today") : ""}</h3>
        <div class="list">${ev.filter((e) => e.d === d).map(evRow).join("")}</div>`).join("")
        : `<div class="empty-note">${L3("В плане пока ничего нет. Учитель добавляет работы в «План недели».", "Deocamdată planul este gol.", "Nothing planned yet.")}</div>`);
  } else if (id === "tasks") {
    const open = TESTS.filter((x) => x.path && OPEN[x.id] && seeable(x.subject, x.grade));
    const soon = planEvents().filter((e) => e.d >= today).slice(0, 8);
    html = `${crumbs}${L3("Мои задания", "Sarcinile mele", "My tasks")}</div><h2>${L3("Мои задания", "Sarcinile mele", "My tasks")}</h2>
      <h3>${L3("Открыто сейчас", "Deschise acum", "Open now")}</h3>` +
      (open.length ? `<div class="list">${open.map((x) => { const k = kindOf(x, SET); return `<a class="row" href="${esc(x.path)}" style="--c:${COLOR[x.subject] || "#1a73e8"}">
        <span class="ri">${subjIcon(x.subject)}</span><span><div class="rt">${esc(x.title)}</div><div class="rs">${where(x.subject, x.grade)}</div></span>
        <span class="rb">${ktag(k)} <span class="badge open">${t("b_open_m")}</span></span></a>`; }).join("")}</div>`
        : `<div class="empty-note">${L3("Сейчас ничего не открыто. Работу открывает учитель на уроке.", "Acum nu este nimic deschis.", "Nothing is open right now.")}</div>`) +
      `<h3>${L3("Скоро по плану", "În curând", "Coming up")}</h3>` +
      (soon.length ? `<div class="list">${soon.map((e) => evRow({ ...e, t: new Date(e.d + "T12:00").toLocaleDateString(LOCALE, { weekday: "short", day: "2-digit", month: "2-digit" }) + " · " + e.t })).join("")}</div>`
        : `<div class="empty-note">${L3("В плане пока ничего нет.", "Planul este gol.", "Nothing planned yet.")}</div>`);
  } else if (id === "materials") {
    const L = Object.values(LINKS).filter((l) => seeable(l.subject, l.grade)).sort((a, b) => (b.at || 0) - (a.at || 0));
    const groups = SUBJECTS.map((s) => [s, L.filter((l) => l.subject === s.id)]).filter(([, l]) => l.length);
    html = `${crumbs}${L3("Материалы", "Materiale", "Materials")}</div><h2>${t("materials_h")}</h2>` +
      (groups.length ? groups.map(([s, l]) => `<h3>${esc(subjName(s))}</h3><div class="list">${l.map((x) => `<a class="row" href="${esc(x.url)}" target="_blank" rel="noopener">
        <span class="ri">${icon(x.url)}</span><span><div class="rt">${esc(x.title)}</div><div class="rs">${esc(gradeLabel(x.grade))} · ${esc(host(x.url))}</div></span><span class="rb">↗</span></a>`).join("")}</div>`).join("")
        : `<div class="empty-note">${t("no_materials")}</div>`);
  } else {
    const card = (ic, h, p) => `<div class="help-c"><span class="ri">${SV(ic)}</span><div><b>${h}</b><p>${p}</p></div></div>`;
    html = `${crumbs}${L3("Как войти", "Cum intru", "How to sign in")}</div><h2>${L3("Как пользоваться TechLab", "Cum folosești TechLab", "How to use TechLab")}</h2><div class="help">` +
      card('<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>', L3("Ученику", "Elevului", "Students"),
        L3("Учитель выдаёт личный код вида SXXX-XXXX. Нажми «Я ученик» на главной и введи код — увидишь свои предметы, задания и оценки. Код никому не показывай.",
           "Profesorul îți dă un cod personal de forma SXXX-XXXX. Apasă „Sunt elev” pe pagina principală și introdu codul. Nu arăta codul nimănui.",
           "Your teacher gives you a personal code like SXXX-XXXX. Press “I’m a student” on the home page and enter it. Keep it private.")) +
      card('<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/>', L3("Родителю", "Părintelui", "Parents"),
        L3("Код родителя выдаёт учитель. Откройте «Кабинет родителя» и введите его — увидите оценки ребёнка и советы, что повторить.",
           "Codul de părinte îl dă profesorul. Deschideți „Cabinetul părintelui” și introduceți-l.",
           "The teacher gives you a parent code. Open the parent dashboard and enter it.")) +
      card('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>', L3("Установить приложение", "Instalează aplicația", "Install the app"),
        L3("На компьютере с Windows — кнопка «Скачать из Microsoft Store» в меню слева. На телефоне — «Установить приложение» вверху страницы.",
           "Pe Windows — butonul Microsoft Store din meniul din stânga. Pe telefon — „Instalează aplicația” sus.",
           "On Windows use the Microsoft Store button on the left. On a phone use “Install the app” at the top.")) +
      card('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>', L3("Слабый компьютер или интернет", "Calculator sau internet lent", "Slow computer or internet"),
        L3("Внизу страницы включите «лёгкий режим» — без анимаций, всё работает быстрее. Если страница не открывается, обновите её или спросите учителя.",
           "Jos pe pagină porniți „modul ușor”. Dacă pagina nu se deschide, reîncărcați-o sau întrebați profesorul.",
           "Turn on “lite mode” at the bottom of the page. If something does not load, refresh or ask your teacher.")) + `</div>`;
  }
  $("#view").innerHTML = html;
}

function renderSubject(s) {
  $("#view").innerHTML = `<div class="crumbs"><a href="#">${t("nav_home")}</a> › ${esc(subjName(s))}</div>
    <h2>${esc(subjName(s))} — ${t("choose_grade")}</h2>
    <div class="tiles">${s.grades.map((g) => `<a class="tile" data-s="${s.id}" href="#${s.id}-${g}">
        <div class="big">${esc(g)}</div><div class="nm" style="margin-top:6px">${t("grade_word")}</div>
        <div class="ds">${statLine(stats(s.id, g))}</div></a>`).join("")}</div>`;
}

// ---------- план недели ----------
const DAYS = t("days");
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
function weekHtml(sid, g) {
  const list = Object.values(PLAN[sid + "-" + g] || {});
  if (!list.length) return "";
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const mon = new Date(now); const wd = (now.getDay() + 6) % 7;            // 0 = понедельник
  mon.setDate(now.getDate() - wd + (wd >= 5 ? 7 : 0));                       // в выходные — следующая неделя
  const days = DAYS.map((name, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return { name, d, key: iso(d) }; });
  if (!list.some((e) => days.some((x) => x.key === e.d))) return "";
  const today = iso(now);
  return `<h3>${t("week_plan")}</h3><div class="week">${days.map((x) => {
    const es = list.filter((e) => e.d === x.key).sort((a, b) => (a.at || 0) - (b.at || 0));
    return `<div class="day${x.key === today ? " today" : ""}"><b>${x.name} ${pad(x.d.getDate())}.${pad(x.d.getMonth() + 1)}</b>
      ${es.length ? es.map((e) => { const k = KINDS.find((k) => k.id === e.k); return `<div class="ev">${esc(e.t)}${k ? `<br>${ktag(k)}` : ""}</div>`; }).join("") : '<span class="none">—</span>'}</div>`;
  }).join("")}</div>`;
}

function renderGrade(s, g) {
  if (LASTGRADE !== s.id + g) { FILTER = "all"; LASTGRADE = s.id + g; }
  const exps = EXPEDITIONS.filter((x) => x.subject === s.id && x.grade === g);
  const tests = TESTS.filter((x) => x.subject === s.id && x.grade === g && x.type !== "mission");
  const missions = TESTS.filter((x) => x.subject === s.id && x.grade === g && x.type === "mission");
  const links = Object.values(LINKS).filter((x) => x.subject === s.id && x.grade === g).sort((a, b) => (b.at || 0) - (a.at || 0));

  // фильтры по типам работ
  const all = tests.concat(missions);
  const cnt = {}; all.forEach((t) => { const k = kindOf(t, SET).id; cnt[k] = (cnt[k] || 0) + 1; });
  const nRetake = all.filter((t) => t.retake).length;
  const chips = [["all", t("f_all"), all.length + links.length]]
    .concat(KINDS.filter((k) => cnt[k.id]).map((k) => [k.id, k.short, cnt[k.id]]))
    .concat(nRetake ? [["retake", t("f_retakes"), nRetake]] : [])
    .concat(links.length ? [["links", t("f_materials"), links.length]] : []);
  if (!chips.some(([id]) => id === FILTER)) FILTER = "all";
  const tr = t;
  const show = (t) => FILTER === "all" || (FILTER === "retake" ? !!t.retake : kindOf(t, SET).id === FILTER);

  let html = `<div class="crumbs"><a href="#">${t("nav_home")}</a> › ${mine() ? esc(subjName(s)) : `<a href="#${s.id}">${esc(subjName(s))}</a>`} › ${esc(gradeLabel(g))}</div>
    <h2>${esc(subjName(s))} · ${esc(gradeLabel(g))}</h2>` + weekHtml(s.id, g) +
    `<div class="filters">${chips.map(([id, name, n]) => `<button type="button" class="flt${FILTER === id ? " on" : ""}" data-f="${id}">${esc(name)} <i>${n}</i></button>`).join("")}</div>`;

  // экспедиции (квесты)
  const expsShown = exps.map((e) => [e, TESTS.filter((t) => t.expedition === e.id).sort((a, b) => a.n - b.n).filter(show)]).filter(([, ms]) => ms.length);
  if (expsShown.length && FILTER !== "links") {
    html += `<h3>${t("exps_h")}</h3>` + expsShown.map(([e, ms]) => `<div class="exp"><div class="exp-head"><span class="ic">${SV(IC.flag)}</span>
        <div><div class="t">${esc(e.title)}</div><div class="s">${esc(e.note || "")}</div></div></div>
        <div class="route">${ms.map((m) => {
          const live = OPEN[m.id], K = kindOf(m, SET);
          const inner = `<div class="n">${t("mission")} ${String(m.n).padStart(2, "0")}${m.date ? " · " + esc(m.date) : ""}</div>
            <div class="mt">${esc(m.title)}</div>
            <div class="md">${K.id !== "quest" ? ktag(K) + " " : ""}${m.path ? (live ? `<span class="badge open">${t("b_open_f")}</span>` : `<span class="badge closed">${t("b_closed_f")}</span>`) : `<span class="badge soon">${t("b_soon")}</span>`}</div>`;
          return m.path ? `<a class="ms${live ? " live" : ""}" href="${esc(m.path)}">${inner}</a>` : `<div class="ms locked">${inner}</div>`;
        }).join("")}</div></div>`).join("");
  }

  // тесты, сгруппированные по типам
  if (FILTER !== "links") {
    const shownTests = tests.filter(show);
    const groups = KINDS.map((k) => [k, shownTests.filter((t) => kindOf(t, SET).id === k.id)]).filter(([, l]) => l.length);
    if (groups.length) html += groups.map(([k, l]) => `<h3>${esc(k.name)}</h3><div class="list">${l.map((t) => `<a class="row" href="${esc(t.path)}">
        <span class="ri">${SV(t.retake ? IC.retake : IC.doc)}</span><span><div class="rt">${esc(t.title)}</div><div class="rs">${esc(t.note || "")}</div></span>
        <span class="rb">${ktag(k)}${t.retake ? " " + rtag : ""} ${OPEN[t.id] ? `<span class="badge open">${tr("b_open_m")}</span>` : `<span class="badge closed">${tr("b_closed_m")}</span>`}</span></a>`).join("")}</div>`).join("");
    else if (!expsShown.length) html += `<div class="empty-note" style="margin-top:12px">${FILTER === "all" ? t("no_tasks") : t("no_kind")}</div>`;
  }

  if (FILTER === "all" || FILTER === "links") {
    html += `<h3>${t("materials_h")}</h3>` + (links.length ? `<div class="list">${links.map((l) => `<a class="row" href="${esc(l.url)}" target="_blank" rel="noopener">
        <span class="ri">${icon(l.url)}</span><span><div class="rt">${esc(l.title)}</div><div class="rs">${esc(host(l.url))}</div></span>
        <span class="rb">↗</span></a>`).join("")}</div>`
      : `<div class="empty-note">${t("no_materials")}</div>`);
  }

  $("#view").innerHTML = html;
  document.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { FILTER = b.dataset.f; renderGrade(s, g); });
}

function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } }
function icon(u) {
  const h = host(u);
  if (/docs\.google\.com\/presentation|canva|slides/.test(u)) return SV(IC.slides);
  if (/docs\.google\.com\/document|\.docx?$/.test(u)) return SV(IC.doc);
  if (/drive\.google|dropbox|onedrive/.test(h)) return SV(IC.folder);
  if (/youtube|youtu\.be|vimeo/.test(h)) return SV(IC.play);
  if (/forms\.gle|docs\.google\.com\/forms/.test(u)) return SV(IC.doc);
  return SV(IC.link);
}

// ---------- переключатель «лёгкий режим» ----------
const lt = document.getElementById("liteToggle");
if (lt) {
  lt.textContent = LITE ? t("lite_off") : t("lite_on");
  lt.onclick = (e) => { e.preventDefault(); try { localStorage.setItem("techlab_lite", LITE ? "0" : "1"); } catch (x) {} location.reload(); };
}

// первая отрисовка — сразу (из сохранённых данных), не дожидаясь интернета
render(); renderNow();
