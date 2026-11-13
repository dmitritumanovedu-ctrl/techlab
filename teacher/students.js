// Ученики и родители: личные коды, карточки для печати, пересчёт прогресса (XP, оценки, битва классов)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";
import { grade, toGrade } from "../engine/grading.js?v=4";
import { SUBJECTS, TESTS, kindOf } from "../tests.js?v=7";
import { CLASSES, PLAN, makeCode, prettyCode, nameKey, clsKey, xpOf, levelOf, fmt1, esc } from "../engine/people.js?v=1";

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb), auth = getAuth(fb);
const SITE = new URL("../", location.href).href;
const READY = TESTS.filter((t) => t.path);

let ROSTER = {}, PROGRESS = {}, CUR = localStorage.getItem("techlab_roster_cls") || "";

onAuthStateChanged(auth, async (user) => {
  if (!user) return showLogin();
  $("#who").innerHTML = `${esc(user.email)} · <a href="#" id="logout" style="color:#fff">выйти</a>`;
  $("#logout").onclick = (e) => { e.preventDefault(); signOut(auth); };
  try { await load(); }
  catch (e) {
    console.error(e);
    app.innerHTML = `<a class="backlink" href="./">← Центр управления</a><div class="card center" style="max-width:700px"><h2>Нет доступа к спискам учеников</h2>
      <p>Скорее всего, в правилах базы Firebase ещё нет разделов <code>roster</code>, <code>parentCodes</code>, <code>progress</code> и <code>board</code>.
      Добавьте их по инструкции (файл <b>firebase-rules-dobavit.txt</b>) и обновите страницу.</p><p class="muted">${esc(e.code || e.message)}</p></div>`;
    return;
  }
  render();
});

function showLogin() {
  $("#who").textContent = "";
  app.innerHTML = `<div class="card center"><h2>Вход для учителя</h2><p class="muted">Войдите через свой Google-аккаунт учителя.</p>
    <div class="err" id="err"></div><button class="btn" id="go">Войти через Google</button></div>`;
  $("#go").onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { $("#err").textContent = "Не удалось войти: " + (e.code || e.message); } };
}

async function load() {
  const [r, p] = await Promise.all([get(ref(db, "roster")), get(ref(db, "progress"))]);
  ROSTER = r.val() || {}; PROGRESS = p.val() || {};
}

// =====================================================================
function render() {
  const works = READY.length;
  const used = Math.min(works, PLAN.limit);
  const inCls = Object.entries(ROSTER).filter(([, s]) => s.cls === CUR).sort((a, b) => a[1].name.localeCompare(b[1].name, "ru"));
  const total = Object.keys(ROSTER).length;
  app.innerHTML = `<a class="backlink" href="./">← Центр управления</a>
  <div class="card plan-box">
    <div><div class="muted" style="font-size:13px;font-family:var(--mono);letter-spacing:.06em">ТАРИФ УЧИТЕЛЯ</div>
      <div style="font-family:var(--display);font-size:20px;font-weight:700">${esc(PLAN.name)} · работ на сайте: ${works} из ${PLAN.limit}</div>
      <div class="muted" style="font-size:14px">Сейчас всё бесплатно для вашей школы. Для учеников и родителей платформа всегда бесплатна; счётчик нужен для будущего тарифа «Учитель Pro».</div></div>
    <div class="plan-bar"><i style="width:${Math.round(used / PLAN.limit * 100)}%"></i></div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>1. Класс</h2>
      <select id="selCls"><option value="">— выберите класс —</option>${CLASSES.map((c) => {
        const n = Object.values(ROSTER).filter((s) => s.cls === c).length;
        return `<option value="${esc(c)}" ${c === CUR ? "selected" : ""}>${esc(c)}${n ? ` · ${n} уч.` : ""}</option>`; }).join("")}</select>
      <p class="muted" style="font-size:14px">Всего учеников со своими кодами: <b>${total}</b>.</p>
      <h2 style="margin-top:18px">2. Добавить учеников</h2>
      <label class="f" for="names">Вставьте список класса — каждый ученик с новой строки: «Фамилия Имя»</label>
      <textarea id="names" placeholder="Попеску Андрей&#10;Руссу Анна&#10;…" ${CUR ? "" : "disabled"}></textarea>
      <div class="err" id="addErr"></div>
      <button class="btn" id="bAdd" ${CUR ? "" : "disabled"}>Создать коды</button>
    </div>
    <div class="card">
      <h2>3. Раздать коды</h2>
      <p>Ученик входит на стартовой странице кнопкой <b>«Я ученик»</b> и вводит свой код — дальше тесты сами подставляют его фамилию и класс.
        Родитель нажимает <b>«Я родитель»</b> и вводит код родителя.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" id="bCards" ${inCls.length ? "" : "disabled"}>🖨 Карточки с кодами (${esc(CUR || "класс")})</button>
        <button class="btn ghost" id="bCsv" ${inCls.length ? "" : "disabled"}>Скачать CSV</button>
      </div>
      <h2 style="margin-top:18px">4. Прогресс и битва классов</h2>
      <p>Оценки, опыт (XP), награды и рейтинг классов пересчитываются из результатов всех работ. Нажимайте после проверки работ.</p>
      <button class="btn" id="bSync">🔄 Обновить прогресс всех учеников</button>
      <div class="muted" id="syncInfo" style="margin-top:8px;font-size:14px"></div>
    </div>
  </div>

  <div class="card">
    <h2>${CUR ? esc(CUR) + " · " + inCls.length + " уч." : "Выберите класс"}</h2>
    ${inCls.length ? `<div class="table-wrap"><table class="res"><thead><tr><th>№</th><th>Ученик</th><th>Код ученика</th><th>Код родителя</th>
      <th>Уровень</th><th>XP</th><th>Работ</th><th>Ср. оценка</th><th></th></tr></thead><tbody>
      ${inCls.map(([code, s], i) => {
        const p = PROGRESS[code] || {}; const ws = Object.values(p.works || {}); const done = ws.filter((w) => w.complete);
        const L = levelOf(p.xp || 0);
        return `<tr><td>${i + 1}</td><td><b>${esc(s.name)}</b></td><td class="code">${prettyCode(code)}</td><td class="code">${prettyCode(s.pcode)}</td>
          <td><span class="lvl">${L.n}</span> ${esc(L.name)}</td><td>${p.xp || 0}</td><td>${ws.length}</td>
          <td>${done.length ? fmt1(done.reduce((a, w) => a + w.grade, 0) / done.length) : "—"}</td>
          <td style="white-space:nowrap"><button class="btn small ghost" data-new="${code}" title="Выдать новый код родителя">↻ код родителя</button>
            <button class="btn small red" data-del="${code}" title="Удалить ученика">✕</button></td></tr>`;
      }).join("")}</tbody></table></div>` : `<p class="muted">${CUR ? "В этом классе пока нет учеников. Вставьте список слева." : ""}</p>`}
  </div>`;

  $("#selCls").onchange = (e) => { CUR = e.target.value; localStorage.setItem("techlab_roster_cls", CUR); render(); };
  $("#bAdd").onclick = addStudents;
  $("#bCards").onclick = () => printCards(inCls);
  $("#bCsv").onclick = () => csv(inCls);
  $("#bSync").onclick = syncAll;
  app.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
    const s = ROSTER[b.dataset.del];
    if (!confirm(`Удалить ученика «${s.name}» и его коды? Результаты тестов останутся.`)) return;
    await update(ref(db), { [`roster/${b.dataset.del}`]: null, [`parentCodes/${s.pcode}`]: null, [`progress/${b.dataset.del}`]: null });
    await load(); render();
  });
  app.querySelectorAll("[data-new]").forEach((b) => b.onclick = async () => {
    const code = b.dataset.new, s = ROSTER[code];
    if (!confirm(`Выдать новый код родителя для «${s.name}»? Старый код перестанет работать.`)) return;
    const p = makeCode("P");
    await update(ref(db), { [`parentCodes/${s.pcode}`]: null, [`parentCodes/${p}`]: code, [`roster/${code}/pcode`]: p });
    await load(); render();
  });
}

async function addStudents() {
  const names = $("#names").value.split(/\n+/).map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (!names.length) return ($("#addErr").textContent = "Вставьте хотя бы одну фамилию и имя.");
  const bad = names.filter((n) => n.split(" ").length < 2);
  if (bad.length) return ($("#addErr").textContent = "Нужны фамилия и имя: " + bad.join(", "));
  const exist = new Set(Object.values(ROSTER).filter((s) => s.cls === CUR).map((s) => nameKey(s.name)));
  const upd = {}; let n = 0;
  for (const name of names) {
    if (exist.has(nameKey(name))) continue;
    exist.add(nameKey(name));
    const code = makeCode("S"), p = makeCode("P");
    upd[`roster/${code}`] = { name, cls: CUR, pcode: p, at: Date.now() };
    upd[`parentCodes/${p}`] = code;
    n++;
  }
  if (!n) return ($("#addErr").textContent = "Все эти ученики уже есть в списке.");
  $("#bAdd").disabled = true; $("#bAdd").textContent = "Создаю…";
  await update(ref(db), upd);
  await load(); render();
}

// =====================================================================
//  Карточки для печати
// =====================================================================
function printCards(list) {
  const w = window.open("", "_blank");
  if (!w) return alert("Разрешите всплывающие окна для этого сайта.");
  const cards = list.map(([code, s]) => `<div class="c">
      <div class="half"><div class="k">TechLab · ученик</div><div class="n">${esc(s.name)}</div><div class="cl">${esc(s.cls)}</div>
        <div class="code">${prettyCode(code)}</div><div class="h">Стартовая страница → «Я ученик» → введи код. Никому его не показывай.</div></div>
      <div class="half par"><div class="k">TechLab · для родителей</div><div class="n">${esc(s.name)}, ${esc(s.cls)}</div>
        <div class="code">${prettyCode(s.pcode)}</div><div class="h">${esc(SITE)} → «Я родитель» → введите код. Там оценки, работы и советы, что повторить.</div></div></div>`).join("");
  w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Коды · ${esc(CUR)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=JetBrains+Mono:wght@700&display=swap"><style>
    @page{size:A4;margin:10mm}body{margin:0;font-family:Manrope,Arial,sans-serif;color:#0B1A3B}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
    .c{border:1.5px dashed #8090B0;border-radius:4mm;break-inside:avoid;page-break-inside:avoid;display:flex;flex-direction:column}
    .half{padding:4mm 5mm}.par{border-top:1.5px dashed #8090B0;background:#FFF6EC}
    .k{font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#2E4BFF}.par .k{color:#B4540A}
    .n{font-weight:800;font-size:14px;margin-top:1mm}.cl{font-size:11px;color:#556A92}
    .code{font-family:"JetBrains Mono",monospace;font-size:20px;font-weight:700;letter-spacing:.08em;margin:2mm 0}
    .h{font-size:9.5px;color:#556A92;line-height:1.35}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .hint{font-family:Arial;background:#E8EDFF;padding:10px;border-radius:8px;margin-bottom:10px;font-size:13px}@media print{.hint{display:none}}
  </style></head><body><div class="hint">Разрежьте по пунктиру: верхняя часть — ученику, нижняя (оранжевая) — родителям. Для PDF выберите «Сохранить как PDF».</div>
  <div class="grid">${cards}</div></body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 700);
}

function csv(list) {
  const rows = [["Ученик", "Класс", "Код ученика", "Код родителя"], ...list.map(([c, s]) => [s.name, s.cls, prettyCode(c), prettyCode(s.pcode)])];
  const text = "﻿" + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = `kody-${CUR.replace(/[^0-9А-Яа-я]/g, "")}.csv`; a.click();
}

// =====================================================================
//  Пересчёт прогресса: результаты всех работ → progress/<код> и board/<класс>
// =====================================================================
const MSCALE = [[95, 10], [85, 9], [75, 8], [65, 7], [55, 6], [45, 5], [35, 4], [25, 3], [15, 2], [0, 1]];
const mGrade = (pct) => { for (const [p, g] of MSCALE) if (pct >= p) return g; return 1; };
function missionEval(r, t) {
  const parts = t.parts || [];
  const max = parts.reduce((a, p) => a + (p.bonus ? 0 : p.max), 0);
  let pending = 0, openSum = 0;
  for (const q of t.openQs || []) {
    const ans = String(r.open?.[q.k] || "").trim();
    const teacher = Number.isFinite(r.manual?.[q.k]) ? r.manual[q.k] : null;
    const ai = r.ai?.[q.k] && Number.isFinite(r.ai[q.k].score) ? r.ai[q.k].score : null;
    const sc = !ans ? 0 : (teacher ?? ai);
    if (sc === null) pending++; else openSum += sc;
  }
  const pts = parts.reduce((a, p) => a + (p.open ? openSum : Number(r.score?.[p.k]) || 0), 0);
  const pct = max ? Math.min(100, Math.round(pts / max * 100)) : 0;
  return { total: pts, max, pct, grade: mGrade(pct), complete: pending === 0 };
}

async function syncAll() {
  const btn = $("#bSync"), info = $("#syncInfo");
  btn.disabled = true; btn.textContent = "Считаю…"; info.textContent = "";
  try {
    const [rs, ss] = await Promise.all([get(ref(db, "results")), get(ref(db, "settings"))]);
    const RES = rs.val() || {}, SET = ss.val() || {};
    const byName = {};
    for (const [code, s] of Object.entries(ROSTER)) byName[clsKey(s.cls) + "|" + nameKey(s.name)] = code;
    const works = {};                 // code → {testId: work}
    let matched = 0, unmatched = 0;
    for (const t of READY) {
      const list = RES[t.id]; if (!list) continue;
      let KEYS = null;
      if (t.type !== "mission" && !t.teacher) { try { KEYS = (await get(ref(db, `keys/${t.id}`))).val(); } catch (e) {} }
      const K = kindOf(t, SET);
      for (const r of Object.values(list)) {
        if (r.status !== "submitted") continue;
        const code = byName[clsKey(r.cls) + "|" + nameKey(r.name)];
        if (!code) { unmatched++; continue; }
        let e = null;
        try {
          if (t.type === "mission") e = missionEval(r, t);
          else if (t.teacher) e = r.result ? { total: r.result.total, max: r.result.max, pct: Math.round(r.result.total / r.result.max * 100), grade: r.result.grade, complete: !!r.result.complete } : { complete: false, total: 0, max: 0, pct: 0, grade: 0 };
          else if (KEYS) {
            const k = KEYS.variants?.[String(r.variant)];
            if (k) { const g = grade({ ...k, points: KEYS.points }, r.answers || {}, r.manual || {}, r.ai || {});
              e = { total: g.total, max: g.max, pct: Math.round(g.total / g.max * 100), grade: g.complete ? g.grade : toGrade(g.total, g.max), complete: g.complete }; }
          }
        } catch (err) { console.warn(t.id, err); }
        if (!e) e = { complete: false, total: 0, max: 0, pct: 0, grade: 0 };
        const date = r.submittedAt || r.updatedAt || r.startedAt || 0;
        const prev = works[code]?.[t.id];
        if (prev && prev.date > date) continue;           // берём последнюю попытку
        const w = { title: t.title, subject: t.subject, kind: K.id, kindName: K.short, retake: !!t.retake,
          grade: e.grade || 0, total: Math.round((e.total || 0) * 10) / 10, max: e.max || 0, pct: e.pct || 0, complete: !!e.complete,
          viol: r.violations || 0, date };
        if (r.aiSummary) w.summary = { strengths: r.aiSummary.strengths || "", gaps: r.aiSummary.gaps || "", advice: r.aiSummary.advice || "" };
        (works[code] = works[code] || {})[t.id] = w;
        matched++;
      }
    }
    const upd = {}, board = {};
    for (const [code, s] of Object.entries(ROSTER)) {
      const ws = works[code] || {};
      const xp = Object.values(ws).reduce((a, w) => a + xpOf(w), 0);
      upd[`progress/${code}`] = { name: s.name, cls: s.cls, xp, works: ws, updatedAt: Date.now() };
      const ck = clsKey(s.cls);
      board[ck] = board[ck] || { cls: s.cls, xp: 0, n: 0 };
      board[ck].xp += xp; board[ck].n++;
    }
    upd.board = board;
    await update(ref(db), upd);
    await load(); render();
    $("#syncInfo").innerHTML = `✓ Готово: учтено работ — <b>${matched}</b>.` + (unmatched ? ` Не найдено в списках — ${unmatched} (ученик написал имя иначе или его нет в списке класса).` : "");
  } catch (e) {
    console.error(e);
    btn.disabled = false; btn.textContent = "🔄 Обновить прогресс всех учеников";
    info.textContent = "Ошибка: " + (e.code || e.message);
  }
}
