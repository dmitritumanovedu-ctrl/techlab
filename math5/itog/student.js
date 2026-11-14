// Тренировочный итоговый тест · Математика 5 · страница ученика
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, set, update, get, onValue, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "../../firebase-config.js";
import { TEST, VARIANTS, shopText, stHtml, buyText, exprHtml, mText, lei } from "./questions.js?v=1";
const WORK = TEST;

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const LS_KEY = "techlab_attempt_" + WORK.id;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const db = getDatabase(initializeApp(firebaseConfig));
const P = `results/${WORK.id}`;

let S = null;            // { id, name, cls, variant, deadline, answers, viol }
let active = false, finishing = false;
let timerId = null, saveTimer = null, blurTimer = null;
const TOTAL_ITEMS = 3 + 1 + 2 + 1 + 5 + 1 + 3;   // строк ответа в бланке

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
        return showDone(r.reason, r);
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
    <div class="m-ribbon">📐 Тренировочный итоговый тест</div>
    <h2>Вход в работу</h2>
    <p class="muted">${esc(WORK.subtitle)}<br><b>${esc(WORK.topic)}</b></p>
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
    <div class="m-ribbon">📐 Тренировочный итоговый тест · математика 5</div>
    <h2>Перед началом прочитайте правила</h2>
    <p><b>${esc(name)}</b>, ${esc(cls)}. На работу даётся <b>${WORK.minutes} минут</b>, максимум — <b>${WORK.max} балла</b>.
      2 задания по образцу итогового теста: делимость, делители, деление с остатком, задача о покупке, числовое выражение. Каждый получает <b>свой вариант</b>.</p>
    <div class="plan">${WORK.plan.map(([a, b]) => `<span><b>${a}</b>${b}</span>`).join("")}</div>
    <ul class="rules">
      <li>Работа откроется во <b>весь экран</b>. Не выходите из полноэкранного режима.</li>
      <li>Если вы <b>перейдёте на другую вкладку, в другое окно или программу, свернёте браузер</b> — работа будет <b>сдана автоматически</b>.</li>
      <li>Калькулятор, телефон и учебник использовать нельзя. Все вычисления делайте на <b>черновике</b>.</li>
      <li>Копирование, вставка и правая кнопка мыши заблокированы. <b>Все попытки фиксируются</b> и видны учителю.</li>
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
const box = (attrs, val, w = "") => `<input type="text" class="bx ${w}" ${attrs} inputmode="numeric" autocomplete="off" maxlength="6" value="${esc(val ?? "")}">`;
const pts = (n) => `<span class="sp">${n} б.</span>`;

function render(v) {
  const A = S.answers;
  const a1 = A.a1 || {}, c1 = A.c1 || {}, d1 = A.d1 || {}, a2 = A.a2 || {}, c2 = A.c2 || {};
  const t1 = `<section class="card task" id="task1">
    <div class="task-head"><span class="task-num">Задание 1</span><span class="pts">19 б.</span></div>
    <p class="cond">${esc(shopText(v))}</p>

    <div class="part"><div class="part-h"><b>а)</b> Отметьте <b>И</b>, если высказывание истинно, или <b>Л</b>, если оно ложно. ${pts(3)}</div>
      ${v.st.map((s, i) => `<div class="tf-line"><span class="stx">${stHtml(s)}</span>
        <span class="il">${["И", "Л"].map((x) => `<label class="pill ${a1[i] === x ? "on" : ""}"><input type="radio" name="a1_${i}" value="${x}" ${a1[i] === x ? "checked" : ""}> ${x}</label>`).join("")}</span></div>`).join("")}
      <div class="legend"><span class="dv">⋮</span> — «делится на», <span class="dv ndv">⋮</span> — «не делится на»</div></div>

    <div class="part"><div class="part-h"><b>б)</b> Найдите множество делителей D<sub>${v.b.price}</sub>. ${pts(8)}</div>
      <div class="set-line"><span class="setn">D<sub>${v.b.price}</sub> = {</span>
        <input type="text" class="set-in" id="b1" autocomplete="off" maxlength="80" placeholder="1, …" value="${esc(A.b1 || "")}"><span class="setn">}</span></div>
      <div class="hint">Пишите делители через запятую, в порядке возрастания. Лишние числа снижают балл.</div></div>

    <div class="part"><div class="part-h"><b>в)</b> Дополните, чтобы получилось верное равенство. ${pts(2)}</div>
      <div class="eq-line"><span class="num">${v.budget} : ${v.a.price} =</span> ${box('data-c1="q"', c1.q)} <span>(остаток ${box('data-c1="r"', c1.r)})</span></div></div>

    <div class="part"><div class="part-h"><b>г)</b> ${esc(buyText(v))} ${pts(6)}</div>
      <div class="hint">Каждый вариант — в отдельной строке. Заполните столько строк, сколько вариантов нашли. Проверьте: стоимость покупки должна быть ровно ${esc(lei(v.budget))}.</div>
      <table class="buy"><thead><tr><th>Вариант</th><th>${esc(v.a.many)}, шт.</th><th>${esc(v.b.many)}, шт.</th></tr></thead><tbody>
        ${[0, 1, 2, 3].map((i) => `<tr><td>${i + 1}</td><td>${box(`data-d1="${i}" data-xy="x"`, d1["r" + i]?.x)}</td><td>${box(`data-d1="${i}" data-xy="y"`, d1["r" + i]?.y)}</td></tr>`).join("")}
      </tbody></table></div>
  </section>`;

  const ex = v.ex, o = c2.o || [], c = c2.c || [];
  const t2 = `<section class="card task" id="task2">
    <div class="task-head"><span class="task-num">Задание 2</span><span class="pts">14 б.</span></div>
    <p class="cond">Дано числовое выражение:</p>
    <div class="expr">${exprHtml(ex)}</div>

    <div class="part"><div class="part-h"><b>а)</b> Найдите значение числового выражения. Запишите результат каждого действия. ${pts(5)}</div>
      <div class="steps">
        ${[["pow", "Возведение в степень"], ["mul", "Умножение"], ["div", "Деление"], ["add", "Сложение"], ["val", "Вычитание = значение выражения"]]
          .map(([k, l], i) => `<label class="step"><span class="sn">${i + 1}</span><span class="sl">${l}</span>${box(`data-a2="${k}"`, a2[k], "w")}</label>`).join("")}
      </div></div>

    <div class="part"><div class="part-h"><b>б)</b> Выберите нужное слово. ${pts(2)}</div>
      <div class="eq-line">Число, полученное в пункте <b>а)</b>, является
        ${[["even", "чётным"], ["odd", "нечётным"]].map(([x, l]) => `<label class="pill ${A.b2 === x ? "on" : ""}"><input type="radio" name="b2_0" value="${x}" ${A.b2 === x ? "checked" : ""}> ${l}</label>`).join("")} числом.</div></div>

    <div class="part"><div class="part-h"><b>в)</b> Поставьте скобки в выражение так, чтобы полученный результат ${mText(v.m)}. Обоснуйте! ${pts(7)}</div>
      <div class="hint">Нажимайте на серые клеточки: перед числом появится «(», после числа — «)». Повторное нажатие убирает скобку. Числа и знаки менять нельзя.</div>
      <div class="brk" id="brk">${ex.n.map((x, i) => `<button type="button" class="slot op ${o[i] ? "has" : ""}" data-o="${i}">${"(".repeat(o[i] || 0) || "&nbsp;"}</button><span class="bn">${x}</span><button type="button" class="slot cl ${c[i] ? "has" : ""}" data-c="${i}">${")".repeat(c[i] || 0) || "&nbsp;"}</button>${i < 4 ? `<span class="bo">${["·", "+", ":", "−"][i]}</span>` : `<sup class="bk">${ex.k}</sup>`}`).join("")}</div>
      <div class="prev">Ваше выражение: <b id="prev">${exprHtml(ex, o, c)}</b></div>
      <div class="eq-line">Значение выражения со скобками: ${box('data-c2v', c2.v, "w")}</div>
      <label class="f" for="why">Обоснование: почему полученное число делится на ${v.m}?</label>
      <textarea id="why" maxlength="600" placeholder="Число … делится на ${v.m}, потому что …">${esc(c2.why || "")}</textarea></div>
  </section>`;
  return t1 + t2;
}

function startWork() {
  const v = VARIANTS.find((x) => x.id === S.variant);
  $("#hWho").textContent = `${S.name} · ${S.cls} · вариант ${S.variant}`;
  app.innerHTML = `<section class="card so-intro">
      <div class="m-ribbon">📐 Тренировочный итоговый тест · вариант ${S.variant}</div>
      <h2>${esc(TEST.topic)}</h2>
      <p class="muted">${esc(TEST.subtitle)} · ${TEST.minutes} минут · максимум ${TEST.max} балла · считайте на черновике</p>
      <div class="plan">${TEST.plan.map(([a, b]) => `<span><b>${a}</b>${b}</span>`).join("")}</div>
    </section>` + render(v);
  bind(v);
  $("#bottomBar").hidden = false; $("#timer").hidden = false;
  $("#btnSubmit").onclick = askSubmit;
  active = true; finishing = false;
  tick(); clearInterval(timerId); timerId = setInterval(tick, 1000);
  updateProgress(); watchRecord();
  window.scrollTo(0, 0);
}

function bind(v) {
  const A = S.answers;
  const digits = (i) => (i.value = i.value.replace(/[^\d]/g, ""));
  app.querySelectorAll("input[type=radio]").forEach((r) => r.onchange = () => {
    const [k, id] = r.name.split("_");
    if (k === "a1") { A.a1 = A.a1 || {}; A.a1[id] = r.value; }
    else if (k === "b2") A.b2 = r.value;
    r.closest(".il, .eq-line").querySelectorAll(".pill").forEach((p) => p.classList.toggle("on", p.contains(r) && r.checked));
    changed();
  });
  const b1 = $("#b1"); b1.oninput = () => { b1.value = b1.value.replace(/[^\d,;\s]/g, ""); A.b1 = b1.value; changed(); };
  app.querySelectorAll("[data-c1]").forEach((i) => i.oninput = () => { digits(i); (A.c1 = A.c1 || {})[i.dataset.c1] = i.value; changed(); });
  app.querySelectorAll("[data-d1]").forEach((i) => i.oninput = () => { digits(i); A.d1 = A.d1 || {}; const r = (A.d1["r" + i.dataset.d1] = A.d1["r" + i.dataset.d1] || {}); r[i.dataset.xy] = i.value; changed(); });
  app.querySelectorAll("[data-a2]").forEach((i) => i.oninput = () => { digits(i); (A.a2 = A.a2 || {})[i.dataset.a2] = i.value; changed(); });
  const cv = app.querySelector("[data-c2v]"); cv.oninput = () => { digits(cv); (A.c2 = A.c2 || {}).v = cv.value; changed(); };
  const why = $("#why"); why.oninput = () => { (A.c2 = A.c2 || {}).why = why.value; changed(); };
  // скобки: 0 → 1 → 2 → 0
  app.querySelectorAll("#brk .slot").forEach((b) => b.onclick = () => {
    A.c2 = A.c2 || {};
    const isO = b.dataset.o !== undefined, i = Number(isO ? b.dataset.o : b.dataset.c);
    const arr = (A.c2[isO ? "o" : "c"] = Array.from({ length: 5 }, (_, j) => Number(A.c2[isO ? "o" : "c"]?.[j] || 0)));
    arr[i] = (arr[i] + 1) % 3;
    b.textContent = (isO ? "(" : ")").repeat(arr[i]) || " "; b.classList.toggle("has", arr[i] > 0);
    $("#prev").innerHTML = exprHtml(v.ex, A.c2.o || [], A.c2.c || []);
    changed();
  });
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
  const A = S.answers, f = (x) => x !== undefined && x !== null && String(x).trim() !== ""; let n = 0;
  for (const i of [0, 1, 2]) if (f(A.a1?.[i])) n++;
  if (f(A.b1)) n++;
  if (f(A.c1?.q)) n++; if (f(A.c1?.r)) n++;
  if (Object.values(A.d1 || {}).some((r) => f(r.x) && f(r.y))) n++;
  for (const k of ["pow", "mul", "div", "add", "val"]) if (f(A.a2?.[k])) n++;
  if (f(A.b2)) n++;
  if ((A.c2?.o || []).some((x) => x > 0)) n++; if (f(A.c2?.v)) n++; if (f(A.c2?.why)) n++;
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

function showDone(reason, r) {
  active = false;
  closeModal();
  $("#bottomBar").hidden = true; $("#timer").hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const auto = reason && reason !== "manual";
  const res = r?.result;
  app.innerHTML = `<div class="card center">
    <div class="m-ribbon">📐 Тренировочный итоговый тест · математика 5</div>
    <h2>${auto ? "⚠️ Работа сдана автоматически" : "✅ Работа сдана"}</h2>
    <p>${esc(REASONS[reason] || REASONS.manual)}</p>
    <p class="muted">${S ? esc(S.name) + ", " + esc(S.cls) + " · вариант " + S.variant : ""}</p>
    <div id="resBox">${res ? resultHtml(res) : `<p>Результат появится здесь, когда учитель проверит работу. Эту вкладку можно закрыть.</p>`}</div></div>`;
  watchRecord();
}
function resultHtml(res) {
  return `<div class="res-big"><div class="res-g">${res.complete ? res.grade : "≈" + res.grade}</div>
    <div><b>${String(res.total).replace(".", ",")} из ${res.max} баллов</b><br><span class="muted">${res.complete ? "Отметка по схеме оценивания теста" : "Учитель ещё проверяет обоснование"}</span></div></div>`;
}

// учитель может разрешить продолжить или завершить работу; результат появляется после проверки
let unwatch = null;
function watchRecord() {
  if (!S || unwatch) return;
  unwatch = onValue(ref(db, `${P}/${S.id}`), (snap) => {
    const r = snap.val(); if (!r) return;
    if (r.status === "in_progress" && !active && !$("#btnCont")) {
      finishing = false; S.deadline = r.deadline; S.answers = r.answers || S.answers; S.viol = r.violations || S.viol; resume(r);
    } else if (r.status === "submitted" && active) {
      finishing = true; active = false; clearInterval(timerId); showDone(r.reason || "teacher", r);
    } else if (r.status === "submitted" && r.result && $("#resBox")) {
      $("#resBox").innerHTML = resultHtml(r.result);
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

// ---------- модальное окно ----------
function modal(html) {
  closeModal();
  const o = document.createElement("div"); o.className = "overlay"; o.id = "overlay";
  o.innerHTML = `<div class="card">${html}</div>`;
  document.body.appendChild(o);
}
function closeModal() { $("#overlay")?.remove(); }
