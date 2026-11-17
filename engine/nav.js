// =====================================================================
//  Кнопка-«домик» 🏠 на всех страницах ученика + «Это не я — выйти».
//  Подключается сама через engine/autofill.js (он уже стоит во всех тестах и миссиях),
//  а на остальных страницах — одной строкой:
//     <script type="module" src="ПУТЬ/engine/nav.js?v=2"></script>
//  После выхода ученик всегда попадает на чистую стартовую страницу.
// =====================================================================
import { getSession, signOutStudent, SESSION_EVENT } from "./people.js?v=3";

if (!window.__tlNav) {
  window.__tlNav = true;
  const ROOT = new URL("../", import.meta.url);                 // папка сайта (engine/ лежит в корне)
  const onStart = () => { const p = location.pathname; return p === ROOT.pathname || p === ROOT.pathname + "index.html"; };
  const LANG = (() => { try { return localStorage.getItem("techlab_lang") || "ru"; } catch (e) { return "ru"; } })();
  const L = (ru, ro, en) => ({ ru, ro, en })[LANG] || ru;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Перейти на стартовую страницу (с очисткой раздела #…)
  function goHome() {
    if (onStart()) {
      if (location.hash) history.pushState(null, "", ROOT.pathname);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      scrollTo(0, 0);
    } else location.href = ROOT.href;
  }
  // Выйти из ученика и вернуться на чистую стартовую страницу
  function logout() {
    signOutStudent();
    if (onStart()) { history.replaceState(null, "", ROOT.pathname); window.dispatchEvent(new HashChangeEvent("hashchange")); scrollTo(0, 0); }
    else location.replace(ROOT.href);
  }
  window.TechLabNav = { goHome, logout };

  document.head.insertAdjacentHTML("beforeend", `<style>
    .tl-nav{position:fixed;left:16px;bottom:16px;z-index:2147483000;font-family:Manrope,"Segoe UI",Arial,sans-serif}
    .tl-nav .tl-home{width:54px;height:54px;border-radius:50%;border:0;background:#2E4BFF;color:#fff;cursor:pointer;
      display:grid;place-items:center;box-shadow:0 10px 24px rgba(46,75,255,.35);padding:0}
    .tl-nav .tl-home:hover{background:#1F35C9}
    .tl-nav .tl-home:focus-visible{outline:3px solid #FFD36B;outline-offset:2px}
    .tl-pop{position:absolute;left:0;bottom:64px;width:min(300px,calc(100vw - 32px));background:#fff;color:#0B1A3B;border:1px solid #DCE4F2;
      border-radius:18px;padding:14px;box-shadow:0 20px 40px rgba(11,26,59,.25);display:grid;gap:8px}
    .tl-pop .tl-who{font-size:13px;color:#556A92;line-height:1.35}
    .tl-pop .tl-who b{display:block;color:#0B1A3B;font-size:15px}
    .tl-pop button,.tl-pop a{font:inherit;font-weight:800;font-size:15px;border:0;border-radius:12px;padding:11px 14px;cursor:pointer;
      text-align:left;text-decoration:none;display:flex;gap:8px;align-items:center}
    .tl-pop .tl-go{background:#2E4BFF;color:#fff}
    .tl-pop .tl-out{background:#FDECEE;color:#C2253B}
    .tl-pop .tl-warn{font-size:12px;color:#8A5A00;background:#FFF4DC;border-radius:10px;padding:7px 10px}
    .tl-nav[hidden],.tl-pop[hidden]{display:none!important}
    @media print{.tl-nav{display:none!important}}
  </style>`);

  const box = document.createElement("div");
  box.className = "tl-nav";
  const HOUSE = `<svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>`;

  function draw() {
    const S = getSession(), start = onStart();
    // На чистой стартовой странице без входа кнопка не нужна
    box.hidden = start && !S && !location.hash;
    const testPage = !start && /\/(geo|inf|math|tech|b)[^/]*\//.test(location.pathname);
    box.innerHTML = `<button type="button" class="tl-home" aria-expanded="false" title="${esc(L("Стартовая страница", "Pagina de start", "Home page"))}"
        aria-label="${esc(L("Стартовая страница", "Pagina de start", "Home page"))}">${HOUSE}</button>
      <div class="tl-pop" hidden role="dialog" aria-label="TechLab">
        ${S ? `<div class="tl-who">${esc(L("Вошёл ученик:", "Elev conectat:", "Signed in:"))}<b>${esc(S.name)} · ${esc(S.cls)}</b></div>` : ""}
        <button type="button" class="tl-go" data-a="home">${HOUSE} ${esc(L("На стартовую страницу", "La pagina de start", "Go to home page"))}</button>
        ${S ? `<button type="button" class="tl-out" data-a="out">🚪 ${esc(L("Это не я — выйти / другой ученик", "Nu sunt eu — ieși / alt elev", "Not me — sign out / another student"))}</button>` : ""}
        ${testPage ? `<div class="tl-warn">⚠️ ${esc(L("Если ты сейчас пишешь тест — он будет сдан.", "Dacă acum scrii un test, el va fi predat.", "If you are taking a test now, it will be submitted."))}</div>` : ""}
      </div>`;
    const btn = box.querySelector(".tl-home"), pop = box.querySelector(".tl-pop");
    const toggle = (v) => { pop.hidden = !v; btn.setAttribute("aria-expanded", String(v)); };
    btn.onclick = (e) => { e.stopPropagation(); toggle(pop.hidden); };
    pop.onclick = (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
      toggle(false);
      if (a === "home") goHome(); else logout();
    };
  }
  const closePop = () => { const p = box.querySelector(".tl-pop"); if (p && !p.hidden) { p.hidden = true; box.querySelector(".tl-home")?.setAttribute("aria-expanded", "false"); } };
  document.addEventListener("click", (e) => { if (!box.contains(e.target)) closePop(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });

  const mount = () => { if (!box.isConnected) document.body.appendChild(box); draw(); };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  window.addEventListener(SESSION_EVENT, draw);
  window.addEventListener("hashchange", draw);
  window.addEventListener("storage", (e) => { if (e.key === "techlab_student") draw(); });
}
