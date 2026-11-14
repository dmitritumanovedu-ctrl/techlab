// =====================================================================
//  TechLab · Конструктор тестов (страница учителя)
//  #/            — мои тесты
//  #/e/<id>      — редактор (список заданий · редактор · настройки / вид ученика)
//  #/r/<id>      — результаты: автопроверка, ИИ, ручные баллы, CSV, PDF
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";
import { SUBJECTS, KINDS } from "../tests.js?v=8";
import { TYPES, esc, uid, newItem, toPublic, variantOf, renderItem, gradeAttempt, importItems, maxOf, evalFormula, fmtNum, fillParams } from "../engine/btest.js?v=1";
import { tb, itemLabels, typeName } from "../engine/b-i18n.js?v=1";
import { mountLangSwitch, subjName, kindT, gradeLabel, qualShow, LOCALE, LANG } from "../engine/i18n.js?v=1";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $("#app");
const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb), auth = getAuth(fb);
const SITE = new URL("../", location.href).href;
const L = itemLabels();
const fmt = (n) => String(Math.round((n || 0) * 10) / 10).replace(".", ",");
const fmtDT = (ms) => ms ? new Date(ms).toLocaleString(LOCALE, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KINDS_T = KINDS.map(kindT);

let ALL = {}, SET = {}, T = null, SEL = null, TAB = "set", PV = 1, saveTimer = null, unsub = [];
let RES = {}, KEY = null, AICFG = null, filterCls = "", USER = null;
const aiQueue = []; let aiBusy = false;

$("#hSub").textContent = tb("b_title");
document.title = "TechLab · " + tb("b_title");
mountLangSwitch($("#langSw"));

// ---------------- вход ----------------
onAuthStateChanged(auth, async (user) => {
  stopListeners(); USER = user;
  if (!user) return showLogin();
  $("#who").innerHTML = `${esc(user.email)} · <a href="#" id="logout">${esc(tb("b_logout"))}</a>`;
  $("#logout").onclick = (e) => { e.preventDefault(); signOut(auth); };
  try {
    const [b, s] = await Promise.all([get(ref(db, "builder")), get(ref(db, "settings"))]);
    ALL = b.val() || {}; SET = s.val() || {};
  } catch (e) {
    console.warn(e);
    app.innerHTML = `<div class="card center" style="max-width:640px"><h2>${esc(tb("b_noAccess"))}</h2><p>${tb("b_noAccessP")}</p></div>`;
    return;
  }
  try { AICFG = (await get(ref(db, "keys/_ai"))).val(); } catch (e) {}
  route();
});
addEventListener("hashchange", () => { if (USER) route(); });

function showLogin() {
  $("#who").textContent = "";
  app.innerHTML = `<div class="card center"><h2>${esc(tb("b_loginH"))}</h2><p class="muted">${esc(tb("b_loginP"))}</p>
    <div class="err" id="err" role="alert"></div><button class="btn" id="go" type="button">${esc(tb("b_loginBtn"))}</button></div>`;
  $("#go").onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { $("#err").textContent = e.code || e.message; } };
}
function stopListeners() { unsub.forEach((u) => u()); unsub = []; }

async function route() {
  stopListeners(); flushSave();
  const [, view, id] = location.hash.split("/");
  if (view === "e" && ALL[id]) return openEditor(id);
  if (view === "r" && ALL[id]) return openResults(id);
  showList();
}

// =====================================================================
//  Мои тесты
// =====================================================================
function statusOf(t) {
  if (!t.pubAt) return ["draft", tb("st_draft")];
  if ((t.updatedAt || 0) > t.pubAt + 1500) return ["changed", tb("st_changed")];
  return ["pub", tb("st_pub")];
}
const subjOf = (id) => SUBJECTS.find((s) => s.id === id);

async function showList() {
  try { SET = (await get(ref(db, "settings"))).val() || {}; } catch (e) {}
  const list = Object.values(ALL).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const cur = SET.current?.id;
  app.innerHTML = `<div class="bd-list">
    <div class="bd-list-head"><div><h1>${esc(tb("b_myTests"))}</h1><p class="muted">${esc(tb("b_myTestsP"))}</p></div>
      <button class="btn" id="bNew" type="button">${esc(tb("b_new"))}</button></div>
    ${list.length ? `<div class="bd-cards">${list.map((t) => {
      const [st, stT] = statusOf(t), open = !!SET[t.id]?.open, s = subjOf(t.subject);
      return `<article class="bd-card">
        <div class="bd-chips"><span class="chip-st st-${st}">${esc(stT)}</span>${open ? `<span class="chip-st st-open">${esc(tb("st_open"))}</span>` : ""}${cur === t.id ? `<span class="chip-st st-now">${esc(tb("st_now"))}</span>` : ""}</div>
        <h2>${esc(t.title || tb("b_untitled"))}</h2>
        <p class="muted">${esc([s ? subjName(s) : "", t.grade ? gradeLabel(t.grade) : "", kindT(KINDS.find((k) => k.id === t.kind))?.short || ""].filter(Boolean).join(" · "))}</p>
        <p class="muted small">${esc(tb("b_cardMeta", { n: (t.items || []).length, max: fmt(maxOf(t)), min: t.minutes || 0, d: fmtDT(t.updatedAt) }))}</p>
        <div class="bd-actions">
          <a class="btn small" href="#/e/${t.id}">${esc(tb("b_edit"))}</a>
          <a class="btn small ghost" href="#/r/${t.id}">${esc(tb("b_results"))}</a>
          ${t.pubAt ? `<button class="btn small ghost" type="button" data-act="open" data-id="${t.id}">${esc(open ? tb("b_close") : tb("b_open"))}</button>
          <button class="btn small ghost" type="button" data-act="now" data-id="${t.id}">${esc(tb("b_setNow"))}</button>
          <button class="btn small ghost" type="button" data-act="link" data-id="${t.id}">${esc(tb("b_link"))}</button>` : ""}
          <button class="btn small ghost" type="button" data-act="dup" data-id="${t.id}">${esc(tb("b_dup"))}</button>
          <button class="btn small ghost danger" type="button" data-act="del" data-id="${t.id}">${esc(tb("b_del"))}</button>
        </div></article>`; }).join("")}</div>`
      : `<div class="card center"><h2>${esc(tb("b_emptyH"))}</h2><p class="muted">${esc(tb("b_emptyP"))}</p></div>`}</div>`;
  $("#bNew").onclick = createTest;
  $$("[data-act]").forEach((b) => b.onclick = () => listAction(b.dataset.act, b.dataset.id, b));
}

async function createTest() {
  const id = "b" + Date.now().toString(36);
  const s = SUBJECTS[0];
  const t = { id, title: tb("b_newTitle"), subject: s.id, grade: s.grades[0], kind: "to", minutes: 30, variants: 10, scale: s.id === "tech" ? "qual" : "10",
    shuffle: false, protect: { fullscreen: true, autosubmit: true }, items: [newItem("choice")], createdAt: Date.now(), updatedAt: Date.now() };
  await set(ref(db, `builder/${id}`), t);
  ALL[id] = t; location.hash = `#/e/${id}`;
}

async function listAction(act, id, btn) {
  const t = ALL[id];
  if (act === "open") { const v = !SET[id]?.open; await update(ref(db, `settings/${id}`), { open: v }); return showList(); }
  if (act === "now") {
    await set(ref(db, "settings/current"), { id, title: t.title, path: `b/?t=${id}`, subject: t.subject, grade: t.grade || "" });
    await update(ref(db, `settings/${id}`), { open: true });
    return showList();
  }
  if (act === "link") { const url = `${SITE}b/?t=${id}`; try { await navigator.clipboard.writeText(url); btn.textContent = tb("b_copied"); } catch (e) { prompt(tb("b_link"), url); } return; }
  if (act === "dup") {
    const nid = "b" + Date.now().toString(36);
    const c = JSON.parse(JSON.stringify(t)); c.id = nid; c.title = t.title + " · " + tb("b_copy"); delete c.pubAt; c.createdAt = c.updatedAt = Date.now();
    await set(ref(db, `builder/${nid}`), c); ALL[nid] = c; return showList();
  }
  if (act === "del") {
    if (!confirm(tb("b_delAsk", { t: t.title }))) return;
    await Promise.all([remove(ref(db, `builder/${id}`)), remove(ref(db, `pub/${id}`)), remove(ref(db, `pubIndex/${id}`)), remove(ref(db, `keys/${id}`)),
      remove(ref(db, `settings/${id}`)), SET.current?.id === id ? remove(ref(db, "settings/current")) : null].filter(Boolean)).catch((e) => alert(e.message));
    delete ALL[id]; return showList();
  }
}

// =====================================================================
//  Редактор
// =====================================================================
function openEditor(id) {
  T = JSON.parse(JSON.stringify(ALL[id]));
  T.items = T.items || []; T.protect = T.protect || { fullscreen: true, autosubmit: true };
  SEL = T.items[0]?.id || null; TAB = "set"; PV = 1;
  app.innerHTML = `<div class="bd-edit">
    <div class="bd-bar">
      <a class="btn small ghost" href="#/">${esc(tb("b_back"))}</a>
      <label class="sr" for="fTitle">${esc(tb("b_testTitle"))}</label>
      <input id="fTitle" class="bd-title" value="${esc(T.title)}" maxlength="140">
      <span id="stChip"></span><span class="muted small" id="saveSt"></span>
      <a class="btn small ghost" href="#/r/${T.id}">${esc(tb("b_results"))}</a>
      <button class="btn" id="bPub" type="button">${esc(tb("b_publish"))}</button>
    </div>
    <div class="bd-cols">
      <nav class="bd-left" aria-label="${esc(tb("b_items"))}" id="left"></nav>
      <section class="bd-center" id="center" aria-live="polite"></section>
      <aside class="bd-right" id="right"></aside>
    </div></div>`;
  $("#fTitle").oninput = (e) => { T.title = e.target.value; dirty(); };
  $("#bPub").onclick = publish;
  renderLeft(); renderCenter(); renderRight(); renderStatus();
}
const cur = () => T.items.find((x) => x.id === SEL);

function renderStatus() {
  const [st, stT] = statusOf({ ...T, updatedAt: T.updatedAt });
  $("#stChip").innerHTML = `<span class="chip-st st-${st}">${esc(stT)}</span>`;
}
function dirty(structural) {
  T.updatedAt = Date.now();
  $("#saveSt").textContent = tb("b_saving");
  clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700);
  if (structural) { renderLeft(); }
  else updateLeftItem();
  renderStatus();
  if (TAB === "view") renderRight();
}
async function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!T) return;
  try { await set(ref(db, `builder/${T.id}`), T); ALL[T.id] = JSON.parse(JSON.stringify(T)); $("#saveSt") && ($("#saveSt").textContent = tb("b_saved")); }
  catch (e) { $("#saveSt") && ($("#saveSt").textContent = tb("b_saveErr")); }
}
function flushSave() { if (saveTimer) saveNow(); }
addEventListener("beforeunload", flushSave);

const snippet = (it) => (it.text || "").replace(/\s+/g, " ").slice(0, 60) || tb("b_noText");
function itemPts(it) { return (Number(it.pts) || 0) + (it.type === "tf" && it.explain ? Number(it.whyPts) || 0 : 0); }

function renderLeft() {
  const max = maxOf(T);
  $("#left").innerHTML = `<div class="bd-cap">${esc(tb("b_items"))} · ${T.items.length}</div>
    <ol class="bd-items">${T.items.map((it, i) => `<li><button type="button" class="bd-item ${it.id === SEL ? "on" : ""} ${it.type === "open" ? "ai" : ""}" data-sel="${it.id}" aria-current="${it.id === SEL}">
      <span class="bd-num">${i + 1}</span><span class="bd-it"><b data-snip="${it.id}">${esc(snippet(it))}</b><small>${esc(typeName(it.type))} · <span data-pts="${it.id}">${fmt(itemPts(it))}</span> ${esc(L.pts)}</small></span></button></li>`).join("")}</ol>
    ${SEL ? `<div class="bd-move" role="group" aria-label="${esc(tb("b_itemActions"))}">
      <button type="button" class="btn small ghost" data-mv="up" aria-label="${esc(tb("b_up"))}" title="${esc(tb("b_up"))}">↑</button>
      <button type="button" class="btn small ghost" data-mv="down" aria-label="${esc(tb("b_down"))}" title="${esc(tb("b_down"))}">↓</button>
      <button type="button" class="btn small ghost" data-mv="dup">${esc(tb("b_dupItem"))}</button>
      <button type="button" class="btn small ghost danger" data-mv="del">${esc(tb("b_delItem"))}</button></div>` : ""}
    <button type="button" class="bd-add" id="bAdd" aria-expanded="false">${esc(tb("b_addItem"))}</button>
    <div class="bd-typemenu" id="typeMenu" hidden>${TYPES.map((ty) => `<button type="button" class="bd-tm" data-add="${ty}"><b>${esc(typeName(ty))}</b><small>${esc(tb("td_" + ty))}</small></button>`).join("")}</div>
    <button type="button" class="bd-ai" id="bAi">${esc(tb("b_aiGen"))}</button>
    <div class="bd-total"><b>${esc(fmt(max))} ${esc(tb("b_points"))}</b> · ${T.items.length} ${esc(tb("b_itemsShort"))} · ${esc(tb("b_minutes", { n: T.minutes }))}</div>`;
  $$("[data-sel]", $("#left")).forEach((b) => b.onclick = () => { SEL = b.dataset.sel; renderLeft(); renderCenter(); if (TAB === "view") renderRight(); });
  $$("[data-mv]", $("#left")).forEach((b) => b.onclick = () => moveItem(b.dataset.mv));
  $("#bAdd").onclick = () => { const m = $("#typeMenu"); m.hidden = !m.hidden; $("#bAdd").setAttribute("aria-expanded", String(!m.hidden)); };
  $$("[data-add]", $("#left")).forEach((b) => b.onclick = () => { const it = newItem(b.dataset.add); const i = T.items.findIndex((x) => x.id === SEL); T.items.splice(i + 1, 0, it); SEL = it.id; dirty(true); renderCenter(); $("#fText")?.focus(); });
  $("#bAi").onclick = aiDialog;
}
function updateLeftItem() {
  const it = cur(); if (!it) return;
  const s = $(`[data-snip="${it.id}"]`); if (s) s.textContent = snippet(it);
  const p = $(`[data-pts="${it.id}"]`); if (p) p.textContent = fmt(itemPts(it));
  const tot = $(".bd-total b"); if (tot) tot.textContent = `${fmt(maxOf(T))} ${tb("b_points")}`;
}
function moveItem(mv) {
  const i = T.items.findIndex((x) => x.id === SEL); if (i < 0) return;
  if (mv === "up" && i > 0) [T.items[i - 1], T.items[i]] = [T.items[i], T.items[i - 1]];
  if (mv === "down" && i < T.items.length - 1) [T.items[i + 1], T.items[i]] = [T.items[i], T.items[i + 1]];
  if (mv === "dup") { const c = JSON.parse(JSON.stringify(T.items[i])); c.id = uid("q"); (c.options || []).forEach((o) => (o.id = uid("o"))); (c.pairs || []).forEach((p) => { p.id = uid("l"); p.rid = uid("r"); }); (c.cards || []).forEach((x) => (x.id = uid("c"))); T.items.splice(i + 1, 0, c); SEL = c.id; }
  if (mv === "del") { if (!confirm(tb("b_delItemAsk"))) return; T.items.splice(i, 1); SEL = T.items[Math.min(i, T.items.length - 1)]?.id || null; }
  dirty(true); renderCenter();
}

// ---------- центр: редактор задания ----------
function field(id, label, html) { return `<div class="bd-f"><label for="${id}">${esc(label)}</label>${html}</div>`; }
function renderCenter() {
  const it = cur(), c = $("#center");
  if (!it) { c.innerHTML = `<div class="center muted" style="padding:40px">${esc(tb("b_noItems"))}</div>`; return; }
  const n = T.items.indexOf(it) + 1;
  let body = "";
  if (it.type === "choice") {
    body = `<label class="bd-check"><input type="checkbox" data-f="multi" ${it.multi ? "checked" : ""}> ${esc(tb("e_multi"))}</label>
      <div class="bd-cap">${esc(tb("e_options"))}</div>
      ${(it.options || []).map((o, i) => `<div class="bd-row ${o.ok ? "ok" : ""}">
        <label class="bd-okbox" title="${esc(tb("e_correct"))}"><input type="${it.multi ? "checkbox" : "radio"}" name="ok_${it.id}" data-f="opt.ok" data-i="${i}" ${o.ok ? "checked" : ""}><span class="sr">${esc(tb("e_correct"))}</span></label>
        <label class="sr" for="o${i}">${esc(tb("e_option"))} ${i + 1}</label><input id="o${i}" data-f="opt.t" data-i="${i}" value="${esc(o.t)}" placeholder="${esc(tb("e_option"))} ${i + 1}">
        <button type="button" class="bd-x" data-rm="options" data-i="${i}" aria-label="${esc(tb("e_remove"))}">✕</button></div>`).join("")}
      <button type="button" class="bd-link" data-addrow="options">${esc(tb("e_addOption"))}</button>`;
  } else if (it.type === "tf") {
    body = `<div class="bd-cap">${esc(tb("e_tfAnswer"))}</div>
      <div class="bd-seg" role="group" aria-label="${esc(tb("e_tfAnswer"))}"><button type="button" data-tf="T" aria-pressed="${it.answer === "T"}">${esc(L.yes)}</button><button type="button" data-tf="F" aria-pressed="${it.answer === "F"}">${esc(L.no)}</button></div>
      <label class="bd-check"><input type="checkbox" data-f="explain" ${it.explain ? "checked" : ""}> ${esc(tb("e_explain"))}</label>
      ${it.explain ? `<div class="bd-grid2">${field("fWhy", tb("e_whyPts"), `<input id="fWhy" data-f="whyPts" inputmode="decimal" value="${esc(it.whyPts)}">`)}</div>
        ${field("fModel", tb("e_whyModel"), `<textarea id="fModel" data-f="model" rows="2">${esc(it.model || "")}</textarea>`)}` : ""}`;
  } else if (it.type === "input") {
    const num = (it.mode || "num") === "num";
    body = `<div class="bd-seg" role="group" aria-label="${esc(tb("e_mode"))}"><button type="button" data-mode="num" aria-pressed="${num}">${esc(tb("e_modeNum"))}</button><button type="button" data-mode="text" aria-pressed="${!num}">${esc(tb("e_modeText"))}</button></div>
      ${num ? `<div class="bd-grid3">
          ${field("fAns", tb("e_answer"), `<input id="fAns" data-f="answer" inputmode="decimal" value="${esc(it.answer || "")}" ${it.formula ? "disabled" : ""}>`)}
          ${field("fTol", tb("e_tol"), `<input id="fTol" data-f="tol" inputmode="decimal" value="${esc(it.tol ?? 0)}">`)}
          ${field("fUnit", tb("e_unit"), `<input id="fUnit" data-f="unit" value="${esc(it.unit || "")}" placeholder="${esc(tb("e_unitPh"))}">`)}</div>
        <details class="bd-adv" ${it.params?.length ? "open" : ""}><summary>${esc(tb("e_paramsH"))}</summary>
          <p class="muted small">${tb("e_paramsP")}</p>
          ${(it.params || []).map((p, i) => `<div class="bd-prow">
            <label class="sr" for="pn${i}">${esc(tb("e_pName"))}</label><input id="pn${i}" data-f="par.name" data-i="${i}" value="${esc(p.name)}" maxlength="8" class="bd-pname">
            <span class="muted small">${esc(tb("e_from"))}</span><label class="sr" for="pa${i}">${esc(tb("e_from"))}</label><input id="pa${i}" data-f="par.min" data-i="${i}" value="${esc(p.min)}" inputmode="decimal">
            <span class="muted small">${esc(tb("e_to"))}</span><label class="sr" for="pb${i}">${esc(tb("e_to"))}</label><input id="pb${i}" data-f="par.max" data-i="${i}" value="${esc(p.max)}" inputmode="decimal">
            <span class="muted small">${esc(tb("e_step"))}</span><label class="sr" for="ps${i}">${esc(tb("e_step"))}</label><input id="ps${i}" data-f="par.step" data-i="${i}" value="${esc(p.step)}" inputmode="decimal">
            <button type="button" class="bd-x" data-rm="params" data-i="${i}" aria-label="${esc(tb("e_remove"))}">✕</button></div>`).join("")}
          <button type="button" class="bd-link" data-addrow="params">${esc(tb("e_addParam"))}</button>
          <div class="bd-grid2">${field("fForm", tb("e_formula"), `<input id="fForm" data-f="formula" value="${esc(it.formula || "")}" placeholder="A / B">`)}
            ${field("fDec", tb("e_dec"), `<input id="fDec" data-f="dec" inputmode="numeric" value="${esc(it.dec ?? 0)}">`)}</div>
          <div class="bd-varbox" id="varBox"></div></details>`
      : field("fAnsT", tb("e_answersText"), `<input id="fAnsT" data-f="answer" value="${esc(it.answer || "")}" placeholder="${esc(tb("e_answersTextPh"))}">`)}`;
  } else if (it.type === "match") {
    body = `<div class="bd-cap">${esc(tb("e_pairs"))}</div>${(it.pairs || []).map((p, i) => `<div class="bd-row two">
      <label class="sr" for="pl${i}">${esc(tb("e_left"))} ${i + 1}</label><input id="pl${i}" data-f="pair.l" data-i="${i}" value="${esc(p.l)}" placeholder="${esc(tb("e_left"))}">
      <span aria-hidden="true">→</span>
      <label class="sr" for="pr${i}">${esc(tb("e_right"))} ${i + 1}</label><input id="pr${i}" data-f="pair.r" data-i="${i}" value="${esc(p.r)}" placeholder="${esc(tb("e_right"))}">
      <button type="button" class="bd-x" data-rm="pairs" data-i="${i}" aria-label="${esc(tb("e_remove"))}">✕</button></div>`).join("")}
      <button type="button" class="bd-link" data-addrow="pairs">${esc(tb("e_addPair"))}</button>
      <p class="muted small">${esc(tb("e_partial"))}</p>`;
  } else if (it.type === "sort") {
    body = `<div class="bd-cap">${esc(tb("e_groups"))}</div>${(it.groups || []).map((g, i) => `<div class="bd-row">
      <label class="sr" for="g${i}">${esc(tb("e_group"))} ${i + 1}</label><input id="g${i}" data-f="group.name" data-i="${i}" value="${esc(g.name)}" placeholder="${esc(tb("e_group"))} ${i + 1}">
      <button type="button" class="bd-x" data-rm="groups" data-i="${i}" aria-label="${esc(tb("e_remove"))}">✕</button></div>`).join("")}
      <button type="button" class="bd-link" data-addrow="groups">${esc(tb("e_addGroup"))}</button>
      <div class="bd-cap">${esc(tb("e_cards"))}</div>${(it.cards || []).map((c, i) => `<div class="bd-row two">
      <label class="sr" for="c${i}">${esc(tb("e_card"))} ${i + 1}</label><input id="c${i}" data-f="card.t" data-i="${i}" value="${esc(c.t)}" placeholder="${esc(tb("e_card"))}">
      <label class="sr" for="cg${i}">${esc(tb("e_group"))}</label><select id="cg${i}" data-f="card.g" data-i="${i}">${(it.groups || []).map((g, gi) => `<option value="${gi}" ${Number(c.g) === gi ? "selected" : ""}>${esc(g.name || tb("e_group") + " " + (gi + 1))}</option>`).join("")}</select>
      <button type="button" class="bd-x" data-rm="cards" data-i="${i}" aria-label="${esc(tb("e_remove"))}">✕</button></div>`).join("")}
      <button type="button" class="bd-link" data-addrow="cards">${esc(tb("e_addCard"))}</button>
      <p class="muted small">${esc(tb("e_partial"))}</p>`;
  } else if (it.type === "open") {
    body = `<div class="bd-ainote">${esc(tb("e_openNote"))}</div>
      ${field("fCrit", tb("e_criteria"), `<textarea id="fCrit" data-f="criteria" rows="4" placeholder="${esc(tb("e_criteriaPh"))}">${esc(it.criteria || "")}</textarea>`)}
      ${field("fModel", tb("e_model"), `<textarea id="fModel" data-f="model" rows="3">${esc(it.model || "")}</textarea>`)}`;
  }
  c.innerHTML = `<div class="bd-chead"><h2>${esc(L.task)} ${n}</h2><span class="muted small">${esc(tb("e_type"))}:</span></div>
    <div class="bd-types" role="group" aria-label="${esc(tb("e_type"))}">${TYPES.map((ty) => `<button type="button" data-type="${ty}" aria-pressed="${ty === it.type}">${esc(typeName(ty))}</button>`).join("")}</div>
    ${field("fText", tb("e_text"), `<textarea id="fText" data-f="text" rows="3" placeholder="${esc(tb("e_textPh"))}">${esc(it.text)}</textarea>`)}
    <div class="bd-grid3">${field("fPts", tb("e_pts"), `<input id="fPts" data-f="pts" inputmode="decimal" value="${esc(it.pts)}">`)}</div>
    ${body}`;
  if (it.type === "input") updateVarBox();
}

// ввод в редакторе
app.addEventListener("input", (e) => {
  const el = e.target, f = el.dataset?.f; if (!f || !T) return;
  const it = cur(); if (!it) return;
  const i = Number(el.dataset.i), v = el.type === "checkbox" || el.type === "radio" ? el.checked : el.value;
  const numF = (x) => { const n = Number(String(x).replace(",", ".")); return Number.isFinite(n) ? n : 0; };
  switch (f) {
    case "text": it.text = v; break;
    case "pts": it.pts = numF(v); break;
    case "multi": it.multi = v; if (!v) { let seen = false; it.options.forEach((o) => { if (o.ok && !seen) seen = true; else o.ok = false; }); } renderCenter(); break;
    case "opt.t": it.options[i].t = v; break;
    case "opt.ok": if (it.multi) it.options[i].ok = v; else it.options.forEach((o, j) => (o.ok = j === i)); $$(".bd-row", $("#center")).forEach((r, j) => r.classList.toggle("ok", !!it.options[j]?.ok)); break;
    case "explain": it.explain = v; renderCenter(); break;
    case "whyPts": it.whyPts = numF(v); break;
    case "model": it.model = v; break;
    case "answer": it.answer = v; break;
    case "tol": it.tol = String(v).replace(",", "."); break;
    case "unit": it.unit = v; break;
    case "formula": it.formula = v; const a = $("#fAns"); if (a) a.disabled = !!v; break;
    case "dec": it.dec = Math.max(0, Math.min(4, Math.round(numF(v)))); break;
    case "par.name": it.params[i].name = v.replace(/[^A-Za-z_0-9]/g, "").slice(0, 8); if (el.value !== it.params[i].name) el.value = it.params[i].name; break;
    case "par.min": it.params[i].min = numF(v); break;
    case "par.max": it.params[i].max = numF(v); break;
    case "par.step": it.params[i].step = numF(v) || 1; break;
    case "pair.l": it.pairs[i].l = v; break;
    case "pair.r": it.pairs[i].r = v; break;
    case "group.name": it.groups[i].name = v; break;
    case "card.t": it.cards[i].t = v; break;
    case "card.g": it.cards[i].g = Number(v); break;
    case "criteria": it.criteria = v; break;
    default: return;
  }
  if (it.type === "input") updateVarBox();
  dirty();
});
app.addEventListener("change", (e) => { if (e.target.dataset?.f === "card.g") e.target.dispatchEvent(new Event("input", { bubbles: true })); });

app.addEventListener("click", (e) => {
  if (!T || !$("#center")?.contains(e.target)) return;
  const it = cur(); if (!it) return;
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.type && b.dataset.type !== it.type) {
    if ((it.text || "").trim() && !confirm(tb("e_typeAsk"))) return;
    const n = newItem(b.dataset.type); n.id = it.id; n.text = it.text;
    T.items[T.items.indexOf(it)] = n; dirty(true); renderCenter(); return;
  }
  if (b.dataset.tf) { it.answer = b.dataset.tf; dirty(); renderCenter(); return; }
  if (b.dataset.mode) { it.mode = b.dataset.mode; if (it.mode === "text") { it.formula = ""; it.params = []; } dirty(); renderCenter(); return; }
  if (b.dataset.rm) { const arr = it[b.dataset.rm]; arr.splice(Number(b.dataset.i), 1);
    if (b.dataset.rm === "groups") it.cards.forEach((c) => { if (c.g >= it.groups.length) c.g = 0; });
    if (b.dataset.rm === "options" && !it.options.some((o) => o.ok) && it.options[0]) it.options[0].ok = true;
    dirty(true); renderCenter(); return; }
  if (b.dataset.addrow) {
    const k = b.dataset.addrow;
    if (k === "options") it.options.push({ id: uid("o"), t: "", ok: false });
    if (k === "pairs") it.pairs.push({ id: uid("l"), rid: uid("r"), l: "", r: "" });
    if (k === "groups") it.groups.push({ name: "" });
    if (k === "cards") it.cards.push({ id: uid("c"), t: "", g: 0 });
    if (k === "params") { const used = (it.params || []).map((p) => p.name); const nm = "ABCDEFGH".split("").find((x) => !used.includes(x)) || "X"; (it.params = it.params || []).push({ name: nm, min: 1, max: 10, step: 1 }); }
    dirty(true); renderCenter();
    const inputs = $$(`[data-f^="${({ options: "opt", pairs: "pair", groups: "group", cards: "card", params: "par" })[k]}."]`, $("#center"));
    inputs.filter((x) => x.tagName === "INPUT" && x.type !== "radio" && x.type !== "checkbox").pop()?.focus();
  }
});

function updateVarBox() {
  const it = cur(), box = $("#varBox"); if (!box || !it) return;
  if (!it.formula && !it.params?.length) { box.innerHTML = ""; return; }
  const pub = toPublic({ ...T, items: [it] }), out = [];
  for (let v = 1; v <= Math.min(3, T.variants || 1); v++) {
    const d = variantOf(pub, v).per[it.id];
    let val; try { val = it.formula ? fmtNum(Math.round(evalFormula(it.formula, d.params || {}) * Math.pow(10, it.dec || 0)) / Math.pow(10, it.dec || 0)) : it.answer; }
    catch (err) { box.innerHTML = `<span class="err">${esc(tb("e_formulaErr"))}: ${esc(err.message)}</span>`; return; }
    out.push(`<span class="bd-pill">${esc(tb("variant"))} ${v}: ${esc(Object.entries(d.params || {}).map(([k, x]) => `${k}=${fmtNum(x)}`).join(", "))} → <b>${esc(val)}</b></span>`);
  }
  box.innerHTML = out.join("") + ((T.variants || 1) > 3 ? `<span class="muted small">${esc(tb("e_moreVars", { n: T.variants - 3 }))}</span>` : "");
}

// ---------- справа: настройки и вид ученика ----------
function renderRight() {
  const r = $("#right"); if (!r) return;
  const tabs = `<div class="bd-tabs" role="tablist"><button type="button" role="tab" aria-selected="${TAB === "set"}" data-tab="set">${esc(tb("b_settings"))}</button><button type="button" role="tab" aria-selected="${TAB === "view"}" data-tab="view">${esc(tb("b_studentView"))}</button></div>`;
  if (TAB === "view") {
    const pub = toPublic(T), it = pub.items.find((x) => x.id === SEL);
    const V = variantOf(pub, PV);
    r.innerHTML = tabs + `<div class="bd-pvhead"><label for="pvV">${esc(tb("variant"))}</label>
      <select id="pvV">${Array.from({ length: pub.variants }, (_, i) => `<option ${i + 1 === PV ? "selected" : ""}>${i + 1}</option>`).join("")}</select>
      <button type="button" class="btn small ghost" id="pvAll">${esc(tb("b_pvAll"))}</button></div>
      <div class="bd-phone"><div class="bd-phone-in">${it ? renderItem(it, V.per[it.id], undefined, T.items.findIndex((x) => x.id === SEL) + 1, L, { disabled: true }) : ""}</div></div>`;
    $("#pvV").onchange = (e) => { PV = Number(e.target.value); renderRight(); };
    $("#pvAll").onclick = () => previewAll(pub, PV);
  } else {
    const s = subjOf(T.subject) || SUBJECTS[0];
    r.innerHTML = tabs + `<div class="bd-set">
      ${field("sSubj", tb("s_subject"), `<select id="sSubj">${SUBJECTS.map((x) => `<option value="${x.id}" ${x.id === T.subject ? "selected" : ""}>${esc(subjName(x))}</option>`).join("")}</select>`)}
      <div class="bd-grid2">${field("sGrade", tb("s_grade"), `<select id="sGrade">${s.grades.map((g) => `<option value="${g}" ${g === T.grade ? "selected" : ""}>${esc(gradeLabel(g))}</option>`).join("")}</select>`)}
        ${field("sKind", tb("s_kind"), `<select id="sKind">${KINDS_T.map((k) => `<option value="${k.id}" ${k.id === T.kind ? "selected" : ""}>${esc(k.short)}</option>`).join("")}</select>`)}</div>
      <div class="bd-grid2">${field("sMin", tb("s_minutes"), `<input id="sMin" inputmode="numeric" value="${esc(T.minutes)}">`)}
        ${field("sVar", tb("s_variants"), `<input id="sVar" inputmode="numeric" value="${esc(T.variants)}">`)}</div>
      <div class="bd-f"><span class="bd-lbl">${esc(tb("s_scale"))}</span><div class="bd-seg" role="group" aria-label="${esc(tb("s_scale"))}">
        <button type="button" data-scale="10" aria-pressed="${T.scale !== "qual"}">${esc(tb("s_scale10"))}</button><button type="button" data-scale="qual" aria-pressed="${T.scale === "qual"}">${esc(["ОХ", "Х", "У", "Н"].map(qualShow).join(" · "))}</button></div></div>
      ${[["fullscreen", tb("s_fs"), T.protect.fullscreen !== false], ["autosubmit", tb("s_auto"), T.protect.autosubmit !== false], ["shuffle", tb("s_shuffle"), !!T.shuffle]].map(([k, name, on]) =>
        `<div class="bd-sw"><span id="lb_${k}">${esc(name)}</span><button type="button" role="switch" aria-checked="${on}" aria-labelledby="lb_${k}" data-sw="${k}"><span></span></button></div>`).join("")}
      <p class="muted small">${esc(tb("s_varNote"))}</p></div>`;
    $("#sSubj").onchange = (e) => { T.subject = e.target.value; const ns = subjOf(T.subject); if (!ns.grades.includes(T.grade)) T.grade = ns.grades[0]; if (T.subject === "tech") T.scale = "qual"; dirty(); renderRight(); };
    $("#sGrade").onchange = (e) => { T.grade = e.target.value; dirty(); };
    $("#sKind").onchange = (e) => { T.kind = e.target.value; dirty(); };
    $("#sMin").oninput = (e) => { T.minutes = Math.max(1, Math.min(240, parseInt(e.target.value) || 1)); dirty(true); };
    $("#sVar").oninput = (e) => { T.variants = Math.max(1, Math.min(60, parseInt(e.target.value) || 1)); dirty(); updateVarBox(); };
    $$("[data-scale]", r).forEach((b) => b.onclick = () => { T.scale = b.dataset.scale; dirty(); renderRight(); });
    $$("[data-sw]", r).forEach((b) => b.onclick = () => { const k = b.dataset.sw; if (k === "shuffle") T.shuffle = !T.shuffle; else T.protect[k] = T.protect[k] === false; dirty(); renderRight(); });
  }
  $$("[data-tab]", r).forEach((b) => b.onclick = () => { TAB = b.dataset.tab; renderRight(); });
}

function previewAll(pub, v) {
  const V = variantOf(pub, v);
  const items = V.order.map((id) => pub.items.find((x) => x.id === id)).filter(Boolean);
  dialog(`<div class="bd-dlg-head"><h2>${esc(pub.title)} · ${esc(tb("variant"))} ${v}</h2><button type="button" class="btn small ghost" data-close>${esc(tb("close"))}</button></div>
    <div class="bd-pvall">${items.map((it, i) => renderItem(it, V.per[it.id], undefined, i + 1, L, { disabled: true })).join("")}</div>`, "wide");
}

// ---------- публикация ----------
function validate() {
  const errs = [];
  if (!T.title.trim()) errs.push(tb("v_title"));
  if (!T.items.length) errs.push(tb("v_noItems"));
  T.items.forEach((it, i) => {
    const n = i + 1, e = (k, x) => errs.push(`${L.task} ${n}: ${tb(k, x)}`);
    if (!String(it.text || "").trim()) e("v_text");
    if (!(Number(it.pts) > 0)) e("v_pts");
    if (it.type === "choice") { if ((it.options || []).filter((o) => o.t.trim()).length < 2) e("v_opts"); if (!(it.options || []).some((o) => o.ok && o.t.trim())) e("v_ok"); }
    if (it.type === "input") {
      if ((it.mode || "num") === "num") {
        if (it.formula) { try { variantOf(toPublic({ ...T, items: [it] }), 1); evalFormula(it.formula, Object.fromEntries((it.params || []).map((p) => [p.name, p.min || 1]))); } catch (x) { e("v_formula", { m: x.message }); } }
        else if (!String(it.answer || "").trim() || !Number.isFinite(Number(String(it.answer).replace(",", ".")))) e("v_num");
        for (const p of it.params || []) if (!new RegExp("\\{" + p.name + "\\}").test(it.text)) e("v_param", { p: p.name });
      } else if (!String(it.answer || "").trim()) e("v_textAns");
    }
    if (it.type === "match" && (it.pairs || []).filter((p) => p.l.trim() && p.r.trim()).length < 2) e("v_pairs");
    if (it.type === "sort") { if ((it.groups || []).filter((g) => g.name.trim()).length < 2) e("v_groups"); if ((it.cards || []).filter((c) => c.t.trim()).length < 2) e("v_cards"); }
    if (it.type === "open" && !String(it.criteria || "").trim()) e("v_crit");
  });
  return errs;
}
async function publish() {
  const errs = validate();
  if (errs.length) {
    dialog(`<h2>${esc(tb("v_h"))}</h2><ul class="bd-errs">${errs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><button type="button" class="btn" data-close>${esc(tb("ok"))}</button>`);
    return;
  }
  const b = $("#bPub"); b.disabled = true; b.textContent = tb("b_publishing");
  try {
    T.pubAt = Date.now(); T.updatedAt = T.pubAt;
    const clean = (t) => ({ ...t, items: t.items.map((it) => ({ ...it, options: it.options?.filter((o) => o.t.trim()), pairs: it.pairs?.filter((p) => p.l.trim() && p.r.trim()), cards: it.cards?.filter((c) => c.t.trim()) })) });
    const snap = clean(T), pub = toPublic(snap);
    await Promise.all([
      set(ref(db, `builder/${T.id}`), T),
      set(ref(db, `keys/${T.id}`), snap),
      set(ref(db, `pub/${T.id}`), pub),
      set(ref(db, `pubIndex/${T.id}`), { title: T.title, subject: T.subject, grade: T.grade || "", kind: T.kind || "to", minutes: T.minutes, n: T.items.length, max: maxOf(T), at: T.pubAt }),
    ]);
    ALL[T.id] = JSON.parse(JSON.stringify(T));
    renderStatus();
    const url = `${SITE}b/?t=${T.id}`, open = !!SET[T.id]?.open;
    dialog(`<h2>${esc(tb("pub_h"))}</h2><p>${esc(tb("pub_p"))}</p>
      <p class="bd-url"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>
      <div class="bd-actions"><button type="button" class="btn" id="dOpen">${esc(open ? tb("pub_isOpen") : tb("pub_open"))}</button>
      <button type="button" class="btn ghost" id="dNow">${esc(tb("b_setNow"))}</button>
      <button type="button" class="btn ghost" data-close>${esc(tb("close"))}</button></div>`);
    $("#dOpen").onclick = async () => { await update(ref(db, `settings/${T.id}`), { open: true }); SET[T.id] = { ...(SET[T.id] || {}), open: true }; $("#dOpen").textContent = tb("pub_isOpen"); };
    $("#dNow").onclick = async () => { await listAction("now", T.id); location.hash = `#/e/${T.id}`; };
  } catch (e) { alert(tb("b_saveErr") + "\n" + e.message); }
  b.disabled = false; b.textContent = tb("b_publish");
}

// ---------- ИИ: составить задания ----------
function aiDialog() {
  const s = subjOf(T.subject);
  dialog(`<div class="bd-dlg-head"><h2>${esc(tb("ai_h"))}</h2><button type="button" class="btn small ghost" data-close>${esc(tb("close"))}</button></div>
    <p class="muted">${esc(tb("ai_p"))}</p>
    <div class="bd-grid2">${field("aTopic", tb("ai_topic"), `<input id="aTopic" value="${esc(T.title)}">`)}${field("aCount", tb("ai_count"), `<input id="aCount" inputmode="numeric" value="8">`)}</div>
    ${field("aSrc", tb("ai_src"), `<textarea id="aSrc" rows="3" placeholder="${esc(tb("ai_srcPh"))}"></textarea>`)}
    <div class="bd-f"><span class="bd-lbl">${esc(tb("ai_types"))}</span><div class="bd-checks">${TYPES.map((ty) => `<label class="bd-check"><input type="checkbox" data-aty="${ty}" ${ty !== "sort" ? "checked" : ""}> ${esc(typeName(ty))}</label>`).join("")}</div></div>
    ${field("aLang", tb("ai_lang"), `<select id="aLang"><option value="ru">Русский</option><option value="ro" ${LANG === "ro" ? "selected" : ""}>Română</option><option value="en" ${LANG === "en" ? "selected" : ""}>English</option></select>`)}
    <button type="button" class="btn" id="aMake">${esc(tb("ai_make"))}</button>
    <div id="aStep2" hidden>
      <div class="bd-cap" style="margin-top:14px">${esc(tb("ai_step1"))}</div>
      <textarea id="aPrompt" rows="6" readonly></textarea>
      <button type="button" class="btn small ghost" id="aCopy">${esc(tb("ai_copy"))}</button>
      <div class="bd-cap" style="margin-top:14px">${esc(tb("ai_step2"))}</div>
      <textarea id="aPaste" rows="6" placeholder="${esc(tb("ai_pastePh"))}"></textarea>
      <div class="err" id="aErr" role="alert"></div>
      <button type="button" class="btn" id="aImport">${esc(tb("ai_import"))}</button>
    </div>`, "wide");
  $("#aMake").onclick = () => {
    const types = $$("[data-aty]").filter((x) => x.checked).map((x) => x.dataset.aty);
    $("#aPrompt").value = aiPrompt({ topic: $("#aTopic").value, n: parseInt($("#aCount").value) || 8, src: $("#aSrc").value, types, lang: $("#aLang").value,
      subject: s ? subjName(s) : "", grade: T.grade });
    $("#aStep2").hidden = false; $("#aPrompt").scrollIntoView({ block: "center" });
  };
  $("#aCopy").onclick = async () => { try { await navigator.clipboard.writeText($("#aPrompt").value); $("#aCopy").textContent = tb("b_copied"); } catch (e) { $("#aPrompt").select(); } };
  $("#aImport").onclick = () => {
    try {
      const items = importItems($("#aPaste").value);
      if (!items.length) throw new Error("0");
      if (T.items.length === 1 && !T.items[0].text.trim()) T.items = [];
      T.items.push(...items); SEL = items[0].id; dirty(true); renderCenter(); closeDialog();
    } catch (e) { $("#aErr").textContent = tb("ai_err"); }
  };
}
function aiPrompt({ topic, n, src, types, lang, subject, grade }) {
  const langName = { ru: "русском", ro: "румынском (limba română)", en: "английском (English)" }[lang];
  const schema = {
    choice: '{"type":"choice","text":"вопрос","options":["A","B","C","D"],"correct":[0],"pts":1}',
    tf: '{"type":"tf","text":"утверждение","answer":true,"pts":1}',
    input: '{"type":"input","text":"вопрос с числовым или коротким ответом","answer":"42","pts":1}',
    match: '{"type":"match","text":"соотнесите","pairs":[["левое","правое"],["левое","правое"],["левое","правое"]],"pts":3}',
    sort: '{"type":"sort","text":"распределите","groups":["группа 1","группа 2"],"cards":[["карточка",0],["карточка",1],["карточка",0],["карточка",1]],"pts":2}',
    open: '{"type":"open","text":"вопрос для развёрнутого ответа","criteria":"за что даются баллы","model":"образец ответа","pts":3}',
  };
  return `Ты — опытный учитель. Составь ${n} заданий для школьного теста.
Предмет: ${subject}. Класс: ${grade}. Тема: ${topic}.
${src.trim() ? "Опирайся на этот материал:\n" + src.trim() + "\n" : ""}Язык заданий: на ${langName} языке.
Типы заданий: ${types.join(", ")}. Смешай типы, от простого к сложному; задания должны проверять знание, понимание и применение.
Ответь ТОЛЬКО JSON-массивом, без пояснений. Формат каждого элемента:
${types.map((t) => schema[t]).join("\n")}
Правила: "correct" — номера правильных вариантов с нуля; у "input" ответ — одно число или несколько допустимых слов через ";"; баллы "pts" — целые числа.`;
}

// =====================================================================
//  Результаты
// =====================================================================
async function openResults(id) {
  T = null;
  const t = ALL[id];
  app.innerHTML = `<div class="card center"><p class="muted">${esc(tb("loading"))}</p></div>`;
  try { KEY = (await get(ref(db, `keys/${id}`))).val(); SET = (await get(ref(db, "settings"))).val() || {}; } catch (e) { KEY = null; }
  if (!KEY) { app.innerHTML = `<div class="card center"><h2>${esc(t.title)}</h2><p>${esc(tb("r_notPub"))}</p><a class="btn" href="#/e/${id}">${esc(tb("b_edit"))}</a> <a class="btn ghost" href="#/">${esc(tb("b_back"))}</a></div>`; return; }
  KEY.id = id;
  app.innerHTML = `<div class="bd-res">
    <div class="bd-bar"><a class="btn small ghost" href="#/">${esc(tb("b_back"))}</a><h1 class="bd-rtitle">${esc(KEY.title)}</h1>
      <a class="btn small ghost" href="#/e/${id}">${esc(tb("b_edit"))}</a>
      <button type="button" class="btn small" id="rOpen"></button></div>
    <div class="bd-rtools">
      <label for="rCls" class="sr">${esc(tb("p_cls"))}</label><select id="rCls"></select>
      <button type="button" class="btn small ghost" id="rAi"></button>
      <button type="button" class="btn small ghost" id="rCsv">CSV</button>
      <button type="button" class="btn small ghost" id="rPdf">${esc(tb("r_pdfAll"))}</button>
      <span class="muted small" id="aiSt"></span></div>
    <div id="rStats"></div><div id="rTable"></div></div>`;
  const setOpenBtn = () => { const o = !!SET[id]?.open; $("#rOpen").textContent = o ? tb("b_close") : tb("b_open"); $("#rOpen").classList.toggle("ghost", o); };
  setOpenBtn();
  $("#rOpen").onclick = async () => { const v = !SET[id]?.open; await update(ref(db, `settings/${id}`), { open: v }); SET[id] = { ...(SET[id] || {}), open: v }; setOpenBtn(); };
  $("#rCls").onchange = (e) => { filterCls = e.target.value; renderRes(); };
  $("#rAi").onclick = () => { for (const [rid, r] of Object.entries(RES)) if (needsAi(r)) queueAi(rid); };
  $("#rCsv").onclick = csv;
  $("#rPdf").onclick = () => printReports(visible().map(([rid]) => rid));
  unsub.push(onValue(ref(db, `results/${id}`), (s) => { RES = s.val() || {}; renderRes(); syncResults(); }));
}
const visible = () => Object.entries(RES).filter(([, r]) => !filterCls || r.cls === filterCls).sort((a, b) => String(a[1].name).localeCompare(String(b[1].name)));
const aiTargets = (r) => gradeAttempt(KEY, r).items.filter((x) => x.check && x.teacher === null && x.ai === null && !x.empty);
const needsAi = (r) => r.status === "submitted" && aiTargets(r).length > 0;

function gradeCell(g) {
  if (KEY.scale === "qual") return `<span class="bd-g q">${esc(qualShow(g.qual))}</span>`;
  return `<span class="bd-g g${g.grade >= 9 ? "hi" : g.grade >= 7 ? "mid" : g.grade >= 5 ? "lo" : "bad"}">${g.grade}</span>`;
}
function renderRes() {
  const classes = [...new Set(Object.values(RES).map((r) => r.cls))].sort();
  $("#rCls").innerHTML = `<option value="">${esc(tb("r_allCls"))}</option>` + classes.map((c) => `<option ${c === filterCls ? "selected" : ""}>${esc(c)}</option>`).join("");
  const rows = visible();
  const need = Object.values(RES).filter(needsAi).length;
  $("#rAi").textContent = tb("r_aiAll", { n: need }); $("#rAi").disabled = !need || !AICFG?.url;
  const done = rows.filter(([, r]) => r.status === "submitted").map(([, r]) => gradeAttempt(KEY, r));
  const avg = done.length ? done.reduce((s, g) => s + g.pct, 0) / done.length : 0;
  // доля правильных по заданиям
  const per = (KEY.items || []).map((it, i) => { let s = 0, m = 0; for (const g of done) for (const x of g.items.filter((y) => y.n === i + 1)) { s += x.score ?? 0; m += x.max; } return m ? Math.round(s / m * 100) : null; });
  $("#rStats").innerHTML = `<div class="bd-stats">
    <div class="bd-stat"><b>${rows.length}</b><span>${esc(tb("r_started"))}</span></div>
    <div class="bd-stat"><b>${done.length}</b><span>${esc(tb("r_submitted"))}</span></div>
    <div class="bd-stat"><b>${done.length ? avg.toFixed(0) + "%" : "—"}</b><span>${esc(tb("r_avg"))}</span></div>
    <div class="bd-stat wide"><span>${esc(tb("r_perTask"))}</span><div class="bd-bars">${per.map((p, i) => `<div class="bd-bar1" title="${esc(L.task)} ${i + 1}: ${p ?? "—"}%"><i style="height:${p ?? 0}%"></i><small>${i + 1}</small></div>`).join("")}</div></div></div>`;
  $("#rTable").innerHTML = rows.length ? `<div class="table-wrap"><table class="bd-table"><thead><tr><th>${esc(tb("r_name"))}</th><th>${esc(tb("p_cls"))}</th><th>${esc(tb("variant"))}</th><th>${esc(tb("r_status"))}</th><th>${esc(tb("r_score"))}</th><th>${esc(tb("r_grade"))}</th><th>${esc(tb("r_viol"))}</th><th>${esc(tb("r_ai"))}</th><th></th></tr></thead><tbody>
    ${rows.map(([rid, r]) => { const g = gradeAttempt(KEY, r), sub = r.status === "submitted";
      return `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.cls)}</td><td>${r.variant}</td>
        <td>${sub ? `<span class="chip-st st-pub">${esc(tb("r_done"))}</span>${r.reason && r.reason !== "manual" ? `<small class="muted"> · ${esc(tb("rs_" + r.reason))}</small>` : ""}` : `<span class="chip-st st-open">${esc(tb("r_inProg"))}</span>`}</td>
        <td>${fmt(g.total)} / ${fmt(g.max)}${g.pending ? ` <small class="muted">(${esc(tb("r_pending", { n: g.pending }))})</small>` : ""}</td>
        <td>${sub ? gradeCell(g) : "—"}</td><td>${r.violations ? `<span class="bd-viol">${r.violations}</span>` : "0"}</td>
        <td><small>${r.aiStatus === "done" ? "✓" : r.aiStatus === "error" ? "⚠" : aiQueue.includes(rid) ? "…" : needsAi(r) ? tb("r_aiNeed") : "—"}</small></td>
        <td><button type="button" class="btn small ghost" data-open="${rid}">${esc(tb("r_open"))}</button></td></tr>`; }).join("")}</tbody></table></div>`
    : `<div class="card center"><p class="muted">${esc(tb("r_empty"))}</p><p class="bd-url">${esc(SITE)}b/?t=${esc(KEY.id)}</p></div>`;
  $$("[data-open]").forEach((b) => b.onclick = () => openAttempt(b.dataset.open));
}

// сохраняем итог в каждой сданной работе — его берёт «Ученики и родители» (прогресс, XP, кабинет родителя)
let syncT = null;
function syncResults() {
  clearTimeout(syncT);
  syncT = setTimeout(async () => {
    for (const [rid, r] of Object.entries(RES)) {
      if (r.status !== "submitted") continue;
      const g = gradeAttempt(KEY, r);
      const res = { total: Math.round(g.total * 10) / 10, max: g.max, grade: g.grade, complete: g.complete, pct: g.pct, ...(g.qual ? { qual: g.qual } : {}) };
      const o = r.result || {};
      if (o.total !== res.total || o.max !== res.max || o.grade !== res.grade || o.complete !== res.complete) await update(ref(db, `results/${KEY.id}/${rid}`), { result: res }).catch(() => {});
    }
  }, 1500);
}

function openAttempt(rid) {
  const r = RES[rid]; if (!r) return;
  const g = gradeAttempt(KEY, r), sub = r.status === "submitted";
  dialog(`<div class="bd-dlg-head"><div><h2>${esc(r.name)} · ${esc(r.cls)}</h2><p class="muted small">${esc(tb("variant"))} ${r.variant} · ${esc(fmtDT(r.startedAt))} → ${esc(fmtDT(r.submittedAt))}</p></div>
      <div class="bd-big">${fmt(g.total)} / ${fmt(g.max)} · ${sub ? gradeCell(g) : esc(tb("r_inProg"))}</div></div>
    ${r.aiSummary ? `<div class="bd-ainote"><b>${esc(tb("r_aiSum"))}</b> ${esc(r.aiSummary.strengths || "")} ${r.aiSummary.gaps ? "· " + esc(r.aiSummary.gaps) : ""} ${r.aiSummary.advice ? "· " + esc(r.aiSummary.advice) : ""}</div>` : ""}
    <div class="table-wrap"><table class="bd-table"><thead><tr><th>№</th><th>${esc(tb("r_q"))}</th><th>${esc(tb("r_ans"))}</th><th>${esc(tb("r_key"))}</th><th>${esc(tb("r_pts"))}</th></tr></thead><tbody>
    ${g.items.map((x) => `<tr class="${(x.score ?? 0) >= x.max ? "ok" : (x.score ?? 0) > 0 ? "part" : "bad"}"><td>${x.n}</td><td>${esc(x.label)}</td>
      <td>${x.answer ? esc(x.answer) : "—"}${x.aiData?.comment ? `<div class="bd-aic">ИИ: ${esc(x.aiData.comment)}</div>` : ""}</td><td>${esc(x.key)}</td>
      <td class="bd-ptcell"><label class="sr" for="m_${x.k}">${esc(tb("r_pts"))}</label><input id="m_${x.k}" data-man="${x.k}" data-max="${x.max}" inputmode="decimal" value="${x.score === null ? "" : fmt(x.score)}" placeholder="?"> / ${fmt(x.max)}</td></tr>`).join("")}
    </tbody></table></div>
    ${(r.events && Object.keys(r.events).length) ? `<p class="muted small">${esc(tb("r_events"))}: ${Object.values(r.events).map((e) => esc(tb("ev_" + e.type) || e.type)).join(", ")}</p>` : ""}
    <div class="bd-actions">
      ${needsAi(r) && AICFG?.url ? `<button type="button" class="btn" id="aAi">${esc(tb("r_aiOne"))}</button>` : ""}
      ${sub ? `<button type="button" class="btn ghost" id="aReopen">${esc(tb("r_reopen"))}</button>` : `<button type="button" class="btn ghost" id="aStop">${esc(tb("r_stop"))}</button>`}
      <button type="button" class="btn ghost" id="aPrint">${esc(tb("r_pdf"))}</button>
      <button type="button" class="btn ghost danger" id="aDel">${esc(tb("r_del"))}</button>
      <button type="button" class="btn ghost" data-close>${esc(tb("close"))}</button></div>`, "wide");
  $$("[data-man]").forEach((inp) => inp.onchange = async () => {
    const v = inp.value.trim() === "" ? null : Number(inp.value.replace(",", "."));
    const max = Number(inp.dataset.max);
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > max)) { inp.value = ""; return; }
    await update(ref(db, `results/${KEY.id}/${rid}/manual`), { [inp.dataset.man]: v });
  });
  $("#aAi") && ($("#aAi").onclick = () => { queueAi(rid); closeDialog(); });
  $("#aReopen") && ($("#aReopen").onclick = async () => { await update(ref(db, `results/${KEY.id}/${rid}`), { status: "in_progress", deadline: Date.now() + 10 * 60000 }); closeDialog(); });
  $("#aStop") && ($("#aStop").onclick = async () => { await update(ref(db, `results/${KEY.id}/${rid}`), { status: "submitted", reason: "teacher", submittedAt: serverTimestamp() }); closeDialog(); });
  $("#aPrint").onclick = () => { closeDialog(); printReports([rid]); };
  $("#aDel").onclick = async () => { if (confirm(tb("r_delAsk"))) { await remove(ref(db, `results/${KEY.id}/${rid}`)); closeDialog(); } };
}

// ---------- ИИ-проверка (тот же сервис, что в других работах: keys/_ai) ----------
function queueAi(rid) { if (!aiQueue.includes(rid)) aiQueue.push(rid); renderRes(); runAi(); }
async function runAi() {
  if (aiBusy) return; aiBusy = true;
  while (aiQueue.length) {
    const rid = aiQueue[0], r = RES[rid];
    $("#aiSt") && ($("#aiSt").textContent = tb("r_aiRun", { n: aiQueue.length }));
    try { if (r && needsAi(r)) await gradeWithAi(rid, r); }
    catch (e) {
      console.error(e);
      await update(ref(db, `results/${KEY.id}/${rid}`), { aiStatus: "error", aiError: String(e.message || e).slice(0, 300) }).catch(() => {});
      if (/429|quota|rate/i.test(String(e.message))) await sleep(60000);
    }
    aiQueue.shift(); renderRes();
    if (aiQueue.length) await sleep(5000);
  }
  aiBusy = false; $("#aiSt") && ($("#aiSt").textContent = tb("r_aiDone"));
}
async function gradeWithAi(rid, r) {
  const g = gradeAttempt(KEY, r), targets = g.items.filter((x) => x.check && x.teacher === null && x.ai === null && !x.empty);
  const s = subjOf(KEY.subject);
  const items = targets.map((x) => ({ key: x.k, max: x.max, question: x.question, answer: x.answer, model: x.model, criteria: x.criteria }));
  const context = `${KEY.title}. ${s ? s.name : ""}, ${KEY.grade} класс. Итог автопроверки: ${fmt(g.total)} из ${fmt(g.max)}.\nОценивай доброжелательно, но строго по критериям. Комментарии — коротко и понятно ученику, на языке ответа ученика.`;
  const ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), 100000);
  let res; try { res = await fetch(AICFG.url, { method: "POST", body: JSON.stringify({ secret: AICFG.secret, subject: `${s ? s.name : ""}, ${KEY.grade} класс`, items, review: true, context }), signal: ctrl.signal }); }
  finally { clearTimeout(tm); }
  const data = JSON.parse(await res.text());
  if (data.error) throw new Error(data.error);
  const ai = { ...(r.ai || {}) }, cut = (x, n = 500) => String(x || "").slice(0, n);
  for (const x of data.results || []) {
    const it = targets.find((i) => i.k === x.key); if (!it || !Number.isFinite(Number(x.score))) continue;
    ai[x.key] = { score: Math.max(0, Math.min(it.max, Math.round(Number(x.score) * 2) / 2)), comment: cut(x.comment, 400), good: cut(x.good), missing: cut(x.missing), advice: cut(x.advice) };
  }
  const upd = { ai, aiStatus: "done", aiError: null, aiAt: Date.now() };
  if (data.summary) upd.aiSummary = { strengths: cut(data.summary.strengths, 800), gaps: cut(data.summary.gaps, 800), advice: cut(data.summary.advice, 800) };
  await update(ref(db, `results/${KEY.id}/${rid}`), upd);
}

// ---------- CSV и PDF ----------
function csv() {
  const head = [tb("r_name"), tb("p_cls"), tb("variant"), tb("r_status"), ...(KEY.items || []).map((_, i) => `${L.task} ${i + 1}`), tb("r_score"), tb("r_max"), "%", tb("r_grade"), tb("r_viol")];
  const lines = [head];
  for (const [, r] of visible()) {
    const g = gradeAttempt(KEY, r);
    const per = (KEY.items || []).map((_, i) => fmt(g.items.filter((x) => x.n === i + 1).reduce((s, x) => s + (x.score ?? 0), 0)));
    lines.push([r.name, r.cls, r.variant, r.status === "submitted" ? tb("r_done") : tb("r_inProg"), ...per, fmt(g.total), fmt(g.max), g.pct, KEY.scale === "qual" ? qualShow(g.qual) : g.grade, r.violations || 0]);
  }
  const txt = "﻿" + lines.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
  a.download = (KEY.title || "results").replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 60) + ".csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function printReports(ids) {
  const s = subjOf(KEY.subject);
  $("#print").innerHTML = ids.map((rid) => { const r = RES[rid]; if (!r) return ""; const g = gradeAttempt(KEY, r);
    return `<section class="bd-sheet"><div class="bd-sh-head"><div><b>TechLab</b> · ${esc(KEY.title)}<br><small>${esc(s ? subjName(s) : "")} · ${esc(gradeLabel(KEY.grade || ""))}</small></div>
      <div class="bd-sh-score">${fmt(g.total)} / ${fmt(g.max)}<br><b>${KEY.scale === "qual" ? esc(qualShow(g.qual)) : g.grade}</b></div></div>
      <p><b>${esc(r.name)}</b>, ${esc(r.cls)} · ${esc(tb("variant"))} ${r.variant} · ${esc(fmtDT(r.submittedAt || r.startedAt))}</p>
      <table class="bd-ptable"><thead><tr><th>№</th><th>${esc(tb("r_q"))}</th><th>${esc(tb("r_ans"))}</th><th>${esc(tb("r_key"))}</th><th>${esc(tb("r_pts"))}</th></tr></thead><tbody>
      ${g.items.map((x) => `<tr><td>${x.n}</td><td>${esc(x.label)}</td><td>${esc(x.answer || "—")}${x.aiData?.comment ? `<br><i>${esc(x.aiData.comment)}</i>` : ""}</td><td>${esc(x.key)}</td><td>${x.score === null ? "?" : fmt(x.score)} / ${fmt(x.max)}</td></tr>`).join("")}</tbody></table>
      ${r.aiSummary?.advice ? `<p><b>${esc(tb("r_advice"))}</b> ${esc(r.aiSummary.advice)}</p>` : ""}</section>`; }).join("");
  setTimeout(() => window.print(), 100);
}

// ---------- диалог ----------
function dialog(html, cls = "") {
  closeDialog();
  const o = document.createElement("div"); o.className = "overlay bd-ov"; o.id = "bdDlg";
  o.innerHTML = `<div class="card bd-dlg ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(o);
  o.addEventListener("click", (e) => { if (e.target === o || e.target.closest("[data-close]")) closeDialog(); });
  o.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDialog(); });
  o.querySelector("input,textarea,button")?.focus();
}
function closeDialog() { $("#bdDlg")?.remove(); }
