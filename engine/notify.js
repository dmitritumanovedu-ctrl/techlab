// =====================================================================
//  TechLab · уведомления для учителей и администратора (колокольчик 🔔)
//
//  Администратор: новые заявки учителей, новые предметы на одобрение, новые отзывы.
//  Коллега: вам открыли новый тест или материал.
//  Новое показывается всплывающей карточкой, числом на колокольчике (правый нижний угол)
//  и, если разрешить, системным уведомлением Windows — даже когда вкладка свёрнута.
//  Что уже просмотрено — запоминается на этом компьютере.
// =====================================================================
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ago = (ms) => { const s = (Date.now() - (ms || 0)) / 1000; return s < 60 ? "только что" : s < 3600 ? Math.floor(s / 60) + " мин назад" : s < 86400 ? Math.floor(s / 3600) + " ч назад" : new Date(ms).toLocaleDateString("ru-RU"); };
const CSS = `
.nt-bell{position:fixed;right:18px;bottom:18px;z-index:2147482000;width:54px;height:54px;border-radius:50%;border:0;background:#2E4BFF;color:#fff;font-size:24px;cursor:pointer;box-shadow:0 10px 26px rgba(46,75,255,.35);display:grid;place-items:center}
.nt-bell:hover{filter:brightness(1.08)}
.nt-bell b{position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;border-radius:999px;background:#E07B39;color:#fff;font:800 12px/22px Inter,Arial,sans-serif;padding:0 6px;border:2px solid #fff}
.nt-bell b:empty{display:none}
.nt-bell.ring{animation:ntRing .9s ease 2}
@keyframes ntRing{0%,100%{transform:rotate(0)}20%{transform:rotate(14deg)}40%{transform:rotate(-12deg)}60%{transform:rotate(8deg)}80%{transform:rotate(-5deg)}}
.nt-pop{position:fixed;right:18px;bottom:84px;z-index:2147482001;width:min(380px,calc(100vw - 36px));max-height:70vh;overflow:auto;background:#fff;color:#1A2340;border:1px solid #E1E6F0;border-radius:18px;box-shadow:0 22px 50px rgba(26,35,64,.22);font-family:Inter,Roboto,Arial,sans-serif}
.nt-pop[hidden]{display:none}
.nt-pop .hd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #E1E6F0;font-weight:800}
.nt-pop .hd button{font:inherit;font-size:12.5px;font-weight:700;border:0;background:#E8EDFF;color:#2E4BFF;border-radius:8px;padding:5px 9px;cursor:pointer}
.nt-it{display:flex;gap:10px;padding:12px 16px;border-bottom:1px solid #F0F2F7;text-decoration:none;color:inherit;font-size:14px;line-height:1.4}
.nt-it:hover{background:#F7F9FD}.nt-it.new{background:#F5F7FF}
.nt-it .ic{flex:none;width:34px;height:34px;border-radius:10px;background:#E8EDFF;display:grid;place-items:center;font-size:17px}
.nt-it small{display:block;color:#8A93A6;font-size:12px;margin-top:2px}
.nt-it .dot{flex:none;width:9px;height:9px;border-radius:50%;background:#E07B39;margin-top:6px}
.nt-empty{padding:22px;text-align:center;color:#8A93A6;font-size:14px}
.nt-perm{padding:10px 16px;font-size:13px;background:#FDEEE3;color:#7A4A1F}
.nt-perm button{font:inherit;font-weight:700;border:0;background:#E07B39;color:#fff;border-radius:8px;padding:5px 10px;cursor:pointer;margin-left:6px}
.nt-toasts{position:fixed;right:18px;bottom:84px;z-index:2147482002;display:flex;flex-direction:column;gap:8px;width:min(360px,calc(100vw - 36px));pointer-events:none}
.nt-toast{pointer-events:auto;display:flex;gap:10px;align-items:flex-start;background:#1A2340;color:#fff;border-radius:16px;padding:12px 14px;box-shadow:0 16px 36px rgba(0,0,0,.25);font:14px/1.4 Inter,Roboto,Arial,sans-serif;animation:ntIn .25s ease}
.nt-toast a{color:#AFC0FF;font-weight:700}.nt-toast button{margin-left:auto;border:0;background:none;color:#AAB4D6;font-size:16px;cursor:pointer}
@keyframes ntIn{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
@media print{.nt-bell,.nt-pop,.nt-toasts{display:none!important}}`;

/**
 * startNotify(db, user, role, { base })
 *   role: "admin" | "colleague";  base — путь к корню сайта от страницы ("../" для teacher/ и admin/)
 */
export function startNotify(db, user, role, { base = "../" } = {}) {
  if (!user || (role !== "admin" && role !== "colleague") || window.__tlNotify) return;
  window.__tlNotify = true;
  if (!document.getElementById("ntCss")) { const st = document.createElement("style"); st.id = "ntCss"; st.textContent = CSS; document.head.appendChild(st); }
  const KEY = "tl_nt_seen_" + user.uid;
  let seen; try { seen = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { seen = null; }
  const first = !seen; seen = seen || {};
  const items = {};                 // id → {ic, t, at, href}
  const src = {};                   // источник → список id (чтобы удалять исчезнувшее)
  let booted = false;

  const bell = document.createElement("button");
  bell.className = "nt-bell"; bell.type = "button"; bell.title = "Уведомления"; bell.innerHTML = "🔔<b></b>";
  const pop = document.createElement("div"); pop.className = "nt-pop"; pop.hidden = true;
  const toasts = document.createElement("div"); toasts.className = "nt-toasts";
  document.body.append(bell, pop, toasts);
  bell.onclick = () => { pop.hidden = !pop.hidden; toasts.innerHTML = ""; paint(); };
  document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target) && !bell.contains(e.target)) pop.hidden = true; });

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) {} };
  const unread = () => Object.keys(items).filter((id) => !seen[id]);
  function paint() {
    const n = unread().length;
    bell.querySelector("b").textContent = n ? (n > 99 ? "99+" : n) : "";
    const list = Object.entries(items).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 40);
    const canAsk = "Notification" in window && Notification.permission === "default";
    pop.innerHTML = `<div class="hd"><span>🔔 Уведомления</span>${n ? '<button type="button" id="ntAll">Отметить всё прочитанным</button>' : ""}</div>
      ${canAsk ? `<div class="nt-perm">Показывать уведомления Windows, даже когда вкладка свёрнута?<button type="button" id="ntPerm">Включить</button></div>` : ""}
      ${list.length ? list.map(([id, x]) => `<a class="nt-it${seen[id] ? "" : " new"}" href="${esc(x.href || "#")}" data-id="${esc(id)}"><span class="ic">${x.ic}</span><span style="flex:1">${x.t}<small>${ago(x.at)}</small></span>${seen[id] ? "" : '<span class="dot"></span>'}</a>`).join("")
        : '<div class="nt-empty">Новых уведомлений нет</div>'}`;
    const all = pop.querySelector("#ntAll"); if (all) all.onclick = (e) => { e.stopPropagation(); Object.keys(items).forEach((id) => (seen[id] = Date.now())); save(); paint(); };
    const pm = pop.querySelector("#ntPerm"); if (pm) pm.onclick = (e) => { e.stopPropagation(); Notification.requestPermission().then(paint); };
    pop.querySelectorAll("[data-id]").forEach((a) => a.addEventListener("click", () => { seen[a.dataset.id] = Date.now(); save(); }));
  }
  function toast(x) {
    const el = document.createElement("div"); el.className = "nt-toast";
    el.innerHTML = `<span style="font-size:20px">${x.ic}</span><span>${x.t}${x.href ? `<br><a href="${esc(x.href)}">Открыть →</a>` : ""}</span><button type="button" aria-label="Закрыть">✕</button>`;
    el.querySelector("button").onclick = () => el.remove();
    toasts.appendChild(el); setTimeout(() => el.remove(), 12000);
    bell.classList.remove("ring"); void bell.offsetWidth; bell.classList.add("ring");
    try {
      if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
        const n = new Notification("TechLab", { body: x.plain || x.t.replace(/<[^>]+>/g, ""), icon: base + "icons/icon.svg", tag: x.id });
        n.onclick = () => { window.focus(); if (x.href) location.href = x.href; };
      }
    } catch (e) {}
  }
  // set — заменить элементы источника; новые (не виденные и появившиеся после загрузки) — показать всплывающей карточкой
  function setSource(name, list) {
    const before = new Set(src[name] || []);
    for (const id of before) delete items[id];
    src[name] = list.map((x) => x.id);
    for (const x of list) {
      const isNew = !before.has(x.id) && !seen[x.id];
      items[x.id] = x;
      if (first && Date.now() - (x.at || 0) > 3 * 864e5) seen[x.id] = Date.now();   // первый запуск: старше 3 дней — уже не новое
      else if (isNew && booted && Date.now() - (x.at || 0) < 7 * 864e5) toast(x);
    }
    if (first) save();
    paint();
  }
  const listen = (path, fn) => onValue(ref(db, path), (s) => fn(s.val() || {}), () => {});

  if (role === "admin") {
    const adm = base + "admin/";
    listen("staffRequests", (v) => setSource("req", Object.entries(v).map(([uid, x]) => ({ id: "req_" + uid, ic: "🆕", at: x.at,
      t: `Новый учитель хочет присоединиться: <b>${esc(x.name || x.email)}</b>${x.subject ? " · " + esc(x.subject) : ""}`, plain: `Заявка учителя: ${x.name || x.email}`, href: adm + "#requests" }))));
    listen("subjectRequests", (v) => setSource("subj", Object.entries(v).flatMap(([uid, m]) => Object.entries(m || {}).filter(([, r]) => r && !r.done).map(([id, r]) => ({ id: "sr_" + id, ic: "📚", at: r.at,
      t: `Новый предмет на одобрение: <b>${esc(r.name)}</b> (${esc(r.by || r.email || "")})`, href: adm + "#subjects" })))));
    listen("feedback", (v) => setSource("fb", Object.entries(v).filter(([, x]) => x && !x.read).map(([id, x]) => ({ id: "fb_" + id, ic: "✉️", at: x.at,
      t: `Отзыв от <b>${esc(x.name)}</b>: ${esc(String(x.text || "").slice(0, 80))}`, href: adm + "#feedback" }))));
    listen("staff", (v) => setSource("staff", Object.entries(v).filter(([, x]) => x && x.at && Date.now() - x.at < 14 * 864e5).map(([uid, x]) => ({ id: "st_" + uid, ic: "🤝", at: x.at,
      t: `В команде новый учитель: <b>${esc(x.name || x.email)}</b>`, href: adm + "#teachers" }))));
  } else {
    listen(`staffShares/${user.uid}`, (v) => setSource("share", Object.entries(v).filter(([, x]) => x && typeof x === "object").map(([id, x]) => ({ id: "sh_" + id, ic: x.kind === "material" ? (x.file ? "📁" : "🔗") : "🧩", at: x.at,
      t: `${esc(x.by || "Администратор")} открыл(а) вам ${x.kind === "material" ? "материал" : "тест"}: <b>${esc(x.title || id)}</b>`, href: base + "teacher/my.html#shared" }))));
  }
  setTimeout(() => (booted = true), 2500);       // всё, что пришло при загрузке страницы, — без всплывающих карточек
}
