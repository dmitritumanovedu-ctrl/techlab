// Кабинет родителя: вход по коду родителя → оценки, работы, советы из разборов ИИ
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "../firebase-config.js";
import { SUBJECTS } from "../tests.js?v=8";
import { cleanCode, prettyCode, levelOf, awardsOf, fmt1, esc } from "../engine/people.js?v=2";
import { t, plw, subjName, kindShortById, qualShow, LOCALE } from "../engine/i18n.js?v=1";

const $ = (s) => document.querySelector(s);
const app = $("#app");
const db = getDatabase(initializeApp(firebaseConfig));
const KEY = "techlab_parent";
const subj = (id) => { const s = SUBJECTS.find((x) => x.id === id); return s ? { ...s, name: subjName(s) } : { name: "", icon: "" }; };
const codes = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } };
const saveCodes = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} };
let CUR = null;

start();
async function start() {
  const list = codes();
  if (!list.length) return login();
  CUR = list.includes(CUR) ? CUR : list[0];
  await show(CUR);
}

function login(err = "") {
  $("#who").innerHTML = "";
  app.innerHTML = `<div class="pc p-login">
    <h1>${t("pl_h1")}</h1>
    <p>${t("pl_p")}</p>
    <form id="f"><label for="c" class="sr">${t("pcode_label")}</label>
      <input id="c" autocomplete="off" spellcheck="false" maxlength="14" placeholder="PXXX-XXXX">
      <div class="err" id="e">${esc(err)}</div>
      <button class="btn-p" type="submit">${t("sign_in")}</button></form>
    <small class="muted">${t("pl_small")}</small></div>`;
  $("#c").focus();
  $("#f").onsubmit = async (ev) => {
    ev.preventDefault();
    const c = cleanCode($("#c").value);
    if (c[0] === "S") return ($("#e").textContent = t("pe_student"));
    if (c.length < 6 || c[0] !== "P") return ($("#e").textContent = t("pe_p"));
    $("#e").textContent = t("checking");
    try {
      const s = (await get(ref(db, `parentCodes/${c}`))).val();
      if (!s) return ($("#e").textContent = t("pe_none"));
      const list = codes().filter((x) => x !== c); list.unshift(c); saveCodes(list); CUR = c;
      show(c);
    } catch (x) { $("#e").textContent = t("pe_net"); }
  };
}

async function show(pcode) {
  app.innerHTML = `<div class="pc"><p class="muted">${t("loading")}</p></div>`;
  let scode, R, P;
  try {
    scode = (await get(ref(db, `parentCodes/${pcode}`))).val();
    if (!scode) { saveCodes(codes().filter((x) => x !== pcode)); return login(t("pe_expired")); }
    const [r, p] = await Promise.all([get(ref(db, `roster/${scode}`)), get(ref(db, `progress/${scode}`))]);
    R = r.val(); P = p.val() || { xp: 0, works: {} };
  } catch (e) { app.innerHTML = `<div class="pc"><h2>${t("p_nonet_h")}</h2><p>${t("p_nonet_p")}</p></div>`; return; }
  if (!R) { saveCodes(codes().filter((x) => x !== pcode)); return login(t("pe_nostudent")); }

  // переключатель детей
  const list = codes();
  const names = await Promise.all(list.map(async (c) => {
    if (c === pcode) return [c, R.name];
    try { const s = (await get(ref(db, `parentCodes/${c}`))).val(); const r = s && (await get(ref(db, `roster/${s}`))).val(); return [c, r ? r.name : prettyCode(c)]; }
    catch (e) { return [c, prettyCode(c)]; }
  }));
  $("#who").innerHTML = `<label for="child" class="muted">${t("child")}</label>
    <select id="child">${names.map(([c, n]) => `<option value="${c}" ${c === pcode ? "selected" : ""}>${esc(n)}</option>`).join("")}
      <option value="+">${t("add_child")}</option></select>
    <button type="button" class="p-out" id="out">${t("sign_out")}</button>`;
  $("#child").onchange = (e) => { if (e.target.value === "+") return login(); CUR = e.target.value; show(CUR); };
  $("#out").onclick = () => { if (confirm(t("confirm_out"))) { saveCodes([]); login(); } };

  const works = Object.values(P.works || {}).sort((a, b) => (b.date || 0) - (a.date || 0));
  const done = works.filter((w) => w.complete && !w.qual);
  const quals = works.filter((w) => w.complete && w.qual);
  const avg = done.length ? done.reduce((a, w) => a + w.grade, 0) / done.length : null;
  const pending = works.length - done.length;
  const viol = works.reduce((a, w) => a + (w.viol || 0), 0);
  const L = levelOf(P.xp || 0);
  const aw = awardsOf(P.works).filter((a) => a.ok);
  const bySubj = {};
  for (const w of done) (bySubj[w.subject] = bySubj[w.subject] || []).push(w.grade);
  const qualSubj = {}; for (const w of quals) (qualSubj[w.subject] = qualSubj[w.subject] || []).push(w.qual);
  const sumW = works.find((w) => w.summary);
  const fmtD = (t) => t ? new Date(t).toLocaleDateString(LOCALE, { day: "numeric", month: "long" }) : "";
  const gc = (g) => g >= 9 ? "g-hi" : g >= 7 ? "g-mid" : g >= 5 ? "g-lo" : "g-bad";
  const upd = P.updatedAt ? new Date(P.updatedAt).toLocaleString(LOCALE, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";

  app.innerHTML = `
  <h1 class="p-h1">${esc(t("p_success", { n: R.name }))} <small>${esc(R.cls)}</small></h1>
  <div class="p-stats">
    <div class="pc ps"><span>${t("ps_avg")}</span><b class="blue">${avg === null ? "—" : fmt1(avg)}</b><small>${t("by")} ${done.length} ${plw(done.length, "pl_checked")}${quals.length ? t("ps_qualnote") : ""}</small></div>
    <div class="pc ps"><span>${t("ps_done")}</span><b>${works.length}</b><small>${pending ? t("ps_pending", { n: pending }) : t("ps_allchecked")}</small></div>
    <div class="pc ps"><span>${t("ps_level")}</span><b>${L.n}</b><small>${esc(t("ps_level_s", { name: L.name, xp: P.xp || 0, a: aw.length }))}</small></div>
    <div class="pc ps"><span>${t("ps_viol")}</span><b class="${viol ? "red" : "green"}">${viol}</b><small>${viol ? t("ps_viol_y") : t("ps_viol_n")}</small></div>
  </div>

  <div class="p-grid">
    <div class="pc">
      <h2>${t("works_h")}</h2>
      ${works.length ? works.map((w) => `<div class="pw">
          <span class="wg ${w.complete ? gc(w.qual ? ({ "ОХ": 10, "Х": 8, "У": 6, "Н": 4 })[w.qual] : w.grade) : "g-wait"}" title="${esc(w.qualName || "")}">${w.complete ? (w.qual ? qualShow(w.qual) : w.grade) : "…"}</span>
          <div class="pw-t"><b>${esc(w.title)}</b><small>${esc(subj(w.subject).name)} · ${esc(kindShortById(w.kind, w.kindName || ""))}${w.retake ? " · " + t("retake_l") : ""} · ${fmtD(w.date)}</small></div>
          <span class="pw-p">${w.complete ? `${fmt1(w.total)} / ${w.max} ${t("pts")}` : t("checking_w")}</span></div>`).join("")
        : `<p class="muted">${t("p_noworks")}</p>`}
    </div>
    <div class="p-side">
      ${sumW ? `<div class="pc p-ai"><h2>${t("ai_h")}</h2><p class="muted small">${esc(sumW.title)}</p>
        ${sumW.summary.strengths ? `<p><b>${t("ai_good")}</b> ${esc(sumW.summary.strengths)}</p>` : ""}
        ${sumW.summary.gaps ? `<p><b>${t("ai_gaps")}</b> ${esc(sumW.summary.gaps)}</p>` : ""}
        ${sumW.summary.advice ? `<p><b>${t("ai_adv")}</b> ${esc(sumW.summary.advice)}</p>` : ""}</div>` : ""}
      <div class="pc"><h2>${t("by_subj")}</h2>
        ${Object.keys(bySubj).length ? Object.entries(bySubj).map(([s, g]) => {
          const a = g.reduce((x, y) => x + y, 0) / g.length;
          return `<div class="sb"><span>${esc(subj(s).name)}</span><span class="sb-b"><i style="width:${a * 10}%"></i></span><b>${fmt1(a)}</b></div>`; }).join("")
          : ""}
        ${Object.entries(qualSubj).map(([s, q]) => `<div class="sb"><span>${esc(subj(s).name)}</span><b style="font-size:13px">${["ОХ", "Х", "У", "Н"].filter((c) => q.includes(c)).map((c) => `${qualShow(c)} × ${q.filter((x) => x === c).length}`).join(" · ")}</b></div>`).join("")}
        ${!Object.keys(bySubj).length && !Object.keys(qualSubj).length ? `<p class="muted">${t("no_checked")}</p>` : ""}
      </div>
      <div class="pc p-note"><h2>${t("how_h")}</h2>
        <p class="small">${t("how_p")}${upd ? esc(t("upd", { d: upd })) : ""}</p></div>
    </div>
  </div>`;
}
