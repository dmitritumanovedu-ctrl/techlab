// =====================================================================
//  TechLab · общая «рамка» страниц: меню слева и панель «Сегодня» справа.
//  Подключается одной строкой на любой странице:
//    <body data-shell="start|parent|teacher|demo">  +  data-shell-main у основного блока
//    <script type="module" src="engine/shell.js?v=1"></script>
//  Данные (план недели и объявление учителя) берутся из базы короткими
//  HTTPS-запросами и хранятся на компьютере — панель открывается сразу.
// =====================================================================
import { readDb, cacheGet, cachePut } from "./fbrest.js?v=1";
import { SUBJECTS } from "../tests.js?v=8";
import { LANG, LOCALE, subjName } from "./i18n.js?v=1";
import { getSession, clsKey, SESSION_EVENT } from "./people.js?v=3";

const ROOT = new URL("../", import.meta.url).href;            // корень сайта
const PAGE = document.body.dataset.shell || "start";
const L3 = (ru, ro, en) => ({ ru, ro, en })[LANG] || ru;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const SV = (d, s = 20) => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const IC = {
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
  cal: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>',
  tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  clip: '<path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 2 2L17 9a3 3 0 0 0-4-4l-6.5 6.5a4.5 4.5 0 0 0 6 6L19 11"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.6 1.3c0 1.7-2.1 2-2.1 3.2M12 17h.01"/>',
  par: '<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 20c0-2 1-4 3-4.5"/>',
  tch: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 9l5 3-5 3z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mega: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
};
const COLOR = { geo: "#188038", inf: "#1967d2", tech: "#e37400", math: "#9334e6" };

// ---------- «Знаете ли вы?» — короткий факт дня (меняется раз в сутки) ----------
const FACTS = [
  ["inf", "Слово «бит» — сокращение от английского binary digit, «двоичная цифра».", "Cuvântul „bit” vine din englezescul binary digit — „cifră binară”.", "The word “bit” is short for binary digit."],
  ["geo", "Самая высокая точка Молдовы — холм Бэлэнешть, около 430 метров.", "Cel mai înalt punct al Moldovei este dealul Bălănești, circa 430 de metri.", "Moldova’s highest point is Bălănești Hill, about 430 metres."],
  ["math", "Знак «=» придумал валлийский математик Роберт Рекорд в 1557 году.", "Semnul „=” a fost inventat de matematicianul galez Robert Recorde în 1557.", "The “=” sign was invented by Welsh mathematician Robert Recorde in 1557."],
  ["tech", "«Пиксель» — сокращение от английского picture element, «элемент изображения».", "„Pixel” vine din englezescul picture element — „element de imagine”.", "“Pixel” is short for picture element."],
  ["geo", "Около 71% поверхности Земли покрыто водой.", "Circa 71% din suprafața Pământului este acoperită de apă.", "About 71% of the Earth’s surface is covered by water."],
  ["inf", "В 1947 году в компьютере Mark II нашли настоящую моль — с тех пор ошибки в программах называют «багами».", "În 1947, în calculatorul Mark II a fost găsită o molie adevărată — de atunci erorile se numesc „bug-uri”.", "In 1947 a real moth was found in the Mark II computer — that is why errors are called “bugs”."],
  ["math", "Число делится на 3, если сумма его цифр делится на 3. Проверь на 2026!", "Un număr se divide cu 3 dacă suma cifrelor lui se divide cu 3. Verifică pe 2026!", "A number is divisible by 3 if the sum of its digits is. Try it on 2026!"],
  ["geo", "Байкал — самое глубокое озеро на Земле: более 1600 метров.", "Baikal este cel mai adânc lac de pe Pământ: peste 1600 de metri.", "Lake Baikal is the deepest lake on Earth: over 1,600 metres."],
  ["tech", "Формат PNG сжимает картинку без потерь, а JPEG — с небольшой потерей качества.", "Formatul PNG comprimă imaginea fără pierderi, iar JPEG — cu o mică pierdere de calitate.", "PNG compresses images without loss, while JPEG loses a little quality."],
  ["inf", "1 байт = 8 бит. Одна буква в простом тексте занимает примерно 1 байт.", "1 octet = 8 biți. O literă într-un text simplu ocupă cam 1 octet.", "1 byte = 8 bits. One letter of plain text takes about 1 byte."],
  ["geo", "Население Земли превысило 8 миллиардов человек в ноябре 2022 года.", "Populația Pământului a depășit 8 miliarde de oameni în noiembrie 2022.", "The world’s population passed 8 billion in November 2022."],
  ["math", "Ноль пришёл в европейскую математику из Индии через арабских учёных.", "Zero a ajuns în matematica europeană din India, prin savanții arabi.", "Zero reached European mathematics from India via Arab scholars."],
];

// ---------- данные ----------
let DATA = cacheGet("shell", 3 * 864e5) || { plan: {}, ann: null, cs: null };
async function refresh() {
  if (document.hidden) return;
  try {
    const [plan, ann, cs] = await Promise.all([
      readDb("settings/plan", { tries: 2 }), readDb("settings/announce", { tries: 2 }).catch(() => null),
      getSession() ? readDb("settings/classSubjects", { tries: 2 }).catch(() => null) : Promise.resolve(DATA.cs)]);
    DATA = { plan: plan || {}, ann: ann || null, cs: cs || null };
    cachePut("shell", DATA);
  } catch (e) { /* остаются сохранённые данные */ }
  drawRight();
}

// записи плана → [{d, t, k, s, g}], для ученика — только его класс и его предметы
function events() {
  const me = getSession();
  const myG = me ? String(me.cls).split(" ")[0] : "";
  const mySubj = me && DATA.cs && DATA.cs[clsKey(me.cls)] ? Object.keys(DATA.cs[clsKey(me.cls)]) : null;
  const out = [];
  for (const [key, list] of Object.entries(DATA.plan || {})) {
    const [s, g] = key.split("-");
    if (me && (g !== myG || (mySubj && !mySubj.includes(s)))) continue;
    for (const e of Object.values(list || {})) if (e && e.d) out.push({ ...e, s, g });
  }
  return out.sort((a, b) => (a.d + (a.at || 0)).localeCompare(b.d + (b.at || 0)));
}

// ---------- левое меню ----------
function leftHtml() {
  const hash = location.hash.slice(1);
  const on = (p, h) => (PAGE === p && (h === undefined || h === hash)) ? " on" : "";
  const startOn = (h) => on("start", h);
  const items = [
    [ROOT, IC.home, L3("Главная", "Acasă", "Home"), PAGE === "start" && !["calendar", "tasks", "materials", "help"].includes(hash) ? " on" : ""],
    [ROOT + "#calendar", IC.cal, L3("Календарь", "Calendar", "Calendar"), startOn("calendar")],
    [ROOT + "#tasks", IC.tasks, L3("Мои задания", "Sarcinile mele", "My tasks"), startOn("tasks")],
    [ROOT + "#materials", IC.clip, L3("Материалы", "Materiale", "Materials"), startOn("materials")],
    [ROOT + "#help", IC.help, L3("Как войти", "Cum intru", "How to sign in"), startOn("help")],
    null,
    [ROOT + "parent/", IC.par, L3("Родителям", "Părinților", "Parents"), on("parent")],
    [ROOT + "teacher/", IC.tch, L3("Учителю", "Profesorului", "Teachers"), on("teacher")],
    [ROOT + "demo/", IC.play, L3("Демо-режим", "Mod demo", "Demo"), on("demo")],
  ];
  return `<nav class="sh-nav" aria-label="${L3("Разделы", "Secțiuni", "Sections")}">${items.map((x) => x
    ? `<a class="sh-i${x[3]}" href="${x[0]}">${SV(x[1])}<span>${esc(x[2])}</span></a>` : '<hr>').join("")}</nav>
    <div class="sh-store"><ms-store-badge productid="9PP48L8KF98D" window-mode="direct" theme="dark" language="${LANG}"></ms-store-badge></div>`;
}

// ---------- правая панель «Сегодня» ----------
function drawRight() {
  const box = document.getElementById("shRight");
  if (!box) return;
  const ev = events();
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const wd = (now.getDay() + 6) % 7;                                   // 0 = понедельник
  const mon = new Date(now); mon.setDate(now.getDate() - wd + (wd >= 5 ? 7 : 0));
  const today = iso(now);
  const DAYS = { ru: ["Пн", "Вт", "Ср", "Чт", "Пт"], ro: ["Lu", "Ma", "Mi", "Jo", "Vi"], en: ["Mo", "Tu", "We", "Th", "Fr"] }[LANG] || ["Пн", "Вт", "Ср", "Чт", "Пт"];
  const week = DAYS.map((n, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); const k = iso(d);
    const dots = [...new Set(ev.filter((e) => e.d === k).map((e) => e.s))].slice(0, 3);
    return `<a class="sh-day${k === today ? " today" : ""}" href="${ROOT}#calendar" title="${esc(ev.filter((e) => e.d === k).map((e) => e.t).join(" · "))}">
      <small>${n}</small><b>${d.getDate()}</b><span>${dots.map((s) => `<i style="background:${COLOR[s] || "#1a73e8"}"></i>`).join("")}</span></a>`; }).join("");

  const next = ev.filter((e) => e.d >= today).slice(0, 3);
  const fmtD = (d) => new Date(d + "T12:00").toLocaleDateString(LOCALE, { weekday: "short", day: "2-digit", month: "2-digit" });
  const subjN = (id) => subjName(SUBJECTS.find((x) => x.id === id)) || id;
  const nextHtml = next.length ? next.map((e) => `<div class="sh-dl" style="--c:${COLOR[e.s] || "#1a73e8"}">
      <b>${esc(e.t)}</b><small>${esc(fmtD(e.d))} · ${esc(subjN(e.s))}, ${esc(e.g)}</small></div>`).join("")
    : `<p class="sh-empty">${L3("Ближайших работ в плане нет.", "Nu sunt lucrări planificate în curând.", "No upcoming work planned.")}</p>`;

  const a = DATA.ann;
  const annFresh = a && a.text && (!a.at || Date.now() - a.at < 21 * 864e5);
  const annHtml = annFresh ? `<section class="sh-card sh-ann"><h3>${SV(IC.mega, 18)}${L3("От учителя", "De la profesor", "From the teacher")}</h3>
      <p>${esc(a.text)}</p><small>${a.g ? esc(L3(a.g + " классы", "clasele a " + a.g + "-a", "grade " + a.g)) + " · " : ""}${a.at ? esc(new Date(a.at).toLocaleDateString(LOCALE, { day: "numeric", month: "long" })) : ""}</small></section>` : "";

  const dayNo = Math.floor(Date.now() / 864e5);
  const f = FACTS[dayNo % FACTS.length];
  const fact = { ru: f[1], ro: f[2], en: f[3] }[LANG] || f[1];

  box.innerHTML = `<section class="sh-card"><h3>${SV(IC.cal, 18)}${wd >= 5 ? L3("Следующая неделя", "Săptămâna viitoare", "Next week") : L3("Эта неделя", "Săptămâna aceasta", "This week")}</h3>
      <div class="sh-week">${week}</div></section>
    <section class="sh-card"><h3>${SV(IC.clock, 18)}${L3("Ближайшие сроки", "Termene apropiate", "Coming up")}</h3>${nextHtml}</section>
    ${annHtml}
    <section class="sh-card sh-fact" style="--c:${COLOR[f[0]]}"><h3>${SV(IC.bulb, 18)}${L3("Знаете ли вы?", "Știați că?", "Did you know?")}</h3>
      <p>${esc(fact)}</p><small>${esc(subjN(f[0]))}</small></section>`;
}

// ---------- сборка рамки ----------
function mount() {
  const main = document.querySelector("[data-shell-main]");
  if (!main || document.querySelector(".sh")) return;
  document.body.classList.add("has-shell");
  const sh = document.createElement("div");
  sh.className = "sh sh-" + PAGE;
  sh.innerHTML = `<aside class="sh-l" id="shLeft"></aside><div class="sh-m"></div><aside class="sh-r" id="shRight" aria-label="${L3("Сегодня", "Astăzi", "Today")}"></aside>`;
  main.parentNode.insertBefore(sh, main);
  sh.querySelector(".sh-m").appendChild(main);
  const left = () => { document.getElementById("shLeft").innerHTML = leftHtml(); };
  left(); drawRight();
  addEventListener("hashchange", left);
  window.addEventListener(SESSION_EVENT, () => { drawRight(); refresh(); });
  // официальный значок Microsoft Store (в установленном приложении не нужен)
  if (!matchMedia("(display-mode: standalone)").matches && !document.querySelector('script[src*="ms-store-badge"]')) {
    const s = document.createElement("script"); s.type = "module"; s.src = "https://get.microsoft.com/badge/ms-store-badge.bundled.js";
    document.head.appendChild(s);
  }
  refresh();
  setInterval(refresh, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
