// =====================================================================
//  TechLab · Тренажёры «Делимость» · Математика, 5 класс · страница ученика
//  Один файл на все 10 вариантов: math5/div/?v=1 … ?v=10
//  Каждый вариант — миссия экспедиции «math5-div» в tests.js (id: math5-div-t1 … t10).
//  Результат пишется в results/<id> так же, как у миссий: name, cls, score{q1…}, stage, status.
//  Учитель видит баллы по каждому заданию в Центре управления, оценка попадает ученику и родителю.
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, set, update, get, serverTimestamp } from "../../engine/rtdb.js?v=1";
import { firebaseConfig } from "../../firebase-config.js";
import { getSession } from "../../engine/people.js?v=3";
import { VARIANTS } from "./data.js?v=1";
import { isStaffPreview } from "../../engine/preview-auth.js?v=1";

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// **жирный**, _{индекс}, ^{степень}
const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/_\{(.+?)\}/g, "<sub>$1</sub>").replace(/\^\{(.+?)\}/g, "<sup>$1</sup>");
const plain = (s) => String(s).replace(/\*\*/g, "").replace(/_\{(.+?)\}/g, "$1").replace(/\^\{(.+?)\}/g, "^$1");
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Баллы за задание: простые — 1, составные — 2 (1 балл, если ровно одна ошибка)
const MAXP = { choice: 1, tf: 1, num: 1, multi: 2, set: 2, order: 2, bins: 2, match: 2 };
const TYPE = { choice: "Выбери один ответ", multi: "Выбери все верные ответы", tf: "Верно или неверно?", num: "Введи число",
  set: "Запиши множество", order: "Расставь по порядку (перетаскивание)", bins: "Разложи по группам (перетаскивание)", match: "Соотнеси" };
// Шкала — та же, что у миссий TechLab (engine/sync.js, engine/teacher.js)
const MSCALE = [[95, 10], [85, 9], [75, 8], [65, 7], [55, 6], [45, 5], [35, 4], [25, 3], [15, 2], [0, 1]];
const markOf = (pct) => { for (const [p, g] of MSCALE) if (pct >= p) return g; return 1; };
const MOODS = [["🟢", "Мне всё понятно, могу объяснить другу"], ["🟡", "Понятно, но есть вопросы"], ["🔴", "Нужна помощь"]];
const maxOf = (v) => v.questions.reduce((a, q) => a + MAXP[q.t], 0);

const V = VARIANTS.find((x) => x.id === Number(new URLSearchParams(location.search).get("v")));
const WORK_ID = V ? `math5-div-t${V.id}` : null;
const LS = V ? `techlab_math5_div_t${V.id}` : null;      // черновик (engine/guard.js стирает его, если вошёл другой ученик)
let ME = getSession();
let PREVIEW = false;      // «просмотр учителя» (?preview): без кода, без записи в базу

let db = null;
try { db = getDatabase(initializeApp(firebaseConfig)); } catch (e) { console.warn(e); }

// ---------- черновик на этом компьютере ----------
let S = null;   // { name, cls, rec, order[], i, score{}, wrong[], streak, best, startedAt, done, sent, mood }
const save = () => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} };
const load = () => { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { return null; } };

// ---------- связь с базой ----------
const P = WORK_ID ? `results/${WORK_ID}` : "";
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
async function isOpen() { if (PREVIEW) return true; return !!(await withTimeout(get(ref(db, `settings/${WORK_ID}/open`)), 12000)).val(); }
async function startRecord() {
  if (PREVIEW) return "";
  const r = push(ref(db, P));
  await withTimeout(set(r, { name: ME.name, cls: ME.cls, status: "in_progress", stage: "Задание 1", score: {}, startedAt: Date.now(), updatedAt: serverTimestamp() }), 15000);
  return r.key;
}
function progress() {
  if (!S.rec) return;
  update(ref(db, `${P}/${S.rec}`), { score: S.score, log: S.log || null, stage: `Задание ${Math.min(S.i + 1, S.order.length)} из ${S.order.length}`, doneCount: S.i, updatedAt: serverTimestamp() }).catch(() => {});
}
const totals = () => {
  const max = maxOf(V), pts = Object.values(S.score).reduce((a, x) => a + (Number(x) || 0), 0);
  const pct = Math.min(100, Math.round(pts / max * 100));
  return { pts, max, pct, grade: markOf(pct) };
};
async function submit() {
  if (PREVIEW || !S.rec) return;
  const t = totals();
  const minutes = Math.max(1, Math.round((Date.now() - S.startedAt) / 60000));
  await withTimeout(update(ref(db, `${P}/${S.rec}`), { score: S.score, log: S.log || null, points: t.pts, max: t.max, percent: t.pct, grade: t.grade, minutes,
    stage: "Финиш", doneCount: S.order.length, status: "submitted", submittedAt: Date.now(), updatedAt: serverTimestamp() }), 20000);
}

// =====================================================================
//  Экраны
// =====================================================================
init();
async function init() {
  if (await isStaffPreview()) { PREVIEW = true; ME = { name: "Просмотр Учителя", cls: "—" }; try { localStorage.removeItem(LS); } catch (e) {} }
  if (!V) return showList();
  $("#hWho").textContent = (ME ? ME.name + " · " + ME.cls + " · " : "") + "Вариант " + V.id;
  if (!ME) return showNoLogin();
  const d = load();
  if (d && d.name === ME.name && Date.now() - (d.startedAt || 0) < 12 * 3600e3) {
    S = d;
    if (!S.done) return showResume();
    return showIntro(true);
  }
  showIntro(false);
}

// ---------- список вариантов (если открыли math5/div/ без ?v=) ----------
function showList() {
  $("#hWho").textContent = (ME ? ME.name + " · " + ME.cls + " · " : "") + "Глава 3 «Делимость»";
  const best = (v) => { try { const d = JSON.parse(localStorage.getItem(`techlab_math5_div_t${v.id}`) || "null"); return d && d.done && ME && d.name === ME.name ? d.pct : null; } catch (e) { return null; } };
  app.innerHTML = `<div class="card"><div class="tr-ribbon">🎯 Тренажёры · математика 5</div>
    <h2>Делимость: 10 тренажёров</h2>
    <p class="muted">Каждый вариант — отдельный модуль главы 3. Сначала короткая теория, потом задания с мгновенной проверкой и объяснением.
      Вариант открывается, когда его откроет учитель.</p></div>
    <div class="tr-grid">${VARIANTS.map((v) => { const b = best(v); return `<a class="tr-v${v.id === 10 ? " fin" : ""}" href="?v=${v.id}${PREVIEW ? "&preview=1" : ""}">
      <div class="cv"><div class="n">Вариант ${v.id}</div><div class="m">${fmt(v.module)}</div></div>
      <div class="b"><div class="t">${fmt(v.title)}</div><div class="s">${v.questions.length} заданий · ${maxOf(v)} баллов${b != null ? ` · последний результат: <b>${b}%</b>` : ""}</div></div></a>`; }).join("")}</div>`;
}

function showNoLogin() {
  app.innerHTML = `<div class="card center"><div class="tr-ribbon">🎯 Тренажёр · вариант ${V.id}</div>
    <h2>Войди по своему коду</h2>
    <p>Тренажёры открываются только по <b>личному коду ученика</b> — так результат попадёт в твою комнату и к учителю.</p>
    <p class="muted">Открой стартовую страницу TechLab, введи код и вернись сюда.</p>
    <a class="btn" href="../../">На стартовую страницу</a></div>`;
}

function introHtml() {
  const kinds = [...new Set(V.questions.map((q) => q.t))];
  const short = { choice: "выбор ответа", multi: "несколько ответов", tf: "верно/неверно", num: "ввод числа", set: "ввод множества", order: "перетаскивание: порядок", bins: "перетаскивание: группы", match: "соотнесение" };
  return `<div class="tr-mod">${fmt(V.module)}</div>
    <h2>Вариант ${V.id}. ${fmt(V.title)}</h2>
    <div class="muted" style="font-size:14px">${fmt(V.pages)}</div>
    <div class="tr-theory"><h3>Коротко о главном</h3><ul>${V.theory.map((t) => `<li>${fmt(t)}</li>`).join("")}</ul></div>
    <div class="tr-plan"><span>${V.questions.length} заданий</span><span>${maxOf(V)} баллов</span>${kinds.map((k) => `<span>${short[k]}</span>`).join("")}</div>
    <p class="muted" style="font-size:14px">Простые задания — 1 балл, составные — 2 балла (1 балл, если ровно одна ошибка). После каждого ответа — объяснение.
      Перетаскивать можно мышью или пальцем — или нажми на фишку, а потом на место, куда её поставить.</p>`;
}

function showIntro(hasResult) {
  app.innerHTML = `<div class="card tr-wide"><div class="tr-ribbon">🎯 Тренажёр · математика 5</div>${introHtml()}
    ${hasResult && S ? `<p>Твой последний результат: <b>${S.pts} из ${S.max}</b> (${S.pct}%), отметка <b>${S.grade}</b>.</p>` : ""}
    <div class="err" id="err"></div>
    <div class="tr-actions"><button class="btn" id="go">${hasResult ? "Пройти ещё раз" : "Начать"}</button>
      <a class="btn ghost" href="./">Все варианты</a></div></div>`;
  $("#go").onclick = begin;
}

function showResume() {
  app.innerHTML = `<div class="card tr-wide"><div class="tr-ribbon">🎯 Тренажёр · математика 5</div>${introHtml()}
    <p><b>У тебя есть незаконченная попытка:</b> выполнено ${S.i} из ${S.order.length} заданий.</p>
    <div class="tr-actions"><button class="btn" id="cont">Продолжить</button><button class="btn ghost" id="again">Начать заново</button></div></div>`;
  $("#cont").onclick = () => question();
  $("#again").onclick = begin;
}

async function begin() {
  const b = $("#go") || $("#again"); const err = $("#err");
  if (b) { b.disabled = true; b.textContent = "Подключение…"; }
  try {
    if (!db) throw new Error("no db");
    if (!(await isOpen())) {
      if (b) { b.disabled = false; b.textContent = "Начать"; }
      if (err) err.textContent = "Этот тренажёр ещё не открыт учителем. Подожди и нажми ещё раз.";
      else app.insertAdjacentHTML("afterbegin", `<div class="card center err">Этот тренажёр ещё не открыт учителем.</div>`);
      return;
    }
    const rec = await startRecord();
    S = { name: ME.name, cls: ME.cls, rec, order: shuffle(V.questions.map((_, k) => k)), i: 0, score: {}, wrong: [], streak: 0, best: 0,
      startedAt: Date.now(), done: false, sent: false, mood: "" };
    save(); question();
  } catch (e) {
    console.error(e);
    if (b) { b.disabled = false; b.textContent = "Начать"; }
    const m = /permission|denied/i.test(String(e?.code || e?.message)) ? "Нет доступа к базе. Сообщи учителю." : "Нет связи с сервером. Проверь интернет и нажми ещё раз.";
    if (err) err.textContent = m;
  }
}

// =====================================================================
//  Задание
// =====================================================================
let R = null;          // текущее задание: { q, k, answer, checked, retry }
let RETRY = null;      // работа над ошибками: { list[], i, ok }

function headerScore() {
  const h = $("#hScore"); if (!S || RETRY) { h.hidden = true; return; }
  const t = totals(); h.hidden = false; h.textContent = `${t.pts} / ${t.max}`;
}

function question() {
  const retry = !!RETRY;
  const k = retry ? RETRY.list[RETRY.i] : S.order[S.i];
  const q = V.questions[k];
  const n = retry ? RETRY.list.length : S.order.length, idx = retry ? RETRY.i : S.i;
  R = { q, k, answer: null, checked: false, retry };
  headerScore();
  app.innerHTML = `<div class="card">
    <div class="tr-top"><span class="tr-meta">${retry ? "Работа над ошибками · " : ""}Задание ${idx + 1} из ${n}</span>
      <div class="tr-prog"><i style="width:${Math.round(idx / n * 100)}%"></i></div>
      <span class="tr-streak">${!retry && S.streak >= 2 ? "🔥 " + S.streak + " подряд" : ""}</span></div>
    <span class="tr-type">${TYPE[q.t]}</span>${retry ? "" : `<span class="tr-pts">${MAXP[q.t]} ${MAXP[q.t] === 1 ? "балл" : "балла"}</span>`}
    <div class="tr-q">${fmt(q.q)}</div>
    <div id="area"></div>
    <div class="tr-fb" id="fb"></div>
    <div class="tr-actions"><button class="btn" id="bCheck">Проверить</button>
      ${retry ? `<button class="btn ghost" id="bStop">Закончить</button>` : ""}</div></div>`;
  RENDER[q.t](q, $("#area"));
  $("#bCheck").onclick = () => (R.checked ? next() : check());
  if (retry) $("#bStop").onclick = () => { RETRY = null; showResult(); };
  window.scrollTo(0, 0);
}

// ---------- перетаскивание: мышь, палец или «нажми — нажми» ----------
let drag = null, picked = null;
function draggable(chip, onDrop, onTap) {
  chip.addEventListener("pointerdown", (ev) => {
    if (R.checked || ev.button > 0) return;
    ev.preventDefault();
    const r = chip.getBoundingClientRect();
    drag = { chip, sx: ev.clientX, sy: ev.clientY, dx: ev.clientX - r.left, dy: ev.clientY - r.top, moved: false, ghost: null, over: null };
    try { chip.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  chip.addEventListener("pointermove", (ev) => {
    if (!drag || drag.chip !== chip) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      const g = chip.cloneNode(true); g.classList.add("tr-ghost"); g.classList.remove("picked");
      g.style.width = chip.offsetWidth + "px"; document.body.appendChild(g); drag.ghost = g; chip.style.opacity = ".35";
    }
    drag.ghost.style.left = ev.clientX - drag.dx + "px"; drag.ghost.style.top = ev.clientY - drag.dy + "px";
    const t = targetAt(ev.clientX, ev.clientY);
    if (drag.over && drag.over !== t) drag.over.classList.remove("over");
    if (t) t.classList.add("over"); drag.over = t;
  });
  const end = (ev, cancel) => {
    if (!drag || drag.chip !== chip) return;
    const d = drag; drag = null;
    if (d.over) d.over.classList.remove("over");
    if (d.ghost) { d.ghost.remove(); chip.style.opacity = ""; if (!cancel) { const t = targetAt(ev.clientX, ev.clientY); if (t) onDrop(chip, t); } return; }
    if (cancel) return;
    if (onTap && onTap(chip)) return;                     // нажатие без движения
    if (picked === chip) { chip.classList.remove("picked"); picked = null; }
    else { if (picked) picked.classList.remove("picked"); picked = chip; chip.classList.add("picked"); }
  };
  chip.addEventListener("pointerup", (ev) => end(ev, false));
  chip.addEventListener("pointercancel", (ev) => end(ev, true));
}
function targetAt(x, y) { const el = document.elementFromPoint(x, y); return el ? el.closest("[data-drop]") : null; }

const RENDER = {
  choice(q, el) {
    const ord = shuffle(q.o.map((_, i) => i));
    el.innerHTML = `<div class="tr-opts">${ord.map((i) => `<button type="button" class="tr-opt" data-i="${i}"><span class="mk"></span><span>${fmt(q.o[i])}</span></button>`).join("")}</div>`;
    el.querySelectorAll(".tr-opt").forEach((b) => (b.onclick = () => { if (R.checked) return;
      el.querySelectorAll(".tr-opt").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); R.answer = +b.dataset.i; }));
  },
  multi(q, el) {
    const ord = shuffle(q.o.map((_, i) => i));
    el.innerHTML = `<div class="tr-opts${q.o.every((o) => o.length <= 8) ? " short" : ""}">${ord.map((i) => `<button type="button" class="tr-opt sq" data-i="${i}"><span class="mk"></span><span>${fmt(q.o[i])}</span></button>`).join("")}</div>`;
    R.answer = new Set();
    el.querySelectorAll(".tr-opt").forEach((b) => (b.onclick = () => { if (R.checked) return;
      const i = +b.dataset.i; if (R.answer.has(i)) { R.answer.delete(i); b.classList.remove("sel"); } else { R.answer.add(i); b.classList.add("sel"); } }));
  },
  tf(q, el) {
    el.innerHTML = `<div class="tr-tf"><button type="button" class="tr-opt" data-v="1"><span class="mk"></span>Верно</button><button type="button" class="tr-opt" data-v="0"><span class="mk"></span>Неверно</button></div>`;
    el.querySelectorAll(".tr-opt").forEach((b) => (b.onclick = () => { if (R.checked) return;
      el.querySelectorAll(".tr-opt").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); R.answer = b.dataset.v === "1"; }));
  },
  num(q, el) {
    el.innerHTML = `<input type="text" class="tr-inp" id="inp" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="Ответ"><div class="tr-hint">Одно число. Нажми «Проверить» или Enter.</div>`;
    const i = $("#inp"); i.focus(); i.onkeydown = (e) => { if (e.key === "Enter") $("#bCheck").click(); };
  },
  set(q, el) {
    el.innerHTML = `<input type="text" class="tr-inp" id="inp" autocomplete="off" maxlength="120" placeholder="например: 1, 2, 4, 8"><div class="tr-hint">Числа через запятую, в любом порядке. Фигурные скобки можно не ставить.</div>`;
    const i = $("#inp"); i.focus(); i.onkeydown = (e) => { if (e.key === "Enter") $("#bCheck").click(); };
  },
  order(q, el) {
    let cur = shuffle(q.items.map((_, i) => i));
    while (q.items.length > 1 && cur.every((x, i) => x === i)) cur = shuffle(cur);
    const line = q.items.every((t) => plain(t).length <= 4);
    const draw = () => {
      R.answer = cur.slice(); picked = null;
      el.innerHTML = line
        ? `<div class="tr-oline">${cur.map((k, p) => `<span class="tr-chip" data-drop="1" data-p="${p}">${fmt(q.items[k])}</span>`).join("")}</div>
           <div class="tr-hint">Перетащи фишку на место другой — или нажми на одну фишку, потом на другую, чтобы поменять их местами.</div>`
        : `<div class="tr-olist">${cur.map((k, p) => `<div class="tr-oi" data-drop="1" data-p="${p}"><span class="no">${p + 1}.</span><span class="tr-chip">${fmt(q.items[k])}</span>
             <span class="ar"><button type="button" data-up="${p}" ${p === 0 ? "disabled" : ""} aria-label="Выше">▲</button><button type="button" data-dn="${p}" ${p === cur.length - 1 ? "disabled" : ""} aria-label="Ниже">▼</button></span></div>`).join("")}</div>
           <div class="tr-hint">Перетащи строку или используй стрелки ▲▼.</div>`;
      el.querySelectorAll("[data-up]").forEach((b) => (b.onclick = () => { if (R.checked) return; const p = +b.dataset.up; [cur[p - 1], cur[p]] = [cur[p], cur[p - 1]]; draw(); }));
      el.querySelectorAll("[data-dn]").forEach((b) => (b.onclick = () => { if (R.checked) return; const p = +b.dataset.dn; [cur[p + 1], cur[p]] = [cur[p], cur[p + 1]]; draw(); }));
      el.querySelectorAll(".tr-chip").forEach((ch) => {
        const from = +(ch.dataset.p ?? ch.closest("[data-p]").dataset.p);
        draggable(ch, (c, t) => { const to = +t.dataset.p; if (to === from) return; const [x] = cur.splice(from, 1); cur.splice(to, 0, x); draw(); },
          () => {
            if (picked && picked !== ch && picked.isConnected) {
              const a = +(picked.dataset.p ?? picked.closest("[data-p]").dataset.p);
              [cur[a], cur[from]] = [cur[from], cur[a]]; draw(); return true;
            }
            return false;
          });
      });
    };
    draw();
  },
  bins(q, el) {
    const where = q.items.map(() => -1);
    R.answer = where;
    el.innerHTML = `<div class="tr-pool" data-drop="1" data-b="-1"></div>
      <div class="tr-bins">${q.b.map((nm, bi) => `<div class="tr-bin" data-drop="1" data-b="${bi}"><h4>${fmt(nm)}</h4><div class="dz"></div></div>`).join("")}</div>
      <div class="tr-hint">Перетащи каждую фишку в нужную группу — или нажми на фишку, потом на группу.</div>`;
    const place = (chip, b) => { where[+chip.dataset.k] = b; (b < 0 ? $(".tr-pool", el) : $(`.tr-bin[data-b="${b}"] .dz`, el)).appendChild(chip); };
    shuffle(q.items.map((_, i) => i)).forEach((k) => {
      const c = document.createElement("span"); c.className = "tr-chip"; c.dataset.k = k; c.innerHTML = fmt(q.items[k][0]);
      $(".tr-pool", el).appendChild(c);
      draggable(c, (chip, t) => place(chip, +t.dataset.b));
    });
    el.querySelectorAll("[data-drop]").forEach((t) => t.addEventListener("click", (e) => {
      if (R.checked || !picked || e.target.closest(".tr-chip")) return;
      picked.classList.remove("picked"); place(picked, +t.dataset.b); picked = null;
    }));
  },
  match(q, el) {
    const ord = shuffle(q.r.map((_, i) => i));
    el.innerHTML = `<div class="tr-match">${q.l.map((l, li) => `<div class="l">${fmt(l)}</div>
      <select data-l="${li}"><option value="">— выбери —</option>${ord.map((ri) => `<option value="${ri}">${esc(plain(q.r[ri]))}</option>`).join("")}</select>`).join("")}</div>`;
    R.answer = q.l.map(() => null);
    el.querySelectorAll("select").forEach((s) => (s.onchange = () => { R.answer[+s.dataset.l] = s.value === "" ? null : +s.value; }));
  },
};

// ---------- проверка ----------
const numsSpaced = (s) => (String(s).match(/\d[\d ]*/g) || []).map((x) => parseInt(x.replace(/ /g, ""), 10)).filter(Number.isFinite);   // «3 050» = 3050
const numsSet = (s) => (String(s).match(/\d+/g) || []).map((x) => parseInt(x, 10));                                                         // любые разделители
const by2 = (errors) => (errors === 0 ? 2 : errors === 1 ? 1 : 0);

function evaluate(q, el) {
  // возвращает { ready, pts, key }  (key — правильный ответ текстом)
  switch (q.t) {
    case "choice": {
      if (R.answer === null) return { ready: false };
      el.querySelectorAll(".tr-opt").forEach((b) => { const i = +b.dataset.i; b.disabled = true; if (i === q.a) b.classList.add("ok"); else if (i === R.answer) b.classList.add("bad"); });
      return { ready: true, pts: R.answer === q.a ? 1 : 0, key: q.o[q.a] };
    }
    case "tf": {
      if (R.answer === null) return { ready: false };
      el.querySelectorAll(".tr-opt").forEach((b) => { const v = b.dataset.v === "1"; b.disabled = true; if (v === q.a) b.classList.add("ok"); else if (v === R.answer) b.classList.add("bad"); });
      return { ready: true, pts: R.answer === q.a ? 1 : 0, key: q.a ? "Верно" : "Неверно" };
    }
    case "multi": {
      if (!R.answer.size) return { ready: false };
      const need = new Set(q.a);
      const errors = [...need].filter((i) => !R.answer.has(i)).length + [...R.answer].filter((i) => !need.has(i)).length;
      el.querySelectorAll(".tr-opt").forEach((b) => { const i = +b.dataset.i; b.disabled = true; if (need.has(i)) b.classList.add("ok"); else if (R.answer.has(i)) b.classList.add("bad"); });
      return { ready: true, pts: by2(errors), key: q.a.map((i) => q.o[i]).join("; ") };
    }
    case "num": {
      const inp = $("#inp"), v = numsSpaced(inp.value);
      if (!v.length) return { ready: false };
      const pts = v.length === 1 && v[0] === q.a ? 1 : 0;
      inp.disabled = true; inp.classList.add(pts ? "ok" : "bad");
      return { ready: true, pts, key: String(q.a) };
    }
    case "set": {
      const inp = $("#inp");
      if (!inp.value.trim()) return { ready: false };
      const given = new Set(numsSet(inp.value)), need = new Set(q.a);
      const errors = [...need].filter((x) => !given.has(x)).length + [...given].filter((x) => !need.has(x)).length;
      const pts = by2(errors);
      inp.disabled = true; inp.classList.add(pts === 2 ? "ok" : pts ? "part" : "bad");
      return { ready: true, pts, key: "{" + q.a.slice().sort((a, b) => a - b).join(", ") + "}" };
    }
    case "order": {
      const mis = R.answer.filter((k, p) => k !== p).length;          // одна перестановка двух соседей = 2 ошибочных места
      el.querySelectorAll(".tr-chip").forEach((c, p) => c.classList.add(R.answer[p] === p ? "ok" : "bad"));
      el.querySelectorAll("button").forEach((b) => (b.disabled = true));
      const sep = q.items.every((t) => t.length === 1) ? "" : q.items.every((t) => plain(t).length <= 4) ? ", " : " → ";
      return { ready: true, pts: mis === 0 ? 2 : mis <= 2 ? 1 : 0, key: q.items.join(sep) };
    }
    case "bins": {
      if (R.answer.some((b) => b < 0)) return { ready: false, msg: "Разложи все фишки по группам." };
      const errors = q.items.filter((it, k) => R.answer[k] !== it[1]).length;
      el.querySelectorAll(".tr-chip").forEach((c) => { const k = +c.dataset.k; c.classList.add(R.answer[k] === q.items[k][1] ? "ok" : "bad"); });
      return { ready: true, pts: by2(errors), key: q.b.map((nm, bi) => nm + ": " + q.items.filter((it) => it[1] === bi).map((it) => it[0]).join(", ")).join(" | ") };
    }
    case "match": {
      if (R.answer.some((a) => a === null)) return { ready: false, msg: "Выбери пару для каждой строки." };
      const errors = R.answer.filter((r, li) => r !== q.a[li]).length;
      el.querySelectorAll("select").forEach((s) => { const li = +s.dataset.l; s.disabled = true; s.classList.add(R.answer[li] === q.a[li] ? "ok" : "bad"); });
      return { ready: true, pts: by2(errors), key: q.l.map((l, li) => l + " — " + q.r[q.a[li]]).join("; ") };
    }
  }
  return { ready: false };
}

// ответ ученика текстом — для разбора и PDF (учитель, ученик, родитель)
function answerText(q) {
  const a = R.answer, inp = document.getElementById("inp");
  switch (q.t) {
    case "choice": return a === null ? "" : plain(q.o[a]);
    case "tf": return a === null ? "" : a ? "Верно" : "Неверно";
    case "multi": return [...(a || [])].sort((x, y) => x - y).map((i) => plain(q.o[i])).join("; ");
    case "num": case "set": return inp ? inp.value.trim() : "";
    case "order": return (a || []).map((k) => plain(q.items[k])).join(" → ");
    case "bins": return q.b.map((nm, bi) => nm + ": " + q.items.filter((_, k) => a?.[k] === bi).map((it) => plain(it[0])).join(", ")).join(" | ");
    case "match": return q.l.map((l, li) => plain(l) + " — " + (a?.[li] == null ? "?" : plain(q.r[a[li]]))).join("; ");
  }
  return "";
}
const cutT = (x, n) => { x = String(x || ""); return x.length > n ? x.slice(0, n - 1) + "…" : x; };

function check() {
  const q = R.q, fb = $("#fb");
  const res = evaluate(q, $("#area"));
  if (!res.ready) { fb.className = "tr-fb bad"; fb.innerHTML = `<span class="h">Сначала дай ответ.</span>${res.msg ? esc(res.msg) : ""}`; return; }
  R.checked = true;
  const max = MAXP[q.t], full = res.pts === max;
  if (R.retry) { if (full) RETRY.ok++; }
  else {
    S.score["q" + (R.k + 1)] = res.pts;
    (S.log = S.log || {})["q" + (R.k + 1)] = { l: cutT(plain(q.q), 220), a: cutT(answerText(q), 300), k: cutT(plain(res.key), 300), c: cutT(plain(q.e), 300) };
    if (full) { S.streak++; S.best = Math.max(S.best, S.streak); } else { S.streak = 0; S.wrong.push(R.k); }
    S.i++; save(); progress(); headerScore();
  }
  const praise = ["Верно!", "Правильно!", "Отлично!", "Так держать!", "Молодец!"];
  fb.className = "tr-fb " + (full ? "ok" : res.pts > 0 ? "part" : "bad");
  fb.innerHTML = `<span class="h">${full ? praise[Math.floor(Math.random() * praise.length)] : res.pts > 0 ? `Почти! ${res.pts} из ${max} баллов — одна ошибка.` : "Неверно."}</span>
    ${full ? "" : `<div>Правильный ответ: <b>${fmt(res.key)}</b></div>`}<div>${fmt(q.e)}</div>`;
  const last = R.retry ? RETRY.i >= RETRY.list.length - 1 : S.i >= S.order.length;
  $("#bCheck").textContent = last ? "Результат" : "Дальше →";
  $("#bCheck").focus();
}

function next() {
  if (R.retry) { RETRY.i++; return RETRY.i < RETRY.list.length ? question() : showRetryDone(); }
  if (S.i < S.order.length) return question();
  finish();
}

// =====================================================================
//  Итог
// =====================================================================
async function finish() {
  const t = totals();
  Object.assign(S, { done: true, pts: t.pts, max: t.max, pct: t.pct, grade: t.grade }); save();
  showResult();
  await sendResult();
}
async function sendResult() {
  const box = $("#sent"); if (box) { box.className = "tr-sent"; box.textContent = "⏳ Отправляю результат учителю…"; }
  try { await submit(); S.sent = true; save(); }
  catch (e) { console.error(e); S.sent = false; save(); }
  paintSent();
}
function paintSent() {
  const box = $("#sent"); if (!box) return;
  if (S.sent) { box.className = "tr-sent ok"; box.textContent = "✓ Результат отправлен учителю"; }
  else { box.className = "tr-sent bad"; box.innerHTML = `Не получилось отправить результат. Проверь интернет. <button class="btn small" id="bResend">Отправить ещё раз</button>`; $("#bResend").onclick = sendResult; }
}

function showResult() {
  headerScore();
  const stars = S.pct >= 90 ? 3 : S.pct >= 60 ? 2 : S.pct >= 30 ? 1 : 0;
  const msg = S.pct === 100 ? "Безупречно! Все задания решены верно." : S.pct >= 85 ? "Очень хорошо! До идеала совсем чуть-чуть."
    : S.pct >= 60 ? "Хорошо, но есть над чем поработать." : "Повтори правила и пройди работу над ошибками.";
  const wrong = [...new Set(S.wrong)];
  app.innerHTML = `<div class="card tr-wide tr-res">
    <div class="tr-mod">${fmt(V.module)}</div>
    <h2>Вариант ${V.id} пройден</h2>
    <div class="muted">Отметка по 10-балльной шкале</div>
    <div class="tr-mark">${S.grade}</div>
    <div class="tr-stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>
    <div class="tr-stats"><div><b>${S.pts} из ${S.max}</b>баллов</div><div><b>${S.pct}%</b>результат</div><div><b>${S.best}</b>лучшая серия</div></div>
    <p>${msg}</p>
    <div class="tr-sent" id="sent"></div>
    <p class="muted" style="margin:14px 0 4px">Как тебе тренажёр?</p>
    <div class="tr-mood">${MOODS.map((m) => `<button type="button" data-m="${esc(m[1])}" aria-pressed="${S.mood === m[1]}">${m[0]} ${esc(m[1])}</button>`).join("")}</div>
    <div class="tr-actions" style="justify-content:center">
      ${wrong.length ? `<button class="btn" id="bFix" style="background:#E08A1E">Работа над ошибками (${wrong.length})</button>` : ""}
      <button class="btn ghost" id="bAgain">Пройти заново</button><a class="btn ghost" href="./">Все варианты</a></div>
    ${wrong.length ? `<div class="tr-errs"><h3>Где были ошибки</h3>${wrong.map((k) => { const q = V.questions[k]; return `<div class="e"><div class="q">${fmt(q.q)}</div>
      <div class="k">Твой балл: ${S.score["q" + (k + 1)] ?? 0} из ${MAXP[q.t]}</div><div class="x">${fmt(q.e)}</div></div>`; }).join("")}</div>` : ""}
  </div>`;
  paintSent();
  app.querySelectorAll(".tr-mood button").forEach((b) => (b.onclick = () => {
    S.mood = b.dataset.m; save();
    app.querySelectorAll(".tr-mood button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    if (S.rec && db) update(ref(db, `${P}/${S.rec}`), { mood: S.mood, updatedAt: serverTimestamp() }).catch(() => {});
  }));
  if ($("#bFix")) $("#bFix").onclick = () => { RETRY = { list: shuffle(wrong), i: 0, ok: 0 }; question(); };
  $("#bAgain").onclick = () => showIntro(true);
}

function showRetryDone() {
  const n = RETRY.list.length, ok = RETRY.ok; RETRY = null; headerScore();
  app.innerHTML = `<div class="card center tr-res"><div class="tr-ribbon">Работа над ошибками</div>
    <h2>${ok === n ? "Все ошибки исправлены!" : "Работа над ошибками завершена"}</h2>
    <p>Решено верно: <b>${ok} из ${n}</b>.</p>
    <p class="muted">Отметка за вариант не меняется — она ставится по первой попытке. Чтобы улучшить отметку, пройди вариант заново.</p>
    <div class="tr-actions" style="justify-content:center"><button class="btn" id="bBack">К результату</button><a class="btn ghost" href="./">Все варианты</a></div></div>`;
  $("#bBack").onclick = showResult;
}
