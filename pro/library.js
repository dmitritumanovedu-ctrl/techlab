// =====================================================================
//  TechLab Pro · Библиотека шаблонов
//  Источники: готовые работы сайта (tests.js) + опубликованные тесты Конструктора (pubIndex в Firebase).
//  Фильтры: предмет, класс, тип работы, язык, цена. Поиск по названию и описанию.
// =====================================================================
import { TESTS, SUBJECTS, KINDS } from "../tests.js?v=9";
import { firebaseConfig } from "../firebase-config.js";
import { subjName, kindT, gradeLabel } from "../engine/i18n.js?v=1";
import { LANG, T as BASE, esc, header, footer, boot, TEACHER } from "./pro.js?v=2";

const X = {
ru: { h: "Библиотека шаблонов", p: "Готовые работы для урока: откройте предпросмотр и возьмите себе — копию можно менять.", search: "Поиск: тема, параграф, название…",
  subj: "Предмет", grade: "Класс", kind: "Тип работы", lang: "Язык", price: "Цена", free: "Бесплатно", pro: "Pro", paid: "Цена автора",
  found: (n) => `Найдено: ${n}`, preview: "Предпросмотр", use: "Использовать", by: "TechLab", byB: "Конструктор", reset: "Сбросить фильтры", filters: "Фильтры",
  none: "Ничего не нашлось. Попробуйте убрать часть фильтров.", tasks: "заданий",
  earnH: "Зарабатывайте на своих работах", earnP: "Опубликуйте тест из конструктора кнопкой «Поделиться» — коллеги смогут взять его себе. Продажа по своей цене включится вместе с оплатой картой.", earnB: "Открыть конструктор" },
ro: { h: "Biblioteca de șabloane", p: "Lucrări gata pentru lecție: deschideți previzualizarea și luați-o — copia se poate modifica.", search: "Căutare: temă, paragraf, titlu…",
  subj: "Disciplina", grade: "Clasa", kind: "Tipul lucrării", lang: "Limba", price: "Preț", free: "Gratuit", pro: "Pro", paid: "Prețul autorului",
  found: (n) => `Găsite: ${n}`, preview: "Previzualizare", use: "Folosește", by: "TechLab", byB: "Constructor", reset: "Resetează filtrele", filters: "Filtre",
  none: "Nu s-a găsit nimic. Încercați să scoateți o parte din filtre.", tasks: "itemi",
  earnH: "Câștigați din lucrările dvs.", earnP: "Publicați testul din constructor cu butonul „Partajează” — colegii îl vor putea lua. Vânzarea la prețul dvs. se va activa odată cu plata cu cardul.", earnB: "Deschide constructorul" },
en: { h: "Template library", p: "Ready-made lessons and tests: preview them and take a copy — you can edit your copy.", search: "Search: topic, section, title…",
  subj: "Subject", grade: "Grade", kind: "Type", lang: "Language", price: "Price", free: "Free", pro: "Pro", paid: "Author's price",
  found: (n) => `Found: ${n}`, preview: "Preview", use: "Use", by: "TechLab", byB: "Editor", reset: "Reset filters", filters: "Filters",
  none: "Nothing found. Try removing some filters.", tasks: "tasks",
  earnH: "Earn from your work", earnP: "Publish a test from the editor with “Share” and colleagues can take it. Selling at your own price will switch on together with card payments.", earnB: "Open the editor" },
};
const KIND_COL = { so: ["#FFE3E3", "#8C1D1D"], to: ["#E2E9FF", "#1F3A9E"], sr: ["#FFF1DE", "#7A4300"], pr: ["#DDF4EA", "#145C3E"], quest: ["#EFE5FF", "#4F2A99"],
  blitz: ["#FFF6CC", "#6B5300"], hw: ["#FFF1DE", "#7A4300"], train: ["#E6EDF5", "#33435E"], battle: ["#13213B", "#fff"] };

let ITEMS = [], Q = "", F = { subj: new Set(), grade: new Set(), kind: new Set(), lang: new Set(), price: new Set() }, SHOW_F = false;

function fromSite() {
  return TESTS.filter((t) => t.path).map((t) => ({ id: t.id, src: "site", title: t.title, note: t.note || "", subject: t.subject, grade: String(t.grade || ""),
    kind: t.kind || (t.type === "mission" ? "quest" : "to"), lang: "ru", price: "free",
    preview: `../${t.path}${t.path.includes("?") ? "&" : "?"}preview`, use: TEACHER }));
}
async function fromBuilder() {
  try {
    const r = await fetch(`${firebaseConfig.databaseURL}/pubIndex.json`, { cache: "no-store" });
    const d = r.ok ? await r.json() : null;
    return Object.entries(d || {}).map(([id, x]) => ({ id, src: "builder", title: x.title || "", note: x.n ? `${x.n} · ${x.minutes || ""}′` : "", n: x.n,
      subject: x.subject, grade: String(x.grade || ""), kind: x.kind || "to", lang: x.lang || "ru", price: "free",
      preview: `../b/?t=${encodeURIComponent(id)}&preview`, use: `${TEACHER}builder.html` }));
  } catch (e) { return []; }
}

const subjOf = (id) => SUBJECTS.find((s) => s.id === id);
const kindOf = (id) => kindT(KINDS.find((k) => k.id === id) || KINDS[1]);
const match = (it, skip) => {
  for (const [k, set] of Object.entries(F)) {
    if (k === skip || !set.size) continue;
    const v = k === "subj" ? it.subject : it[k];
    if (!set.has(v)) return false;
  }
  if (Q) { const s = `${it.title} ${it.note} ${subjName(subjOf(it.subject) || { name: "" })}`.toLowerCase(); if (!Q.toLowerCase().split(/\s+/).every((w) => s.includes(w))) return false; }
  return true;
};

function group(key, title, values, label) {
  if (!values.length) return "";
  return `<div><h3>${esc(title)}</h3>${values.map((v) => {
    const n = ITEMS.filter((it) => (key === "subj" ? it.subject : it[key]) === v && match(it, key)).length;
    return `<label class="ck"><input type="checkbox" data-f="${key}" value="${esc(v)}" ${F[key].has(v) ? "checked" : ""}> ${esc(label(v))}<span class="cnt">${n}</span></label>`;
  }).join("")}</div>`;
}

function render() {
  const t = BASE[LANG], x = X[LANG];
  document.title = `${x.h} · TechLab`;
  const uniq = (f) => [...new Set(ITEMS.map(f))].filter(Boolean);
  const subjects = SUBJECTS.map((s) => s.id).filter((id) => ITEMS.some((i) => i.subject === id));
  const grades = uniq((i) => i.grade).sort((a, b) => Number(a) - Number(b));
  const kinds = KINDS.map((k) => k.id).filter((id) => ITEMS.some((i) => i.kind === id));
  const list = ITEMS.filter((it) => match(it));
  const priceLbl = { free: x.free, pro: x.pro, paid: x.paid };
  const card = (it) => {
    const s = subjOf(it.subject) || { icon: "📘", color: "#2747D6", name: it.subject }, k = kindOf(it.kind), [bg, fg] = KIND_COL[k.id] || KIND_COL.to;
    return `<article class="tcard"><div class="tt"><span class="si" style="background:${s.color}22">${s.icon}</span><div class="meta">${esc(subjName(s))} · ${esc(gradeLabel(it.grade))}</div></div>
      <h3>${esc(it.title)}</h3>${it.note ? `<div class="note">${esc(it.note)}</div>` : '<div class="note"></div>'}
      <div class="chips"><span class="chip" style="background:${bg};color:${fg}">${esc(k.short)}</span><span class="chip" style="background:#DDF4EA;color:#145C3E">${esc(priceLbl[it.price])}</span><span class="chip" style="background:#F0F3FA;color:#4A5670">${it.lang.toUpperCase()}</span><span class="chip" style="background:#F0F3FA;color:#4A5670">${esc(it.src === "site" ? x.by : x.byB)}</span></div>
      <div class="acts"><a class="btn g" href="${esc(it.preview)}" target="_blank" rel="noopener">${esc(x.preview)}</a><a class="btn p" href="${esc(it.use)}">${esc(x.use)}</a></div></article>`;
  };
  const any = Object.values(F).some((s) => s.size) || Q;
  document.getElementById("app").innerHTML = `${header(t)}<main>
    <div class="in lib-head"><h1>${esc(x.h)}</h1><p class="sub" style="margin-bottom:20px">${esc(x.p)}</p></div>
    <div class="in lib">
      <aside class="filters${SHOW_F ? " show" : ""}" id="flt" aria-label="${esc(x.filters)}">
        ${group("subj", x.subj, subjects, (v) => subjName(subjOf(v)))}
        ${group("grade", x.grade, grades, (v) => gradeLabel(v))}
        ${group("kind", x.kind, kinds, (v) => kindOf(v).short)}
        ${group("lang", x.lang, ["ru", "ro", "en"], (v) => ({ ru: "Русский", ro: "Română", en: "English" }[v]))}
        ${group("price", x.price, ["free", "pro", "paid"], (v) => priceLbl[v])}
        ${any ? `<button type="button" class="btn g" id="reset">${esc(x.reset)}</button>` : ""}
      </aside>
      <div>
        <div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6782" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input id="q" type="search" value="${esc(Q)}" placeholder="${esc(x.search)}" aria-label="${esc(x.search)}"><button type="button" class="btn g flt-btn" id="fltB">${esc(x.filters)}</button></div>
        <p class="found" aria-live="polite">${esc(x.found(list.length))}</p>
        ${list.length ? `<div class="cards">${list.map(card).join("")}</div>` : `<div class="empty">${esc(x.none)}</div>`}
        <section class="earn"><div><h2>${esc(x.earnH)}</h2><p>${esc(x.earnP)}</p></div><a class="btn w" href="${TEACHER}builder.html">${esc(x.earnB)}</a></section>
      </div>
    </div></main>${footer(t)}`;

  document.querySelectorAll("[data-f]").forEach((c) => c.onchange = () => { const s = F[c.dataset.f]; c.checked ? s.add(c.value) : s.delete(c.value); render(); });
  const q = document.getElementById("q");
  q.oninput = () => { Q = q.value.trim(); const pos = q.selectionStart; render(); const n = document.getElementById("q"); n.focus(); n.setSelectionRange(pos, pos); };
  document.getElementById("fltB").onclick = () => { SHOW_F = !SHOW_F; render(); };
  const r = document.getElementById("reset"); if (r) r.onclick = () => { Object.values(F).forEach((s) => s.clear()); Q = ""; render(); };
}
render.reload = true;   // язык библиотеки берётся из общего модуля сайта — при смене языка перезагружаем страницу

ITEMS = fromSite();
boot(render);
fromBuilder().then((b) => { if (b.length) { ITEMS = ITEMS.concat(b); render(); } });
