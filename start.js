import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { SITE, SUBJECTS, TESTS } from "./tests.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const subj = (id) => SUBJECTS.find((s) => s.id === id);

let CURRENT = null, LINKS = {}, OPEN = {};

$("#school").textContent = SITE.school;
function tick() {
  const d = new Date();
  $("#clock").innerHTML = d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }) +
    "<br><b>" + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) + "</b>";
}
tick(); setInterval(tick, 15000);

// ---------- данные из базы (работает и без неё — тогда просто без «Сейчас на уроке») ----------
try {
  const db = getDatabase(initializeApp(firebaseConfig));
  onValue(ref(db, "settings"), (snap) => {
    const s = snap.val() || {};
    CURRENT = s.current || null;
    LINKS = s.links || {};
    OPEN = {};
    for (const t of TESTS) OPEN[t.id] = !!(s[t.id] && s[t.id].open);
    renderNow(); render();
  }, () => { renderNow(); });
} catch (e) { console.warn(e); }

// ---------- «Сейчас на уроке» ----------
function renderNow() {
  const box = $("#now");
  if (CURRENT && CURRENT.path) {
    const s = subj(CURRENT.subject);
    box.innerHTML = `<a class="now" href="${esc(CURRENT.path)}">
      <div><div class="lbl"><span class="pulse"></span>Сейчас на уроке</div>
        <div class="ttl">${esc(CURRENT.title)}</div>
        <div class="sub">${s ? esc(s.icon + " " + s.name) : ""}${CURRENT.grade ? " · " + esc(CURRENT.grade) + " класс" : ""}</div></div>
      <span class="go">Начать →</span></a>`;
  } else {
    box.innerHTML = `<div class="now empty"><div><div class="lbl" style="color:var(--muted)">Сейчас на уроке</div>
      <div>Учитель ещё не открыл задание. Выбери предмет ниже или подожди.</div></div></div>`;
  }
}

// ---------- страницы: главная / предмет / класс ----------
window.addEventListener("hashchange", render);
render();

function render() {
  const h = decodeURIComponent(location.hash.slice(1));
  const [sid, grade] = h.split("-");
  const s = subj(sid);
  if (!s) return renderHome();
  if (!grade || !s.grades.includes(grade)) return renderSubject(s);
  renderGrade(s, grade);
  window.scrollTo(0, 0);
}

function countFor(sid, grade) {
  const t = TESTS.filter((x) => x.subject === sid && (!grade || x.grade === grade)).length;
  const l = Object.values(LINKS).filter((x) => x.subject === sid && (!grade || x.grade === grade)).length;
  return { t, l };
}

function renderHome() {
  $("#view").innerHTML = `<h2>Предметы</h2><div class="tiles">${SUBJECTS.map((s) => {
    const { t, l } = countFor(s.id);
    return `<a class="tile" style="--c:${s.color}" href="#${s.id}">
      <div class="ic">${s.icon}</div><div class="nm">${esc(s.name)}</div>
      <div class="ds">${t} тест(ов) · ${l} материал(ов)</div>
      <div class="chips">${s.grades.map((g) => `<span class="chip">${esc(g)} класс</span>`).join("")}</div></a>`;
  }).join("")}</div>`;
}

function renderSubject(s) {
  $("#view").innerHTML = `<div class="crumbs"><a href="#">Главная</a> › ${esc(s.name)}</div>
    <h2>${s.icon} ${esc(s.name)} — выбери класс</h2>
    <div class="tiles">${s.grades.map((g) => {
      const { t, l } = countFor(s.id, g);
      return `<a class="tile" style="--c:${s.color}" href="#${s.id}-${g}">
        <div class="nm" style="font-size:34px;margin-top:0">${esc(g)} класс</div>
        <div class="ds">${t} тест(ов) · ${l} материал(ов)</div></a>`;
    }).join("")}</div>`;
}

function renderGrade(s, g) {
  const tests = TESTS.filter((x) => x.subject === s.id && x.grade === g);
  const links = Object.values(LINKS).filter((x) => x.subject === s.id && x.grade === g)
    .sort((a, b) => (b.at || 0) - (a.at || 0));
  $("#view").innerHTML = `<div class="crumbs"><a href="#">Главная</a> › <a href="#${s.id}">${esc(s.name)}</a> › ${esc(g)} класс</div>
    <h2>${s.icon} ${esc(s.name)} · ${esc(g)} класс</h2>

    <div class="section"><h2 style="font-size:17px">📝 Тесты</h2>
      ${tests.length ? `<div class="list">${tests.map((t) => `<a class="row" href="${esc(t.path)}">
        <span class="ri">📝</span><span><div class="rt">${esc(t.title)}</div><div class="rs">${esc(t.note || "")}</div></span>
        <span class="rb">${OPEN[t.id] ? '<span class="badge open">открыт</span>' : '<span class="badge closed">закрыт</span>'}</span></a>`).join("")}</div>`
        : `<div class="empty-note">Тестов пока нет.</div>`}
    </div>

    <div class="section"><h2 style="font-size:17px">📎 Материалы к урокам</h2>
      ${links.length ? `<div class="list">${links.map((l) => `<a class="row" href="${esc(l.url)}" target="_blank" rel="noopener">
        <span class="ri">${icon(l.url)}</span><span><div class="rt">${esc(l.title)}</div><div class="rs">${esc(host(l.url))}</div></span>
        <span class="rb">↗</span></a>`).join("")}</div>`
        : `<div class="empty-note">Материалов пока нет.</div>`}
    </div>`;
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
