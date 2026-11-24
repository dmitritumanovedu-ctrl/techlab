// =====================================================================
//  TechLab · «Результаты и рейтинги» — страница учителя-администратора.
//  Класс → предмет → период → работы → ученики. Виды: журнал-таблица,
//  рейтинг с пьедесталом, диаграммы, карточка ученика, сравнение учеников.
//  «Большой экран» — для проектора: крупно, тёмный фон, можно скрыть фамилии,
//  слайд-шоу. Экспорт в Excel (CSV) и печать / PDF.
//  Данные: roster (ученики) + progress (оценки, считает engine/sync.js).
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";
import { roleOf, pendingHtml } from "../engine/staff.js?v=3";
import { SUBJECTS, addSubjects } from "../tests.js?v=9";
import { clsKey, xpOf } from "../engine/people.js?v=4";
import { syncProgress } from "../engine/sync.js?v=3";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app"), dlg = $("#dlg");
const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb), auth = getAuth(fb);

const LS = (k, d) => { try { return localStorage.getItem("rz_" + k) ?? d; } catch (e) { return d; } };
const SS = (k, v) => { try { localStorage.setItem("rz_" + k, v); } catch (e) {} };
let ROSTER = {}, PROG = {}, CSUBJ = {}, LOADED = false, SYNCMSG = "";
const ST = {
  cls: LS("cls", ""), subj: LS("subj", "all"), period: LS("period", "all"), view: LS("view", "table"), metric: LS("metric", "avg"),
  hide: LS("hide", "0") === "1", works: new Set(), sel: new Set(), onlySel: false, sort: { k: "rank", dir: 1 }, student: "", big: false, show: null,
};

// ---------------- вход ----------------
onAuthStateChanged(auth, async (user) => {
  if (!user) return showLogin();
  $("#who").innerHTML = `${esc(user.email)} · <a href="#" id="out">выйти</a>`;
  $("#out").onclick = (e) => { e.preventDefault(); signOut(auth); };
  const role = await roleOf(db, user);
  if (role === "pending") { app.innerHTML = pendingHtml(user, esc); return; }
  if (role !== "admin") {
    app.innerHTML = `<div class="rz-card rz-center"><h2>📊 Результаты и рейтинги</h2><p>Эта страница пока открыта администратору: на ней видны ученики всех классов.</p>
      <p class="muted">Результаты своих тестов вы видите в <a href="builder.html">Конструкторе</a>.</p></div>`;
    return;
  }
  await load(); render();
});
function showLogin() {
  app.innerHTML = `<div class="rz-card rz-center"><h2>📊 Результаты и рейтинги</h2><p class="muted">Войдите Google-аккаунтом администратора.</p>
    <button class="btn" id="go">Войти через Google</button><p id="err" style="color:var(--red)"></p></div>`;
  $("#go").onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { $("#err").textContent = e.code || e.message; } };
}
async function load() {
  const v = async (p) => { try { return (await get(ref(db, p))).val() || {}; } catch (e) { return {}; } };
  const [ro, pr, cs, xs] = await Promise.all([v("roster"), v("progress"), v("settings/classSubjects"), v("settings/subjects")]);
  ROSTER = ro; PROG = pr; CSUBJ = cs; addSubjects(xs); LOADED = true;
  const classes = classList();
  if (!classes.includes(ST.cls)) ST.cls = classes[0] || "";
}

// ---------------- данные ----------------
const classList = () => [...new Set(Object.values(ROSTER).map((s) => s.cls).filter(Boolean))].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b, "ru"));
const subjOf = (id) => SUBJECTS.find((s) => s.id === id);
const title = (s) => String(s || "").toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
function nameOf(code, short = false) {
  const n = title(ROSTER[code]?.name || PROG[code]?.name || code).replace(/^\d+[.)]?\s*/, "");
  const p = n.split(/\s+/);
  if (ST.hide) return p.length > 1 ? `${p.slice(1).join(" ")} ${p[0][0]}.` : n;     // «Глеб Б.» — для проектора
  return short && p.length > 1 ? `${p[0]} ${p[1][0]}.` : n;
}
const initials = (code) => { const p = nameOf(code).split(/\s+/); return (p[0]?.[0] || "") + (p[1]?.[0] || ""); };
const score10 = (w) => (w.qual ? (w.pct || 0) / 10 : (w.grade || 0));                 // ОХ/Х/У/Н → по проценту
const showMark = (w) => (w.qual ? w.qual : w.grade ? String(w.grade) : "");
const periodFrom = () => ST.period === "7" ? Date.now() - 7 * 864e5 : ST.period === "30" ? Date.now() - 30 * 864e5 : ST.period === "term" ? termStart() : 0;
// полугодие: с 1 сентября (сентябрь–декабрь) или с 1 января (январь–июнь)
function termStart() { const d = new Date(); return (d.getMonth() >= 8 ? new Date(d.getFullYear(), 8, 1) : new Date(d.getFullYear(), 0, 1)).getTime(); }
function studentSubjects(code) {
  const base = CSUBJ[clsKey(ROSTER[code]?.cls)];
  if (!base) return null;
  return new Set([...Object.keys(base), ...Object.keys(ROSTER[code]?.plus || {})]);
}

// Всё, что нужно для выбранного класса и фильтров
function model() {
  const from = periodFrom();
  let codes = Object.keys(ROSTER).filter((c) => ROSTER[c].cls === ST.cls);
  const cols = {};
  for (const c of codes) for (const [id, w] of Object.entries(PROG[c]?.works || {})) {
    if (!w || (ST.subj !== "all" && w.subject !== ST.subj) || (w.date || 0) < from) continue;
    const x = (cols[id] = cols[id] || { id, title: w.title || id, subject: w.subject, date: 0, kind: w.kindName || "" });
    x.date = Math.max(x.date, w.date || 0);
  }
  let works = Object.values(cols).sort((a, b) => a.date - b.date);
  const allWorks = works;
  if (ST.works.size) works = works.filter((w) => ST.works.has(w.id));
  if (ST.onlySel && ST.sel.size) codes = codes.filter((c) => ST.sel.has(c));
  const rows = codes.map((code) => {
    const W = PROG[code]?.works || {}, subs = studentSubjects(code);
    const cells = works.map((w) => W[w.id] || null);
    const done = cells.filter(Boolean);
    const graded = done.filter((w) => w.complete && (w.grade || w.qual));
    const due = works.filter((w, i) => cells[i] || !subs || subs.has(w.subject)).length;   // работы, которые ученик должен был сдать
    const avg = graded.length ? graded.reduce((a, w) => a + score10(w), 0) / graded.length : null;
    const pct = done.length ? done.reduce((a, w) => a + (w.pct || 0), 0) / done.length : null;
    const xp = done.reduce((a, w) => a + xpOf(w), 0);
    return { code, name: nameOf(code), cells, done: done.length, due, avg, pct, xp, viol: done.reduce((a, w) => a + (w.viol || 0), 0) };
  });
  const val = (r) => ST.metric === "pct" ? r.pct : ST.metric === "xp" ? r.xp : ST.metric === "done" ? r.done : r.avg;
  const ranked = rows.slice().sort((a, b) => (val(b) ?? -1) - (val(a) ?? -1) || b.done - a.done || a.name.localeCompare(b.name, "ru"));
  ranked.forEach((r, i) => (r.rank = val(r) == null ? null : i + 1));
  const colAvg = works.map((w, i) => { const g = rows.map((r) => r.cells[i]).filter((x) => x && x.complete && (x.grade || x.qual)); return g.length ? g.reduce((a, x) => a + score10(x), 0) / g.length : null; });
  const colDone = works.map((w, i) => rows.filter((r) => r.cells[i]).length);
  const colDue = works.map((w) => rows.filter((r) => { const s = studentSubjects(r.code); return !s || s.has(w.subject); }).length);
  return { rows, ranked, works, allWorks, colAvg, colDone, colDue, val };
}
const f1 = (x) => (x == null ? "—" : (Math.round(x * 10) / 10).toFixed(1).replace(".", ","));
const f0 = (x) => (x == null ? "—" : String(Math.round(x)));
const metricFmt = (v) => ST.metric === "pct" ? (v == null ? "—" : Math.round(v) + "%") : ST.metric === "xp" || ST.metric === "done" ? f0(v) : f1(v);
const METRICS = [["avg", "⭐ Средняя оценка"], ["pct", "％ Средний процент"], ["xp", "⚡ Опыт (XP)"], ["done", "✅ Сдано работ"]];
const VIEWS = [["table", "📋 Журнал"], ["rank", "🏆 Рейтинг"], ["charts", "📊 Диаграммы"], ["student", "👤 Ученик"], ["compare", "⚖️ Сравнить"]];
const gcls = (w) => !w ? "g0" : w.qual ? "gq" : !w.complete ? "gp" : "g" + Math.max(1, Math.min(10, Math.round(w.grade || 0)));
const shortT = (t) => { const s = String(t || "").replace(/^(Тренировочный|Итоговый|Тест|Миссия)\s*/i, ""); return s.length > 34 ? s.slice(0, 32) + "…" : s; };
const dm = (ms) => ms ? new Date(ms).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) : "";

// ---------------- отрисовка ----------------
function render() {
  if (!LOADED) return;
  const tw0 = document.querySelector(".tw"), keep = tw0 ? [tw0.scrollLeft, tw0.scrollTop] : null, wy = window.scrollY;
  render0();
  const tw1 = document.querySelector(".tw");
  if (tw1 && keep) { tw1.scrollLeft = keep[0]; tw1.scrollTop = keep[1]; }
  window.scrollTo(0, wy);
  crosshair();
}
// подсветка столбца под курсором (как в Excel) — строка подсвечивается через CSS
function crosshair() {
  const t = document.querySelector("table.jr"); if (!t) return;
  t.querySelectorAll("th[data-s]").forEach((th) => th.classList.toggle("on", /[▲▼]/.test(th.textContent)));
  let cur = -1;
  const paint = (i) => { if (i === cur) return; cur = i;
    t.querySelectorAll(".colhl").forEach((c) => c.classList.remove("colhl"));
    if (i > 1) t.querySelectorAll("tr").forEach((tr) => tr.cells[i]?.classList.add("colhl")); };
  t.onmouseover = (e) => { const c = e.target.closest("td,th"); if (c) paint(c.cellIndex); };
  t.onmouseleave = () => paint(-1);
}
function render0() {
  const M = model();
  const classes = classList();
  // предметы класса: подключённые к классу и группам + те, по которым уже есть сданные работы
  const codesC = Object.keys(ROSTER).filter((c) => ROSTER[c].cls === ST.cls);
  const withWorks = new Set(codesC.flatMap((c) => Object.values(PROG[c]?.works || {}).map((w) => w?.subject)));
  const connected = new Set([...Object.keys(CSUBJ[clsKey(ST.cls)] || {}), ...codesC.flatMap((c) => Object.keys(ROSTER[c]?.plus || {}))]);
  const subjs = SUBJECTS.filter((s) => withWorks.has(s.id) || connected.has(s.id));
  if (ST.subj !== "all" && !subjs.some((s) => s.id === ST.subj)) { ST.subj = "all"; SS("subj", "all"); return render(); }   // фильтр от другого класса
  const noWorks = ST.subj !== "all" && !withWorks.has(ST.subj);
  app.innerHTML = `
    <div class="big-h"><h1>📊 ${esc(ST.cls)} · ${esc(ST.subj === "all" ? "все предметы" : subjOf(ST.subj)?.name || "")}</h1><span class="rz-sp"></span>
      <div class="slide-dots" id="dots"></div>
      <button class="btn ghost" id="bHide2">${ST.hide ? "👁 Показать фамилии" : "🙈 Скрыть фамилии"}</button>
      <button class="btn ghost" id="bShow">${ST.show ? "⏸ Стоп" : "▶ Слайд-шоу"}</button>
      <button class="btn" id="bExit">✕ Выйти</button></div>
    <div class="rz-card rz-bar no-print">
      <div class="rz-f"><label for="fCls">Класс</label><select id="fCls">${classes.map((c) => `<option ${c === ST.cls ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
      <div class="rz-f"><label for="fSubj">Предмет</label><select id="fSubj"><option value="all">Все предметы</option>${subjs.map((s) => `<option value="${s.id}" ${s.id === ST.subj ? "selected" : ""}>${s.icon} ${esc(s.name)}${withWorks.has(s.id) ? "" : " · пока нет сданных работ"}</option>`).join("")}</select></div>
      <div class="rz-f"><label for="fPer">Период</label><select id="fPer">${[["all", "Всё время"], ["term", "Это полугодие"], ["30", "30 дней"], ["7", "7 дней"]].map(([k, l]) => `<option value="${k}" ${k === ST.period ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="rz-f"><label for="fFind">Найти ученика</label><input id="fFind" placeholder="фамилия…" autocomplete="off"></div>
      <button class="btn ghost" id="bPick">👥 Выбрать учеников${ST.sel.size ? ` (${ST.sel.size})` : ""}</button>
      ${ST.sel.size ? `<button class="btn ghost" id="bOnly">${ST.onlySel ? "👥 Показать весь класс" : "🎯 Только выбранные"}</button>` : ""}
      <span class="rz-sp"></span>
      <button class="btn ghost" id="bSync" title="Пересчитать оценки из последних сдач">⟳ Обновить</button>
      <button class="btn ghost" id="bCsv">⬇ Excel</button>
      <button class="btn ghost" id="bPrint">🖨 Печать</button>
      <button class="btn ghost" id="bHide">${ST.hide ? "👁 Фамилии" : "🙈 Скрыть фамилии"}</button>
      <button class="btn dark" id="bBig">🖥 Большой экран</button>
    </div>
    ${SYNCMSG && M.works.length ? `<p class="sub no-big" style="margin:8px 2px 0">✓ ${SYNCMSG}</p>` : ""}
    ${M.allWorks.length ? `<div class="rz-chips no-print"><span class="sub" style="align-self:center">Работы:</span>
      <button class="chip ${ST.works.size ? "" : "on"}" data-w="*">все (${M.allWorks.length})</button>
      ${M.allWorks.map((w) => `<button class="chip ${ST.works.has(w.id) ? "on" : ""}" data-w="${esc(w.id)}" title="${esc(w.title)}">${subjOf(w.subject)?.icon || ""} ${esc(shortT(w.title))} · ${dm(w.date)}</button>`).join("")}</div>` : ""}
    <div class="rz-views">${VIEWS.map(([k, l]) => `<button data-v="${k}" class="${ST.view === k ? "on" : ""}">${l}</button>`).join("")}</div>
    ${kpis(M)}
    <div id="view">${!M.rows.length ? `<div class="rz-card empty">В этом классе пока нет учеников с кодами.</div>`
      : !M.works.length && ST.view !== "student" ? `<div class="rz-card empty">${noWorks ? `По предмету «${esc(subjOf(ST.subj)?.name || "")}» у ${esc(ST.cls)} пока нет сданных работ.<br>` : "Сданных работ за выбранный период нет.<br>"}
          Если ученики уже сдавали — нажмите «⟳ Обновить»: оценки пересчитаются из последних сдач.${SYNCMSG ? `<br><b>${SYNCMSG}</b>` : ""}</div>`
      : ({ table: vTable, rank: vRank, charts: vCharts, student: vStudent, compare: vCompare })[ST.view](M)}</div>`;
  bind(M);
}

function kpis(M) {
  const graded = M.rows.filter((r) => r.avg != null);
  const avg = graded.length ? graded.reduce((a, r) => a + r.avg, 0) / graded.length : null;
  const due = M.colDue.reduce((a, b) => a + b, 0), done = M.colDone.reduce((a, b) => a + b, 0);
  const best = M.ranked[0];
  const k = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
  return `<div class="kpis">${k(M.rows.length, "учеников")}${k(M.works.length, "работ в выборке")}${k(f1(avg), "средняя оценка класса")}
    ${k(due ? Math.round(done / due * 100) + "%" : "—", "сдано из положенного")}${k(M.rows.filter((r) => r.due && r.done < r.due).length, "есть долги")}
    ${best && best.rank ? `<div class="kpi"><b style="font-size:20px">🏆 ${esc(nameOf(best.code, true))}</b><span>лидер · ${METRICS.find((m) => m[0] === ST.metric)[1].slice(2).toLowerCase()}</span></div>` : ""}</div>`;
}

// ---------- 📋 журнал ----------
function vTable(M) {
  const s = ST.sort;
  const key = (r) => s.k === "name" ? r.name : s.k === "avg" ? r.avg ?? -1 : s.k === "done" ? r.done : s.k === "xp" ? r.xp : s.k === "rank" ? (r.rank ?? 999) : (r.cells[+s.k] ? score10(r.cells[+s.k]) : -1);
  const rows = M.rows.slice().sort((a, b) => { const x = key(a), y = key(b); return (typeof x === "string" ? x.localeCompare(y, "ru") : x - y) * s.dir * (["name", "rank"].includes(s.k) ? 1 : -1); });
  // ▲ — по возрастанию, ▼ — по убыванию (оценки и средняя сначала идут от лучших — это ▼)
  const arrow = (k) => (s.k === String(k) ? ((["name", "rank"].includes(s.k) ? s.dir > 0 : s.dir < 0) ? " ▲" : " ▼") : "");
  return `<div class="tw"><table class="jr"><thead><tr><th class="no">№</th><th class="nm" data-s="name">Ученик${arrow("name")}</th>
      ${M.works.map((w, i) => `<th class="wk" data-s="${i}" title="${esc(w.title)}">${subjOf(w.subject)?.icon || ""} ${esc(shortT(w.title))}<br><span class="sub">${dm(w.date)}</span>${arrow(i)}</th>`).join("")}
      <th data-s="avg">Средняя${arrow("avg")}</th><th data-s="done">Сдано${arrow("done")}</th><th data-s="xp">XP${arrow("xp")}</th><th data-s="rank">Место${arrow("rank")}</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr class="${ST.sel.has(r.code) ? "sel" : ""}" data-code="${esc(r.code)}"><td class="no">${i + 1}</td><td class="nm"><span class="rank ${r.rank && r.rank <= 3 ? "r" + r.rank : ""}">${r.rank ?? "–"}</span>${esc(r.name)}</td>
      ${r.cells.map((w) => `<td><span class="g ${gcls(w)}" title="${w ? esc((w.total ?? "") + " из " + (w.max ?? "") + " · " + (w.pct ?? 0) + "%") : "не сдано"}">${w ? (w.complete ? showMark(w) : "…") : "—"}</span></td>`).join("")}
      <td class="avg">${f1(r.avg)}</td><td>${r.done}${r.due ? "/" + r.due : ""}</td><td>${r.xp}</td><td>${r.rank ?? "—"}</td></tr>`).join("")}
    <tr class="foot"><td class="no"></td><td class="nm"><b>Средняя по классу</b></td>${M.colAvg.map((a) => `<td><b>${f1(a)}</b></td>`).join("")}<td></td><td></td><td></td><td></td></tr>
    </tbody></table></div>
    <div class="legend no-big"><span><span class="g g9">9</span> 9–10</span><span><span class="g g7">7</span> 7–8</span><span><span class="g g5">5</span> 5–6</span><span><span class="g g3">3</span> 1–4</span>
      <span><span class="g gq">ОХ</span> квалификатив</span><span><span class="g gp">…</span> ждёт проверки</span><span><span class="g g0">—</span> не сдано</span>
      <span>· щелчок по заголовку — сортировка (по оценке, средней, фамилии, месту…); щелчок по строке — выделить ученика (вся строка подсвечивается); двойной щелчок — карточка ученика</span></div>`;
}

// ---------- 🏆 рейтинг ----------
function vRank(M) {
  const list = M.ranked.filter((r) => r.rank);
  const max = Math.max(1, ...list.map((r) => M.val(r) || 0), ST.metric === "avg" ? 10 : ST.metric === "pct" ? 100 : 1);
  const top = list.slice(0, 3);
  const pd = (r, p) => r ? `<div class="pd p${p}"><div class="av">${esc(initials(r.code))}</div><b>${esc(nameOf(r.code, true))}</b><small>${metricFmt(M.val(r))}</small><div class="st">${p}</div></div>` : "";
  return `<div class="rz-card"><div class="rz-chips no-big" style="margin:0 0 12px">${METRICS.map(([k, l]) => `<button class="chip ${ST.metric === k ? "on" : ""}" data-m="${k}">${l}</button>`).join("")}</div>
    ${top.length ? `<div class="podium">${pd(top[1], 2)}${pd(top[0], 1)}${pd(top[2], 3)}</div>` : ""}
    ${list.map((r) => `<div class="rk-row ${ST.sel.has(r.code) ? "sel" : ""}" data-code="${esc(r.code)}"><span class="rank ${r.rank <= 3 ? "r" + r.rank : ""}">${r.rank}</span><b>${esc(r.name)}</b>
      <div class="rk-bar"><i style="width:${Math.max(2, (M.val(r) || 0) / max * 100)}%"></i></div><span class="rk-v">${metricFmt(M.val(r))}</span></div>`).join("") || '<div class="empty">Пока нет оценок.</div>'}
    ${M.ranked.some((r) => !r.rank) ? `<p class="sub">Без оценок пока: ${M.ranked.filter((r) => !r.rank).map((r) => esc(nameOf(r.code, true))).join(", ")}</p>` : ""}</div>`;
}

// ---------- 📊 диаграммы (SVG без библиотек) ----------
const PAL = ["#2E4BFF", "#E07B39", "#2E8B57", "#9B59B6", "#C2453F", "#1A9CB0"];
function barChart(items, { max, fmt = f1, h = 260, colorBy, W = 640 } = {}) {
  const pad = 34, bw = Math.min(56, (W - pad - 10) / Math.max(1, items.length) - 8);
  const mx = max || Math.max(1, ...items.map((i) => i.v || 0));
  const step = (W - pad - 10) / Math.max(1, items.length);
  const T = 22;   // место сверху под подпись самого высокого столбца
  return `<svg viewBox="0 0 ${W} ${h + 46 + T}" role="img">${[0, .25, .5, .75, 1].map((t) => `<line class="axis" x1="${pad}" x2="${W}" y1="${T + h * (1 - t)}" y2="${T + h * (1 - t)}" stroke="#E6EAF3"/><text x="${pad - 6}" y="${T + 4 + h * (1 - t)}" font-size="11" text-anchor="end" fill="#8A93A6">${fmt(mx * t)}</text>`).join("")}
    ${items.map((it, i) => { const x = pad + i * step + (step - bw) / 2, bh = (it.v || 0) / mx * h, c = colorBy ? colorBy(it) : PAL[0];
      return `<rect x="${x}" y="${T + h - bh}" width="${bw}" height="${Math.max(0, bh)}" rx="6" fill="${c}"><title>${esc(it.full || it.l)}: ${fmt(it.v)}</title></rect>
        <text x="${x + bw / 2}" y="${T - 6 + h - bh}" font-size="12" font-weight="700" text-anchor="middle" fill="#1A2340">${it.v == null ? "" : fmt(it.v)}</text>
        <text x="${x + bw / 2}" y="${T + h + 18}" font-size="11" text-anchor="middle" fill="#5B6478">${esc(String(it.l).slice(0, 12))}</text>`; }).join("")}</svg>`;
}
function lineChart(labels, series, { min = 0, max = 10, h = 260 } = {}) {
  const W = 640, pad = 34, n = Math.max(1, labels.length - 1);
  const X = (i) => pad + 10 + i * (W - pad - 30) / n, Y = (v) => 10 + h - (v - min) / (max - min) * h;
  return `<svg viewBox="0 0 ${W} ${h + 70}" role="img">${[0, .25, .5, .75, 1].map((t) => `<line class="axis" x1="${pad}" x2="${W}" y1="${Y(min + (max - min) * t)}" y2="${Y(min + (max - min) * t)}" stroke="#E6EAF3"/><text x="${pad - 6}" y="${Y(min + (max - min) * t) + 4}" font-size="11" text-anchor="end" fill="#8A93A6">${f0(min + (max - min) * t)}</text>`).join("")}
    ${labels.map((l, i) => `<text x="${X(i)}" y="${h + 28}" font-size="10.5" text-anchor="middle" fill="#5B6478">${esc(String(l).slice(0, 10))}</text>`).join("")}
    ${series.map((s, k) => { const pts = s.v.map((v, i) => v == null ? null : [X(i), Y(v)]); const c = s.c || PAL[k % PAL.length];
      const segs = []; let cur = []; pts.forEach((p) => { if (p) cur.push(p); else if (cur.length && !s.join) { segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur);
      return segs.map((sg) => `<polyline points="${sg.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${c}" stroke-width="${s.w || 3}" ${s.dash ? 'stroke-dasharray="6 6"' : ""} stroke-linejoin="round" stroke-linecap="round"/>`).join("") +
        pts.map((p, i) => p ? `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="#fff" stroke="${c}" stroke-width="2.5"><title>${esc(s.name)} · ${esc(labels[i])}: ${f1(s.v[i])}</title></circle>` : "").join(""); }).join("")}
    ${series.map((s, k) => `<g transform="translate(${pad + (k % 4) * 150},${h + 46 + Math.floor(k / 4) * 18})"><rect width="14" height="4" y="5" fill="${s.c || PAL[k % PAL.length]}"/><text x="20" y="11" font-size="12" fill="#1A2340">${esc(String(s.name).slice(0, 20))}</text></g>`).join("")}</svg>`;
}
function stackBars(M) {
  const W = 640, rowH = 28, lab = 190, n = M.works.length;
  return `<svg viewBox="0 0 ${W} ${n * rowH + 30}" role="img">${M.works.map((w, i) => { const due = Math.max(1, M.colDue[i]), d = M.colDone[i], wd = (W - lab - 60) * d / due;
    return `<text x="${lab - 8}" y="${i * rowH + 19}" font-size="12" text-anchor="end" fill="#1A2340">${esc(shortT(w.title).slice(0, 26))}</text>
      <rect x="${lab}" y="${i * rowH + 6}" width="${W - lab - 60}" height="18" rx="9" fill="#FBE7E6"/><rect x="${lab}" y="${i * rowH + 6}" width="${wd}" height="18" rx="9" fill="#2E8B57"/>
      <text x="${W - 52}" y="${i * rowH + 19}" font-size="12" font-weight="700" fill="#1A2340">${d}/${M.colDue[i]}</text>`; }).join("")}
    <g transform="translate(${lab},${n * rowH + 12})"><rect width="12" height="12" fill="#2E8B57" rx="3"/><text x="18" y="10" font-size="12" fill="#5B6478">сдали</text><rect x="80" width="12" height="12" fill="#FBE7E6" rx="3"/><text x="98" y="10" font-size="12" fill="#5B6478">не сдали</text></g></svg>`;
}
const gradeColor = (v) => v == null ? "#C9D0DD" : v >= 9 ? "#2E8B57" : v >= 7 ? "#6BA539" : v >= 5 ? "#E0A23A" : "#C2453F";
function vCharts(M) {
  const hist = Array.from({ length: 10 }, (_, i) => ({ l: String(i + 1), v: 0 }));
  M.rows.forEach((r) => r.cells.forEach((w) => { if (w && w.complete && !w.qual && w.grade) hist[Math.max(0, Math.min(9, Math.round(w.grade) - 1))].v++; }));
  // рейтинг классов: средняя оценка по каждому классу (те же предмет и период)
  const from = periodFrom(), byC = {};
  for (const [code, s] of Object.entries(ROSTER)) for (const w of Object.values(PROG[code]?.works || {})) {
    if (!w?.complete || (!w.grade && !w.qual) || (ST.subj !== "all" && w.subject !== ST.subj) || (w.date || 0) < from) continue;
    (byC[s.cls] = byC[s.cls] || []).push(score10(w));
  }
  const cls = Object.entries(byC).map(([c, a]) => ({ l: c, v: a.reduce((x, y) => x + y, 0) / a.length })).sort((a, b) => b.v - a.v);
  const sel = M.rows.filter((r) => ST.sel.has(r.code)).slice(0, 5);
  return `<div class="charts">
    <div class="rz-card"><h3>📈 Средний балл по работам</h3><div class="chart-note">цвет: зелёный — 9–10, жёлтый — 5–6, красный — ниже 5</div>
      ${barChart(M.works.map((w, i) => ({ l: dm(w.date) || shortT(w.title), full: w.title, v: M.colAvg[i] })), { max: 10, colorBy: (it) => gradeColor(it.v) })}</div>
    <div class="rz-card"><h3>🎯 Распределение оценок</h3><div class="chart-note">сколько раз ставилась каждая оценка (без квалификативов)</div>
      ${barChart(hist, { fmt: f0, colorBy: (it) => gradeColor(+it.l) })}</div>
    <div class="rz-card"><h3>✅ Кто сдал работы</h3><div class="chart-note">сдали / должны были сдать</div>${stackBars(M)}</div>
    <div class="rz-card"><h3>📉 Динамика${sel.length ? " · класс и выбранные ученики" : " класса"}</h3><div class="chart-note">${sel.length ? "пунктир — средняя по классу" : "выберите учеников («👥 Выбрать»), чтобы добавить их линии"}</div>
      ${lineChart(M.works.map((w) => dm(w.date) || shortT(w.title)), [{ name: "Класс", v: M.colAvg, c: "#8A93A6", dash: sel.length > 0, w: sel.length ? 2 : 3 }].concat(sel.map((r, k) => ({ name: nameOf(r.code, true), v: r.cells.map((w) => w && w.complete ? score10(w) : null), c: PAL[k % PAL.length], join: true }))))}</div>
    <div class="rz-card" style="grid-column:1/-1"><h3>🏫 Рейтинг классов</h3><div class="chart-note">средняя оценка по каждому классу · ${esc(ST.subj === "all" ? "все предметы" : subjOf(ST.subj)?.name || "")}</div>
      ${cls.length ? barChart(cls, { max: 10, W: 1300, h: 200, colorBy: (it) => it.l === ST.cls ? "#E07B39" : "#2E4BFF" }) : '<div class="empty">Нет данных.</div>'}</div>
  </div>`;
}

// ---------- 👤 ученик ----------
function vStudent(M) {
  const code = M.rows.some((r) => r.code === ST.student) ? ST.student : (M.ranked[0]?.code || M.rows[0]?.code);
  ST.student = code;
  const r = M.rows.find((x) => x.code === code); if (!r) return "";
  const done = M.works.map((w, i) => ({ w, x: r.cells[i], avg: M.colAvg[i] }));
  const miss = done.filter((d) => !d.x && (studentSubjects(code)?.has(d.w.subject) ?? true));
  return `<div class="rz-card no-big" style="margin-bottom:12px"><div class="rz-f"><label for="fStu">Ученик</label><select id="fStu" style="min-width:280px">${M.rows.slice().sort((a, b) => a.name.localeCompare(b.name, "ru")).map((x) => `<option value="${esc(x.code)}" ${x.code === code ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div></div>
    <div class="prof"><div class="rz-card"><div class="pf-head"><div class="pf-av">${esc(initials(code))}</div><div><b style="font-size:20px">${esc(r.name)}</b><div class="sub">${esc(ST.cls)} · место в классе: ${r.rank ?? "—"} из ${M.rows.length}</div></div></div>
      <div class="pf-stat"><div><b>${f1(r.avg)}</b><span class="sub">средняя</span></div><div><b>${r.pct == null ? "—" : Math.round(r.pct) + "%"}</b><span class="sub">средний %</span></div>
        <div><b>${r.done}${r.due ? "/" + r.due : ""}</b><span class="sub">сдано работ</span></div><div><b>${r.xp}</b><span class="sub">XP</span></div></div>
      ${miss.length ? `<p style="margin:14px 0 0;color:var(--red);font-weight:700">Не сдано: ${miss.length}</p><ul class="wl">${miss.map((d) => `<li><span class="t">${esc(d.w.title)}</span><small>${dm(d.w.date)}</small></li>`).join("")}</ul>` : `<p class="sub" style="margin-top:14px">✓ Все работы сданы</p>`}</div>
      <div class="rz-card"><h3 style="margin:0">Оценки ученика и средняя по классу</h3>
        ${lineChart(M.works.map((w) => dm(w.date) || shortT(w.title)), [{ name: nameOf(code, true), v: r.cells.map((w) => w && w.complete ? score10(w) : null), c: "#2E4BFF", join: true }, { name: "Средняя по классу", v: M.colAvg, c: "#8A93A6", dash: true, w: 2 }])}
        <ul class="wl">${done.filter((d) => d.x).map((d) => `<li><span class="g ${gcls(d.x)}">${d.x.complete ? showMark(d.x) : "…"}</span><span class="t">${esc(d.w.title)}</span><small>${d.x.pct ?? 0}% · класс ${f1(d.avg)} · ${dm(d.x.date)}</small></li>`).join("")}</ul></div></div>`;
}

// ---------- ⚖️ сравнение ----------
function vCompare(M) {
  const sel = M.rows.filter((r) => ST.sel.has(r.code)).slice(0, 6);
  if (sel.length < 2) return `<div class="rz-card empty">Выберите 2–6 учеников кнопкой «👥 Выбрать учеников» (или щелчком по строке в «Журнале») — здесь появится сравнение.</div>`;
  return `<div class="charts"><div class="rz-card" style="grid-column:1/-1"><h3>⚖️ Сравнение по работам</h3>
      ${lineChart(M.works.map((w) => dm(w.date) || shortT(w.title)), sel.map((r, k) => ({ name: nameOf(r.code, true), v: r.cells.map((w) => w && w.complete ? score10(w) : null), c: PAL[k], join: true })).concat([{ name: "Класс", v: M.colAvg, c: "#8A93A6", dash: true, w: 2 }]), { h: 300 })}</div>
    <div class="rz-card"><h3>⭐ Средняя оценка</h3>${barChart(sel.map((r) => ({ l: nameOf(r.code, true), v: r.avg })), { max: 10, colorBy: (it) => PAL[sel.findIndex((r) => nameOf(r.code, true) === it.l) % PAL.length] })}</div>
    <div class="rz-card"><h3>✅ Сдано работ</h3>${barChart(sel.map((r) => ({ l: nameOf(r.code, true), v: r.done })), { fmt: f0, colorBy: (it) => PAL[sel.findIndex((r) => nameOf(r.code, true) === it.l) % PAL.length] })}</div></div>`;
}

// ---------------- действия ----------------
function bind(M) {
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  $("#fCls").onchange = (e) => { ST.cls = e.target.value; SS("cls", ST.cls); ST.works.clear(); ST.sel.clear(); ST.onlySel = false; render(); };
  $("#fSubj").onchange = (e) => { ST.subj = e.target.value; SS("subj", ST.subj); ST.works.clear(); render(); };
  $("#fPer").onchange = (e) => { ST.period = e.target.value; SS("period", ST.period); ST.works.clear(); render(); };
  $("#fFind").oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll("[data-code]").forEach((el) => { el.style.display = !q || nameOf(el.dataset.code).toLowerCase().includes(q) ? "" : "none"; });
  };
  app.querySelectorAll("[data-v]").forEach((b) => b.onclick = () => { ST.view = b.dataset.v; SS("view", ST.view); render(); });
  app.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => { ST.metric = b.dataset.m; SS("metric", ST.metric); render(); });
  app.querySelectorAll("[data-w]").forEach((b) => b.onclick = () => {
    const id = b.dataset.w;
    if (id === "*") ST.works.clear(); else ST.works.has(id) ? ST.works.delete(id) : ST.works.add(id);
    render();
  });
  app.querySelectorAll("th[data-s]").forEach((th) => th.onclick = () => {
    const k = th.dataset.s; ST.sort = { k, dir: ST.sort.k === k ? -ST.sort.dir : 1 }; render();
  });
  app.querySelectorAll("tr[data-code], .rk-row[data-code]").forEach((tr) => {
    tr.onclick = () => { const c = tr.dataset.code; ST.sel.has(c) ? ST.sel.delete(c) : ST.sel.add(c); render(); };
    tr.ondblclick = () => { ST.student = tr.dataset.code; ST.view = "student"; render(); };
  });
  if ($("#fStu")) $("#fStu").onchange = (e) => { ST.student = e.target.value; render(); };
  on("#bPick", () => pickDialog(M));
  on("#bOnly", () => { ST.onlySel = !ST.onlySel; render(); });
  on("#bHide", () => { ST.hide = !ST.hide; SS("hide", ST.hide ? "1" : "0"); render(); });
  on("#bHide2", () => { ST.hide = !ST.hide; SS("hide", ST.hide ? "1" : "0"); render(); });
  on("#bPrint", () => window.print());
  on("#bCsv", () => exportCsv(M));
  on("#bBig", enterBig); on("#bExit", exitBig);
  on("#bShow", () => { ST.show ? stopShow() : startShow(); render(); });
  on("#bSync", async () => {
    const b = $("#bSync"); b.disabled = true; b.textContent = "⏳ Пересчитываю…";
    try {
      const r = await syncProgress(db); await load();
      SYNCMSG = `Обновлено: найдено ${r.matched} сданных работ` + (r.unmatched ? ` · ${r.unmatched} работ не удалось привязать к ученику (имя или класс в работе не совпали с кодом — проверьте в «Ученики и родители»)` : "");
    } catch (e) { alert("Не удалось: " + (e.code || e.message)); }
    render();
  });
  const dots = $("#dots"); if (dots && ST.show) dots.innerHTML = SHOW.map((v) => `<i class="${v === ST.view ? "on" : ""}"></i>`).join("");
}

function pickDialog(M) {
  dlg.innerHTML = `<div class="hd"><b>👥 Выбрать учеников · ${esc(ST.cls)}</b><button class="btn small ghost" data-x>Закрыть ✕</button></div>
    <div class="bd"><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="pQ" placeholder="Поиск по фамилии" style="flex:1;font:inherit;padding:9px 11px;border:1.5px solid var(--line);border-radius:10px">
      <button class="btn small ghost" id="pAll">Все</button><button class="btn small ghost" id="pNone">Никого</button>
      <button class="btn small ghost" id="pTop">Топ-5</button><button class="btn small ghost" id="pLow">Нужна помощь</button></div>
    <div class="pick">${M.rows.slice().sort((a, b) => a.name.localeCompare(b.name, "ru")).map((r) => `<label data-n="${esc(r.name.toLowerCase())}"><input type="checkbox" value="${esc(r.code)}" ${ST.sel.has(r.code) ? "checked" : ""}> ${esc(r.name)} <span class="sub">${f1(r.avg)}</span></label>`).join("")}</div>
    <p class="sub">Выбранные подсвечиваются оранжевым в журнале и рейтинге, появляются на графиках «Динамика» и в «Сравнить». «Нужна помощь» — 5 учеников с самой низкой средней.</p>
    <div style="display:flex;gap:8px"><button class="btn" id="pOk">Готово</button><button class="btn ghost" id="pOnly">🎯 Показать только их</button></div></div>`;
  if (!dlg.open) dlg.showModal();
  const boxes = () => [...dlg.querySelectorAll(".pick input")];
  dlg.querySelector("[data-x]").onclick = () => dlg.close();
  $("#pQ").oninput = (e) => { const q = e.target.value.toLowerCase(); dlg.querySelectorAll(".pick label").forEach((l) => (l.style.display = l.dataset.n.includes(q) ? "" : "none")); };
  $("#pAll").onclick = () => boxes().forEach((b) => (b.checked = true));
  $("#pNone").onclick = () => boxes().forEach((b) => (b.checked = false));
  const setCodes = (codes) => boxes().forEach((b) => (b.checked = codes.includes(b.value)));
  $("#pTop").onclick = () => setCodes(M.rows.filter((r) => r.avg != null).sort((a, b) => b.avg - a.avg).slice(0, 5).map((r) => r.code));
  $("#pLow").onclick = () => setCodes(M.rows.filter((r) => r.avg != null).sort((a, b) => a.avg - b.avg).slice(0, 5).map((r) => r.code));
  const apply = (only) => { ST.sel = new Set(boxes().filter((b) => b.checked).map((b) => b.value)); ST.onlySel = only && ST.sel.size > 0; dlg.close(); render(); };
  $("#pOk").onclick = () => apply(false); $("#pOnly").onclick = () => apply(true);
}

function exportCsv(M) {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const head = ["Место", "Ученик"].concat(M.works.map((w) => `${w.title} (${dm(w.date)})`), ["Средняя", "Сдано", "XP"]);
  const lines = [head.map(q).join(";")].concat(M.ranked.map((r) => [r.rank ?? "", r.name].concat(r.cells.map((w) => w ? (w.complete ? showMark(w) : "на проверке") : ""), [f1(r.avg), `${r.done}/${r.due}`, r.xp]).map(q).join(";")));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `Результаты_${ST.cls.replace(/[^\p{L}\d]+/gu, "_")}_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------- большой экран и слайд-шоу ----------------
const SHOW = ["rank", "charts", "table"];
let showTimer = null;
function enterBig() { ST.big = true; document.body.classList.add("big"); document.documentElement.requestFullscreen?.().catch(() => {}); render(); }
function exitBig() { ST.big = false; stopShow(); document.body.classList.remove("big"); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); render(); }
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && ST.big) exitBig(); });
function startShow() { ST.show = true; let i = Math.max(0, SHOW.indexOf(ST.view)); showTimer = setInterval(() => { i = (i + 1) % SHOW.length; ST.view = SHOW[i]; render(); }, 12000); }
function stopShow() { ST.show = null; clearInterval(showTimer); showTimer = null; }
document.addEventListener("keydown", (e) => {
  if (!ST.big || e.target.closest?.("input,select,textarea")) return;
  const vs = VIEWS.map((v) => v[0]); const i = vs.indexOf(ST.view);
  if (e.key === "ArrowRight") { ST.view = vs[(i + 1) % vs.length]; render(); }
  if (e.key === "ArrowLeft") { ST.view = vs[(i - 1 + vs.length) % vs.length]; render(); }
});
