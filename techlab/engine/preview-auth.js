// TechLab · «Просмотр учителя»: проверка, что страницу с ?preview открыл учитель или администратор.
// Ученики по ссылке с ?preview просто попадают в обычный режим.
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "../firebase-config.js";
import { ADMIN_EMAILS } from "./staff.js?v=3";

let memo = null;
export function wantsPreview() { return new URLSearchParams(location.search).has("preview"); }
export function isStaffPreview() {
  if (!wantsPreview()) return Promise.resolve(false);
  if (memo) return memo;
  memo = (async () => {
    const app = getApps()[0] || initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const user = await new Promise((res) => { const t = setTimeout(() => res(null), 8000); const st = onAuthStateChanged(auth, (u) => { clearTimeout(t); st(); res(u); }); });
    if (!user) return false;
    if (ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(String(user.email || "").toLowerCase())) return true;
    try { return (await get(ref(getDatabase(app), `staff/${user.uid}`))).exists(); } catch (e) { return false; }
  })();
  memo.then((ok) => { if (ok) banner(); else if (wantsPreview()) noAccess(); });
  return memo;
}
function bar(html, bg) {
  const go = () => {
    const b = document.createElement("div");
    b.className = "tl-preview-bar";
    b.style.cssText = `position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;background:${bg};color:#fff;font:600 14px Inter,Arial,sans-serif;padding:9px 16px;border-radius:12px;box-shadow:0 10px 26px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;max-width:94vw`;
    b.innerHTML = html;
    document.body.appendChild(b);
    b.querySelector("[data-x]")?.addEventListener("click", () => b.remove());
  };
  document.body ? go() : addEventListener("DOMContentLoaded", go);
}
function banner() {
  bar(`👁 Просмотр учителя: все этапы открыты, ответы никуда не отправляются <button data-x style="border:0;background:rgba(255,255,255,.2);color:#fff;border-radius:8px;padding:3px 9px;cursor:pointer;font:inherit">✕</button>`, "#2E4BFF");
}
function noAccess() {
  bar(`🔒 Просмотр доступен только учителю: войдите в панель учителя через Google и откройте ссылку ещё раз <button data-x style="border:0;background:rgba(255,255,255,.2);color:#fff;border-radius:8px;padding:3px 9px;cursor:pointer;font:inherit">✕</button>`, "#B54708");
}
