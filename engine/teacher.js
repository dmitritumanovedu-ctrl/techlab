import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, onValue, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";
import { grade, SCALE, parseNum, usesQual, qualOf, qualScaleText } from "./grading.js?v=5";
import { SUBJECTS, TESTS, KINDS, kindOf } from "../tests.js?v=9";
import { startAutoSync, syncProgress } from "./sync.js?v=2";
import { startNotify } from "./notify.js?v=2";
import { roleOf, pendingHtml, loadStaff, acceptStaff, declineStaff, removeStaff } from "./staff.js?v=3";

// Выбор теста: ?test=код (по умолчанию — первый в списке)
const READY = TESTS.filter((x) => x.path);
const TEST_ID = new URLSearchParams(location.search).get("test");
const OVERVIEW = !TEST_ID || !READY.some((x) => x.id === TEST_ID);   // без ?test= — «Центр управления»
const ENTRY = READY.find((x) => x.id === TEST_ID) || READY[0];
// Практические работы имеют свою панель учителя
if (!OVERVIEW && ENTRY.teacher) { location.replace("../" + ENTRY.teacher); await new Promise(() => {}); }
const IS_MISSION = ENTRY.type === "mission";
const { TEST, VARIANTS } = (IS_MISSION || OVERVIEW)
  ? { TEST: { id: ENTRY.id, classes: ENTRY.classes || [], max: 0 }, VARIANTS: [] }
  : await import(new URL("../" + ENTRY.path + "questions.js", location.href).href);

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app"), dlg = $("#dlg");
const fmtNum = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
// ссылка «просмотр учителя»: миссия открывается без кода ученика, все этапы открыты, в базу ничего не пишется
const pvUrl = (path) => "../" + path + (String(path).includes("?") ? "&" : "?") + "preview=1";
const fmtTime = (ms) => ms ? new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDay = (ms) => ms ? new Date(ms).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
// дата (число, месяц, год) + время начала / сдачи; если сдал в другой день — дата сдачи в скобках
const fmtWhen = (a, b) => { const d1 = fmtDay(a), d2 = fmtDay(b);
  return `<b>${d1 || "—"}</b><br><small>${fmtTime(a)} / ${b ? fmtTime(b) : "…"}${d2 && d2 !== d1 ? ` (${d2})` : ""}</small>`; };

const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb), auth = getAuth(fb);
const P = `results/${TEST.id}`;

let AICFG = null, aiAuto = false, aiQueue = [], aiQueued = new Set(), aiBusy = false;
let SETTINGS = {};
let KEYS = null, RESULTS = {}, seen = new Set(), filterCls = "", search = "", openId = null, unsub = [];

onAuthStateChanged(auth, async (user) => {
  unsub.forEach((u) => u()); unsub = [];
  if (!user) return showLogin();
  $("#who").innerHTML = `${esc(user.email)} · <a href="#" id="logout" style="color:#fff">выйти</a>`;
  $("#logout").onclick = (e) => { e.preventDefault(); signOut(auth); };
  // коллега работает в своём кабинете (Конструктор), владелец — здесь
  const role = await roleOf(db, user);
  if (role === "pending") { app.innerHTML = pendingHtml(user, esc); return; }
  if (role === "colleague") { location.replace(new URL("teacher/builder.html", new URL("../", import.meta.url)).href); return; }
  // администратор работает в своей панели: «Центр управления» открывается внутри неё
  if (role === "admin" && OVERVIEW && window.self === window.top && !new URLSearchParams(location.search).has("full")) { location.replace(new URL("admin/#lessons", new URL("../", import.meta.url)).href); return; }
  startAutoSync(db);   // оценки сразу уходят на страницы учеников и родителей
  startNotify(db, user, role, { base: "../" });   // 🔔 новые учителя, предметы, отзывы
  if (OVERVIEW) return showOverview();
  if (IS_MISSION) return showMissionDashboard();
  try {
    KEYS = (await get(ref(db, `keys/${TEST.id}`))).val();
    if (!KEYS) throw new Error("no-keys");
    AICFG = (await get(ref(db, "keys/_ai"))).val();
    try { aiAuto = localStorage.getItem("techlab_ai_auto") === "1"; } catch (e) {}
  } catch (e) {
    if (e.message === "no-keys") return showKeysUpload();
    app.innerHTML = `<div class="card center"><h2>Нет доступа к ключам</h2>
      <p>Этот аккаунт не имеет прав учителя. Проверьте, что в правилах базы (Rules) указан именно этот e-mail.</p></div>`;
    return;
  }
  showDashboard();
});

// Ключи нового теста загружаются из файла прямо здесь — без консоли Firebase
function showKeysUpload() {
  app.innerHTML = `<div class="card center" style="max-width:640px"><h2>🔑 Загрузите ключи ответов</h2>
    <p>Для теста <b>${esc(ENTRY.title)}</b> в базе ещё нет ключей. Выберите файл ключей, который прислал Claude
      (например, <code>keys-${esc(TEST.id)}.json</code>). Файл хранится только у вас и в защищённой базе — на GitHub его загружать <b>нельзя</b>.</p>
    <input type="file" id="kf" accept=".json,application/json" style="margin:10px 0">
    <div class="err" id="kerr"></div>
    <a class="btn small ghost" href="./">← Центр управления</a></div>`;
  $("#kf").onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    $("#kerr").style.color = ""; $("#kerr").textContent = "Загружаю…";
    try {
      const j = JSON.parse(await f.text());
      const k = j.keys?.[TEST.id] || (j.variants ? j : null);
      if (!k || !k.variants) throw new Error(`в файле нет ключей для теста «${TEST.id}». Проверьте, тот ли это файл.`);
      if (Object.keys(k.variants).length !== VARIANTS.length) throw new Error(`в файле ${Object.keys(k.variants).length} вариантов, а в тесте ${VARIANTS.length}.`);
      await set(ref(db, `keys/${TEST.id}`), k);
      $("#kerr").style.color = "var(--green)"; $("#kerr").textContent = "✓ Ключи загружены. Открываю тест…";
      setTimeout(() => location.reload(), 900);
    } catch (err) { $("#kerr").textContent = "Ошибка: " + err.message; }
  };
}

function showLogin() {
  $("#who").textContent = "";
  app.innerHTML = `<div class="card center"><h2>Вход для учителя</h2>
    <p class="muted">Войдите через свой Google-аккаунт учителя.</p>
    <div class="err" id="err"></div>
    <button class="btn" id="go">Войти через Google</button></div>`;
  $("#go").onclick = async () => {
    $("#err").textContent = "";
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { $("#err").textContent = "Не удалось войти: " + (e.code || e.message); }
  };
}

// ---------- панель ----------
function testOptions() {
  return SUBJECTS.map((sub) => {
    const list = READY.filter((t) => t.subject === sub.id);
    if (!list.length) return "";
    return `<optgroup label="${esc(sub.icon + " " + sub.name)}">${list.map((t) =>
      `<option value="${t.id}" ${t.id === ENTRY.id ? "selected" : ""}>${esc(t.grade + " класс · " + (t.type === "mission" ? "Миссия " + t.n + " · " : "") + t.title)}</option>`).join("")}</optgroup>`;
  }).join("");
}

function showDashboard() {
  document.title = "Учитель · " + ENTRY.title;
  const sub = $("#hSub"); if (sub) sub.textContent = ENTRY.title + " · " + (SUBJECTS.find((x) => x.id === ENTRY.subject)?.name || "") + ", " + ENTRY.grade + " класс";
  app.innerHTML = `<a class="backlink noprint" href="./">← Центр управления</a>
  <div class="card noprint" style="padding:12px 16px">
    <div class="toolbar">
      <label style="display:flex;gap:8px;align-items:center;font-weight:600">Тест:
        <select id="selTest" style="width:auto;min-width:280px">${testOptions()}</select></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn small ghost" href="../" target="_blank">🏠 Стартовая страница</a>
        <button class="btn small ghost" id="bLinks">📎 Материалы на стартовой</button>
      </div>
    </div>
    <div class="muted" id="pinInfo" style="font-size:14px;margin-top:8px"></div>
    ${kindRowHtml()}
  </div>
  <div class="toolbar noprint" style="margin-bottom:14px">
    <label class="switch"><input type="checkbox" id="swOpen"> <span id="swText">Тест закрыт</span></label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <select id="fCls" style="width:auto"><option value="">Все классы</option>${TEST.classes.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
      <input type="text" id="fSearch" placeholder="Поиск по фамилии" style="width:180px">
      <button class="btn small ghost" id="bAi">🤖 Проверить всё ИИ</button>
      <button class="btn small ghost" id="bAiCfg" title="Настройка проверки ИИ">⚙ ИИ</button>
      <button class="btn small ghost" id="bKeys">Ключи ответов</button>
      <button class="btn small ghost" id="bPrintAll" title="Разборы всех сданных работ (с учётом фильтра)">🖨 Разборы</button>
      <button class="btn small ghost" id="bSheets" title="Бланки всех сданных работ (с учётом фильтра класса) — каждый с новой страницы">🖨 Бланки класса</button>
      <button class="btn small ghost" id="bCsv">Скачать CSV</button>
      <button class="btn small red" id="bClear">Очистить результаты</button>
    </div>
  </div>
  <div class="toolbar noprint" style="margin-bottom:14px">
    <label class="switch"><input type="checkbox" id="swAi"> <span>🤖 Автоматически проверять развёрнутые ответы ИИ (пока открыта эта панель)</span></label>
    <span class="muted" id="aiStatus" style="font-size:14px"></span>
  </div>
  <div class="stats noprint" id="stats" style="margin-bottom:14px"></div>
  <div class="table-wrap"><table class="res"><thead><tr>
    <th>№</th><th>Ученик</th><th>Класс</th><th>Вар.</th><th>Статус</th><th>Нарушения</th><th>Дата · начало / сдано</th>
    <th>Авто-баллы</th><th>Итог</th><th>Оценка</th><th></th></tr></thead><tbody id="tb"><tr><td colspan="11" class="muted">Ожидание работ…</td></tr></tbody></table></div>
  <p class="muted" style="font-size:14px">Шкала перевода в 10-балльную систему (% от ${TEST.max} б.):
    ${SCALE.map(([p, g]) => `<b>${g}</b> — от ${p}%`).join(" · ")}. Оценка окончательная, когда проверены все развёрнутые ответы.</p>`;

  const sw = $("#swOpen");
  unsub.push(onValue(ref(db, `settings/${TEST.id}/open`), (s) => {
    sw.checked = !!s.val();
    $("#swText").textContent = sw.checked ? "🟢 Тест открыт — ученики могут начинать" : "🔴 Тест закрыт — новые ученики не могут начать";
  }));
  sw.onchange = async () => {
    await set(ref(db, `settings/${TEST.id}/open`), sw.checked);
    // Открытый тест сразу появляется на стартовой странице в блоке «Сейчас на уроке»
    const cur = (await get(ref(db, "settings/current"))).val();
    if (sw.checked) await set(ref(db, "settings/current"), { id: ENTRY.id, title: ENTRY.title, path: ENTRY.path, subject: ENTRY.subject, grade: ENTRY.grade, at: Date.now() });
    else if (cur?.id === ENTRY.id) await remove(ref(db, "settings/current"));
  };
  unsub.push(onValue(ref(db, "settings/current"), (s) => {
    const c = s.val();
    $("#pinInfo").innerHTML = c ? (c.id === ENTRY.id ? "📌 Этот тест показан на стартовой странице в блоке «Сейчас на уроке»."
      : `📌 Сейчас на стартовой: <b>${esc(c.title)}</b> (другой тест). Включите «Тест открыт», чтобы показать этот.`)
      : "На стартовой странице блок «Сейчас на уроке» пуст. Включите «Тест открыт» — тест появится там.";
  }));
  $("#selTest").onchange = (e) => { location.search = "?test=" + encodeURIComponent(e.target.value); };
  $("#bLinks").onclick = showLinks;
  $("#fCls").onchange = (e) => { filterCls = e.target.value; renderTable(); };
  $("#fSearch").oninput = (e) => { search = e.target.value.toLowerCase(); renderTable(); };
  $("#bCsv").onclick = exportCsv;
  $("#bPrintAll").onclick = () => {
    const ids = rows().filter(([, r]) => r.status === "submitted").map(([id]) => id);
    if (!ids.length) return alert("Нет сданных работ.");
    printReviews(ids);
  };
  $("#bSheets").onclick = () => {
    const ids = rows().filter(([, r]) => r.status === "submitted").map(([id]) => id).reverse();
    if (!ids.length) return alert("Нет сданных работ.");
    if (ids.length > 35 && !confirm(`Бланков: ${ids.length}. Лучше выбрать один класс в фильтре «Все классы». Всё равно печатать все?`)) return;
    printSheets(ids);
  };
  bindKind();
  $("#bAiCfg").onclick = showAiSettings;
  $("#bAi").onclick = () => {
    if (!AICFG?.url) return showAiSettings();
    const ids = Object.entries(RESULTS).filter(([, r]) => r.status === "submitted" && (aiTargets(r).length || !r.aiSummary)).map(([id]) => id);
    if (!ids.length) return setAiStatus("Нет развёрнутых ответов для проверки.");
    ids.forEach((id) => enqueueAi(id, true));
  };
  const swAi = $("#swAi");
  swAi.checked = aiAuto;
  swAi.onchange = () => {
    if (swAi.checked && !AICFG?.url) { swAi.checked = false; return showAiSettings(); }
    aiAuto = swAi.checked;
    try { localStorage.setItem("techlab_ai_auto", aiAuto ? "1" : "0"); } catch (e) {}
    if (aiAuto) autoEnqueue();
  };
  $("#bKeys").onclick = showKeys;
  $("#bClear").onclick = async () => {
    const n = Object.keys(RESULTS).length;
    if (!n) return;
    if (!confirm(`Удалить ВСЕ результаты (${n} шт.)? Сначала скачайте CSV. Это действие нельзя отменить.`)) return;
    if (prompt('Для подтверждения напишите слово УДАЛИТЬ') !== "УДАЛИТЬ") return;
    await remove(ref(db, P));
  };

  unsub.push(onValue(ref(db, P), (snap) => {
    RESULTS = snap.val() || {};
    for (const [id, r] of Object.entries(RESULTS)) r._id = id;
    renderTable();
    if (aiAuto) autoEnqueue();
    if (openId && dlg.open) {
      if (!RESULTS[openId]) dlg.close();
      else if (!dlg.contains(document.activeElement) || document.activeElement.tagName !== "INPUT") showCheck(openId, true);
    }
  }));
}

function evaluate(r) {
  const k = KEYS.variants[String(r.variant)];
  return grade({ ...k, points: KEYS.points }, r.answers || {}, r.manual || {}, r.ai || {});
}

function statusTag(r) {
  if (r.status === "in_progress") return `<span class="tag run">⏳ пишет</span>`;
  const map = { manual: ["done", "✅ сдано"], timeout: ["warn", "⏰ время вышло"], tab: ["auto", "⚠ автосдача: вкладка"],
    blur: ["auto", "⚠ автосдача: другое окно"], close: ["auto", "⚠ автосдача: закрыл страницу"], teacher: ["warn", "завершено учителем"] };
  const [cls, txt] = map[r.reason] || ["done", "сдано"];
  return `<span class="tag ${cls}">${txt}</span>`;
}

function rows() {
  return Object.entries(RESULTS)
    .filter(([, r]) => (!filterCls || r.cls === filterCls) && (!search || String(r.name).toLowerCase().includes(search)))
    .sort((a, b) => (b[1].startedAt || 0) - (a[1].startedAt || 0));
}

function renderTable() {
  const list = rows();
  const all = Object.values(RESULTS);
  const names = {};
  all.forEach((r) => { const k = (r.name + "|" + r.cls).toLowerCase(); names[k] = (names[k] || 0) + 1; });
  const graded = all.filter((r) => r.status === "submitted").map(evaluate).filter((g) => g.complete);
  const avg = graded.length ? graded.reduce((s, g) => s + g.grade, 0) / graded.length : null;
  $("#stats").innerHTML = `
    <div class="stat"><b>${all.length}</b>всего работ</div>
    <div class="stat"><b>${all.filter((r) => r.status === "in_progress").length}</b>пишут сейчас</div>
    <div class="stat"><b>${all.filter((r) => r.status === "submitted").length}</b>сдано</div>
    <div class="stat"><b>${all.filter((r) => ["tab", "blur", "close"].includes(r.reason)).length}</b>автосдач</div>
    <div class="stat"><b>${avg ? fmtNum(avg) : "—"}</b>средняя оценка</div>`;
  const tb = $("#tb");
  if (!list.length) { tb.innerHTML = `<tr><td colspan="11" class="muted">Работ пока нет. Откройте тест переключателем выше.</td></tr>`; return; }
  tb.innerHTML = list.map(([id, r], i) => {
    const g = evaluate(r);
    const dup = names[(r.name + "|" + r.cls).toLowerCase()] > 1 ? ` <span class="tag warn" title="Несколько попыток с этим именем">повтор</span>` : "";
    const fresh = !seen.has(id) && seen.size ? "new" : "";
    const gradeCell = r.status !== "submitted" ? `<span class="grade pending">—</span>`
      : g.complete ? `<span class="grade">${g.grade}</span>` : `<span class="grade pending" title="Предварительно по уже выставленным баллам">≈${g.gradeNow} · проверить ${g.pending}</span>`;
    return `<tr class="${fresh}">
      <td>${list.length - i}</td><td data-sort="${esc(String(r.name || "").replace(/^\d+\.\s*/, "").toLowerCase())}"><b>${esc(r.name)}</b>${dup}</td><td>${esc(r.cls)}</td><td>${r.variant}</td>
      <td>${statusTag(r)}${aiTag(r)}</td>
      <td>${r.violations ? `<span class="bad">${r.violations}</span>` : "0"}</td>
      <td data-sort="${r.submittedAt || r.startedAt || 0}" style="white-space:nowrap">${fmtWhen(r.startedAt, r.status === "submitted" ? r.submittedAt : 0)}</td>
      <td>${fmtNum(g.auto)}</td>
      <td>${r.status === "submitted" ? `<b>${fmtNum(g.total)}</b> / ${g.max}` : "—"}</td>
      <td>${gradeCell}</td>
      <td style="white-space:nowrap"><button class="btn small" data-open="${id}">${r.status === "submitted" && !g.complete ? "Проверить" : "Открыть"}</button>
        ${r.status === "submitted" ? `<button class="btn small ghost" data-sheet="${id}" title="Бланк работы для печати / PDF">🖨 Бланк</button>` : ""}</td></tr>`;
  }).join("");
  list.forEach(([id]) => seen.add(id));
  if (!seen.size) list.forEach(([id]) => seen.add(id));
  tb.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => showCheck(b.dataset.open));
  tb.querySelectorAll("[data-sheet]").forEach((b) => b.onclick = () => printSheets([b.dataset.sheet]));
}

// ---------- проверка работы ----------
function showCheck(id, refresh = false) {
  const r = RESULTS[id]; if (!r) return;
  openId = id;
  const v = VARIANTS.find((x) => x.id === r.variant);
  const k = KEYS.variants[String(r.variant)];
  const g = evaluate(r);
  const A = r.answers || {};
  const byTask = {};
  g.items.forEach((it) => (byTask[it.task] = byTask[it.task] || []).push(it));
  const scrollPos = refresh ? dlg.scrollTop : 0;
  const RV = reviewOf(r);

  const scoreBox = (it) => `<span>Баллы: <input type="number" class="score-in" min="0" max="${it.max}" step="0.5"
      data-item="${it.key}" value="${it.score ?? ""}" placeholder="?"> / ${it.max}
      ${it.teacher === null && it.ai !== null ? `<span class="tag run" title="Оценка выставлена ИИ — можно изменить">🤖 ИИ</span>` : ""}
      ${it.teacher === null && it.ai === null && it.auto !== null && it.check ? `<span class="muted" style="font-size:13px">(предложено автоматически)</span>` : ""}
      ${it.aiComment ? `<div class="muted" style="font-size:13px;margin-top:4px">🤖 ${esc(it.aiComment)}</div>` : ""}
      ${it.autoEmpty ? `<span class="muted" style="font-size:13px">(нет ответа)</span>` : ""}</span>`;
  const mark = (ok) => ok ? `<span class="ok">✓</span>` : `<span class="bad">✗</span>`;

  const parts = v.tasks.map((t) => {
    const its = byTask[t.n] || [];
    const sum = its.reduce((s, i) => s + (i.score ?? 0), 0);
    const need = its.some((i) => i.score === null);
    let inner = "";
    if (t.type === "tf") {
      inner = t.items.map((q) => {
        const kk = k.t1[q.id], a = (A.t1 || {})[q.id] || {};
        const fixIt = its.find((i) => i.key === `t1_${q.id}f`);
        return `<div style="margin-bottom:10px"><b>${q.id}) ${esc(q.concept)}</b> — ${esc(q.text)}<br>
          Ответ: <b>${a.v === "T" ? "Верно" : a.v === "F" ? "Неверно" : "—"}</b> ${mark(a.v === kk.tf)}
          · Ключ: <b>${kk.tf === "T" ? "Верно" : "Неверно"}</b>
          ${kk.tf === "F" ? `<div class="ans">Исправление ученика: ${esc(a.fix || "—")}</div>
            <div class="model">Образец: ${esc(kk.fix)}<br><span class="muted">Верное определение: ${esc(kk.orig)}</span></div>
            <div class="chk-row">${scoreBox(fixIt)}</div>` : ""}</div>`;
      }).join("");
    } else if (t.type === "classify") {
      const a = A.t2 || {};
      inner = t.chips.map((c) => {
        const ans = a[c.id], key = k.t2[c.id];
        return `<div>${mark(Number(ans) === key && ans != null)} ${esc(c.text)} → <b>${ans != null && ans >= 0 ? esc(t.columns[ans]) : "не распределено"}</b>
          ${Number(ans) !== key || ans == null ? ` <span class="muted">(верно: ${esc(t.columns[key])})</span>` : ""}</div>`;
      }).join("");
    } else if (t.type === "mcq") {
      inner = t.options.map((o) => `<div>${o.id === k.t3 ? "✓" : "·"} ${A.t3 === o.id ? "<b>" : ""}${esc(o.text)}${A.t3 === o.id ? "</b> ← ответ ученика" : ""}</div>`).join("");
    } else if (t.type === "chart" || t.type === "open") {
      const it = its[0];
      inner = `${t.chart ? `<div class="muted">Диаграмма: ${esc(t.chart.title)}</div>` : ""}
        <div class="ans">${esc(A["t" + t.n] || "— нет ответа —")}</div>
        <div class="model"><b>Критерии:</b> ${esc(it.criteria)}<br><b>Образец ответа:</b> ${esc(it.model)}</div>
        <div class="chk-row">${scoreBox(it)}</div>`;
    } else if (t.type === "mapid") {
      const a = A.t9 || {};
      inner = t.markers.map((m) => `<div>${mark(a[m.letter] === k.t9[m.letter])} <b>${m.letter}</b>: ${esc(a[m.letter] || "—")}
        ${a[m.letter] !== k.t9[m.letter] ? `<span class="muted">(верно: ${esc(k.t9[m.letter])})</span>` : ""}</div>`).join("");
    } else if (t.type === "mapcalc") {
      const a = A.t10 || {}, why = its.find((i) => i.key === "t10c");
      const calc = its.find((i) => i.key === "t10a"), cat = its.find((i) => i.key === "t10b");
      inner = `<div>а) Ответ: <b>${esc(a.d || "—")}</b> ${mark(calc.auto === 2)} · Ключ: ${esc(k.t10.calc)} <span class="muted">(2 б. при отклонении до 3%, 1 б. — до 10%)</span></div>
        <div>б) Категория: <b>${esc(a.cat || "—")}</b> ${mark(cat.auto === 1)} · Ключ: ${k.t10.cat} <span class="muted">(засчитывается и категория, верная для своего расчёта)</span></div>
        <div style="margin-top:6px">в) Объяснение:</div><div class="ans">${esc(a.why || "— нет ответа —")}</div>
        <div class="model">Образец: ${esc(k.t10.model)}</div><div class="chk-row">${scoreBox(why)}</div>`;
    }
    return `<div class="chk-item ${need ? "need" : ""}"><div class="chk-row"><b>Задание ${t.n}</b>
      <span>${fmtNum(sum)} / ${t.points} б. ${need ? '<span class="tag warn">нужно проверить</span>' : ""}</span></div>
      <div class="muted" style="font-size:14px;margin:4px 0 8px">${esc(t.title)}</div>${inner}${reviewHtml(RV.tasks[t.n])}</div>`;
  }).join("");

  const events = Object.values(r.events || {}).sort((a, b) => a.at - b.at)
    .map((e) => `${fmtTime(e.at)} — ${esc(e.type)}`).join("<br>");

  dlg.innerHTML = `
    <div class="dlg-head"><div><b>${esc(r.name)}</b> · ${esc(r.cls)} · вариант ${r.variant}</div>
      <button class="btn small ghost" id="dClose" style="background:#fff">Закрыть ✕</button></div>
    <div class="dlg-body">
      <div class="chk-row" style="margin-bottom:12px">
        <div>${statusTag(r)} · Итог: <b>${fmtNum(g.total)} / ${g.max}</b> ·
          Оценка: ${g.complete ? `<span class="grade">${g.grade}</span>` : `<span class="muted">≈${g.gradeNow}, осталось проверить: ${g.pending}</span>`}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${r.status === "submitted" ? `<button class="btn small" id="dUnlock">Разрешить продолжить (+10 мин)</button>` : `<button class="btn small" id="dStop">Завершить работу</button>`}
          ${r.status === "submitted" ? `<button class="btn small ghost" id="dAi">🤖 ${r.aiSummary ? "Разобрать заново (ИИ)" : "Разбор ИИ"}</button>` : ""}
          ${r.status === "submitted" ? `<button class="btn small ghost" id="dPrint">🖨 Печать разбора</button>` : ""}
          ${r.status === "submitted" ? `<button class="btn small ghost" id="dSheet">🖨 Бланк</button>` : ""}
          <button class="btn small red" id="dDel">Удалить</button>
        </div>
      </div>
      ${summaryHtml(r, RV)}
      ${r.violations ? `<div class="chk-item need"><b>Нарушения (${r.violations}):</b><div class="events">${events || "—"}</div></div>` : ""}
      ${parts}
    </div>`;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = scrollPos;
  $("#dClose").onclick = () => { openId = null; dlg.close(); };
  dlg.querySelectorAll("[data-item]").forEach((inp) => inp.onchange = () => {
    const val = inp.value === "" ? null : Math.max(0, Math.min(Number(inp.max), Number(inp.value)));
    update(ref(db, `${P}/${id}/manual`), { [inp.dataset.item]: val });
  });
  $("#dAi")?.addEventListener("click", () => { if (!AICFG?.url) return showAiSettings(); enqueueAi(id, true); });
  $("#dPrint")?.addEventListener("click", () => printReviews([id]));
  $("#dSheet")?.addEventListener("click", () => printSheets([id]));
  if (r.aiStatus === "error") dlg.querySelector(".dlg-body").insertAdjacentHTML("afterbegin", `<div class="chk-item need">🤖 Ошибка проверки ИИ: ${esc(r.aiError || "")}</div>`);
  $("#dUnlock")?.addEventListener("click", () => {
    if (!confirm("Разрешить ученику продолжить работу? Он сможет вернуться к своим ответам ещё на 10 минут.")) return;
    update(ref(db, `${P}/${id}`), { status: "in_progress", reason: null, deadline: Math.max(r.deadline || 0, Date.now() + 10 * 60000) });
  });
  $("#dStop")?.addEventListener("click", () => {
    if (!confirm("Завершить работу ученика сейчас? Будут засчитаны уже сохранённые ответы.")) return;
    update(ref(db, `${P}/${id}`), { status: "submitted", reason: "teacher", submittedAt: Date.now() });
  });
  $("#dDel").onclick = () => {
    if (!confirm(`Удалить работу ученика ${r.name}?`)) return;
    remove(ref(db, `${P}/${id}`)); openId = null; dlg.close();
  };
}
dlg.addEventListener("close", () => { openId = null; });

// ---------- ключи ----------
function showKeys() {
  openId = null;
  const html = VARIANTS.map((v) => {
    const k = KEYS.variants[String(v.id)];
    const t = (n) => v.tasks.find((x) => x.n === n);
    const t2 = t(2), t3 = t(3);
    return `<div class="card" style="break-inside:avoid"><h2>Вариант ${v.id}</h2>
      <p><b>1.</b> ${t(1).items.map((q) => `${q.id}) ${esc(q.concept)} — <b>${k.t1[q.id].tf === "T" ? "Верно" : "Неверно"}</b>${k.t1[q.id].fix ? ` (${esc(k.t1[q.id].fix)})` : ""}`).join("; ")}</p>
      <p><b>2.</b> ${t2.columns.map((c, i) => `<u>${esc(c)}</u>: ${t2.chips.filter((x) => k.t2[x.id] === i).map((x) => esc(x.text)).join(", ")}`).join("; ")}</p>
      <p><b>3.</b> ${esc(t3.options.find((o) => o.id === k.t3).text)}</p>
      ${[4, 5, 6, 7, 8].filter((n) => k["t" + n]).map((n) => `<p><b>${n}.</b> ${esc(k["t" + n].model)}${k["t" + n].criteria ? `<br><span class="muted">Барем: ${esc(k["t" + n].criteria)}</span>` : ""}</p>`).join("")}
      ${k.t9 ? `<p><b>9.</b> ${Object.entries(k.t9).map(([L, n]) => `${L} — ${esc(n)}`).join(", ")}</p>` : ""}
      ${k.t10 ? `<p><b>10.</b> ${esc(k.t10.calc)}; категория ${k.t10.cat}. ${esc(k.t10.model)}</p>` : ""}</div>`;
  }).join("");
  dlg.innerHTML = `<div class="dlg-head noprint"><b>Ключи ответов — 10 вариантов</b>
    <span><button class="btn small ghost" style="background:#fff" id="kPrint">Печать</button>
    <button class="btn small ghost" style="background:#fff" id="kClose">Закрыть ✕</button></span></div>
    <div class="dlg-body"><p class="muted">Критерии: задания 4–5 — ${esc(KEYS.variants["1"].t4.criteria)} Задания 6–7 — ${esc(KEYS.variants["1"].t6.criteria)} Задание 8 — ${esc(KEYS.variants["1"].t8.criteria)}</p>${html}</div>`;
  if (!dlg.open) dlg.showModal();
  $("#kClose").onclick = () => dlg.close();
  $("#kPrint").onclick = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><meta charset="utf-8"><title>Ключи</title><link rel="stylesheet" href="${new URL("test.css", location.href)}"></head><body><main>${dlg.querySelector(".dlg-body").innerHTML}</main></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 500);
  };
}

// ---------- CSV ----------
function exportCsv() {
  const head = ["Ученик", "Класс", "Вариант", "Статус", "Причина сдачи", "Нарушения", "Начало", "Сдано",
    ...Array.from({ length: 10 }, (_, i) => `Зад.${i + 1}`), "Итог", "Макс", "Оценка", "Проверено"];
  const lines = [head];
  for (const [, r] of rows()) {
    const g = evaluate(r);
    const per = Array.from({ length: 10 }, (_, i) => fmtNum(g.items.filter((it) => it.task === i + 1).reduce((s, it) => s + (it.score ?? 0), 0)));
    lines.push([r.name, r.cls, r.variant, r.status === "submitted" ? "сдано" : "пишет", r.reason || "", r.violations || 0,
      r.startedAt ? new Date(r.startedAt).toLocaleString("ru-RU") : "", r.submittedAt ? new Date(r.submittedAt).toLocaleString("ru-RU") : "",
      ...per, fmtNum(g.total), g.max, g.complete ? g.grade : "", g.complete ? "да" : `нет (${g.pending})`]);
  }
  const csv = "﻿" + lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `geo11-naselenie-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}


// ---------- проверка развёрнутых ответов с помощью ИИ ----------
function aiTag(r) {
  if (r.status !== "submitted" || !aiTargets(r, true).length) return "";
  if (aiQueued.has(r._id)) return ` <span class="tag run">🤖 в очереди</span>`;
  if (r.aiStatus === "done") return ` <span class="tag done" title="Развёрнутые ответы проверены ИИ">🤖</span>`;
  if (r.aiStatus === "error") return ` <span class="tag auto" title="${esc(r.aiError || "")}">🤖 ошибка</span>`;
  return "";
}
function setAiStatus(t) { const el = $("#aiStatus"); if (el) el.textContent = t; }

// Список ответов, которые нужно оценить ИИ. all=true — включая уже оценённые учителем.
function aiTargets(r, all = false) {
  const v = VARIANTS.find((x) => x.id === r.variant);
  const k = KEYS.variants[String(r.variant)];
  if (!v || !k) return [];
  const g = evaluate(r);
  const out = [];
  for (const it of g.items) {
    if (!it.check || it.empty || !String(it.answer || "").trim()) continue;
    if (!all && it.teacher !== null) continue;
    let question = "";
    const n = it.task;
    if (n === 1) {
      const id = it.key.slice(3, 4);
      const q = v.tasks[0].items.find((x) => x.id === id);
      question = `Понятие «${q.concept}». Ученику дано НЕВЕРНОЕ утверждение: «${q.text}» Ученик должен написать правильный вариант (исправить ошибку). Верное определение: «${k.t1[id].orig}»`;
    } else if (n === 10) {
      question = v.tasks.find((x) => x.n === 10).title + " Оценивается только пункт «в» — объяснение.";
    } else {
      const t = v.tasks.find((x) => x.n === n);
      question = t.title;
      if (t.chart && t.chart.kind === "climate") {
        const c = t.chart;
        question += `\nКлиматограмма «${c.title}». Температура, °C по месяцам: ` + c.labels.map((l, i) => `${l} — ${c.temp[i]}`).join("; ") +
          `. Осадки, мм: ` + c.labels.map((l, i) => `${l} — ${c.prec[i]}`).join("; ") + (c.total ? `. Годовое количество осадков: ${c.total} мм.` : ".");
      } else if (t.chart) {
        const c = t.chart;
        question += `\nДиаграмма «${c.title}» (${c.unit}): ` + c.series.map((sr) =>
          (c.series.length > 1 ? sr.name + ": " : "") + c.labels.map((l, i) => `${l} — ${sr.data[i]}`).join("; ")).join(" | ");
      }
      if (t.table) question += `\nТаблица «${t.table.caption || ""}»: ${t.table.head.join(" | ")}; ` + t.table.rows.map((r) => r.join(" | ")).join("; ");
    }
    out.push({ key: it.key, max: it.max, question, answer: String(it.answer).slice(0, 3000),
               model: it.model || "", criteria: it.criteria || "" });
  }
  return out;
}

function autoEnqueue() {
  if (!AICFG?.url) return;
  for (const [id, r] of Object.entries(RESULTS)) {
    if (r.status === "submitted" && !r.aiStatus) enqueueAi(id, false);
  }
}

function enqueueAi(id, force) {
  if (aiQueued.has(id)) return;
  const r = RESULTS[id]; if (!r) return;
  if (!force && r.aiStatus) return;
  aiQueued.add(id); aiQueue.push(id);
  renderTable();
  runAiQueue();
}

async function runAiQueue() {
  if (aiBusy) return;
  aiBusy = true;
  while (aiQueue.length) {
    const id = aiQueue.shift();
    const r = RESULTS[id];
    setAiStatus(`🤖 Проверяю: ${r?.name || ""} (в очереди ещё ${aiQueue.length})`);
    try {
      if (r) await gradeWithAi(id, r);
    } catch (e) {
      console.error(e);
      await update(ref(db, `${P}/${id}`), { aiStatus: "error", aiError: String(e.message || e).slice(0, 300) }).catch(() => {});
      if (/429|quota|rate/i.test(String(e.message))) { setAiStatus("🤖 Лимит запросов ИИ — пауза 60 с…"); await sleep(60000); }
    }
    aiQueued.delete(id);
    renderTable();
    if (aiQueue.length) await sleep(6000); // бесплатный тариф: не больше ~10 запросов в минуту
  }
  aiBusy = false;
  setAiStatus("🤖 Проверка ИИ завершена.");
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function callAi(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 100000); // не ждать ответа ИИ дольше 100 секунд
  let res;
  try { res = await fetch(AICFG.url, { method: "POST", body: JSON.stringify({ secret: AICFG.secret, ...payload }), signal: ctrl.signal }); }
  catch (e) { throw new Error(e.name === "AbortError" ? "ИИ не ответил за 100 секунд — нажмите «Проверить ИИ» ещё раз" : "Нет связи с сервисом ИИ"); }
  finally { clearTimeout(timer); }
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch (e) { throw new Error("Сервис ИИ вернул не JSON. Проверьте URL веб-приложения (он должен заканчиваться на /exec) и доступ «Все»."); }
  if (data.error) throw new Error(data.error);
  return data;
}

async function gradeWithAi(id, r) {
  const items = aiTargets(r);
  if (!items.length && r.aiSummary) return;
  const rv = reviewOf(r);
  const context = Object.entries(rv.tasks).map(([n, t]) =>
    `Задание ${n} (${t.topic}): ${t.pending ? "развёрнутый ответ оценивается тобой ниже" : fmtNum(t.sum) + " из " + t.max + " б"}` +
    (t.bad.length ? ". Ошибки: " + t.bad.join("; ") : t.pending ? "" : ". Ошибок нет")).join("\n");
  const data = await callAi({ subject: ENTRY.aiSubject || "география, 11 класс", items, review: true, context });
  const ai = { ...(r.ai || {}) };
  const cut = (x, n = 500) => String(x || "").slice(0, n);
  for (const x of data.results || []) {
    const it = items.find((i) => i.key === x.key);
    if (!it || !Number.isFinite(Number(x.score))) continue;
    const sc = Math.max(0, Math.min(it.max, Math.round(Number(x.score) * 2) / 2));
    ai[x.key] = { score: sc, comment: cut(x.comment, 400), good: cut(x.good), missing: cut(x.missing), advice: cut(x.advice) };
  }
  const upd = { ai, aiStatus: "done", aiError: null, aiAt: Date.now() };
  if (data.summary) upd.aiSummary = { strengths: cut(data.summary.strengths, 800), gaps: cut(data.summary.gaps, 800), advice: cut(data.summary.advice, 800) };
  await update(ref(db, `${P}/${id}`), upd);
}

function showAiSettings() {
  openId = null;
  dlg.innerHTML = `<div class="dlg-head"><b>🤖 Настройка проверки ИИ</b>
      <button class="btn small ghost" style="background:#fff" id="aClose">Закрыть ✕</button></div>
    <div class="dlg-body">
      <p>Вставьте адрес веб-приложения Google Apps Script и секретное слово (из инструкции). Они сохранятся в базе и будут доступны только вашему аккаунту.</p>
      <label class="f">URL веб-приложения (заканчивается на /exec)</label>
      <input type="text" id="aUrl" value="${esc(AICFG?.url || "")}" placeholder="https://script.google.com/macros/s/…/exec">
      <label class="f">Секретное слово</label>
      <input type="text" id="aSecret" value="${esc(AICFG?.secret || "")}">
      <div class="err" id="aErr"></div>
      <button class="btn" id="aSave">Сохранить и проверить связь</button>
      <p class="muted" style="font-size:14px;margin-top:14px">ИИ ставит предварительные баллы за развёрнутые ответы (задания 1 — исправления, 4–8, 10в) по критериям и образцам ответов.
      Оценка ИИ помечается значком 🤖, её всегда можно изменить вручную — ваша оценка важнее. Имена учеников в ИИ не отправляются.</p>
    </div>`;
  if (!dlg.open) dlg.showModal();
  $("#aClose").onclick = () => dlg.close();
  $("#aSave").onclick = async () => {
    const url = $("#aUrl").value.trim(), secret = $("#aSecret").value.trim();
    $("#aErr").style.color = ""; $("#aErr").textContent = "Проверяю связь…";
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) { $("#aErr").textContent = "Адрес должен начинаться с https://script.google.com/"; return; }
    const prev = AICFG; AICFG = { url, secret };
    try {
      const d = await callAi({ ping: true });
      await set(ref(db, "keys/_ai"), AICFG);
      $("#aErr").style.color = "var(--green)";
      $("#aErr").textContent = `✓ Связь есть${d.model ? " (модель " + d.model + ")" : ""}. Настройки сохранены.`;
    } catch (e) {
      AICFG = prev;
      $("#aErr").textContent = "Ошибка: " + e.message;
    }
  };
}


// ---------- материалы (ссылки) на стартовой странице ----------
// ---------- тип работы (суммативное, текущее, квест…) ----------
function kindRowHtml() {
  return `<div class="kindrow"><span>Тип работы:</span><select id="selKind" style="width:auto">${KINDS.map((k) =>
    `<option value="${k.id}">${k.icon} ${esc(k.name)}</option>`).join("")}</select>
    ${ENTRY.retake ? '<span class="ktag k-retake">🔁 Пересдача</span>' : ""}
    <span class="muted" style="font-size:13px">ярлык виден ученикам на сайте</span></div>
  <div class="kindrow"><span>🔍 Разбор для учеников:</span><select id="selReview" style="width:auto">
      <option value="0">Выключен — ученик видит только оценку</option>
      <option value="1">Баллы по заданиям и свои ответы (где ошибся)</option>
      <option value="2">Всё + правильные ответы</option></select>
    <span class="muted" style="font-size:13px" id="reviewSt">разбор появится на страничке ученика и у родителя после сдачи</span></div>`;
}
function bindKind() {
  const sel = $("#selKind"); if (!sel) return;
  unsub.push(onValue(ref(db, `settings/${ENTRY.id}/kind`), (s) => {
    SETTINGS[ENTRY.id] = { ...(SETTINGS[ENTRY.id] || {}), kind: s.val() || null };
    sel.value = kindOf(ENTRY, SETTINGS).id;
  }));
  sel.onchange = () => set(ref(db, `settings/${ENTRY.id}/kind`), sel.value);
  const rs = $("#selReview"); if (!rs) return;
  unsub.push(onValue(ref(db, `settings/${ENTRY.id}/review`), (s) => { rs.value = String(Number(s.val()) || 0); }));
  rs.onchange = async () => {
    const st = $("#reviewSt");
    await set(ref(db, `settings/${ENTRY.id}/review`), Number(rs.value) || null);
    st.textContent = "Обновляю странички учеников…";
    try { await syncProgress(db); st.textContent = Number(rs.value) ? "✓ Разбор открыт ученикам и родителям" : "✓ Разбор скрыт"; }
    catch (e) { st.textContent = "Сохранено. Странички обновятся в течение минуты."; }
  };
}

// ---------- план недели ----------
function showPlan() {
  openId = null;
  const gradeOpts = wsOptions("-");
  const today = new Date(); const pad = (n) => String(n).padStart(2, "0");
  const iso = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
  dlg.innerHTML = `<div class="dlg-head"><b>📅 План недели на стартовой</b>
      <button class="btn small ghost" id="pClose">Закрыть ✕</button></div>
    <div class="dlg-body">
      <p class="muted">Ученики увидят план на странице своего класса: Пн–Пт текущей недели (в выходные — следующей). Пустые недели не показываются.</p>
      <div class="grid2">
        <label>Класс<select id="pWhere">${gradeOpts}</select></label>
        <label>Дата<input type="date" id="pDate" value="${iso}" style="width:100%;padding:9px 12px;border:1px solid #C9D4E8;border-radius:10px"></label>
      </div>
      <div class="grid2">
        <label>Что будет на уроке<input type="text" id="pText" placeholder="Например: §17 Возрастная структура"></label>
        <label>Тип<select id="pKind"><option value="">— без ярлыка —</option>${KINDS.map((k) => `<option value="${k.id}">${k.icon} ${esc(k.name)}</option>`).join("")}</select></label>
      </div>
      <div class="err" id="pErr"></div>
      <button class="btn" id="pAdd">Добавить в план</button>
      <div id="pList" style="margin-top:16px"></div>
    </div>`;
  if (!dlg.open) dlg.showModal();
  $("#pClose").onclick = () => dlg.close();
  let off = () => {};
  const listen = () => {
    off();
    const where = $("#pWhere").value;
    off = onValue(ref(db, "settings/plan/" + where), (snap) => {
      const L = Object.entries(snap.val() || {}).sort((a, b) => (a[1].d + (a[1].at || 0)).localeCompare(b[1].d + (b[1].at || 0)));
      const box = $("#pList"); if (!box) return off();
      box.innerHTML = L.length ? L.map(([id, e]) => {
        const k = KINDS.find((x) => x.id === e.k);
        const d = new Date(e.d + "T12:00");
        return `<div class="chk-item chk-row"><span><b>${d.toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit" })}</b> · ${esc(e.t)}
          ${k ? ` <span class="ktag k-${k.id}">${k.icon} ${esc(k.short)}</span>` : ""}</span>
          <button class="btn small red" data-del="${id}">Удалить</button></div>`;
      }).join("") : `<p class="muted">Для этого класса план пуст.</p>`;
      box.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => remove(ref(db, "settings/plan/" + where + "/" + b.dataset.del)));
    });
  };
  $("#pWhere").onchange = listen; listen();
  $("#pAdd").onclick = async () => {
    const d = $("#pDate").value, t = $("#pText").value.trim(), k = $("#pKind").value;
    if (!d) return ($("#pErr").textContent = "Выберите дату.");
    if (!t) return ($("#pErr").textContent = "Напишите, что будет на уроке.");
    await push(ref(db, "settings/plan/" + $("#pWhere").value), { d, t, k: k || null, at: Date.now() });
    $("#pErr").textContent = ""; $("#pText").value = "";
  };
  dlg.addEventListener("close", () => off(), { once: true });
}

// Объявления учителя: список в правой панели «Сегодня» на стартовой, у учеников и родителей.
// Показываются последние 3, каждое — 3 недели. Ученик видит общие и для своих классов.
async function showAnnounce() {
  openId = null;
  const grades = [...new Set(SUBJECTS.flatMap((x) => x.grades))].sort((a, b) => a - b);
  const draw = async () => {
    let news = {}, old = null;
    try { news = (await get(ref(db, "settings/news"))).val() || {}; old = (await get(ref(db, "settings/announce"))).val(); } catch (e) {}
    const list = Object.entries(news).sort((x, y) => (y[1].at || 0) - (x[1].at || 0));
    if (old && old.text) list.push(["_old", old]);
    const live = (x) => !x.at || Date.now() - x.at < 21 * 864e5;
    dlg.innerHTML = `<div class="dlg-head"><b>📢 Объявления для учеников и родителей</b>
        <button class="btn small ghost" id="aClose">Закрыть ✕</button></div>
      <div class="dlg-body">
        <p class="muted">Короткие заметки в правой панели «Сегодня». Видны последние 3 объявления, каждое — 3 недели, потом скрывается само.</p>
        <label class="f">Новое объявление (до 200 знаков)</label>
        <textarea id="aText" maxlength="200" style="min-height:80px" placeholder="Например: 7 «В» — завтра самостоятельная по паролям, повторите §4."></textarea>
        <label class="f">Для кого</label>
        <select id="aG"><option value="">Для всех</option>${grades.map((g) => `<option value="${g}">${g} классы</option>`).join("")}</select>
        <div class="err" id="aErr"></div>
        <button class="btn" id="aSave">Опубликовать</button>
        <h3 style="margin:20px 0 8px">Опубликованные</h3>
        ${list.length ? list.map(([id, x]) => `<div class="rv-row"><div><div>${esc(x.text)}</div>
            <div class="muted" style="font-size:13px">${x.g ? esc(x.g) + " классы" : "для всех"} · ${x.at ? new Date(x.at).toLocaleDateString("ru-RU") : ""}${live(x) ? "" : " · уже скрыто"}</div></div>
            <button class="btn small red" data-del="${esc(id)}">Удалить</button></div>`).join("") : '<p class="muted">Пока нет объявлений.</p>'}
      </div>`;
    if (!dlg.open) dlg.showModal();
    $("#aClose").onclick = () => dlg.close();
    $("#aSave").onclick = async () => {
      const text = $("#aText").value.trim();
      if (!text) return ($("#aErr").textContent = "Напишите текст объявления.");
      try { await push(ref(db, "settings/news"), { text, g: $("#aG").value || null, at: Date.now() }); draw(); }
      catch (e) { $("#aErr").textContent = "Не удалось сохранить: " + e.message; }
    };
    dlg.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      const id = b.dataset.del;
      await remove(ref(db, id === "_old" ? "settings/announce" : `settings/news/${id}`)).catch((e) => alert(e.message));
      draw();
    });
  };
  draw();
}

// Загрузка файлов: веб-приложение Google Apps Script (apps-script/TechLab_files.gs) кладёт файл на ваш Google Диск
let FILESCFG;
const FILE_MAX = 25 * 1024 * 1024;
const FILE_ACCEPT = ".ppt,.pptx,.pps,.ppsx,.pdf,.doc,.docx,.xls,.xlsx,.odp,.odt,.ods,.txt,.png,.jpg,.jpeg,.gif,.webp,.mp3,.mp4,.zip";
const fmtSize = (n) => n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " МБ" : Math.max(1, Math.round(n / 1024)) + " КБ";
async function callFiles(payload, ms = 180000) {
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), ms);
  let res;
  try { res = await fetch(FILESCFG.url, { method: "POST", body: JSON.stringify({ secret: FILESCFG.secret, ...payload }), signal: ctrl.signal }); }
  catch (e) { throw new Error(e.name === "AbortError" ? "Загрузка заняла слишком долго — проверьте интернет" : "Нет связи с сервисом загрузки файлов"); }
  finally { clearTimeout(tm); }
  let data; try { data = JSON.parse(await res.text()); } catch (e) { throw new Error("Сервис загрузки вернул не JSON. Проверьте URL (должен заканчиваться на /exec) и доступ «Все»."); }
  if (data.error) throw new Error(data.error);
  return data;
}
const readB64 = (file) => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => bad(new Error("Не удалось прочитать файл")); r.readAsDataURL(file); });

async function showLinks() {
  openId = null;
  if (FILESCFG === undefined) { try { FILESCFG = (await get(ref(db, "keys/_files"))).val(); } catch (e) { FILESCFG = null; } }
  const gradeOpts = wsOptions("|");
  dlg.innerHTML = `<div class="dlg-head"><b>📎 Материалы на стартовой странице</b>
      <button class="btn small ghost" style="background:#fff" id="lClose">Закрыть ✕</button></div>
    <div class="dlg-body">
      <p class="muted">Материалы появятся у учеников в разделе нужного класса: презентации, PDF, документы, ссылки на сайты.</p>
      <div class="grid2">
        <label>Класс<select id="lWhere">${gradeOpts}</select></label>
        <label>Название<input type="text" id="lTitle" placeholder="Например: Презентация «Плотность населения»"></label>
      </div>
      <div class="l-tabs" role="tablist"><button type="button" class="on" data-lt="file">📁 Файл с компьютера</button><button type="button" data-lt="url">🔗 Ссылка</button></div>
      <div id="lFileBox">
        ${FILESCFG?.url ? `<label class="l-drop" id="lDrop"><input type="file" id="lFile" accept="${FILE_ACCEPT}" hidden>
            <b>Перетащите файл сюда</b> или <u>выберите на компьютере</u><br><span class="muted" style="font-size:13px">PowerPoint, PDF, Word, Excel, картинки · до 25 МБ</span></label>
          <div id="lPicked" class="muted" style="font-size:14px;margin-top:6px"></div>`
        : `<div class="l-setup">📁 Чтобы загружать файлы, один раз подключите свой Google Диск — 5 минут по инструкции.
            <button class="btn small" type="button" id="lSetup">⚙ Настроить загрузку файлов</button></div>`}
      </div>
      <div id="lUrlBox" hidden><label class="f">Ссылка</label><input type="text" id="lUrl" placeholder="https://…"></div>
      <div class="err" id="lErr"></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn" id="lAdd">Добавить</button>
        ${FILESCFG?.url ? '<button class="btn small ghost" type="button" id="lSetup2">⚙ Загрузка файлов</button>' : ""}</div>
      <div id="lList" style="margin-top:16px"></div>
    </div>`;
  if (!dlg.open) dlg.showModal();
  $("#lClose").onclick = () => dlg.close();
  let mode = "file", picked = null;
  dlg.querySelectorAll("[data-lt]").forEach((b) => b.onclick = () => {
    mode = b.dataset.lt; dlg.querySelectorAll("[data-lt]").forEach((x) => x.classList.toggle("on", x === b));
    $("#lFileBox").hidden = mode !== "file"; $("#lUrlBox").hidden = mode !== "url"; $("#lErr").textContent = "";
  });
  ($("#lSetup") || {}).onclick = showFilesSetup; ($("#lSetup2") || {}).onclick = showFilesSetup;
  const pick = (f) => {
    if (!f) return;
    if (f.size > FILE_MAX) { $("#lErr").textContent = `Файл ${fmtSize(f.size)} — больше 25 МБ. Сожмите его или загрузите на Google Диск и добавьте ссылкой.`; return; }
    picked = f; $("#lErr").textContent = "";
    $("#lPicked").innerHTML = `✓ Выбран: <b>${esc(f.name)}</b> · ${fmtSize(f.size)}`;
    if (!$("#lTitle").value.trim()) $("#lTitle").value = f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ");
  };
  const fi = $("#lFile"), drop = $("#lDrop");
  if (fi) fi.onchange = () => pick(fi.files[0]);
  if (drop) {
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => pick(e.dataTransfer.files[0]));
  }
  $("#lAdd").onclick = async () => {
    const [subject, grade] = $("#lWhere").value.split("|");
    const title = $("#lTitle").value.trim();
    const btn = $("#lAdd"), err = $("#lErr"); err.style.color = "";
    if (!title) return (err.textContent = "Впишите название.");
    if (mode === "url") {
      const url = $("#lUrl").value.trim();
      if (!/^https?:\/\//.test(url)) return (err.textContent = "Ссылка должна начинаться с https://");
      await push(ref(db, "settings/links"), { subject, grade, title, url, at: Date.now() });
      err.textContent = ""; $("#lTitle").value = ""; $("#lUrl").value = "";
      return;
    }
    if (!FILESCFG?.url) return showFilesSetup();
    if (!picked) return (err.textContent = "Выберите файл.");
    btn.disabled = true; btn.textContent = "⏳ Загружаю…"; err.style.color = "var(--muted)"; err.textContent = `Загружаю «${picked.name}» на ваш Google Диск…`;
    try {
      const data = await readB64(picked);
      const sub = SUBJECTS.find((x) => x.id === subject);
      const r = await callFiles({ action: "upload", name: picked.name, mime: picked.type || "application/octet-stream", data, title, subject: sub?.name || subject, grade });
      await push(ref(db, "settings/links"), { subject, grade, title, url: r.url, at: Date.now(),
        file: { id: r.id, name: r.name || picked.name, size: r.size || picked.size, ext: (picked.name.match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || "" } });
      err.style.color = "var(--green)"; err.textContent = "✓ Файл загружен и появился у учеников.";
      picked = null; if (fi) fi.value = ""; $("#lPicked").textContent = ""; $("#lTitle").value = "";
    } catch (e) { err.style.color = ""; err.textContent = "Не удалось загрузить: " + e.message; }
    btn.disabled = false; btn.textContent = "Добавить";
  };
  const off = onValue(ref(db, "settings/links"), (snap) => {
    const L = Object.entries(snap.val() || {}).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    const box = $("#lList"); if (!box) return off();
    box.innerHTML = L.length ? L.map(([id, l]) => {
      const sub = SUBJECTS.find((x) => x.id === l.subject);
      return `<div class="chk-item chk-row"><span><b>${l.file ? "📁 " : "🔗 "}${esc(l.title)}</b><br><span class="muted" style="font-size:13px">${esc((sub?.name || l.subject) + " · " + l.grade + " класс")} ·
        ${l.file ? esc(l.file.name) + " · " + fmtSize(l.file.size || 0) : esc(l.url)}</span> <a href="${esc(l.url)}" target="_blank" rel="noopener" style="font-size:13px">открыть ↗</a></span>
        <button class="btn small red" data-del="${id}">Удалить</button></div>`;
    }).join("") : `<p class="muted">Пока нет ни одного материала.</p>`;
    box.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      const l = (snap.val() || {})[b.dataset.del];
      if (!confirm(`Удалить «${l?.title}»?${l?.file ? " Файл переместится в корзину вашего Google Диска." : ""}`)) return;
      await remove(ref(db, "settings/links/" + b.dataset.del));
      if (l?.file?.id && FILESCFG?.url) callFiles({ action: "delete", id: l.file.id }, 30000).catch(() => {});
    });
  });
  dlg.addEventListener("close", off, { once: true });
}

function showFilesSetup() {
  dlg.innerHTML = `<div class="dlg-head"><b>⚙ Загрузка файлов на Google Диск</b>
      <button class="btn small ghost" style="background:#fff" id="fBack">← К материалам</button></div>
    <div class="dlg-body">
      <ol style="line-height:1.6;padding-left:20px;margin-top:0">
        <li>Откройте <a href="https://script.google.com" target="_blank" rel="noopener">script.google.com</a> → «Новый проект».</li>
        <li>Вставьте код из файла <b>apps-script/TechLab_files.gs</b> и впишите в строке SECRET своё секретное слово.</li>
        <li>«Начать развёртывание» → «Новое развёртывание» → «Веб-приложение»: выполнять от имени «Я», доступ «Все» → «Развернуть» → разрешите доступ к Диску.</li>
        <li>Скопируйте URL веб-приложения и вставьте ниже вместе с секретным словом.</li>
      </ol>
      <label class="f">URL веб-приложения (заканчивается на /exec)</label>
      <input type="text" id="fUrl" value="${esc(FILESCFG?.url || "")}" placeholder="https://script.google.com/macros/s/…/exec">
      <label class="f">Секретное слово</label><input type="text" id="fSecret" value="${esc(FILESCFG?.secret || "")}">
      <div class="err" id="fErr"></div>
      <button class="btn" id="fSave">Сохранить и проверить связь</button>
      <p class="muted" style="font-size:14px;margin-top:12px">Файлы хранятся на вашем Google Диске в папке «TechLab материалы» и открываются по ссылке только для просмотра — ученикам не нужен Google-аккаунт.</p>
    </div>`;
  if (!dlg.open) dlg.showModal();
  $("#fBack").onclick = showLinks;
  $("#fSave").onclick = async () => {
    const url = $("#fUrl").value.trim(), secret = $("#fSecret").value.trim();
    $("#fErr").style.color = ""; $("#fErr").textContent = "Проверяю связь…";
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+\/exec/.test(url)) return ($("#fErr").textContent = "Адрес должен начинаться с https://script.google.com/ и заканчиваться на /exec");
    const prev = FILESCFG; FILESCFG = { url, secret };
    try {
      await callFiles({ ping: true }, 30000);
      await set(ref(db, "keys/_files"), FILESCFG);
      $("#fErr").style.color = "var(--green)"; $("#fErr").textContent = "✓ Связь есть. Теперь можно загружать файлы.";
      setTimeout(showLinks, 900);
    } catch (e) { FILESCFG = prev; $("#fErr").textContent = "Ошибка: " + e.message; }
  };
}


// =====================================================================
//  МИССИИ (экспедиции Технологического воспитания)
// =====================================================================
const MSCALE = [[95, 10], [85, 9], [75, 8], [65, 7], [55, 6], [45, 5], [35, 4], [25, 3], [15, 2], [0, 1]];
const mGrade = (pct) => { for (const [p, g] of MSCALE) if (pct >= p) return g; return 1; };
function mOpenItems(r, entry = ENTRY) {
  // развёрнутые ответы миссии: балл учителя → балл ИИ → нет оценки
  return (entry.openQs || []).map((q) => {
    const answer = String(r.open?.[q.k] || "").trim();
    const teacher = Number.isFinite(r.manual?.[q.k]) ? r.manual[q.k] : null;
    const ai = r.ai?.[q.k] && Number.isFinite(r.ai[q.k].score) ? Math.max(0, Math.min(q.max, r.ai[q.k].score)) : null;
    const score = !answer ? 0 : (teacher ?? ai);
    const A = r.ai?.[q.k] || {};
    return { ...q, answer, teacher, ai, aiComment: A.comment || "", aiGood: A.good || "", aiMissing: A.missing || "", aiAdvice: A.advice || "", score, pending: score === null };
  });
}
function mEval(r, entry = ENTRY) {
  const parts = entry.parts || [];
  const max = parts.reduce((a, p) => a + (p.bonus ? 0 : p.max), 0);   // бонусы не входят в максимум
  const sc = r.score || {};
  const items = mOpenItems(r, entry);
  const openSum = items.reduce((a, i) => a + (i.score || 0), 0);
  const pending = items.filter((i) => i.pending).length;
  const partScore = (p) => p.open ? (items.length ? openSum : null) : (sc[p.k] ?? null);
  const pts = parts.reduce((a, p) => a + (Number(partScore(p)) || 0), 0);
  const pct = max ? Math.min(100, Math.round(pts / max * 100)) : 0;
  const complete = r.status === "submitted" && pending === 0;
  const q = qualOf(pct), tq = usesQual(entry.subject);
  return { pts, max, pct, grade: mGrade(pct), qual: q[1], qualName: q[2], mark: tq ? q[1] : mGrade(pct), pending, complete, items, partScore };
}
const moodIcon = (m) => !m ? "—" : m.startsWith("Мне всё") ? "🟢" : m.startsWith("Понятно") ? "🟡" : "🔴";

async function showMissionDashboard() {
  const parts = ENTRY.parts || [];
  const HAS_OPEN = !!(ENTRY.openQs || []).length;
  if (HAS_OPEN) {
    try { AICFG = (await get(ref(db, "keys/_ai"))).val(); } catch (e) { AICFG = null; }
    try { aiAuto = localStorage.getItem("techlab_ai_auto") === "1"; } catch (e) {}
  }
  document.title = "Учитель · Миссия " + ENTRY.n;
  const sub = $("#hSub"); if (sub) sub.textContent = "Миссия " + ENTRY.n + " · " + ENTRY.title + " · " + (SUBJECTS.find((x) => x.id === ENTRY.subject)?.name || "") + ", " + ENTRY.grade + " класс";
  app.innerHTML = `<a class="backlink noprint" href="./">← Центр управления</a>
  <div class="card noprint" style="padding:12px 16px">
    <div class="toolbar">
      <label style="display:flex;gap:8px;align-items:center;font-weight:600">Тест / миссия:
        <select id="selTest" style="width:auto;min-width:300px">${testOptions()}</select></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn small" href="${pvUrl(ENTRY.path)}" target="_blank" title="Без кода ученика, все этапы открыты, результат никуда не уходит">👁 Просмотр учителя</a>
        <a class="btn small ghost" href="../${ENTRY.path}" target="_blank">Как видит ученик ↗</a>
        <a class="btn small ghost" href="../" target="_blank">🏠 Стартовая</a>
        <button class="btn small ghost" id="bLinks">📎 Материалы на стартовой</button>
      </div>
    </div>
    <div class="muted" id="pinInfo" style="font-size:14px;margin-top:8px"></div>
    ${kindRowHtml()}
  </div>
  <div class="toolbar noprint" style="margin-bottom:14px">
    <label class="switch"><input type="checkbox" id="swOpen"> <span id="swText">Миссия закрыта</span></label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <select id="fCls" style="width:auto"><option value="">Все классы</option>${(ENTRY.classes || []).map((c) => `<option>${esc(c)}</option>`).join("")}</select>
      <input type="text" id="fSearch" placeholder="Поиск по фамилии" style="width:180px">
      ${HAS_OPEN ? `<button class="btn small ghost" id="bAi">🤖 Проверить всё ИИ</button>
      <button class="btn small ghost" id="bAiCfg" title="Настройка проверки ИИ">⚙ ИИ</button>` : ""}
      <button class="btn small ghost" id="bCsv">Скачать CSV</button>
      <button class="btn small red" id="bClear">Очистить результаты</button>
    </div>
  </div>
  ${HAS_OPEN ? `<div class="toolbar noprint" style="margin-bottom:14px">
    <label class="switch"><input type="checkbox" id="swAi"> <span>🤖 Автоматически проверять развёрнутые ответы ИИ (пока открыта эта панель)</span></label>
    <span class="muted" id="aiStatus" style="font-size:14px"></span></div>` : ""}
  <div class="stats noprint" id="stats" style="margin-bottom:14px"></div>
  <div class="table-wrap"><table class="res"><thead><tr>
    <th>№</th><th>Ученик</th><th>Класс</th><th>Этап</th>
    ${parts.map((p) => `<th title="${esc(p.name)}">${esc(p.name)}<br><span style="font-weight:400">${p.bonus ? "+" : "/"}${p.max}</span></th>`).join("")}
    <th>Итог</th><th>${usesQual(ENTRY.subject) ? "Квалификатив" : "Оценка"}</th><th>Время</th><th>Как урок</th><th></th></tr></thead>
    <tbody id="tb"><tr><td colspan="${parts.length + 9}" class="muted">Ожидание учеников…</td></tr></tbody></table></div>
  <p class="muted" style="font-size:14px">${parts.some((p) => p.bonus) ? "⭐ Бонусные задания добавляют баллы сверх максимума (итог не выше 100 %). " : ""}Баллы появляются сразу после каждого задания. Оценка окончательная, когда статус «🏁 сдано».
    ${usesQual(ENTRY.subject) ? "Оценивание по технологическому воспитанию — квалификативами: " + qualScaleText() : "Шкала: " + MSCALE.map(([p, g]) => `<b>${g}</b> — от ${p}%`).join(" · ")}.</p>`;

  const sw = $("#swOpen");
  unsub.push(onValue(ref(db, `settings/${ENTRY.id}/open`), (s) => {
    sw.checked = !!s.val();
    $("#swText").textContent = sw.checked ? "🟢 Миссия открыта — ученики могут начинать" : "🔴 Миссия закрыта — ученики не могут начать";
  }));
  sw.onchange = async () => {
    await set(ref(db, `settings/${ENTRY.id}/open`), sw.checked);
    const cur = (await get(ref(db, "settings/current"))).val();
    if (sw.checked) await set(ref(db, "settings/current"), { id: ENTRY.id, title: "Миссия " + ENTRY.n + " · " + ENTRY.title, path: ENTRY.path, subject: ENTRY.subject, grade: ENTRY.grade, at: Date.now() });
    else if (cur?.id === ENTRY.id) await remove(ref(db, "settings/current"));
  };
  unsub.push(onValue(ref(db, "settings/current"), (s) => {
    const c = s.val();
    $("#pinInfo").innerHTML = c ? (c.id === ENTRY.id ? "📌 Эта миссия показана на стартовой странице в блоке «Сейчас на уроке»."
      : `📌 Сейчас на стартовой: <b>${esc(c.title)}</b>. Включите «Миссия открыта», чтобы показать эту.`)
      : "Блок «Сейчас на уроке» на стартовой пуст. Включите «Миссия открыта» — миссия появится там.";
  }));
  $("#selTest").onchange = (e) => { location.search = "?test=" + encodeURIComponent(e.target.value); };
  bindKind();
  $("#bLinks").onclick = showLinks;
  $("#fCls").onchange = (e) => { filterCls = e.target.value; renderMission(); };
  $("#fSearch").oninput = (e) => { search = e.target.value.toLowerCase(); renderMission(); };
  $("#bCsv").onclick = missionCsv;
  $("#bClear").onclick = async () => {
    const n = Object.keys(RESULTS).length; if (!n) return;
    if (!confirm(`Удалить ВСЕ результаты этой миссии (${n} шт.)? Сначала скачайте CSV.`)) return;
    if (prompt("Для подтверждения напишите слово УДАЛИТЬ") !== "УДАЛИТЬ") return;
    await remove(ref(db, P));
  };
  if (HAS_OPEN) {
    $("#bAiCfg").onclick = showAiSettings;
    $("#bAi").onclick = () => {
      if (!AICFG?.url) return showAiSettings();
      const ids = Object.entries(RESULTS).filter(([, r]) => r.status === "submitted" && mAiTargets(r).length).map(([id]) => id);
      if (!ids.length) return setAiStatus("Нет развёрнутых ответов для проверки.");
      ids.forEach((id) => mEnqueue(id, true));
    };
    const swAi = $("#swAi"); swAi.checked = aiAuto;
    swAi.onchange = () => {
      if (swAi.checked && !AICFG?.url) { swAi.checked = false; return showAiSettings(); }
      aiAuto = swAi.checked;
      try { localStorage.setItem("techlab_ai_auto", aiAuto ? "1" : "0"); } catch (e) {}
      if (aiAuto) mAutoEnqueue();
    };
  }
  unsub.push(onValue(ref(db, P), (snap) => {
    RESULTS = snap.val() || {}; renderMission();
    if (HAS_OPEN && aiAuto) mAutoEnqueue();
    if (openId && dlg.open && RESULTS[openId] && !(dlg.contains(document.activeElement) && document.activeElement.tagName === "INPUT")) mShowOpen(openId, true);
  }));
}

function renderMission() {
  const parts = ENTRY.parts || [];
  const list = rows();
  const all = Object.values(RESULTS);
  const done = all.filter((r) => r.status === "submitted");
  const graded = done.map((r) => mEval(r)).filter((e) => e.complete);
  const avg = graded.length ? graded.reduce((a, e) => a + e.grade, 0) / graded.length : null;
  const qd = usesQual(ENTRY.subject) ? ["ОХ", "Х", "У", "Н"].map((c) => `${c} ${graded.filter((e) => e.qual === c).length}`).join(" · ") : null;
  const moods = done.reduce((a, r) => { const m = moodIcon(r.mood); a[m] = (a[m] || 0) + 1; return a; }, {});
  $("#stats").innerHTML = `
    <div class="stat"><b>${all.length}</b>всего учеников</div>
    <div class="stat"><b>${all.length - done.length}</b>в пути 🚀</div>
    <div class="stat"><b>${done.length}</b>финишировали 🏁</div>
    ${qd ? `<div class="stat"><b style="font-size:18px">${qd}</b>квалификативы</div>` : `<div class="stat"><b>${avg ? fmtNum(avg) : "—"}</b>средняя оценка</div>`}
    <div class="stat"><b style="font-size:18px">🟢${moods["🟢"] || 0} 🟡${moods["🟡"] || 0} 🔴${moods["🔴"] || 0}</b>как прошёл урок</div>`;
  const tb = $("#tb");
  if (!list.length) { tb.innerHTML = `<tr><td colspan="${parts.length + 9}" class="muted">Учеников пока нет. Откройте миссию переключателем выше.</td></tr>`; return; }
  tb.innerHTML = list.map(([id, r], i) => {
    const e = mEval(r), sc = r.score || {};
    const fin = r.status === "submitted";
    const mins = fin ? (r.minutes || "—") : Math.max(1, Math.round((Date.now() - (r.startedAt || Date.now())) / 60000));
    const fresh = !seen.has(id) && seen.size ? "new" : "";
    return `<tr class="${fresh}">
      <td>${list.length - i}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.cls)}</td>
      <td>${fin ? '<span class="tag done">🏁 сдано</span>' : `<span class="tag run">🚀 ${esc(r.stage || "старт")}</span>`}</td>
      ${parts.map((p) => {
        if (!p.open) return `<td>${sc[p.k] != null ? `<b>${sc[p.k]}</b>` : '<span class="muted">·</span>'}</td>`;
        if (!fin) return `<td><span class="muted">·</span></td>`;
        const q = mAiQueued.has(id) ? ' <span class="tag run">🤖…</span>' : r.aiStatus === "error" ? ' <span class="tag auto" title="' + esc(r.aiError || "") + '">🤖 ошибка</span>' : "";
        return `<td><b>${e.partScore(p) ?? 0}</b>${e.pending ? ` <span class="tag warn">✍ ${e.pending}</span>` : e.items.some((i) => i.teacher === null && i.ai !== null) ? " 🤖" : ""}${q}</td>`;
      }).join("")}
      <td><b>${e.pts}</b> / ${e.max}</td>
      <td>${e.complete ? `<span class="grade" title="${esc(e.qualName)}">${e.mark}</span>` : `<span class="grade pending">≈${e.mark}${fin && e.pending ? " · проверить " + e.pending : ""}</span>`}</td>
      <td>${mins} мин</td>
      <td title="${esc(r.mood || "")}" style="font-size:18px">${moodIcon(r.mood)}</td>
      <td style="white-space:nowrap">${(ENTRY.openQs || []).length && fin ? `<button class="btn small" data-mopen="${id}">${e.pending ? "Проверить" : "Открыть"}</button> ` : ""}<button class="btn small red" data-del="${id}" title="Удалить">✕</button></td></tr>`;
  }).join("");
  list.forEach(([id]) => seen.add(id));
  tb.querySelectorAll("[data-mopen]").forEach((b) => b.onclick = () => mShowOpen(b.dataset.mopen));
  tb.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
    const r = RESULTS[b.dataset.del];
    if (confirm(`Удалить результат ученика ${r?.name || ""}?`)) remove(ref(db, `${P}/${b.dataset.del}`));
  });
}

function missionCsv() {
  const parts = ENTRY.parts || [];
  const head = ["Ученик", "Класс", "Статус", ...parts.map((p) => `${p.name} (/${p.max})`), "Итог", "Макс", "%", "Оценка", "Время, мин", "Как прошёл урок", "Начало"];
  const lines = [head];
  for (const [, r] of rows()) {
    const e = mEval(r), sc = r.score || {};
    lines.push([r.name, r.cls, r.status === "submitted" ? "сдано" : "в процессе: " + (r.stage || ""),
      ...parts.map((p) => e.partScore(p) ?? ""), e.pts, e.max, e.pct, e.complete ? (usesQual(ENTRY.subject) ? `${e.qual} (${e.qualName})` : e.grade) : "", r.minutes || "", r.mood || "",
      r.startedAt ? new Date(r.startedAt).toLocaleString("ru-RU") : ""]);
  }
  const csv = "﻿" + lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${ENTRY.id}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}


// =====================================================================
//  ЦЕНТР УПРАВЛЕНИЯ — все предметы, тесты и миссии на одном экране
// =====================================================================
async function showOverview() {
  document.title = "Центр управления · TechLab";
  $("#hSub").textContent = "Выберите предмет и класс — увидите только их работы · результаты в реальном времени";
  app.innerHTML = `<div class="card center"><p class="muted">Загружаю результаты…</p></div>`;
  const KEYSALL = {};
  await Promise.all(READY.filter((x) => x.type !== "mission" && !x.teacher).map(async (t) => {
    try { KEYSALL[t.id] = (await get(ref(db, `keys/${t.id}`))).val(); } catch (e) { /* нет прав или ключей */ }
  }));
  app.innerHTML = `<div id="hubNow"></div><div id="hubOpen"></div><div id="hubTools"></div><div id="hubSel"></div><div id="hub"></div>
    <p class="muted" style="font-size:14px;margin-top:26px">Нажмите на карточку, чтобы открыть подробные результаты, проверку и настройки теста или миссии.</p>`;
  let SET = {}, RES = {}, PUB = {};
  let WS = getWS();

  const avgOf = (t, list) => {
    if (usesQual(t.subject) && t.type === "mission") {
      const qs = list.filter((r) => r.status === "submitted").map((r) => mEval(r, t)).filter((e) => e.complete).map((e) => e.qual);
      if (!qs.length) return "—";
      return ["ОХ", "Х", "У", "Н"].filter((c) => qs.includes(c)).map((c) => `${c}·${qs.filter((x) => x === c).length}`).join(" ");
    }
    const g = [];
    for (const r of list) {
      if (r.status !== "submitted") continue;
      if (t.type === "mission") { const e = mEval(r, t); if (e.complete) g.push(e.grade); }
      else if (t.teacher || t.bt) { if (r.result?.complete && Number.isFinite(r.result.grade)) g.push(r.result.grade); }
      else if (KEYSALL[t.id]) {
        const k = KEYSALL[t.id].variants?.[String(r.variant)];
        if (!k) continue;
        const e = grade({ ...k, points: KEYSALL[t.id].points }, r.answers || {}, r.manual || {}, r.ai || {});
        if (e.complete) g.push(e.grade);
      }
    }
    return g.length ? fmtNum(g.reduce((a, b) => a + b, 0) / g.length) : "—";
  };
  // все работы: готовые (tests.js) + тесты из конструктора (pubIndex)
  const allItems = () => READY.map((t) => ({ ...t, href: `?test=${encodeURIComponent(t.id)}` })).concat(
    Object.entries(PUB).map(([id, x]) => ({ id, bt: true, type: "test", kind: x.kind || "to", subject: x.subject, grade: String(x.grade || ""),
      title: x.title || "Тест", href: `builder.html#/r/${id}` })));
  const subjOf = (id) => SUBJECTS.find((x) => x.id === id);
  const isOpen = (t) => !!SET[t.id]?.open;
  const kindLine = (t) => t.type === "mission" ? "Миссия " + t.n + (t.date ? " · " + esc(t.date) : "") : t.type === "practical" ? "Практическая работа" : t.bt ? "Тест · конструктор" : "Тест";
  const where = (t) => { const sb = subjOf(t.subject); return `${sb ? sb.icon + " " + esc(sb.name) : ""}${t.grade ? " · " + esc(t.grade) + " класс" : ""}`; };

  function draw() {
    const ITEMS = allItems();
    const c = SET.current;
    // ---- что сейчас на стартовой ----
    $("#hubNow").innerHTML = c ? `<div class="hub-now">
        <div><div class="l">📌 Сейчас на стартовой у учеников</div><div class="t">${esc(c.title)}</div>
          <div class="muted" style="margin-top:2px">${where(c)}</div></div>
        <div class="r"><label class="muted" style="font-size:13px;display:flex;align-items:center;gap:6px">Урок
            <select id="lessonMin" style="width:auto">${[35, 40, 45, 60, 90].map((m) => `<option value="${m}"${(Number(SET.lessonMin) || 45) === m ? " selected" : ""}>${m} мин</option>`).join("")}</select></label>
          <a class="btn small" href="${ITEMS.find((t) => t.id === c.id)?.href || "?test=" + encodeURIComponent(c.id)}">Открыть результаты</a>
          <button class="btn small ghost" id="unpin">Убрать со стартовой</button></div></div>`
      : `<div class="hub-now"><div><div class="l">📌 Сейчас на стартовой</div>
        <div class="muted" style="margin-top:4px">Ничего не открыто. Откройте тест или миссию — они появятся у учеников в блоке «Сейчас на уроке».</div></div></div>`;
    const lm = $("#lessonMin");     // длина урока — для таймера «до конца урока» у учеников
    if (lm) lm.onchange = () => set(ref(db, "settings/lessonMin"), Number(lm.value)).catch((e) => alert(e.message));
    const un = $("#unpin");
    if (un) un.onclick = async () => {
      if (!confirm("Убрать с стартовой и закрыть «" + c.title + "»? Уже начатые работы ученики смогут закончить.")) return;
      await set(ref(db, `settings/${c.id}/open`), false);
      await remove(ref(db, "settings/current"));
    };

    // ---- всё, что сейчас открыто, — в одном месте: где именно и для кого ----
    const opened = ITEMS.filter(isOpen);
    $("#hubOpen").innerHTML = opened.length ? `<div class="hub-open"><div class="l">🟢 Открыто для учеников · ${opened.length}</div>
      ${opened.map((t) => `<div class="ho-row"><span class="ho-w">${where(t)}</span><a href="${t.href}" class="ho-t">${esc(t.title)}</a>
        <button class="btn small ghost" data-close="${esc(t.id)}">Закрыть</button></div>`).join("")}</div>` : "";
    document.querySelectorAll("[data-close]").forEach((b) => b.onclick = async () => {
      const id = b.dataset.close;
      await set(ref(db, `settings/${id}/open`), false);
      if (SET.current?.id === id) await remove(ref(db, "settings/current"));
    });

    // ---- инструменты (действуют для выбранного предмета и класса) ----
    $("#hubTools").innerHTML = `<div class="hub-tools"><a class="btn small" href="builder.html">🧩 Конструктор тестов</a> <a class="btn small" href="students.html">👥 Ученики и родители</a> <a class="btn small ghost" href="../qr.html" target="_blank">📱 QR-код сайта</a> <button class="btn small ghost" id="hPlan">📅 План недели</button>
      <button class="btn small ghost" id="hLinks">📎 Материалы на стартовой</button>
      <button class="btn small ghost" id="hReview">🔍 Разбор для учеников</button>
      <a class="btn small" href="../admin/" style="background:#0B1A3B">🛡 Администратор</a> <a class="btn small ghost" href="my.html">📚 Мои предметы</a> <a class="btn small" href="results.html">📊 Результаты и рейтинги</a> <button class="btn small ghost" id="hStaff">👥 Коллеги</button>
      <button class="btn small ghost" id="hAnn">📢 Объявления</button>
      <span class="hub-legend">${KINDS.map((k) => `<span class="ktag k-${k.id}">${k.icon} ${esc(k.short)}</span>`).join("")}</span></div>`;
    $("#hPlan").onclick = showPlan; $("#hLinks").onclick = showLinks;
    $("#hStaff").onclick = showStaffDlg;
    $("#hReview").onclick = () => showReviewDlg(ITEMS.filter((t) => (!WS.s || t.subject === WS.s) && (!WS.g || t.grade === WS.g)), SET); $("#hAnn").onclick = showAnnounce;

    // ---- выбор: предмет → класс ----
    const sub = subjOf(WS.s);
    const cnt = (f) => ITEMS.filter(f).length;
    const dot = (f) => ITEMS.some((t) => f(t) && isOpen(t)) ? '<i class="ws-dot" title="есть открытые"></i>' : "";
    $("#hubSel").innerHTML = `<div class="ws-bar">
      <div class="ws-l">1 · Предмет</div>
      <div class="ws-row">
        <button class="ws-b${!WS.s ? " on" : ""}" data-ws-s="">Все предметы <b>${ITEMS.length}</b>${dot(() => true)}</button>
        ${SUBJECTS.map((x) => `<button class="ws-b${WS.s === x.id ? " on" : ""}" data-ws-s="${x.id}">${x.icon} ${esc(x.name)} <b>${cnt((t) => t.subject === x.id)}</b>${dot((t) => t.subject === x.id)}</button>`).join("")}
      </div>
      ${sub ? `<div class="ws-l">2 · Класс</div><div class="ws-row">
        <button class="ws-b${!WS.g ? " on" : ""}" data-ws-g="">Все классы <b>${cnt((t) => t.subject === sub.id)}</b></button>
        ${sub.grades.map((g) => `<button class="ws-b${WS.g === g ? " on" : ""}" data-ws-g="${g}">${esc(g)} класс <b>${cnt((t) => t.subject === sub.id && t.grade === g)}</b>${dot((t) => t.subject === sub.id && t.grade === g)}</button>`).join("")}
      </div>` : ""}
      ${sub ? `<div class="ws-now">Вы работаете: <b>${sub.icon} ${esc(sub.name)}${WS.g ? " · " + esc(WS.g) + " класс" : ""}</b> — план недели, материалы и новые тесты будут сразу для этого ${WS.g ? "класса" : "предмета"}.</div>` : ""}
    </div>`;
    document.querySelectorAll("[data-ws-s]").forEach((b) => b.onclick = () => { WS = { s: b.dataset.wsS, g: "" }; const x = subjOf(WS.s); if (x && x.grades.length === 1) WS.g = x.grades[0]; saveWS(WS); draw(); });
    document.querySelectorAll("[data-ws-g]").forEach((b) => b.onclick = () => { WS = { ...WS, g: b.dataset.wsG }; saveWS(WS); draw(); });

    // ---- карточки: предмет → класс → работы ----
    const card = (t) => {
      const list = Object.values(RES[t.id] || {});
      const run = list.filter((r) => r.status === "in_progress").length;
      const done = list.filter((r) => r.status === "submitted").length;
      const q = usesQual(t.subject) && t.type === "mission";
      const K = kindOf(t, SET);
      return `<a class="hub-card${isOpen(t) ? " is-open" : ""}" href="${t.href}">
        <span class="live">${isOpen(t) ? '<span class="tag done">🟢 открыт</span>' : '<span class="tag">закрыт</span>'}</span>
        <div class="k">${esc(t.grade)} класс · ${kindLine(t)}</div>
        <div class="n">${esc(t.title)}</div>
        <div class="kt"><span class="ktag k-${K.id}">${K.icon} ${esc(K.short)}</span>${t.retake ? ' <span class="ktag k-retake">🔁 Пересдача</span>' : ""}${Number(SET[t.id]?.review) ? ' <span class="ktag" title="Ученики видят разбор своей работы">🔍 Разбор</span>' : ""}</div>
        ${t.type === "mission" && t.path ? `<span class="hub-pv" data-pv="${pvUrl(t.path)}" title="Открыть содержание миссии без кода ученика">👁 Посмотреть содержание</span>` : ""}
        <div class="hub-nums"><div><b>${list.length}</b>всего</div><div><b>${run}</b>пишут</div><div><b>${done}</b>сдали</div><div><b style="${q ? "font-size:13px" : ""}">${avgOf(t, list)}</b>${q ? "квалификативы" : "ср. оценка"}</div></div>
      </a>`;
    };
    const order = (a, b) => (Number(isOpen(b)) - Number(isOpen(a))) || String(a.n || 0).localeCompare(String(b.n || 0), undefined, { numeric: true }) || a.title.localeCompare(b.title);
    if (!window.__pvHook) { window.__pvHook = 1; document.addEventListener("click", (e) => { const b = e.target.closest("[data-pv]"); if (!b) return; e.preventDefault(); e.stopPropagation(); window.open(b.dataset.pv, "_blank", "noopener"); }, true); }
    $("#hub").innerHTML = SUBJECTS.filter((x) => !WS.s || x.id === WS.s).map((sb) => {
      const grades = sb.grades.filter((g) => !WS.g || g === WS.g || WS.s !== sb.id);
      const soon = TESTS.filter((t) => t.subject === sb.id && !t.path && (!WS.g || t.grade === WS.g)).length;
      const head = `<div class="hub-subj"><span class="ic">${sb.icon}</span>${esc(sb.name)}</div>`;
      const body = grades.map((g) => {
        const items = ITEMS.filter((t) => t.subject === sb.id && t.grade === g).sort(order);
        if (!items.length && !WS.g) return "";
        return `<div class="hub-grade"><span>${esc(g)} класс</span><small>${items.length ? items.length + " · открыто " + items.filter(isOpen).length : "пусто"}</small></div>` +
          (items.length ? `<div class="hub-grid">${items.map(card).join("")}</div>`
            : `<div class="hub-empty">Для ${esc(g)} класса пока нет работ. Создайте тест в <a href="builder.html">🧩 Конструкторе</a> — он сразу попадёт сюда.</div>`);
      }).join("");
      return head + (body || `<div class="hub-empty">Пока нет тестов и миссий. Создайте тест в <a href="builder.html">🧩 Конструкторе</a>.</div>`) +
        (soon ? `<p class="muted" style="font-size:14px;margin:8px 2px 0">🔒 Ещё в разработке: ${soon}</p>` : "");
    }).join("");
  }
  unsub.push(onValue(ref(db, "settings"), (s) => { SET = s.val() || {}; draw(); }));
  unsub.push(onValue(ref(db, "results"), (s) => { RES = s.val() || {}; draw(); }));
  unsub.push(onValue(ref(db, "pubIndex"), (s) => { PUB = s.val() || {}; draw(); }, () => {}));
}

// ---------- разбор работ для учеников: что показывать после сдачи ----------
const REVIEW_LV = ["Выключен", "Баллы и ответы ученика", "Всё + правильные ответы"];
function showReviewDlg(items, SET) {
  openId = null;
  const ws = getWS(), sb = SUBJECTS.find((x) => x.id === ws.s);
  dlg.innerHTML = `<div class="dlg-head"><b>🔍 Разбор для учеников</b>
      <button class="btn small ghost" style="background:#fff" id="rvClose">Закрыть ✕</button></div>
    <div class="dlg-body">
      <p class="muted">После сдачи ученик (и родитель в своём кабинете) видит на своей страничке кнопку «🔍 Разбор»: каждое задание,
        сколько баллов получено, его ответ и комментарий ИИ. Правильные ответы — только если выбрать «Всё + правильные ответы».
        Удобно включать после того, как все классы написали работу.</p>
      <p><b>${sb ? sb.icon + " " + esc(sb.name) + (ws.g ? " · " + esc(ws.g) + " класс" : "") : "Все предметы"}</b> <span class="muted">(выбор предмета и класса — в Центре управления)</span></p>
      <div class="rv-list">${items.length ? items.map((t) => `<div class="rv-row"><div><b>${esc(t.title)}</b>
          <div class="muted" style="font-size:13px">${esc(t.grade)} класс · ${t.type === "mission" ? "миссия" : t.bt ? "тест · конструктор" : "тест"}</div></div>
          <select data-rv="${esc(t.id)}" style="width:auto">${REVIEW_LV.map((n, i) => `<option value="${i}"${(Number(SET[t.id]?.review) || 0) === i ? " selected" : ""}>${n}</option>`).join("")}</select></div>`).join("")
        : '<p class="muted">Здесь пока нет работ.</p>'}</div>
      <p class="muted" id="rvSt" style="font-size:14px"></p>
      <p class="muted" style="font-size:13px">Для тестов со своей страницей результатов (сессия, практические, итоговые) разбор появится после того, как вы хотя бы раз откроете страницу результатов этого теста.</p>
    </div>`;
  dlg.showModal();
  $("#rvClose").onclick = () => dlg.close();
  dlg.querySelectorAll("[data-rv]").forEach((sel) => sel.onchange = async () => {
    const st = $("#rvSt");
    st.textContent = "Сохраняю…";
    await set(ref(db, `settings/${sel.dataset.rv}/review`), Number(sel.value) || null);
    st.textContent = "Обновляю странички учеников…";
    try { await syncProgress(db); st.textContent = "✓ Готово. Ученики увидят изменения при следующем обновлении странички (до минуты)."; }
    catch (e) { st.textContent = "Сохранено. Странички обновятся в течение минуты."; }
  });
}

// ---------- коллеги: заявки и доступ ----------
async function showStaffDlg() {
  openId = null;
  dlg.innerHTML = `<div class="dlg-head"><b>👥 Коллеги</b><button class="btn small ghost" style="background:#fff" id="sfClose">Закрыть ✕</button></div>
    <div class="dlg-body" id="sfBody"><p class="muted">Загружаю…</p></div>`;
  if (!dlg.open) dlg.showModal();
  $("#sfClose").onclick = () => dlg.close();
  const { staff, requests } = await loadStaff(db);
  const site = new URL("../teacher/builder.html", import.meta.url).href;
  const req = Object.entries(requests), st = Object.entries(staff).filter(([, x]) => x.role !== "admin");
  $("#sfBody").innerHTML = `
    <p>Коллега получает <b>свой кабинет</b>: Конструктор тестов, результаты своих тестов и проверку ИИ.
      Ваши тесты она видит только в «📂 Общей папке» — те, где вы нажали «🤝 Поделиться», и может скопировать их к себе.
      Ваших учеников, их коды и результаты коллега не видит.</p>
    <div class="chk-item"><b>Как подключить коллегу:</b> отправьте ей ссылку <span class="mono">${esc(site)}</span> — пусть войдёт через Google.
      Её заявка появится ниже — нажмите «Принять».</div>
    <h3 style="margin:18px 0 8px">Заявки ${req.length ? "· " + req.length : ""}</h3>
    ${req.length ? req.map(([uid, x]) => `<div class="rv-row"><div><b>${esc(x.name || x.email)}</b><div class="muted" style="font-size:13px">${esc(x.email)} · ${new Date(x.at || 0).toLocaleString("ru-RU")}</div></div>
      <div style="display:flex;gap:8px"><button class="btn small" data-acc="${esc(uid)}">✓ Принять</button><button class="btn small ghost" data-dec="${esc(uid)}">Отклонить</button></div></div>`).join("")
      : '<p class="muted">Новых заявок нет.</p>'}
    <h3 style="margin:18px 0 8px">Коллеги с доступом ${st.length ? "· " + st.length : ""}</h3>
    ${st.length ? st.map(([uid, x]) => `<div class="rv-row"><div><b>${esc(x.name || x.email)}</b><div class="muted" style="font-size:13px">${esc(x.email)}</div></div>
      <button class="btn small red" data-rm="${esc(uid)}">Закрыть доступ</button></div>`).join("") : '<p class="muted">Пока никого.</p>'}`;
  dlg.querySelectorAll("[data-acc]").forEach((b) => b.onclick = async () => { await acceptStaff(db, b.dataset.acc, requests[b.dataset.acc]).catch((e) => alert(e.message)); showStaffDlg(); });
  dlg.querySelectorAll("[data-dec]").forEach((b) => b.onclick = async () => { await declineStaff(db, b.dataset.dec).catch((e) => alert(e.message)); showStaffDlg(); });
  dlg.querySelectorAll("[data-rm]").forEach((b) => b.onclick = async () => { if (!confirm("Закрыть доступ этому учителю? Его тесты останутся в базе.")) return; await removeStaff(db, b.dataset.rm).catch((e) => alert(e.message)); showStaffDlg(); });
}

// ---------- выбранный предмет и класс учителя (общий для Центра управления, плана, материалов и конструктора) ----------
function getWS() {
  try { const w = JSON.parse(localStorage.getItem("techlab_ws") || "{}"); const s = SUBJECTS.find((x) => x.id === w.s);
    return s ? { s: s.id, g: s.grades.includes(w.g) ? w.g : "" } : { s: "", g: "" }; } catch (e) { return { s: "", g: "" }; }
}
function saveWS(w) { try { localStorage.setItem("techlab_ws", JSON.stringify(w)); } catch (e) {} }
function wsOptions(sep) {        // список «предмет · класс» для диалогов; выбранный в Центре управления — первым и отмеченным
  const w = getWS();
  return SUBJECTS.flatMap((sub) => sub.grades.map((g) => {
    const v = sub.id + sep + g, on = w.s === sub.id && (w.g === g || (!w.g && g === sub.grades[0]));
    return `<option value="${v}"${on ? " selected" : ""}>${esc(sub.icon + " " + sub.name + " · " + g + " класс")}</option>`;
  })).join("");
}


// ---------- миссии: развёрнутые ответы и проверка ИИ ----------
const mAiQueue = [], mAiQueued = new Set(); let mAiBusy = false;
function mAiTargets(r, all = false) {
  return mOpenItems(r).filter((i) => i.answer && (all || i.teacher === null))
    .map((i) => ({ key: i.k, max: i.max, question: i.q, answer: i.answer.slice(0, 3000), model: i.model || "", criteria: i.criteria || "" }));
}
function mAutoEnqueue() {
  if (!AICFG?.url) return;
  for (const [id, r] of Object.entries(RESULTS)) if (r.status === "submitted" && !r.aiStatus && mAiTargets(r).length) mEnqueue(id, false);
}
function mEnqueue(id, force) {
  if (mAiQueued.has(id)) return;
  const r = RESULTS[id]; if (!r || (!force && r.aiStatus)) return;
  mAiQueued.add(id); mAiQueue.push(id); renderMission(); mRun();
}
async function mRun() {
  if (mAiBusy) return; mAiBusy = true;
  while (mAiQueue.length) {
    const id = mAiQueue.shift(), r = RESULTS[id];
    setAiStatus(`🤖 Проверяю: ${r?.name || ""} (в очереди ещё ${mAiQueue.length})`);
    try {
      const items = r ? mAiTargets(r) : [];
      if (items.length) {
        const data = await callAi({ subject: ENTRY.aiSubject || "информатика", items });
        const ai = { ...(r.ai || {}) };
        for (const x of data.results || []) {
          const it = items.find((i) => i.key === x.key);
          if (!it || !Number.isFinite(Number(x.score))) continue;
          ai[x.key] = { score: Math.max(0, Math.min(it.max, Math.round(Number(x.score) * 2) / 2)), comment: String(x.comment || "").slice(0, 400),
            good: String(x.good || "").slice(0, 500), missing: String(x.missing || "").slice(0, 500), advice: String(x.advice || "").slice(0, 500) };
        }
        await update(ref(db, `${P}/${id}`), { ai, aiStatus: "done", aiError: null, aiAt: Date.now() });
      }
    } catch (e) {
      await update(ref(db, `${P}/${id}`), { aiStatus: "error", aiError: String(e.message || e).slice(0, 300) }).catch(() => {});
      if (/429|quota|rate/i.test(String(e.message))) { setAiStatus("🤖 Лимит запросов ИИ — пауза 60 с…"); await sleep(60000); }
    }
    mAiQueued.delete(id); renderMission();
    if (mAiQueue.length) await sleep(6000);
  }
  mAiBusy = false; setAiStatus("🤖 Проверка ИИ завершена.");
}
function mShowOpen(id, refresh = false) {
  const r = RESULTS[id]; if (!r) return;
  openId = id;
  const e = mEval(r), scrollPos = refresh ? dlg.scrollTop : 0;
  dlg.innerHTML = `<div class="dlg-head"><div><b>${esc(r.name)}</b> · ${esc(r.cls)} · ${e.pts} / ${e.max} б. · ${usesQual(ENTRY.subject) ? "квалификатив" : "оценка"} ${e.complete ? `<b>${e.mark}</b>` : "≈" + e.mark}</div>
      <button class="btn small ghost" id="mClose">Закрыть ✕</button></div>
    <div class="dlg-body">
      <div class="chk-row" style="margin-bottom:12px"><span class="muted">Автоматические задания: ${(ENTRY.parts || []).filter((p) => !p.open).map((p) => `${esc(p.name)} <b>${r.score?.[p.k] ?? "—"}</b>/${p.max}`).join(" · ")}</span>
        <button class="btn small ghost" id="mAi">🤖 Проверить ИИ</button></div>
      ${r.aiStatus === "error" ? `<div class="chk-item need">🤖 Ошибка проверки ИИ: ${esc(r.aiError || "")}</div>` : ""}
      ${e.items.map((i) => `<div class="chk-item ${i.pending ? "need" : ""}">
        <div class="chk-row"><b>${esc(i.title || i.k)}</b><span>${i.score ?? "?"} / ${i.max} б. ${i.pending ? '<span class="tag warn">нужно проверить</span>' : ""}</span></div>
        <div class="muted" style="font-size:14px;margin:4px 0 8px">${esc(i.q)}</div>
        <div class="ans">${esc(i.answer || "— нет ответа —")}</div>
        <div class="model"><b>Критерии:</b> ${esc(i.criteria)}<br><b>Образец:</b> ${esc(i.model)}</div>
        <div class="chk-row"><span>Баллы: <input type="number" class="score-in" min="0" max="${i.max}" step="0.5" data-mk="${i.k}" value="${i.teacher ?? i.ai ?? (i.answer ? "" : 0)}" placeholder="?"> / ${i.max}
          ${i.teacher === null && i.ai !== null ? '<span class="tag run">🤖 ИИ</span>' : ""}${i.teacher !== null ? '<span class="tag done">✍ учитель</span>' : ""}</span></div>
        ${i.aiGood || i.aiMissing || i.aiAdvice ? `<div class="review"><div class="rv-h">📋 Разбор ИИ</div><ul>
          ${i.aiGood ? `<li class="ok">✓ ${esc(i.aiGood)}</li>` : ""}${i.aiMissing ? `<li class="bad">✗ ${esc(i.aiMissing)}</li>` : ""}</ul>
          ${i.aiAdvice ? `<div class="rv-adv">💡 <b>Рекомендация:</b> ${esc(i.aiAdvice)}</div>` : ""}</div>`
          : i.aiComment ? `<div class="muted" style="font-size:13px;margin-top:4px">🤖 ${esc(i.aiComment)}</div>` : ""}
      </div>`).join("")}
      <p class="muted" style="font-size:13px">Ваш балл важнее оценки ИИ. Чтобы вернуть оценку ИИ, очистите поле.</p>
    </div>`;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = scrollPos;
  $("#mClose").onclick = () => { openId = null; dlg.close(); };
  $("#mAi").onclick = () => { if (!AICFG?.url) return showAiSettings(); mEnqueue(id, true); };
  dlg.querySelectorAll("[data-mk]").forEach((inp) => inp.onchange = () => {
    const v = inp.value === "" ? null : Math.max(0, Math.min(Number(inp.max), Number(inp.value)));
    update(ref(db, `${P}/${id}/manual`), { [inp.dataset.mk]: v });
  });
}


// =====================================================================
//  РАЗБОР РАБОТЫ: что верно, что неверно, рекомендации по каждому заданию
// =====================================================================
const T_TOPIC = { 1: "ключевые термины", 2: "классификация (таблица)", 3: "выбор верного утверждения", 4: "анализ диаграммы", 5: "анализ диаграммы",
  6: "причинно-следственные связи", 7: "причинно-следственные связи", 8: "развёрнутая аргументация", 9: "работа с картой", 10: "расчёт плотности населения" };
const T_ADVICE = {
  1: "Выучить определения из рамок «Ключевые термины» учебника. В неверном утверждении найти слово-ошибку и записать определение правильно, полностью.",
  2: "Повторить классификации из параграфа. Перед распределением вспомнить главный признак каждого столбца и проверять каждую карточку по этому признаку.",
  3: "Внимательно читать числа, годы, проценты и названия в каждом утверждении и сверять их с таблицами и текстом учебника.",
  4: "Описание диаграммы по плану: 1) общая тенденция; 2) конкретные числа — максимум, минимум, «во сколько раз»; 3) две причины.",
  5: "Описание диаграммы по плану: 1) общая тенденция; 2) конкретные числа — максимум, минимум, «во сколько раз»; 3) две причины.",
  6: "Отвечать по схеме «причина → объяснение»: назвать три разные причины и к каждой добавить «потому что…».",
  7: "Отвечать по схеме «причина → объяснение»: назвать три разные причины и к каждой добавить «потому что…».",
  8: "Развёрнутый ответ: три аргумента (причины / следствия) + пример конкретной страны + короткий вывод.",
  9: "Повторить политическую карту мира: искать страну по материку, океану, соседям и очертаниям; сравнивать с атласом.",
  10: "D = Np / St. Перевести единицы: млн чел. × 1 000 000, тыс. км² × 1 000. Результат сравнить с легендой: I — более 100, II — 20–100, III — 2–20, IV — менее 2 чел./км².",
};
const yesNo = (v) => v === "T" ? "«Верно»" : v === "F" ? "«Неверно»" : "нет ответа";

function reviewOf(r) {
  const v = VARIANTS.find((x) => x.id === r.variant), k = KEYS.variants[String(r.variant)];
  const g = evaluate(r), A = r.answers || {}, tasks = {};
  for (const t of v.tasks) {
    const its = g.items.filter((i) => i.task === t.n);
    const T = { topic: TEST.topics?.[t.n] ?? T_TOPIC[t.n], sum: its.reduce((s, i) => s + (i.score ?? 0), 0), max: t.points, good: [], bad: [], advice: TEST.advice?.[t.n] ?? T_ADVICE[t.n], ai: [] };
    if (t.type === "tf") {
      for (const q of t.items) {
        const kk = k.t1[q.id], a = (A.t1 || {})[q.id] || {};
        if (a.v !== kk.tf) T.bad.push(`${q.id}) «${q.concept}»: ${a.v ? "отмечено " + yesNo(a.v) : "нет ответа"}, а утверждение ${kk.tf === "T" ? "верное" : "неверное"}` +
          (kk.tf === "F" ? `. Правильно: ${kk.fix}` : ""));
        else if (kk.tf === "F") {
          const fx = its.find((i) => i.key === `t1_${q.id}f`);
          if ((fx?.score ?? 0) < 1) T.bad.push(`${q.id}) «${q.concept}»: ошибка найдена, но исправление ${a.fix ? `неточное («${a.fix}»)` : "не написано"}. Нужно: ${kk.fix}`);
          else T.good.push(`${q.id}) «${q.concept}» — ошибка найдена и исправлена`);
        } else T.good.push(`${q.id}) «${q.concept}» — верно определено как правильное`);
      }
    } else if (t.type === "classify") {
      const a = A.t2 || {};
      let ok = 0;
      for (const c of t.chips) {
        const ans = a[c.id], key = k.t2[c.id];
        if (ans == null || ans < 0) T.bad.push(`«${c.text}» не распределено (верно: «${t.columns[key]}»)`);
        else if (Number(ans) !== key) T.bad.push(`«${c.text}» отнесено к «${t.columns[ans]}», а верно — «${t.columns[key]}»`);
        else ok++;
      }
      if (ok) T.good.push(`верно распределено карточек: ${ok} из ${t.chips.length}`);
    } else if (t.type === "mcq") {
      const ch = t.options.find((o) => o.id === A.t3), right = t.options.find((o) => o.id === k.t3);
      if (!ch) T.bad.push(`ответ не выбран. Верно: «${right.text}»`);
      else if (ch.id !== k.t3) T.bad.push(`выбрано неверное утверждение «${ch.text}». Верно: «${right.text}»`);
      else T.good.push("выбрано верное утверждение");
    } else if (t.type === "mapid") {
      const a = A.t9 || {};
      for (const m of t.markers) {
        if (a[m.letter] === k.t9[m.letter]) T.good.push(`${m.letter} — ${k.t9[m.letter]}`);
        else T.bad.push(`${m.letter}: ${a[m.letter] ? `выбрано «${a[m.letter]}»` : "не выбрано"}, верно — ${k.t9[m.letter]}`);
      }
    } else if (t.type === "mapcalc") {
      const a = A.t10 || {}, d = parseNum(a.d), kd = k.t10.d;
      const calc = its.find((i) => i.key === "t10a"), cat = its.find((i) => i.key === "t10b");
      if (d === null) T.bad.push(`а) плотность не рассчитана. Верно: ${k.t10.calc}`);
      else if (calc.auto === 2) T.good.push(`а) плотность рассчитана верно (${a.d})`);
      else {
        const lg = Math.log10(d / kd), ilg = Math.log10(d * kd);
        let why = "ошибка в вычислении";
        if (calc.auto === 1) why = "небольшая неточность (округление)";
        else if (Number.isFinite(lg) && Math.abs(lg - Math.round(lg)) < .06 && Math.round(lg) !== 0) why = `ответ отличается в ${Math.pow(10, Math.abs(Math.round(lg))).toLocaleString("ru-RU")} раз — неверно переведены единицы (млн → × 1 000 000, тыс. км² → × 1 000)`;
        else if (Number.isFinite(ilg) && Math.abs(ilg - Math.round(ilg)) < .06) why = "перепутаны местами численность населения и площадь (нужно население ÷ площадь)";
        T.bad.push(`а) ответ ${a.d} — ${why}. Верно: ${k.t10.calc}`);
      }
      if (!a.cat) T.bad.push(`б) категория не выбрана (верно: ${k.t10.cat})`);
      else if (cat.auto === 1) T.good.push(`б) категория ${a.cat} определена верно`);
      else T.bad.push(`б) выбрана категория ${a.cat}, а для плотности ${d ?? "?"} чел./км² нужна категория ${k.t10.cat}`);
    }
    // развёрнутые ответы: оценка ИИ (что верно / чего не хватает / совет)
    for (const it of its.filter((i) => i.check)) {
      const pre = t.type === "tf" ? `${it.key.slice(3, 4)}) исправление — ` : it.task === 10 ? "в) объяснение — " : "";
      if (it.autoEmpty || it.empty) { if (t.type !== "tf") T.bad.push(pre + "ответ не дан"); continue; }
      if (it.score === null) T.pending = true;
      if (it.aiGood) T.good.push(pre + it.aiGood);
      if (it.aiMissing) T.bad.push(pre + it.aiMissing);
      if (it.aiAdvice) T.ai.push(it.aiAdvice);
    }
    T.mixed = t.type === "tf" || t.type === "mapcalc";
    tasks[t.n] = T;
  }
  return { tasks, g };
}

const adviceOf = (T) => !T.ai.length ? T.advice : T.mixed ? T.advice + " " + T.ai.join(" ") : T.ai.join(" ");

function reviewHtml(T) {
  if (!T) return "";
  const li = (arr, cls, ic) => arr.map((x) => `<li class="${cls}">${ic} ${esc(x)}</li>`).join("");
  const perfect = !T.bad.length && T.sum >= T.max;
  return `<div class="review"><div class="rv-h">📋 Разбор задания</div>
    <ul>${li(T.good, "ok", "✓")}${li(T.bad, "bad", "✗")}</ul>
    ${perfect ? `<div class="rv-adv">🌟 Задание выполнено полностью.</div>`
      : `<div class="rv-adv">💡 <b>Рекомендация:</b> ${esc(adviceOf(T))}</div>`}</div>`;
}

function summaryHtml(r, RV) {
  const weak = Object.entries(RV.tasks).filter(([, t]) => t.sum < t.max * .6).map(([n, t]) => `№${n} (${t.topic})`);
  const S = r.aiSummary;
  return `<div class="chk-item rv-sum"><div class="chk-row"><b>🤖 Общий вывод по работе</b>
      ${S ? "" : `<span class="muted" style="font-size:13px">нажмите «Разбор ИИ», чтобы получить вывод от ИИ</span>`}</div>
    ${S ? `<p><b>✓ Сильные стороны:</b> ${esc(S.strengths)}</p><p><b>✗ Пробелы:</b> ${esc(S.gaps)}</p><p><b>💡 Что повторить и как:</b> ${esc(S.advice)}</p>`
      : `<p><b>Слабые задания:</b> ${weak.length ? esc(weak.join(", ")) : "нет — работа выполнена хорошо"}.</p>`}</div>`;
}

function printReviews(ids) {
  const SCH = SCALE.map(([p, g]) => `<b>${g}</b> — от ${Math.ceil(p / 100 * TEST.max * 2) / 2} б.`).join(" · ");
  const pages = ids.map((id) => {
    const r = RESULTS[id]; const RV = reviewOf(r), g = RV.g;
    const tasks = Object.entries(RV.tasks).map(([n, t]) => `<tr><td class="n">${n}</td><td><b>${esc(t.topic)}</b>
        <ul>${t.good.map((x) => `<li class="ok">✓ ${esc(x)}</li>`).join("")}${t.bad.map((x) => `<li class="bad">✗ ${esc(x)}</li>`).join("")}</ul>
        ${t.bad.length || t.sum < t.max ? `<div class="adv">💡 ${esc(adviceOf(t))}</div>` : ""}</td>
        <td class="p">${fmtNum(t.sum)} / ${t.max}</td></tr>`).join("");
    const S = r.aiSummary;
    return `<section><h1>${esc(ENTRY.title)}</h1>
      <div class="meta"><b>${esc(r.name)}</b> · ${esc(r.cls)} · вариант ${r.variant} · баллы: <b>${fmtNum(g.total)} / ${g.max}</b> · оценка: <b class="gr">${g.complete ? g.grade : "≈" + g.gradeNow}</b></div>
      <table><thead><tr><th>№</th><th>Разбор: что верно ✓ · что неверно ✗ · рекомендация 💡</th><th>Баллы</th></tr></thead><tbody>${tasks}</tbody></table>
      ${S ? `<div class="sum"><b>Общий вывод.</b> <b>Сильные стороны:</b> ${esc(S.strengths)} <b>Пробелы:</b> ${esc(S.gaps)} <b>Что повторить:</b> ${esc(S.advice)}</div>` : ""}
      <div class="scale">Шкала перевода баллов в оценку: ${SCH}</div></section>`;
  }).join("");
  const w = window.open("", "_blank");
  w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Разбор работ</title><style>
    body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:13px}section{padding:18px 22px;page-break-after:always}
    h1{font-size:18px;margin:0 0 6px}.meta{margin-bottom:10px}.gr{font-size:18px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px 8px;vertical-align:top;text-align:left}
    th{background:#eee}td.n,td.p{white-space:nowrap;text-align:center;font-weight:bold}ul{margin:4px 0;padding-left:16px}
    li.ok{color:#126b3a}li.bad{color:#b3261e}.adv{background:#fff6d6;border-left:3px solid #e0b100;padding:4px 8px;margin-top:4px}
    .sum{margin-top:10px;background:#eef5ff;border:1px solid #9cc0f0;padding:8px 10px}.scale{margin-top:8px;color:#555;font-size:11px}
  </style></head><body>${pages}</body></html>`);
  w.document.close(); setTimeout(() => w.print(), 600);
}

// =====================================================================
//  БЛАНК РАБОТЫ: как экзаменационный лист — ответы «синей ручкой», пометки «красной пастой»
// =====================================================================
const TEACHER_SIGN = "Т. Д.";   // подпись учителя на бланке
function hwText(s) {                     // «почерк»: слова слегка пляшут, как у живой ручки
  let seed = 7;
  return esc(String(s ?? "")).split(/(\s+)/).map((w) => {
    if (!w.trim()) return w.includes("\n") ? "<br>" : " ";
    for (const ch of w) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
    const rot = ((seed % 17) - 8) / 8, dy = ((seed % 5) - 2) / 2;
    return `<span class="w" style="transform:rotate(${rot.toFixed(2)}deg) translateY(${dy}px)">${w}</span>`;
  }).join("");
}
const HW = (s) => `<span class="hw">${hwText(s)}</span>`;
const RED = (s, cls = "") => `<span class="red ${cls}">${esc(s)}</span>`;
const OKM = (ok) => `<span class="mk">${ok ? "✓" : "✗"}</span>`;
function lCol(max, score, filled) {
  const isInt = score !== null && Math.abs(score - Math.round(score)) < 1e-9;
  let h = "<span>L</span>";
  for (let i = 0; i <= max; i++) h += `<span${filled && isInt && Math.round(score) === i ? ' class="c"' : ""}>${i}</span>`;
  if (filled && score !== null && !isInt) h += `<span class="half">${fmtNum(score)}</span>`;
  if (filled && score === null) h += `<span class="half">?</span>`;
  return `<td class="L">${h}</td>`;
}
function sheetOf(r) {
  const v = VARIANTS.find((x) => x.id === r.variant), k = KEYS.variants[String(r.variant)];
  const RV = reviewOf(r), g = RV.g, A = r.answers || {};
  const K = kindOf(ENTRY, SETTINGS);
  const subj = SUBJECTS.find((x) => x.id === ENTRY.subject);
  const date = r.submittedAt || r.startedAt ? new Date(r.submittedAt || r.startedAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const clean = (t) => String(t).replace(/\s*Нажмите на карточку[^.]*\.?/i, "").replace(/\s*\(или перетащите[^)]*\)\.?/i, "");
  const notes = (n, skipGood) => { const T = RV.tasks[n]; if (!T) return "";
    const out = [];
    if (!skipGood) T.good.forEach((x) => out.push(`<div class="red sm">+ ${esc(x)}</div>`));
    T.bad.forEach((x) => out.push(`<div class="red">− ${esc(x)}</div>`));
    if (T.pending) out.push(`<div class="red sm">(ответ ещё не проверен)</div>`);
    return out.join(""); };

  const rows = v.tasks.map((t) => {
    const its = g.items.filter((i) => i.task === t.n);
    const sum = its.some((i) => i.score === null) && its.every((i) => i.score === null) ? null : its.reduce((s, i) => s + (i.score ?? 0), 0);
    let body = `<div class="q">${esc(clean(t.title))}</div>`;
    if (t.type === "tf") {
      body += t.items.map((q) => {
        const kk = k.t1[q.id], a = (A.t1 || {})[q.id] || {};
        const okMark = a.v === kk.tf;
        const fixOk = kk.tf === "F" ? (its.find((i) => i.key === `t1_${q.id}f`)?.score ?? 0) >= 1 : true;
        return `<div class="tf"><span class="ln">${a.v === "F" && a.fix ? HW(a.fix) : ""}</span>
          <span class="vh"><span class="${a.v === "T" ? "o" : ""}">В</span> <span class="${a.v === "F" ? "o" : ""}">Н</span></span>
          <span>${q.id}) <u>${esc(q.concept)}</u> — ${esc(q.text)} ${OKM(okMark && fixOk)}
          ${!okMark ? `<br>${RED(kk.tf === "T" ? "Утверждение верное." : "Утверждение неверное. Правильно: " + kk.fix)}` : !fixOk ? `<br>${RED("Исправление неточное. Нужно: " + kk.fix)}` : ""}</span></div>`;
      }).join("");
    } else if (t.type === "classify") {
      const a = A.t2 || {};
      const cell = (ci) => t.chips.filter((c) => Number(a[c.id]) === ci && a[c.id] != null).map((c) =>
        `<div class="${Number(a[c.id]) === k.t2[c.id] ? "" : "wv"}">${HW(c.text)} ${OKM(Number(a[c.id]) === k.t2[c.id])}</div>`).join("") || "&nbsp;";
      const lost = t.chips.filter((c) => a[c.id] == null || a[c.id] < 0);
      body += `<table class="in"><tr>${t.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>
        <tr>${t.columns.map((_, ci) => `<td>${cell(ci)}</td>`).join("")}</tr></table>` +
        (lost.length ? `<div class="red sm">Не распределено: ${esc(lost.map((c) => c.text).join("; "))}</div>` : "") +
        t.chips.filter((c) => a[c.id] != null && a[c.id] >= 0 && Number(a[c.id]) !== k.t2[c.id]).map((c) => `<div class="red">«${esc(c.text)}» → ${esc(t.columns[k.t2[c.id]])}</div>`).join("");
    } else if (t.type === "mcq") {
      body += t.options.map((o, i) => {
        const chosen = A.t3 === o.id, right = o.id === k.t3;
        return `<div class="opt"><span class="${chosen ? "o" : ""}">${"абвгд"[i]})</span> ${esc(o.text)}
          ${chosen ? OKM(right) : ""}${!chosen && right && A.t3 !== k.t3 ? ` ${RED("← верно")}` : ""}</div>`;
      }).join("");
    } else if (t.type === "chart" || t.type === "open") {
      const ans = A["t" + t.n];
      const tb = t.table;
      body += (t.chart ? `<div class="sm it">[${t.chart.kind === "climate" ? "климатограмма" : "диаграмма"} «${esc(t.chart.title)}» — в электронной версии теста]</div>` : "") +
        (tb ? `<table class="in dt">${tb.caption ? `<caption>${esc(tb.caption)}</caption>` : ""}<tr>${tb.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${tb.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>` : "") +
        `<div class="answ">${ans && String(ans).trim() ? HW(ans) : '<div class="ln"></div><div class="ln"></div>'}</div>` + notes(t.n);
    } else if (t.type === "mapid") {
      const a = A.t9 || {};
      body += `<div class="sm it">[карта — в электронной версии теста]</div>` + t.markers.map((m) => {
        const ok = a[m.letter] === k.t9[m.letter];
        return `<div class="mp"><b>${m.letter}</b> — <span class="ln2">${a[m.letter] ? HW(a[m.letter]) : ""}</span> ${OKM(ok)} ${ok ? "" : RED(k.t9[m.letter])}</div>`;
      }).join("");
    } else if (t.type === "mapcalc") {
      const a = A.t10 || {};
      const calc = its.find((i) => i.key === "t10a"), cat = its.find((i) => i.key === "t10b");
      body += `<div class="mp">а) D = <span class="ln2">${a.d ? HW(a.d) : ""}</span> чел./км² ${OKM(calc.auto === 2)}</div>
        <div class="mp">б) Категория: <span class="ln2">${a.cat ? HW(a.cat) : ""}</span> ${OKM(cat.auto === 1)}</div>
        <div class="mp">в) <span class="answ">${a.why ? HW(a.why) : '<span class="ln2" style="min-width:300px"></span>'}</span></div>` + notes(t.n, true);
    }
    const T = RV.tasks[t.n];
    if (T && (T.bad.length || (sum ?? 0) < t.points) && !T.pending) body += `<div class="red adv">💡 ${esc(adviceOf(T))}</div>`;
    return `<tr><td class="n">${t.n}.</td><td>${body}</td>${lCol(t.points, sum, true)}${lCol(t.points, null, false)}</tr>`;
  }).join("");

  const S = r.aiSummary;
  const weak = Object.entries(RV.tasks).filter(([, t]) => t.sum < t.max * .6).map(([n, t]) => `№${n} (${t.topic})`);
  const auto = { tab: "переключение вкладки", blur: "переход в другое окно", close: "закрытие страницы" }[r.reason];
  return `<section>
    <h3>${esc(K.name)} · ${esc(subj?.name || "")} · ${esc(ENTRY.grade)} класс</h3>
    <div class="sub">${esc(TEST.title)} · Вариант ${r.variant}</div>
    <div class="fio"><span>Фамилия, имя:</span><span class="line">${HW(r.name)}</span><span>Класс:</span><span class="line">${HW(r.cls)}</span><span>Дата:</span><span class="line">${HW(date)}</span></div>
    ${auto ? `<div class="red" style="margin:-4px 0 8px">⚠ Работа сдана автоматически: ${auto}.</div>` : ""}
    <table class="ex"><thead><tr><th style="width:34px">№</th><th>Задания</th><th colspan="2" style="width:64px">Баллы</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="fin"><div class="sum">
      <div class="red big">Итого: ${fmtNum(g.total)} из ${g.max} баллов → оценка ${g.complete ? g.grade : "≈" + g.gradeNow}</div>
      ${S ? `<div class="red sm2">Молодец: ${esc(S.strengths)}</div><div class="red sm2">Пробелы: ${esc(S.gaps)}</div><div class="red sm2">Что повторить: ${esc(S.advice)}</div>`
        : `<div class="red sm2">${weak.length ? "Повтори: " + esc(weak.join(", ")) : "Работа выполнена хорошо!"}</div>`}
      <div class="red sign">Проверил: ${esc(TEACHER_SIGN)}</div></div>
      <div class="gradeC"><b>${g.complete ? g.grade : "≈" + g.gradeNow}</b></div></div>
  </section>`;
}
function printSheets(ids) {
  const pages = ids.map((id) => sheetOf(RESULTS[id])).join("");
  const w = window.open("", "_blank");
  if (!w) return alert("Браузер заблокировал новое окно. Разрешите всплывающие окна для этого сайта.");
  w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Бланки · ${esc(ENTRY.title)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marck+Script&family=Caveat:wght@500;700&display=swap">
  <style>
    @page{size:A4;margin:12mm}
    body{margin:0;font-family:"Times New Roman",Times,serif;color:#000;font-size:13.5px}
    section{page-break-after:always;padding:4px 2px}
    h3{text-align:center;font-size:16px;margin:0 0 2px}.sub{text-align:center;font-style:italic;margin-bottom:10px}
    .fio{display:grid;grid-template-columns:auto 1fr auto 90px auto 110px;gap:6px 8px;align-items:end;margin-bottom:10px}
    .line{border-bottom:1px solid #000;min-height:24px;padding-left:6px}
    .hw{font-family:"Marck Script","Segoe Print","Comic Sans MS",cursive;color:#1638B8;font-size:18px;line-height:1.25}
    .hw .w{display:inline-block}
    .red{font-family:Caveat,"Segoe Print","Comic Sans MS",cursive;color:#D3172B;font-weight:700;font-size:17px;line-height:1.15}
    .red.sm{font-weight:500;font-size:16px}.red.sm2{font-weight:500;font-size:17px;margin-top:2px}.red.big{font-size:21px}
    .red.adv{font-weight:500;font-size:16px;margin-top:3px}
    .sm{font-size:12px}.it{font-style:italic;color:#444;margin:2px 0}
    table.ex{width:100%;border-collapse:collapse}table.ex td,table.ex th{border:1px solid #000;vertical-align:top;padding:5px 7px}
    table.ex tr{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}
    td.n{width:34px;text-align:center}
    td.L{width:30px;text-align:center;font-size:12.5px;line-height:1.4;padding:4px 2px}td.L span{display:block;position:relative}
    td.L span.c::before{content:"";position:absolute;left:50%;top:50%;width:20px;height:20px;transform:translate(-50%,-50%) rotate(-8deg);border:2px solid #D3172B;border-radius:50% 45% 52% 48%}
    td.L span.half{font-family:Caveat,cursive;color:#D3172B;font-weight:700;font-size:17px;margin-top:4px}
    .q{margin-bottom:4px;white-space:pre-line}
    table.dt{width:auto;min-width:60%}table.dt caption{font-weight:bold;font-size:13px;padding-bottom:3px}table.dt td:first-child{text-align:left}
    .tf{display:grid;grid-template-columns:140px 46px 1fr;gap:6px;align-items:start;margin:5px 0}
    .ln{border-bottom:1px solid #000;min-height:22px}.ln2{display:inline-block;border-bottom:1px solid #000;min-width:120px;min-height:20px;padding:0 4px}
    .vh{font-weight:700;letter-spacing:4px;white-space:nowrap}
    .o{position:relative;display:inline-block}.o::before{content:"";position:absolute;left:-4px;top:-3px;width:calc(100% + 6px);min-width:18px;height:20px;border:2px solid #1638B8;border-radius:50%;transform:rotate(-6deg)}
    .mk{font-family:Caveat,cursive;color:#D3172B;font-weight:700;font-size:22px;margin-left:4px;line-height:1}
    table.in{width:100%;border-collapse:collapse;margin:4px 0}table.in td,table.in th{border:1px solid #000;padding:3px 5px;text-align:center;font-size:13px;vertical-align:top}
    .wv .hw .w{text-decoration:underline wavy #D3172B;text-underline-offset:4px}
    .opt{margin:3px 0}.mp{margin:4px 0}.answ{margin:4px 0}
    .fin{display:flex;gap:14px;align-items:center;margin-top:12px;break-inside:avoid;page-break-inside:avoid}
    .sum{flex:1;border:2px solid #D3172B;border-radius:6px;padding:8px 12px;transform:rotate(-.3deg)}
    .sign{margin-top:6px;font-weight:500}
    .gradeC{width:88px;height:88px;flex:none;border:3px solid #D3172B;border-radius:52% 48% 50% 46%;display:grid;place-items:center;transform:rotate(-10deg)}
    .gradeC b{font-family:Caveat,cursive;color:#D3172B;font-size:52px;line-height:1}
    .hint{font-family:Arial,sans-serif;background:#E8EDFF;color:#1B3F9E;padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:13px}
    @media print{.hint{display:none}}
  </style></head><body><div class="hint">Чтобы сохранить PDF: в окне печати выберите «Сохранить как PDF». Если почерк выглядит как обычный шрифт — подождите 2–3 секунды, пока загрузятся шрифты, и откройте печать ещё раз (Ctrl+P).</div>${pages}</body></html>`);
  w.document.close();
  const go = () => setTimeout(() => w.print(), 300);
  (w.document.fonts?.ready || Promise.resolve()).then(() => setTimeout(go, 400), go);
}
