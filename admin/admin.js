// =====================================================================
//  TechLab · страница администратора (владельца платформы)
//  Заявки учителей, права, личный доступ к тестам, посещаемость,
//  последние действия, отзывы, предметы и блок учителей на стартовой.
//  Открывается только администратору (почта в engine/staff.js и в правилах базы).
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, onValue, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";
import { roleOf, PERMS, permOf, acceptStaff, declineStaff, removeStaff, setPerm, logAction } from "../engine/staff.js?v=3";
import { SUBJECTS, TESTS, addSubjects, BUILTIN_SUBJECTS } from "../tests.js?v=9";
import { clsKey } from "../engine/people.js?v=4";
import { startNotify } from "../engine/notify.js?v=2";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app"), dlg = $("#dlg");
const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb), auth = getAuth(fb);
let USER = null, unsub = [];
const D = { staff: {}, req: {}, shares: {}, roster: {}, results: {}, settings: {}, builder: {}, pubIndex: {}, feedback: {}, log: {}, visits: {}, sreq: {} };
// разделы-страницы учителя, открытые прямо внутри панели (iframe)
const FRAMES = { lessons: "../teacher/?embed=1", students: "../teacher/students.html", results: "../teacher/results.html", builder: "../teacher/builder.html", mysubj: "../teacher/my.html" };
const SECTIONS = ["lessons", "students", "results", "builder", "mysubj", "activity", "overview", "requests", "teachers", "share", "subjects", "classes", "visits", "feed", "security", "feedback", "site"];
const curSec = () => { const h = location.hash.slice(1).split("/")[0]; return SECTIONS.includes(h) ? h : "overview"; };
addEventListener("hashchange", () => { if (USER) { render(); scrollTo(0, 0); } });
let feedFilter = "all", fbFilter = "new";

// ---------- время ----------
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lastDays = (n) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (n - 1 - i)); return d; });
function ago(ms) {
  if (!ms) return "—";
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "только что";
  if (s < 3600) return Math.floor(s / 60) + " мин назад";
  if (s < 86400) return Math.floor(s / 3600) + " ч назад";
  if (s < 7 * 86400) return Math.floor(s / 86400) + " дн назад";
  return new Date(ms).toLocaleDateString("ru-RU");
}
const fmtDT = (ms) => ms ? new Date(ms).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const subjName = (id) => SUBJECTS.find((s) => s.id === id)?.name || id;
const subjIcon = (id) => SUBJECTS.find((s) => s.id === id)?.icon || "📘";

// =====================================================================
//  Вход
// =====================================================================
onAuthStateChanged(auth, async (user) => {
  unsub.forEach((u) => u()); unsub = []; USER = user;
  if (!user) return showLogin();
  $("#adWho").innerHTML = `${esc(user.email)} · <a href="#" id="out">выйти</a>`;
  $("#out").onclick = (e) => { e.preventDefault(); signOut(auth); };
  const role = await roleOf(db, user);
  if (role !== "admin") {
    $("#adNav").hidden = true;
    app.innerHTML = `<div class="ad-card ad-center"><h2>🔒 Только для администратора</h2>
      <p>Эта страница открывается только владельцу платформы TechLab.</p>
      <p class="muted">Вы учитель? Ваш кабинет — <a href="../teacher/builder.html">Конструктор тестов</a>.</p></div>`;
    return;
  }
  $("#adNav").hidden = false;
  app.innerHTML = `<div class="ad-card ad-center"><p class="muted">Загружаю данные платформы…</p></div>`;
  await loadAll();
  live();
  if (!location.hash) history.replaceState(null, "", "#lessons");    // по умолчанию — уроки и тесты
  render();
  startNotify(db, user, "admin", { base: "../" });
});

function showLogin() {
  $("#adWho").textContent = "Вход только для администратора";
  $("#adNav").hidden = true;
  app.innerHTML = `<div class="ad-card ad-center"><h2>🛡 Вход администратора</h2>
    <p class="muted">Войдите Google-аккаунтом владельца платформы.</p><p class="bad-t" id="err"></p>
    <button class="btn" id="go">Войти через Google</button></div>`;
  $("#go").onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { $("#err").textContent = e.code || e.message; } };
}

const val = async (path, q) => { try { return (await get(q || ref(db, path))).val() || {}; } catch (e) { console.warn(path, e.code || e); return {}; } };
async function loadAll() {
  const days = lastDays(14).map(dayKey);
  const [roster, results, settings, builder, pubIndex, shares, log, ...vis] = await Promise.all([
    val("roster"), val("results"), val("settings"), val("builder"), val("pubIndex"), val("staffShares"),
    val("log", query(ref(db, "log"), limitToLast(300))),
    ...days.map((d) => val(`stats/visits/${d}`))]);
  Object.assign(D, { roster, results, settings, builder, pubIndex, shares, log });
  addSubjects(settings.subjects);
  D.visits = Object.fromEntries(days.map((d, i) => [d, vis[i]]));
}
function live() {
  const on = (path, k, q) => unsub.push(onValue(q || ref(db, path), (s) => { D[k] = s.val() || {}; render(); }, (e) => console.warn(path, e.code)));
  on("log", "log", query(ref(db, "log"), limitToLast(300)));
  on("staff", "staff"); on("staffRequests", "req"); on("feedback", "feedback"); on("staffShares", "shares"); on("subjectRequests", "sreq");
}

// =====================================================================
//  Отрисовка
// =====================================================================
function render() {
  const nReq = Object.keys(D.req).length, nFb = Object.values(D.feedback).filter((x) => !x.read).length;
  const nS = Object.values(D.sreq).reduce((a, x) => a + Object.values(x || {}).filter((r) => r && !r.done).length, 0);
  $("#nReq").textContent = nReq || ""; $("#nFb").textContent = nFb || ""; $("#nSubj").textContent = nS || "";
  const sec = curSec();
  document.querySelectorAll("#adNav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + sec));
  // страница учителя внутри панели: не перерисовываем, чтобы рамка не перезагружалась при каждом обновлении данных
  if (FRAMES[sec]) {
    // #builder/e/<id> — сразу открыть тест в редакторе конструктора
    const sub = location.hash.slice(1).split("/").slice(1).join("/");
    const src = FRAMES[sec] + (sub ? "#/" + sub : "");
    const cur = app.querySelector("iframe.ad-frame");
    if (cur && cur.dataset.sec === sec) { if (sub && cur.dataset.sub !== sub) { cur.dataset.sub = sub; cur.src = src; } return; }
    app.innerHTML = `<iframe class="ad-frame" data-sec="${sec}" data-sub="${esc(sub)}" src="${src}" title="${sec}"></iframe>`;
    return;
  }
  const F = { activity: secActivity, overview: secOverview, requests: secRequests, teachers: secTeachers, share: secShare, subjects: secSubjects, classes: secClasses,
    visits: secVisits, feed: secFeed, security: secSecurity, feedback: secFeedback, site: secSite };
  app.innerHTML = F[sec]().replace('class="ad-sec"', 'class="ad-sec on"') +
    `<div class="foot-note">© ${Math.max(2026, new Date().getFullYear())} TechLab · All rights reserved · Ⓐ Туманов Дмитрий</div>`;
  bind();
}

// ---------- сводные данные ----------
function allWorks() {
  const titles = Object.fromEntries(TESTS.map((t) => [t.id, t.title]));
  for (const [id, x] of Object.entries(D.pubIndex)) titles[id] = x.title;
  const out = [];
  for (const [tid, list] of Object.entries(D.results)) {
    for (const [rid, r] of Object.entries(list || {})) {
      if (!r || typeof r !== "object") continue;
      out.push({ tid, rid, title: titles[tid] || tid, name: r.name, cls: r.cls, status: r.status, at: r.submittedAt || r.updatedAt || r.startedAt || 0, start: r.startedAt || 0,
        reason: r.reason, viol: r.violations || 0, empty: r.status === "submitted" && !Object.keys(r.answers || {}).length && !r.score && !r.open });
    }
  }
  return out;
}

function secOverview() {
  const W = allWorks(), today = new Date(); today.setHours(0, 0, 0, 0);
  const week = Date.now() - 7 * 864e5;
  const sub = W.filter((w) => w.status === "submitted");
  const staff = Object.values(D.staff);
  const classes = new Set(Object.values(D.roster).map((s) => s.cls).filter(Boolean));
  const vToday = Object.keys(D.visits[dayKey(new Date())] || {}).length;
  const writing = W.filter((w) => w.status === "in_progress" && Date.now() - w.start < 2 * 3600e3).length;
  const emptyW = sub.filter((w) => w.empty && w.at > week).length;
  const k = (ic, n, l, s = "", warn = false) => `<div class="kpi${warn ? " warn" : ""}" data-ic="${ic}"><b>${n}</b><span>${l}</span>${s ? `<small>${s}</small>` : ""}</div>`;
  return `<section class="ad-sec" id="overview"><div class="ad-h"><h2>📊 Обзор платформы</h2><span class="sp"></span>
      <button class="btn ghost small" data-act="reload">⟳ Обновить данные</button></div>
    <div class="ad-grid">
      ${k("👩‍🏫", staff.length + 1, "учителей", `вы + ${staff.length} коллег`)}
      ${k("🆕", Object.keys(D.req).length, "заявок ждут", "", Object.keys(D.req).length > 0)}
      ${k("🧒", Object.keys(D.roster).length, "учеников с кодами", `${classes.size} классов`)}
      ${k("👀", vToday, "заходили сегодня", "ученики со своим кодом")}
      ${k("✍️", writing, "пишут сейчас", "работы в процессе")}
      ${k("✅", sub.filter((w) => w.at >= today.getTime()).length, "сдано сегодня", `за 7 дней: ${sub.filter((w) => w.at > week).length}`)}
      ${k("🧩", Object.keys(D.builder).length, "тестов в Конструкторе", `опубликовано: ${Object.keys(D.pubIndex).length}`)}
      ${k("✉️", Object.values(D.feedback).filter((x) => !x.read).length, "новых отзывов", `всего: ${Object.keys(D.feedback).length}`)}
      ${k("⚠️", emptyW, "пустых сдач за неделю", "сдано без единого ответа — проверьте", emptyW > 0)}
    </div>
    <div class="two" style="margin-top:14px">
      <div class="ad-card"><div class="ad-h" style="margin:0 0 6px"><b>🕑 Последние действия</b><span class="sp"></span><a href="#feed">журнал →</a></div>
        <ul class="feed">${feedItems().slice(0, 8).map((x) => `<li><span class="ic">${x.ic}</span><span>${x.t}</span><span class="tm">${ago(x.at)}</span></li>`).join("") || '<div class="empty">Пока пусто.</div>'}</ul></div>
      <div class="ad-card"><div class="ad-h" style="margin:0 0 6px"><b>🆕 Ждут решения</b></div>
        ${Object.values(D.req).map((x) => `<div class="req"><div class="who"><b>${esc(x.name || x.email)}</b><div class="sub">${esc(x.subject || "заявка учителя")} · ${ago(x.at)}</div></div><a class="btn small" href="#requests">Открыть</a></div>`).join("")}
        ${Object.values(D.sreq).flatMap((x) => Object.values(x || {})).filter((r) => r && !r.done).map((r) => `<div class="req"><div class="who"><b>📚 ${esc(r.name)}</b><div class="sub">новый предмет · ${esc(r.by || "")}</div></div><a class="btn small" href="#subjects">Открыть</a></div>`).join("")}
        ${Object.values(D.feedback).filter((x) => !x.read).slice(0, 3).map((x) => `<div class="req"><div class="who"><b>✉️ ${esc(x.name)}</b><div class="sub">${esc(String(x.text || "").slice(0, 70))}</div></div><a class="btn small ghost" href="#feedback">Прочитать</a></div>`).join("")}
        ${!Object.keys(D.req).length && !Object.values(D.feedback).some((x) => !x.read) ? '<div class="empty">Всё разобрано ✓</div>' : ""}</div>
    </div>
    <div style="margin-top:14px">${visitsChart()}</div></section>`;
}

// ---------- заявки ----------
function permBoxes(prefix, perm = {}) {
  return PERMS.map((p) => `<label class="tg${perm[p.id] !== false ? " on" : ""}" title="${esc(p.note)}"><input type="checkbox" data-${prefix}="${p.id}" ${perm[p.id] !== false ? "checked" : ""}>${esc(p.name)}</label>`).join("");
}
function subjBoxes(prefix, sel = []) {
  return SUBJECTS.map((s) => `<label class="tg${sel.includes(s.id) ? " on" : ""}"><input type="checkbox" data-${prefix}="${s.id}" ${sel.includes(s.id) ? "checked" : ""}>${s.icon} ${esc(s.name)}</label>`).join("");
}
function secRequests() {
  const R = Object.entries(D.req).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  const link = new URL("../teacher/builder.html", location.href).href;
  return `<section class="ad-sec" id="requests"><div class="ad-h"><h2>🆕 Заявки учителей</h2><span class="sp"></span>
      <button class="btn ghost small" data-act="copylink" data-link="${esc(link)}">📋 Ссылка для нового учителя</button></div>
    <div class="ad-card">
      ${R.length ? R.map(([uid, x]) => `<div class="req" data-req="${esc(uid)}">
        <div class="who"><b>${esc(x.name || x.email)}</b><div class="sub">${esc(x.email)} · заявка ${ago(x.at)}</div>
          ${x.subject || x.school ? `<div class="note">📚 ${esc(x.subject || "предмет не указан")}${x.school ? " · 🏫 " + esc(x.school) : ""}</div>` : ""}
          <div style="margin-top:10px"><div class="sub" style="margin-bottom:4px">Права при приёме:</div>${permBoxes("rp", {})}</div>
          <div style="margin-top:8px"><div class="sub" style="margin-bottom:4px">Предметы учителя:</div>${subjBoxes("rs", [])}</div></div>
        <div style="display:flex;gap:8px"><button class="btn green" data-acc="${esc(uid)}">✓ Принять</button><button class="btn red small" data-dec="${esc(uid)}">Отклонить</button></div>
      </div>`).join("") : `<div class="empty">Новых заявок нет. Чтобы подключить учителя, отправьте ему ссылку <span class="mono">${esc(link)}</span> — пусть войдёт через Google, и заявка появится здесь.</div>`}
    </div></section>`;
}

// ---------- учителя ----------
function secTeachers() {
  const S = Object.entries(D.staff).sort((a, b) => (b[1].seen || b[1].at || 0) - (a[1].seen || a[1].at || 0));
  const owned = (uid) => Object.values(D.builder).filter((t) => t.owner === uid).length;
  const T = D.settings.teachers || {};
  return `<section class="ad-sec" id="teachers"><div class="ad-h"><h2>👩‍🏫 Учителя и права</h2><span class="sp"></span>
      <span class="sub">Права сохраняются сразу при нажатии.</span></div>
    <div class="ad-card tw">${S.length ? `<table class="ad-t"><thead><tr><th>Учитель</th><th>Предметы</th><th>Что разрешено</th><th>Активность</th><th></th></tr></thead><tbody>
      ${S.map(([uid, x]) => { const adm = x.role === "admin";
        return `<tr><td><b>${esc(x.name || x.email)}</b> ${adm ? '<span class="chip adm">админ</span>' : ""}<div class="sub">${esc(x.email)}</div>
            ${x.subjectNote ? `<div class="sub">📚 ${esc(x.subjectNote)}</div>` : ""}</td>
          <td>${(x.subjects || []).map((s) => `<span class="chip">${subjIcon(s)} ${esc(subjName(s))}</span>`).join("") || '<span class="sub">не выбраны</span>'}
            <div><button class="btn ghost small" data-subj="${esc(uid)}" style="margin-top:6px">✎ Предметы</button></div></td>
          <td>${adm ? '<span class="chip ok">всё разрешено</span>' : PERMS.map((p) => `<label class="tg${permOf(x, p.id) ? " on" : ""}" title="${esc(p.note)}"><input type="checkbox" data-perm="${esc(uid)}" data-p="${p.id}" ${permOf(x, p.id) ? "checked" : ""}>${esc(p.name)}</label>`).join("")}
            <div style="margin-top:6px"><label class="tg${T[uid]?.show ? " on" : ""}" title="Имя и предметы учителя появятся внизу стартовой страницы"><input type="checkbox" data-show="${esc(uid)}" ${T[uid]?.show ? "checked" : ""}>🏠 На стартовой</label></div></td>
          <td><div>был(а): <b>${ago(x.seen)}</b></div><div class="sub">тестов: ${owned(uid)} · личный доступ: ${Object.keys(D.shares[uid] || {}).length}</div><div class="sub">принят(а): ${x.at ? new Date(x.at).toLocaleDateString("ru-RU") : "—"}</div></td>
          <td style="white-space:nowrap"><button class="btn ghost small" data-share="${esc(uid)}">📤 Дать тесты</button><br>
            <button class="btn ghost small" data-adm="${esc(uid)}" style="margin-top:6px">${adm ? "Снять админа" : "Сделать админом"}</button><br>
            <button class="btn red small" data-rm="${esc(uid)}" style="margin-top:6px">Закрыть доступ</button></td></tr>`; }).join("")}
    </tbody></table>` : '<div class="empty">Коллег пока нет — примите заявку выше.</div>'}</div></section>`;
}

// ---------- посещаемость ----------
function visitsChart() {
  const days = lastDays(14), keys = days.map(dayKey);
  const per = keys.map((k) => Object.keys(D.visits[k] || {}).length);
  const max = Math.max(1, ...per);
  return `<div class="ad-card"><b>📈 Учеников на сайте по дням · 14 дней</b><div class="bars">${days.map((d, i) => `<div class="bar${d.getDay() === 0 || d.getDay() === 6 ? " we" : ""}" title="${d.toLocaleDateString("ru-RU")}: ${per[i]}"><b>${per[i] || ""}</b><i style="height:${Math.round(per[i] / max * 100)}%"></i></div>`).join("")}</div>
    <div class="bar-l">${days.map((d) => `<span>${pad(d.getDate())}.${pad(d.getMonth() + 1)}</span>`).join("")}</div></div>`;
}
function secVisits() {
  const days = lastDays(14), keys = days.map(dayKey);
  const per = keys.map((k) => Object.keys(D.visits[k] || {}).length);
  const max = Math.max(1, ...per);
  const bars = days.map((d, i) => { const we = d.getDay() === 0 || d.getDay() === 6;
    return `<div class="bar${we ? " we" : ""}" title="${d.toLocaleDateString("ru-RU")}: ${per[i]} уч."><b>${per[i] || ""}</b><i style="height:${Math.round(per[i] / max * 100)}%"></i></div>`; }).join("");
  const labels = days.map((d) => `<span>${pad(d.getDate())}.${pad(d.getMonth() + 1)}</span>`).join("");
  // по классам: сколько учеников заходили за 7 дней из всех с кодами
  const week = new Set(keys.slice(-7).flatMap((k) => Object.keys(D.visits[k] || {})));
  const byCls = {};
  for (const [code, s] of Object.entries(D.roster)) {
    const c = s.cls || "—"; const x = (byCls[c] = byCls[c] || { cls: c, all: 0, act: 0, works: 0 });
    x.all++; if (week.has(code)) x.act++;
  }
  const wk = Date.now() - 7 * 864e5;
  for (const w of allWorks()) if (w.status === "submitted" && w.at > wk) { const c = Object.keys(byCls).find((k) => clsKey(k) === clsKey(w.cls)); if (c) byCls[c].works++; }
  const rows = Object.values(byCls).map((x) => ({ ...x, pct: x.all ? Math.round(x.act / x.all * 100) : 0 })).sort((a, b) => b.pct - a.pct || b.works - a.works);
  // самые активные ученики: дней на сайте за 14 дней
  const cnt = {};
  for (const k of keys) for (const code of Object.keys(D.visits[k] || {})) cnt[code] = (cnt[code] || 0) + 1;
  const top = Object.entries(cnt).filter(([c]) => D.roster[c]).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return `<section class="ad-sec" id="visits"><div class="ad-h"><h2>📈 Посещаемость</h2><span class="sp"></span>
      <span class="sub">Считаются ученики, которые вошли на сайт своим кодом (один раз в день).</span></div>
    <div class="ad-card" style="margin-bottom:14px"><b>Учеников на сайте по дням · последние 14 дней</b>
      <div class="bars">${bars}</div><div class="bar-l">${labels}</div></div>
    <div class="two">
      <div class="ad-card tw"><b>🏆 Рейтинг посещаемости классов · 7 дней</b>
        ${rows.length ? `<table class="ad-t" style="margin-top:8px"><thead><tr><th>#</th><th>Класс</th><th>Заходили</th><th></th><th>Сдано работ</th></tr></thead><tbody>
        ${rows.map((x, i) => `<tr><td><span class="place p${i + 1}">${i + 1}</span></td><td><b>${esc(x.cls)}</b></td><td>${x.act} из ${x.all}</td>
          <td style="width:40%"><div class="meter"><i style="width:${x.pct}%"></i></div><span class="sub">${x.pct}%</span></td><td>${x.works}</td></tr>`).join("")}</tbody></table>`
          : '<div class="empty">Нет учеников с кодами.</div>'}</div>
      <div class="ad-card"><b>⭐ Самые активные ученики · 14 дней</b>
        ${top.length ? `<table class="ad-t" style="margin-top:8px"><tbody>${top.map(([c, n], i) => `<tr><td><span class="place p${i + 1}">${i + 1}</span></td><td><b>${esc(D.roster[c].name)}</b><div class="sub">${esc(D.roster[c].cls)}</div></td><td>${n} ${n === 1 ? "день" : n < 5 ? "дня" : "дней"}</td></tr>`).join("")}</tbody></table>`
          : '<div class="empty">Данные появятся, когда ученики начнут заходить со своими кодами.</div>'}</div>
    </div></section>`;
}

// ---------- последние действия ----------
function feedItems() {
  const out = [];
  for (const w of allWorks()) {
    if (w.status === "submitted") out.push({ k: "work", at: w.at, ic: w.empty ? "⚠️" : w.reason && w.reason !== "manual" ? "⏰" : "✅",
      t: `<b>${esc(w.name)}</b> · ${esc(w.cls || "")} сдал(а) «${esc(w.title)}»${w.empty ? ' <span class="bad-t">— без ответов!</span>' : ""}${w.reason && w.reason !== "manual" ? ` <span class="sub">(${esc({ timeout: "время вышло", tab: "автосдача: вкладка", blur: "автосдача: окно", close: "закрыл страницу", teacher: "завершил учитель" }[w.reason] || w.reason)})</span>` : ""}` });
    else if (w.status === "in_progress" && Date.now() - w.start < 3 * 3600e3) out.push({ k: "work", at: w.start, ic: "✍️", t: `<b>${esc(w.name)}</b> · ${esc(w.cls || "")} начал(а) «${esc(w.title)}»` });
  }
  for (const [, x] of Object.entries(D.req)) out.push({ k: "staff", at: x.at, ic: "🆕", t: `Заявка учителя <b>${esc(x.name || x.email)}</b> ${esc(x.subject || "")}` });
  for (const [, x] of Object.entries(D.staff)) { if (x.at) out.push({ k: "staff", at: x.at, ic: "🤝", t: `Принят(а) учитель <b>${esc(x.name || x.email)}</b>` });
    if (x.seen) out.push({ k: "staff", at: x.seen, ic: "👩‍🏫", t: `<b>${esc(x.name || x.email)}</b> заходил(а) в кабинет` }); }
  for (const [, x] of Object.entries(D.feedback)) out.push({ k: "fb", at: x.at, ic: "✉️", t: `Отзыв от <b>${esc(x.name)}</b>: ${esc(String(x.text || "").slice(0, 90))}${String(x.text || "").length > 90 ? "…" : ""}` });
  for (const [, x] of Object.entries(D.log)) out.push({ k: "log", at: x.at, ic: x.kind === "test" ? "🧩" : "🛡", t: `${esc(x.text)} <span class="sub">— ${esc(x.by)}</span>` });
  return out.filter((x) => x.at).sort((a, b) => b.at - a.at);
}
function secFeed() {
  const F = feedItems().filter((x) => feedFilter === "all" || x.k === feedFilter).slice(0, 60);
  const fl = [["all", "Все"], ["work", "Работы учеников"], ["staff", "Учителя"], ["log", "Действия в панели"], ["fb", "Отзывы"]];
  return `<section class="ad-sec" id="feed"><div class="ad-h"><h2>🕑 Последние действия</h2><span class="sp"></span>
      <div class="fil">${fl.map(([k, l]) => `<button data-ff="${k}" class="${feedFilter === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
    <div class="ad-card">${F.length ? `<ul class="feed">${F.map((x) => `<li><span class="ic">${x.ic}</span><span>${x.t}</span><span class="tm" title="${fmtDT(x.at)}">${ago(x.at)}</span></li>`).join("")}</ul>` : '<div class="empty">Пока пусто.</div>'}</div></section>`;
}

// ---------- отзывы ----------
function secFeedback() {
  const all = Object.entries(D.feedback).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  const L = all.filter(([, x]) => fbFilter === "all" || !x.read);
  const who = { parent: "родитель", student: "ученик", teacher: "учитель", other: "другое" };
  return `<section class="ad-sec" id="feedback"><div class="ad-h"><h2>✉️ Отзывы и обратная связь</h2><span class="sp"></span>
      <div class="fil"><button data-fbf="new" class="${fbFilter === "new" ? "on" : ""}">Новые</button><button data-fbf="all" class="${fbFilter === "all" ? "on" : ""}">Все (${all.length})</button></div></div>
    ${L.length ? L.map(([id, x]) => `<div class="fb${x.read ? "" : " new"}">
      <div class="hd"><b>${esc(x.name)}</b><span class="chip">${esc(who[x.who] || x.who || "")}</span>${x.email ? `<a href="mailto:${esc(x.email)}?subject=${encodeURIComponent("TechLab: ответ на ваш отзыв")}">${esc(x.email)}</a>` : '<span class="sub">без e-mail</span>'}
        <span class="sub">${fmtDT(x.at)}${x.page ? " · " + esc(x.page) : ""}${x.code && D.roster[x.code] ? ` · код ученика: ${esc(D.roster[x.code].name)}, ${esc(D.roster[x.code].cls)}` : ""}</span></div>
      <div class="tx">${esc(x.text)}</div>
      <div class="act">${x.email ? `<a class="btn small" href="mailto:${esc(x.email)}?subject=${encodeURIComponent("TechLab: ответ на ваш отзыв")}&body=${encodeURIComponent("Здравствуйте, " + (x.name || "") + "!\n\n")}">↩ Ответить</a>` : ""}
        <button class="btn ghost small" data-fbr="${esc(id)}">${x.read ? "Отметить как новое" : "✓ Прочитано"}</button>
        <button class="btn red small" data-fbd="${esc(id)}">Удалить</button></div></div>`).join("")
      : `<div class="ad-card empty">${fbFilter === "new" ? "Новых отзывов нет." : "Отзывов пока нет. Форма «Напишите нам» — внизу стартовой страницы."}</div>`}
  </section>`;
}

// ---------- предметы и стартовая ----------
function secSite() {
  const T = D.settings.teachers || {};
  return `<section class="ad-sec" id="site"><div class="ad-h"><h2>⚙️ Настройки сайта</h2></div>
    <div class="two"><div class="ad-card"><b>👩‍🏫 Учителя внизу стартовой страницы</b><p class="sub" style="margin:4px 0 8px">Имя и предметы учителя в блоке «Учителя TechLab».</p>
      ${Object.entries(D.staff).map(([uid, x]) => `<div class="req"><div class="who"><b>${esc(x.name || x.email)}</b><div class="sub">${esc((x.subjects || []).map(subjName).join(", ") || "предметы не выбраны")}</div></div>
        <label class="tg${T[uid]?.show ? " on" : ""}"><input type="checkbox" data-show="${esc(uid)}" ${T[uid]?.show ? "checked" : ""}>🏠 На стартовой</label></div>`).join("") || '<div class="empty">Коллег пока нет.</div>'}</div>
    <div class="ad-card"><b>Как устроена стартовая</b><ul style="padding-left:18px;line-height:1.6;margin:8px 0">
      <li>Гость видит три входа: ученик (код), родитель (код P), учитель (Google).</li>
      <li>Кнопка «📚 Предметы» — список всех предметов; ученик и родитель после входа видят только свои.</li>
      <li>Справа — дата, «Факт дня» и «В этот день».</li>
      <li>Внизу — форма «Напишите нам» (приходит в «Отзывы») и ссылка «вы учитель? присоединяйтесь».</li></ul></div></div></section>`;
}

// ---------- 👀 активность коллег: что делают учителя на платформе ----------
function secActivity() {
  const S = Object.entries(D.staff).sort((a, b) => (b[1].seen || 0) - (a[1].seen || 0));
  const CT = D.settings.classTeachers || {};
  const resCount = (id) => Object.values(D.results[id] || {}).filter((r) => r && r.status === "submitted").length;
  const card = ([uid, x]) => {
    const tests = Object.entries(D.builder).filter(([, t]) => t && t.owner === uid).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
    const pub = tests.filter(([id]) => D.pubIndex[id]).length, open = tests.filter(([id]) => D.settings[id]?.open).length;
    const subm = tests.reduce((a, [id]) => a + resCount(id), 0);
    const cls = []; for (const [c, subs] of Object.entries(CT)) for (const [sid, t] of Object.entries(subs || {})) if (t?.[uid]) cls.push(`${c} · ${subjName(sid)}`);
    const acts = Object.values(D.log).filter((l) => l && l.by && l.by === x.email).sort((a, b) => b.at - a.at).slice(0, 8);
    const online = x.seen && Date.now() - x.seen < 10 * 60000;
    return `<div class="ad-card act-card"><div class="act-h"><span class="act-av${online ? " on" : ""}">${esc((x.name || x.email || "?")[0].toUpperCase())}</span>
        <div><b>${esc(x.name || x.email)}</b> ${x.role === "admin" ? '<span class="chip adm">админ</span>' : ""}<div class="sub">${esc(x.email)} · ${online ? '<span class="ok-t">сейчас на сайте</span>' : "был(а) " + ago(x.seen)}</div></div></div>
      <div class="act-k"><div><b>${tests.length}</b><span>тестов</span></div><div><b>${pub}</b><span>опубликовано</span></div><div><b>${open}</b><span>открыто ученикам</span></div><div><b>${subm}</b><span>сдач учеников</span></div></div>
      <div class="sub" style="margin:10px 0 4px"><b>Классы:</b> ${cls.length ? esc(cls.join(" · ")) : "не подключены"}</div>
      ${tests.length ? `<div class="sub" style="margin:8px 0 4px"><b>Тесты:</b></div>${tests.slice(0, 6).map(([id, t]) => `<div class="act-t"><span>🧩 ${esc(t.title || id)} <span class="sub">· ${esc(subjName(t.subject))}, ${esc(t.grade || "")} кл. · изменён ${ago(t.updatedAt)}</span></span>
          <span class="act-tags">${D.pubIndex[id] ? '<span class="chip ok">опубликован</span>' : '<span class="chip">черновик</span>'}${D.settings[id]?.open ? '<span class="chip ok">открыт</span>' : ""}${resCount(id) ? `<span class="chip">${resCount(id)} сдач</span>` : ""}
          ${D.pubIndex[id] ? `<a class="btn small ghost" href="../b/?t=${esc(id)}&preview=1" target="_blank" rel="noopener">👁 Посмотреть</a>` : ""}<a class="btn small ghost" href="#builder/e/${esc(id)}">✏️ Изменить</a></span></div>`).join("")}${tests.length > 6 ? `<div class="sub">…и ещё ${tests.length - 6}</div>` : ""}` : '<div class="sub" style="margin-top:8px">Тестов пока не создавал(а).</div>'}
      <div class="sub" style="margin:10px 0 4px"><b>Последние действия:</b></div>
      ${acts.length ? `<ul class="feed">${acts.map((l) => `<li><span class="ic">${l.kind === "test" ? "🧩" : "🛡"}</span><span>${esc(l.text)}</span><span class="tm">${ago(l.at)}</span></li>`).join("")}</ul>` : '<div class="sub">Пока нет записей.</div>'}
    </div>`;
  };
  const online = S.filter(([, x]) => x.seen && Date.now() - x.seen < 10 * 60000).length;
  return `<section class="ad-sec" id="activity"><div class="ad-h"><h2>👀 Активность коллег</h2><span class="sp"></span>
      <span class="sub">Сейчас на сайте: ${online} · всего коллег: ${S.length}</span><button class="btn ghost small" data-act="reload">⟳ Обновить</button></div>
    <p class="sub" style="margin:-4px 0 12px">Что создают и публикуют учителя, какие классы подключили, сколько учеников сдали их тесты. Записи появляются в журнале автоматически, когда коллега что-то делает.</p>
    ${S.length ? `<div class="act-grid">${S.map(card).join("")}</div>` : '<div class="ad-card empty">Коллег пока нет.</div>'}</section>`;
}

// ---------- 📤 поделиться: выбранным коллегам — тесты и материалы по предметам ----------
const SH = { to: new Set(), subj: "all", pick: new Set(), q: "", msg: "" };
function shareItems() {
  const tests = Object.entries(D.builder).filter(([, t]) => t && (!t.owner || t.owner === USER.uid || D.staff[t.owner]?.role === "admin"))
    .map(([id, t]) => ({ id, kind: "test", title: t.title || id, subject: t.subject || "", grade: t.grade || "", ic: "🧩", note: `тест из Конструктора · ${(t.items || []).length || "?"} вопр.` }));
  const mats = Object.entries(D.settings.links || {}).map(([id, l]) => ({ id: "m_" + id, kind: "material", title: l.title, subject: l.subject, grade: l.grade, url: l.url, file: l.file || null,
    ic: l.file ? "📁" : "🔗", note: l.file ? `файл · ${l.file.name}` : "ссылка" }));
  return tests.concat(mats);
}
function secShare() {
  const S = Object.entries(D.staff);
  const all = shareItems();
  const L = all.filter((x) => (SH.subj === "all" || x.subject === SH.subj) && (!SH.q || x.title.toLowerCase().includes(SH.q)));
  const subjects = [...new Set(all.map((x) => x.subject).filter(Boolean))];
  const opened = (uid) => Object.entries(D.shares[uid] || {}).filter(([, x]) => x && typeof x === "object");
  return `<section class="ad-sec" id="share"><div class="ad-h"><h2>📤 Поделиться с коллегами</h2><span class="sp"></span><span class="sub">Коллеги видят только то, что вы открыли. Ваших учеников и оценки — нет.</span></div>
    ${!S.length ? '<div class="ad-card empty">Коллег пока нет. Когда учитель подаст заявку и вы её примете, здесь можно будет открыть ему тесты и материалы.</div>' : `
    <div class="ad-card"><b>1. Кому</b><div class="sh-row">${S.map(([uid, x]) => `<label class="tg${SH.to.has(uid) ? " on" : ""}"><input type="checkbox" data-shto="${esc(uid)}" ${SH.to.has(uid) ? "checked" : ""}>${esc(x.name || x.email)}${(x.subjects || Object.keys(x.subj || {})).length ? ` <span class="sub">· ${esc([...new Set([...(x.subjects || []), ...Object.keys(x.subj || {})])].map(subjName).join(", "))}</span>` : ""}</label>`).join("")}
      <button class="btn ghost small" data-shall>Всем коллегам</button></div></div>
    <div class="ad-card" style="margin-top:12px"><div class="ad-h" style="margin:0 0 8px"><b>2. Что открыть</b><span class="sp"></span>
      <input id="shQ" placeholder="поиск по названию" value="${esc(SH.q)}" style="max-width:240px"></div>
      <div class="fil" style="margin-bottom:10px"><button data-shs="all" class="${SH.subj === "all" ? "on" : ""}">Все предметы</button>${subjects.map((sid) => `<button data-shs="${esc(sid)}" class="${SH.subj === sid ? "on" : ""}">${subjIcon(sid)} ${esc(subjName(sid))}</button>`).join("")}</div>
      ${L.length ? `<div style="display:flex;gap:8px;margin-bottom:6px"><button class="btn ghost small" data-shpickall>☑ Отметить всё ${SH.subj === "all" ? "" : "по предмету"} (${L.length})</button><button class="btn ghost small" data-shpicknone>Снять</button></div>
        <div class="sh-list">${L.map((x) => `<label class="ck"><input type="checkbox" data-shit="${esc(x.id)}" ${SH.pick.has(x.id) ? "checked" : ""}><span>${x.ic} <b>${esc(x.title)}</b> <span class="sub">· ${esc(subjName(x.subject))}${x.grade ? ", " + esc(x.grade) + " кл." : ""} · ${esc(x.note)}</span>
          ${SH.to.size && [...SH.to].every((u) => D.shares[u]?.[x.id]) ? ' <span class="chip ok">✓ уже открыто</span>' : ""}</span></label>`).join("")}</div>`
        : '<div class="empty">Здесь появятся ваши тесты из Конструктора и материалы со стартовой («📎 Материалы» в Центре управления).</div>'}
    </div>
    <div class="ad-card" style="margin-top:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><b>3.</b>
      <button class="btn green" data-shgo ${SH.to.size && SH.pick.size ? "" : "disabled"}>${!SH.to.size ? "📤 Выберите, кому открыть (шаг 1)" : !SH.pick.size ? "📤 Отметьте, что открыть (шаг 2)" : `📤 Открыть доступ: ${SH.pick.size} шт. → ${SH.to.size === 1 ? "1 коллеге" : SH.to.size + " коллегам"}`}</button>
      <span class="sub">Коллега сразу получит уведомление 🔔 и увидит это в «📚 Мои предметы → Мне открыли».</span><span class="ok-t">${esc(SH.msg)}</span></div>
    <div class="ad-card tw" style="margin-top:12px"><b>Что уже открыто</b><table class="ad-t" style="margin-top:8px"><thead><tr><th>Коллега</th><th>Открыто</th></tr></thead><tbody>
      ${S.map(([uid, x]) => `<tr><td><b>${esc(x.name || x.email)}</b><div class="sub">${opened(uid).length} шт.</div></td><td>${opened(uid).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).map(([id, it]) => `<span class="chip">${it.kind === "material" ? (it.file ? "📁" : "🔗") : "🧩"} ${esc(it.title || id)} <button class="btn small ghost" style="padding:0 6px;margin-left:4px" title="Закрыть доступ" data-shrm="${esc(uid)}|${esc(id)}">✕</button></span>`).join("") || '<span class="sub">ничего</span>'}</td></tr>`).join("")}
    </tbody></table></div>`}</section>`;
}

// ---------- предметы: заявки на новые, кто какой предмет ведёт ----------
let SJEDIT = "";       // какой предмет сейчас редактируется
function secSubjects() {
  const X = D.settings.subjects || {}, CT = D.settings.classTeachers || {};
  const reqs = Object.entries(D.sreq).flatMap(([uid, x]) => Object.entries(x || {}).filter(([, r]) => r && !r.done).map(([id, r]) => ({ uid, id, ...r })));
  const who = (sid) => { const m = {}; for (const [c, subs] of Object.entries(CT)) for (const [u, t] of Object.entries(subs?.[sid] || {})) (m[t?.name || u] = m[t?.name || u] || []).push(c); return m; };
  return `<section class="ad-sec" id="subjects"><div class="ad-h"><h2>📚 Предметы</h2></div>
    ${reqs.length ? `<div class="ad-card" style="margin-bottom:14px"><b>🆕 Новые предметы на одобрение</b>${reqs.map((r) => `<div class="req"><div class="who"><b>${esc(r.icon || "📘")} ${esc(r.name)}</b>
      <div class="sub">классы: ${esc([].concat(r.grades || []).join(", "))} · предложил(а) ${esc(r.by || r.email || "")} · ${ago(r.at)}</div></div>
      <div style="display:flex;gap:8px"><button class="btn green" data-sok="${esc(r.uid)}|${esc(r.id)}">✓ Добавить на сайт</button><button class="btn red small" data-sno="${esc(r.uid)}|${esc(r.id)}">Отклонить</button></div></div>`).join("")}</div>` : ""}
    <div class="ad-card tw"><b>Предметы сайта и учителя</b>
      <table class="ad-t" style="margin-top:8px"><thead><tr><th>Предмет</th><th>Классы сайта</th><th>Кто ведёт · подключённые классы</th><th></th></tr></thead><tbody>
      ${SUBJECTS.map((sj) => { const w = who(sj.id); return `<tr><td><b>${sj.icon} ${esc(sj.name)}</b>${X[sj.id] ? (BUILTIN_SUBJECTS.includes(sj.id) ? ' <span class="chip">изменён</span>' : ' <span class="chip">добавлен вами</span>') : ""}</td><td>${esc(sj.grades.join(", "))}</td>
        <td>${Object.entries(w).map(([n, cl]) => `<div><b>${esc(n)}</b> · <span class="sub">${esc(cl.join(", "))}</span></div>`).join("") || '<span class="sub">никто не подключил классы</span>'}</td>
        <td style="white-space:nowrap"><button class="btn ghost small" data-sje="${esc(sj.id)}">✏️ Изменить</button>
          ${X[sj.id] ? (BUILTIN_SUBJECTS.includes(sj.id) ? `<button class="btn ghost small" data-sjd="${esc(sj.id)}" title="Вернуть исходное название и классы">↺ Сбросить</button>` : `<button class="btn red small" data-sjd="${esc(sj.id)}">Убрать</button>`) : ""}</td></tr>
        ${SJEDIT === sj.id ? `<tr><td colspan="4"><div class="form-row" style="margin:0">
          <div><label for="seName">Название</label><input id="seName" maxlength="40" value="${esc(sj.name)}"></div>
          <div><label for="seIcon">Значок</label><input id="seIcon" maxlength="4" value="${esc(sj.icon)}"></div>
          <div><label for="seColor">Цвет</label><input id="seColor" type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(sj.color) ? sj.color : "#2E4BFF")}"></div>
          <div><label for="seGrades">Классы</label><input id="seGrades" value="${esc(sj.grades.join(", "))}"></div>
          <button class="btn green" data-act="savesubj">💾 Сохранить</button><button class="btn ghost" data-act="cancelsubj">Отмена</button></div></td></tr>` : ""}`; }).join("")}</tbody></table>
      <div class="form-row">
        <div><label for="sjName">Новый предмет</label><input id="sjName" maxlength="40" placeholder="Например: История"></div>
        <div><label for="sjIcon">Значок</label><input id="sjIcon" maxlength="4" value="📘"></div>
        <div><label for="sjColor">Цвет</label><input id="sjColor" type="color" value="#2E4BFF"></div>
        <div><label for="sjGrades">Классы</label><input id="sjGrades" placeholder="5, 6, 7"></div>
        <button class="btn" data-act="addsubj">＋ Добавить</button>
      </div><p class="bad-t" id="sjErr" style="margin:6px 0 0"></p>
      <p class="sub" style="margin-top:8px">Учитель сам выбирает свои предметы и подключает классы на странице «📚 Мои предметы». Ученики и родители видят только подключённые предметы.</p></div></section>`;
}
// ---------- классы: сколько учеников, какие предметы и кто ведёт ----------
function secClasses() {
  const byCls = {};
  for (const s of Object.values(D.roster)) { const c = s.cls || "—"; byCls[c] = (byCls[c] || 0) + 1; }
  const CS = D.settings.classSubjects || {}, CT = D.settings.classTeachers || {};
  const all = [...new Set(Object.keys(byCls).concat(Object.keys(CS)))].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));
  const groups = (c) => { const m = {}; for (const s of Object.values(D.roster)) if (s.cls === c) for (const k of Object.keys(s.plus || {})) m[k] = (m[k] || 0) + 1; return m; };
  return `<section class="ad-sec" id="classes"><div class="ad-h"><h2>🏫 Классы и ученики</h2><span class="sp"></span><a class="btn" href="../teacher/students.html">👥 Ученики и коды →</a></div>
    <div class="ad-card tw"><table class="ad-t"><thead><tr><th>Класс</th><th>Учеников с кодами</th><th>Предметы класса · учитель</th><th>Группы (часть класса)</th></tr></thead><tbody>
    ${all.map((c) => `<tr><td><b>${esc(c)}</b></td><td>${byCls[c] || 0}</td>
      <td>${Object.keys(CS[c] || {}).map((sid) => `<span class="chip">${subjIcon(sid)} ${esc(subjName(sid))}${Object.values(CT[c]?.[sid] || {}).map((t) => " · " + esc(t?.name || "")).join("")}</span>`).join("") || '<span class="sub">все предметы (не настроено)</span>'}</td>
      <td>${Object.entries(groups(c)).map(([sid, n]) => `<span class="chip ok">${subjIcon(sid)} ${esc(subjName(sid))}: ${n} уч.</span>`).join("") || '<span class="sub">—</span>'}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">Пока нет классов.</td></tr>'}
    </tbody></table><p class="sub" style="margin-top:8px">Группы (технология у половины класса и т.п.) отмечаются в «Ученики и родители», столбец «+ предмет».</p></div></section>`;
}
// ---------- безопасность ----------
function secSecurity() {
  const S = Object.entries(D.staff).sort((a, b) => (b[1].seen || 0) - (a[1].seen || 0));
  return `<section class="ad-sec" id="security"><div class="ad-h"><h2>🔐 Безопасность</h2></div>
    <div class="ad-card tw"><b>Учителя и входы</b><table class="ad-t" style="margin-top:8px"><thead><tr><th>Учитель</th><th>Роль</th><th>Последний вход</th><th>Принят(а)</th><th></th></tr></thead><tbody>
    <tr><td><b>${esc(USER.displayName || USER.email)}</b><div class="sub">${esc(USER.email)}</div></td><td><span class="chip adm">владелец</span></td><td>сейчас</td><td>—</td><td></td></tr>
    ${S.map(([uid, x]) => `<tr><td><b>${esc(x.name || x.email)}</b><div class="sub">${esc(x.email)}</div></td><td>${x.role === "admin" ? '<span class="chip adm">админ</span>' : '<span class="chip">учитель</span>'}</td>
      <td>${ago(x.seen)}</td><td>${x.at ? new Date(x.at).toLocaleDateString("ru-RU") : "—"}</td><td><button class="btn red small" data-rm="${esc(uid)}">Закрыть доступ</button></td></tr>`).join("")}</tbody></table></div>
    <div class="ad-card" style="margin-top:14px"><b>Двухэтапная защита (код из приложения на телефоне)</b>
      <p class="sub" style="margin-top:6px">Следующий этап: вход через Google + 6-значный код. Включается отдельным обновлением — для неё нужен небольшой серверный модуль (Google Apps Script), который проверяет код. Ученики и родители по-прежнему входят по коду с карточки.</p></div></section>`;
}

// =====================================================================
//  Действия
// =====================================================================
const checked = (root, attr) => [...root.querySelectorAll(`[data-${attr}]`)].filter((i) => i.checked).map((i) => i.dataset[attr]);
function bind() {
  app.querySelectorAll(".tg input").forEach((i) => i.addEventListener("change", () => i.closest(".tg").classList.toggle("on", i.checked)));
  app.querySelector('[data-act="reload"]')?.addEventListener("click", async (e) => { e.target.disabled = true; await loadAll(); render(); });
  app.querySelector('[data-act="copylink"]')?.addEventListener("click", (e) => { navigator.clipboard?.writeText(e.target.dataset.link); e.target.textContent = "✓ Ссылка скопирована"; });
  // заявки
  app.querySelectorAll("[data-acc]").forEach((b) => b.onclick = async () => {
    const uid = b.dataset.acc, box = b.closest(".req"), r = D.req[uid];
    const perm = Object.fromEntries(PERMS.map((p) => [p.id, !!box.querySelector(`[data-rp="${p.id}"]`)?.checked]));
    const subjects = checked(box, "rs");
    b.disabled = true;
    try { await acceptStaff(db, uid, r, { perm, subjects: subjects.length ? subjects : null }); logAction(db, USER, `Принят учитель ${r.name || r.email}`, "staff"); }
    catch (e) { alert("Не удалось: " + (e.code || e.message)); b.disabled = false; }
  });
  app.querySelectorAll("[data-dec]").forEach((b) => b.onclick = async () => {
    const r = D.req[b.dataset.dec]; if (!confirm(`Отклонить заявку ${r?.email}?`)) return;
    await declineStaff(db, b.dataset.dec).catch((e) => alert(e.message)); logAction(db, USER, `Отклонена заявка ${r?.email}`, "staff");
  });
  // права
  app.querySelectorAll("[data-perm]").forEach((i) => i.onchange = async () => {
    const x = D.staff[i.dataset.perm];
    try { await setPerm(db, i.dataset.perm, i.dataset.p, i.checked); logAction(db, USER, `${x?.name || x?.email}: ${PERMS.find((p) => p.id === i.dataset.p)?.name} — ${i.checked ? "разрешено" : "запрещено"}`, "staff"); }
    catch (e) { alert("Не удалось сохранить: " + (e.code || e.message)); i.checked = !i.checked; }
  });
  app.querySelectorAll("[data-show]").forEach((i) => i.onchange = async () => {
    const uid = i.dataset.show, x = D.staff[uid];
    const path = `settings/teachers/${uid}`;
    try {
      if (i.checked) await set(ref(db, path), { name: shortName(x.name || x.email), subjects: x.subjects || [], show: true });
      else await remove(ref(db, path));
      D.settings.teachers = { ...(D.settings.teachers || {}) }; if (i.checked) D.settings.teachers[uid] = { show: true }; else delete D.settings.teachers[uid];
    } catch (e) { alert(e.code || e.message); }
  });
  app.querySelectorAll("[data-subj]").forEach((b) => b.onclick = () => subjDialog(b.dataset.subj));
  app.querySelectorAll("[data-share]").forEach((b) => b.onclick = () => shareDialog(b.dataset.share));
  app.querySelectorAll("[data-adm]").forEach((b) => b.onclick = async () => {
    const uid = b.dataset.adm, x = D.staff[uid], to = x.role === "admin" ? "colleague" : "admin";
    if (!confirm(to === "admin" ? `Сделать ${x.email} администратором? Он увидит всё: учеников, результаты, эту страницу.` : `Снять права администратора с ${x.email}?`)) return;
    await set(ref(db, `staff/${uid}/role`), to).catch((e) => alert(e.message)); logAction(db, USER, `${x.email}: роль — ${to === "admin" ? "администратор" : "учитель"}`, "staff");
  });
  app.querySelectorAll("[data-rm]").forEach((b) => b.onclick = async () => {
    const uid = b.dataset.rm, x = D.staff[uid];
    if (!confirm(`Закрыть доступ учителю ${x.email}? Его тесты останутся в базе.`)) return;
    await removeStaff(db, uid).catch((e) => alert(e.message));
    remove(ref(db, `staffShares/${uid}`)).catch(() => {}); remove(ref(db, `settings/teachers/${uid}`)).catch(() => {});
    logAction(db, USER, `Закрыт доступ учителю ${x.email}`, "staff");
  });
  // поделиться
  app.querySelectorAll("[data-shto]").forEach((i) => i.onchange = () => { i.checked ? SH.to.add(i.dataset.shto) : SH.to.delete(i.dataset.shto); SH.msg = ""; render(); });
  app.querySelector("[data-shall]")?.addEventListener("click", () => { Object.keys(D.staff).forEach((u) => SH.to.add(u)); render(); });
  app.querySelectorAll("[data-shs]").forEach((b) => b.onclick = () => { SH.subj = b.dataset.shs; render(); });
  app.querySelectorAll("[data-shit]").forEach((i) => i.onchange = () => { i.checked ? SH.pick.add(i.dataset.shit) : SH.pick.delete(i.dataset.shit); SH.msg = ""; render(); });
  app.querySelector("[data-shpickall]")?.addEventListener("click", () => { app.querySelectorAll("[data-shit]").forEach((i) => SH.pick.add(i.dataset.shit)); render(); });
  app.querySelector("[data-shpicknone]")?.addEventListener("click", () => { SH.pick.clear(); render(); });
  const shq = app.querySelector("#shQ"); if (shq) shq.onchange = () => { SH.q = shq.value.trim().toLowerCase(); render(); };
  app.querySelector("[data-shgo]")?.addEventListener("click", async (e) => {
    const items = shareItems().filter((x) => SH.pick.has(x.id)), by = shortName(USER.displayName || USER.email), upd = {};
    for (const uid of SH.to) for (const x of items) {
      upd[`staffShares/${uid}/${x.id}`] = x.kind === "test" ? { kind: "test", title: x.title, subject: x.subject, grade: x.grade, at: Date.now(), by }
        : { kind: "material", title: x.title, subject: x.subject || "", grade: x.grade || "", url: x.url, file: x.file, at: Date.now(), by };
    }
    e.target.disabled = true;
    try {
      await update(ref(db), upd);
      logAction(db, USER, `Открыт доступ: ${items.length} шт. для ${[...SH.to].map((u) => D.staff[u]?.name || D.staff[u]?.email).join(", ")}`, "staff");
      SH.msg = `✓ Открыто: ${items.length} × ${SH.to.size}`; SH.pick.clear(); render();
    } catch (err) { alert("Не удалось: " + (err.code || err.message)); e.target.disabled = false; }
  });
  app.querySelectorAll("[data-shrm]").forEach((b) => b.onclick = async () => {
    const [uid, id] = b.dataset.shrm.split("|");
    await remove(ref(db, `staffShares/${uid}/${id}`)).catch((e) => alert(e.message));
    logAction(db, USER, `Закрыт доступ «${D.shares[uid]?.[id]?.title || id}» для ${D.staff[uid]?.email}`, "staff");
  });
  // лента и отзывы
  app.querySelectorAll("[data-ff]").forEach((b) => b.onclick = () => { feedFilter = b.dataset.ff; render(); });
  app.querySelectorAll("[data-fbf]").forEach((b) => b.onclick = () => { fbFilter = b.dataset.fbf; render(); });
  app.querySelectorAll("[data-fbr]").forEach((b) => b.onclick = () => { const id = b.dataset.fbr; set(ref(db, `feedback/${id}/read`), !D.feedback[id]?.read).catch((e) => alert(e.message)); });
  app.querySelectorAll("[data-fbd]").forEach((b) => b.onclick = () => { if (confirm("Удалить отзыв?")) remove(ref(db, `feedback/${b.dataset.fbd}`)).catch((e) => alert(e.message)); });
  // предметы
  app.querySelector('[data-act="addsubj"]')?.addEventListener("click", addSubject);
  app.querySelectorAll("[data-sje]").forEach((b) => b.onclick = () => { SJEDIT = SJEDIT === b.dataset.sje ? "" : b.dataset.sje; render(); });
  app.querySelector('[data-act="cancelsubj"]')?.addEventListener("click", () => { SJEDIT = ""; render(); });
  app.querySelector('[data-act="savesubj"]')?.addEventListener("click", async (e) => {
    const id = SJEDIT, name = $("#seName").value.trim(), icon = $("#seIcon").value.trim() || "📘", color = $("#seColor").value;
    const grades = $("#seGrades").value.split(/[ ,;]+/).map((x) => x.trim()).filter((x) => /^\d{1,2}$/.test(x));
    if (name.length < 2 || !grades.length) return alert("Нужны название и хотя бы один класс цифрами (например: 5, 6).");
    e.target.disabled = true;
    const rec = { ...(D.settings.subjects?.[id] || {}), name, icon, color, grades, at: Date.now() };
    try { await set(ref(db, `settings/subjects/${id}`), rec); } catch (er) { e.target.disabled = false; return alert("Не удалось: " + (er.code || er.message)); }
    D.settings.subjects = { ...(D.settings.subjects || {}), [id]: rec }; addSubjects({ [id]: rec });
    try { localStorage.setItem("techlab_xsubj", JSON.stringify(D.settings.subjects)); } catch (er) {}
    logAction(db, USER, `Изменён предмет «${name}» (классы: ${grades.join(", ")})`);
    SJEDIT = ""; render();
  });
  app.querySelectorAll("[data-sok]").forEach((b) => b.onclick = async () => {
    const [uid, id] = b.dataset.sok.split("|"), r = D.sreq[uid]?.[id]; if (!r) return;
    const sid = "s" + Date.now().toString(36);
    b.disabled = true;
    try {
      await update(ref(db), { [`settings/subjects/${sid}`]: { name: r.name, icon: r.icon || "📘", color: "#2E4BFF", grades: r.grades || [], at: Date.now() },
        [`staff/${uid}/subj/${sid}`]: true, [`subjectRequests/${uid}/${id}`]: null });
      D.settings.subjects = { ...(D.settings.subjects || {}), [sid]: { name: r.name, icon: r.icon, grades: r.grades } };
      SUBJECTS.push({ id: sid, name: r.name, icon: r.icon || "📘", color: "#2E4BFF", grades: r.grades || [], extra: true });
      logAction(db, USER, `Одобрен новый предмет «${r.name}» (${r.by || ""})`, "staff");
    } catch (e) { alert("Не удалось: " + (e.code || e.message)); b.disabled = false; }
  });
  app.querySelectorAll("[data-sno]").forEach((b) => b.onclick = async () => {
    const [uid, id] = b.dataset.sno.split("|"), r = D.sreq[uid]?.[id];
    if (!confirm(`Отклонить предмет «${r?.name}»?`)) return;
    await remove(ref(db, `subjectRequests/${uid}/${id}`)).catch((e) => alert(e.message));
    logAction(db, USER, `Отклонён предмет «${r?.name}»`, "staff");
  });
  app.querySelectorAll("[data-sjd]").forEach((b) => b.onclick = async () => {
    const s = D.settings.subjects?.[b.dataset.sjd]; if (!confirm(BUILTIN_SUBJECTS.includes(b.dataset.sjd) ? `Вернуть предмету «${s?.name}» исходное название и классы?` : `Убрать предмет «${s?.name}» с сайта? Тесты в Конструкторе останутся.`)) return;
    await remove(ref(db, `settings/subjects/${b.dataset.sjd}`)).catch((e) => alert(e.message));
    delete D.settings.subjects[b.dataset.sjd]; logAction(db, USER, `${BUILTIN_SUBJECTS.includes(b.dataset.sjd) ? "Сброшены изменения предмета" : "Убран предмет"} «${s?.name}»`);
    try { localStorage.setItem("techlab_xsubj", JSON.stringify(D.settings.subjects)); } catch (e) {}
    if (BUILTIN_SUBJECTS.includes(b.dataset.sjd)) return location.reload();     // исходное название вернётся после перезагрузки
    const i = SUBJECTS.findIndex((x) => x.id === b.dataset.sjd); if (i >= 0) SUBJECTS.splice(i, 1);
    render();
  });
}
const shortName = (n) => { const p = String(n || "").trim().split(/\s+/); return p.length >= 2 ? `${p[0]} ${p[1][0]}.` : p[0] || ""; };

async function addSubject() {
  const name = $("#sjName").value.trim(), icon = $("#sjIcon").value.trim() || "📘", color = $("#sjColor").value;
  const grades = $("#sjGrades").value.split(/[ ,;]+/).map((x) => x.trim()).filter((x) => /^\d{1,2}$/.test(x));
  if (name.length < 2) return ($("#sjErr").textContent = "Введите название предмета.");
  if (!grades.length) return ($("#sjErr").textContent = "Укажите классы цифрами, например: 5, 6, 7.");
  if (SUBJECTS.some((s) => s.name.toLowerCase() === name.toLowerCase())) return ($("#sjErr").textContent = "Такой предмет уже есть.");
  const id = "s" + Date.now().toString(36);
  try {
    await set(ref(db, `settings/subjects/${id}`), { name, icon, color, grades, at: Date.now() });
    D.settings.subjects = { ...(D.settings.subjects || {}), [id]: { name, icon, color, grades } };
    SUBJECTS.push({ id, name, icon, color, grades, extra: true });
    try { localStorage.setItem("techlab_xsubj", JSON.stringify(D.settings.subjects)); } catch (e) {}
    logAction(db, USER, `Добавлен предмет «${name}» (${grades.join(", ")} кл.)`);
    render();
  } catch (e) { $("#sjErr").textContent = "Не удалось: " + (e.code || e.message); }
}

// ---------- диалоги ----------
function openDlg(title, body) {
  dlg.innerHTML = `<div class="hd"><b>${title}</b><button class="btn small ghost" data-x>Закрыть ✕</button></div><div class="bd">${body}</div>`;
  dlg.querySelector("[data-x]").onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
}
function subjDialog(uid) {
  const x = D.staff[uid];
  openDlg(`📚 Предметы · ${esc(x.name || x.email)}`, `<p class="sub">Предметы, которые ведёт учитель. Видны в блоке «Учителя TechLab» на стартовой.</p>
    ${SUBJECTS.map((s) => `<label class="ck"><input type="checkbox" value="${s.id}" ${(x.subjects || []).includes(s.id) ? "checked" : ""}> ${s.icon} ${esc(s.name)}</label>`).join("")}
    <div style="margin-top:12px"><button class="btn" id="sjSave">Сохранить</button></div>`);
  $("#sjSave").onclick = async () => {
    const list = [...dlg.querySelectorAll("input:checked")].map((i) => i.value);
    await set(ref(db, `staff/${uid}/subjects`), list.length ? list : null).catch((e) => alert(e.message));
    if (D.settings.teachers?.[uid]) await update(ref(db, `settings/teachers/${uid}`), { subjects: list }).catch(() => {});
    dlg.close();
  };
}
function shareDialog(uid) {
  const x = D.staff[uid], mine = D.shares[uid] || {};
  const tests = Object.entries(D.builder).filter(([, t]) => !t.owner || t.owner === USER.uid || D.staff[t.owner]?.role === "admin")
    .sort((a, b) => String(a[1].subject).localeCompare(String(b[1].subject)) || String(a[1].title).localeCompare(String(b[1].title)));
  openDlg(`📤 Личный доступ к тестам · ${esc(x.name || x.email)}`, `
    <p class="sub">Отмеченные тесты учитель увидит в «📂 Общей папке» с пометкой «лично вам» и сможет скопировать к себе.
      Ваших учеников и их результаты он не увидит. Чтобы дать тест всем учителям сразу — нажмите «🤝 Поделиться» в Конструкторе.</p>
    <input id="shQ" placeholder="Поиск по названию" style="margin:6px 0 8px">
    <div id="shList">${tests.length ? tests.map(([id, t]) => `<label class="ck" data-name="${esc((t.title || "").toLowerCase())}"><input type="checkbox" value="${esc(id)}" ${mine[id] ? "checked" : ""}>
      <span>${subjIcon(t.subject)} <b>${esc(t.title || id)}</b> <span class="sub">· ${esc(subjName(t.subject))}, ${esc(t.grade || "")} кл.${t.shared ? " · уже в общей папке" : ""}</span></span></label>`).join("")
      : '<div class="empty">В Конструкторе пока нет ваших тестов.</div>'}</div>
    <div style="margin-top:12px;display:flex;gap:8px"><button class="btn" id="shSave">Сохранить доступ</button><span class="sub" id="shMsg"></span></div>`);
  $("#shQ").oninput = (e) => { const q = e.target.value.toLowerCase(); dlg.querySelectorAll("#shList .ck").forEach((l) => (l.style.display = l.dataset.name.includes(q) ? "" : "none")); };
  $("#shSave").onclick = async () => {
    const on = new Set([...dlg.querySelectorAll("#shList input:checked")].map((i) => i.value));
    const upd = {};
    for (const id of on) if (!mine[id]) upd[`staffShares/${uid}/${id}`] = { kind: "test", title: D.builder[id]?.title || id, subject: D.builder[id]?.subject || "", at: Date.now(), by: shortName(USER.displayName || USER.email) };
    for (const id of Object.keys(mine)) if (!on.has(id)) upd[`staffShares/${uid}/${id}`] = null;
    if (!Object.keys(upd).length) return dlg.close();
    try { await update(ref(db), upd); logAction(db, USER, `${x.email}: личный доступ к тестам — ${on.size} шт.`, "staff"); dlg.close(); }
    catch (e) { $("#shMsg").textContent = "Не удалось: " + (e.code || e.message); }
  };
}

