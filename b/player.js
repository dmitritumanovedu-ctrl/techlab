// TechLab · страница ученика для тестов из конструктора: b/?t=<id>
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, set, update, get, onValue, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "../firebase-config.js";
import { variantOf, renderItem, answered, esc } from "../engine/btest.js?v=1";
import { tb, itemLabels } from "../engine/b-i18n.js?v=1";
import { mountLangSwitch, subjName, gradeLabel } from "../engine/i18n.js?v=1";
import { CLASSES } from "../engine/people.js?v=2";
import { SUBJECTS } from "../tests.js?v=8";

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const ID = (new URLSearchParams(location.search).get("t") || "").replace(/[^A-Za-z0-9_-]/g, "");
const LS_KEY = "techlab_attempt_" + ID;
const L = itemLabels();
const db = getDatabase(initializeApp(firebaseConfig));
const P = `results/${ID}`;

let TEST = null, V = null, S = null;   // S = { id, name, cls, variant, deadline, answers, viol }
let active = false, finishing = false, timerId = null, saveTimer = null, blurTimer = null;

mountLangSwitch($("#langSw"));
$("#btnSubmit").textContent = tb("p_submit");
$("#loadTxt").textContent = tb("loading");
init();

async function init() {
  if (!ID) return fatal(tb("p_noTest"));
  try { TEST = (await get(ref(db, `pub/${ID}`))).val(); } catch (e) { return fatal(tb("p_net")); }
  if (!TEST || !TEST.items?.length) return fatal(tb("p_noTest"));
  TEST.id = ID;
  document.title = TEST.title + " · TechLab";
  $("#hTitle").textContent = TEST.title;
  const s = SUBJECTS.find((x) => x.id === TEST.subject);
  $("#hWho").textContent = [s ? subjName(s) : "", TEST.grade ? gradeLabel(TEST.grade) : ""].filter(Boolean).join(" · ");

  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    try {
      const r = (await get(ref(db, `${P}/${saved}`))).val();
      if (r && Date.now() > (r.deadline || 0) + 5 * 60000) {
        if (r.status === "in_progress") await update(ref(db, `${P}/${saved}`), { status: "submitted", reason: "timeout", submittedAt: serverTimestamp() }).catch(() => {});
        localStorage.removeItem(LS_KEY);
        return showLogin();
      }
      if (r) {
        S = { id: saved, name: r.name, cls: r.cls, variant: r.variant, deadline: r.deadline, answers: r.answers || {}, viol: r.violations || 0 };
        V = variantOf(TEST, S.variant);
        if (r.status === "in_progress") return resume(r);
        return showDone(r.reason);
      }
    } catch (e) { console.warn(e); }
    localStorage.removeItem(LS_KEY);
  }
  showLogin();
}

function fatal(msg) { app.innerHTML = `<div class="card center"><h2>TechLab</h2><p>${esc(msg)}</p><a class="btn" href="../">${esc(tb("p_home"))}</a></div>`; }

// ---------- вход ----------
function showLogin() {
  const cls = CLASSES.filter((c) => !TEST.grade || c.startsWith(TEST.grade + " "));
  app.innerHTML = `<div class="card center">
    <div class="bt-ribbon">${esc(TEST.title)}</div>
    <h2>${esc(tb("p_enter"))}</h2>
    <label class="f" for="inName">${esc(tb("p_name"))}</label>
    <input type="text" id="inName" autocomplete="off" maxlength="60" placeholder="${esc(tb("p_namePh"))}">
    <label class="f" for="inCls">${esc(tb("p_cls"))}</label>
    <select id="inCls"><option value="">${esc(tb("p_clsPick"))}</option>${(cls.length ? cls : CLASSES).map((c) => `<option>${esc(c)}</option>`).join("")}</select>
    <div class="err" id="err" role="alert"></div>
    <button class="btn" id="btnNext" type="button" style="margin-top:8px">${esc(tb("p_next"))}</button></div>`;
  $("#btnNext").onclick = () => {
    const name = $("#inName").value.trim().replace(/\s+/g, " "), c = $("#inCls").value;
    if (name.split(" ").length < 2 || name.length < 5) return ($("#err").textContent = tb("p_errName"));
    if (!c) return ($("#err").textContent = tb("p_errCls"));
    showRules(name, c);
  };
}

function showRules(name, cls) {
  const pr = TEST.protect || {};
  const max = TEST.items.reduce((s, it) => s + (Number(it.pts) || 0) + (it.type === "tf" && it.explain ? Number(it.whyPts) || 0 : 0), 0);
  app.innerHTML = `<div class="card center" style="max-width:700px">
    <div class="bt-ribbon">${esc(TEST.title)}</div>
    <h2>${esc(tb("p_rulesH"))}</h2>
    <p>${tb("p_rulesIntro", { name: esc(name), cls: esc(cls), min: TEST.minutes, max, n: TEST.items.length })}</p>
    <ul class="rules">
      ${pr.fullscreen !== false ? `<li>${tb("p_r_fs")}</li>` : ""}
      ${pr.autosubmit !== false ? `<li>${tb("p_r_auto")}</li>` : ""}
      <li>${tb("p_r_copy")}</li>
      <li>${tb("p_r_save")}</li>
    </ul>
    <label class="check"><input type="checkbox" id="agree"> <span>${esc(tb("p_agree"))}</span></label>
    <div class="err" id="err" role="alert"></div>
    <button class="btn" id="btnStart" type="button" disabled>${esc(tb("p_start"))}</button>
    <button class="btn ghost" id="btnBack" type="button">${esc(tb("p_back"))}</button></div>`;
  $("#agree").onchange = (e) => ($("#btnStart").disabled = !e.target.checked);
  $("#btnBack").onclick = showLogin;
  $("#btnStart").onclick = async () => {
    const b = $("#btnStart"); b.disabled = true; b.textContent = tb("p_connecting");
    try {
      const open = (await get(ref(db, `settings/${ID}/open`))).val();
      if (!open) { $("#err").textContent = tb("p_notOpen"); b.disabled = false; b.textContent = tb("p_start"); return; }
      if (pr.fullscreen !== false) await enterFullscreen();
      const variant = 1 + Math.floor(Math.random() * (TEST.variants || 1));
      const now = Date.now();
      const rec = { name, cls, variant, status: "in_progress", startedAt: now, deadline: now + TEST.minutes * 60000,
        updatedAt: serverTimestamp(), violations: 0, answers: {}, ua: navigator.userAgent.slice(0, 120) };
      const r = push(ref(db, P));
      await set(r, rec);
      localStorage.setItem(LS_KEY, r.key);
      S = { id: r.key, name, cls, variant, deadline: rec.deadline, answers: {}, viol: 0 };
      V = variantOf(TEST, variant);
      startWork();
    } catch (e) { console.error(e); $("#err").textContent = tb("p_errConn"); b.disabled = false; b.textContent = tb("p_start"); }
  };
}

function resume(r) {
  if (Date.now() >= r.deadline) { S.answers = r.answers || {}; return finish("timeout"); }
  app.innerHTML = `<div class="card center"><h2>${esc(tb("p_resumeH"))}</h2>
    <p>${esc(r.name)}, ${esc(r.cls)}. ${esc(tb("p_resumeP"))}</p>
    <button class="btn" id="btnCont" type="button">${esc(tb("p_continue"))}</button></div>`;
  $("#btnCont").onclick = async () => { if (TEST.protect?.fullscreen !== false) await enterFullscreen(); startWork(); };
}

// ---------- работа ----------
function startWork() {
  active = true; finishing = false;
  $("#hWho").textContent = `${S.name} · ${S.cls} · ${tb("variant")} ${S.variant}`;
  const items = V.order.map((id) => TEST.items.find((x) => x.id === id)).filter(Boolean);
  app.innerHTML = items.map((it, i) => renderItem(it, V.per[it.id], S.answers[it.id], i + 1, L)).join("") + `<div style="height:70px"></div>`;
  $("#bottomBar").hidden = false; $("#timer").hidden = false;
  $("#btnSubmit").onclick = askSubmit;
  updateProgress();
  clearInterval(timerId); timerId = setInterval(tick, 1000); tick();
  watchRecord();
}

app.addEventListener("click", (e) => {
  const b = e.target.closest("[data-role=tf]"); if (!b || !active) return;
  const q = b.dataset.q, A = (S.answers[q] = { ...(S.answers[q] || {}), v: b.dataset.v });
  b.parentElement.querySelectorAll("[data-role=tf]").forEach((x) => { const on = x.dataset.v === A.v; x.classList.toggle("ghost", !on); x.setAttribute("aria-pressed", on); });
  changed();
});
app.addEventListener("change", onInput);
app.addEventListener("input", onInput);
function onInput(e) {
  const el = e.target; if (!active || !el.dataset?.role) return;
  const q = el.dataset.q, role = el.dataset.role;
  if (role === "choice") {
    if (el.type === "checkbox") S.answers[q] = [...app.querySelectorAll(`[name="i_${q}"]:checked`)].map((x) => x.value);
    else S.answers[q] = el.value;
    app.querySelectorAll(`[name="i_${q}"]`).forEach((x) => x.closest(".opt").classList.toggle("on", x.checked));
  } else if (role === "why") S.answers[q] = { ...(S.answers[q] || {}), why: el.value.slice(0, 2000) };
  else if (role === "input") S.answers[q] = el.value.slice(0, 200);
  else if (role === "open") S.answers[q] = el.value.slice(0, 4000);
  else if (role === "match") S.answers[q] = { ...(S.answers[q] || {}), [el.dataset.l]: el.value };
  else if (role === "sort") S.answers[q] = { ...(S.answers[q] || {}), [el.dataset.c]: el.value };
  else return;
  changed();
}

function changed() { updateProgress(); $("#savedState").textContent = tb("p_saving"); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 1500); }
async function saveNow() {
  if (!S || finishing) return;
  try { await update(ref(db, `${P}/${S.id}`), { answers: S.answers, updatedAt: serverTimestamp() }); $("#savedState").textContent = tb("p_saved"); }
  catch (e) { $("#savedState").textContent = tb("p_saveErr"); }
}
function updateProgress() {
  const n = TEST.items.filter((it) => answered(it, S.answers[it.id])).length;
  $("#progress").textContent = tb("p_progress", { n, all: TEST.items.length });
  return n;
}
function tick() {
  const left = Math.max(0, S.deadline - Date.now());
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  const el = $("#timer"); el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  el.classList.toggle("low", left < 5 * 60000);
  if (left <= 0) finish("timeout");
}

function askSubmit() {
  const n = updateProgress(), all = TEST.items.length;
  modal(`<h2>${esc(tb("p_askH"))}</h2><p>${esc(tb("p_progress", { n, all }))}${n < all ? " " + esc(tb("p_askEmpty")) : ""}</p>
    <p class="muted">${esc(tb("p_askNote"))}</p>
    <button class="btn" id="mYes" type="button">${esc(tb("p_askYes"))}</button> <button class="btn ghost" id="mNo" type="button">${esc(tb("p_askNo"))}</button>`);
  $("#mYes").onclick = () => finish("manual");
  $("#mNo").onclick = closeModal;
}

async function finish(reason, evType) {
  if (finishing || !S) return;
  const extra = {};
  if (evType && active) { S.viol = (S.viol || 0) + 1; extra.violations = S.viol; extra[`events/${push(ref(db, `${P}/${S.id}/events`)).key}`] = { type: evType, at: Date.now() }; }
  finishing = true; active = false;
  clearInterval(timerId); clearTimeout(saveTimer); clearTimeout(blurTimer);
  try { await update(ref(db, `${P}/${S.id}`), { answers: S.answers, status: "submitted", reason, submittedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra }); }
  catch (e) { console.error(e); }
  showDone(reason);
}

function showDone(reason) {
  active = false; closeModal();
  $("#bottomBar").hidden = true; $("#timer").hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const auto = reason && reason !== "manual";
  app.innerHTML = `<div class="card center"><div class="bt-ribbon">${esc(TEST.title)}</div>
    <h2>${esc(auto ? tb("p_doneAuto") : tb("p_done"))}</h2>
    <p>${esc(tb("r_" + (reason || "manual")) || tb("r_manual"))}</p>
    <p class="muted">${S ? `${esc(S.name)}, ${esc(S.cls)} · ${esc(tb("variant"))} ${S.variant}` : ""}</p>
    <p>${esc(tb("p_doneNote"))}</p><a class="btn ghost" href="../">${esc(tb("p_home"))}</a></div>`;
  watchRecord();
}

// учитель может разрешить продолжить или завершить работу
let unwatch = null;
function watchRecord() {
  if (!S || unwatch) return;
  unwatch = onValue(ref(db, `${P}/${S.id}`), (snap) => {
    const r = snap.val(); if (!r) return;
    if (r.status === "in_progress" && !active && !$("#btnCont")) { finishing = false; S.deadline = r.deadline; S.answers = r.answers || S.answers; S.viol = r.violations || S.viol; resume(r); }
    else if (r.status === "submitted" && active) { finishing = true; active = false; clearInterval(timerId); showDone(r.reason || "teacher"); }
  });
}

// ---------- защита ----------
async function enterFullscreen() {
  try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen(); } catch (e) {}
}
function logViolation(type) {
  if (!S || !active) return;
  S.viol = (S.viol || 0) + 1;
  const k = push(ref(db, `${P}/${S.id}/events`)).key;
  update(ref(db, `${P}/${S.id}`), { violations: S.viol, [`events/${k}`]: { type, at: Date.now() } }).catch(() => {});
}
const AUTO = () => TEST?.protect?.autosubmit !== false;
document.addEventListener("visibilitychange", () => {
  if (!active || document.visibilityState !== "hidden") return;
  if (AUTO()) finish("tab", "tab"); else logViolation("tab");
});
window.addEventListener("blur", () => {
  if (!active) return;
  clearTimeout(blurTimer);
  blurTimer = setTimeout(() => { if (active && !document.hasFocus()) { if (AUTO()) finish("blur", "blur"); else logViolation("blur"); } }, 400);
});
window.addEventListener("focus", () => clearTimeout(blurTimer));
window.addEventListener("pagehide", () => { if (active) finish("close", "close"); });
window.addEventListener("beforeunload", (e) => { if (active) { e.preventDefault(); e.returnValue = ""; } });
document.addEventListener("fullscreenchange", () => {
  if (active && TEST.protect?.fullscreen !== false && !document.fullscreenElement) {
    logViolation("fullscreen");
    modal(`<h2>${esc(tb("p_fsH"))}</h2><p>${esc(tb("p_fsP"))}</p><button class="btn" id="mFs" type="button">${esc(tb("p_fsBtn"))}</button>`);
    $("#mFs").onclick = async () => { closeModal(); await enterFullscreen(); };
  }
});
document.addEventListener("contextmenu", (e) => { if (active) e.preventDefault(); });
for (const ev of ["copy", "cut", "paste", "drop"]) {
  document.addEventListener(ev, (e) => { if (!active) return; e.preventDefault(); if (ev !== "drop") logViolation(ev === "paste" ? "paste" : "copy"); });
}
document.addEventListener("keydown", (e) => {
  if (!active) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  const devtools = k === "f12" || (ctrl && e.shiftKey && ["i", "j", "c", "k"].includes(k)) || (ctrl && k === "u");
  const blocked = ctrl && ["c", "v", "x", "s", "p", "f", "g", "h", "o", "n", "t"].includes(k);
  if (devtools || blocked) { e.preventDefault(); e.stopPropagation(); if (devtools) logViolation("devtools"); }
}, true);

function modal(html) { closeModal(); const o = document.createElement("div"); o.className = "overlay"; o.id = "overlay"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.innerHTML = `<div class="card">${html}</div>`; document.body.appendChild(o); }
function closeModal() { $("#overlay")?.remove(); }
