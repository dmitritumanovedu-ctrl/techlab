// Стартовая страница: портал (ученик · родитель · учитель) или игровой центр вошедшего ученика
// Данные читаются быстрым HTTPS-запросом с таймаутом и повтором (engine/fbrest.js),
// последние данные хранятся на компьютере — страница открывается сразу даже при медленном интернете.
import { readDb, cacheGet, cachePut } from "./engine/fbrest.js?v=1";
import { SUBJECTS, TESTS, EXPEDITIONS, KINDS, kindOf } from "./tests.js?v=8";
import { getSession, signInStudent, signOutStudent, knownCode, forgetCode, cleanCode, levelOf, awardsOf, fmt1, esc, LEVEL_XP, clsKey, SESSION_EVENT } from "./engine/people.js?v=3";
import { t, pl, plw, gradeLabel, subjName as subjNameT, kindShortById, qualShow, LOCALE, LANG as LANG_ } from "./engine/i18n.js?v=1";
import "./engine/nav.js?v=2";
import { reviewBtn, openReview } from "./engine/review.js?v=1";

const L3 = (ru, ro, en) => ({ ru, ro, en })[LANG_] || ru;
// стили блока «Мои работы» по предметам и кнопки выхода в шапке
document.head.insertAdjacentHTML("beforeend", `<style>
  .ws-h{display:flex;justify-content:space-between;align-items:center;margin:14px 2px 8px;font-weight:800;font-size:15px}
  .ws-h b{background:#E8EDFF;color:#2E4BFF;border-radius:999px;padding:2px 10px;font-size:14px}
  a.wk{text-decoration:none;color:inherit;transition:background .15s}
  a.wk:hover{background:#E8EDFF}
  .me-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
  .me-out{font:inherit;font-weight:800;font-size:13px;background:#FDECEE;color:#C2253B;border:1px solid #F3B5BF;border-radius:999px;padding:7px 14px;cursor:pointer}
  .me-out:hover{background:#FBD9DE}
  .gc-sync{font-size:12px;color:var(--muted);margin-top:6px}
  .code-box .btn-p[disabled]{opacity:.6;cursor:wait}
  .p-code{background:var(--blue-l,#E8F0FE);padding:24px 26px;display:flex;flex-direction:column;gap:6px;justify-content:center;border-left:1px solid var(--line,#E3E6EB)}
  .p-code b{font-size:17px}.p-code .pc-sub{color:var(--muted,#5F6368);font-size:13px}
  .pc-row{display:flex;gap:8px;margin-top:10px}
  .pc-row input{flex:1;min-width:0;font:inherit;font-family:"Roboto Mono",ui-monospace,monospace;font-size:17px;letter-spacing:.05em;text-transform:uppercase;border:1.5px solid #9AA0A6;border-radius:6px;padding:10px 12px;background:#fff}
  .pc-row input:focus{outline:2px solid #1A73E8;outline-offset:1px;border-color:#1A73E8}
  .pc-go{font:inherit;font-weight:600;background:#1A73E8;color:#fff;border:0;border-radius:6px;padding:10px 18px;cursor:pointer;min-height:44px}
  .pc-go:hover{background:#1557B0}
  .pc-hint{font-size:12px;color:var(--muted,#5F6368);margin-top:6px;line-height:1.5}
  .portal .role .rt{display:flex;flex-direction:column;align-items:flex-start;text-align:left}
  .portal .role.main .rt small{color:rgba(255,255,255,.85);font-size:11px;font-weight:400}
  @media (max-width:720px){.p-code{border-left:0;border-top:1px solid var(--line,#E3E6EB)}}
  .gc-tasks{grid-column:1/-1}
  .tk-now{display:flex;align-items:center;gap:14px;background:#E8F0FE;border:1px solid #AECBFA;border-radius:12px;padding:12px 14px;margin:8px 0;text-decoration:none;color:inherit}
  .tk-now:hover{background:#D2E3FC}
  .tk-now .tk-go{margin-left:auto;background:#1A73E8;color:#fff;font-weight:700;border-radius:8px;padding:8px 14px;white-space:nowrap}
  .tk-h{font-weight:700;font-size:14px;color:var(--muted);margin:16px 2px 6px;text-transform:none}
  .tk-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px}
  .tk{display:flex;gap:10px;align-items:center;border:1px solid #DADCE0;border-radius:10px;padding:10px 12px;text-decoration:none;color:inherit;background:#fff}
  a.tk:hover{border-color:#1A73E8}
  .tk .tt{font-weight:600;font-size:14px;line-height:1.3}.tk .ts{font-size:12px;color:var(--muted);margin-top:2px}
  .tk .st{margin-left:auto;font-size:12px;font-weight:700;border-radius:999px;padding:3px 9px;white-space:nowrap}
  .st-open{background:#E6F4EA;color:#137333}.st-done{background:#E8F0FE;color:#1967D2}.st-closed{background:#F1F3F4;color:#5F6368}
  .tk-exp{border:1px solid #DADCE0;border-radius:12px;padding:10px 12px;margin-bottom:8px;background:#fff}
  .tk-exp b{font-size:14px}.tk-route{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  .tk-route .tk{padding:8px 10px;flex:1 1 200px}
  .code-box .retry{font:inherit;font-weight:800;background:none;border:0;color:var(--blue);text-decoration:underline;cursor:pointer;padding:0}
</style>`);
const box = document.getElementById("home");
const chip = document.getElementById("meChip");
// «🔍 Разбор работы» — кнопка в списке «Мои работы» (если учитель включил разбор)
let CUR_WORKS = {};
box.addEventListener("click", (e) => {
  const b = e.target.closest("[data-review]"); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  openReview(CUR_WORKS[b.dataset.review]);
});
const subjName = (id) => subjNameT(SUBJECTS.find((s) => s.id === id));
let renderNo = 0;
let LAST = null;                 // последние данные кабинета — для перерисовки «Моих заданий»

render();
// Оценки появляются сами: страница ученика перечитывает прогресс раз в минуту
setInterval(() => { if (getSession() && !document.hidden && !document.querySelector(".code-ov")) render(true); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && getSession()) render(true); });
// вход/выход (в т. ч. кнопкой 🏠 или в другой вкладке) — сразу перерисовываем
window.addEventListener(SESSION_EVENT, () => render());
window.addEventListener("storage", (e) => { if (e.key === "techlab_student") window.dispatchEvent(new CustomEvent(SESSION_EVENT)); });

// Пришли со страницы задания без кода (?next=…#login): открываем вход, после входа — обратно к заданию
const NEXT = (() => {
  try { const n = new URLSearchParams(location.search).get("next") || "";
    const root = new URL("./", location.href).pathname;
    return n.startsWith(root) && !n.includes("//") ? n : ""; } catch (e) { return ""; }
})();
function goNext() { if (NEXT) { location.replace(NEXT); return true; } return false; }
if (getSession() && NEXT) goNext();
else if (!getSession() && (NEXT || location.hash === "#login")) setTimeout(() => askCode(), 50);
// стартовая страница обновила список открытых заданий — перерисуем «Мои задания»
window.addEventListener("techlab:data", () => { if (LAST && getSession()?.code === LAST[0].code && !document.querySelector(".code-ov,.rv-ov")) center(...LAST); });

function logout() {
  signOutStudent();
  history.replaceState(null, "", location.pathname);       // убрать #раздел прошлого ученика
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  scrollTo(0, 0);
}

async function render(quiet = false) {
  const my = ++renderNo;
  const S = getSession();
  if (!S) { chip.innerHTML = `<button type="button" class="me-btn" id="chipIn">${t("sign_in")}</button>`; chip.querySelector("#chipIn").onclick = () => askCode(); return portal(); }
  // Кнопка выхода видна сразу — не ждёт загрузки данных
  chip.innerHTML = `<div class="me-row"><span class="me-chip"><span class="av">${esc(initials(S.name))}</span>${esc(short(S.name))} · ${esc(S.cls)}</span>
    <button type="button" class="me-out" id="chipOut">${esc(L3("Выйти", "Ieși", "Sign out"))}</button></div>`;
  chip.querySelector("#chipOut").onclick = logout;
  const ck = "me_" + S.code;
  const cached = cacheGet(ck);
  if (!quiet) center(S, cached?.P || { xp: 0, works: {} }, cached?.B || {}, cached?.CS ?? null, cached ? "" : t("loading_progress"));
  try {
    const [P, B, CS] = await Promise.all([readDb(`progress/${S.code}`), readDb("board").catch(() => ({})),
      readDb(`settings/classSubjects/${clsKey(S.cls)}`).catch(() => null)]);
    if (my !== renderNo || getSession()?.code !== S.code) return;          // ученик уже сменился
    const data = { P: P || { xp: 0, works: {} }, B: B || {}, CS: CS ? Object.keys(CS) : null };
    cachePut(ck, data);
    center(S, data.P, data.B, data.CS);
  } catch (e) {
    console.warn(e);
    if (my !== renderNo || getSession()?.code !== S.code) return;
    center(S, cached?.P || { xp: 0, works: {} }, cached?.B || {}, cached?.CS ?? null,
      L3("Интернет медленный — показаны сохранённые данные. Обновлю сам.", "Internet lent — se afișează datele salvate.", "Slow internet — showing saved data."));
  }
}

// ---------------- портал ----------------
function portal() {
  const h = new Date().getHours();
  const hello = h >= 5 && h < 12 ? L3("Доброе утро!", "Bună dimineața!", "Good morning!")
    : h >= 12 && h < 17 ? L3("Добрый день!", "Bună ziua!", "Good afternoon!") : L3("Добрый вечер!", "Bună seara!", "Good evening!");
  const sv = (d) => `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  box.innerHTML = `<section class="portal">
    <div class="p-text">
      <span class="p-tag">${t("p_tag")}</span>
      <h1>${hello}</h1>
      <p>${t("p_text")}</p>
      <div class="roles">
        <button type="button" class="role main" id="rStudent" title="${esc(t("r_student_s"))}"><span class="ri">${sv('<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>')}</span><span class="rt"><b>${t("r_student")}</b><small>${esc(L3("код на карточке, начинается с S", "codul de pe cartonaș, începe cu S", "code on your card, starts with S"))}</small></span></button>
        <a class="role" href="parent/" title="${esc(t("r_parent_s"))}"><span class="ri">${sv('<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 20c0-2 1-4 3-4.5"/>')}</span><span class="rt"><b>${t("r_parent")}</b></span></a>
        <a class="role" href="teacher/" title="${esc(t("r_teacher_s"))}"><span class="ri">${sv('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>')}</span><span class="rt"><b>${t("r_teacher")}</b></span></a>
      </div>
      <p class="p-demo"><a href="demo/">${t("p_demo")}</a></p>
    </div>
    <form class="p-code" id="pCode" novalidate>
      <b>${esc(L3("Войти по коду", "Intră cu codul", "Sign in with your code"))}</b>
      <span class="pc-sub">${esc(L3("Введи код с карточки, которую выдал учитель", "Introdu codul de pe cartonașul primit de la profesor", "Enter the code from the card your teacher gave you"))}</span>
      <div class="pc-row"><label for="pcIn" class="sr">${t("code_label")}</label>
        <input id="pcIn" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="14" placeholder="SXXX-XXXX">
        <button type="submit" class="pc-go">${t("sign_in")}</button></div>
      <span class="pc-hint">${esc(L3("Родитель? Код начинается с P", "Părinte? Codul începe cu P", "Parent? Your code starts with P"))} · <a href="parent/">${esc(L3("кабинет родителя", "cabinetul părintelui", "parent area"))}</a> · ${esc(L3("забыл код — спроси учителя", "ai uitat codul — întreabă profesorul", "forgot the code? ask your teacher"))}</span>
    </form>
  </section>`;
  document.getElementById("rStudent").onclick = () => askCode();
  document.getElementById("pCode").onsubmit = (e) => {
    e.preventDefault();
    const v = document.getElementById("pcIn").value.trim();
    if (!v) return document.getElementById("pcIn").focus();
    // код родителя — сразу в кабинет родителя
    if (cleanCode(v)[0] === "P") { location.href = "parent/?code=" + encodeURIComponent(cleanCode(v)); return; }
    askCode(v);
  };
}

function askCode(prefill = "") {
  if (typeof prefill !== "string") prefill = "";
  if (document.querySelector(".code-ov")) return;
  const o = document.createElement("div");
  o.className = "code-ov";
  o.innerHTML = `<form class="code-box" id="codeForm">
    <h2>${t("login_h")}</h2>
    <p>${t("login_p")}</p>
    <label for="codeIn" class="sr">${t("code_label")}</label>
    <input id="codeIn" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="14" placeholder="SXXX-XXXX" inputmode="text">
    <div class="err" id="codeErr" aria-live="polite"></div>
    <div class="cb-row"><button type="submit" class="btn-p" id="codeGo">${t("sign_in")}</button><button type="button" class="btn-g" id="codeX">${t("cancel")}</button></div>
    <small>${t("login_small")}</small></form>`;
  document.body.appendChild(o);
  const inp = o.querySelector("#codeIn"), err = o.querySelector("#codeErr"), go = o.querySelector("#codeGo");
  inp.focus();
  if (prefill) inp.value = prefill;
  let busy = false;
  const close = () => o.remove();
  o.querySelector("#codeX").onclick = close;
  o.addEventListener("click", (e) => { if (e.target === o && !busy) close(); });
  inp.oninput = () => { if (!busy) err.textContent = ""; };
  const done = (s) => { close(); signInStudent(s); if (goNext()) return; history.replaceState(null, "", location.pathname); window.dispatchEvent(new HashChangeEvent("hashchange")); scrollTo(0, 0); };

  o.querySelector("#codeForm").onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    let code = cleanCode(inp.value);
    if (code.length === 7 && code[0] !== "S" && code[0] !== "P") code = "S" + code;   // забыли букву S
    if (code.length < 6 || code[0] !== "S") { err.textContent = code[0] === "P" ? t("err_parent_code") : t("err_s"); return; }

    // Этот код уже входил на этом компьютере — пускаем сразу, проверяем в базе в фоне
    const known = knownCode(code);
    if (known) {
      done(known);
      readDb(`roster/${code}`, { tries: 2 }).then((s) => {
        if (s === null && getSession()?.code === code) { forgetCode(code); signOutStudent(); }   // учитель удалил код
        else if (s && getSession()?.code === code && (s.name !== known.name || s.cls !== known.cls)) signInStudent({ code, name: s.name, cls: s.cls });
      }).catch(() => {});
      return;
    }

    busy = true; go.disabled = true; inp.readOnly = true;
    try {
      const s = await readDb(`roster/${code}`, { tries: 3, timeout: 5000,
        onTry: (n, of) => { err.textContent = n === 1 ? t("checking") : L3(`Интернет медленный… попытка ${n} из ${of}`, `Internet lent… încercarea ${n} din ${of}`, `Slow internet… attempt ${n} of ${of}`); } });
      if (!s) { err.textContent = t("err_nocode"); return; }
      done({ code, name: s.name, cls: s.cls });
    } catch (x) {
      console.warn(x);
      err.innerHTML = `${esc(L3("Нет связи с сервером.", "Nu există conexiune cu serverul.", "No connection to the server."))} <button type="button" class="retry" id="codeRetry">${esc(L3("Попробовать ещё раз", "Încearcă din nou", "Try again"))}</button>`;
      o.querySelector("#codeRetry").onclick = () => o.querySelector("#codeForm").requestSubmit();
    } finally { busy = false; go.disabled = false; inp.readOnly = false; }
  };
  if (prefill) o.querySelector("#codeForm").requestSubmit();
}

// ---------------- игровой центр ----------------
function center(S, P, B, CS = null, note = "") {
  LAST = [S, P, B, CS, note];
  CUR_WORKS = P.works || {};
  const works = Object.entries(P.works || {}).map(([id, w]) => ({ ...w, id })).filter((w) => !CS || CS.includes(w.subject)).sort((a, b) => (b.date || 0) - (a.date || 0));
  const done = works.filter((w) => w.complete && !w.qual);
  const avg = done.length ? done.reduce((a, w) => a + w.grade, 0) / done.length : null;
  const xp = P.xp || 0, L = levelOf(xp);
  const aw = awardsOf(P.works);
  const honest = (() => { let r = 0; for (const w of works) { if (w.viol) break; r++; } return r; })();
  const grade = String(S.cls).split(" ")[0];
  const board = Object.values(B).filter((c) => String(c.cls).split(" ")[0] === grade).map((c) => ({ ...c, avg: c.n ? Math.round(c.xp / c.n) : 0 }))
    .sort((a, b) => b.avg - a.avg);
  const top = board[0]?.avg || 1;
  const date = new Date().toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
  const gColor = (g) => g >= 9 ? "g-hi" : g >= 7 ? "g-mid" : g >= 5 ? "g-lo" : "g-bad";

  box.innerHTML = `<section class="gc">
    <div class="gc-hello">
      <div class="mono gc-date">${esc(date)}</div>
      <h1>${esc(t("hello", { n: firstName(S.name) }))}</h1>
      <div class="xp-line"><span>${esc(t("level", { n: L.n, name: L.name }))}</span><span class="muted">${xp - L.from} / ${LEVEL_XP} XP</span></div>
      <div class="xp-bar"><i style="width:${L.pct}%"></i></div>
      <div class="muted xp-next">${esc(t("xp_next", { x: L.to - xp, next: L.next, total: xp }))}</div>
      <div class="gc-stats">
        <div class="st st-y"><b>${honest}</b><span>${plw(honest, "pl_honest")}</span></div>
        <div class="st st-g"><b>${avg === null ? "—" : fmt1(avg)}</b><span>${t("avg_grade")}</span></div>
        <div class="st st-v"><b>${aw.filter((a) => a.ok).length}</b><span>${plw(aw.filter((a) => a.ok).length, "pl_awards_of", { n: aw.length })}</span></div>
      </div>
      ${note ? `<div class="gc-sync">⏳ ${esc(note)}</div>` : ""}
      <button type="button" class="gc-out" id="logout">${t("not_me")}</button>
    </div>

    <div class="gc-grid">
      ${tasksHtml(S, P, CS)}
      <div class="gc-card">
        <h2>${t("my_works")}</h2>
        ${works.length ? bySubject(works).map(([sid, list]) => {
          const g = list.filter((w) => w.complete && !w.qual); const av = g.length ? g.reduce((x, w) => x + w.grade, 0) / g.length : null;
          const sj = SUBJECTS.find((x) => x.id === sid);
          return `<div class="ws-h"><span>${sj ? esc(sj.icon + " " + subjName(sid)) : ""}</span>${av !== null ? `<b>${fmt1(av)}</b>` : ""}</div>` +
            list.map((w) => `<${w.path ? `a href="${esc(w.path)}"` : "div"} class="wk">
            <span class="wg ${w.complete ? gColor(w.qual ? ({ "ОХ": 10, "Х": 8, "У": 6, "Н": 4 })[w.qual] : w.grade) : "g-wait"}" title="${esc(w.qualName || "")}">${w.complete ? (w.qual ? qualShow(w.qual) : w.grade) : "…"}</span>
            <div><div class="wt">${esc(w.title)}</div><div class="ws">${esc(kindShortById(w.kind, w.kindName || ""))}${w.complete ? ` · ${fmt1(w.total)} / ${w.max} · +${20 + w.grade * 10 + (w.viol ? 0 : 10)} XP` : " · " + t("waiting_check")}${w.date ? " · " + new Date(w.date).toLocaleDateString(LOCALE, { day: "numeric", month: "short" }) : ""}</div>${w.review ? reviewBtn(w.id) : ""}</div></${w.path ? "a" : "div"}>`).join("");
        }).join("") : `<p class="muted">${t("no_works_student")}</p>`}
        ${works.find((w) => w.summary) ? `<div class="tip"><b>${t("tip_last")}</b> ${esc(works.find((w) => w.summary).summary.advice)}</div>` : ""}
        <p class="muted small">${({ ru: "Твои оценки видишь только ты, твои родители и учитель.", ro: "Notele tale le vezi doar tu, părinții tăi și profesorul.", en: "Only you, your parents and your teacher can see your grades." })[LANG_] || ""}</p>
      </div>

      <div class="gc-card">
        <h2>${t("battle")} <small>${esc(gradeLabel(grade))}</small></h2>
        ${board.length ? board.map((c, i) => `<div class="bt ${c.cls === S.cls ? "me" : ""} ${i === 0 ? "top" : ""}">
            <span class="bn">${i + 1}</span><span class="bc">${esc(c.cls)}${c.cls === S.cls ? " · " + t("yours") : ""}</span>
            <span class="bb"><i style="width:${Math.max(6, Math.round(c.avg / top * 100))}%"></i></span><span class="bx">${c.avg}</span></div>`).join("")
          : `<p class="muted">${t("board_empty")}</p>`}
        <p class="muted small">${t("board_note")}</p>
      </div>

      <div class="gc-card">
        <h2>${t("awards")}</h2>
        <div class="aw">${aw.map((a) => `<div class="a ${a.ok ? "on a-" + a.k : ""}" title="${esc(a.name)}: ${esc(a.hint)}"><b>${esc(a.t)}</b><span>${esc(a.name)}</span></div>`).join("")}</div>
        <p class="muted small">${t("awards_hint")}</p>
      </div>
    </div>
  </section>`;
  document.getElementById("logout").onclick = logout;
}

// ---------------- «Мои задания»: тесты, миссии и квесты моего класса ----------------
function tasksHtml(S, P, CS) {
  const st = cacheGet("start", 3 * 864e5) || {};
  const SET = st.s || {}, PI = st.pi || {};
  const grade = String(S.cls).split(" ")[0];
  const okSubj = (sid) => !CS || CS.includes(sid);
  const builder = Object.entries(PI).map(([id, x]) => ({ id, type: "test", kind: x.kind || "to", subject: x.subject, grade: String(x.grade || ""), title: x.title, path: `b/?t=${id}` }));
  const items = TESTS.filter((x) => x.path).concat(builder).filter((x) => x.grade === grade && okSubj(x.subject));
  if (!items.length) return "";
  const works = P.works || {};
  const state = (x) => works[x.id] ? "done" : SET[x.id]?.open ? "open" : "closed";
  const sj = (id) => SUBJECTS.find((q) => q.id === id);
  const label = { open: L3("открыто", "deschis", "open"), done: L3("сдано", "predat", "done"), closed: L3("закрыто", "închis", "closed") };
  const mark = (x) => { const w = works[x.id]; return w && w.complete ? (w.qual ? qualShow(w.qual) : w.grade) : ""; };
  const row = (x, short = false) => { const k = state(x);
    return `<a class="tk" href="${esc(x.path)}"><span><div class="tt">${esc(short && x.type === "mission" ? L3("Миссия", "Misiunea", "Mission") + " " + x.n : x.title)}</div>
      <div class="ts">${esc(short ? x.title : (sj(x.subject) ? subjName(x.subject) : "") + " · " + (KINDS.find((q) => q.id === kindOf(x, SET).id)?.short || ""))}</div></span>
      <span class="st st-${k}">${label[k]}${k === "done" && mark(x) !== "" ? " · " + esc(mark(x)) : ""}</span></a>`; };
  const open = items.filter((x) => state(x) === "open");
  const exps = EXPEDITIONS.filter((e) => e.grade === grade && okSubj(e.subject))
    .map((e) => [e, items.filter((x) => x.expedition === e.id).sort((a, b) => a.n - b.n)]).filter(([, l]) => l.length);
  const tests = items.filter((x) => x.type !== "mission").sort((a, b) => ["open", "closed", "done"].indexOf(state(a)) - ["open", "closed", "done"].indexOf(state(b)));
  return `<div class="gc-card gc-tasks">
    <h2>${L3("Мои задания", "Sarcinile mele", "My tasks")}</h2>
    ${open.length ? open.map((x) => `<a class="tk-now" href="${esc(x.path)}"><span><div class="tt" style="font-weight:700">${esc(x.title)}</div>
        <div class="ts" style="font-size:13px;color:var(--muted)">${esc(sj(x.subject) ? subjName(x.subject) : "")} · ${L3("открыто учителем", "deschis de profesor", "opened by the teacher")}</div></span>
        <span class="tk-go">${x.type === "mission" ? L3("Начать миссию", "Începe misiunea", "Start mission") : L3("Начать", "Începe", "Start")}</span></a>`).join("")
      : `<p class="muted" style="margin:6px 2px">${L3("Сейчас открытых заданий нет — учитель откроет их на уроке.", "Acum nu sunt sarcini deschise.", "No open tasks right now.")}</p>`}
    ${exps.length ? `<div class="tk-h">${L3("Квесты и миссии", "Misiuni", "Quests and missions")}</div>` + exps.map(([e, l]) => `<div class="tk-exp"><b>${esc(e.title)}</b>
        <div class="tk-route">${l.map((x) => row(x, true)).join("")}</div></div>`).join("") : ""}
    ${tests.length ? `<div class="tk-h">${L3("Тесты и работы", "Teste", "Tests")}</div><div class="tk-list">${tests.map((x) => row(x)).join("")}</div>` : ""}
  </div>`;
}

function bySubject(works) {
  const m = new Map();
  for (const w of works) { if (!m.has(w.subject)) m.set(w.subject, []); m.get(w.subject).push(w); }
  return [...m.entries()];
}
function firstName(n) { const p = String(n).split(" "); return p[1] || p[0]; }
function short(n) { const p = String(n).split(" "); return p.length > 1 ? `${p[1]} ${p[0][0]}.` : n; }
function initials(n) { return String(n).split(" ").slice(0, 2).map((x) => x[0] || "").join("").toUpperCase(); }
