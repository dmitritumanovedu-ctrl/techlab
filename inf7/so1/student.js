// Суммативное оценивание · Информатика 7 · Модуль 1 · страница ученика
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
const TOTAL_ITEMS = 4 + 3 + 4 + 3 + 3 + 11 + 4 + 2 + 1;

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
    <div class="so-ribbon">🏁 Суммативное оценивание по модулю 1</div>
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
    <div class="so-ribbon">🏁 Суммативное оценивание · информатика 7</div>
    <h2>Перед началом прочитайте правила</h2>
    <p><b>${esc(name)}</b>, ${esc(cls)}. На работу даётся <b>${WORK.minutes} минут</b>, максимум — <b>${WORK.max} баллов</b>.
      9 заданий: выбор ответа, верно/неверно, системы счисления, кодирование, квест «Мастерская», сети, безопасность. Каждый получает <b>свой вариант</b>.</p>
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
const T = (v, n) => v.tasks.find((t) => t.n === n);
function head(t) {
  return `<div class="task-head"><span class="task-num">Задание ${t.n}</span><span class="pts">${t.points} б.</span></div><p class="task-title">${esc(t.title)}</p>`;
}
const radio = (name, val, checked, text) =>
  `<label class="opt ${checked ? "on" : ""}"><input type="radio" name="${name}" value="${val}" ${checked ? "checked" : ""}> <span>${esc(text)}</span></label>`;

function render(t) {
  const A = S.answers;
  let b = "";
  if (t.type === "mcq") {
    b = t.items.map((it, i) => `<div class="sub"><div class="sub-q"><b>${"абвг"[i]})</b> ${esc(it.q)}</div>
      <div class="opts">${it.options.map((o) => radio(`t1_${it.id}`, o.id, A.t1?.[it.id] === o.id, o.text)).join("")}</div></div>`).join("");
  } else if (t.type === "tf") {
    b = t.items.map((it) => { const a = A.t2?.[it.id] || {};
      return `<div class="tf-item"><div><span class="concept">${it.id}) ${esc(it.concept)}</span> — ${esc(it.text)}</div>
        <div class="tf-row">
          <label class="pill ${a.v === "T" ? "on" : ""}"><input type="radio" name="t2_${it.id}" value="T" ${a.v === "T" ? "checked" : ""}> Верно</label>
          <label class="pill ${a.v === "F" ? "on" : ""}"><input type="radio" name="t2_${it.id}" value="F" ${a.v === "F" ? "checked" : ""}> Неверно</label></div>
        <div class="fix" ${a.v === "F" ? "" : "hidden"}><input type="text" data-fix="${it.id}" maxlength="300" placeholder="Как будет правильно?" value="${esc(a.fix || "")}"></div></div>`; }).join("");
  } else if (t.type === "conv") {
    b = `<div class="hint">Пишите только цифры. Двоичное число — из 0 и 1, без пробелов. Считайте на черновике.</div>
      <div class="conv">${t.items.map((it) => `<div class="cv"><span class="cv-l">${it.id})</span>
        <span class="num">${esc(it.v)}<sub>${it.from}</sub></span><span class="eq">=</span>
        <input type="text" data-k="t3" data-id="${it.id}" inputmode="numeric" maxlength="12" value="${esc(A.t3?.[it.id] || "")}" placeholder="?"><sub>${it.to}</sub></div>`).join("")}</div>`;
  } else if (t.type === "units") {
    b = `<div class="hint">1 байт = 8 бит · 1 Кбайт = 1024 байта</div>` + t.items.map((it) => `<div class="un"><span class="cv-l">${it.id})</span><span class="un-q">${esc(it.q)}</span>
      <span class="un-a"><input type="text" data-k="t4" data-id="${it.id}" inputmode="numeric" maxlength="10" value="${esc(A.t4?.[it.id] || "")}" placeholder="?"> ${esc(it.unit)}</span></div>`).join("");
  } else if (t.type === "code") {
    const a = A.t5 || {};
    b = `<div class="code-wrap"><table class="ctab"><caption>Таблица кодов (фрагмент)</caption><tr><th>Буква</th>${t.table.map((x) => `<td><b>${x.ch}</b></td>`).join("")}</tr>
      <tr><th>Код (10)</th>${t.table.map((x) => `<td>${x.dec}</td>`).join("")}</tr></table></div>
      <div class="example">Пример: буква <b>A</b> имеет код 65 → 65<sub>10</sub> = <b>01000001</b><sub>2</sub> (8 бит, впереди дописываем нули).</div>
      <div class="sub"><div class="sub-q"><b>а) Декодируйте слово</b> (2 б.):</div>
        <div class="bytes">${t.decode.map((x) => `<span class="byte">${x}</span>`).join("")}</div>
        <label class="inl">Слово: <input type="text" data-dec maxlength="10" value="${esc(a.decode || "")}" placeholder="латинскими буквами" style="text-transform:uppercase"></label></div>
      <div class="sub"><div class="sub-q"><b>б) Закодируйте слово «${esc(t.encode)}»</b> — каждую букву 8 битами (2 б.):</div>
        <div class="enc">${[...t.encode].map((ch, i) => `<label class="inl"><b class="big">${ch}</b> → <input type="text" data-enc="${i}" inputmode="numeric" maxlength="8" value="${esc(a.encode?.[i] || "")}" placeholder="00000000" class="bin8"></label>`).join("")}</div></div>`;
  } else if (t.type === "pc") {
    const a = A.t6 || {}; const ch = a.chips || {};
    const chip = (c) => `<div class="chip" draggable="true" data-chip="${c.id}">${esc(c.text)}</div>`;
    b = `<div class="sub"><div class="sub-q"><b>а) Разложите детали по полкам мастерской</b> (4 б.). Нажмите на карточку, затем на нужную полку (или перетащите).</div>
      <div class="bank" data-col="-1">${t.chips.filter((c) => ch[c.id] == null || ch[c.id] < 0).map(chip).join("")}</div>
      <div class="cols">${t.columns.map((col, i) => `<div class="col" data-col="${i}"><h4>${esc(col)}</h4><div class="drop">${t.chips.filter((c) => Number(ch[c.id]) === i && ch[c.id] != null).map(chip).join("")}</div></div>`).join("")}</div></div>
      <div class="sub"><div class="sub-q"><b>б) Заказы клиентов</b> (3 б.). Выберите, что добавить или заменить.</div>
      ${t.situations.map((s, i) => `<div class="order"><div class="order-h">Заказ № ${i + 1}</div><div class="sub-q">${esc(s.q)}</div>
        <div class="opts">${s.options.map((o) => radio(`t6_${s.id}`, o.id, a.sit?.[s.id] === o.id, o.text)).join("")}</div></div>`).join("")}</div>`;
  } else if (t.type === "net") {
    const a = A.t7 || {};
    b = `<div class="net-wrap">${netSvg()}</div>
      <div class="sub"><div class="sub-q"><b>а)</b> Как называется устройство, обозначенное на схеме буквой <b>${t.ask}</b>? (1 б.)</div>
        <div class="opts row">${t.devOptions.map((o, i) => radio("t7_dev", i, Number(a.dev) === i && a.dev != null, o)).join("")}</div></div>
      <div class="sub"><div class="sub-q"><b>б)</b> Определите вид сети для каждой ситуации (3 б.).</div>
        ${t.items.map((it) => `<div class="net-it"><span>${it.id}) ${esc(it.q)}</span><select data-net="${it.id}"><option value="">— вид сети —</option>
          ${t.netOptions.map((o, i) => `<option value="${i}" ${String(a.items?.[it.id]) === String(i) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`).join("")}</div>`;
  } else if (t.type === "safe") {
    const a = A.t8 || {};
    b = `<div class="sub"><div class="sub-q"><b>а)</b> Какой пароль самый надёжный? (1 б.)</div>
        <div class="opts row">${t.pass.map((p, i) => radio("t8_pass", i, Number(a.pass) === i && a.pass != null, p)).join("")}</div></div>
      <div class="sub"><div class="sub-q"><b>б)</b> ${esc(t.open)} (3 б.)</div>
        <textarea data-safe maxlength="2000" placeholder="1) … 2) … 3) …">${esc(a.open || "")}</textarea></div>`;
  } else if (t.type === "open") {
    b = `<div class="situation">${esc(t.q)}</div><textarea data-open maxlength="3000" placeholder="Ваш развёрнутый ответ">${esc(A.t9 || "")}</textarea>`;
  }
  return `<section class="card task" id="task${t.n}">${head(t)}${b}</section>`;
}

function netSvg() {
  const pc = (x, y, n) => `<g transform="translate(${x},${y})"><rect x="0" y="0" width="58" height="40" rx="5" fill="#E8EDFF" stroke="#2E4BFF" stroke-width="2"/>
    <rect x="22" y="40" width="14" height="8" fill="#2E4BFF"/><rect x="12" y="48" width="34" height="4" rx="2" fill="#2E4BFF"/>
    <text x="29" y="25" text-anchor="middle" font-size="13" font-weight="700" fill="#0B1A3B">ПК ${n}</text></g>`;
  return `<svg viewBox="0 0 720 230" role="img" aria-label="Схема сети: четыре компьютера подключены к устройству X, устройство X подключено к устройству Y, а Y — к Интернету" class="net-svg">
    <g stroke="#556A92" stroke-width="2.5">
      <line x1="69" y1="72" x2="290" y2="120"/><line x1="169" y1="72" x2="300" y2="120"/><line x1="69" y1="190" x2="290" y2="140"/><line x1="169" y1="190" x2="300" y2="140"/>
      <line x1="370" y1="130" x2="450" y2="130"/><line x1="530" y1="130" x2="585" y2="130" stroke-dasharray="6 5"/></g>
    ${pc(40, 20, 1)}${pc(140, 20, 2)}${pc(40, 150, 3)}${pc(140, 150, 4)}
    <g><rect x="285" y="108" width="85" height="44" rx="8" fill="#FFF4DC" stroke="#B7791F" stroke-width="2"/>
      ${[0, 1, 2, 3, 4].map((i) => `<rect x="${296 + i * 13}" y="134" width="8" height="8" rx="1" fill="#B7791F"/>`).join("")}
      <text x="327" y="128" text-anchor="middle" font-size="20" font-weight="800" fill="#6B4B00">X</text></g>
    <g><rect x="450" y="108" width="80" height="44" rx="8" fill="#E3F8EF" stroke="#0B8A5A" stroke-width="2"/>
      <line x1="470" y1="108" x2="462" y2="88" stroke="#0B8A5A" stroke-width="3"/><line x1="510" y1="108" x2="518" y2="88" stroke="#0B8A5A" stroke-width="3"/>
      <text x="490" y="137" text-anchor="middle" font-size="20" font-weight="800" fill="#0B5F3E">Y</text></g>
    <g><ellipse cx="640" cy="130" rx="62" ry="40" fill="#F5F8FD" stroke="#8090B0" stroke-width="2"/>
      <text x="640" y="136" text-anchor="middle" font-size="16" font-weight="700" fill="#0B1A3B">Интернет</text></g>
    <text x="360" y="215" text-anchor="middle" font-size="13" fill="#556A92">Кабинет информатики</text>
  </svg>`;
}

function startWork() {
  const v = VARIANTS.find((x) => x.id === S.variant);
  $("#hWho").textContent = `${S.name} · ${S.cls} · вариант ${S.variant}`;
  app.innerHTML = `<section class="card so-intro">
      <div class="so-ribbon">🏁 Суммативное оценивание · вариант ${S.variant}</div>
      <h2>${esc(TEST.module)}</h2>
      <p class="muted">${esc(TEST.subtitle)} · ${TEST.minutes} минут · максимум ${TEST.max} баллов · можно пользоваться только черновиком</p>
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
  app.querySelectorAll('input[type=radio]').forEach((r) => r.onchange = () => {
    const [k, id] = r.name.split("_");
    if (k === "t1") { A.t1 = A.t1 || {}; A.t1[id] = r.value; }
    else if (k === "t2") { A.t2 = A.t2 || {}; A.t2[id] = A.t2[id] || {}; A.t2[id].v = r.value; r.closest(".tf-item").querySelector(".fix").hidden = r.value !== "F"; }
    else if (k === "t6") { A.t6 = A.t6 || {}; A.t6.sit = A.t6.sit || {}; A.t6.sit[id] = r.value; }
    else if (k === "t7") { A.t7 = A.t7 || {}; A.t7.dev = Number(r.value); }
    else if (k === "t8") { A.t8 = A.t8 || {}; A.t8.pass = Number(r.value); }
    setOn(r); changed();
  });
  app.querySelectorAll("[data-fix]").forEach((i) => i.oninput = () => { A.t2 = A.t2 || {}; A.t2[i.dataset.fix] = A.t2[i.dataset.fix] || {}; A.t2[i.dataset.fix].fix = i.value; changed(); });
  app.querySelectorAll("[data-k]").forEach((i) => i.oninput = () => { i.value = i.value.replace(/[^\d]/g, ""); (A[i.dataset.k] = A[i.dataset.k] || {})[i.dataset.id] = i.value; changed(); });
  const dec = app.querySelector("[data-dec]"); if (dec) dec.oninput = () => { dec.value = dec.value.toUpperCase().replace(/[^A-Z]/g, ""); A.t5 = A.t5 || {}; A.t5.decode = dec.value; changed(); };
  app.querySelectorAll("[data-enc]").forEach((i) => i.oninput = () => { i.value = i.value.replace(/[^01]/g, ""); A.t5 = A.t5 || {}; A.t5.encode = A.t5.encode || []; A.t5.encode[Number(i.dataset.enc)] = i.value; changed(); });
  app.querySelectorAll("[data-net]").forEach((s) => s.onchange = () => { A.t7 = A.t7 || {}; A.t7.items = A.t7.items || {}; A.t7.items[s.dataset.net] = s.value === "" ? null : Number(s.value); changed(); });
  const sf = app.querySelector("[data-safe]"); if (sf) sf.oninput = () => { A.t8 = A.t8 || {}; A.t8.open = sf.value; changed(); };
  const op = app.querySelector("[data-open]"); if (op) op.oninput = () => { A.t9 = op.value; changed(); };
  // мастерская: карточки
  const sec = $("#task6"); if (!sec) return;
  let sel = null;
  const place = (el, col) => {
    (col < 0 ? sec.querySelector(".bank") : sec.querySelector(`.col[data-col="${col}"] .drop`)).appendChild(el);
    A.t6 = A.t6 || {}; A.t6.chips = A.t6.chips || {}; A.t6.chips[el.dataset.chip] = col;
    el.classList.remove("sel"); sel = null; sec.querySelectorAll(".col").forEach((c) => c.classList.remove("target")); changed();
  };
  sec.addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (c) { e.stopPropagation(); if (sel === c) { c.classList.remove("sel"); sel = null; return; }
      sec.querySelectorAll(".chip.sel").forEach((x) => x.classList.remove("sel")); c.classList.add("sel"); sel = c;
      sec.querySelectorAll(".col").forEach((x) => x.classList.add("target")); return; }
    const z = e.target.closest("[data-col]"); if (z && sel) place(sel, Number(z.dataset.col));
  });
  sec.addEventListener("dragstart", (e) => { const c = e.target.closest(".chip"); if (c) e.dataTransfer.setData("text/plain", c.dataset.chip); });
  sec.querySelectorAll("[data-col]").forEach((z) => {
    z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("over"); });
    z.addEventListener("dragleave", () => z.classList.remove("over"));
    z.addEventListener("drop", (e) => { e.preventDefault(); z.classList.remove("over"); const c = sec.querySelector(`[data-chip="${e.dataTransfer.getData("text/plain")}"]`); if (c) place(c, Number(z.dataset.col)); });
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
  for (const k of ["a", "b", "c", "d"]) if (f(A.t1?.[k])) n++;
  for (const k of ["a", "b", "c"]) if (f(A.t2?.[k]?.v)) n++;
  for (const k of ["a", "b", "c", "d"]) if (f(A.t3?.[k])) n++;
  for (const k of ["a", "b", "c"]) if (f(A.t4?.[k])) n++;
  if (f(A.t5?.decode)) n++;
  n += (A.t5?.encode || []).filter((x) => String(x || "").length === 8).length;
  n += Object.values(A.t6?.chips || {}).filter((x) => x >= 0).length + Object.keys(A.t6?.sit || {}).length;
  if (f(A.t7?.dev)) n++;
  n += Object.values(A.t7?.items || {}).filter(f).length;
  if (f(A.t8?.pass)) n++; if (f(A.t8?.open)) n++;
  if (f(A.t9)) n++;
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
  closeModal();
  $("#bottomBar").hidden = true; $("#timer").hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const auto = reason && reason !== "manual";
  app.innerHTML = `<div class="card center">
    <div class="so-ribbon">🏁 Суммативное оценивание · информатика 7</div>
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
