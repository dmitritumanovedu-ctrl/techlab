// Практическая работа № 1 · страница ученика
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, set, update, get, onValue, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "../../firebase-config.js";
import { WORK, VARIANTS, QUESTIONS, qText, CALC_FIELDS } from "./data.js?v=1";

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const LS_KEY = "techlab_attempt_" + WORK.id;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (x) => String(x).replace(".", ",");

const db = getDatabase(initializeApp(firebaseConfig));
const P = `results/${WORK.id}`;

let S = null;            // { id, name, cls, variant, deadline, answers, viol }
let active = false, finishing = false;
let timerId = null, saveTimer = null, blurTimer = null;
const TEXT_QS = QUESTIONS.filter((q) => q.max && !q.table);
const TOTAL_ITEMS = CALC_FIELDS.length + TEXT_QS.length;

init();
async function init() {
  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    try {
      const r = (await get(ref(db, `${P}/${saved}`))).val();
      // работа со старого урока — компьютер свободен для следующего ученика
      if (r && Date.now() > (r.deadline || 0) + 5 * 60000) {
        if (r.status === "in_progress") await update(ref(db, `${P}/${saved}`), { status: "submitted", reason: "timeout", submittedAt: serverTimestamp() }).catch(() => {});
        localStorage.removeItem(LS_KEY);
        return showLogin();
      }
      if (r) {
        S = { id: saved, name: r.name, cls: r.cls, variant: r.variant, deadline: r.deadline, answers: r.answers || {}, viol: r.violations || 0 };
        if (r.status === "in_progress") return resume(r);
        return showDone(r.reason);
      }
    } catch (e) { console.warn(e); }
    localStorage.removeItem(LS_KEY);
  }
  showLogin();
}

// ---------- вход ----------
function showLogin() {
  app.innerHTML = `
  <div class="card center">
    <div class="pr-ribbon">🧪 Практическая работа · не суммативное оценивание</div>
    <h2>Вход в работу</h2>
    <p class="muted">${esc(WORK.subtitle)}<br><b>${esc(WORK.title)}</b></p>
    <label class="f" for="inName">Фамилия и имя</label>
    <input type="text" id="inName" autocomplete="off" maxlength="60" placeholder="Например: Попеску Андрей">
    <label class="f" for="inCls">Класс</label>
    <select id="inCls"><option value="">— выберите класс —</option>${WORK.classes.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
    <div class="err" id="err"></div>
    <button class="btn" id="btnNext" style="margin-top:8px">Далее →</button>
  </div>`;
  $("#btnNext").onclick = () => {
    const name = $("#inName").value.trim().replace(/\s+/g, " ");
    const cls = $("#inCls").value;
    if (name.split(" ").length < 2 || name.length < 5) return ($("#err").textContent = "Введите фамилию и имя полностью.");
    if (!cls) return ($("#err").textContent = "Выберите класс.");
    showRules(name, cls);
  };
}

function showRules(name, cls) {
  app.innerHTML = `
  <div class="card center" style="max-width:700px">
    <div class="pr-ribbon">🧪 Практическая работа № ${WORK.number}</div>
    <h2>Перед началом прочитайте правила</h2>
    <p><b>${esc(name)}</b>, ${esc(cls)}. На работу даётся <b>${WORK.minutes} минут</b>, максимум — <b>${WORK.max} баллов</b>.
      У каждого ученика <b>своя пара стран</b>: одна страна Европы и одна страна Африки.</p>
    <div class="plan">${WORK.plan.map(([a, b]) => `<span><b>${a}</b>${b}</span>`).join("")}</div>
    <ul class="rules">
      <li>Работа откроется во <b>весь экран</b>. Не выходите из полноэкранного режима.</li>
      <li>Если вы <b>перейдёте на другую вкладку, в другое окно или программу, свернёте браузер</b> — работа будет <b>сдана автоматически</b>. Вернуться к ней будет нельзя.</li>
      <li>Для расчётов используйте <b>встроенный калькулятор</b> 🧮 (кнопка вверху). Калькулятор Windows и телефон открывать нельзя.</li>
      <li>Копирование, вставка текста и правая кнопка мыши заблокированы. <b>Все попытки фиксируются</b> и видны учителю.</li>
      <li>Отвечайте своими словами, по <b>2–4 предложения</b>, опираясь на цифры из таблиц. Ответы проверяет учитель с помощью ИИ.</li>
      <li>Ответы сохраняются автоматически. Когда время закончится, работа сдастся сама.</li>
    </ul>
    <label class="check"><input type="checkbox" id="agree"> <span>Я прочитал(а) правила и понимаю, что за их нарушение работа будет сдана автоматически.</span></label>
    <div class="err" id="err"></div>
    <button class="btn" id="btnStart" disabled>Начать работу</button>
    <button class="btn ghost" id="btnBack">Назад</button>
  </div>`;
  $("#agree").onchange = (e) => ($("#btnStart").disabled = !e.target.checked);
  $("#btnBack").onclick = showLogin;
  $("#btnStart").onclick = async () => {
    const b = $("#btnStart"); b.disabled = true; b.textContent = "Подключение…";
    try {
      const open = (await get(ref(db, `settings/${WORK.id}/open`))).val();
      if (!open) { $("#err").textContent = "Работа ещё не открыта учителем. Подождите и нажмите ещё раз."; b.disabled = false; b.textContent = "Начать работу"; return; }
      await enterFullscreen();
      const variant = 1 + Math.floor(Math.random() * VARIANTS.length);
      const now = Date.now();
      const rec = { name, cls, variant, status: "in_progress", startedAt: now, deadline: now + WORK.minutes * 60000,
        updatedAt: serverTimestamp(), violations: 0, answers: {}, ua: navigator.userAgent.slice(0, 120) };
      const r = push(ref(db, P));
      await set(r, rec);
      localStorage.setItem(LS_KEY, r.key);
      S = { id: r.key, name, cls, variant, deadline: rec.deadline, answers: {}, viol: 0 };
      startWork();
    } catch (e) {
      console.error(e);
      $("#err").textContent = "Ошибка подключения к серверу. Сообщите учителю.";
      b.disabled = false; b.textContent = "Начать работу";
    }
  };
}

function resume(r) {
  if (Date.now() >= r.deadline) { S.answers = r.answers || {}; return finish("timeout"); }
  app.innerHTML = `<div class="card center"><h2>Продолжение работы</h2>
    <p>${esc(r.name)}, ${esc(r.cls)}. Ваши ответы сохранены. Нажмите кнопку, чтобы продолжить (откроется полноэкранный режим).</p>
    <button class="btn" id="btnCont">Продолжить</button></div>`;
  $("#btnCont").onclick = async () => { await enterFullscreen(); startWork(); };
}

// ---------- работа ----------
function calcInput(k) {
  const v = S.answers.c?.[k] ?? "";
  return `<input type="text" class="cin" data-c="${k}" inputmode="decimal" maxlength="12" value="${esc(v)}" placeholder="?" aria-label="ответ">`;
}

function table1(v) {
  const row = (c, s) => `<tr><th class="cn">${esc(c.name)}<small>${c.region}</small></th>
    <td>${num(c.pop50)}</td><td>${num(c.pop24)}</td>
    <td>${num(c.cbr50)}</td><td>${num(c.cbr24)}</td>
    <td>${num(c.cdr50)}</td><td>${num(c.cdr24)}</td>
    <td class="in">${calcInput(`gr_${s}50`)}</td><td class="in">${calcInput(`gr_${s}24`)}</td>
    <td>${c.imr50}</td><td>${c.imr24}</td>
    <td class="area">${num(c.area)}</td>
    <td class="in">${calcInput(`de_${s}50`)}</td><td class="in">${calcInput(`de_${s}24`)}</td></tr>`;
  return `<div class="tbl-wrap"><table class="pr-tb">
    <thead><tr><th rowspan="2"></th><th colspan="2">Численность населения, млн чел.</th><th colspan="2">Коэффициент рождаемости, ‰</th>
      <th colspan="2">Коэффициент смертности, ‰</th><th colspan="2" class="hl">Естественный прирост, ‰ <i>1.2</i></th>
      <th colspan="2">Младенческая смертность, ‰</th><th rowspan="2">Площадь, тыс. км²</th><th colspan="2" class="hl">Плотность населения, чел./км² <i>1.4</i></th></tr>
      <tr>${"<th>1950</th><th>2024</th>".repeat(4)}<th>1950</th><th>2024</th><th>1950</th><th>2024</th></tr></thead>
    <tbody>${row(v.A, "A")}${row(v.B, "B")}</tbody></table></div>`;
}

function table2(v) {
  const row = (c) => `<tr><th class="cn">${esc(c.name)}<small>${c.region}</small></th>
    <td>${c.young50}</td><td>${c.young24}</td><td>${c.old50}</td><td>${c.old24}</td>
    <td>${c.le50}</td><td>${c.le24}</td><td>${c.lm50}</td><td>${c.lm24}</td><td>${c.lf50}</td><td>${c.lf24}</td>
    <td>${c.urb50}</td><td>${c.urb24}</td></tr>`;
  return `<div class="tbl-wrap"><table class="pr-tb">
    <thead><tr><th rowspan="2"></th><th colspan="2">Молодое население (0–14 лет), % всего</th><th colspan="2">Пожилое население (65+ лет), % всего</th>
      <th colspan="2">Ожидаемая продолжительность жизни при рождении (лет), всего</th><th colspan="2">… мужчины</th><th colspan="2">… женщины</th>
      <th colspan="2">Степень урбанизации, %</th></tr>
      <tr>${"<th>1950</th><th>2024</th>".repeat(6)}</tr></thead>
    <tbody>${row(v.A)}${row(v.B)}</tbody></table></div>`;
}

function qBlock(q, v) {
  const head = `<div class="q-head"><span class="q-n">${q.n}</span><span class="q-t">${esc(qText(q, v))}</span>
    ${q.max || q.table ? `<span class="pts">${q.table ? "4 б." : q.calc ? "4 + 1 б." : q.max + " б."}</span>` : ""}</div>`;
  if (q.table) return `<div class="q tbl-q" id="b_${q.k}">${head}<div class="q-hint">✍ Впишите ответы прямо в выделенные клетки таблицы выше (с точностью до десятых).</div></div>`;
  const ta = `<textarea data-t="${q.k}" maxlength="2000" placeholder="Ваш ответ (2–4 предложения, с опорой на цифры из таблицы)">${esc(S.answers[q.k] || "")}</textarea>`;
  if (q.calc) {
    const box = (c, s) => `<div class="ch-box"><div class="ch-name">${esc(c.name)}</div>
      <label>Изменение: ${calcInput(`ch_${s}abs`)} млн чел. <small class="muted">(N₂₀₂₄ − N₁₉₅₀)</small></label>
      <label>Во сколько раз: ${calcInput(`ch_${s}x`)} раз(а) <small class="muted">(N₂₀₂₄ ÷ N₁₉₅₀)</small></label></div>`;
    return `<div class="q" id="b_${q.k}">${head}<div class="ch-grid">${box(v.A, "A")}${box(v.B, "B")}</div>
      <label class="f sm">Вывод (1 б.):</label>${ta}</div>`;
  }
  return `<div class="q" id="b_${q.k}">${head}${ta}</div>`;
}

function startWork() {
  const v = VARIANTS.find((x) => x.id === S.variant);
  $("#hWho").textContent = `${S.name} · ${S.cls} · вариант ${S.variant}: ${v.A.name} и ${v.B.name}`;
  const qs = (p) => QUESTIONS.filter((q) => q.part === p).map((q) => qBlock(q, v)).join("");
  app.innerHTML = `
  <section class="card pr-intro">
    <div class="pr-ribbon">🧪 Практическая работа № ${WORK.number} · вариант ${S.variant}</div>
    <h2>${esc(WORK.title)}</h2>
    <p class="pair"><span class="eu">🇪🇺 ${esc(v.A.name)} <small>Европа</small></span><span class="vs">и</span><span class="af">🌍 ${esc(v.B.name)} <small>Африка</small></span></p>
    <div class="goals"><b>Цели.</b> Выполнив данную практическую работу, вы сможете:<ul>${WORK.goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></div>
    <div class="formulas"><b>Как считать:</b>
      <span>Естественный прирост = рождаемость − смертность (‰)</span>
      <span>Плотность = численность (млн × 1000) ÷ площадь (тыс. км²)</span>
      <span>На сколько = N<sub>2024</sub> − N<sub>1950</sub></span>
      <span>Во сколько раз = N<sub>2024</sub> ÷ N<sub>1950</sub></span>
      <span class="note">Округляйте до десятых. Естественный прирост может быть отрицательным (убыль) — тогда ставьте знак «−».</span></div>
  </section>
  <section class="card part">
    <div class="part-h"><span class="part-n">1</span><div><b>Проанализируйте элементы динамики населения</b> ${esc(v.A.gen)} и ${esc(v.B.gen)} и выполните предложенные задания.</div></div>
    ${table1(v)}${qs(1)}
  </section>
  <section class="card part">
    <div class="part-h"><span class="part-n">2</span><div><b>Проанализируйте структурные особенности населения</b> ${esc(v.A.gen)} и ${esc(v.B.gen)} и выполните предложенные задания.</div></div>
    ${table2(v)}${qs(2)}
  </section>
  <section class="card part">
    <div class="part-h"><span class="part-n">3</span><div><b>Вопросы для размышления</b></div></div>
    ${qs(3)}
  </section>
  <p class="muted src">Данные округлены (по оценкам ООН). Площадь — в тысячах км².</p>`;
  bind();
  $("#bottomBar").hidden = false; $("#timer").hidden = false; $("#calcBtn").hidden = false;
  $("#btnSubmit").onclick = askSubmit;
  active = true; finishing = false;
  tick(); clearInterval(timerId); timerId = setInterval(tick, 1000);
  updateProgress(); watchRecord();
  window.scrollTo(0, 0);
}

let lastCalcInput = null;
function bind() {
  const A = S.answers;
  app.querySelectorAll("[data-c]").forEach((inp) => {
    const h = () => {
      inp.value = inp.value.replace(/[^\d,.\-−–]/g, "");
      A.c = A.c || {}; A.c[inp.dataset.c] = inp.value;
      inp.classList.toggle("filled", !!inp.value.trim());
      changed();
    };
    inp.classList.toggle("filled", !!inp.value.trim());
    inp.oninput = h;
    inp.onfocus = () => { lastCalcInput = inp; };
  });
  app.querySelectorAll("[data-t]").forEach((ta) => ta.oninput = () => { A[ta.dataset.t] = ta.value; changed(); });
}

// ---------- сохранение ----------
function changed() {
  updateProgress();
  $("#savedState").textContent = "сохранение…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 2000);
}
async function saveNow() {
  if (!S || finishing) return;
  try {
    await update(ref(db, `${P}/${S.id}`), { answers: S.answers, updatedAt: serverTimestamp() });
    $("#savedState").textContent = "✓ сохранено";
  } catch (e) { $("#savedState").textContent = "⚠ нет связи, ответы сохранятся позже"; }
}
function countDone() {
  const A = S.answers; let n = 0;
  for (const f of CALC_FIELDS) if (String(A.c?.[f.k] ?? "").trim()) n++;
  for (const q of TEXT_QS) if (String(A[q.k] ?? "").trim()) n++;
  return n;
}
function updateProgress() {
  const n = countDone();
  $("#progress").textContent = `Заполнено ответов: ${n} из ${TOTAL_ITEMS}`;
  return n;
}

// ---------- таймер ----------
function tick() {
  const left = Math.max(0, S.deadline - Date.now());
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  const el = $("#timer");
  el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  el.classList.toggle("low", left < 5 * 60000);
  if (left <= 0) finish("timeout");
}

// ---------- сдача ----------
function askSubmit() {
  const n = updateProgress();
  modal(`<h2>Сдать работу?</h2><p>Заполнено ответов: <b>${n} из ${TOTAL_ITEMS}</b>.${n < TOTAL_ITEMS ? " Некоторые ответы не заполнены." : ""}</p>
    <p class="muted">После сдачи изменить ответы будет нельзя.</p>
    <button class="btn" id="mYes">Да, сдать</button> <button class="btn ghost" id="mNo">Вернуться к работе</button>`);
  $("#mYes").onclick = () => finish("manual");
  $("#mNo").onclick = closeModal;
}

const REASONS = {
  manual: "Работа сдана.",
  timeout: "Время вышло — работа сдана автоматически.",
  tab: "Вы перешли на другую вкладку или окно — работа сдана автоматически.",
  blur: "Вы переключились на другое окно или программу — работа сдана автоматически.",
  close: "Страница была закрыта или обновлена — работа сдана автоматически.",
  teacher: "Работа завершена учителем.",
};

async function finish(reason, evType) {
  if (finishing || !S) return;
  const extra = {};
  if (evType && active) {
    S.viol = (S.viol || 0) + 1;
    extra.violations = S.viol;
    extra[`events/${push(ref(db, `${P}/${S.id}/events`)).key}`] = { type: evType, at: Date.now() };
  }
  finishing = true; active = false;
  clearInterval(timerId); clearTimeout(saveTimer); clearTimeout(blurTimer);
  try {
    await update(ref(db, `${P}/${S.id}`), { answers: S.answers, status: "submitted", reason, submittedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra });
  } catch (e) { console.error(e); }
  showDone(reason);
}

function showDone(reason) {
  active = false;
  closeModal(); closeCalc();
  $("#bottomBar").hidden = true; $("#timer").hidden = true; $("#calcBtn").hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const auto = reason && reason !== "manual";
  app.innerHTML = `<div class="card center">
    <div class="pr-ribbon">🧪 Практическая работа № ${WORK.number}</div>
    <h2>${auto ? "⚠️ Работа сдана автоматически" : "✅ Работа сдана"}</h2>
    <p>${esc(REASONS[reason] || REASONS.manual)}</p>
    <p class="muted">${S ? esc(S.name) + ", " + esc(S.cls) + " · вариант " + S.variant : ""}</p>
    <p>Результат сообщит учитель. Эту вкладку можно закрыть.</p></div>`;
  watchRecord();
}

// учитель может разрешить продолжить или завершить работу
let unwatch = null;
function watchRecord() {
  if (!S || unwatch) return;
  unwatch = onValue(ref(db, `${P}/${S.id}`), (snap) => {
    const r = snap.val(); if (!r) return;
    if (r.status === "in_progress" && !active) {
      finishing = false; S.deadline = r.deadline; S.answers = r.answers || S.answers; S.viol = r.violations || S.viol; resume(r);
    } else if (r.status === "submitted" && active) {
      finishing = true; active = false; clearInterval(timerId); showDone(r.reason || "teacher");
    }
  });
}

// ---------- защита ----------
async function enterFullscreen() {
  try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen(); }
  catch (e) { /* браузер может не поддерживать */ }
}
function logViolation(type) {
  if (!S || !active) return;
  S.viol = (S.viol || 0) + 1;
  const evKey = push(ref(db, `${P}/${S.id}/events`)).key;
  update(ref(db, `${P}/${S.id}`), { violations: S.viol, [`events/${evKey}`]: { type, at: Date.now() } }).catch(() => {});
}
document.addEventListener("visibilitychange", () => { if (active && document.visibilityState === "hidden") finish("tab", "уход со вкладки"); });
window.addEventListener("blur", () => {
  if (!active) return;
  clearTimeout(blurTimer);
  blurTimer = setTimeout(() => { if (active && !document.hasFocus()) finish("blur", "переключение на другое окно"); }, 400);
});
window.addEventListener("focus", () => clearTimeout(blurTimer));
window.addEventListener("pagehide", () => { if (active) finish("close", "закрытие/обновление страницы"); });
window.addEventListener("beforeunload", (e) => { if (active) { e.preventDefault(); e.returnValue = ""; } });
document.addEventListener("fullscreenchange", () => {
  if (active && !document.fullscreenElement) {
    logViolation("выход из полноэкранного режима");
    modal(`<h2>Вернитесь в полноэкранный режим</h2>
      <p>Выход из полноэкранного режима зафиксирован. Помните: переход на другую вкладку или окно приведёт к автосдаче.</p>
      <button class="btn" id="mFs">Вернуться к работе</button>`);
    $("#mFs").onclick = async () => { closeModal(); await enterFullscreen(); };
  }
});
document.addEventListener("contextmenu", (e) => { if (active) e.preventDefault(); });
for (const ev of ["copy", "cut", "paste", "drop"]) {
  document.addEventListener(ev, (e) => {
    if (!active) return;
    e.preventDefault();
    if (ev !== "drop") logViolation(ev === "paste" ? "попытка вставки текста" : "попытка копирования");
  });
}
document.addEventListener("keydown", (e) => {
  if (!active) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  const devtools = k === "f12" || (ctrl && e.shiftKey && ["i", "j", "c", "k"].includes(k)) || (ctrl && k === "u");
  const blocked = ctrl && ["c", "v", "x", "s", "p", "f", "g", "h", "o", "n", "t"].includes(k);
  if (devtools || blocked) {
    e.preventDefault(); e.stopPropagation();
    if (devtools) logViolation("попытка открыть инструменты разработчика");
  }
}, true);
document.addEventListener("keyup", (e) => { if (active && e.key === "PrintScreen") logViolation("снимок экрана (PrintScreen)"); });

// ---------- встроенный калькулятор ----------
const calc = $("#calc"), calcD = $("#calcD");
let expr = "", justDone = false;
const KEYS = [["C", "fn"], ["(", "op"], [")", "op"], ["⌫", "fn"],
  ["7"], ["8"], ["9"], ["÷", "op"], ["4"], ["5"], ["6"], ["×", "op"],
  ["1"], ["2"], ["3"], ["−", "op"], ["0"], [","], ["=", "eq"], ["+", "op"]];
$("#calcK").innerHTML = KEYS.map(([k, c]) => `<button type="button" class="${c || ""}" data-k="${k}">${k}</button>`).join("") +
  `<button type="button" class="ins" data-k="ins">↳ Вставить результат в выбранную клетку</button>`;
function show() { calcD.textContent = expr || "0"; }
function evaluate() {
  const js = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,/g, ".");
  if (!/^[\d+\-*/(). ]+$/.test(js)) return null;
  try {
    const r = Function(`"use strict";return (${js})`)();
    return Number.isFinite(r) ? String(Math.round(r * 1e6) / 1e6).replace(".", ",") : null;
  } catch (e) { return null; }
}
$("#calcK").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const k = b.dataset.k;
  if (k === "C") expr = "";
  else if (k === "⌫") expr = expr.slice(0, -1);
  else if (k === "=") { const r = evaluate(); expr = r ?? "Ошибка"; justDone = true; show(); return; }
  else if (k === "ins") {
    const r = evaluate();
    if (r !== null && lastCalcInput) {
      const n = parseFloat(r.replace(",", "."));
      lastCalcInput.value = String(Math.round(n * 10) / 10).replace(".", ",");
      lastCalcInput.dispatchEvent(new Event("input"));
      lastCalcInput.classList.add("flash"); setTimeout(() => lastCalcInput?.classList.remove("flash"), 700);
    } else if (!lastCalcInput) { calcD.textContent = "Сначала нажмите на клетку"; setTimeout(show, 1200); }
    return;
  } else {
    if (expr === "Ошибка") expr = "";
    if (justDone && /[\d,]/.test(k)) expr = "";
    expr += k;
  }
  justDone = false; show();
});
$("#calcBtn").onclick = () => { calc.hidden = !calc.hidden; };
$("#calcClose").onclick = closeCalc;
function closeCalc() { calc.hidden = true; }

// ---------- модальное окно ----------
function modal(html) {
  closeModal();
  const o = document.createElement("div"); o.className = "overlay"; o.id = "overlay";
  o.innerHTML = `<div class="card">${html}</div>`;
  document.body.appendChild(o);
}
function closeModal() { $("#overlay")?.remove(); }
