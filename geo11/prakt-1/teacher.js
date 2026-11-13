// Практическая работа № 1 · панель учителя: результаты, автопроверка расчётов, проверка ИИ, PDF
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../../firebase-config.js";
import { SCALE, toGrade } from "../../engine/grading.js?v=5";
import { WORK, VARIANTS, QUESTIONS, qText, calcKey, CALC_FIELDS, calcOk } from "./data.js?v=1";

const ENTRY = { id: WORK.id, title: "Практическая работа № 1 · Население Европы и Африки", path: "geo11/prakt-1/", subject: "geo", grade: "11" };
const AI_SUBJECT = "география, 11 класс (практическая работа: сравнительный анализ демографических показателей страны Европы и страны Африки)";
const TEACHER_SIGN = "Т. Д.";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
const fmtTime = (ms) => ms ? new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const app = $("#app"), dlg = $("#dlg");

const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb), auth = getAuth(fb);
const P = `results/${WORK.id}`;

let RESULTS = {}, AICFG = null, aiAuto = false, filterCls = "", search = "", openId = null, unsub = [], seen = new Set();
const aiQueue = [], aiQueued = new Set(); let aiBusy = false;

// =====================================================================
//  Критерии оценивания развёрнутых ответов (для ИИ и для учителя)
// =====================================================================
const RUBRIC = {
  q11: "1 б. — сделан верный вывод: в какой стране население выросло сильнее (во сколько раз / на сколько млн) и названа причина (высокий естественный прирост в африканской стране, низкий — в европейской). 0 б. — вывода нет или он противоречит данным.",
  q13: "1 б. — описана тенденция в обеих странах с опорой на цифры (младенческая смертность снизилась); 1 б. — сравнение стран (в европейской — очень низкий уровень, в африканской — всё ещё высокий, во много раз выше); 1 б. — минимум две причины (развитие медицины, вакцинация, доступ к чистой воде, питание, гигиена, образование матерей, уровень жизни; в Африке — бедность, нехватка врачей, болезни).",
  q15: "1 б. — объяснено, что естественный прирост — разность рождаемости и смертности и что он определяет рост или убыль населения; 1 б. — для африканской страны: высокая рождаемость при быстром снижении смертности → большой естественный прирост, быстрый рост («демографический взрыв»), с цифрами; 1 б. — для европейской страны: низкая рождаемость и рост/стабильная смертность → низкий прирост или естественная убыль, рост населения в основном за счёт миграции, с цифрами.",
  q21: "1 б. — описано изменение доли молодых (0–14) в обеих странах с цифрами; 1 б. — описано изменение доли пожилых (65+) в обеих странах с цифрами; 1 б. — причины: в европейской стране снижение рождаемости и рост продолжительности жизни (старение), в африканской — сохраняющаяся высокая рождаемость (молодое население).",
  q22: "1 б. — европейская страна: «старая» (регрессивная) структура — малая доля детей, большая доля пожилых, с цифрами; 1 б. — африканская страна: «молодая» (прогрессивная) структура — большая доля детей, очень мало пожилых, с цифрами; 1 б. — прямое сравнение / тип возрастной пирамиды.",
  q23: "1 б. — последствия для европейской страны (нехватка рабочей силы, высокая нагрузка на пенсионную систему и здравоохранение, привлечение мигрантов, повышение пенсионного возраста); 1 б. — последствия для африканской страны (большая нагрузка на школы и здравоохранение, нехватка рабочих мест, безработица молодёжи, бедность; но — большие трудовые ресурсы в будущем); 1 б. — показана связь «возрастная структура → экономика/общество», сделан вывод.",
  q24: "1 б. — описан рост ожидаемой продолжительности жизни в обеих странах с цифрами; 1 б. — отмечены различия (женщины живут дольше мужчин; разрыв между странами сохраняется / в африканской стране ОПЖ выросла сильнее, но ниже); 1 б. — причины (развитие медицины, вакцины, антибиотики, снижение младенческой смертности, улучшение питания, санитарии и условий жизни; в Африке — бедность, болезни, конфликты сдерживают рост).",
  q25: "1 б. — описан рост степени урбанизации в обеих странах с цифрами; 1 б. — факторы в европейской стране (индустриализация, развитие сферы услуг, рабочие места и удобства в городах; высокий уровень — урбанизация почти завершена); 1 б. — факторы в африканской стране (быстрый рост населения, миграция из сёл в города в поисках работы и лучшей жизни, бедность в деревне; «ложная урбанизация», трущобы).",
  q31: "1 б. — названы минимум два основных демографических различия (рост населения/естественный прирост, возрастная структура, продолжительность жизни, младенческая смертность, урбанизация) с опорой на данные; 1 б. — влияние на экономическое развитие; 1 б. — влияние на социальное развитие (образование, здравоохранение, пенсии, занятость).",
  q32: "1 б. — вызовы для европейской страны (старение, низкая рождаемость, естественная убыль, нехватка рабочих рук, нагрузка на пенсии); 1 б. — вызовы для африканской страны (очень быстрый рост, высокая младенческая смертность, бедность, безработица, перенаселение городов, продовольствие); 1 б. — предложены реалистичные меры для обеих стран (поддержка семей с детьми, миграционная политика, активное долголетие / образование девочек, планирование семьи, медицина, рабочие места, развитие сельского хозяйства).",
};

// Подсказка-ориентир для ИИ: что видно из данных варианта
function modelOf(k, v) {
  const A = v.A, B = v.B, K = calcKey(v);
  const sgn = (x) => (x > 0 ? "+" : "") + fmt(x);
  switch (k) {
    case "q11": return `${A.name}: ${sgn(K.ch_Aabs)} млн, в ${fmt(K.ch_Ax)} раза; ${B.name}: ${sgn(K.ch_Babs)} млн, в ${fmt(K.ch_Bx)} раза. Население ${K.ch_Bx > K.ch_Ax ? B.gen : A.gen} выросло значительно сильнее — из-за высокого естественного прироста.`;
    case "q13": return `Младенческая смертность: ${A.name} ${A.imr50} → ${A.imr24} ‰, ${B.name} ${B.imr50} → ${B.imr24} ‰. Снизилась в обеих странах, но в ${B.gen} остаётся во много раз выше. Причины: медицина, вакцинация, чистая вода, питание, уровень жизни.`;
    case "q15": return `Естественный прирост: ${A.name} ${sgn(K.gr_A50)} → ${sgn(K.gr_A24)} ‰; ${B.name} ${sgn(K.gr_B50)} → ${sgn(K.gr_B24)} ‰. В ${B.gen} смертность упала быстрее рождаемости → быстрый рост населения; в ${A.gen} низкая рождаемость → медленный рост или убыль.`;
    case "q21": return `0–14 лет: ${A.name} ${A.young50} → ${A.young24} %, ${B.name} ${B.young50} → ${B.young24} %. 65+: ${A.name} ${A.old50} → ${A.old24} %, ${B.name} ${B.old50} → ${B.old24} %. В ${A.gen} — старение (низкая рождаемость, рост ОПЖ), в ${B.gen} население остаётся молодым (высокая рождаемость).`;
    case "q22": return `${A.name}: старая (регрессивная) структура — ${A.young24} % детей и ${A.old24} % пожилых. ${B.name}: молодая (прогрессивная) — ${B.young24} % детей и ${B.old24} % пожилых.`;
    case "q23": return `${A.name}: нехватка рабочей силы, нагрузка на пенсии и здравоохранение, мигранты. ${B.name}: нагрузка на школы, нехватка рабочих мест, безработица молодёжи, но большие трудовые ресурсы.`;
    case "q24": return `ОПЖ: ${A.name} ${A.le50} → ${A.le24} лет (м ${A.lm24}, ж ${A.lf24}); ${B.name} ${B.le50} → ${B.le24} лет (м ${B.lm24}, ж ${B.lf24}). Рост в обеих странах, женщины живут дольше; причины — медицина, питание, санитария, снижение младенческой смертности.`;
    case "q25": return `Урбанизация: ${A.name} ${A.urb50} → ${A.urb24} %, ${B.name} ${B.urb50} → ${B.urb24} %. Европа — индустриализация и сфера услуг; Африка — быстрый рост населения и миграция из сёл в города.`;
    case "q31": return `Различия: темпы роста и естественный прирост, возрастная структура (старая/молодая), ОПЖ, младенческая смертность, урбанизация — с влиянием на экономику и социальную сферу.`;
    case "q32": return `${A.name}: старение, низкая рождаемость, убыль → поддержка семей, миграционная политика. ${B.name}: быстрый рост, бедность, младенческая смертность → образование, медицина, планирование семьи, рабочие места.`;
  }
  return "";
}

function dataText(v) {
  const c = (x) => `${x.name} (${x.region}): площадь ${x.area} тыс. км²; численность ${x.pop50} → ${x.pop24} млн; рождаемость ${x.cbr50} → ${x.cbr24} ‰; смертность ${x.cdr50} → ${x.cdr24} ‰; младенческая смертность ${x.imr50} → ${x.imr24} ‰; 0–14 лет ${x.young50} → ${x.young24} %; 65+ ${x.old50} → ${x.old24} %; ОПЖ ${x.le50} → ${x.le24} лет (мужчины ${x.lm50} → ${x.lm24}, женщины ${x.lf50} → ${x.lf24}); урбанизация ${x.urb50} → ${x.urb24} %.`;
  return `Данные варианта (1950 → 2024). ${c(v.A)} ${c(v.B)}`;
}

// =====================================================================
//  Оценивание
// =====================================================================
const TEXT_QS = QUESTIONS.filter((q) => q.max && !q.table);
function evaluate(r) {
  const v = VARIANTS.find((x) => x.id === r.variant);
  const K = calcKey(v), A = r.answers || {}, M = r.manual || {}, AI = r.ai || {};
  const items = [];
  for (const f of CALC_FIELDS) {
    const ans = A.c?.[f.k] ?? "";
    const auto = calcOk(f.k, ans, K[f.k]) ? f.max : 0;
    const teacher = Number.isFinite(M[f.k]) ? M[f.k] : null;
    items.push({ k: f.k, n: f.n, calc: true, label: f.label(v), unit: f.unit, max: f.max, answer: ans, key: K[f.k], auto, teacher, score: teacher ?? auto });
  }
  for (const q of TEXT_QS) {
    const ans = String(A[q.k] ?? "");
    const teacher = Number.isFinite(M[q.k]) ? M[q.k] : null;
    const a = AI[q.k];
    const ai = a && Number.isFinite(a.score) ? Math.max(0, Math.min(q.max, a.score)) : null;
    const empty = !ans.trim();
    items.push({ k: q.k, n: q.n, q: qText(q, v), max: q.max, answer: ans, empty, teacher, ai, aiData: a || null,
      score: teacher ?? ai ?? (empty ? 0 : null) });
  }
  const max = items.reduce((s, i) => s + i.max, 0);
  const total = items.reduce((s, i) => s + (i.score ?? 0), 0);
  const auto = items.filter((i) => i.calc).reduce((s, i) => s + i.score, 0);
  const pending = items.filter((i) => i.score === null).length;
  return { v, K, items, max, total, auto, pending, complete: !pending, grade: toGrade(total, max) };
}

// =====================================================================
//  Вход
// =====================================================================
onAuthStateChanged(auth, async (user) => {
  unsub.forEach((u) => u()); unsub = [];
  if (!user) return showLogin();
  $("#who").innerHTML = `${esc(user.email)} · <a href="#" id="logout" style="color:#fff">выйти</a>`;
  $("#logout").onclick = (e) => { e.preventDefault(); signOut(auth); };
  try {
    AICFG = (await get(ref(db, "keys/_ai"))).val();
    try { aiAuto = localStorage.getItem("techlab_ai_auto_pr") === "1"; } catch (e) {}
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
    <div class="pr-ribbon">🧪 Практическая работа · не суммативное оценивание</div>
    <h2 style="margin-bottom:4px">${esc(WORK.title)}</h2>
    <div class="muted">${esc(WORK.subtitle)} · ${VARIANTS.length} вариантов (пары стран Европа — Африка) · ${WORK.minutes} минут · максимум ${WORK.max} баллов
      · расчёты проверяются автоматически, развёрнутые ответы — ИИ</div>
    <div class="muted" id="pinInfo" style="font-size:14px;margin-top:8px"></div>
  </div>
  <div class="toolbar" style="margin-bottom:14px">
    <label class="switch"><input type="checkbox" id="swOpen"> <span id="swText">Работа закрыта</span></label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <select id="fCls" style="width:auto"><option value="">Все классы</option>${WORK.classes.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
      <input type="text" id="fSearch" placeholder="Поиск по фамилии" style="width:180px">
      <button class="btn small ghost" id="bAi">🤖 Проверить всё ИИ</button>
      <button class="btn small ghost" id="bPdf" title="Отчёты всех сданных работ (с учётом фильтра) — каждый с новой страницы">📄 PDF класса</button>
      <button class="btn small ghost" id="bVars">📋 Варианты</button>
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
    <th>Расчёты</th><th>Итог</th><th>Оценка</th><th></th></tr></thead><tbody id="tb"><tr><td colspan="11" class="muted">Ожидание работ…</td></tr></tbody></table></div>
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
  $("#bVars").onclick = showVariants;
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
    try { localStorage.setItem("techlab_ai_auto_pr", aiAuto ? "1" : "0"); } catch (e) {}
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
    const v = VARIANTS.find((x) => x.id === r.variant);
    const fin = r.status === "submitted";
    const e = fin ? evaluate(r) : null;
    const isNew = !seen.has(id); seen.add(id);
    return `<tr class="${isNew && seen.size > list.length ? "new" : ""}">
      <td>${list.length - i}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.cls)}</td>
      <td>${r.variant}<div class="muted" style="font-size:12px">${v ? esc(v.A.name + " — " + v.B.name) : ""}</div></td>
      <td>${statusTag(r)}${aiTag(r)}</td>
      <td>${r.violations ? `<span class="tag auto">${r.violations}</span>` : "0"}</td>
      <td style="white-space:nowrap">${fmtTime(r.startedAt)} / ${fmtTime(r.submittedAt)}</td>
      <td>${e ? `${fmt(e.auto)} / 12` : "—"}</td>
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
function showCheck(id) {
  const r = RESULTS[id]; if (!r) return;
  openId = id;
  const fin = r.status === "submitted";
  const e = evaluate(r), v = e.v;
  const scrollTop = dlg.open ? dlg.scrollTop : 0;
  const scoreIn = (it) => `<span class="sc">Баллы: <input type="number" class="score-in" min="0" max="${it.max}" step="0.5" data-mk="${it.k}"
      value="${it.teacher ?? (it.calc ? it.auto : (it.ai ?? (it.empty ? 0 : "")))}" placeholder="?"> / ${it.max}
      ${it.teacher !== null ? `<button class="btn small ghost" data-reset="${it.k}" title="Убрать оценку учителя">↺</button>` : ""}</span>`;

  const calcRows = e.items.filter((i) => i.calc).map((it) => {
    const ok = it.score >= it.max;
    return `<tr><td>${it.n}</td><td>${esc(it.label)}</td><td class="ans-c">${it.answer ? esc(it.answer) : '<span class="muted">—</span>'}</td>
      <td>${fmt(it.key)} ${esc(it.unit)}</td><td class="${ok ? "ok" : "bad"}">${ok ? "✓" : "✗"}</td><td>${scoreIn(it)}</td></tr>`;
  }).join("");

  const textItems = e.items.filter((i) => !i.calc).map((it) => {
    const a = it.aiData;
    return `<div class="chk-item ${it.score === null ? "need" : ""}">
      <div class="chk-row"><b>${it.n}. ${esc(it.q)}</b>${scoreIn(it)}</div>
      <div class="ans">${it.empty ? '<span class="muted">Ответ не дан</span>' : esc(it.answer)}</div>
      ${a ? `<div class="ai-box"><b>🤖 ИИ: ${fmt(a.score)} / ${it.max}</b> ${esc(a.comment || "")}
        ${a.good ? `<div class="ok">✓ ${esc(a.good)}</div>` : ""}${a.missing ? `<div class="bad">✗ ${esc(a.missing)}</div>` : ""}
        ${a.advice ? `<div class="adv">💡 ${esc(a.advice)}</div>` : ""}</div>` : ""}
      <details class="model"><summary>Критерии и ориентир ответа</summary><p>${esc(RUBRIC[it.k])}</p><p><b>Ориентир:</b> ${esc(modelOf(it.k, v))}</p></details>
    </div>`;
  }).join("");

  const evs = Object.values(r.events || {}).sort((a, b) => a.at - b.at);
  const S = r.aiSummary;
  dlg.innerHTML = `<div class="dlg-head"><b>${esc(r.name)} · ${esc(r.cls)} · вариант ${r.variant}: ${esc(v.A.name)} — ${esc(v.B.name)}</b>
      <span style="display:flex;gap:6px;flex-wrap:wrap">
        ${fin ? `<button class="btn small ghost" id="dAi">🤖 Проверить ИИ</button><button class="btn small ghost" id="dPdf">📄 PDF</button>` : ""}
        ${fin && r.reason !== "manual" ? `<button class="btn small ghost" id="dCont" title="Разрешить ученику продолжить работу">↩ Разрешить продолжить</button>` : ""}
        ${!fin ? `<button class="btn small ghost" id="dStop">⏹ Завершить работу</button>` : ""}
        <button class="btn small ghost" id="dClose">Закрыть ✕</button></span></div>
    <div class="dlg-body">
      <div class="sum-line">${statusTag(r)} · начало ${fmtTime(r.startedAt)} · сдано ${fmtTime(r.submittedAt)} · нарушений: ${r.violations || 0}
        · <b>Итог: ${fmt(e.total)} / ${e.max}</b> · оценка: <b class="grade">${e.complete ? e.grade : "≈" + e.grade}</b>
        ${e.pending ? ` <span class="tag warn">не проверено: ${e.pending}</span>` : ""}</div>
      ${evs.length ? `<div class="events">⚠ ${evs.map((x) => `${fmtTime(x.at)} — ${esc(x.type)}`).join("; ")}</div>` : ""}
      ${S ? `<div class="chk-item rv-sum"><p><b>✓ Сильные стороны:</b> ${esc(S.strengths)}</p><p><b>✗ Пробелы:</b> ${esc(S.gaps)}</p><p><b>💡 Что повторить:</b> ${esc(S.advice)}</p></div>` : ""}
      <h3 class="h3">Вычисления (проверены автоматически)</h3>
      <div class="table-wrap"><table class="res calc-t"><thead><tr><th>№</th><th>Что вычислить</th><th>Ответ ученика</th><th>Верно</th><th></th><th>Баллы</th></tr></thead><tbody>${calcRows}</tbody></table></div>
      <h3 class="h3">Развёрнутые ответы</h3>${textItems}
    </div>`;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = scrollTop;
  $("#dClose").onclick = () => { openId = null; dlg.close(); };
  $("#dAi")?.addEventListener("click", () => { if (!AICFG?.url) return aiMissing(); enqueueAi(id, true); });
  $("#dPdf")?.addEventListener("click", () => printReports([id]));
  $("#dCont")?.addEventListener("click", async () => {
    if (!confirm("Разрешить ученику продолжить работу? Если время вышло, будет добавлено 5 минут.")) return;
    const deadline = Math.max(r.deadline || 0, Date.now() + 5 * 60000);
    await update(ref(db, `${P}/${id}`), { status: "in_progress", reason: null, submittedAt: null, deadline });
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
//  Проверка ИИ (тот же веб-сервис Apps Script, что и в других тестах)
// =====================================================================
function setAiStatus(t) { const el = $("#aiStatus"); if (el) el.textContent = t; }
function aiTargets(r, all = false) {
  const e = evaluate(r), v = e.v;
  return e.items.filter((i) => !i.calc && !i.empty && (all || i.teacher === null)).map((i) => ({
    key: i.k, max: i.max,
    question: `Вопрос ${i.n}: ${i.q}\n${dataText(v)}`,
    answer: i.answer.slice(0, 2000), model: modelOf(i.k, v), criteria: RUBRIC[i.k],
  }));
}
function autoEnqueue() {
  if (!AICFG?.url) return;
  for (const [id, r] of Object.entries(RESULTS)) if (r.status === "submitted" && !r.aiStatus && aiTargets(r).length) enqueueAi(id, false);
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
  if (!items.length) { await update(ref(db, `${P}/${id}`), { aiStatus: "done", aiError: null }); return; }
  const e = evaluate(r);
  const wrong = e.items.filter((i) => i.calc && i.score < i.max).map((i) => `${i.label} (ученик: ${i.answer || "нет ответа"}, верно: ${fmt(i.key)})`);
  const context = `Практическая работа (не контрольная). ${dataText(e.v)}\nВычисления: ${fmt(e.auto)} из 12 б.` +
    (wrong.length ? ` Ошибки в расчётах: ${wrong.join("; ")}.` : " Все расчёты верны.") +
    `\nОценивай развёрнутые ответы строго по критериям, но доброжелательно; ответ должен опираться на данные варианта. Пиши комментарии на русском языке.`;
  const data = await callAi({ subject: AI_SUBJECT, items, review: true, context });
  const ai = { ...(r.ai || {}) };
  const cut = (x, n = 500) => String(x || "").slice(0, n);
  for (const x of data.results || []) {
    const it = items.find((i) => i.key === x.key);
    if (!it || !Number.isFinite(Number(x.score))) continue;
    ai[x.key] = { score: Math.max(0, Math.min(it.max, Math.round(Number(x.score) * 2) / 2)), comment: cut(x.comment, 400),
      good: cut(x.good), missing: cut(x.missing), advice: cut(x.advice) };
  }
  const upd = { ai, aiStatus: "done", aiError: null, aiAt: Date.now() };
  if (data.summary) upd.aiSummary = { strengths: cut(data.summary.strengths, 800), gaps: cut(data.summary.gaps, 800), advice: cut(data.summary.advice, 800) };
  await update(ref(db, `${P}/${id}`), upd);
}

// =====================================================================
//  PDF-отчёт (печать → «Сохранить как PDF»)
// =====================================================================
function reportOf(r) {
  const e = evaluate(r), v = e.v, A = r.answers || {};
  const cell = (k) => {
    const it = e.items.find((i) => i.k === k);
    const ok = it.score >= it.max;
    return `<td class="${it.answer ? (ok ? "g" : "b") : "b"}">${it.answer ? esc(it.answer) : "—"}${ok ? "" : `<small>${fmt(it.key)}</small>`}</td>`;
  };
  const n = (x) => String(x).replace(".", ",");
  const t1 = (c, s) => `<tr><th>${esc(c.name)}</th><td>${n(c.pop50)}</td><td>${n(c.pop24)}</td><td>${n(c.cbr50)}</td><td>${n(c.cbr24)}</td><td>${n(c.cdr50)}</td><td>${n(c.cdr24)}</td>
    ${cell(`gr_${s}50`)}${cell(`gr_${s}24`)}<td>${c.imr50}</td><td>${c.imr24}</td><td>${n(c.area)}</td>${cell(`de_${s}50`)}${cell(`de_${s}24`)}</tr>`;
  const t2 = (c) => `<tr><th>${esc(c.name)}</th><td>${c.young50}</td><td>${c.young24}</td><td>${c.old50}</td><td>${c.old24}</td><td>${c.le50}</td><td>${c.le24}</td>
    <td>${c.lm50}</td><td>${c.lm24}</td><td>${c.lf50}</td><td>${c.lf24}</td><td>${c.urb50}</td><td>${c.urb24}</td></tr>`;
  const ch = (s, c) => {
    const a = e.items.find((i) => i.k === `ch_${s}abs`), x = e.items.find((i) => i.k === `ch_${s}x`);
    const m = (it) => `<b class="${it.score >= it.max ? "g" : "b"}">${it.answer ? esc(it.answer) : "—"}</b>${it.score >= it.max ? " ✓" : ` ✗ <small>(верно: ${fmt(it.key)})</small>`}`;
    return `<div>${esc(c.name)}: изменение ${m(a)} млн чел.; в ${m(x)} раз(а)</div>`;
  };
  const yrs = (k) => "<th>1950</th><th>2024</th>".repeat(k);
  const answers = e.items.filter((i) => !i.calc).map((it) => {
    const a = it.aiData;
    return `<div class="qa"><div class="qh"><span class="qn">${it.n}</span><span class="qt">${esc(it.q)}</span>
      <span class="qp">${it.score === null ? "?" : fmt(it.score)} / ${it.max}</span></div>
      ${it.k === "q11" ? `<div class="chk">${ch("A", v.A)}${ch("B", v.B)}</div>` : ""}
      <div class="ans">${it.empty ? "<i>Ответ не дан</i>" : esc(it.answer)}</div>
      ${a && (a.good || a.missing || a.advice || a.comment) ? `<div class="cm">${a.good ? `<div class="g">✓ ${esc(a.good)}</div>` : ""}${a.missing ? `<div class="b">✗ ${esc(a.missing)}</div>` : ""}${a.advice ? `<div class="adv">💡 ${esc(a.advice)}</div>` : !a.good && !a.missing ? `<div>${esc(a.comment)}</div>` : ""}</div>` : ""}</div>`;
  }).join("");
  const S = r.aiSummary;
  const auto = { tab: "переключение вкладки", blur: "переход в другое окно", close: "закрытие страницы", timeout: "время вышло", teacher: "завершено учителем" }[r.reason];
  const part = (p) => e.items.filter((i) => (i.n || "").startsWith(p + ".")).reduce((s, i) => [s[0] + (i.score ?? 0), s[1] + i.max], [0, 0]);
  const [p1, m1] = part("1"), [p2, m2] = part("2"), [p3, m3] = part("3");
  return `<section>
    <div class="top"><div><div class="rib">🧪 Практическая работа № ${WORK.number} · География · 11 класс · §19</div>
      <h1>${esc(WORK.title)}</h1>
      <div class="meta"><b>${esc(r.name)}</b> · ${esc(r.cls)} · вариант ${r.variant}: <b>${esc(v.A.name)}</b> (Европа) и <b>${esc(v.B.name)}</b> (Африка) · ${fmtDate(r.submittedAt || r.startedAt)}</div>
      ${auto ? `<div class="warn">⚠ Работа завершена: ${auto}.</div>` : ""}</div>
      <div class="gr"><b>${e.complete ? e.grade : "≈" + e.grade}</b><span>${fmt(e.total)} / ${e.max} б.</span></div></div>
    <div class="parts"><span>Часть 1 — <b>${fmt(p1)} / ${m1}</b></span><span>Часть 2 — <b>${fmt(p2)} / ${m2}</b></span><span>Часть 3 — <b>${fmt(p3)} / ${m3}</b></span><span>Вычисления — <b>${fmt(e.auto)} / 12</b></span></div>
    <h2>1. Динамика населения</h2>
    <table class="d"><thead><tr><th rowspan="2"></th><th colspan="2">Численность, млн чел.</th><th colspan="2">Рождаемость, ‰</th><th colspan="2">Смертность, ‰</th>
      <th colspan="2" class="hl">Естеств. прирост, ‰</th><th colspan="2">Младенч. смертность, ‰</th><th rowspan="2">Площадь, тыс. км²</th><th colspan="2" class="hl">Плотность, чел./км²</th></tr>
      <tr>${yrs(6)}</tr></thead><tbody>${t1(v.A, "A")}${t1(v.B, "B")}</tbody></table>
    <div class="leg"><span class="g">■</span> верно · <span class="b">■</span> неверно (мелко — правильный ответ)</div>
    <h2>2. Структура населения</h2>
    <table class="d"><thead><tr><th rowspan="2"></th><th colspan="2">0–14 лет, %</th><th colspan="2">65+ лет, %</th><th colspan="2">ОПЖ, всего</th><th colspan="2">ОПЖ, мужчины</th><th colspan="2">ОПЖ, женщины</th><th colspan="2">Урбанизация, %</th></tr>
      <tr>${yrs(6)}</tr></thead><tbody>${t2(v.A)}${t2(v.B)}</tbody></table>
    <h2>Ответы на вопросы</h2>${answers}
    ${S ? `<div class="sum"><b>Общий вывод.</b> <b>Сильные стороны:</b> ${esc(S.strengths)} <b>Пробелы:</b> ${esc(S.gaps)} <b>Что повторить:</b> ${esc(S.advice)}</div>` : ""}
    <div class="foot"><span>Шкала: ${SCALE.map(([p, g]) => `${g} — от ${Math.ceil(p / 100 * e.max * 2) / 2} б.`).join(" · ")}</span><span>Проверил: ${esc(TEACHER_SIGN)}</span></div>
  </section>`;
}

function printReports(ids) {
  const pages = ids.map((id) => reportOf(RESULTS[id])).join("");
  const w = window.open("", "_blank");
  if (!w) return alert("Браузер заблокировал новое окно. Разрешите всплывающие окна для этого сайта.");
  w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Практическая работа № 1 · отчёты</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap">
  <style>
    @page{size:A4;margin:11mm}
    body{margin:0;font-family:Manrope,Arial,sans-serif;color:#0B1A3B;font-size:11.5px;line-height:1.4}
    section{page-break-after:always}
    .top{display:flex;gap:14px;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2E4BFF;padding-bottom:8px;margin-bottom:8px}
    .rib{display:inline-block;background:#E2F6F2;color:#0E7F72;font-weight:800;font-size:10px;letter-spacing:.05em;text-transform:uppercase;padding:3px 10px;border-radius:999px}
    h1{font-size:16px;margin:5px 0 3px}h2{font-size:12.5px;margin:12px 0 5px;color:#2E4BFF;text-transform:uppercase;letter-spacing:.04em}
    .meta{font-size:12px}.warn{color:#C2253B;font-weight:700;margin-top:3px}
    .gr{flex:none;width:86px;height:86px;border-radius:50%;border:4px solid #2E4BFF;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .gr b{font-size:34px;line-height:1;color:#2E4BFF}.gr span{font-size:10px;color:#556A92;font-weight:700}
    .parts{display:flex;gap:6px;flex-wrap:wrap}.parts span{background:#EEF2F8;border-radius:8px;padding:3px 9px}
    table.d{width:100%;border-collapse:collapse;font-size:10.5px}table.d th,table.d td{border:1px solid #B9C6DD;padding:3px 4px;text-align:center}
    table.d thead th{background:#FDF1E6}table.d thead th.hl{background:#DDF4EF}table.d tbody th{text-align:left;white-space:nowrap}
    td.g,.g{color:#0B8A5A;font-weight:800}td.g{background:#E3F8EF}td.b,.b{color:#C2253B;font-weight:800}td.b{background:#FDECEE}
    td small{display:block;font-weight:600;color:#556A92;font-size:9px}
    .leg{font-size:10px;color:#556A92;margin-top:3px}
    .qa{border:1px solid #DCE4F2;border-radius:8px;padding:6px 9px;margin:6px 0;break-inside:avoid;page-break-inside:avoid}
    .qh{display:flex;gap:7px;align-items:baseline}.qn{background:#2E4BFF;color:#fff;border-radius:6px;padding:0 6px;font-weight:800;font-size:10.5px}
    .qt{flex:1;font-weight:700}.qp{font-weight:800;color:#2E4BFF;white-space:nowrap}
    .ans{background:#F5F8FD;border-radius:6px;padding:5px 8px;margin-top:4px;white-space:pre-wrap}
    .chk{margin-top:4px}.cm{margin-top:4px;font-size:10.8px}.cm .adv{background:#FFF6E0;border-left:3px solid #E0B100;padding:2px 7px;margin-top:2px;color:#6B4B00}
    .sum{margin-top:8px;background:#E8EDFF;border:1px solid #C9D3FF;border-radius:8px;padding:7px 10px}
    .foot{display:flex;justify-content:space-between;gap:10px;margin-top:8px;color:#556A92;font-size:9.5px}
    .hint{font-family:Arial,sans-serif;background:#E8EDFF;color:#1B3F9E;padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:13px}
    @media print{.hint{display:none}}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  </style></head><body><div class="hint">Чтобы сохранить PDF: в окне печати выберите принтер «Сохранить как PDF» и нажмите «Сохранить».</div>${pages}</body></html>`);
  w.document.close();
  const go = () => setTimeout(() => w.print(), 300);
  (w.document.fonts?.ready || Promise.resolve()).then(() => setTimeout(go, 400), go);
}

// =====================================================================
//  Список вариантов и CSV
// =====================================================================
function showVariants() {
  openId = null;
  dlg.innerHTML = `<div class="dlg-head"><b>📋 ${VARIANTS.length} вариантов: пары стран и верные вычисления</b>
      <span><button class="btn small ghost" id="vPrint">🖨 Печать</button> <button class="btn small ghost" id="vClose">Закрыть ✕</button></span></div>
    <div class="dlg-body"><div class="table-wrap"><table class="res" id="vTable"><thead><tr><th>Вар.</th><th>Европа</th><th>Африка</th>
      <th>Ест. прирост 1950 / 2024, ‰</th><th>Плотность 1950 / 2024, чел./км²</th><th>Рост населения, млн / раз</th></tr></thead><tbody>
      ${VARIANTS.map((v) => { const K = calcKey(v);
        return `<tr><td><b>${v.id}</b></td><td>${esc(v.A.name)}</td><td>${esc(v.B.name)}</td>
          <td>${esc(v.A.name)}: ${fmt(K.gr_A50)} / ${fmt(K.gr_A24)}<br>${esc(v.B.name)}: ${fmt(K.gr_B50)} / ${fmt(K.gr_B24)}</td>
          <td>${fmt(K.de_A50)} / ${fmt(K.de_A24)}<br>${fmt(K.de_B50)} / ${fmt(K.de_B24)}</td>
          <td>${K.ch_Aabs > 0 ? "+" : ""}${fmt(K.ch_Aabs)} / ×${fmt(K.ch_Ax)}<br>${K.ch_Babs > 0 ? "+" : ""}${fmt(K.ch_Babs)} / ×${fmt(K.ch_Bx)}</td></tr>`; }).join("")}</tbody></table></div></div>`;
  dlg.showModal();
  $("#vClose").onclick = () => dlg.close();
  $("#vPrint").onclick = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Варианты · ПР № 1</title><style>
      body{font-family:Arial,sans-serif;font-size:11px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}
      </style></head><body><h3>Практическая работа № 1 · ключи вычислений</h3>${$("#vTable").outerHTML}</body></html>`);
    w.document.close(); setTimeout(() => w.print(), 400);
  };
}

function exportCsv() {
  const head = ["Ученик", "Класс", "Вариант", "Страны", "Статус", "Нарушения", "Вычисления (из 12)",
    ...TEXT_QS.map((q) => "Вопрос " + q.n), "Итог", "Макс.", "Оценка", "Проверено полностью"];
  const lines = [head];
  for (const [, r] of rows().reverse()) {
    if (r.status !== "submitted") continue;
    const e = evaluate(r);
    lines.push([r.name, r.cls, r.variant, `${e.v.A.name} — ${e.v.B.name}`, r.reason || "", r.violations || 0, fmt(e.auto),
      ...TEXT_QS.map((q) => { const it = e.items.find((i) => i.k === q.k); return it.score === null ? "" : fmt(it.score); }),
      fmt(e.total), e.max, e.grade, e.complete ? "да" : "нет"]);
  }
  const csv = "﻿" + lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `prakticheskaya-1-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
