import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, onValue, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";
import { grade, SCALE } from "./grading.js";
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
    app.innerHTML = `<div class="card center"><h2>Нет доступа к ключам</h2>
      <p>${e.message === "no-keys" ? "В базе нет ключей ответов. Импортируйте файл <b>keys.json</b> в Realtime Database (шаг 5 инструкции)."
        : "Этот аккаунт не имеет прав учителя. Проверьте, что в правилах базы (Rules) указан именно этот e-mail."}</p></div>`;
    return;
  }
  showDashboard();
});

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
  $("#bAiCfg").onclick = showAiSettings;
  $("#bAi").onclick = () => {
    if (!AICFG?.url) return showAiSettings();
    const ids = Object.entries(RESULTS).filter(([, r]) => r.status === "submitted" && aiTargets(r).length).map(([id]) => id);
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
      <div class="muted" style="font-size:14px;margin:4px 0 8px">${esc(t.title)}</div>${inner}</div>`;
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
          ${r.status === "submitted" && aiTargets(r).length ? `<button class="btn small ghost" id="dAi">🤖 Проверить ИИ</button>` : ""}
          <button class="btn small red" id="dDel">Удалить</button>
        </div>
      </div>
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
    if (r.status === "submitted" && !r.aiStatus && aiTargets(r).length) enqueueAi(id, false);
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
  if (!items.length) return;
  const data = await callAi({ subject: ENTRY.aiSubject || "география, 11 класс", items });
  const ai = { ...(r.ai || {}) };
  for (const x of data.results || []) {
    const it = items.find((i) => i.key === x.key);
    if (!it || !Number.isFinite(Number(x.score))) continue;
    const sc = Math.max(0, Math.min(it.max, Math.round(Number(x.score) * 2) / 2));
    ai[x.key] = { score: sc, comment: String(x.comment || "").slice(0, 400) };
  }
  await update(ref(db, `${P}/${id}`), { ai, aiStatus: "done", aiError: null, aiAt: Date.now() });
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
function mEval(r, entry = ENTRY) {
  const parts = entry.parts || [];
  const max = parts.reduce((a, p) => a + p.max, 0);
  const sc = r.score || {};
  const pts = parts.reduce((a, p) => a + (Number(sc[p.k]) || 0), 0);
  const pct = max ? Math.round(pts / max * 100) : 0;
  return { pts, max, pct, grade: mGrade(pct) };
}
const moodIcon = (m) => !m ? "—" : m.startsWith("Мне всё") ? "🟢" : m.startsWith("Понятно") ? "🟡" : "🔴";

function showMissionDashboard() {
  const parts = ENTRY.parts || [];
  document.title = "Учитель · Миссия " + ENTRY.n;
  const sub = $("#hSub"); if (sub) sub.textContent = "Миссия " + ENTRY.n + " · " + ENTRY.title + " · Технологическое воспитание, " + ENTRY.grade + " класс";
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
      <button class="btn small ghost" id="bCsv">Скачать CSV</button>
      <button class="btn small red" id="bClear">Очистить результаты</button>
    </div>
  </div>
  <div class="stats noprint" id="stats" style="margin-bottom:14px"></div>
  <div class="table-wrap"><table class="res"><thead><tr>
    <th>№</th><th>Ученик</th><th>Класс</th><th>Этап</th>
    ${parts.map((p) => `<th title="${esc(p.name)}">${esc(p.name)}<br><span style="font-weight:400">/${p.max}</span></th>`).join("")}
    <th>Итог</th><th>Оценка</th><th>Время</th><th>Как урок</th><th></th></tr></thead>
    <tbody id="tb"><tr><td colspan="${parts.length + 9}" class="muted">Ожидание учеников…</td></tr></tbody></table></div>
  <p class="muted" style="font-size:14px">Баллы появляются сразу после каждого задания. Оценка окончательная, когда статус «🏁 сдано».
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
  unsub.push(onValue(ref(db, P), (snap) => { RESULTS = snap.val() || {}; renderMission(); }));
}

function renderMission() {
  const parts = ENTRY.parts || [];
  const list = rows();
  const all = Object.values(RESULTS);
  const done = all.filter((r) => r.status === "submitted");
  const avg = done.length ? done.reduce((a, r) => a + mEval(r).grade, 0) / done.length : null;
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
      ${parts.map((p) => `<td>${sc[p.k] != null ? `<b>${sc[p.k]}</b>` : '<span class="muted">·</span>'}</td>`).join("")}
      <td><b>${e.pts}</b> / ${e.max}</td>
      <td>${fin ? `<span class="grade">${e.grade}</span>` : `<span class="grade pending">≈${e.grade}</span>`}</td>
      <td>${mins} мин</td>
      <td title="${esc(r.mood || "")}" style="font-size:18px">${moodIcon(r.mood)}</td>
      <td><button class="btn small red" data-del="${id}" title="Удалить">✕</button></td></tr>`;
  }).join("");
  list.forEach(([id]) => seen.add(id));
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
      ...parts.map((p) => sc[p.k] ?? ""), e.pts, e.max, e.pct, r.status === "submitted" ? e.grade : "", r.minutes || "", r.mood || "",
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
      if (t.type === "mission") g.push(mEval(r, t).grade);
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
