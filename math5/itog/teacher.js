// Тренировочный итоговый тест · Математика 5 · панель учителя: автопроверка, ИИ, PDF, бланки, ответы
// Ответы вычисляются из условий вариантов прямо здесь — отдельный файл ключей загружать не нужно.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../../firebase-config.js";
import { TEST, VARIANTS, shopText, stHtml, buyText, exprHtml, mText, lei } from "./questions.js?v=1";

const WORK = TEST;
const ENTRY = { id: TEST.id, title: "Тренировочный итоговый тест · Математика 5", path: "math5/itog/", subject: "math", grade: "5" };
const AI_SUBJECT = "математика, 5 класс (тренировочный итоговый тест: делимость натуральных чисел, признаки делимости на 2, 5, 10, числовые выражения), Республика Молдова";
const TEACHER_SIGN = "Туманов Д. А.";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
const fmtTime = (ms) => ms ? new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const norm = (s) => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const plain = (h) => String(h).replace(/<sup>(\d+)<\/sup>/g, "^$1").replace(/<[^>]+>/g, "");
const app = $("#app"), dlg = $("#dlg");

const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb), auth = getAuth(fb);
const P = `results/${WORK.id}`;

let RESULTS = {}, AICFG = null, aiAuto = false, filterCls = "", search = "", openId = null, unsub = [], seen = new Set();
const aiQueue = [], aiQueued = new Set(); let aiBusy = false;

const TOPICS = { "1а": "Истинно / ложно (делимость)", "1б": "Множество делителей", "1в": "Деление с остатком", "1г": "Задача о покупке",
  "2а": "Значение выражения", "2б": "Чётное / нечётное", "2в": "Скобки и признак делимости" };
const gradeOf = (total) => { for (const [min, g] of TEST.scale) if (total >= min - 1e-9) return g; return 1; };

// =====================================================================
//  Ответы (вычисляются из условий)
// =====================================================================
const divisors = (n) => { const d = []; for (let i = 1; i <= n; i++) if (n % i === 0) d.push(i); return d; };
const truth = (s) => s.k === "div" ? s.x % s.y === 0 : s.k === "ndiv" ? s.x % s.y !== 0 : s.x % s.y === 0;
function solutions(v) {
  const out = [];
  for (let x = 1; x * v.a.price < v.budget; x++) { const rest = v.budget - x * v.a.price; if (rest % v.b.price === 0 && rest > 0) out.push([x, rest / v.b.price]); }
  return out;
}
// строгий подсчёт: только натуральные числа, деление нацело, без отрицательных результатов
function strictEval(ex, o = [], c = []) {
  const T = [];
  ex.n.forEach((x, i) => {
    for (let j = 0; j < (o[i] || 0); j++) T.push("(");
    T.push(x);
    for (let j = 0; j < (c[i] || 0); j++) T.push(")");
    if (i < 4) T.push(["*", "+", ":", "-"][i]);
  });
  T.push("^", ex.k);
  let p = 0;
  const peek = () => T[p], eat = () => T[p++];
  const fail = () => { throw new Error("bad"); };
  const prim = () => {
    let v; const t = peek();
    if (t === "(") { eat(); v = expr(); if (eat() !== ")") fail(); }
    else if (typeof t === "number") v = eat(); else fail();
    if (peek() === "^") { eat(); v = v ** eat(); }
    return v;
  };
  const term = () => { let v = prim(); while (peek() === "*" || peek() === ":") { const op = eat(), w = prim(); if (op === "*") v *= w; else { if (!w || v % w) fail(); v /= w; } } return v; };
  const expr = () => { let v = term(); while (peek() === "+" || peek() === "-") { const op = eat(), w = term(); v = op === "+" ? v + w : v - w; if (v < 0) fail(); } return v; };
  try { const v = expr(); return p === T.length ? v : null; } catch (e) { return null; }
}
function keyOf(v) {
  const [p, q, r, s, t] = v.ex.n;
  const pow = t ** v.ex.k, mul = p * q, div = r / s, add = mul + div, val = add - pow;
  // все правильные расстановки одной пары скобок
  const good = [];
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
    const o = [0, 0, 0, 0, 0], c = [0, 0, 0, 0, 0]; o[i] = 1; c[j] = 1;
    const x = strictEval(v.ex, o, c);
    if (x !== null && x > 0 && x % v.m === 0 && x !== val) good.push({ o, c, val: x });
  }
  return { a1: v.st.map((s) => (truth(s) ? "И" : "Л")), b1: divisors(v.b.price), c1: { q: Math.floor(v.budget / v.a.price), r: v.budget % v.a.price },
    d1: solutions(v), a2: { pow, mul, div, add, val }, b2: val % 2 ? "odd" : "even", c2: good };
}
const KEYS = Object.fromEntries(VARIANTS.map((v) => [v.id, keyOf(v)]));
const nums = (s) => [...new Set((String(s || "").match(/\d+/g) || []).map(Number))];
const n0 = (x) => (x === undefined || x === null || String(x).trim() === "" ? null : Number(String(x).trim()));

// =====================================================================
//  Оценивание
// =====================================================================
function evaluate(r) {
  const v = VARIANTS.find((x) => x.id === r.variant), k = KEYS[r.variant];
  const A = r.answers || {}, M = r.manual || {}, AI = r.ai || {};
  const items = [];
  const add = (it) => {
    it.teacher = Number.isFinite(M[it.k]) ? M[it.k] : null;
    const a = AI[it.k]; it.ai = a && Number.isFinite(a.score) ? Math.max(0, Math.min(it.max, a.score)) : null; it.aiData = a || null;
    if (it.check && it.empty) it.auto = 0;
    it.score = it.teacher ?? it.ai ?? it.auto;
    items.push(it);
  };
  // 1 а
  v.st.forEach((s, i) => add({ k: `a1${i}`, n: "1а", label: s.k === "div" ? `${s.x} делится на ${s.y}` : s.k === "ndiv" ? `${s.x} не делится на ${s.y}` : `${s.x} кратно ${s.y}`, html: stHtml(s), max: 1,
    answer: A.a1?.[i] || "", key: k.a1[i], auto: A.a1?.[i] === k.a1[i] ? 1 : 0 }));
  // 1 б
  { const got = nums(A.b1), ok = got.filter((x) => k.b1.includes(x)), bad = got.filter((x) => !k.b1.includes(x));
    add({ k: "b1", n: "1б", label: `D${v.b.price} — по 1 б. за каждый делитель, −1 б. за лишнее число`, max: 8, answer: A.b1 ? `{${got.join(", ")}}` : "",
      key: `{${k.b1.join(", ")}}` + (bad.length ? ` · лишние: ${bad.join(", ")}` : "") + (ok.length < 8 && got.length ? ` · нет: ${k.b1.filter((x) => !got.includes(x)).join(", ")}` : ""),
      auto: Math.max(0, ok.length - bad.length) }); }
  // 1 в
  add({ k: "c1q", n: "1в", label: `${v.budget} : ${v.a.price} — частное`, max: 1, answer: A.c1?.q ?? "", key: String(k.c1.q), auto: n0(A.c1?.q) === k.c1.q ? 1 : 0 });
  add({ k: "c1r", n: "1в", label: `${v.budget} : ${v.a.price} — остаток`, max: 1, answer: A.c1?.r ?? "", key: String(k.c1.r), auto: n0(A.c1?.r) === k.c1.r ? 1 : 0 });
  // 1 г
  { const rows = Object.values(A.d1 || {}).map((x) => [n0(x?.x), n0(x?.y)]).filter(([x, y]) => x !== null && y !== null);
    const uniq = [...new Map(rows.map((p) => [p.join("/"), p])).values()];
    const isOk = (p) => k.d1.some((s) => s[0] === p[0] && s[1] === p[1]);
    const ok = uniq.filter(isOk), bad = uniq.filter((p) => !isOk(p));
    const per = 6 / k.d1.length;
    add({ k: "d1", n: "1г", label: `${v.a.many} и ${v.b.many} на ${lei(v.budget)} — по ${fmt(per)} б. за верный вариант, −1 б. за неверный`, max: 6,
      answer: uniq.map((p) => `${p[0]} и ${p[1]}`).join("; "), key: k.d1.map((p) => `${p[0]} и ${p[1]}`).join("; ") + (bad.length ? ` · неверно: ${bad.map((p) => `${p[0]} и ${p[1]}`).join("; ")}` : ""),
      auto: Math.max(0, Math.min(6, Math.round((per * ok.length - bad.length) * 2) / 2)) }); }
  // 2 а
  [["pow", "возведение в степень"], ["mul", "умножение"], ["div", "деление"], ["add", "сложение"], ["val", "значение выражения"]].forEach(([x, l]) =>
    add({ k: `a2${x}`, n: "2а", label: l, max: 1, answer: A.a2?.[x] ?? "", key: String(k.a2[x]), auto: n0(A.a2?.[x]) === k.a2[x] ? 1 : 0 }));
  // 2 б
  add({ k: "b2", n: "2б", label: "Значение выражения — чётное или нечётное", max: 2, answer: { even: "чётное", odd: "нечётное" }[A.b2] || "",
    key: k.b2 === "even" ? "чётное" : "нечётное", auto: A.b2 === k.b2 ? 2 : 0 });
  // 2 в
  { const c2 = A.c2 || {}, o = (c2.o || []).map(Number), c = (c2.c || []).map(Number);
    const has = o.some((x) => x > 0) || c.some((x) => x > 0);
    const val = has ? strictEval(v.ex, o, c) : null;
    const okBr = val !== null && val > 0 && val % v.m === 0 && val !== k.a2.val;
    const shown = has ? plain(exprHtml(v.ex, o, c)) : "";
    const ex = k.c2.map((g) => `${plain(exprHtml(v.ex, g.o, g.c))} = ${g.val}`).join("; ");
    add({ k: "c2b", n: "2в", label: `Скобки: результат ${mText(v.m)}`, max: 4,
      answer: shown ? shown + (val === null ? " (так посчитать нельзя: деление не нацело, вычитание из меньшего или скобки не закрыты)" : ` → ${val}`) : "",
      key: "например: " + ex, auto: okBr ? 4 : 0 });
    add({ k: "c2v", n: "2в", label: "Значение выражения со скобками", max: 2, answer: c2.v ?? "", key: val !== null ? String(val) : "—", auto: has && val !== null && n0(c2.v) === val ? 2 : 0 });
    const why = String(c2.why || "");
    const w = norm(why), kw = /(оканчива|последн|цифр|на конце|в конце)/.test(w) && (v.m === 5 ? /(0|5|нол|нул|пят)/.test(w) : /(0|нол|нул)/.test(w));
    add({ k: "c2w", n: "2в", label: `Обоснование: почему число делится на ${v.m}`, max: 1, answer: why, empty: !w, check: true, auto: kw && okBr ? 1 : null,
      question: `Ученик поставил скобки в выражении ${plain(exprHtml(v.ex))} и получил ${shown || "—"} = ${c2.v || "?"}. Нужно обосновать, почему полученное число делится на ${v.m}.`,
      model: v.m === 5 ? "Число делится на 5, потому что его последняя цифра 0 или 5 (признак делимости на 5)." : "Число делится на 10, потому что оканчивается цифрой 0 (признак делимости на 10).",
      criteria: `1 б. — назван верный признак делимости на ${v.m} (последняя цифра ${v.m === 5 ? "0 или 5" : "0"}) или показано деление нацело на ${v.m}; 0 б. — обоснования нет или оно неверное. Ученику 10–11 лет: простые формулировки допустимы.` }); }

  const max = items.reduce((s, i) => s + i.max, 0);
  const total = items.reduce((s, i) => s + (i.score ?? 0), 0);
  const auto = items.filter((i) => !i.check).reduce((s, i) => s + (i.score ?? 0), 0);
  const pending = items.filter((i) => i.score === null).length;
  const tasks = {};
  for (const it of items) { const tt = (tasks[it.n] = tasks[it.n] || { n: it.n, sum: 0, max: 0 }); tt.sum += it.score ?? 0; tt.max += it.max; }
  return { v, k, items, tasks, max, total, auto, pending, complete: !pending, grade: gradeOf(total) };
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
    <button class="btn" id="go">Войти через Google</button>
    <p class="muted" style="margin-top:14px;font-size:14px">Бланки для печати открываются и без входа: <a href="blanks.html" target="_blank">🖨 бланки 5 вариантов</a>.</p></div>`;
  $("#go").onclick = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { $("#err").textContent = "Не удалось войти: " + (e.code || e.message); }
  };
}

function showDashboard() {
  app.innerHTML = `<a class="backlink noprint" href="../../teacher/">← Центр управления</a>
  <div class="card pr-head">
    <div class="m-ribbon">📐 Тренировочный итоговый тест</div>
    <h2 style="margin-bottom:4px">${esc(TEST.topic)}</h2>
    <div class="muted">${esc(TEST.subtitle)} · ${VARIANTS.length} вариантов · ${TEST.minutes} минут · максимум ${TEST.max} балла
      · всё проверяется автоматически, обоснование в 2 в) — по ключевым словам, ИИ или вами</div>
    <div class="muted" id="pinInfo" style="font-size:14px;margin-top:8px"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <a class="btn small" href="blanks.html" target="_blank">🖨 Бланки для учеников (5 вариантов)</a>
      <button class="btn small ghost" id="bKeys">🔑 Ответы ко всем вариантам</button>
    </div>
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
    <label class="switch"><input type="checkbox" id="swAi"> <span>🤖 Автоматически проверять обоснования ИИ (пока открыта эта панель)</span></label>
    <span class="muted" id="aiStatus" style="font-size:14px"></span>
  </div>
  <div class="stats" id="stats" style="margin-bottom:14px"></div>
  <div class="table-wrap"><table class="res"><thead><tr>
    <th>№</th><th>Ученик</th><th>Класс</th><th>Вариант</th><th>Статус</th><th>Нарушения</th><th>Начало / сдано</th>
    <th>Задание 1</th><th>Задание 2</th><th>Итог</th><th>Отметка</th><th></th></tr></thead><tbody id="tb"><tr><td colspan="12" class="muted">Ожидание работ…</td></tr></tbody></table></div>
  ${scaleTable()}`;

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
  $("#bKeys").onclick = printKeys;
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
    if (!ids.length) return setAiStatus("Нет обоснований для проверки ИИ.");
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

function scaleTable() {
  return `<div class="card"><b>Схема оценивания теста</b> (как в учебнике)
    <div class="table-wrap"><table class="res scale-t"><tr><th>Отметка</th>${TEST.scale.map(([, g]) => `<td><b>${g}</b></td>`).join("")}</tr>
    <tr><th>Сумма баллов</th>${TEST.scale.map(([min], i) => `<td>${i ? TEST.scale[i - 1][0] - 1 : TEST.max}–${min}</td>`).join("")}</tr></table></div>
    <p class="muted" style="font-size:14px;margin:6px 0 0">Ученик видит свой результат на экране сразу после того, как работа проверена (пока открыта эта панель).</p></div>`;
}

function aiMissing() {
  alert("Проверка ИИ ещё не настроена. Откройте Центр управления → любой тест → кнопка «⚙ ИИ» и вставьте адрес веб-приложения и секретное слово. Настройка общая для всех работ.");
}

// Итог сохраняется в базе — его видят Центр управления, прогресс учеников и сам ученик
const lastSync = {};
// Разбор для ученика: задания, ответ ученика, правильный ответ, баллы, комментарий ИИ.
// Ученик увидит его, только если в Центре управления включён «🔍 Разбор» для этой работы.
const cutR = (x, n = 400) => { const t = String(x ?? "").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const reviewItems = (items) => (items || []).slice(0, 80).map((x) => ({ l: cutR((x.n ? x.n + ". " : "") + (x.label || ""), 300),
  s: x.score === null || x.score === undefined ? null : Math.round(x.score * 10) / 10, m: x.max, a: cutR(x.answer || "—"), k: cutR(x.key || x.model || ""),
  c: cutR(x.aiData ? [x.aiData.comment, x.aiData.advice ? "Совет: " + x.aiData.advice : ""].filter(Boolean).join(" ") : "") }));
function syncResults() {
  for (const [id, r] of Object.entries(RESULTS)) {
    if (r.status !== "submitted") continue;
    const e = evaluate(r);
    const res = { total: e.total, max: e.max, grade: e.grade, complete: e.complete, pct: Math.round(e.total / e.max * 100) };
    res.items = reviewItems(e.items);
    res.sig = JSON.stringify([res.total, res.max, res.grade, res.complete, res.items.map((x) => [x.s, x.c.length])]);
    if (lastSync[id] === res.sig || r.result?.sig === res.sig) { lastSync[id] = res.sig; continue; }
    lastSync[id] = res.sig;
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
  if (r.aiStatus === "done") return ` <span class="tag done" title="Обоснование проверено ИИ">🤖</span>`;
  if (r.aiStatus === "error") return ` <span class="tag auto" title="${esc(r.aiError || "")}">🤖 ошибка</span>`;
  return "";
}
const sumTask = (e, pre) => Object.values(e.tasks).filter((t) => t.n.startsWith(pre)).reduce((a, t) => [a[0] + t.sum, a[1] + t.max], [0, 0]);

function renderTable() {
  const list = rows();
  const all = Object.values(RESULTS);
  const sub = all.filter((r) => r.status === "submitted");
  const ev = sub.map(evaluate);
  const done = ev.filter((e) => e.complete);
  $("#stats").innerHTML = [["Всего", all.length], ["Пишут", all.filter((r) => r.status === "in_progress").length], ["Сдали", sub.length],
    ["Проверено полностью", done.length], ["Средняя отметка", done.length ? fmt(done.reduce((s, e) => s + e.grade, 0) / done.length) : "—"],
    ["Средний балл", ev.length ? fmt(ev.reduce((s, e) => s + e.total, 0) / ev.length) + " / " + TEST.max : "—"]]
    .map(([l, n]) => `<div class="stat"><b>${n}</b>${l}</div>`).join("");
  const tb = $("#tb");
  if (!list.length) { tb.innerHTML = `<tr><td colspan="12" class="muted">Работ пока нет.</td></tr>`; return; }
  tb.innerHTML = list.map(([id, r], i) => {
    const fin = r.status === "submitted";
    const e = fin ? evaluate(r) : null;
    const t1 = e ? sumTask(e, "1") : null, t2 = e ? sumTask(e, "2") : null;
    const isNew = !seen.has(id); seen.add(id);
    return `<tr class="${isNew && seen.size > list.length ? "new" : ""}">
      <td>${list.length - i}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.cls)}</td>
      <td>${r.variant}</td>
      <td>${statusTag(r)}${aiTag(r)}</td>
      <td>${r.violations ? `<span class="tag auto">${r.violations}</span>` : "0"}</td>
      <td style="white-space:nowrap">${fmtTime(r.startedAt)} / ${fmtTime(r.submittedAt)}</td>
      <td>${t1 ? `${fmt(t1[0])} / ${t1[1]}` : "—"}</td>
      <td>${t2 ? `${fmt(t2[0])} / ${t2[1]}` : "—"}</td>
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
  const e = evaluate(r);
  const scrollTop = dlg.open ? dlg.scrollTop : 0;
  const scoreIn = (it) => `<span class="sc"><input type="number" class="score-in" min="0" max="${it.max}" step="0.5" data-mk="${it.k}"
      value="${it.score ?? ""}" placeholder="?"> / ${it.max}${it.teacher !== null ? ` <button class="btn small ghost" data-reset="${it.k}" title="Убрать оценку учителя">↺</button>` : ""}</span>`;
  const blocks = Object.values(e.tasks).map((T) => {
    const its = e.items.filter((i) => i.n === T.n);
    const rws = its.filter((i) => !i.check).map((it) => { const ok = (it.score ?? 0) >= it.max;
      return `<tr><td>${it.html || esc(it.label)}</td><td class="ans-c">${it.answer !== "" ? esc(it.answer) : '<span class="muted">—</span>'}</td><td>${esc(it.key)}</td>
        <td class="${ok ? "ok" : "bad"}">${ok ? "✓" : (it.score ?? 0) > 0 ? "½" : "✗"}</td><td>${scoreIn(it)}</td></tr>`; }).join("");
    const opens = its.filter((i) => i.check).map((it) => { const a = it.aiData;
      return `<div class="chk-item ${it.score === null ? "need" : ""}"><div class="chk-row"><b>${esc(it.label)}</b>${scoreIn(it)}</div>
        <div class="ans">${it.empty ? '<span class="muted">Ответ не дан</span>' : esc(it.answer)}</div>
        ${it.auto !== null && it.teacher === null && it.ai === null && !it.empty ? `<div class="muted" style="font-size:13px">✓ найдены слова признака делимости — 1 б. поставлен автоматически</div>` : ""}
        ${a ? `<div class="ai-box"><b>🤖 ИИ: ${fmt(a.score)} / ${it.max}</b> ${esc(a.comment || "")}${a.good ? `<div class="ok">✓ ${esc(a.good)}</div>` : ""}${a.missing ? `<div class="bad">✗ ${esc(a.missing)}</div>` : ""}${a.advice ? `<div class="adv">💡 ${esc(a.advice)}</div>` : ""}</div>` : ""}
        <details class="model"><summary>Критерии и образец ответа</summary><p>${esc(it.criteria || "")}</p><p><b>Образец:</b> ${esc(it.model || "")}</p></details></div>`; }).join("");
    return `<h3 class="h3">${T.n}) ${esc(TOPICS[T.n])} · ${fmt(T.sum)} / ${T.max}</h3>
      ${rws ? `<div class="table-wrap"><table class="res calc-t"><thead><tr><th>Пункт</th><th>Ответ ученика</th><th>Верно</th><th></th><th>Баллы</th></tr></thead><tbody>${rws}</tbody></table></div>` : ""}${opens}`;
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
        · <b>Итог: ${fmt(e.total)} / ${e.max}</b> · отметка: <b class="grade">${e.complete ? e.grade : "≈" + e.grade}</b>
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
//  Проверка ИИ (только обоснование в 2 в)
// =====================================================================
function setAiStatus(t) { const el = $("#aiStatus"); if (el) el.textContent = t; }
function aiTargets(r, all = false) {
  return evaluate(r).items.filter((i) => i.check && !i.empty && (all || (i.teacher === null && i.auto === null)))
    .map((i) => ({ key: i.k, max: i.max, question: i.question, answer: i.answer.slice(0, 1000), model: i.model || "", criteria: i.criteria || "" }));
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
  const items = aiTargets(r, true).filter((i) => !(r.manual && Number.isFinite(r.manual[i.key])));
  const e = evaluate(r);
  const context = Object.values(e.tasks).map((T) => {
    const bad = e.items.filter((i) => i.n === T.n && !i.check && (i.score ?? 0) < i.max).map((i) => `${plain(i.label)}: ответ «${i.answer || "нет"}», верно «${i.key}»`);
    return `${T.n}) ${TOPICS[T.n]}: ${fmt(T.sum)} из ${T.max} б.` + (bad.length ? ". Ошибки: " + bad.join("; ") : "");
  }).join("\n") + "\nУченик 5 класса. Оценивай доброжелательно, но строго по критериям. Комментарии — на русском языке, коротко и понятно ребёнку.";
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
//  PDF-отчёт, ответы, CSV
// =====================================================================
const PRINT_CSS = `@page{size:A4;margin:11mm}body{margin:0;font-family:Manrope,Arial,sans-serif;color:#0B1A3B;font-size:11px;line-height:1.35}
    section{page-break-after:always}
    .top{display:flex;gap:14px;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #FF9F43;padding-bottom:8px;margin-bottom:8px}
    .rib{display:inline-block;background:#FFF1E2;color:#B5530A;font-weight:800;font-size:10px;letter-spacing:.05em;text-transform:uppercase;padding:3px 10px;border-radius:999px}
    h1{font-size:15px;margin:5px 0 3px}.meta{font-size:12px}.warn{color:#C2253B;font-weight:700;margin-top:3px}
    .gr{flex:none;width:84px;height:84px;border-radius:50%;border:4px solid #2E4BFF;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .gr b{font-size:32px;line-height:1;color:#2E4BFF}.gr span{font-size:10px;color:#556A92;font-weight:700}
    .qa{border:1px solid #DCE4F2;border-radius:8px;padding:5px 8px;margin:5px 0;break-inside:avoid;page-break-inside:avoid}
    .qh{display:flex;gap:7px;align-items:baseline;margin-bottom:3px}.qn{background:#2E4BFF;color:#fff;border-radius:6px;padding:0 6px;font-weight:800}
    .qt{flex:1;font-weight:800}.qp{font-weight:800;color:#2E4BFF}
    table.d{width:100%;border-collapse:collapse;font-size:10.3px}table.d td{border-top:1px solid #EEF2F8;padding:2px 4px;vertical-align:top}
    td.l{width:38%}td.p{white-space:nowrap;text-align:right;font-weight:800}
    td.g{color:#0B8A5A;font-weight:700}td.b{color:#C2253B;font-weight:700}td.m{color:#B7791F;font-weight:700}
    .sum{margin-top:8px;background:#E8EDFF;border:1px solid #C9D3FF;border-radius:8px;padding:7px 10px}
    .foot{display:flex;justify-content:space-between;gap:10px;margin-top:8px;color:#556A92;font-size:9.5px}
    .hint{font-family:Arial,sans-serif;background:#E8EDFF;color:#1B3F9E;padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:13px}
    .dv{font-weight:800}.ndv{position:relative;display:inline-block}.ndv::after{content:"";position:absolute;left:50%;top:8%;height:84%;border-left:1.4px solid currentColor;transform:rotate(30deg)}
    table.k{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px}table.k td,table.k th{border:1px solid #DCE4F2;padding:4px 6px;vertical-align:top;text-align:left}
    table.k th{background:#F5F8FD;width:24%}
    @media print{.hint{display:none}}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;
function openPrint(title, body) {
  const w = window.open("", "_blank");
  if (!w) return alert("Браузер заблокировал новое окно. Разрешите всплывающие окна для этого сайта.");
  w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap">
  <style>${PRINT_CSS}</style></head><body><div class="hint">Чтобы сохранить PDF: в окне печати выберите «Сохранить как PDF».</div>${body}</body></html>`);
  w.document.close();
  const go = () => setTimeout(() => w.print(), 300);
  (w.document.fonts?.ready || Promise.resolve()).then(() => setTimeout(go, 400), go);
}
const scaleLine = () => TEST.scale.map(([min, g], i) => `${g} — ${i ? TEST.scale[i - 1][0] - 1 : TEST.max}–${min}`).join(" · ");

function reportOf(r) {
  const e = evaluate(r);
  const tasks = Object.values(e.tasks).map((T) => {
    const its = e.items.filter((i) => i.n === T.n);
    return `<div class="qa"><div class="qh"><span class="qn">${T.n}</span><span class="qt">${esc(TOPICS[T.n])}</span><span class="qp">${fmt(T.sum)} / ${T.max}</span></div>
      <table class="d">${its.map((it) => { const ok = (it.score ?? 0) >= it.max, part = (it.score ?? 0) > 0;
        return `<tr><td class="l">${it.html || esc(it.label)}</td><td class="${ok ? "g" : part ? "m" : "b"}">${it.answer !== "" ? esc(it.answer) : "—"}</td>
          <td>${it.check ? (it.aiData?.missing ? "✗ " + esc(it.aiData.missing) : it.aiData?.good ? "✓ " + esc(it.aiData.good) : "") : ok ? "✓" : "верно: " + esc(it.key)}</td>
          <td class="p">${it.score === null ? "?" : fmt(it.score)}/${it.max}</td></tr>`; }).join("")}</table></div>`;
  }).join("");
  const S = r.aiSummary;
  const auto = { tab: "переключение вкладки", blur: "переход в другое окно", close: "закрытие страницы", timeout: "время вышло", teacher: "завершено учителем" }[r.reason];
  return `<section>
    <div class="top"><div><div class="rib">📐 Тренировочный итоговый тест · Математика · 5 класс</div>
      <h1>${esc(TEST.topic)}</h1>
      <div class="meta"><b>${esc(r.name)}</b> · ${esc(r.cls)} · вариант ${r.variant} · ${fmtDate(r.submittedAt || r.startedAt)}</div>
      ${auto ? `<div class="warn">⚠ Работа завершена: ${auto}.</div>` : ""}</div>
      <div class="gr"><b>${e.complete ? e.grade : "≈" + e.grade}</b><span>${fmt(e.total)} / ${e.max} б.</span></div></div>
    ${tasks}
    ${S ? `<div class="sum"><b>Общий вывод.</b> <b>Сильные стороны:</b> ${esc(S.strengths)} <b>Пробелы:</b> ${esc(S.gaps)} <b>Что повторить:</b> ${esc(S.advice)}</div>` : ""}
    <div class="foot"><span>Схема оценивания: ${scaleLine()}</span><span>Проверил: ${esc(TEACHER_SIGN)}</span></div>
  </section>`;
}
function printReports(ids) { openPrint("Тренировочный тест · математика 5 · отчёты", ids.map((id) => reportOf(RESULTS[id])).join("")); }

function printKeys() {
  const pages = VARIANTS.map((v) => {
    const k = KEYS[v.id];
    const rowsK = [
      ["1 а) (3 б.)", v.st.map((s, i) => `${stHtml(s)} → <b>${k.a1[i]}</b>`).join(" &nbsp;·&nbsp; ")],
      [`1 б) (8 б.)`, `D<sub>${v.b.price}</sub> = <b>{${k.b1.join(", ")}}</b> — по 1 б. за делитель, −1 б. за лишнее число`],
      ["1 в) (2 б.)", `${v.budget} : ${v.a.price} = <b>${k.c1.q}</b> (остаток <b>${k.c1.r}</b>)`],
      ["1 г) (6 б.)", `${esc(v.a.many)} и ${esc(v.b.many)}: ${k.d1.map((p) => `<b>${p[0]} и ${p[1]}</b> (${p[0]}·${v.a.price} + ${p[1]}·${v.b.price} = ${v.budget})`).join("; ")}<br>по ${fmt(6 / k.d1.length)} б. за верный вариант, −1 б. за неверный`],
      ["2 а) (5 б.)", `${exprHtml(v.ex)}: &nbsp;${v.ex.n[4]}<sup>${v.ex.k}</sup> = ${k.a2.pow}; ${v.ex.n[0]}·${v.ex.n[1]} = ${k.a2.mul}; ${v.ex.n[2]} : ${v.ex.n[3]} = ${k.a2.div}; ${k.a2.mul} + ${k.a2.div} = ${k.a2.add}; ${k.a2.add} − ${k.a2.pow} = <b>${k.a2.val}</b> — по 1 б. за действие`],
      ["2 б) (2 б.)", `<b>${k.b2 === "even" ? "чётным" : "нечётным"}</b>`],
      ["2 в) (7 б.)", `Подходит, например: ${k.c2.map((g) => `<b>${exprHtml(v.ex, g.o, g.c)} = ${g.val}</b>`).join("; ")}<br>
        4 б. — скобки поставлены верно, результат ${mText(v.m)}; 2 б. — верно вычислено значение; 1 б. — обоснование: ${v.m === 5 ? "последняя цифра 0 или 5" : "число оканчивается на 0"}`],
    ];
    return `<section><div class="top"><div><div class="rib">🔑 Ответы · только для учителя</div><h1>Вариант ${v.id}</h1>
      <div class="meta">${esc(TEST.subtitle)} · ${esc(TEST.topic)}</div></div></div>
      <p style="font-size:12px">${esc(shopText(v))}</p>
      <table class="k">${rowsK.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join("")}</table>
      <div class="foot"><span>Схема оценивания: ${scaleLine()}</span><span>Максимум ${TEST.max} б.</span></div></section>`;
  }).join("");
  openPrint("Ответы · тренировочный тест · математика 5", pages);
}

function exportCsv() {
  const head = ["Ученик", "Класс", "Вариант", "Статус", "Нарушения", ...Object.keys(TOPICS).map((n) => n + ")"), "Итог", "Макс.", "Отметка", "Проверено полностью"];
  const lines = [head];
  for (const [, r] of rows().reverse()) {
    if (r.status !== "submitted") continue;
    const e = evaluate(r);
    lines.push([r.name, r.cls, r.variant, r.reason || "", r.violations || 0, ...Object.keys(TOPICS).map((n) => fmt(e.tasks[n]?.sum || 0)), fmt(e.total), e.max, e.grade, e.complete ? "да" : "нет"]);
  }
  const csv = "﻿" + lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `trenirovochnyj-test-matematika5-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}
