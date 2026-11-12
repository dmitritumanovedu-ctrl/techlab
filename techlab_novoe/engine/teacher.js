import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, onValue, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";
import { grade, SCALE, parseNum } from "./grading.js";
import { SUBJECTS, TESTS } from "../tests.js";

// Выбор теста: ?test=код (по умолчанию — первый в списке)
const READY = TESTS.filter((x) => x.path);
const TEST_ID = new URLSearchParams(location.search).get("test");
const OVERVIEW = !TEST_ID || !READY.some((x) => x.id === TEST_ID);   // без ?test= — «Центр управления»
const ENTRY = READY.find((x) => x.id === TEST_ID) || READY[0];
const IS_MISSION = ENTRY.type === "mission";
const { TEST, VARIANTS } = (IS_MISSION || OVERVIEW)
  ? { TEST: { id: ENTRY.id, classes: ENTRY.classes || [], max: 0 }, VARIANTS: [] }
  : await import(new URL("../" + ENTRY.path + "questions.js", location.href).href);

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app"), dlg = $("#dlg");
const fmtNum = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
const fmtTime = (ms) => ms ? new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";

const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb), auth = getAuth(fb);
const P = `results/${TEST.id}`;

let AICFG = null, aiAuto = false, aiQueue = [], aiQueued = new Set(), aiBusy = false;
let KEYS = null, RESULTS = {}, seen = new Set(), filterCls = "", search = "", openId = null, unsub = [];

onAuthStateChanged(auth, async (user) => {
  unsub.forEach((u) => u()); unsub = [];
  if (!user) return showLogin();
  $("#who").innerHTML = `${esc(user.email)} · <a href="#" id="logout" style="color:#fff">выйти</a>`;
  $("#logout").onclick = (e) => { e.preventDefault(); signOut(auth); };
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
    <th>№</th><th>Ученик</th><th>Класс</th><th>Вар.</th><th>Статус</th><th>Нарушения</th><th>Начало / сдано</th>
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
      <td>${list.length - i}</td><td><b>${esc(r.name)}</b>${dup}</td><td>${esc(r.cls)}</td><td>${r.variant}</td>
      <td>${statusTag(r)}${aiTag(r)}</td>
      <td>${r.violations ? `<span class="bad">${r.violations}</span>` : "0"}</td>
      <td>${fmtTime(r.startedAt)} / ${r.status === "submitted" ? fmtTime(r.submittedAt) : "…"}</td>
      <td>${fmtNum(g.auto)}</td>
      <td>${r.status === "submitted" ? `<b>${fmtNum(g.total)}</b> / ${g.max}` : "—"}</td>
      <td>${gradeCell}</td>
      <td><button class="btn small" data-open="${id}">${r.status === "submitted" && !g.complete ? "Проверить" : "Открыть"}</button></td></tr>`;
  }).join("");
  list.forEach(([id]) => seen.add(id));
  if (!seen.size) list.forEach(([id]) => seen.add(id));
  tb.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => showCheck(b.dataset.open));
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
      <p><b>4.</b> ${esc(k.t4.model)}</p><p><b>5.</b> ${esc(k.t5.model)}</p>
      <p><b>6.</b> ${esc(k.t6.model)}</p><p><b>7.</b> ${esc(k.t7.model)}</p><p><b>8.</b> ${esc(k.t8.model)}</p>
      <p><b>9.</b> ${Object.entries(k.t9).map(([L, n]) => `${L} — ${esc(n)}`).join(", ")}</p>
      <p><b>10.</b> ${esc(k.t10.calc)}; категория ${k.t10.cat}. ${esc(k.t10.model)}</p></div>`;
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
      if (t.chart) {
        const c = t.chart;
        question += `\nДиаграмма «${c.title}» (${c.unit}): ` + c.series.map((sr) =>
          (c.series.length > 1 ? sr.name + ": " : "") + c.labels.map((l, i) => `${l} — ${sr.data[i]}`).join("; ")).join(" | ");
      }
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
function showLinks() {
  openId = null;
  const gradeOpts = SUBJECTS.flatMap((sub) => sub.grades.map((g) =>
    `<option value="${sub.id}|${g}">${esc(sub.icon + " " + sub.name + " · " + g + " класс")}</option>`)).join("");
  dlg.innerHTML = `<div class="dlg-head"><b>📎 Материалы на стартовой странице</b>
      <button class="btn small ghost" style="background:#fff" id="lClose">Закрыть ✕</button></div>
    <div class="dlg-body">
      <p class="muted">Ссылки появятся у учеников в разделе нужного класса: презентации, задания, сайты, файлы на Google Диске.</p>
      <div class="grid2">
        <label>Класс<select id="lWhere">${gradeOpts}</select></label>
        <label>Название<input type="text" id="lTitle" placeholder="Например: Презентация «Плотность населения»"></label>
      </div>
      <label class="f">Ссылка</label><input type="text" id="lUrl" placeholder="https://…">
      <div class="err" id="lErr"></div>
      <button class="btn" id="lAdd">Добавить</button>
      <div id="lList" style="margin-top:16px"></div>
    </div>`;
  if (!dlg.open) dlg.showModal();
  $("#lClose").onclick = () => dlg.close();
  $("#lAdd").onclick = async () => {
    const [subject, grade] = $("#lWhere").value.split("|");
    const title = $("#lTitle").value.trim(), url = $("#lUrl").value.trim();
    if (!title) return ($("#lErr").textContent = "Впишите название.");
    if (!/^https?:\/\//.test(url)) return ($("#lErr").textContent = "Ссылка должна начинаться с https://");
    await push(ref(db, "settings/links"), { subject, grade, title, url, at: Date.now() });
    $("#lErr").textContent = ""; $("#lTitle").value = ""; $("#lUrl").value = "";
  };
  const off = onValue(ref(db, "settings/links"), (snap) => {
    const L = Object.entries(snap.val() || {});
    const box = $("#lList"); if (!box) return off();
    box.innerHTML = L.length ? L.map(([id, l]) => {
      const sub = SUBJECTS.find((x) => x.id === l.subject);
      return `<div class="chk-item chk-row"><span><b>${esc(l.title)}</b><br><span class="muted" style="font-size:13px">${esc((sub?.name || l.subject) + " · " + l.grade + " класс")} · ${esc(l.url)}</span></span>
        <button class="btn small red" data-del="${id}">Удалить</button></div>`;
    }).join("") : `<p class="muted">Пока нет ни одной ссылки.</p>`;
    box.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => remove(ref(db, "settings/links/" + b.dataset.del)));
  });
  dlg.addEventListener("close", off, { once: true });
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
  return { pts, max, pct, grade: mGrade(pct), pending, complete, items, partScore };
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
        <a class="btn small ghost" href="../${ENTRY.path}" target="_blank">👁 Открыть миссию</a>
        <a class="btn small ghost" href="../" target="_blank">🏠 Стартовая</a>
        <button class="btn small ghost" id="bLinks">📎 Материалы на стартовой</button>
      </div>
    </div>
    <div class="muted" id="pinInfo" style="font-size:14px;margin-top:8px"></div>
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
    <th>Итог</th><th>Оценка</th><th>Время</th><th>Как урок</th><th></th></tr></thead>
    <tbody id="tb"><tr><td colspan="${parts.length + 9}" class="muted">Ожидание учеников…</td></tr></tbody></table></div>
  <p class="muted" style="font-size:14px">${parts.some((p) => p.bonus) ? "⭐ Бонусные задания добавляют баллы сверх максимума (итог не выше 100 %). " : ""}Баллы появляются сразу после каждого задания. Оценка окончательная, когда статус «🏁 сдано».
    Шкала: ${MSCALE.map(([p, g]) => `<b>${g}</b> — от ${p}%`).join(" · ")}.</p>`;

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
  const moods = done.reduce((a, r) => { const m = moodIcon(r.mood); a[m] = (a[m] || 0) + 1; return a; }, {});
  $("#stats").innerHTML = `
    <div class="stat"><b>${all.length}</b>всего учеников</div>
    <div class="stat"><b>${all.length - done.length}</b>в пути 🚀</div>
    <div class="stat"><b>${done.length}</b>финишировали 🏁</div>
    <div class="stat"><b>${avg ? fmtNum(avg) : "—"}</b>средняя оценка</div>
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
      <td>${e.complete ? `<span class="grade">${e.grade}</span>` : `<span class="grade pending">≈${e.grade}${fin && e.pending ? " · проверить " + e.pending : ""}</span>`}</td>
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
      ...parts.map((p) => e.partScore(p) ?? ""), e.pts, e.max, e.pct, e.complete ? e.grade : "", r.minutes || "", r.mood || "",
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
  $("#hSub").textContent = "Все предметы · тесты и миссии · результаты в реальном времени";
  app.innerHTML = `<div class="card center"><p class="muted">Загружаю результаты…</p></div>`;
  const KEYSALL = {};
  for (const t of READY.filter((x) => x.type !== "mission")) {
    try { KEYSALL[t.id] = (await get(ref(db, `keys/${t.id}`))).val(); } catch (e) { /* нет прав или ключей */ }
  }
  app.innerHTML = `<div id="hubNow"></div><div id="hub"></div>
    <p class="muted" style="font-size:14px;margin-top:26px">Нажмите на карточку, чтобы открыть подробные результаты, проверку и настройки теста или миссии.</p>`;
  let SET = {}, RES = {};

  const avgOf = (t, list) => {
    const g = [];
    for (const r of list) {
      if (r.status !== "submitted") continue;
      if (t.type === "mission") { const e = mEval(r, t); if (e.complete) g.push(e.grade); }
      else if (KEYSALL[t.id]) {
        const k = KEYSALL[t.id].variants?.[String(r.variant)];
        if (!k) continue;
        const e = grade({ ...k, points: KEYSALL[t.id].points }, r.answers || {}, r.manual || {}, r.ai || {});
        if (e.complete) g.push(e.grade);
      }
    }
    return g.length ? fmtNum(g.reduce((a, b) => a + b, 0) / g.length) : "—";
  };

  function draw() {
    const c = SET.current;
    $("#hubNow").innerHTML = c ? `<div class="hub-now">
        <div><div class="l">📌 Сейчас на стартовой у учеников</div><div class="t">${esc(c.title)}</div></div>
        <div class="r"><a class="btn small" href="?test=${encodeURIComponent(c.id)}">Открыть результаты</a>
          <button class="btn small ghost" id="unpin">Убрать со стартовой</button></div></div>`
      : `<div class="hub-now"><div><div class="l">📌 Сейчас на стартовой</div>
        <div class="muted" style="margin-top:4px">Ничего не открыто. Откройте тест или миссию — они появятся у учеников в блоке «Сейчас на уроке».</div></div></div>`;
    const un = $("#unpin");
    if (un) un.onclick = async () => {
      if (!confirm("Убрать с стартовой и закрыть «" + c.title + "»? Уже начатые работы ученики смогут закончить.")) return;
      await set(ref(db, `settings/${c.id}/open`), false);
      await remove(ref(db, "settings/current"));
    };

    $("#hub").innerHTML = SUBJECTS.map((sub) => {
      const items = READY.filter((t) => t.subject === sub.id).sort((a, b) => (a.grade + (a.n || 0)).localeCompare(b.grade + (b.n || 0)));
      const soon = TESTS.filter((t) => t.subject === sub.id && !t.path).length;
      const head = `<div class="hub-subj"><span class="ic">${sub.icon}</span>${esc(sub.name)}
        <span class="muted" style="font-family:inherit;font-size:14px;font-weight:600">· ${sub.grades.join(", ")} класс</span></div>`;
      if (!items.length) return head + `<div class="hub-empty">Пока нет тестов и миссий. Пришлите материал урока — Claude подготовит задание.</div>`;
      return head + `<div class="hub-grid">${items.map((t) => {
        const list = Object.values(RES[t.id] || {});
        const run = list.filter((r) => r.status === "in_progress").length;
        const done = list.filter((r) => r.status === "submitted").length;
        const open = !!SET[t.id]?.open;
        return `<a class="hub-card" href="?test=${encodeURIComponent(t.id)}">
          <span class="live">${open ? '<span class="tag done">🟢 открыт</span>' : '<span class="tag">закрыт</span>'}</span>
          <div class="k">${esc(t.grade)} класс · ${t.type === "mission" ? "Миссия " + t.n + (t.date ? " · " + esc(t.date) : "") : "Тест"}</div>
          <div class="n">${esc(t.title)}</div>
          <div class="hub-nums"><div><b>${list.length}</b>всего</div><div><b>${run}</b>пишут</div><div><b>${done}</b>сдали</div><div><b>${avgOf(t, list)}</b>ср. оценка</div></div>
        </a>`;
      }).join("")}</div>` + (soon ? `<p class="muted" style="font-size:14px;margin:8px 2px 0">🔒 Ещё в разработке: ${soon}</p>` : "");
    }).join("");
  }
  unsub.push(onValue(ref(db, "settings"), (s) => { SET = s.val() || {}; draw(); }));
  unsub.push(onValue(ref(db, "results"), (s) => { RES = s.val() || {}; draw(); }));
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
  dlg.innerHTML = `<div class="dlg-head"><div><b>${esc(r.name)}</b> · ${esc(r.cls)} · ${e.pts} / ${e.max} б. · оценка ${e.complete ? `<b>${e.grade}</b>` : "≈" + e.grade}</div>
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
    const T = { topic: T_TOPIC[t.n], sum: its.reduce((s, i) => s + (i.score ?? 0), 0), max: t.points, good: [], bad: [], advice: T_ADVICE[t.n], ai: [] };
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
