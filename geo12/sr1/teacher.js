// Самостоятельная работа · География 12 · §5–8 · панель учителя: ключи, автопроверка, ИИ, PDF
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../../firebase-config.js";
import { SCALE, toGrade } from "../../engine/grading.js?v=5";
import { TEST, VARIANTS } from "./questions.js?v=1";

const WORK = TEST;
const ENTRY = { id: TEST.id, title: "Самостоятельная работа · Состояние окружающей среды (§5–8)", path: "geo12/sr1/", subject: "geo", grade: "12" };
const AI_SUBJECT = "география, 12 класс (самостоятельная работа в формате БАК по теме «Состояние окружающей среды в мире и в Республике Молдова»), Республика Молдова";
const TEACHER_SIGN = "Т. Д.";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
const fmtTime = (ms) => ms ? new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const norm = (s) => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const app = $("#app"), dlg = $("#dlg");

const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb), auth = getAuth(fb);
const P = `results/${WORK.id}`;

let RESULTS = {}, KEYS = null, AICFG = null, aiAuto = false, filterCls = "", search = "", openId = null, unsub = [], seen = new Set();
const aiQueue = [], aiQueued = new Set(); let aiBusy = false;

const TOPICS = { 1: "Выбор ответа", 2: "Верно / неверно", 3: "Анализ диаграммы", 4: "Работа с картой", 5: "Причины и следствия", 6: "Решение проблемы" };

// =====================================================================
//  Оценивание
// =====================================================================
const pnum = (x) => { const n = parseFloat(String(x ?? "").replace(/\s/g, "").replace(",", ".").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : null; };
function chartText(c) {
  return `Диаграмма «${c.title}» (${c.unit}): ` + c.series.map((s) => (c.series.length > 1 ? s.name + ": " : "") + c.labels.map((l, i) => `${l} — ${String(s.data[i]).replace(".", ",")}`).join("; ")).join(" | ");
}
function evaluate(r) {
  const v = VARIANTS.find((x) => x.id === r.variant), k = KEYS.variants[String(r.variant)];
  const A = r.answers || {}, M = r.manual || {}, AI = r.ai || {};
  const T = (n) => v.tasks.find((t) => t.n === n);
  const items = [];
  const add = (it) => {
    it.teacher = Number.isFinite(M[it.k]) ? M[it.k] : null;
    const a = AI[it.k]; it.ai = a && Number.isFinite(a.score) ? Math.max(0, Math.min(it.max, a.score)) : null; it.aiData = a || null;
    if (it.check && it.empty) it.auto = 0;
    it.score = it.teacher ?? it.ai ?? it.auto;
    items.push(it);
  };
  // 1
  T(1).items.forEach((it, i) => { const o = it.options.find((x) => x.id === A.t1?.[it.id]), ok = it.options.find((x) => x.id === k.t1[it.id]);
    add({ k: `t1${it.id}`, n: 1, label: `${"абв"[i]}) ${it.q}`, max: 1, answer: o?.text || "", key: ok.text, auto: A.t1?.[it.id] === k.t1[it.id] ? 1 : 0 }); });
  // 2
  for (const it of T(2).items) {
    const kk = k.t2[it.id], a = A.t2?.[it.id] || {};
    const mark = a.v === "T" ? "Верно" : a.v === "F" ? "Неверно" : "";
    if (kk.tf === "T") add({ k: `t2${it.id}`, n: 2, label: `${it.id}) ${it.text}`, max: 2, answer: mark, key: "Верно", auto: a.v === "T" ? 2 : 0 });
    else {
      add({ k: `t2${it.id}m`, n: 2, label: `${it.id}) ${it.text} — отметка`, max: 1, answer: mark, key: "Неверно", auto: a.v === "F" ? 1 : 0 });
      const fx = a.v === "F" ? String(a.fix || "") : "";
      const kw = (kk.kw || []).some((w) => norm(fx).includes(norm(w)));
      add({ k: `t2${it.id}f`, n: 2, label: `${it.id}) исправление`, max: 1, answer: fx, key: kk.fix, model: kk.fix, check: true, empty: !norm(fx),
        auto: kw ? 1 : null, question: `Ученику дано НЕВЕРНОЕ утверждение «${it.text}». Нужно написать правильный вариант. Верно: «${kk.fix}»`,
        criteria: "1 б. — ошибка исправлена по смыслу верно (формулировка может отличаться); 0 б. — исправление неверное или не по сути." });
    }
  }
  // 3
  { const t = T(3), a = A.t3 || {}, x = pnum(a.a), key = k.t3.a;
    add({ k: "t3a", n: 3, label: t.qa, max: 1, answer: a.a ? `${a.a} ${t.unitA}` : "", key: `${String(key).replace(".", ",")} ${t.unitA}`,
      auto: x !== null && Math.abs(x - key) <= Math.max(0.15, Math.abs(key) * 0.025) ? 1 : 0 });
    add({ k: "t3b", n: 3, label: "Вывод по диаграмме", max: 1, answer: a.b != null ? t.trend[a.b] : "", key: t.trend[k.t3.b], auto: a.b != null && Number(a.b) === k.t3.b ? 1 : 0 });
    add({ k: "t3c", n: 3, label: t.qc, max: 2, answer: String(a.c || ""), empty: !norm(a.c), check: true, auto: null,
      question: `${t.qc}\n${chartText(t.chart)}`, model: k.t3.model,
      criteria: "2 б. — названы верные причины/следствия, показана причинно-следственная связь, есть опора на данные; 1 б. — ответ верный, но неполный или без объяснения связи; 0 б. — неверно." }); }
  // 4
  { const t = T(4), a = A.t4 || {};
    for (const m of t.markers) add({ k: `t4${m.letter}`, n: 4, label: `Страна ${m.letter} (${k.t4names[m.letter]})`, max: 0.5,
      answer: a[m.letter] != null ? t.options[a[m.letter]] : "", key: t.options[k.t4[m.letter]], auto: a[m.letter] != null && Number(a[m.letter]) === k.t4[m.letter] ? 0.5 : 0 }); }
  // 5
  { const t = T(5), a = A.t5 || {};
    for (const c of t.causes) add({ k: `t5${c.id}`, n: 5, label: `${c.id}) ${c.text}`, max: 1, answer: a[c.id] != null ? t.options[a[c.id]] : "", key: t.options[k.t5[c.id]],
      auto: a[c.id] != null && Number(a[c.id]) === k.t5[c.id] ? 1 : 0 }); }
  // 6
  { const t = T(6); add({ k: "t6", n: 6, label: t.title, max: 2, answer: String(A.t6 || ""), empty: !norm(A.t6), check: true, auto: null, question: t.title, model: k.t6.model, criteria: k.t6.criteria }); }

  const max = items.reduce((s, i) => s + i.max, 0);
  const total = items.reduce((s, i) => s + (i.score ?? 0), 0);
  const auto = items.filter((i) => !i.check).reduce((s, i) => s + (i.score ?? 0), 0);
  const pending = items.filter((i) => i.score === null).length;
  const tasks = {};
  for (const it of items) { const tt = (tasks[it.n] = tasks[it.n] || { n: it.n, sum: 0, max: 0 }); tt.sum += it.score ?? 0; tt.max += it.max; }
  return { v, k, items, tasks, max, total, auto, pending, complete: !pending, grade: toGrade(total, max) };
}

// =====================================================================
//  Вход и панель
// =====================================================================
onAuthStateChanged(auth, async (user) => {
  unsub.forEach((u) => u()); unsub = [];
  if (!user) return showLogin();
  $("#who").innerHTML = `${esc(user.email)} · <a href="#" id="logout" style="color:#fff">выйти</a>`;
  $("#logout").onclick = (e) => { e.preventDefault(); signOut(auth); };
  try {
    KEYS = (await get(ref(db, `keys/${TEST.id}`))).val();
    if (!KEYS) return showKeysUpload();
    AICFG = (await get(ref(db, "keys/_ai"))).val();
    try { aiAuto = localStorage.getItem("techlab_ai_auto_so") === "1"; } catch (e) {}
  } catch (e) {
    app.innerHTML = `<div class="card center"><h2>Нет доступа</h2>
      <p>Этот аккаунт не имеет прав учителя. Войдите тем же Google-аккаунтом, что и в Центре управления.</p></div>`;
    return;
  }
  showDashboard();
});

function showLogin() {
  $("#who").textContent = "";
  app.innerHTML = `<div class="card center"><h2>Вход для учителя</h2>
    <p class="muted">Войдите через свой Google-аккаунт учителя.</p><div class="err" id="err"></div>
    <button class="btn" id="go">Войти через Google</button></div>`;
  $("#go").onclick = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { $("#err").textContent = "Не удалось войти: " + (e.code || e.message); }
  };
}

// =====================================================================
//  Панель
// =====================================================================
function showDashboard() {
  app.innerHTML = `<a class="backlink noprint" href="../../teacher/">← Центр управления</a>
  <div class="card pr-head">
    <div class="sr-ribbon">✍️ Самостоятельная работа · формат БАК</div>
    <h2 style="margin-bottom:4px">${esc(TEST.module)}</h2>
    <div class="muted">${esc(TEST.subtitle)} · ${VARIANTS.length} вариантов · ${TEST.minutes} минут · максимум ${TEST.max} баллов
      · 6 заданий: выбор, верно/неверно, диаграмма, карта, причина–следствие, решение проблемы; развёрнутые ответы проверяет ИИ</div>
    <div class="muted" id="pinInfo" style="font-size:14px;margin-top:8px"></div>
  </div>
  <div class="toolbar" style="margin-bottom:14px">
    <label class="switch"><input type="checkbox" id="swOpen"> <span id="swText">Работа закрыта</span></label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <select id="fCls" style="width:auto"><option value="">Все классы</option>${WORK.classes.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
      <input type="text" id="fSearch" placeholder="Поиск по фамилии" style="width:180px">
      <button class="btn small ghost" id="bAi">🤖 Проверить всё ИИ</button>
      <button class="btn small ghost" id="bPdf" title="Отчёты всех сданных работ (с учётом фильтра) — каждый с новой страницы">📄 PDF класса</button>
      <button class="btn small ghost" id="bCsv">Скачать CSV</button>
      <button class="btn small red" id="bClear">Очистить результаты</button>
    </div>
  </div>
  <div class="toolbar" style="margin-bottom:14px">
    <label class="switch"><input type="checkbox" id="swAi"> <span>🤖 Автоматически проверять развёрнутые ответы ИИ (пока открыта эта панель)</span></label>
    <span class="muted" id="aiStatus" style="font-size:14px"></span>
  </div>
  <div class="stats" id="stats" style="margin-bottom:14px"></div>
  <div class="table-wrap"><table class="res"><thead><tr>
    <th>№</th><th>Ученик</th><th>Класс</th><th>Вариант</th><th>Статус</th><th>Нарушения</th><th>Начало / сдано</th>
    <th>Авто-баллы</th><th>Итог</th><th>Оценка</th><th></th></tr></thead><tbody id="tb"><tr><td colspan="11" class="muted">Ожидание работ…</td></tr></tbody></table></div>
  <p class="muted" style="font-size:14px">Шкала перевода в 10-балльную систему (% от ${WORK.max} б.):
    ${SCALE.map(([p, g]) => `<b>${g}</b> — от ${p}%`).join(" · ")}. Оценка окончательная, когда проверены все развёрнутые ответы.</p>`;

  const sw = $("#swOpen");
  unsub.push(onValue(ref(db, `settings/${WORK.id}/open`), (s) => {
    sw.checked = !!s.val();
    $("#swText").textContent = sw.checked ? "🟢 Работа открыта — ученики могут начинать" : "🔴 Работа закрыта — новые ученики не могут начать";
  }));
  sw.onchange = async () => {
    await set(ref(db, `settings/${WORK.id}/open`), sw.checked);
    const cur = (await get(ref(db, "settings/current"))).val();
    if (sw.checked) await set(ref(db, "settings/current"), { ...ENTRY, at: Date.now() });
    else if (cur?.id === ENTRY.id) await remove(ref(db, "settings/current"));
  };
  unsub.push(onValue(ref(db, "settings/current"), (s) => {
    const c = s.val();
    $("#pinInfo").innerHTML = c ? (c.id === ENTRY.id ? "📌 Работа показана на стартовой странице в блоке «Сейчас на уроке»."
      : `📌 Сейчас на стартовой: <b>${esc(c.title)}</b>. Включите «Работа открыта», чтобы показать эту работу.`)
      : "Блок «Сейчас на уроке» на стартовой пуст. Включите «Работа открыта» — работа появится там.";
  }));
  $("#fCls").onchange = (e) => { filterCls = e.target.value; renderTable(); };
  $("#fSearch").oninput = (e) => { search = e.target.value.toLowerCase(); renderTable(); };
  $("#bCsv").onclick = exportCsv;
  $("#bPdf").onclick = () => {
    const ids = rows().filter(([, r]) => r.status === "submitted").map(([id]) => id).reverse();
    if (!ids.length) return alert("Нет сданных работ.");
    printReports(ids);
  };
  $("#bAi").onclick = () => {
    if (!AICFG?.url) return aiMissing();
    const ids = Object.entries(RESULTS).filter(([, r]) => r.status === "submitted" && aiTargets(r).length).map(([id]) => id);
    if (!ids.length) return setAiStatus("Нет развёрнутых ответов для проверки.");
    ids.forEach((id) => enqueueAi(id, true));
  };
  const swAi = $("#swAi"); swAi.checked = aiAuto;
  swAi.onchange = () => {
    if (swAi.checked && !AICFG?.url) { swAi.checked = false; return aiMissing(); }
    aiAuto = swAi.checked;
    try { localStorage.setItem("techlab_ai_auto_so", aiAuto ? "1" : "0"); } catch (e) {}
    if (aiAuto) autoEnqueue();
  };
  $("#bClear").onclick = async () => {
    const n = Object.keys(RESULTS).length; if (!n) return;
    if (!confirm(`Удалить ВСЕ результаты (${n} шт.)? Сначала скачайте CSV и PDF. Это действие нельзя отменить.`)) return;
    if (prompt("Для подтверждения напишите слово УДАЛИТЬ") !== "УДАЛИТЬ") return;
    await remove(ref(db, P));
  };

  unsub.push(onValue(ref(db, P), (snap) => {
    RESULTS = snap.val() || {};
    for (const [id, r] of Object.entries(RESULTS)) r._id = id;
    renderTable();
    syncResults();
    if (aiAuto) autoEnqueue();
    if (openId && dlg.open) {
      if (!RESULTS[openId]) dlg.close();
      else if (!dlg.contains(document.activeElement) || !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) showCheck(openId);
    }
  }));
}

function aiMissing() {
  alert("Проверка ИИ ещё не настроена. Откройте Центр управления → любой тест → кнопка «⚙ ИИ» и вставьте адрес веб-приложения и секретное слово. Настройка общая для всех работ.");
}

// Итог сохраняется в базе — его видит Центр управления (средняя оценка)
const lastSync = {};
function syncResults() {
  for (const [id, r] of Object.entries(RESULTS)) {
    if (r.status !== "submitted") continue;
    const e = evaluate(r);
    const res = { total: e.total, max: e.max, grade: e.grade, complete: e.complete };
    const s = JSON.stringify(res);
    if (lastSync[id] === s || JSON.stringify({ total: r.result?.total, max: r.result?.max, grade: r.result?.grade, complete: r.result?.complete }) === s) { lastSync[id] = s; continue; }
    lastSync[id] = s;
    update(ref(db, `${P}/${id}`), { result: res }).catch(() => {});
  }
}

function rows() {
  return Object.entries(RESULTS)
    .filter(([, r]) => (!filterCls || r.cls === filterCls) && (!search || String(r.name).toLowerCase().includes(search)))
    .sort((a, b) => (b[1].startedAt || 0) - (a[1].startedAt || 0));
}

function statusTag(r) {
  if (r.status === "in_progress") return `<span class="tag run">⏳ пишет</span>`;
  const map = { manual: ["done", "✅ сдано"], timeout: ["warn", "⏰ время вышло"], tab: ["auto", "⚠ автосдача: вкладка"],
    blur: ["auto", "⚠ автосдача: другое окно"], close: ["auto", "⚠ автосдача: закрыл страницу"], teacher: ["warn", "завершено учителем"] };
  const [cls, txt] = map[r.reason] || ["done", "сдано"];
  return `<span class="tag ${cls}">${txt}</span>`;
}
function aiTag(r) {
  if (r.status !== "submitted") return "";
  if (aiQueued.has(r._id)) return ` <span class="tag run">🤖 в очереди</span>`;
  if (r.aiStatus === "done") return ` <span class="tag done" title="Развёрнутые ответы проверены ИИ">🤖</span>`;
  if (r.aiStatus === "error") return ` <span class="tag auto" title="${esc(r.aiError || "")}">🤖 ошибка</span>`;
  return "";
}

function renderTable() {
  const list = rows();
  const all = Object.values(RESULTS);
  const sub = all.filter((r) => r.status === "submitted");
  const ev = sub.map(evaluate);
  const done = ev.filter((e) => e.complete);
  $("#stats").innerHTML = [["Всего", all.length], ["Пишут", all.filter((r) => r.status === "in_progress").length], ["Сдали", sub.length],
    ["Проверено полностью", done.length], ["Средняя оценка", done.length ? fmt(done.reduce((s, e) => s + e.grade, 0) / done.length) : "—"]]
    .map(([l, n]) => `<div class="stat"><b>${n}</b>${l}</div>`).join("");
  const tb = $("#tb");
  if (!list.length) { tb.innerHTML = `<tr><td colspan="11" class="muted">Работ пока нет.</td></tr>`; return; }
  tb.innerHTML = list.map(([id, r], i) => {
    const fin = r.status === "submitted";
    const e = fin ? evaluate(r) : null;
    const isNew = !seen.has(id); seen.add(id);
    return `<tr class="${isNew && seen.size > list.length ? "new" : ""}">
      <td>${list.length - i}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.cls)}</td>
      <td>${r.variant}</td>
      <td>${statusTag(r)}${aiTag(r)}</td>
      <td>${r.violations ? `<span class="tag auto">${r.violations}</span>` : "0"}</td>
      <td style="white-space:nowrap">${fmtTime(r.startedAt)} / ${fmtTime(r.submittedAt)}</td>
      <td>${e ? fmt(e.auto) : "—"}</td>
      <td>${e ? `<b>${fmt(e.total)}</b> / ${e.max}` : "—"}</td>
      <td>${e ? (e.complete ? `<span class="grade">${e.grade}</span>` : `<span class="grade pending">≈${e.grade}<br>ждёт: ${e.pending}</span>`) : "—"}</td>
      <td style="white-space:nowrap"><button class="btn small" data-open="${id}">${fin ? (e.complete ? "Открыть" : "Проверить") : "Открыть"}</button>
        ${fin ? `<button class="btn small ghost" data-pdf="${id}" title="Отчёт для печати / PDF">📄 PDF</button>` : ""}
        <button class="btn small red" data-del="${id}" title="Удалить">✕</button></td></tr>`;
  }).join("");
  tb.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => showCheck(b.dataset.open));
  tb.querySelectorAll("[data-pdf]").forEach((b) => b.onclick = () => printReports([b.dataset.pdf]));
  tb.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    const r = RESULTS[b.dataset.del];
    if (confirm(`Удалить работу «${r?.name}»?`)) await remove(ref(db, `${P}/${b.dataset.del}`));
  });
}

// =====================================================================
//  Проверка одной работы
// =====================================================================

// =====================================================================
//  Проверка одной работы
// =====================================================================
function showCheck(id) {
  const r = RESULTS[id]; if (!r) return;
  openId = id;
  const fin = r.status === "submitted";
  const e = evaluate(r);
  const scrollTop = dlg.open ? dlg.scrollTop : 0;
  const scoreIn = (it) => `<span class="sc"><input type="number" class="score-in" min="0" max="${it.max}" step="0.5" data-mk="${it.k}"
      value="${it.score ?? ""}" placeholder="?"> / ${it.max}${it.teacher !== null ? ` <button class="btn small ghost" data-reset="${it.k}" title="Убрать оценку учителя">↺</button>` : ""}</span>`;
  const blocks = Object.values(e.tasks).map((T) => {
    const its = e.items.filter((i) => i.n === T.n);
    const rows = its.filter((i) => !i.check).map((it) => { const ok = (it.score ?? 0) >= it.max;
      return `<tr><td>${esc(it.label)}</td><td class="ans-c">${it.answer ? esc(it.answer) : '<span class="muted">—</span>'}</td><td>${esc(it.key)}</td>
        <td class="${ok ? "ok" : "bad"}">${ok ? "✓" : (it.score ?? 0) > 0 ? "½" : "✗"}</td><td>${scoreIn(it)}</td></tr>`; }).join("");
    const opens = its.filter((i) => i.check).map((it) => { const a = it.aiData;
      return `<div class="chk-item ${it.score === null ? "need" : ""}"><div class="chk-row"><b>${esc(it.label)}</b>${scoreIn(it)}</div>
        <div class="ans">${it.empty ? '<span class="muted">Ответ не дан</span>' : esc(it.answer)}</div>
        ${a ? `<div class="ai-box"><b>🤖 ИИ: ${fmt(a.score)} / ${it.max}</b> ${esc(a.comment || "")}${a.good ? `<div class="ok">✓ ${esc(a.good)}</div>` : ""}${a.missing ? `<div class="bad">✗ ${esc(a.missing)}</div>` : ""}${a.advice ? `<div class="adv">💡 ${esc(a.advice)}</div>` : ""}</div>` : ""}
        <details class="model"><summary>Критерии и образец ответа</summary><p>${esc(it.criteria || "")}</p><p><b>Образец:</b> ${esc(it.model || "")}</p></details></div>`; }).join("");
    return `<h3 class="h3">Задание ${T.n}. ${esc(TOPICS[T.n])} · ${fmt(T.sum)} / ${T.max}</h3>
      ${rows ? `<div class="table-wrap"><table class="res calc-t"><thead><tr><th>Вопрос</th><th>Ответ ученика</th><th>Верно</th><th></th><th>Баллы</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}${opens}`;
  }).join("");
  const evs = Object.values(r.events || {}).sort((a, b) => a.at - b.at);
  const S = r.aiSummary;
  dlg.innerHTML = `<div class="dlg-head"><b>${esc(r.name)} · ${esc(r.cls)} · вариант ${r.variant}</b>
      <span style="display:flex;gap:6px;flex-wrap:wrap">
        ${fin ? `<button class="btn small ghost" id="dAi">🤖 Проверить ИИ</button><button class="btn small ghost" id="dPdf">📄 PDF</button>` : ""}
        ${fin && r.reason !== "manual" ? `<button class="btn small ghost" id="dCont">↩ Разрешить продолжить</button>` : ""}
        ${!fin ? `<button class="btn small ghost" id="dStop">⏹ Завершить работу</button>` : ""}
        <button class="btn small ghost" id="dClose">Закрыть ✕</button></span></div>
    <div class="dlg-body">
      <div class="sum-line">${statusTag(r)} · начало ${fmtTime(r.startedAt)} · сдано ${fmtTime(r.submittedAt)} · нарушений: ${r.violations || 0}
        · <b>Итог: ${fmt(e.total)} / ${e.max}</b> · оценка: <b class="grade">${e.complete ? e.grade : "≈" + e.grade}</b>
        ${e.pending ? ` <span class="tag warn">не проверено: ${e.pending}</span>` : ""}</div>
      ${evs.length ? `<div class="events">⚠ ${evs.map((x) => `${fmtTime(x.at)} — ${esc(x.type)}`).join("; ")}</div>` : ""}
      ${S ? `<div class="chk-item rv-sum"><p><b>✓ Сильные стороны:</b> ${esc(S.strengths)}</p><p><b>✗ Пробелы:</b> ${esc(S.gaps)}</p><p><b>💡 Что повторить:</b> ${esc(S.advice)}</p></div>` : ""}
      ${blocks}</div>`;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = scrollTop;
  $("#dClose").onclick = () => { openId = null; dlg.close(); };
  $("#dAi")?.addEventListener("click", () => { if (!AICFG?.url) return aiMissing(); enqueueAi(id, true); });
  $("#dPdf")?.addEventListener("click", () => printReports([id]));
  $("#dCont")?.addEventListener("click", async () => {
    if (!confirm("Разрешить ученику продолжить работу? Если время вышло, будет добавлено 5 минут.")) return;
    await update(ref(db, `${P}/${id}`), { status: "in_progress", reason: null, submittedAt: null, deadline: Math.max(r.deadline || 0, Date.now() + 5 * 60000) });
  });
  $("#dStop")?.addEventListener("click", async () => {
    if (!confirm("Завершить работу ученика сейчас?")) return;
    await update(ref(db, `${P}/${id}`), { status: "submitted", reason: "teacher", submittedAt: Date.now() });
  });
  dlg.querySelectorAll("[data-mk]").forEach((inp) => inp.onchange = async () => {
    const it = e.items.find((x) => x.k === inp.dataset.mk);
    let val = inp.value === "" ? null : Math.max(0, Math.min(it.max, Math.round(Number(inp.value) * 2) / 2));
    if (val !== null && !Number.isFinite(val)) val = null;
    await set(ref(db, `${P}/${id}/manual/${it.k}`), val);
  });
  dlg.querySelectorAll("[data-reset]").forEach((b) => b.onclick = () => set(ref(db, `${P}/${id}/manual/${b.dataset.reset}`), null));
}
dlg.addEventListener("close", () => { openId = null; });

// =====================================================================
//  Проверка ИИ
// =====================================================================
function setAiStatus(t) { const el = $("#aiStatus"); if (el) el.textContent = t; }
function aiTargets(r, all = false) {
  return evaluate(r).items.filter((i) => i.check && !i.empty && (all || i.teacher === null))
    .map((i) => ({ key: i.k, max: i.max, question: i.question, answer: i.answer.slice(0, 2000), model: i.model || "", criteria: i.criteria || "" }));
}
function autoEnqueue() {
  if (!AICFG?.url) return;
  for (const [id, r] of Object.entries(RESULTS)) if (r.status === "submitted" && !r.aiStatus) enqueueAi(id, false);
}
function enqueueAi(id, force) {
  if (aiQueued.has(id)) return;
  const r = RESULTS[id]; if (!r || (!force && r.aiStatus)) return;
  aiQueued.add(id); aiQueue.push(id); renderTable(); runAi();
}
async function runAi() {
  if (aiBusy) return; aiBusy = true;
  while (aiQueue.length) {
    const id = aiQueue.shift(), r = RESULTS[id];
    setAiStatus(`🤖 Проверяю: ${r?.name || ""} (в очереди ещё ${aiQueue.length})`);
    try { if (r) await gradeWithAi(id, r); }
    catch (e) {
      console.error(e);
      await update(ref(db, `${P}/${id}`), { aiStatus: "error", aiError: String(e.message || e).slice(0, 300) }).catch(() => {});
      if (/429|quota|rate/i.test(String(e.message))) { setAiStatus("🤖 Лимит запросов ИИ — пауза 60 с…"); await sleep(60000); }
    }
    aiQueued.delete(id); renderTable();
    if (aiQueue.length) await sleep(6000);
  }
  aiBusy = false; setAiStatus("🤖 Проверка ИИ завершена.");
}
async function callAi(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 100000);
  let res;
  try { res = await fetch(AICFG.url, { method: "POST", body: JSON.stringify({ secret: AICFG.secret, ...payload }), signal: ctrl.signal }); }
  catch (e) { throw new Error(e.name === "AbortError" ? "ИИ не ответил за 100 секунд — нажмите «Проверить ИИ» ещё раз" : "Нет связи с сервисом ИИ"); }
  finally { clearTimeout(timer); }
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch (e) { throw new Error("Сервис ИИ вернул не JSON. Проверьте настройки ИИ в Центре управления."); }
  if (data.error) throw new Error(data.error);
  return data;
}
async function gradeWithAi(id, r) {
  const items = aiTargets(r);
  const e = evaluate(r);
  const context = Object.values(e.tasks).map((T) => {
    const bad = e.items.filter((i) => i.n === T.n && !i.check && (i.score ?? 0) < i.max).map((i) => `${i.label}: ответ «${i.answer || "нет"}», верно «${i.key}»`);
    return `Задание ${T.n} (${TOPICS[T.n]}): ${fmt(T.sum)} из ${T.max} б.` + (bad.length ? ". Ошибки: " + bad.join("; ") : "");
  }).join("\n") + "\nУченик 12 класса, подготовка к БАК. Оценивай строго по критериям, как на экзамене, но доброжелательно. Комментарии — на русском языке, кратко.";
  const data = await callAi({ subject: AI_SUBJECT, items, review: true, context });
  const ai = { ...(r.ai || {}) };
  const cut = (x, n = 500) => String(x || "").slice(0, n);
  for (const x of data.results || []) {
    const it = items.find((i) => i.key === x.key);
    if (!it || !Number.isFinite(Number(x.score))) continue;
    ai[x.key] = { score: Math.max(0, Math.min(it.max, Math.round(Number(x.score) * 2) / 2)), comment: cut(x.comment, 400), good: cut(x.good), missing: cut(x.missing), advice: cut(x.advice) };
  }
  const upd = { ai, aiStatus: "done", aiError: null, aiAt: Date.now() };
  if (data.summary) upd.aiSummary = { strengths: cut(data.summary.strengths, 800), gaps: cut(data.summary.gaps, 800), advice: cut(data.summary.advice, 800) };
  await update(ref(db, `${P}/${id}`), upd);
}

// =====================================================================
//  PDF-отчёт
// =====================================================================
function reportOf(r) {
  const e = evaluate(r);
  const tasks = Object.values(e.tasks).map((T) => {
    const its = e.items.filter((i) => i.n === T.n);
    return `<div class="qa"><div class="qh"><span class="qn">${T.n}</span><span class="qt">${esc(TOPICS[T.n])}</span><span class="qp">${fmt(T.sum)} / ${T.max}</span></div>
      <table class="d">${its.map((it) => { const ok = (it.score ?? 0) >= it.max, part = (it.score ?? 0) > 0;
        return `<tr><td class="l">${esc(it.label)}</td><td class="${ok ? "g" : part ? "m" : "b"}">${it.answer ? esc(it.answer) : "—"}</td>
          <td>${it.check ? (it.aiData?.missing ? "✗ " + esc(it.aiData.missing) : it.aiData?.good ? "✓ " + esc(it.aiData.good) : "") : ok ? "✓" : "верно: " + esc(it.key)}</td>
          <td class="p">${it.score === null ? "?" : fmt(it.score)}/${it.max}</td></tr>`; }).join("")}</table></div>`;
  }).join("");
  const S = r.aiSummary;
  const auto = { tab: "переключение вкладки", blur: "переход в другое окно", close: "закрытие страницы", timeout: "время вышло", teacher: "завершено учителем" }[r.reason];
  return `<section>
    <div class="top"><div><div class="rib">✍️ Самостоятельная работа · География · 12 класс</div>
      <h1>${esc(TEST.module)}</h1>
      <div class="meta"><b>${esc(r.name)}</b> · ${esc(r.cls)} · вариант ${r.variant} · ${fmtDate(r.submittedAt || r.startedAt)}</div>
      ${auto ? `<div class="warn">⚠ Работа завершена: ${auto}.</div>` : ""}</div>
      <div class="gr"><b>${e.complete ? e.grade : "≈" + e.grade}</b><span>${fmt(e.total)} / ${e.max} б.</span></div></div>
    ${tasks}
    ${S ? `<div class="sum"><b>Общий вывод.</b> <b>Сильные стороны:</b> ${esc(S.strengths)} <b>Пробелы:</b> ${esc(S.gaps)} <b>Что повторить:</b> ${esc(S.advice)}</div>` : ""}
    <div class="foot"><span>Шкала: ${SCALE.map(([p, g]) => `${g} — от ${Math.ceil(p / 100 * e.max * 2) / 2} б.`).join(" · ")}</span><span>Проверил: ${esc(TEACHER_SIGN)}</span></div>
  </section>`;
}
function printReports(ids) {
  const pages = ids.map((id) => reportOf(RESULTS[id])).join("");
  const w = window.open("", "_blank");
  if (!w) return alert("Браузер заблокировал новое окно. Разрешите всплывающие окна для этого сайта.");
  w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Самостоятельная работа география 12 · отчёты</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap">
  <style>
    @page{size:A4;margin:11mm}body{margin:0;font-family:Manrope,Arial,sans-serif;color:#0B1A3B;font-size:11px;line-height:1.35}
    section{page-break-after:always}
    .top{display:flex;gap:14px;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2E4BFF;padding-bottom:8px;margin-bottom:8px}
    .rib{display:inline-block;background:#FDECEE;color:#C2253B;font-weight:800;font-size:10px;letter-spacing:.05em;text-transform:uppercase;padding:3px 10px;border-radius:999px}
    h1{font-size:15px;margin:5px 0 3px}.meta{font-size:12px}.warn{color:#C2253B;font-weight:700;margin-top:3px}
    .gr{flex:none;width:84px;height:84px;border-radius:50%;border:4px solid #2E4BFF;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .gr b{font-size:32px;line-height:1;color:#2E4BFF}.gr span{font-size:10px;color:#556A92;font-weight:700}
    .qa{border:1px solid #DCE4F2;border-radius:8px;padding:5px 8px;margin:5px 0;break-inside:avoid;page-break-inside:avoid}
    .qh{display:flex;gap:7px;align-items:baseline;margin-bottom:3px}.qn{background:#2E4BFF;color:#fff;border-radius:6px;padding:0 6px;font-weight:800}
    .qt{flex:1;font-weight:800}.qp{font-weight:800;color:#2E4BFF}
    table.d{width:100%;border-collapse:collapse;font-size:10.3px}table.d td{border-top:1px solid #EEF2F8;padding:2px 4px;vertical-align:top}
    td.l{width:42%}td.p{white-space:nowrap;text-align:right;font-weight:800}
    td.g{color:#0B8A5A;font-weight:700}td.b{color:#C2253B;font-weight:700}td.m{color:#B7791F;font-weight:700}
    .sum{margin-top:8px;background:#E8EDFF;border:1px solid #C9D3FF;border-radius:8px;padding:7px 10px}
    .foot{display:flex;justify-content:space-between;gap:10px;margin-top:8px;color:#556A92;font-size:9.5px}
    .hint{font-family:Arial,sans-serif;background:#E8EDFF;color:#1B3F9E;padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:13px}
    @media print{.hint{display:none}}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  </style></head><body><div class="hint">Чтобы сохранить PDF: в окне печати выберите «Сохранить как PDF».</div>${pages}</body></html>`);
  w.document.close();
  const go = () => setTimeout(() => w.print(), 300);
  (w.document.fonts?.ready || Promise.resolve()).then(() => setTimeout(go, 400), go);
}

function exportCsv() {
  const head = ["Ученик", "Класс", "Вариант", "Статус", "Нарушения", ...Object.keys(TOPICS).map((n) => "Задание " + n), "Итог", "Макс.", "Оценка", "Проверено полностью"];
  const lines = [head];
  for (const [, r] of rows().reverse()) {
    if (r.status !== "submitted") continue;
    const e = evaluate(r);
    lines.push([r.name, r.cls, r.variant, r.reason || "", r.violations || 0, ...Object.keys(TOPICS).map((n) => fmt(e.tasks[n]?.sum || 0)), fmt(e.total), e.max, e.grade, e.complete ? "да" : "нет"]);
  }
  const csv = "﻿" + lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `sr-geografia12-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}

function showKeysUpload() {
  app.innerHTML = `<a class="backlink" href="../../teacher/">← Центр управления</a><div class="card center" style="max-width:640px"><h2>🔑 Загрузите ключи ответов</h2>
    <p>Для этой работы в базе ещё нет ключей. Выберите файл <code>keys-geo12-sr1.json</code>, который прислал Claude.
      Файл хранится только у вас и в защищённой базе — на GitHub его загружать <b>нельзя</b>.</p>
    <input type="file" id="kf" accept=".json,application/json" style="margin:10px 0"><div class="err" id="kerr"></div></div>`;
  $("#kf").onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    $("#kerr").textContent = "Загружаю…";
    try {
      const j = JSON.parse(await f.text());
      const k = j.keys?.[TEST.id];
      if (!k || !k.variants) throw new Error("в файле нет ключей для этой работы. Проверьте, тот ли это файл.");
      if (Object.keys(k.variants).length !== VARIANTS.length) throw new Error(`в файле ${Object.keys(k.variants).length} вариантов, а в работе ${VARIANTS.length}.`);
      await set(ref(db, `keys/${TEST.id}`), k);
      $("#kerr").style.color = "var(--okc)"; $("#kerr").textContent = "✓ Ключи загружены. Открываю…";
      setTimeout(() => location.reload(), 800);
    } catch (err) { $("#kerr").textContent = "Ошибка: " + err.message; }
  };
}
