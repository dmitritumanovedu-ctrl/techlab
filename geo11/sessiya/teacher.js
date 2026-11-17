// Пробная сессия · География 11 · панель учителя: ключи, автопроверка, ИИ, PDF
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../../firebase-config.js";
import { TEST, VARIANTS } from "./questions.js?v=1";

const WORK = TEST;
const ENTRY = { id: TEST.id, title: "Пробная сессия по географии · 11 класс", path: "geo11/sessiya/", subject: "geo", grade: "11" };
const AI_SUBJECT = "география, 11 класс (пробная зимняя сессия в формате БАК: политическая карта мира, природные ресурсы, население, мировая экономика), Республика Молдова";
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

const TOPICS = { 1: "Верно / неверно", 2: "Отрасли промышленности", 3: "Группировка / соответствие", 4: "Географические координаты",
  5: "Протяжённость по градусной сети", 6: "Температура воздуха и высота", 7: "Демографические показатели", 8: "Задание на основе утверждения" };

// Шкала сессии по географии (баллы из 49 → отметка)
const SCALE = [[47, 10], [42, 9], [35, 8], [32, 7], [25, 6], [15, 5], [10, 4], [6, 3], [4, 2], [0, 1]];
const toGrade = (t) => { for (const [p, g] of SCALE) if (t >= p - 1e-9) return g; return 1; };
const SCALE_TEXT = "47–49 → 10 · 42–46 → 9 · 35–41 → 8 · 32–34 → 7 · 25–31 → 6 · 15–24 → 5 · 10–14 → 4 · 6–9 → 3 · 4–5 → 2 · 0–3 → 1";

// =====================================================================
//  Оценивание
// =====================================================================
const nums = (s) => (String(s ?? "").replace(/[−–—]/g, "-").replace(/,/g, ".").replace(/\s+/g, "").match(/[-+]?\d+(?:\.\d+)?/g) || []).map(parseFloat);
const numLast = (s) => { const a = nums(s); return a.length ? a[a.length - 1] : NaN; };
const near = (x, y, tol) => Number.isFinite(x) && Math.abs(x - y) <= tol;
const nrm = (s) => norm(s).replace(/[«»"'`.,;:!?()\[\]\/\\–—\-]/g, " ").replace(/\s+/g, " ").trim();
const kwHit = (ans, list, not) => { const n = nrm(ans); if (!n) return -1; if ((not || []).some((x) => n.includes(nrm(x)))) return -1; return (list || []).findIndex((x) => n.includes(nrm(x))); };
const HEM = { с: "с. ш.", ю: "ю. ш.", в: "в. д.", з: "з. д." };
const fmtT = (n) => (n > 0 ? "+" : n < 0 ? "–" : "") + fmt(Math.abs(n));
const strip = (h) => String(h || "").replace(/<[^>]+>/g, "");
const itemNo = (items) => { let k = 0; return items.map((it) => /^[бвгд]\)/.test(it.q) ? "" : (++k) + ")"); };
function altSteps(t) {
  if (t.mode === "height") return ["разница температур", "вертикальный термический градиент", "относительная высота горы", "абсолютная высота вершины"];
  return ["разница в высоте", "вертикальный термический градиент", "разница температур", t.mode === "foot" ? "температура у подножия" : "температура на вершине"];
}
function gradOf(s) {
  const a = nums(s).filter((x) => ![100, 1000, 1].includes(Math.abs(x)));
  if (!a.length) return NaN;
  let g = Math.abs(a[0]); if (g >= 3) g /= 10; return g;
}
const CRIT2 = "2 б. — правильный и полный ответ; 1 б. — частично правильный ответ; 0 б. — неверно.";
const CRIT3 = "3 б. — правильный, полный и аргументированный ответ; 2 б. — указание и частичная аргументация; 1 б. — только правильное указание; 0 б. — неверно.";

function evaluate(r) {
  const v = VARIANTS.find((x) => x.id === r.variant), k = KEYS.variants[String(r.variant)];
  const A = r.answers || {}, M = r.manual || {}, AI = r.ai || {};
  const items = [];
  const add = (it) => {
    it.teacher = Number.isFinite(M[it.k]) ? M[it.k] : null;
    const a = AI[it.k]; it.ai = a && Number.isFinite(a.score) ? Math.max(0, Math.min(it.max, a.score)) : null; it.aiData = a || null;
    if (it.check && it.empty) it.auto = 0;
    it.score = it.teacher ?? it.ai ?? it.auto;
    items.push(it);
  };
  // короткий ответ: совпало ключевое слово → балл сразу; иначе проверяет ИИ/учитель (возможен другой верный ответ)
  const short = (key, n, label, max, ans, kk, question) => {
    const a = String(ans || ""), hit = kwHit(a, kk.a, kk.not) >= 0;
    add({ k: key, n, label, max, answer: a, key: kk.s, model: kk.s, empty: !norm(a), check: !hit, auto: hit ? max : null,
      question, criteria: `${max} б. — ответ верный по смыслу (допускаются и другие правильные варианты, кроме образца); 0 б. — неверно.` });
  };

  for (const t of v.tasks) {
    const n = t.n, a = A["t" + n] || {}, kt = k["t" + n];
    if (t.type === "tf") {
      for (const it of t.items) {
        const kk = kt[it.id], mark = a[it.id + "v"] === "T" ? "Верно" : a[it.id + "v"] === "F" ? "Неверно" : "", txt = strip(it.text);
        if (kk.tf === "T") add({ k: `t1${it.id}`, n, label: `${it.id}) ${txt}`, max: 2, answer: mark, key: "Верно", auto: a[it.id + "v"] === "T" ? 2 : 0 });
        else {
          add({ k: `t1${it.id}m`, n, label: `${it.id}) ${txt} — отметка`, max: 1, answer: mark, key: "Неверно", auto: a[it.id + "v"] === "F" ? 1 : 0 });
          const fx = a[it.id + "v"] === "F" ? String(a[it.id + "f"] || "") : "";
          const hit = kwHit(fx, kk.kw, kk.not) >= 0;
          add({ k: `t1${it.id}f`, n, label: `${it.id}) исправление`, max: 1, answer: fx, key: kk.fix, model: kk.fix, check: !hit, empty: !norm(fx), auto: hit ? 1 : null,
            question: `Ученику дано НЕВЕРНОЕ утверждение «${txt}». Нужно написать слова вместо подчёркнутых, чтобы утверждение стало верным. Верно: «${kk.fix}».`,
            criteria: "1 б. — ошибка исправлена верно по смыслу; 0 б. — исправление неверное." });
        }
      }
    } else if (t.type === "industry") {
      const H = ["отрасль", "сырьё", "продукт"];
      t.rows.forEach((row, ri) => row.forEach((c, ci) => {
        if (c) return;
        const kk = kt[`r${ri}c${ci}`], given = row.filter(Boolean).map((x) => x.g).join(", ");
        short(`t2r${ri}c${ci}`, n, `Строка «${given}»: ${H[ci]}`, 1, a[`r${ri}c${ci}`], kk,
          `Таблица «отрасль промышленности — сырьё — готовый продукт». Дано: «${given}». Нужно указать: ${H[ci]} (один пример).`);
      }));
    } else if (t.type === "group") {
      t.items.forEach((it, i) => add({ k: `t3i${i}`, n, label: it, max: 1, answer: a["i" + i] !== undefined && a["i" + i] !== "" ? t.groups[+a["i" + i]] : "",
        key: t.groups[kt.key[i]], auto: a["i" + i] !== undefined && a["i" + i] !== "" && +a["i" + i] === kt.key[i] ? 1 : 0 }));
    } else if (t.type === "match") {
      t.left.forEach((l, i) => {
        const ok = kt.key.map((x, j) => (x === i ? j + 1 : 0)).filter(Boolean);
        const ch = [...new Set([a[`L${i}a`], a[`L${i}b`]].filter((x) => x !== undefined && x !== "").map(Number))];
        add({ k: `t3L${i}`, n, label: `${"АБВ"[i]}) ${l}`, max: 2, answer: ch.join(", "), key: ok.join(", "), auto: ch.filter((d) => ok.includes(d)).length });
      });
    } else if (t.type === "coords") {
      const la = numLast(a.la), lo = numLast(a.lo);
      add({ k: "t4la", n, label: "Широта (градусы)", max: 1, answer: a.la || "", key: `${kt.lat[0]}° (±2°)`, auto: near(la, kt.lat[0], 2) ? 1 : 0 });
      add({ k: "t4lh", n, label: "Широта (полушарие)", max: 1, answer: HEM[a.lh] || "", key: HEM[kt.lat[1]], auto: a.lh === kt.lat[1] ? 1 : 0 });
      add({ k: "t4lo", n, label: "Долгота (градусы)", max: 1, answer: a.lo || "", key: `${kt.lon[0]}° (±2°)`, auto: near(lo, kt.lon[0], 2) ? 1 : 0 });
      add({ k: "t4oh", n, label: "Долгота (полушарие)", max: 1, answer: HEM[a.oh] || "", key: HEM[kt.lon[1]], auto: a.oh === kt.lon[1] ? 1 : 0 });
    } else if (t.type === "extent") {
      const [p1, p2] = kt.p, D = kt.deg, kd = kt.kd, lo = D - 4, hi = D + 4;
      const x1 = numLast(a.a), x2 = numLast(a.b), d = numLast(a.d), kk = numLast(a.k), km = numLast(a.km);
      const same = p1[1] === p2[1], expr = same ? `${Math.max(p1[0], p2[0])}° – ${Math.min(p1[0], p2[0])}° = ${D}°` : `${p1[0]}° + ${p2[0]}° = ${D}°`;
      let dp = 0;
      if (d >= lo && d <= hi) dp = 2;
      else if (Number.isFinite(x1) && Number.isFinite(x2) && a.ah && a.bh && near(d, a.ah === a.bh ? Math.abs(x1 - x2) : x1 + x2, 0.5)) dp = 1;
      const kmOk = (d > 0 && kk > 0 && near(km, d * kk, Math.max(d * kk * 0.01, 2))) || (km >= lo * kd && km <= hi * kd);
      const P1 = t.axis === "lat" ? "Северная точка" : "Западная точка", P2 = t.axis === "lat" ? "Южная точка" : "Восточная точка";
      add({ k: "t5a", n, label: `${P1} (градусы)`, max: 1, answer: a.a || "", key: `${p1[0]}° (±2°)`, auto: near(x1, p1[0], 2) ? 1 : 0 });
      add({ k: "t5ah", n, label: `${P1} (полушарие)`, max: 1, answer: HEM[a.ah] || "", key: HEM[p1[1]], auto: a.ah === p1[1] ? 1 : 0 });
      add({ k: "t5b", n, label: `${P2} (градусы)`, max: 1, answer: a.b || "", key: `${p2[0]}° (±2°)`, auto: near(x2, p2[0], 2) ? 1 : 0 });
      add({ k: "t5bh", n, label: `${P2} (полушарие)`, max: 1, answer: HEM[a.bh] || "", key: HEM[p2[1]], auto: a.bh === p2[1] ? 1 : 0 });
      add({ k: "t5d", n, label: "Расстояние в градусах", max: 2, answer: a.d || "", key: `${expr} (допускается ${lo}°–${hi}°)`, auto: dp });
      add({ k: "t5k", n, label: "Длина дуги 1°", max: 1, answer: a.k || "", key: `≈ ${fmt(kd)} км`, auto: kk >= 110 && kk <= 112 ? 1 : 0 });
      add({ k: "t5km", n, label: "Расстояние в километрах", max: 1, answer: a.km || "", key: `${D}° × ${fmt(kd)} км ≈ ${Math.round(D * kd)} км`, auto: kmOk ? 1 : 0 });
    } else if (t.type === "alt") {
      const s = altSteps(t), v1 = numLast(a.s1), g = gradOf(a.s2), v3 = numLast(a.s3), v4 = numLast(a.s4);
      const gOk = [0.6, 0.64, 0.65].some((x) => Math.abs(g - x) < 0.001), gU = g >= 0.5 && g <= 0.7 ? g : NaN;
      let ok, sh;
      if (t.mode === "height") {
        const dT = t.tFoot - t.tTop, h6 = dT / 0.6 * 100, h64 = dT / 0.64 * 100;
        ok = [near(v1, dT, 0.1), gOk, near(v3, h6, 3) || near(v3, h64, 3) || (Number.isFinite(gU) && near(v3, v1 / gU * 100, 3)),
          near(v4, t.foot + h6, 3) || near(v4, t.foot + h64, 3) || near(v4, t.foot + v3, 3)];
        sh = [`${fmtT(t.tFoot)} – (${fmtT(t.tTop)}) = ${fmt(dT)} °С`, "0,6 °С на 100 м (6 °С на 1 км)", `${fmt(dT)} : 0,6 × 100 = ${Math.round(h6)} м`, `${t.foot} + ${Math.round(h6)} = ${Math.round(t.foot + h6)} м`];
      } else {
        const D = t.top - t.foot, d6 = D * 0.006, d64 = D * 0.0064, v1m = Number.isFinite(v1) && Math.abs(v1) < 20 ? v1 * 1000 : v1;
        const res = (x) => (t.mode === "foot" ? t.tTop + x : t.tFoot - x);
        ok = [near(v1m, D, 1), gOk, near(v3, d6, 0.11) || near(v3, d64, 0.11) || (Number.isFinite(gU) && near(v3, v1m * gU / 100, 0.11)),
          near(v4, res(d6), 0.11) || near(v4, res(d64), 0.11) || (Number.isFinite(v3) && near(v4, res(Math.abs(v3)), 0.11))];
        sh = [`${t.top} – ${t.foot} = ${D} м`, "0,6 °С на 100 м (6 °С на 1 км)", `${D} × 0,6 : 100 = ${fmt(d6)} °С`,
          `${t.mode === "foot" ? `${fmtT(t.tTop)} + ${fmt(d6)}` : `${fmtT(t.tFoot)} – ${fmt(d6)}`} = ${fmtT(Math.round(res(d6) * 100) / 100)} °С`];
      }
      ok.forEach((o, i) => add({ k: `t6s${i + 1}`, n, label: `${i + 1}) ${s[i]}`, max: 1, answer: a["s" + (i + 1)] || "", key: sh[i], auto: o ? 1 : 0 }));
    } else if (t.type === "demo" || t.type === "statement") {
      const no = itemNo(t.items); let last = "";
      const ctx = t.type === "demo"
        ? `Демографические показатели населения ${t.country}: ` + t.rows.map((r) => `${r[0]} — ${t.years.map((y, j) => `${y}: ${r[j + 1]}`).join(", ")}`).join("; ") + ". "
        : `Утверждение: «${t.quote}». `;
      t.items.forEach((it, i) => {
        if (no[i]) last = no[i];
        const kk = kt.items[i], lab = no[i] ? `${no[i]} ${it.q}` : `${last} ${it.q}`, key = `t${n}i${i}`;
        if (it.k === "num") {
          const x = numLast(a["i" + i]);
          add({ k: key, n, label: lab, max: 1, answer: a["i" + i] || "", key: kk.s, auto: near(x, kk.n, kk.tol ?? 0.06) ? 1 : 0 });
        } else if (it.k === "kw") short(key, n, lab, it.p, a["i" + i], kk, ctx + it.q);
        else if (it.k === "multi") {
          const x1 = a[`i${i}a`] || "", x2 = a[`i${i}b`] || "", h1 = kwHit(x1, kk.a), h2 = kwHit(x2, kk.a);
          const same = h1 >= 0 && h1 === h2;
          short(key + "a", n, lab + " — пример 1", 1, x1, kk, ctx + it.q);
          if (same) add({ k: key + "b", n, label: lab + " — пример 2", max: 1, answer: x2, key: kk.s, auto: 0 });
          else short(key + "b", n, lab + " — пример 2", 1, x2, kk, ctx + it.q + " (второй пример должен отличаться от первого: «" + x1 + "»)");
        } else {
          add({ k: key, n, label: lab, max: it.p, answer: String(a["i" + i] || ""), empty: !norm(a["i" + i]), check: true, auto: null,
            question: ctx + it.q, model: kk.s, criteria: kk.c || (it.p >= 3 ? CRIT3 : CRIT2) });
        }
      });
    }
  }

  const max = items.reduce((s, i) => s + i.max, 0);
  const total = items.reduce((s, i) => s + (i.score ?? 0), 0);
  const auto = items.filter((i) => !i.check).reduce((s, i) => s + (i.score ?? 0), 0);
  const pending = items.filter((i) => i.score === null).length;
  const tasks = {};
  for (const it of items) { const tt = (tasks[it.n] = tasks[it.n] || { n: it.n, sum: 0, max: 0 }); tt.sum += it.score ?? 0; tt.max += it.max; }
  return { v, k, items, tasks, max, total, auto, pending, complete: !pending, grade: toGrade(total) };
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
    try { aiAuto = localStorage.getItem("techlab_ai_auto_sess") === "1"; } catch (e) {}
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
    <div class="ss-ribbon">🎓 Пробная сессия · формат сессии и БАК</div>
    <h2 style="margin-bottom:4px">${esc(TEST.title)} · 11 класс</h2>
    <div class="muted">${esc(TEST.subtitle)} · ${VARIANTS.length} вариантов · ${TEST.minutes} минут · максимум ${TEST.max} баллов
      · 8 заданий: верно/неверно, отрасли, группировка, координаты, протяжённость, температура и высота, демография, аргументация; короткие ответы проверяются автоматически, остальное — ИИ и учитель</div>
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
  <p class="muted" style="font-size:14px">Шкала сессии (баллы → отметка): ${SCALE_TEXT}. Оценка окончательная, когда проверены все развёрнутые ответы.</p>`;

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
    try { localStorage.setItem("techlab_ai_auto_sess", aiAuto ? "1" : "0"); } catch (e) {}
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
    const res = { total: e.total, max: e.max, grade: e.grade, complete: e.complete };
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
  }).join("\n") + "\nУченик 11 класса, пробная сессия по образцу БАК. Оценивай строго по критериям, как на экзамене, но доброжелательно. Комментарии — на русском языке, кратко.";
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
    <div class="top"><div><div class="rib">🎓 Пробная сессия · География · 11 класс</div>
      <h1>${esc(TEST.title)}</h1>
      <div class="meta"><b>${esc(r.name)}</b> · ${esc(r.cls)} · вариант ${r.variant} · ${fmtDate(r.submittedAt || r.startedAt)}</div>
      ${auto ? `<div class="warn">⚠ Работа завершена: ${auto}.</div>` : ""}</div>
      <div class="gr"><b>${e.complete ? e.grade : "≈" + e.grade}</b><span>${fmt(e.total)} / ${e.max} б.</span></div></div>
    ${tasks}
    ${S ? `<div class="sum"><b>Общий вывод.</b> <b>Сильные стороны:</b> ${esc(S.strengths)} <b>Пробелы:</b> ${esc(S.gaps)} <b>Что повторить:</b> ${esc(S.advice)}</div>` : ""}
    <div class="foot"><span>Шкала: ${SCALE_TEXT}</span><span>Проверил: ${esc(TEACHER_SIGN)}</span></div>
  </section>`;
}
function printReports(ids) {
  const pages = ids.map((id) => reportOf(RESULTS[id])).join("");
  const w = window.open("", "_blank");
  if (!w) return alert("Браузер заблокировал новое окно. Разрешите всплывающие окна для этого сайта.");
  w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Пробная сессия география 11 · отчёты</title>
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
  a.download = `sessiya-geografia11-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}

function showKeysUpload() {
  app.innerHTML = `<a class="backlink" href="../../teacher/">← Центр управления</a><div class="card center" style="max-width:640px"><h2>🔑 Загрузите ключи ответов</h2>
    <p>Для этой работы в базе ещё нет ключей. Выберите файл <code>keys-geo11-sess.json</code>, который прислал Claude.
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
