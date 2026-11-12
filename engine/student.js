import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, set, update, get, onValue, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "../firebase-config.js";
import { drawMap } from "./map.js";
// Вопросы берутся из questions.js в папке открытого теста
const { TEST, VARIANTS } = await import(new URL("questions.js", location.href).href);

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const LS_KEY = "techlab_attempt_" + TEST.id;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

if (!firebaseConfig || String(firebaseConfig.apiKey || "").includes("ВСТАВЬТЕ")) {
  app.innerHTML = `<div class="card center"><h2>Тест ещё не подключён</h2>
    <p>Учителю нужно вставить настройки Firebase в файл <b>firebase-config.js</b>.</p></div>`;
  throw new Error("firebase-config not set");
}
const db = getDatabase(initializeApp(firebaseConfig));
const resultsPath = `results/${TEST.id}`;

// ---------- состояние ----------
let S = null;          // { id, name, cls, variant, deadline, answers }
let active = false;    // идёт тест и включена защита
let finishing = false;
let timerId = null, saveTimer = null, blurTimer = null;
let charts = [];

// ---------- старт ----------
init();
async function init() {
  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    try {
      const snap = await get(ref(db, `${resultsPath}/${saved}`));
      const r = snap.val();
      // Работа со старого урока (время вышло больше 5 минут назад) — компьютер свободен для следующего ученика
      if (r && Date.now() > (r.deadline || 0) + 5 * 60000) {
        if (r.status === "in_progress") {
          await update(ref(db, `${resultsPath}/${saved}`), { status: "submitted", reason: "timeout", submittedAt: serverTimestamp() }).catch(() => {});
        }
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

function showLogin() {
  app.innerHTML = `
  <div class="card center">
    <h2>Вход в тест</h2>
    <p class="muted">${esc(TEST.subtitle)}</p>
    <label class="f" for="inName">Фамилия и имя</label>
    <input type="text" id="inName" autocomplete="off" maxlength="60" placeholder="Например: Попеску Андрей">
    <label class="f" for="inCls">Класс</label>
    <select id="inCls"><option value="">— выберите класс —</option>
      ${TEST.classes.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
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
  <div class="card center" style="max-width:680px">
    <h2>⚠️ Внимательно прочитайте правила</h2>
    <p><b>${esc(name)}</b>, ${esc(cls)}. На работу даётся <b>${TEST.minutes} минут</b>. В тесте 10 заданий, максимум — ${TEST.max} баллов.</p>
    <ul class="rules">
      <li>Тест откроется во <b>весь экран</b>. Не выходите из полноэкранного режима.</li>
      <li>Если вы <b>перейдёте на другую вкладку, в другое окно или программу, свернёте браузер</b> — работа будет <b>сдана автоматически</b> с тем, что вы успели ответить. Вернуться к ней будет нельзя.</li>
      <li>Копирование, вставка текста, правая кнопка мыши и инструменты разработчика заблокированы. <b>Все попытки фиксируются</b> и видны учителю.</li>
      <li>Не обновляйте и не закрывайте страницу — закрытие тоже приводит к автосдаче.</li>
      <li>Ответы сохраняются автоматически. Когда время закончится, работа сдастся сама.</li>
      <li>Каждый получает <b>свой вариант</b> — списывать у соседа бесполезно.</li>
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
      const open = (await get(ref(db, `settings/${TEST.id}/open`))).val();
      if (!open) { $("#err").textContent = "Тест ещё не открыт учителем. Подождите и нажмите ещё раз."; b.disabled = false; b.textContent = "Начать тест"; return; }
      await enterFullscreen();
      const variant = 1 + Math.floor(Math.random() * VARIANTS.length);
      const now = Date.now();
      const rec = {
        name, cls, variant, status: "in_progress", startedAt: now, deadline: now + TEST.minutes * 60000,
        updatedAt: serverTimestamp(), violations: 0, answers: {}, ua: navigator.userAgent.slice(0, 120),
      };
      const r = push(ref(db, resultsPath));
      await set(r, rec);
      localStorage.setItem(LS_KEY, r.key);
      S = { id: r.key, name, cls, variant, deadline: rec.deadline, answers: {}, viol: 0 };
      startTest();
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
  $("#btnCont").onclick = async () => { await enterFullscreen(); startTest(); };
}

// ---------- тест ----------
function startTest() {
  const v = VARIANTS.find((x) => x.id === S.variant);
  $("#hWho").textContent = `${S.name} · ${S.cls} · вариант ${S.variant}`;
  app.innerHTML = v.tasks.map(renderTask).join("");
  for (const t of v.tasks) bindTask(t);
  $("#bottomBar").hidden = false;
  $("#timer").hidden = false;
  $("#btnSubmit").onclick = askSubmit;
  active = true; finishing = false;
  tick(); clearInterval(timerId); timerId = setInterval(tick, 1000);
  updateProgress();
  watchRecord();
  window.scrollTo(0, 0);
}

function head(t) {
  return `<div class="task-head"><span class="task-num">Задание ${t.n}</span><span class="pts">${t.points} б.</span></div>
          <p class="task-title">${esc(t.title)}</p>`;
}

function renderTask(t) {
  const A = S.answers;
  let body = "";
  if (t.type === "tf") {
    const a = A.t1 || {};
    body = t.items.map((it) => {
      const v = a[it.id]?.v;
      return `<div class="tf-item" data-item="${it.id}">
        <div><span class="concept">${it.id}) ${esc(it.concept)}</span> — ${esc(it.text)}</div>
        <div class="tf-row">
          <label class="pill ${v === "T" ? "on" : ""}"><input type="radio" name="t1_${it.id}" value="T" ${v === "T" ? "checked" : ""}> Верно</label>
          <label class="pill ${v === "F" ? "on" : ""}"><input type="radio" name="t1_${it.id}" value="F" ${v === "F" ? "checked" : ""}> Неверно</label>
        </div>
        <div class="fix" ${v === "F" ? "" : "hidden"}>
          <input type="text" data-fix="${it.id}" maxlength="300" placeholder="Напишите правильный вариант утверждения" value="${esc(a[it.id]?.fix || "")}">
        </div></div>`;
    }).join("");
  } else if (t.type === "classify") {
    const a = A.t2 || {};
    const chip = (c) => `<div class="chip" draggable="true" data-chip="${c.id}">${esc(c.text)}</div>`;
    body = `<div class="bank" data-col="-1">${t.chips.filter((c) => a[c.id] == null || a[c.id] < 0).map(chip).join("")}</div>
      <div class="cols">${t.columns.map((col, i) => `<div class="col" data-col="${i}"><h4>${esc(col)}</h4>
        <div class="drop">${t.chips.filter((c) => Number(a[c.id]) === i && a[c.id] != null).map(chip).join("")}</div></div>`).join("")}</div>`;
  } else if (t.type === "mcq") {
    body = t.options.map((o) => `<label class="opt ${A.t3 === o.id ? "on" : ""}"><input type="radio" name="t3" value="${o.id}" ${A.t3 === o.id ? "checked" : ""}> <span>${esc(o.text)}</span></label>`).join("");
  } else if (t.type === "chart") {
    body = `<div class="chart-box ${t.chart.kind === "pie" ? "pie" : ""}"><canvas id="ch${t.n}"></canvas></div>
      <textarea data-open="t${t.n}" maxlength="3000" placeholder="Ваш ответ: опишите диаграмму, используя данные, и объясните причины">${esc(A["t" + t.n] || "")}</textarea>`;
  } else if (t.type === "open") {
    body = `<textarea data-open="t${t.n}" maxlength="3000" placeholder="Ваш развёрнутый ответ">${esc(A["t" + t.n] || "")}</textarea>`;
  } else if (t.type === "mapid") {
    const a = A.t9 || {};
    body = `<div class="map-box" id="mapBox"></div><div class="grid2" style="margin-top:12px">
      ${t.markers.map((m) => `<label><b>${m.letter}</b> — <select data-map="${m.letter}"><option value="">— выберите страну —</option>
        ${t.options.map((o) => `<option ${a[m.letter] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`).join("")}</div>`;
  } else if (t.type === "mapcalc") {
    const a = A.t10 || {};
    body = `<p class="muted">Страна E отмечена на карте в задании 9.</p>
      <div class="formula">D = Np / St, где Np — численность населения, St — площадь территории</div>
      <div class="grid2">
        <label>а) Плотность, чел./км²<input type="text" data-calc="d" inputmode="decimal" maxlength="20" value="${esc(a.d || "")}" placeholder="например 125,4"></label>
        <label>б) Категория по легенде<select data-calc="cat"><option value="">— выберите —</option>
          ${TEST.cats.map((c) => `<option value="${c.c}" ${a.cat === c.c ? "selected" : ""}>${c.c} — ${esc(c.label)}</option>`).join("")}</select></label>
      </div>
      <label class="f">в) Объяснение</label>
      <textarea data-calc="why" maxlength="1500" style="min-height:80px">${esc(a.why || "")}</textarea>`;
  }
  return `<section class="card task" id="task${t.n}">${head(t)}${body}</section>`;
}

function bindTask(t) {
  const sec = $(`#task${t.n}`);
  const A = S.answers;
  if (t.type === "tf") {
    sec.querySelectorAll("input[type=radio]").forEach((r) => r.onchange = () => {
      const id = r.name.slice(3);
      A.t1 = A.t1 || {}; A.t1[id] = A.t1[id] || {}; A.t1[id].v = r.value;
      const item = r.closest(".tf-item");
      item.querySelectorAll(".pill").forEach((p) => p.classList.toggle("on", p.contains(r)));
      item.querySelector(".fix").hidden = r.value !== "F";
      changed();
    });
    sec.querySelectorAll("[data-fix]").forEach((inp) => inp.oninput = () => {
      const id = inp.dataset.fix; A.t1 = A.t1 || {}; A.t1[id] = A.t1[id] || {}; A.t1[id].fix = inp.value; changed();
    });
  } else if (t.type === "classify") {
    let sel = null;
    const place = (chipEl, col) => {
      const target = col < 0 ? sec.querySelector(".bank") : sec.querySelector(`.col[data-col="${col}"] .drop`);
      target.appendChild(chipEl);
      A.t2 = A.t2 || {}; A.t2[chipEl.dataset.chip] = col;
      chipEl.classList.remove("sel"); sel = null;
      sec.querySelectorAll(".col").forEach((c) => c.classList.remove("target"));
      changed();
    };
    sec.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (chip) {
        e.stopPropagation();
        if (sel === chip) { chip.classList.remove("sel"); sel = null; sec.querySelectorAll(".col").forEach((c) => c.classList.remove("target")); return; }
        sec.querySelectorAll(".chip.sel").forEach((c) => c.classList.remove("sel"));
        chip.classList.add("sel"); sel = chip;
        sec.querySelectorAll(".col").forEach((c) => c.classList.add("target"));
        return;
      }
      const zone = e.target.closest("[data-col]");
      if (zone && sel) place(sel, Number(zone.dataset.col));
    });
    sec.addEventListener("dragstart", (e) => { const c = e.target.closest(".chip"); if (c) e.dataTransfer.setData("text/plain", c.dataset.chip); });
    sec.querySelectorAll("[data-col]").forEach((z) => {
      z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("over"); });
      z.addEventListener("dragleave", () => z.classList.remove("over"));
      z.addEventListener("drop", (e) => {
        e.preventDefault(); z.classList.remove("over");
        const c = sec.querySelector(`[data-chip="${e.dataTransfer.getData("text/plain")}"]`);
        if (c) place(c, Number(z.dataset.col));
      });
    });
  } else if (t.type === "mcq") {
    sec.querySelectorAll("input").forEach((r) => r.onchange = () => {
      A.t3 = r.value;
      sec.querySelectorAll(".opt").forEach((o) => o.classList.toggle("on", o.contains(r)));
      changed();
    });
  } else if (t.type === "chart" || t.type === "open") {
    if (t.type === "chart") drawChart(`ch${t.n}`, t.chart);
    const ta = sec.querySelector("textarea");
    ta.oninput = () => { A[ta.dataset.open] = ta.value; changed(); };
  } else if (t.type === "mapid") {
    const v = VARIANTS.find((x) => x.id === S.variant);
    const t10 = v.tasks.find((x) => x.type === "mapcalc");
    drawMap($("#mapBox"), [...t.markers, t10.marker]);
    sec.querySelectorAll("select").forEach((s) => s.onchange = () => { A.t9 = A.t9 || {}; A.t9[s.dataset.map] = s.value; changed(); });
  } else if (t.type === "mapcalc") {
    sec.querySelectorAll("[data-calc]").forEach((el) => {
      const h = () => { A.t10 = A.t10 || {}; A.t10[el.dataset.calc] = el.value; changed(); };
      el.oninput = h; el.onchange = h;
    });
  }
}

// ---------- диаграммы ----------
const PALETTE = ["#1f6f5c", "#d98a2b", "#3d7cc9", "#b8455a", "#7a5cc0", "#6b8e23", "#999"];
const valuesPlugin = {
  id: "values",
  afterDatasetsDraw(chart) {
    const { ctx } = chart; const pie = chart.config.type === "pie";
    ctx.save(); ctx.font = "600 12px Segoe UI, Arial"; ctx.fillStyle = "#1d2733";
    chart.data.datasets.forEach((ds, di) => {
      chart.getDatasetMeta(di).data.forEach((el, i) => {
        const val = ds.data[i]; const label = String(val).replace(".", ",") + (pie ? "%" : "");
        if (pie) {
          const p = el.tooltipPosition(); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(label, p.x, p.y);
        } else if (chart.options.indexAxis === "y") {
          ctx.textAlign = "left"; ctx.fillText(label, el.x + 4, el.y + 4);
        } else {
          ctx.textAlign = "center"; ctx.fillText(label, el.x, el.y - 6);
        }
      });
    });
    ctx.restore();
  },
};
function drawChart(id, c) {
  const Chart = window.Chart;
  if (!Chart) { document.getElementById(id).parentElement.innerHTML = '<p class="muted">Не удалось загрузить диаграмму. Обновите страницу.</p>'; return; }
  const type = c.kind === "barh" ? "bar" : c.kind;
  const pie = type === "pie";
  const datasets = c.series.map((s, i) => ({
    label: s.name, data: s.data,
    backgroundColor: pie ? PALETTE.slice(0, s.data.length) : PALETTE[i],
    borderColor: pie ? "#fff" : PALETTE[i], borderWidth: pie ? 2 : 2, tension: 0.25, pointRadius: 4, fill: false,
  }));
  const ch = new Chart(document.getElementById(id), {
    type, data: { labels: c.labels, datasets }, plugins: [valuesPlugin],
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      indexAxis: c.kind === "barh" ? "y" : "x",
      layout: { padding: { top: 18, right: c.kind === "barh" ? 50 : 10 } },
      plugins: { title: { display: true, text: c.title, font: { size: 15 } },
                 legend: { display: pie || c.series.length > 1, position: pie ? "right" : "top" } },
      scales: pie ? {} : { [c.kind === "barh" ? "x" : "y"]: { beginAtZero: true, title: { display: true, text: c.unit } } },
    },
  });
  charts.push(ch);
}

// ---------- сохранение ----------
function changed() {
  updateProgress();
  $("#savedState").textContent = "сохранение…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 2500);
}
async function saveNow() {
  if (!S || finishing) return;
  try {
    await update(ref(db, `${resultsPath}/${S.id}`), { answers: S.answers, updatedAt: serverTimestamp() });
    $("#savedState").textContent = "✓ сохранено";
  } catch (e) { $("#savedState").textContent = "⚠ нет связи, ответы сохранятся позже"; }
}
function updateProgress() {
  const A = S.answers; let n = 0;
  if (A.t1 && Object.values(A.t1).filter((x) => x.v).length === 3) n++;
  if (A.t2 && Object.values(A.t2).filter((x) => x >= 0).length >= 6) n++;
  if (A.t3) n++;
  for (const k of ["t4", "t5", "t6", "t7", "t8"]) if ((A[k] || "").trim()) n++;
  if (A.t9 && Object.values(A.t9).filter(Boolean).length === 4) n++;
  if (A.t10 && A.t10.d && A.t10.cat && (A.t10.why || "").trim()) n++;
  $("#progress").textContent = `Выполнено заданий: ${n} из 10`;
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
  modal(`<h2>Сдать работу?</h2><p>Выполнено заданий: <b>${n} из 10</b>.${n < 10 ? " Некоторые задания не заполнены." : ""}</p>
    <p class="muted">После сдачи изменить ответы будет нельзя.</p>
    <button class="btn" id="mYes">Да, сдать</button> <button class="btn ghost" id="mNo">Вернуться к тесту</button>`);
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
  const payloadEv = {};
  if (evType && active) {
    S.viol = (S.viol || 0) + 1;
    payloadEv.violations = S.viol;
    payloadEv[`events/${push(ref(db, `${resultsPath}/${S.id}/events`)).key}`] = { type: evType, at: Date.now() };
  }
  finishing = true; active = false;
  clearInterval(timerId); clearTimeout(saveTimer); clearTimeout(blurTimer);
  try {
    await update(ref(db, `${resultsPath}/${S.id}`), {
      answers: S.answers, status: "submitted", reason, submittedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...payloadEv,
    });
  } catch (e) { console.error(e); }
  showDone(reason);
}

function showDone(reason) {
  active = false;
  charts.forEach((c) => c.destroy()); charts = [];
  closeModal();
  $("#bottomBar").hidden = true; $("#timer").hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const auto = reason && reason !== "manual";
  app.innerHTML = `<div class="card center">
    <h2>${auto ? "⚠️ Работа сдана автоматически" : "✅ Работа сдана"}</h2>
    <p>${esc(REASONS[reason] || REASONS.manual)}</p>
    <p class="muted">${S ? esc(S.name) + ", " + esc(S.cls) + " · вариант " + S.variant : ""}</p>
    <p>Результат сообщит учитель. Эту вкладку можно закрыть.</p></div>`;
  watchRecord();
}

// Учитель может разрешить продолжить или завершить работу
let unwatch = null;
function watchRecord() {
  if (!S || unwatch) return;
  unwatch = onValue(ref(db, `${resultsPath}/${S.id}`), (snap) => {
    const r = snap.val(); if (!r) return;
    if (r.status === "in_progress" && !active && !finishing) {
      S.deadline = r.deadline; S.answers = r.answers || S.answers;
      resume(r);
    } else if (r.status === "in_progress" && finishing) {
      // учитель разрешил продолжить после автосдачи
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
  const evKey = push(ref(db, `${resultsPath}/${S.id}/events`)).key;
  update(ref(db, `${resultsPath}/${S.id}`), { violations: S.viol, [`events/${evKey}`]: { type, at: Date.now() } })
    .catch(() => { /* не мешаем тесту */ });
}

document.addEventListener("visibilitychange", () => {
  if (active && document.visibilityState === "hidden") { finish("tab", "уход со вкладки"); }
});
window.addEventListener("blur", () => {
  if (!active) return;
  clearTimeout(blurTimer);
  blurTimer = setTimeout(() => {
    if (active && !document.hasFocus()) { finish("blur", "переключение на другое окно"); }
  }, 400);
});
window.addEventListener("focus", () => clearTimeout(blurTimer));
window.addEventListener("pagehide", () => { if (active) finish("close", "закрытие/обновление страницы"); });
window.addEventListener("beforeunload", (e) => { if (active) { e.preventDefault(); e.returnValue = ""; } });

document.addEventListener("fullscreenchange", () => {
  if (active && !document.fullscreenElement) {
    logViolation("выход из полноэкранного режима");
    modal(`<h2>Вернитесь в полноэкранный режим</h2>
      <p>Выход из полноэкранного режима зафиксирован. Помните: переход на другую вкладку или окно приведёт к автосдаче.</p>
      <button class="btn" id="mFs">Вернуться к тесту</button>`);
    $("#mFs").onclick = async () => { closeModal(); await enterFullscreen(); };
  }
});
document.addEventListener("contextmenu", (e) => { if (active) { e.preventDefault(); } });
for (const ev of ["copy", "cut", "paste", "drop"]) {
  document.addEventListener(ev, (e) => {
    if (!active) return;
    if (ev === "drop" && e.target.closest?.("[data-col]")) return; // перетаскивание карточек разрешено
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
