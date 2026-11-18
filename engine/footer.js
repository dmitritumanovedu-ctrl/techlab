// =====================================================================
//  TechLab · подвал сайта: учителя платформы, «Напишите нам», © 2026.
//  Подключение: <div id="siteFoot" data-root="./"></div>  +  <script type="module" src="engine/footer.js?v=1"></script>
//  data-root — путь к корню сайта от страницы ("./", "../" …). data-form="0" — без формы отзыва.
//  Отзывы попадают в базу (feedback/) и видны только администратору на странице admin/.
// =====================================================================
import { firebaseConfig } from "../firebase-config.js";
import { readDb, cacheGet, cachePut } from "./fbrest.js?v=1";
import { SUBJECTS } from "../tests.js?v=8";

const BASE = String(firebaseConfig.databaseURL || "").replace(/\/+$/, "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const YEAR = Math.max(2026, new Date().getFullYear());

const CSS = `
.tf-foot{margin:34px auto 0;max-width:1100px;padding:0 16px 28px;color:#46536E;font-size:14px}
.tf-teach{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;margin-bottom:16px}
.tf-teach .t{background:#fff;border:1px solid #DCE4F2;border-radius:999px;padding:6px 12px;font-weight:600}
.tf-teach .t small{color:#8090B0;font-weight:500}
.tf-fb{background:#fff;border:1px solid #DCE4F2;border-radius:20px;padding:18px 20px;max-width:720px;margin:0 auto 18px}
.tf-fb summary{cursor:pointer;font-weight:800;font-size:16px;color:#0B1A3B;list-style:none;display:flex;align-items:center;gap:8px}
.tf-fb summary::-webkit-details-marker{display:none}
.tf-fb summary::after{content:"▾";margin-left:auto;color:#2E4BFF}
.tf-fb[open] summary::after{content:"▴"}
.tf-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
.tf-grid label{display:block;font-size:13px;font-weight:700;color:#46536E;margin-bottom:4px}
.tf-grid input,.tf-grid textarea,.tf-grid select{width:100%;box-sizing:border-box;font:inherit;font-size:15px;padding:10px 12px;border:1.5px solid #DCE4F2;border-radius:12px;background:#F8FAFD;color:#0B1A3B}
.tf-grid input:focus,.tf-grid textarea:focus{outline:none;border-color:#2E4BFF;background:#fff}
.tf-grid .full{grid-column:1/-1}.tf-grid textarea{min-height:110px;resize:vertical}
.tf-send{margin-top:10px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.tf-send button{font:inherit;font-weight:800;border:0;border-radius:12px;padding:11px 20px;background:#2E4BFF;color:#fff;cursor:pointer}
.tf-send button:disabled{opacity:.6;cursor:default}
.tf-msg{font-weight:600}.tf-msg.ok{color:#0B8A5A}.tf-msg.err{color:#C2253B}
.tf-links{text-align:center;margin:10px 0}.tf-links a{color:#46536E;margin:0 6px}
.tf-copy{text-align:center;border-top:1px solid #DCE4F2;padding-top:14px;margin-top:6px;font-size:13px;color:#8090B0;line-height:1.6}
.tf-copy b{color:#0B1A3B}.tf-a{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#0B1A3B;color:#fff;font-weight:800;font-size:12px;margin-right:4px;vertical-align:-5px}
.tf-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
@media(max-width:620px){.tf-grid{grid-template-columns:1fr}}`;

export function mountFooter(el) {
  if (!el) return;
  const root = el.dataset.root || "./";
  const withForm = el.dataset.form !== "0";
  if (!document.getElementById("tfCss")) { const st = document.createElement("style"); st.id = "tfCss"; st.textContent = CSS; document.head.appendChild(st); }
  el.className = "tf-foot";
  el.innerHTML = `
    <div class="tf-teach" id="tfTeach"></div>
    ${withForm ? `<details class="tf-fb" id="feedback">
      <summary>✉️ Напишите нам отзыв или предложение</summary>
      <form id="tfForm" autocomplete="on" novalidate>
        <div class="tf-grid">
          <div><label for="tfName">Фамилия и имя</label><input id="tfName" name="name" maxlength="80" required placeholder="Например: Попеску Мария"></div>
          <div><label for="tfMail">E-mail для ответа</label><input id="tfMail" name="email" type="email" maxlength="120" placeholder="name@example.com"></div>
          <div class="full"><label for="tfWho">Кто вы</label><select id="tfWho"><option value="parent">Родитель</option><option value="student">Ученик</option><option value="teacher">Учитель</option><option value="other">Другое</option></select></div>
          <div class="full"><label for="tfText">Текст письма</label><textarea id="tfText" maxlength="2000" required placeholder="Что понравилось, что не работает, что добавить…"></textarea></div>
          <div class="tf-hp" aria-hidden="true"><input id="tfWeb" tabindex="-1" autocomplete="off"></div>
        </div>
        <div class="tf-send"><button type="submit" id="tfBtn">Отправить</button><span class="tf-msg" id="tfMsg" role="status"></span></div>
      </form>
    </details>` : ""}
    <div class="tf-links">
      <a href="${root}">стартовая</a> · <a href="${root}parent/">кабинет родителя</a> · <a href="${root}privacy.html">конфиденциальность</a> ·
      <a href="${root}teacher/">вход для учителя</a> · <a href="${root}teacher/builder.html" title="Учителя других предметов могут подать заявку и получить свой кабинет">вы учитель? присоединяйтесь</a>
    </div>
    <div class="tf-copy">© ${YEAR} <b>TechLab</b> · All rights reserved · Все права защищены<br>
      <span class="tf-a" title="Автор">A</span>Автор и администратор платформы — <b>Туманов Дмитрий</b> · IPLT „Alexandr Pușkin”, Chișinău</div>`;

  showTeachers();
  if (withForm) bindForm();
}

// Учителя платформы — список ведёт администратор (settings/teachers), показываем тех, у кого «на стартовой»
async function showTeachers() {
  const box = document.getElementById("tfTeach"); if (!box) return;
  const paint = (T) => {
    const list = Object.values(T || {}).filter((x) => x && x.show && x.name);
    if (!list.length) { box.innerHTML = ""; return; }
    const sn = (id) => SUBJECTS.find((s) => s.id === id)?.name || id;
    box.innerHTML = `<span style="font-weight:700">👩‍🏫 Учителя TechLab:</span>` + list.map((x) =>
      `<span class="t">${esc(x.name)}${x.subjects?.length ? ` <small>· ${esc(x.subjects.map(sn).join(", "))}</small>` : ""}</span>`).join("");
  };
  paint(cacheGet("teachers"));
  try { const T = await readDb("settings/teachers", { tries: 2 }); cachePut("teachers", T || {}); paint(T); } catch (e) {}
}

function bindForm() {
  const f = document.getElementById("tfForm"), msg = document.getElementById("tfMsg"), btn = document.getElementById("tfBtn");
  try { const me = JSON.parse(localStorage.getItem("techlab_student") || "null"); if (me?.name) { f.tfName.value = me.name; document.getElementById("tfWho").value = "student"; } } catch (e) {}
  const say = (t, ok) => { msg.textContent = t; msg.className = "tf-msg " + (ok ? "ok" : "err"); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const name = f.tfName.value.trim().replace(/\s+/g, " "), email = f.tfMail.value.trim(), text = f.tfText.value.trim();
    if (document.getElementById("tfWeb").value) return say("✓ Спасибо!", true);                    // бот заполнил скрытое поле
    if (name.length < 3) return say("Напишите фамилию и имя.", false);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say("Проверьте e-mail — в нём ошибка.", false);
    if (text.length < 5) return say("Напишите текст письма.", false);
    try { const last = Number(localStorage.getItem("techlab_fb_at") || 0); if (Date.now() - last < 60000) return say("Письмо уже отправлено. Следующее можно через минуту.", false); } catch (e) {}
    btn.disabled = true; btn.textContent = "Отправляю…";
    let code = "";
    try { code = JSON.parse(localStorage.getItem("techlab_student") || "null")?.code || ""; } catch (e) {}
    const body = { name: name.slice(0, 80), email: email.slice(0, 120), text: text.slice(0, 2000), who: document.getElementById("tfWho").value,
      page: location.pathname.slice(0, 120), code: code.slice(0, 20), at: { ".sv": "timestamp" } };
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(`${BASE}/feedback.json`, { method: "POST", body: JSON.stringify(body), signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error("HTTP " + r.status);
      try { localStorage.setItem("techlab_fb_at", String(Date.now())); } catch (e) {}
      f.tfText.value = ""; say("✓ Спасибо! Письмо отправлено администратору.", true);
    } catch (err) { say("Не удалось отправить — проверьте интернет и попробуйте ещё раз.", false); }
    btn.disabled = false; btn.textContent = "Отправить";
  };
}

mountFooter(document.getElementById("siteFoot"));
