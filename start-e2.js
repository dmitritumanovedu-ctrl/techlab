import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, goOnline, goOffline } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { SUBJECTS, TESTS as TESTS_RAW, EXPEDITIONS, KINDS as KINDS_RAW, kindOf as kindOfRaw } from "./tests.js?v=8";
let TESTS = TESTS_RAW;   // + тесты из конструктора (pubIndex)
import { t, pl, gradeLabel, subjName, subjShort, kindT, LOCALE, LANG } from "./engine/i18n.js?v=1";
const kindOf = (x, S) => kindT(kindOfRaw(x, S));
const KINDS = KINDS_RAW.map(kindT);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const subj = (id) => SUBJECTS.find((s) => s.id === id);

let CURRENT = null, LINKS = {}, OPEN = {}, SET = {}, PLAN = {}, FILTER = "all", LASTGRADE = "";
const ktag = (k) => `<span class="ktag k-${k.id}">${k.icon} ${esc(k.short)}</span>`;
const rtag = `<span class="ktag k-retake">🔁 ${t("retake")}</span>`;

// ---------- лёгкий режим для слабых компьютеров ----------
const LITE = (() => { try { const v = localStorage.getItem("techlab_lite"); if (v) return v === "1"; } catch (e) {}
  return (navigator.hardwareConcurrency || 8) <= 2; })();
if (LITE) document.documentElement.classList.add("lite");

function tick() {
  const d = new Date();
  $("#clock").innerHTML = d.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }) +
    "<br><b>" + d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" }) + "</b>";
}
tick(); setInterval(tick, 15000);

// ---------- данные из базы ----------
// Стартовая страница не держит постоянное подключение к базе: читает настройки,
// сразу отключается и обновляет их раз в 20 секунд. Так подключения остаются для тестов и миссий.
let db = null;
try { db = getDatabase(initializeApp(firebaseConfig)); } catch (e) { console.warn(e); }
async function refresh() {
  if (!db || document.hidden) return;
  try {
    goOnline(db);
    const [ss, pi] = await Promise.all([get(ref(db, "settings")), get(ref(db, "pubIndex")).catch(() => null)]);
    const s = ss.val() || {};
    const BT = Object.entries(pi?.val() || {}).map(([id, x]) => ({ id, type: "test", kind: x.kind || "to", subject: x.subject, grade: x.grade, title: x.title,
      note: [pl(x.n || 0, "pl_task"), x.minutes ? x.minutes + (LANG === "ru" ? " мин" : " min") : ""].filter(Boolean).join(" · "), path: `b/?t=${id}` }));
    TESTS = TESTS_RAW.concat(BT);
    SET = s; CURRENT = s.current || null; LINKS = s.links || {}; PLAN = s.plan || {}; OPEN = {};
    for (const t of TESTS) OPEN[t.id] = !!(s[t.id] && s[t.id].open);
    renderNow(); render();
  } catch (e) { renderNow(); }
  finally { try { goOffline(db); } catch (e) {} }
}
refresh();
setInterval(refresh, 20000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

// ---------- «Сейчас на уроке» ----------
function renderNow() {
  const box = $("#now");
  if (CURRENT && CURRENT.path) {
    const s = subj(CURRENT.subject);
    const T = TESTS.find((t) => t.id === CURRENT.id);
    const mission = T?.type === "mission";
    const K = T ? kindOf(T, SET) : null;
    box.innerHTML = `<a class="now" href="${esc(CURRENT.path)}">
      <div><div class="lbl"><span class="pulse"></span>${t("now")}${K ? ` <span class="now-k">${K.icon} ${esc(K.name)}</span>` : ""}</div>
        <div class="ttl">${esc(CURRENT.title)}</div>
        <div class="sub">${s ? esc(s.icon + " " + subjName(s)) : ""}${CURRENT.grade ? " · " + esc(gradeLabel(CURRENT.grade)) : ""}</div></div>
      <span class="go">${mission ? t("start_mission") : t("start")}</span></a>`;
  } else {
    box.innerHTML = `<div class="now empty"><div><div class="lbl">● ${t("now")}</div>
      <div class="sub" style="margin-top:4px">${t("now_empty")}</div></div></div>`;
  }
}

// ---------- страницы ----------
addEventListener("hashchange", () => { render(); scrollTo(0, 0); });
render();

function renderTabs(active) {
  $("#tabs").innerHTML = `<a class="tab${active ? "" : " on"}" href="#"><small>${t("tab_home")}</small><b>${t("tab_all")}</b></a>` +
    SUBJECTS.map((s, i) => `<a class="tab${active === s.id ? " on" : ""}" href="#${s.id}"><small>${t("tab_subj")} ${String(i + 1).padStart(2, "0")}</small><b>${s.icon} ${esc(subjShort(s))}</b></a>`).join("");
}

function render() {
  const [sid, grade] = decodeURIComponent(location.hash.slice(1)).split("-");
  const s = subj(sid);
  renderTabs(s ? s.id : "");
  if (!s) return renderHome();
  if (!grade || !s.grades.includes(grade)) return renderSubject(s);
  renderGrade(s, grade);
}

function stats(sid, grade) {
  const items = TESTS.filter((x) => x.subject === sid && (!grade || x.grade === grade));
  const ready = items.filter((x) => x.path).length;
  const links = Object.values(LINKS).filter((x) => x.subject === sid && (!grade || x.grade === grade)).length;
  const exps = EXPEDITIONS.filter((x) => x.subject === sid && (!grade || x.grade === grade)).length;
  return { total: items.length, ready, links, exps };
}
function statLine(st) {
  const parts = [];
  if (st.exps) parts.push(pl(st.exps, "pl_exp"));
  if (st.ready) parts.push(pl(st.ready, "pl_task"));
  if (st.links) parts.push(pl(st.links, "pl_mat"));
  return parts.join(" · ") || t("soon_tasks");
}

function renderHome() {
  $("#view").innerHTML = `<h2>${t("choose_subject")}</h2><div class="tiles">${SUBJECTS.map((s) => {
    const st = stats(s.id);
    const pr = st.total ? Math.round(st.ready / st.total * 100) : 0;
    const on = Math.max(1, Math.round(pr / 25));
    return `<a class="tile" href="#${s.id}">
      <div class="ic">${s.icon}</div><div class="nm">${esc(subjName(s))}</div>
      <div class="ds">${statLine(st)}</div>
      <div class="cls">${s.grades.map((g) => `<b>${esc(gradeLabel(g))}</b>`).join("")}</div>
      <div class="seg">${[0, 1, 2, 3].map((i) => `<span${i < on ? ' class="on"' : ""}></span>`).join("")}</div></a>`;
  }).join("")}</div>`;
}

function renderSubject(s) {
  $("#view").innerHTML = `<div class="crumbs"><a href="#">${t("nav_home")}</a> › ${esc(subjName(s))}</div>
    <h2>${s.icon} ${esc(subjName(s))} — ${t("choose_grade")}</h2>
    <div class="tiles">${s.grades.map((g) => `<a class="tile" href="#${s.id}-${g}">
        <div class="big">${esc(g)}</div><div class="nm" style="margin-top:6px">${t("grade_word")}</div>
        <div class="ds">${statLine(stats(s.id, g))}</div></a>`).join("")}</div>`;
}

// ---------- план недели ----------
const DAYS = t("days");
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
function weekHtml(sid, g) {
  const list = Object.values(PLAN[sid + "-" + g] || {});
  if (!list.length) return "";
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const mon = new Date(now); const wd = (now.getDay() + 6) % 7;            // 0 = понедельник
  mon.setDate(now.getDate() - wd + (wd >= 5 ? 7 : 0));                       // в выходные — следующая неделя
  const days = DAYS.map((name, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return { name, d, key: iso(d) }; });
  if (!list.some((e) => days.some((x) => x.key === e.d))) return "";
  const today = iso(now);
  return `<h3>${t("week_plan")}</h3><div class="week">${days.map((x) => {
    const es = list.filter((e) => e.d === x.key).sort((a, b) => (a.at || 0) - (b.at || 0));
    return `<div class="day${x.key === today ? " today" : ""}"><b>${x.name} ${pad(x.d.getDate())}.${pad(x.d.getMonth() + 1)}</b>
      ${es.length ? es.map((e) => { const k = KINDS.find((k) => k.id === e.k); return `<div class="ev">${esc(e.t)}${k ? `<br>${ktag(k)}` : ""}</div>`; }).join("") : '<span class="none">—</span>'}</div>`;
  }).join("")}</div>`;
}

function renderGrade(s, g) {
  if (LASTGRADE !== s.id + g) { FILTER = "all"; LASTGRADE = s.id + g; }
  const exps = EXPEDITIONS.filter((x) => x.subject === s.id && x.grade === g);
  const tests = TESTS.filter((x) => x.subject === s.id && x.grade === g && x.type !== "mission");
  const missions = TESTS.filter((x) => x.subject === s.id && x.grade === g && x.type === "mission");
  const links = Object.values(LINKS).filter((x) => x.subject === s.id && x.grade === g).sort((a, b) => (b.at || 0) - (a.at || 0));

  // фильтры по типам работ
  const all = tests.concat(missions);
  const cnt = {}; all.forEach((t) => { const k = kindOf(t, SET).id; cnt[k] = (cnt[k] || 0) + 1; });
  const nRetake = all.filter((t) => t.retake).length;
  const chips = [["all", t("f_all"), all.length + links.length]]
    .concat(KINDS.filter((k) => cnt[k.id]).map((k) => [k.id, k.icon + " " + k.short, cnt[k.id]]))
    .concat(nRetake ? [["retake", t("f_retakes"), nRetake]] : [])
    .concat(links.length ? [["links", t("f_materials"), links.length]] : []);
  if (!chips.some(([id]) => id === FILTER)) FILTER = "all";
  const tr = t;
  const show = (t) => FILTER === "all" || (FILTER === "retake" ? !!t.retake : kindOf(t, SET).id === FILTER);

  let html = `<div class="crumbs"><a href="#">${t("nav_home")}</a> › <a href="#${s.id}">${esc(subjName(s))}</a> › ${esc(gradeLabel(g))}</div>
    <h2>${s.icon} ${esc(subjName(s))} · ${esc(gradeLabel(g))}</h2>` + weekHtml(s.id, g) +
    `<div class="filters">${chips.map(([id, name, n]) => `<button type="button" class="flt${FILTER === id ? " on" : ""}" data-f="${id}">${esc(name)} <i>${n}</i></button>`).join("")}</div>`;

  // экспедиции (квесты)
  const expsShown = exps.map((e) => [e, TESTS.filter((t) => t.expedition === e.id).sort((a, b) => a.n - b.n).filter(show)]).filter(([, ms]) => ms.length);
  if (expsShown.length && FILTER !== "links") {
    html += `<h3>${t("exps_h")}</h3>` + expsShown.map(([e, ms]) => `<div class="exp"><div class="exp-head"><span class="ic">${e.icon}</span>
        <div><div class="t">${esc(e.title)}</div><div class="s">${esc(e.note || "")}</div></div></div>
        <div class="route">${ms.map((m) => {
          const live = OPEN[m.id], K = kindOf(m, SET);
          const inner = `<div class="n">${t("mission")} ${String(m.n).padStart(2, "0")}${m.date ? " · " + esc(m.date) : ""}</div>
            <div class="mt">${esc(m.title)}</div>
            <div class="md">${K.id !== "quest" ? ktag(K) + " " : ""}${m.path ? (live ? `<span class="badge open">${t("b_open_f")}</span>` : `<span class="badge closed">${t("b_closed_f")}</span>`) : `<span class="badge soon">${t("b_soon")}</span>`}</div>`;
          return m.path ? `<a class="ms${live ? " live" : ""}" href="${esc(m.path)}">${inner}</a>` : `<div class="ms locked">${inner}</div>`;
        }).join("")}</div></div>`).join("");
  }

  // тесты, сгруппированные по типам
  if (FILTER !== "links") {
    const shownTests = tests.filter(show);
    const groups = KINDS.map((k) => [k, shownTests.filter((t) => kindOf(t, SET).id === k.id)]).filter(([, l]) => l.length);
    if (groups.length) html += groups.map(([k, l]) => `<h3>${k.icon} ${esc(k.name)}</h3><div class="list">${l.map((t) => `<a class="row" href="${esc(t.path)}">
        <span class="ri">${t.retake ? "🔁" : k.icon}</span><span><div class="rt">${esc(t.title)}</div><div class="rs">${esc(t.note || "")}</div></span>
        <span class="rb">${ktag(k)}${t.retake ? " " + rtag : ""} ${OPEN[t.id] ? `<span class="badge open">${tr("b_open_m")}</span>` : `<span class="badge closed">${tr("b_closed_m")}</span>`}</span></a>`).join("")}</div>`).join("");
    else if (!expsShown.length) html += `<div class="empty-note" style="margin-top:12px">${FILTER === "all" ? t("no_tasks") : t("no_kind")}</div>`;
  }

  if (FILTER === "all" || FILTER === "links") {
    html += `<h3>${t("materials_h")}</h3>` + (links.length ? `<div class="list">${links.map((l) => `<a class="row" href="${esc(l.url)}" target="_blank" rel="noopener">
        <span class="ri">${icon(l.url)}</span><span><div class="rt">${esc(l.title)}</div><div class="rs">${esc(host(l.url))}</div></span>
        <span class="rb">↗</span></a>`).join("")}</div>`
      : `<div class="empty-note">${t("no_materials")}</div>`);
  }

  $("#view").innerHTML = html;
  document.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { FILTER = b.dataset.f; renderGrade(s, g); });
}

function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } }
function icon(u) {
  const h = host(u);
  if (/docs\.google\.com\/presentation|canva|slides/.test(u)) return "📊";
  if (/docs\.google\.com\/document|\.docx?$/.test(u)) return "📄";
  if (/drive\.google|dropbox|onedrive/.test(h)) return "📁";
  if (/youtube|youtu\.be|vimeo/.test(h)) return "▶️";
  if (/forms\.gle|docs\.google\.com\/forms/.test(u)) return "📝";
  return "🔗";
}

// ---------- переключатель «лёгкий режим» ----------
const lt = document.getElementById("liteToggle");
if (lt) {
  lt.textContent = LITE ? t("lite_off") : t("lite_on");
  lt.onclick = (e) => { e.preventDefault(); try { localStorage.setItem("techlab_lite", LITE ? "0" : "1"); } catch (x) {} location.reload(); };
}
