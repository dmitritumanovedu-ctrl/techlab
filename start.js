import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, goOnline, goOffline } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { SUBJECTS, TESTS, EXPEDITIONS } from "./tests.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const subj = (id) => SUBJECTS.find((s) => s.id === id);
const plural = (n, a, b, c) => n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c;

let CURRENT = null, LINKS = {}, OPEN = {};

// ---------- лёгкий режим для слабых компьютеров ----------
const LITE = (() => { try { const v = localStorage.getItem("techlab_lite"); if (v) return v === "1"; } catch (e) {}
  return (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4; })();
if (LITE) document.documentElement.classList.add("lite");

// ---------- звёздное небо (в лёгком режиме — рисуется один раз, без анимации) ----------
(function stars() {
  const cv = $("#stars"), ctx = cv.getContext("2d");
  const still = LITE || matchMedia("(prefers-reduced-motion: reduce)").matches;
  let S = [], last = 0;
  function size() {
    cv.width = innerWidth; cv.height = innerHeight;
    S = Array.from({ length: Math.round(innerWidth * innerHeight / (still ? 9000 : 7000)) }, () => ({
      x: Math.random() * cv.width, y: Math.random() * cv.height, r: Math.random() * 1.4 + .2, p: Math.random() * 6.28 }));
    if (still) draw(0);
  }
  function draw(t) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const s of S) {
      ctx.globalAlpha = .35 + .65 * Math.abs(Math.sin(s.p + t / 1400));
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.fill();
    }
  }
  function loop(t) { if (!document.hidden && t - last > 66) { draw(t); last = t; } requestAnimationFrame(loop); } // ~15 кадров/с
  size(); addEventListener("resize", size);
  if (!still) requestAnimationFrame(loop);
})();

function tick() {
  const d = new Date();
  $("#clock").innerHTML = d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }) +
    "<br><b>" + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) + "</b>";
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
    const s = (await get(ref(db, "settings"))).val() || {};
    CURRENT = s.current || null; LINKS = s.links || {}; OPEN = {};
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
    const mission = TESTS.find((t) => t.id === CURRENT.id)?.type === "mission";
    box.innerHTML = `<a class="now" href="${esc(CURRENT.path)}">
      <div><div class="lbl"><span class="pulse"></span>Сейчас на уроке</div>
        <div class="ttl">${esc(CURRENT.title)}</div>
        <div class="sub">${s ? esc(s.icon + " " + s.name) : ""}${CURRENT.grade ? " · " + esc(CURRENT.grade) + " класс" : ""}</div></div>
      <span class="go">${mission ? "Начать миссию →" : "Начать →"}</span></a>`;
  } else {
    box.innerHTML = `<div class="now empty"><div><div class="lbl">Сейчас на уроке</div>
      <div class="sub" style="margin-top:4px">Учитель ещё не открыл задание. Выбери предмет ниже или подожди.</div></div></div>`;
  }
}

// ---------- страницы ----------
addEventListener("hashchange", () => { render(); scrollTo(0, 0); });
render();

function render() {
  const [sid, grade] = decodeURIComponent(location.hash.slice(1)).split("-");
  const s = subj(sid);
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
  if (st.exps) parts.push(`${st.exps} ${plural(st.exps, "экспедиция", "экспедиции", "экспедиций")}`);
  const tests = st.ready;
  if (tests) parts.push(`${tests} ${plural(tests, "задание", "задания", "заданий")}`);
  if (st.links) parts.push(`${st.links} ${plural(st.links, "материал", "материала", "материалов")}`);
  return parts.join(" · ") || "скоро появятся задания";
}

function renderHome() {
  $("#view").innerHTML = `<h2>Выбери предмет</h2><div class="tiles">${SUBJECTS.map((s) => {
    const st = stats(s.id);
    const pr = st.total ? Math.round(st.ready / st.total * 100) : 0;
    return `<a class="tile" style="--c:${s.color}" href="#${s.id}">
      <div class="ic">${s.icon}</div><div class="nm">${esc(s.name)}</div>
      <div class="ds">${s.grades.join(" · ")} класс</div>
      <div class="ds" style="margin-top:4px">${statLine(st)}</div>
      <div class="lv"><i style="width:${Math.max(6, pr)}%"></i></div></a>`;
  }).join("")}</div>`;
}

function renderSubject(s) {
  $("#view").innerHTML = `<div class="crumbs"><a href="#">Главная</a> › ${esc(s.name)}</div>
    <h2>${s.icon} ${esc(s.name)} — выбери класс</h2>
    <div class="tiles">${s.grades.map((g) => `<a class="tile" style="--c:${s.color};min-height:160px" href="#${s.id}-${g}">
        <div class="big grad">${esc(g)}</div><div class="nm" style="margin-top:6px">класс</div>
        <div class="ds">${statLine(stats(s.id, g))}</div></a>`).join("")}</div>`;
}

function renderGrade(s, g) {
  const exps = EXPEDITIONS.filter((x) => x.subject === s.id && x.grade === g);
  const tests = TESTS.filter((x) => x.subject === s.id && x.grade === g && x.type !== "mission");
  const links = Object.values(LINKS).filter((x) => x.subject === s.id && x.grade === g).sort((a, b) => (b.at || 0) - (a.at || 0));
  let html = `<div class="crumbs"><a href="#">Главная</a> › <a href="#${s.id}">${esc(s.name)}</a> › ${esc(g)} класс</div>
    <h2>${s.icon} ${esc(s.name)} · ${esc(g)} класс</h2>`;

  if (exps.length) {
    html += `<h3>🚀 Экспедиции</h3>` + exps.map((e) => {
      const ms = TESTS.filter((t) => t.expedition === e.id).sort((a, b) => a.n - b.n);
      return `<div class="exp"><div class="exp-head"><span class="ic">${e.icon}</span>
        <div><div class="t">${esc(e.title)}</div><div class="s">${esc(e.note || "")}</div></div></div>
        <div class="route">${ms.map((m) => {
          const live = OPEN[m.id];
          const inner = `<div class="n">МИССИЯ ${String(m.n).padStart(2, "0")}${m.date ? " · " + esc(m.date) : ""}</div>
            <div class="mt">${esc(m.title)}</div>
            <div class="md">${m.path ? (live ? '<span class="badge open">открыта</span>' : '<span class="badge closed">закрыта</span>') : '<span class="badge soon">🔒 скоро</span>'}</div>`;
          return m.path ? `<a class="ms${live ? " live" : ""}" href="${esc(m.path)}">${inner}</a>` : `<div class="ms locked">${inner}</div>`;
        }).join("")}</div></div>`;
    }).join("");
  }

  html += `<h3>📝 Тесты</h3>` + (tests.length ? `<div class="list">${tests.map((t) => `<a class="row" href="${esc(t.path)}">
      <span class="ri">📝</span><span><div class="rt">${esc(t.title)}</div><div class="rs">${esc(t.note || "")}</div></span>
      <span class="rb">${OPEN[t.id] ? '<span class="badge open">открыт</span>' : '<span class="badge closed">закрыт</span>'}</span></a>`).join("")}</div>`
    : `<div class="empty-note">Тестов пока нет.</div>`);

  html += `<h3>📎 Материалы к урокам</h3>` + (links.length ? `<div class="list">${links.map((l) => `<a class="row" href="${esc(l.url)}" target="_blank" rel="noopener">
      <span class="ri">${icon(l.url)}</span><span><div class="rt">${esc(l.title)}</div><div class="rs">${esc(host(l.url))}</div></span>
      <span class="rb">↗</span></a>`).join("")}</div>`
    : `<div class="empty-note">Материалов пока нет.</div>`);

  $("#view").innerHTML = html;
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
  lt.textContent = LITE ? "✨ включить анимацию" : "⚡ лёгкий режим (для слабых компьютеров)";
  lt.onclick = (e) => { e.preventDefault(); try { localStorage.setItem("techlab_lite", LITE ? "0" : "1"); } catch (x) {} location.reload(); };
}
