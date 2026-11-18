// Пробная сессия · География 11 · страница ученика
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, set, update, get, onValue, serverTimestamp }
  from "../../engine/rtdb.js?v=1";
import { firebaseConfig } from "../../firebase-config.js";
import { TEST, VARIANTS } from "./questions.js?v=1";
const WORK = TEST;

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const LS_KEY = "techlab_attempt_" + WORK.id;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtT = (n) => (n > 0 ? "+" : n < 0 ? "–" : "") + String(Math.abs(n)).replace(".", ",");

const db = getDatabase(initializeApp(firebaseConfig));
const P = `results/${WORK.id}`;

let S = null;            // { id, name, cls, variant, deadline, answers, viol }
let active = false, finishing = false;
let timerId = null, saveTimer = null, blurTimer = null;

const SECTIONS = { 1: "I. Знание и понимание", 4: "II. Применение", 7: "III. Интеграция (синтез) и перенос" };
const TITLES = { tf: "Верно / неверно", industry: "Отрасли промышленности", group: "Группировка", match: "Установление соответствия",
  coords: "Географические координаты", extent: "Протяжённость по градусной сети", alt: "Температура воздуха и высота",
  demo: "Демографические показатели", statement: "Задание на основе утверждения" };
const HEMS = { lat: [["с", "северной широты"], ["ю", "южной широты"]], lon: [["в", "восточной долготы"], ["з", "западной долготы"]] };

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
    <div class="ss-ribbon">🎓 Пробная сессия</div>
    <h2>Вход в тест</h2>
    <p class="muted">${esc(WORK.subtitle)}</p>
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
  <div class="card center" style="max-width:720px">
    <div class="ss-ribbon">🎓 Пробная сессия · география 11</div>
    <h2>Перед началом прочитайте правила</h2>
    <p><b>${esc(name)}</b>, ${esc(cls)}. На работу даётся <b>${WORK.minutes} минут</b> (2 урока), максимум — <b>${WORK.max} балл</b>.
      8 заданий в формате сессии и БАК: термины, отрасли промышленности, группировка, координаты, расчёты по карте и по высоте,
      анализ демографической таблицы, аргументация. Каждый получает <b>свой вариант</b>.</p>
    <div class="plan">${WORK.plan.map(([a, b]) => `<span><b>${a}</b>${b}</span>`).join("")}</div>
    <ul class="rules">
      <li>Работа откроется во <b>весь экран</b>. Не выходите из полноэкранного режима.</li>
      <li>Если вы <b>перейдёте на другую вкладку, в другое окно или программу, свернёте браузер</b> — работа будет <b>сдана автоматически</b>. Вернуться к ней будет нельзя.</li>
      <li>Можно пользоваться <b>школьным географическим атласом</b> и черновиком. Телефон и интернет — нельзя.</li>
      <li>Расчёты записывайте полностью, например: <b>5600 – 200 = 5400 м</b>.</li>
      <li>Копирование, вставка текста и правая кнопка мыши заблокированы. <b>Все попытки фиксируются</b> и видны учителю.</li>
      <li>Ответы сохраняются автоматически. Когда время закончится, работа сдастся сама.</li>
    </ul>
    <label class="check"><input type="checkbox" id="agree"> <span>Я прочитал(а) правила и понимаю, что за их нарушение работа будет сдана автоматически.</span></label>
    <div class="err" id="err"></div>
    <button class="btn" id="btnStart" disabled>Начать тест</button>
    <button class="btn ghost" id="btnBack">Назад</button>
  </div>`;
  $("#agree").onchange = (e) => ($("#btnStart").disabled = !e.target.checked);
  $("#btnBack").onclick = showLogin;
  $("#btnStart").onclick = async () => {
    const b = $("#btnStart"); b.disabled = true; b.textContent = "Подключение…";
    try {
      const open = (await get(ref(db, `settings/${WORK.id}/open`))).val();
      if (!open) { $("#err").textContent = "Тест ещё не открыт учителем. Подождите и нажмите ещё раз."; b.disabled = false; b.textContent = "Начать тест"; return; }
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
      b.disabled = false; b.textContent = "Начать тест";
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

// =====================================================================
//  Задания
// =====================================================================
// Все поля ответа: data-a="t5.d" → S.answers.t5.d
const val = (path) => { const [t, f] = path.split("."); return S.answers[t]?.[f] ?? ""; };
const inp = (path, ph = "", cls = "") => `<input type="text" class="ss-in ${cls}" data-a="${path}" maxlength="300" autocomplete="off" spellcheck="false" placeholder="${esc(ph)}" value="${esc(val(path))}">`;
const area = (path, rows = 4) => `<textarea data-a="${path}" maxlength="2500" rows="${rows}" placeholder="Развёрнутый ответ…">${esc(val(path))}</textarea>`;
const sel = (path, opts, cls = "") => `<select class="ss-sel ${cls}" data-a="${path}"><option value="">—</option>${opts.map(([v, l]) => `<option value="${v}" ${String(val(path)) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const pill = (path, v, text) => `<label class="pill ${String(val(path)) === String(v) ? "on" : ""}"><input type="radio" name="${path}" data-a="${path}" value="${v}" ${String(val(path)) === String(v) ? "checked" : ""}> ${esc(text)}</label>`;

function head(t) {
  return `<div class="task-head"><span class="task-num">Задание ${t.n} · ${TITLES[t.type]}</span><span class="pts">${t.points} б.</span></div>`;
}
const itemNo = (items) => { let k = 0; return items.map((it) => /^[бвгд]\)/.test(it.q) ? "" : (++k) + ")"); };

function altText(t) {
  if (t.mode === "foot") return `Определите температуру атмосферного воздуха у подножия горы, на высоте ${t.foot} м, если на её вершине, на высоте ${t.top} м, в данный момент температура воздуха равна ${fmtT(t.tTop)} °С.`;
  if (t.mode === "top") return `Определите температуру атмосферного воздуха на вершине горы высотой ${t.top} м, если у её подножия, на высоте ${t.foot} м, в данный момент температура воздуха равна ${fmtT(t.tFoot)} °С.`;
  return `Определите абсолютную высоту вершины горы, если у её подножия, на высоте ${t.foot} м, температура воздуха равна ${fmtT(t.tFoot)} °С, а на вершине в тот же момент — ${fmtT(t.tTop)} °С.`;
}
function altSteps(t) {
  if (t.mode === "height") return ["Рассчитайте разницу температур между подножием и вершиной:", "Укажите вертикальный термический градиент:",
    "Рассчитайте относительную высоту горы (разницу высот), применив вертикальный термический градиент:", "Определите абсолютную высоту вершины горы:"];
  return ["Рассчитайте разницу в высоте:", "Укажите вертикальный термический градиент:", "Рассчитайте разницу температур, применив вертикальный термический градиент:",
    t.mode === "foot" ? `Рассчитайте температуру воздуха у подножия, на высоте ${t.foot} м:` : `Рассчитайте температуру воздуха на вершине, на высоте ${t.top} м:`];
}

function items(t, tk) {
  const no = itemNo(t.items);
  return t.items.map((it, i) => {
    let f;
    if (it.k === "open") f = area(`${tk}.i${i}`, it.p >= 3 ? 5 : 4);
    else if (it.k === "multi") f = `<div class="two">${inp(`${tk}.i${i}a`, "Пример 1")}${inp(`${tk}.i${i}b`, "Пример 2")}</div>`;
    else if (it.k === "num") f = inp(`${tk}.i${i}`, "Расчёт и ответ, например: 10,0 – 6,7 = 3,3 ‰");
    else f = inp(`${tk}.i${i}`, "Ответ");
    return `<div class="ss-it ${no[i] ? "" : "subit"}"><div class="ss-q">${no[i] ? `<b>${no[i]}</b> ` : ""}${esc(it.q)} <span class="ss-p">${it.p} б.</span></div>${f}</div>`;
  }).join("");
}

function render(t) {
  const tk = "t" + t.n;
  let b = "";
  if (t.type === "tf") {
    b = `<p class="task-title">Прочитайте утверждения. Если утверждение верное, отметьте <b>«Верно»</b>. Если неверное — отметьте <b>«Неверно»</b> и напишите вместо подчёркнутых слов другие слова, делающие утверждение верным.</p>` +
      t.items.map((it) => { const v = S.answers.t1?.[it.id + "v"];
        return `<div class="tf-item"><div><b>${it.id})</b> ${it.text}</div>
          <div class="tf-row">${pill(`t1.${it.id}v`, "T", "Верно")}${pill(`t1.${it.id}v`, "F", "Неверно")}</div>
          <div class="fix" ${v === "F" ? "" : "hidden"}>${inp(`t1.${it.id}f`, "Слова вместо подчёркнутых")}</div></div>`; }).join("");
  } else if (t.type === "industry") {
    const H = ["Отрасли/подотрасли промышленности", "Сырьё (по одному примеру)", "Готовый продукт (по одному примеру)"];
    b = `<p class="task-title">Проанализируйте таблицу и заполните свободные ячейки, указав в каждой по одному недостающему элементу: отрасль/подотрасль промышленности, пример сырья или готовой продукции.</p>
      <div class="table-wrap"><table class="data-tb ss-grid"><tr>${H.map((h) => `<th>${h}</th>`).join("")}</tr>` +
      t.rows.map((r, ri) => `<tr>${r.map((c, ci) => c ? `<td class="given">${esc(c.g)}</td>` : `<td>${inp(`${tk}.r${ri}c${ci}`, "Впишите…")}</td>`).join("")}</tr>`).join("") + `</table></div>`;
  } else if (t.type === "group") {
    b = `<p class="task-title">${esc(t.title)} Для каждого объекта выберите группу.</p>` +
      t.items.map((it, i) => `<div class="grp"><div class="grp-n">${esc(it)}</div><div class="tf-row" style="margin:0">${t.groups.map((g, gi) => pill(`${tk}.i${i}`, gi, g)).join("")}</div></div>`).join("");
  } else if (t.type === "match") {
    const dg = t.opts.map((_, j) => [j + 1, String(j + 1)]);
    b = `<p class="task-title">${esc(t.title)} Для каждой буквы столбика А выберите <b>две</b> цифры из столбика Б (каждая цифра используется только один раз).</p>
      <div class="match"><div><div class="mh">Столбик А</div>${t.left.map((l, i) => `<div class="ml"><b>${"АБВ"[i]})</b> ${esc(l)}<span class="ml-s">${sel(`${tk}.L${i}a`, dg, "dig")}${sel(`${tk}.L${i}b`, dg, "dig")}</span></div>`).join("")}</div>
      <div><div class="mh">Столбик Б</div>${t.opts.map((o, j) => `<div class="mr"><b>${j + 1})</b> ${esc(o)}</div>`).join("")}</div></div>`;
  } else if (t.type === "coords") {
    b = `<p class="task-title">Определите географические координаты (только в градусах) ${esc(t.obj)}, применив градусную сетку ${esc(t.map)} (допустимое отклонение ±2°):</p>
      <div class="row"><span class="lbl">географическая широта:</span>${inp(`${tk}.la`, "°", "deg")}<span>°</span>${sel(`${tk}.lh`, HEMS.lat)}</div>
      <div class="row"><span class="lbl">географическая долгота:</span>${inp(`${tk}.lo`, "°", "deg")}<span>°</span>${sel(`${tk}.oh`, HEMS.lon)}</div>`;
  } else if (t.type === "extent") {
    const lat = t.axis === "lat";
    const pt = lat ? ["крайняя северная точка", "крайняя южная точка"] : ["крайняя западная точка", "крайняя восточная точка"];
    b = `<p class="task-title">Определите протяжённость ${esc(t.name)} ${esc(t.how)}, в градусах и километрах, применив градусную сеть ${esc(t.map)}. Следуйте алгоритму и все расчёты выполните в тесте.</p>
      <div class="step"><b>1)</b> Определите ${lat ? "географическую широту" : "географическую долготу"} обеих точек (допустимое отклонение ±2°):
        <div class="row"><span class="lbl">${pt[0]}:</span>${inp(`${tk}.a`, "°", "deg")}<span>°</span>${sel(`${tk}.ah`, HEMS[t.axis])}</div>
        <div class="row"><span class="lbl">${pt[1]}:</span>${inp(`${tk}.b`, "°", "deg")}<span>°</span>${sel(`${tk}.bh`, HEMS[t.axis])}</div></div>
      <div class="step"><b>2)</b> Вычислите расстояние в градусах: ${inp(`${tk}.d`, "например: 10° + 20° = 30°")}</div>
      <div class="step"><b>3)</b> Укажите длину дуги 1° ${lat ? "меридиана" : "экватора"} в километрах: ${inp(`${tk}.k`, "км")}</div>
      <div class="step"><b>4)</b> Рассчитайте расстояние в километрах: ${inp(`${tk}.km`, "например: 30° × 111 км = 3330 км")}</div>`;
  } else if (t.type === "alt") {
    b = `<p class="task-title">${altText(t)} Следуйте алгоритму и выполните все вычисления в тесте.</p>` +
      altSteps(t).map((s, i) => `<div class="step"><b>${i + 1})</b> ${s} ${inp(`${tk}.s${i + 1}`, i === 1 ? "например: 0,6 °С на 100 м" : "Расчёт и ответ")}</div>`).join("");
  } else if (t.type === "demo") {
    b = `<p class="task-title">В таблице представлены некоторые статистические данные о демографической ситуации ${esc(t.country)}. Проанализируйте данные и выполните задания.</p>
      <div class="table-wrap"><table class="data-tb"><caption>Демографические показатели населения ${esc(t.country)}</caption>
      <tr><th>Демографические показатели</th>${t.years.map((y) => `<th>${y}</th>`).join("")}</tr>
      ${t.rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>
      <div class="muted" style="font-size:13px;text-align:right">${t.note ? esc(t.note) + " " : ""}Данные округлены для учебного задания.</div></div>` + items(t, tk);
  } else if (t.type === "statement") {
    b = `<blockquote class="quote">«${esc(t.quote)}»</blockquote><p class="task-title">Исходя из этого утверждения, выполните задания:</p>` + items(t, tk);
  }
  return (SECTIONS[t.n] ? `<div class="ss-sec">${SECTIONS[t.n]}</div>` : "") + `<section class="card task" id="task${t.n}">${head(t)}${b}</section>`;
}

function startWork() {
  const v = VARIANTS.find((x) => x.id === S.variant);
  $("#hWho").textContent = `${S.name} · ${S.cls} · вариант ${S.variant}`;
  app.innerHTML = `<section class="card so-intro">
      <div class="ss-ribbon">🎓 Пробная сессия · вариант ${S.variant}</div>
      <h2>${esc(TEST.title)}</h2>
      <p class="muted">${esc(TEST.subtitle)} · ${TEST.minutes} минут · максимум ${TEST.max} балл · пользуйтесь атласом</p>
      <div class="plan">${TEST.plan.map(([a, b]) => `<span><b>${a}</b>${b}</span>`).join("")}</div>
      <nav class="ss-nav">${v.tasks.map((t) => `<a href="#task${t.n}" data-nav="${t.n}">${t.n}</a>`).join("")}</nav>
    </section>` + v.tasks.map(render).join("");
  bind();
  $("#bottomBar").hidden = false; $("#timer").hidden = false;
  $("#btnSubmit").onclick = askSubmit;
  active = true; finishing = false;
  tick(); clearInterval(timerId); timerId = setInterval(tick, 1000);
  updateProgress(); watchRecord();
  window.scrollTo(0, 0);
}

function bind() {
  const A = S.answers;
  const put = (el) => {
    const [t, f] = el.dataset.a.split(".");
    A[t] = A[t] || {};
    A[t][f] = el.value;
    if (el.type === "radio") {
      el.closest(".tf-row")?.querySelectorAll(".pill").forEach((p) => p.classList.toggle("on", p.contains(el) && el.checked));
      if (t === "t1") el.closest(".tf-item").querySelector(".fix").hidden = el.value !== "F";
    }
    changed();
  };
  app.querySelectorAll("[data-a]").forEach((el) => {
    if (el.type === "radio" || el.tagName === "SELECT") el.onchange = () => put(el);
    else el.oninput = () => put(el);
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
function taskDone(n) {
  const a = S.answers["t" + n] || {};
  return Object.values(a).some((x) => String(x ?? "").trim() !== "");
}
function updateProgress() {
  const v = VARIANTS.find((x) => x.id === S.variant);
  let n = 0;
  for (const t of v.tasks) { const d = taskDone(t.n); if (d) n++; $(`[data-nav="${t.n}"]`)?.classList.toggle("done", d); }
  $("#progress").textContent = `Начато заданий: ${n} из ${v.tasks.length}`;
  return n;
}

// ---------- таймер ----------
function tick() {
  const left = Math.max(0, S.deadline - Date.now());
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  const el = $("#timer");
  el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  el.classList.toggle("low", left < 10 * 60000);
  if (left <= 0) finish("timeout");
}

// ---------- сдача ----------
function askSubmit() {
  const n = updateProgress(), all = VARIANTS[0].tasks.length;
  modal(`<h2>Сдать работу?</h2><p>Начато заданий: <b>${n} из ${all}</b>.${n < all ? " Некоторые задания не заполнены." : ""}</p>
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
  closeModal();
  $("#bottomBar").hidden = true; $("#timer").hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const auto = reason && reason !== "manual";
  app.innerHTML = `<div class="card center">
    <div class="ss-ribbon">🎓 Пробная сессия · география 11</div>
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
      if (S?.answers) update(ref(db, `${P}/${S.id}`), { answers: S.answers }).catch(() => {});   // последние ответы — учителю
      finishing = true; active = false; clearInterval(timerId); showDone(r.reason || "teacher");
    }
  });
}

// ---------- защита («закрытый экран») ----------
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
