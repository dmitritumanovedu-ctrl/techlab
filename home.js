// Стартовая страница: портал (ученик · родитель · учитель) или игровой центр вошедшего ученика
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, goOnline, goOffline } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { SUBJECTS } from "./tests.js?v=8";
import { getSession, setSession, clearSession, cleanCode, levelOf, awardsOf, fmt1, esc, LEVEL_XP, clsKey } from "./engine/people.js?v=2";
import { t, pl, plw, gradeLabel, subjName as subjNameT, kindShortById, qualShow, LOCALE, LANG as LANG_ } from "./engine/i18n.js?v=1";

// стили блока «Мои работы» по предметам
document.head.insertAdjacentHTML("beforeend", `<style>
  .ws-h{display:flex;justify-content:space-between;align-items:center;margin:14px 2px 8px;font-weight:800;font-size:15px}
  .ws-h b{background:#E8EDFF;color:#2E4BFF;border-radius:999px;padding:2px 10px;font-size:14px}
  a.wk{text-decoration:none;color:inherit;transition:background .15s}
  a.wk:hover{background:#E8EDFF}
</style>`);
const box = document.getElementById("home");
const chip = document.getElementById("meChip");
let db = null;
try { db = getDatabase(initializeApp(firebaseConfig, "home")); } catch (e) { console.warn(e); }
const subjName = (id) => subjNameT(SUBJECTS.find((s) => s.id === id));

render();
// Оценки появляются сами: страница ученика перечитывает прогресс раз в минуту
setInterval(() => { if (getSession() && !document.hidden && !document.querySelector(".code-ov")) render(true); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && getSession()) render(true); });

async function render(quiet = false) {
  const S = getSession();
  if (!S) { chip.innerHTML = `<button type="button" class="me-btn" id="chipIn">${t("sign_in")}</button>`; chip.querySelector("#chipIn").onclick = askCode; return portal(); }
  chip.innerHTML = `<span class="me-chip"><span class="av">${esc(initials(S.name))}</span>${esc(short(S.name))} · ${esc(S.cls)}</span>`;
  if (!quiet) box.innerHTML = `<div class="gc-load">${t("loading_progress")}</div>`;
  let P = null, B = {}, CS = null;
  try {
    goOnline(db);
    const [p, b, cs] = await Promise.all([get(ref(db, `progress/${S.code}`)), get(ref(db, "board")),
      get(ref(db, `settings/classSubjects/${clsKey(S.cls)}`)).catch(() => null)]);
    P = p.val(); B = b.val() || {}; CS = cs?.val() ? Object.keys(cs.val()) : null;
  } catch (e) { console.warn(e); }
  finally { try { goOffline(db); } catch (e) {} }
  center(S, P || { xp: 0, works: {} }, B, CS);
}

// ---------------- портал ----------------
function portal() {
  box.innerHTML = `<section class="portal">
    <div class="p-text">
      <span class="p-tag mono">${t("p_tag")}</span>
      <h1>${t("p_h1")}</h1>
      <p>${t("p_text")}</p>
      <p style="margin-top:12px"><a href="demo/" style="color:var(--blue);font-weight:800">${t("p_demo")}</a></p>
    </div>
    <div class="roles">
      <button type="button" class="role main" id="rStudent">
        <span class="ri"><svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg></span>
        <span class="rt"><b>${t("r_student")}</b><small>${t("r_student_s")}</small></span><span class="ra">→</span></button>
      <a class="role" href="parent/">
        <span class="ri par"><svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 20c0-2 1-4 3-4.5"/></svg></span>
        <span class="rt"><b>${t("r_parent")}</b><small>${t("r_parent_s")}</small></span><span class="ra">→</span></a>
      <a class="role" href="teacher/">
        <span class="ri tch"><svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></span>
        <span class="rt"><b>${t("r_teacher")}</b><small>${t("r_teacher_s")}</small></span><span class="ra">→</span></a>
    </div>
  </section>`;
  document.getElementById("rStudent").onclick = askCode;
}

function askCode() {
  const o = document.createElement("div");
  o.className = "code-ov";
  o.innerHTML = `<form class="code-box" id="codeForm">
    <h2>${t("login_h")}</h2>
    <p>${t("login_p")}</p>
    <label for="codeIn" class="sr">${t("code_label")}</label>
    <input id="codeIn" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="14" placeholder="SXXX-XXXX">
    <div class="err" id="codeErr"></div>
    <div class="cb-row"><button type="submit" class="btn-p">${t("sign_in")}</button><button type="button" class="btn-g" id="codeX">${t("cancel")}</button></div>
    <small>${t("login_small")}</small></form>`;
  document.body.appendChild(o);
  const inp = o.querySelector("#codeIn"); inp.focus();
  o.querySelector("#codeX").onclick = () => o.remove();
  o.addEventListener("click", (e) => { if (e.target === o) o.remove(); });
  o.querySelector("#codeForm").onsubmit = async (e) => {
    e.preventDefault();
    const code = cleanCode(inp.value), err = o.querySelector("#codeErr");
    if (code.length < 6 || code[0] !== "S") { err.textContent = code[0] === "P" ? t("err_parent_code") : t("err_s"); return; }
    err.textContent = t("checking");
    try {
      goOnline(db);
      const s = (await get(ref(db, `roster/${code}`))).val();
      if (!s) { err.textContent = t("err_nocode"); return; }
      setSession({ code, name: s.name, cls: s.cls });
      o.remove(); render();
    } catch (x) { err.textContent = t("err_net"); }
    finally { try { goOffline(db); } catch (e) {} }
  };
}

// ---------------- игровой центр ----------------
function center(S, P, B, CS = null) {
  const works = Object.values(P.works || {}).filter((w) => !CS || CS.includes(w.subject)).sort((a, b) => (b.date || 0) - (a.date || 0));
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
      <button type="button" class="gc-out" id="logout">${t("not_me")}</button>
    </div>

    <div class="gc-grid">
      <div class="gc-card">
        <h2>${t("my_works")}</h2>
        ${works.length ? bySubject(works).map(([sid, list]) => {
          const g = list.filter((w) => w.complete && !w.qual); const av = g.length ? g.reduce((x, w) => x + w.grade, 0) / g.length : null;
          const sj = SUBJECTS.find((x) => x.id === sid);
          return `<div class="ws-h"><span>${sj ? esc(sj.icon + " " + subjName(sid)) : ""}</span>${av !== null ? `<b>${fmt1(av)}</b>` : ""}</div>` +
            list.map((w) => `<${w.path ? `a href="${esc(w.path)}"` : "div"} class="wk">
            <span class="wg ${w.complete ? gColor(w.qual ? ({ "ОХ": 10, "Х": 8, "У": 6, "Н": 4 })[w.qual] : w.grade) : "g-wait"}" title="${esc(w.qualName || "")}">${w.complete ? (w.qual ? qualShow(w.qual) : w.grade) : "…"}</span>
            <div><div class="wt">${esc(w.title)}</div><div class="ws">${esc(kindShortById(w.kind, w.kindName || ""))}${w.complete ? ` · ${fmt1(w.total)} / ${w.max} · +${20 + w.grade * 10 + (w.viol ? 0 : 10)} XP` : " · " + t("waiting_check")}${w.date ? " · " + new Date(w.date).toLocaleDateString(LOCALE, { day: "numeric", month: "short" }) : ""}</div></div></${w.path ? "a" : "div"}>`).join("");
        }).join("") : `<p class="muted">${t("no_works_student")}</p>`}
        ${works.find((w) => w.summary) ? `<div class="tip"><b>${t("tip_last")}</b> ${esc(works.find((w) => w.summary).summary.advice)}</div>` : ""}
        <p class="muted small">🔒 ${({ ru: "Твои оценки видишь только ты, твои родители и учитель.", ro: "Notele tale le vezi doar tu, părinții tăi și profesorul.", en: "Only you, your parents and your teacher can see your grades." })[LANG_] || ""}</p>
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
  document.getElementById("logout").onclick = () => { clearSession(); render(); };
}

function bySubject(works) {
  const m = new Map();
  for (const w of works) { if (!m.has(w.subject)) m.set(w.subject, []); m.get(w.subject).push(w); }
  return [...m.entries()];
}
function firstName(n) { const p = String(n).split(" "); return p[1] || p[0]; }
function short(n) { const p = String(n).split(" "); return p.length > 1 ? `${p[1]} ${p[0][0]}.` : n; }
function initials(n) { return String(n).split(" ").slice(0, 2).map((x) => x[0] || "").join("").toUpperCase(); }
