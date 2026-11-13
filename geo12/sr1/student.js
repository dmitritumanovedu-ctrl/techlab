// Самостоятельная работа · География 12 · §5–8 · страница ученика
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, set, update, get, onValue, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "../../firebase-config.js";
import { TEST, VARIANTS } from "./questions.js?v=1";
const WORK = TEST;

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
const TOTAL_ITEMS = 3 + 3 + 3 + 4 + 3 + 1;

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
    <div class="sr-ribbon">✍️ Самостоятельная работа</div>
    <h2>Вход в работу</h2>
    <p class="muted">${esc(WORK.subtitle)}<br><b>${esc(WORK.module)}</b></p>
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
    <div class="sr-ribbon">✍️ Самостоятельная работа · география 12</div>
    <h2>Перед началом прочитайте правила</h2>
    <p><b>${esc(name)}</b>, ${esc(cls)}. На работу даётся <b>${WORK.minutes} минут</b>, максимум — <b>${WORK.max} баллов</b>.
      6 заданий в формате, близком к БАК: выбор ответа, верно/неверно, анализ диаграммы, карта, причины и следствия, ваше решение проблемы. Каждый получает <b>свой вариант</b>.</p>
    <div class="plan">${WORK.plan.map(([a, b]) => `<span><b>${a}</b>${b}</span>`).join("")}</div>
    <ul class="rules">
      <li>Работа откроется во <b>весь экран</b>. Не выходите из полноэкранного режима.</li>
      <li>Если вы <b>перейдёте на другую вкладку, в другое окно или программу, свернёте браузер</b> — работа будет <b>сдана автоматически</b>. Вернуться к ней будет нельзя.</li>
      <li>Учебник, телефон, калькулятор и другие источники использовать нельзя. Считайте на <b>черновике</b>.</li>
      <li>Копирование, вставка текста и правая кнопка мыши заблокированы. <b>Все попытки фиксируются</b> и видны учителю.</li>
      <li>Развёрнутые ответы пишите своими словами. Их проверяет учитель с помощью ИИ.</li>
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
let chart = null;
function head(t) {
  return `<div class="task-head"><span class="task-num">Задание ${t.n}</span><span class="pts">${t.points} б.</span></div><p class="task-title">${esc(t.title)}</p>`;
}
const radio = (name, val, checked, text) =>
  `<label class="opt ${checked ? "on" : ""}"><input type="radio" name="${name}" value="${val}" ${checked ? "checked" : ""}> <span>${esc(text)}</span></label>`;

function render(t) {
  const A = S.answers;
  let b = "";
  if (t.type === "mcq") {
    b = t.items.map((it, i) => `<div class="sub"><div class="sub-q"><b>${"абв"[i]})</b> ${esc(it.q)}</div>
      <div class="opts">${it.options.map((o) => radio(`t1_${it.id}`, o.id, A.t1?.[it.id] === o.id, o.text)).join("")}</div></div>`).join("");
  } else if (t.type === "tf") {
    b = t.items.map((it) => { const a = A.t2?.[it.id] || {};
      return `<div class="tf-item"><div><span class="concept">${it.id}) ${esc(it.concept)}</span> — ${esc(it.text)}</div>
        <div class="tf-row">
          <label class="pill ${a.v === "T" ? "on" : ""}"><input type="radio" name="t2_${it.id}" value="T" ${a.v === "T" ? "checked" : ""}> Верно</label>
          <label class="pill ${a.v === "F" ? "on" : ""}"><input type="radio" name="t2_${it.id}" value="F" ${a.v === "F" ? "checked" : ""}> Неверно</label></div>
        <div class="fix" ${a.v === "F" ? "" : "hidden"}><input type="text" data-fix="${it.id}" maxlength="400" placeholder="Напишите правильный вариант утверждения" value="${esc(a.fix || "")}"></div></div>`; }).join("");
  } else if (t.type === "chart") {
    const a = A.t3 || {};
    b = `<div class="chart-box ${t.chart.kind === "pie" ? "pie" : ""}"><canvas id="ch3"></canvas></div>
      <div class="sub"><div class="sub-q"><b>а)</b> ${esc(t.qa)} (1 б.)</div>
        <label class="inl"><input type="text" data-a inputmode="decimal" maxlength="12" value="${esc(a.a || "")}" placeholder="число"> ${esc(t.unitA)}</label>
        <span class="muted small">Дробную часть пишите через запятую.</span></div>
      <div class="sub"><div class="sub-q"><b>б)</b> Выберите вывод, который соответствует диаграмме. (1 б.)</div>
        <div class="opts one">${t.trend.map((x, i) => radio("t3_b", i, a.b != null && Number(a.b) === i, x)).join("")}</div></div>
      <div class="sub"><div class="sub-q"><b>в)</b> ${esc(t.qc)} (2 б.)</div>
        <textarea data-c maxlength="2000" placeholder="Причина → следствие. Опирайтесь на данные диаграммы и учебника.">${esc(a.c || "")}</textarea></div>`;
  } else if (t.type === "map") {
    const a = A.t4 || {};
    b = `<div class="map-box" id="mapBox"></div>
      <div class="map-ans">${t.markers.map((m) => `<label><b class="ml">${m.letter}</b><select data-map="${m.letter}"><option value="">— выберите —</option>
        ${t.options.map((o, i) => `<option value="${i}" ${a[m.letter] != null && String(a[m.letter]) === String(i) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`).join("")}</div>`;
  } else if (t.type === "cause") {
    const a = A.t5 || {};
    b = t.causes.map((c) => `<div class="cz"><div class="cz-c"><span class="cz-l">${c.id})</span> ${esc(c.text)}</div><span class="cz-arrow" aria-hidden="true">→</span>
      <select data-cause="${c.id}"><option value="">— последствие —</option>${t.options.map((o, i) => `<option value="${i}" ${a[c.id] != null && String(a[c.id]) === String(i) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`).join("");
  } else if (t.type === "open") {
    b = `<textarea data-open maxlength="2500" placeholder="Мера 1: … — потому что … &#10;Мера 2: … — потому что …">${esc(A.t6 || "")}</textarea>`;
  }
  return `<section class="card task" id="task${t.n}">${head(t)}${b}</section>`;
}

const PAL = ["#2E4BFF", "#F2994A", "#27AE9B", "#E5484D", "#8B5CF6"];
function drawChart(c) {
  const Chart = window.Chart, el = document.getElementById("ch3");
  if (!Chart || !el) { if (el) el.parentElement.innerHTML = '<p class="muted">Не удалось загрузить диаграмму. Обновите страницу.</p>'; return; }
  const pie = c.kind === "pie";
  const values = { id: "values", afterDatasetsDraw(ch) {
    const { ctx } = ch; ctx.save(); ctx.font = "600 12px Manrope, Arial"; ctx.textAlign = "center";
    ch.data.datasets.forEach((ds, di) => ch.getDatasetMeta(di).data.forEach((el, i) => {
      const lab = String(ds.data[i]).replace(".", ",") + (pie ? " %" : "");
      if (pie) { const p = el.tooltipPosition(); ctx.fillStyle = "#fff"; ctx.fillText(lab, p.x, p.y); }
      else { ctx.fillStyle = "#0B1A3B"; ctx.fillText(lab, el.x, el.y - 7); }
    })); ctx.restore(); } };
  chart = new Chart(el, {
    type: c.kind, plugins: [values],
    data: { labels: c.labels, datasets: c.series.map((s, i) => ({ label: s.name, data: s.data,
      backgroundColor: pie ? PAL.slice(0, s.data.length) : PAL[i], borderColor: pie ? "#fff" : PAL[i], borderWidth: 2, tension: 0.2, pointRadius: 4 })) },
    options: { responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { top: 22 } },
      plugins: { title: { display: true, text: c.title, font: { size: 14 } }, legend: { display: pie || c.series.length > 1, position: pie ? "right" : "top" } },
      scales: pie ? {} : { y: { beginAtZero: true, title: { display: true, text: c.unit } } } },
  });
}

let worldP = null;
async function drawMap(box, markers) {
  box.innerHTML = '<div class="map-loading">Загрузка карты…</div>';
  try {
    worldP = worldP || fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json").then((r) => r.json());
    const world = await worldP, d3 = window.d3, topojson = window.topojson;
    const countries = topojson.feature(world, world.objects.countries).features.filter((f) => f.properties.name !== "Antarctica");
    const W = 960, H = 470, proj = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: "Sphere" }), path = d3.geoPath(proj);
    const marked = new Set(markers.map((m) => m.iso));
    const svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("class", "density-map").attr("role", "img").attr("aria-label", "Политическая карта мира с четырьмя отмеченными странами");
    svg.append("path").attr("d", path({ type: "Sphere" })).attr("fill", "#dcecf5").attr("stroke", "#9bb6c6");
    svg.append("path").attr("d", path(d3.geoGraticule10())).attr("fill", "none").attr("stroke", "#c3d8e4").attr("stroke-width", 0.5);
    svg.append("g").selectAll("path").data(countries).join("path").attr("d", path)
      .attr("fill", (f) => marked.has(String(f.id).padStart(3, "0")) ? "#FFE7A8" : "#F3F1EA").attr("stroke", "#8a8a8a").attr("stroke-width", 0.4);
    svg.append("g").selectAll("path").data(countries.filter((f) => f.id != null && marked.has(String(f.id).padStart(3, "0"))))
      .join("path").attr("d", path).attr("fill", "none").attr("stroke", "#c0262d").attr("stroke-width", 2);
    // тропики и экватор
    for (const lat of [23.44, 0, -23.44]) svg.append("path").attr("d", path({ type: "LineString", coordinates: d3.range(-180, 181, 5).map((x) => [x, lat]) }))
      .attr("fill", "none").attr("stroke", lat ? "#E0A93B" : "#C0262D").attr("stroke-dasharray", "5 4").attr("stroke-width", 1);
    const g = svg.append("g");
    for (const m of markers) {
      const [x, y] = proj([m.lon, m.lat]);
      g.append("circle").attr("cx", x).attr("cy", y).attr("r", 12).attr("fill", "#fff").attr("stroke", "#c0262d").attr("stroke-width", 2.5);
      g.append("text").attr("x", x).attr("y", y + 5).attr("text-anchor", "middle").attr("font-size", 15).attr("font-weight", 700).attr("fill", "#c0262d").text(m.letter);
    }
    box.innerHTML = ""; box.appendChild(svg.node());
    const lg = document.createElement("div"); lg.className = "map-legend";
    lg.innerHTML = `<span><i style="background:none;border:0;border-top:2px dashed #C0262D;height:0"></i>экватор</span><span><i style="background:none;border:0;border-top:2px dashed #E0A93B;height:0"></i>тропики</span>`;
    box.appendChild(lg);
  } catch (e) { box.innerHTML = '<div class="map-loading">Не удалось загрузить карту. Проверьте интернет и обновите страницу.</div>'; }
}

function startWork() {
  const v = VARIANTS.find((x) => x.id === S.variant);
  $("#hWho").textContent = `${S.name} · ${S.cls} · вариант ${S.variant}`;
  app.innerHTML = `<section class="card so-intro">
      <div class="sr-ribbon">✍️ Самостоятельная работа · вариант ${S.variant}</div>
      <h2>${esc(TEST.module)}</h2>
      <p class="muted">${esc(TEST.subtitle)} · ${TEST.minutes} минут · максимум ${TEST.max} баллов · формат, близкий к заданиям БАК</p>
      <div class="plan">${TEST.plan.map(([a, b]) => `<span><b>${a}</b>${b}</span>`).join("")}</div>
    </section>` + v.tasks.map(render).join("");
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
  const setOn = (input) => input.closest(".opts, .tf-row")?.querySelectorAll(".opt, .pill").forEach((o) => o.classList.toggle("on", o.contains(input) && input.checked));
  app.querySelectorAll("input[type=radio]").forEach((r) => r.onchange = () => {
    const [k, id] = r.name.split("_");
    if (k === "t1") { A.t1 = A.t1 || {}; A.t1[id] = r.value; }
    else if (k === "t2") { A.t2 = A.t2 || {}; A.t2[id] = A.t2[id] || {}; A.t2[id].v = r.value; r.closest(".tf-item").querySelector(".fix").hidden = r.value !== "F"; }
    else if (k === "t3") { A.t3 = A.t3 || {}; A.t3.b = Number(r.value); }
    setOn(r); changed();
  });
  app.querySelectorAll("[data-fix]").forEach((i) => i.oninput = () => { A.t2 = A.t2 || {}; A.t2[i.dataset.fix] = A.t2[i.dataset.fix] || {}; A.t2[i.dataset.fix].fix = i.value; changed(); });
  const ia = app.querySelector("[data-a]"); if (ia) ia.oninput = () => { ia.value = ia.value.replace(/[^\d,.\-]/g, ""); A.t3 = A.t3 || {}; A.t3.a = ia.value; changed(); };
  const ic = app.querySelector("[data-c]"); if (ic) ic.oninput = () => { A.t3 = A.t3 || {}; A.t3.c = ic.value; changed(); };
  app.querySelectorAll("[data-map]").forEach((s) => s.onchange = () => { A.t4 = A.t4 || {}; A.t4[s.dataset.map] = s.value === "" ? null : Number(s.value); changed(); });
  app.querySelectorAll("[data-cause]").forEach((s) => s.onchange = () => { A.t5 = A.t5 || {}; A.t5[s.dataset.cause] = s.value === "" ? null : Number(s.value); changed(); });
  const op = app.querySelector("[data-open]"); if (op) op.oninput = () => { A.t6 = op.value; changed(); };
  const tc = v.tasks.find((t) => t.type === "chart"); if (tc) { chart?.destroy(); drawChart(tc.chart); }
  const tm = v.tasks.find((t) => t.type === "map"); if (tm) drawMap($("#mapBox"), tm.markers);
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
  for (const k of ["a", "b", "c"]) if (f(A.t1?.[k])) n++;
  for (const k of ["a", "b", "c"]) if (f(A.t2?.[k]?.v)) n++;
  for (const k of ["a", "b", "c"]) if (f(A.t3?.[k])) n++;
  n += Object.values(A.t4 || {}).filter(f).length;
  n += Object.values(A.t5 || {}).filter(f).length;
  if (f(A.t6)) n++;
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
  closeModal(); chart?.destroy(); chart = null;
  $("#bottomBar").hidden = true; $("#timer").hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const auto = reason && reason !== "manual";
  app.innerHTML = `<div class="card center">
    <div class="sr-ribbon">✍️ Самостоятельная работа · география 12</div>
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

// ---------- модальное окно ----------
function modal(html) {
  closeModal();
  const o = document.createElement("div"); o.className = "overlay"; o.id = "overlay";
  o.innerHTML = `<div class="card">${html}</div>`;
  document.body.appendChild(o);
}
function closeModal() { $("#overlay")?.remove(); }
