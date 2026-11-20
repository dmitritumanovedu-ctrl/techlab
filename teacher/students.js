// Ученики и родители: личные коды, карточки для печати, пересчёт прогресса (XP, оценки, битва классов)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";
import { SUBJECTS, TESTS } from "../tests.js?v=8";
import { roleOf, pendingHtml } from "../engine/staff.js?v=3";
import { syncProgress, startAutoSync, autoSyncOn, setAutoSync, getClassSubjects, setClassSubjects } from "../engine/sync.js?v=2";
import { plusOf, CLASSES, PLAN, makeCode, prettyCode, nameKey, clsKey, xpOf, levelOf, fmt1, esc } from "../engine/people.js?v=4";

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb), auth = getAuth(fb);
const SITE = new URL("../", location.href).href;
const READY = TESTS.filter((t) => t.path);

let GMSG = "";
let ROSTER = {}, PROGRESS = {}, CSUBJ = {}, CUR = localStorage.getItem("techlab_roster_cls") || "";

onAuthStateChanged(auth, async (user) => {
  if (!user) return showLogin();
  $("#who").innerHTML = `${esc(user.email)} · <a href="#" id="logout" style="color:#fff">выйти</a>`;
  $("#logout").onclick = (e) => { e.preventDefault(); signOut(auth); };
  const role = await roleOf(db, user);
  if (role === "pending") { app.innerHTML = pendingHtml(user, esc); return; }
  if (role === "colleague") { location.replace("builder.html"); return; }
  try { await load(); }
  catch (e) {
    console.error(e);
    app.innerHTML = `<a class="backlink" href="./">← Центр управления</a><div class="card center" style="max-width:700px"><h2>Нет доступа к спискам учеников</h2>
      <p>Скорее всего, в правилах базы Firebase ещё нет разделов <code>roster</code>, <code>parentCodes</code>, <code>progress</code> и <code>board</code>.
      Добавьте их по инструкции (файл <b>firebase-rules-dobavit.txt</b>) и обновите страницу.</p><p class="muted">${esc(e.code || e.message)}</p></div>`;
    return;
  }
  render();
  startAutoSync(db, async (r) => { if (!$("#names")?.value) { await load(); render(); } const el = $("#syncInfo"); if (el) el.innerHTML = `⚡ Прогресс обновлён автоматически в ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · учтено работ: <b>${r.matched}</b>`; });
});

function showLogin() {
  $("#who").textContent = "";
  app.innerHTML = `<div class="card center"><h2>Вход для учителя</h2><p class="muted">Войдите через свой Google-аккаунт учителя.</p>
    <div class="err" id="err"></div><button class="btn" id="go">Войти через Google</button></div>`;
  $("#go").onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { $("#err").textContent = "Не удалось войти: " + (e.code || e.message); } };
}

async function load() {
  const [r, p, cs] = await Promise.all([get(ref(db, "roster")), get(ref(db, "progress")), getClassSubjects(db)]);
  ROSTER = r.val() || {}; PROGRESS = p.val() || {}; CSUBJ = cs || {};
}

// =====================================================================
function render() {
  const works = READY.length;
  const used = Math.min(works, PLAN.limit);
  const inCls = Object.entries(ROSTER).filter(([, s]) => s.cls === CUR).sort((a, b) => a[1].name.localeCompare(b[1].name, "ru"));
  const total = Object.keys(ROSTER).length;
  // предметы, которых нет у всего класса, — их можно включить отдельным ученикам (группа, полкласса)
  const clsS = CSUBJ[clsKey(CUR)] || {};
  const extra = Object.keys(clsS).length ? SUBJECTS.filter((x) => !clsS[x.id] && (!x.grades || x.grades.includes(String(CUR).split(" ")[0]))) : [];
  const grp = (id) => inCls.filter(([, st]) => plusOf(st).includes(id));
  const gradeS = SUBJECTS.filter((x) => !x.grades || x.grades.includes(String(CUR).split(" ")[0]));
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
      ${CUR ? `<h2 style="margin-top:18px">Предметы, которые я веду в ${esc(CUR)}</h2>
      <div class="subj-pick">${SUBJECTS.map((s) => `<label class="sp${CSUBJ[clsKey(CUR)]?.[s.id] ? " on" : ""}"><input type="checkbox" data-subj="${s.id}" ${CSUBJ[clsKey(CUR)]?.[s.id] ? "checked" : ""}> ${s.icon} ${esc(s.name)}</label>`).join("")}</div>
      <p class="muted" style="font-size:14px" id="subjInfo">${Object.keys(CSUBJ[clsKey(CUR)] || {}).length ? "Ученики этого класса и их родители видят только эти предметы. Если предмет у вас только у части класса (например, технология у половины), не отмечайте его здесь — включите его этим ученикам в таблице ниже, в столбце «+ предмет». Код и кабинет у ученика остаются прежними." : "Предметы не выбраны — ученики видят все предметы сайта."}</p>` : ""}
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
      <p>Оценки, опыт (XP), награды и рейтинг классов пересчитываются из результатов всех работ и сразу видны ученику на его странице и родителю в его кабинете.</p>
      <label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" id="auto" ${autoSyncOn() ? "checked" : ""}> ⚡ Автообновление, пока открыта страница учителя</label>
      <button class="btn" id="bSync">🔄 Обновить прогресс сейчас</button>
      <div class="muted" id="syncInfo" style="margin-top:8px;font-size:14px"></div>
    </div>
  </div>

  <div class="card">
    <h2>${CUR ? esc(CUR) + " · " + inCls.length + " уч." : "Выберите класс"}</h2>
    ${extra.filter((x) => grp(x.id).length).map((x) => `<p class="muted" style="font-size:14px;margin-top:-6px">${x.icon} <b>${esc(x.name)}</b> — группа: ${grp(x.id).length} уч.
      <button class="btn small ghost" data-gcards="${x.id}">🖨 Карточки только этой группы</button></p>`).join("")}
    ${GMSG ? `<p class="muted" style="font-size:14px;color:#1a7f37"><b>${GMSG}</b></p>` : ""}
    ${CUR && inCls.length ? `<div style="border:2px solid #DCE4F2;border-radius:12px;padding:14px 16px;margin:6px 0 16px">
      <h3 style="margin:0 0 6px">👥 Предметы учеников ${esc(CUR)}</h3>
      <p class="muted" style="font-size:14px;margin:0 0 10px">Выберите предмет и нажмите: <b>«Всему классу»</b> — его увидят все ученики;
        <b>«Только группе»</b> — вставьте фамилии группы, предмет увидят только они. Коды не меняются.</p>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">${gradeS.map((x) => {
        const all = !!clsS[x.id], g = grp(x.id).length;
        const st = all ? "✅ у всего класса" : g ? `👥 у группы: ${g} уч.` : "— нет";
        return `<label style="display:flex;gap:8px;align-items:center;font-size:15px"><input type="radio" name="gSubj" value="${x.id}"> ${x.icon} <b>${esc(x.name)}</b> <span class="muted">· ${st}</span></label>`; }).join("")}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <button class="btn" id="gAll">✅ Всему классу</button>
        <button class="btn ghost" id="gNone">✕ Убрать предмет у класса</button></div>
      <label class="f" for="gNames">Для группы: фамилии учеников, каждый с новой строки (номера можно не убирать)</label>
      <textarea id="gNames" style="min-height:140px" placeholder="BALAN GLEB&#10;CEBOTARU-POSTICA TAISIA&#10;…"></textarea>
      <div class="err" id="gErr"></div>
      <button class="btn" id="gApply">👥 Только группе по списку</button>
      ${inCls.some(([, st]) => /^\s*\d+[.)]?\s/.test(st.name)) ? `<p class="muted" style="font-size:14px;margin-top:12px">В именах есть номера («1. BALAN GLEB»).
        <button class="btn small ghost" id="gNums">🧹 Убрать номера из имён</button></p>` : ""}
    </div>` : ""}
    ${inCls.length ? `<div class="table-wrap"><table class="res"><thead><tr><th>№</th><th>Ученик</th><th>Код ученика</th><th>Код родителя</th>
      <th>${extra.length ? "+ предмет<br><span class=\"muted\" style=\"font-weight:400;font-size:12px\">только этому ученику</span>" : ""}</th>
      <th>Уровень</th><th>XP</th><th>Работ</th><th>Ср. оценка</th><th></th></tr></thead><tbody>
      ${inCls.map(([code, s], i) => {
        const p = PROGRESS[code] || {}; const ws = Object.values(p.works || {}); const done = ws.filter((w) => w.complete && !w.qual);
        const L = levelOf(p.xp || 0);
        return `<tr><td>${i + 1}</td><td><b>${esc(s.name)}</b></td><td class="code">${prettyCode(code)}</td><td class="code">${prettyCode(s.pcode)}</td>
          <td style="white-space:nowrap">${extra.map((x) => { const on = plusOf(s).includes(x.id);
            return `<button class="plus-b${on ? " on" : ""}" data-plus="${code}" data-ps="${x.id}" title="${on ? "Убрать" : "Добавить"} предмет «${esc(x.name)}» этому ученику">${x.icon} ${esc(x.name.split(" ")[0])}${on ? " ✓" : ""}</button>`; }).join(" ")}</td>
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
  $("#auto").onchange = (e) => { setAutoSync(e.target.checked); if (e.target.checked) startAutoSync(db); else location.reload(); };
  app.querySelectorAll("[data-subj]").forEach((c) => c.onchange = async () => {
    const ids = [...app.querySelectorAll("[data-subj]:checked")].map((x) => x.dataset.subj);
    $("#subjInfo").textContent = "Сохраняю…";
    try {
      await setClassSubjects(db, CUR, ids);
      // кто ведёт предмет у класса — ученики и родители видят имя учителя на карточке предмета
      const u = auth.currentUser, nm = String(u?.displayName || u?.email || "").trim().split(/\s+/);
      const short = nm.length > 1 ? `${nm[1]} ${nm[0][0]}.` : nm[0];
      if (u) await update(ref(db), Object.fromEntries(SUBJECTS.map((x) => [`settings/classTeachers/${clsKey(CUR)}/${x.id}/${u.uid}`, ids.includes(x.id) ? { name: short } : null])));
      await load(); render();
    }
    catch (e) { $("#subjInfo").textContent = "Не удалось сохранить: " + (e.code || e.message); }
  });
  app.querySelectorAll("[data-plus]").forEach((b) => b.onclick = async () => {
    const code = b.dataset.plus, id = b.dataset.ps, on = plusOf(ROSTER[code]).includes(id);
    b.disabled = true;
    try { await update(ref(db), { [`roster/${code}/plus/${id}`]: on ? null : true }); await load(); render(); }
    catch (e) { b.disabled = false; alert("Не удалось сохранить: " + (e.code || e.message)); }
  });
  app.querySelectorAll("[data-gcards]").forEach((b) => b.onclick = () => printCards(grp(b.dataset.gcards)));
  GMSG = "";
  if ($("#gApply")) {
    $("#gApply").onclick = () => applyGroup(inCls, "group");
    $("#gAll").onclick = () => applyGroup(inCls, "all");
    $("#gNone").onclick = () => applyGroup(inCls, "none");
  }
  if ($("#gNums")) $("#gNums").onclick = () => stripNumbers(inCls);
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

// =====================================================================
//  Группа списком: предмет (например, технология) — только части класса
// =====================================================================
// ş/ţ (с седилью) и ș/ț (с запятой) считаем одной буквой, номер в начале строки убираем
const gKey = (s) => nameKey(String(s).replace(/^\s*\d+[.)]?\s*/, "").replace(/[şŞ]/g, "ș").replace(/[ţŢ]/g, "ț"));

// Сохранить предметы всего класса (+ имя учителя на карточке предмета, как при галочках выше)
async function saveClassSubj(ids) {
  await setClassSubjects(db, CUR, ids);
  const u = auth.currentUser, nm = String(u?.displayName || u?.email || "").trim().split(/\s+/);
  const short = nm.length > 1 ? `${nm[1]} ${nm[0][0]}.` : nm[0];
  if (u) await update(ref(db), Object.fromEntries(SUBJECTS.map((x) => [`settings/classTeachers/${clsKey(CUR)}/${x.id}/${u.uid}`, ids.includes(x.id) ? { name: short } : null])));
}

// mode: "all" — предмет всему классу; "group" — только ученикам из списка; "none" — убрать у всех
async function applyGroup(inCls, mode) {
  const err = $("#gErr"); err.textContent = "";
  const id = app.querySelector('input[name="gSubj"]:checked')?.value;
  if (!id) return (err.textContent = "Сначала выберите предмет в списке выше.");
  const subj = SUBJECTS.find((x) => x.id === id), nm = subj?.name || id;
  const base = Object.keys(CSUBJ[clsKey(CUR)] || {}).filter((k) => k !== id);   // остальные предметы всего класса
  const upd = {}; let pick = new Set(), miss = [];

  if (mode === "group") {
    const lines = $("#gNames").value.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    if (!lines.length) return (err.textContent = "Вставьте фамилии учеников группы в поле выше.");
    const byKey = new Map(inCls.map(([code, s]) => [gKey(s.name), code]));
    for (const l of lines) { const c = byKey.get(gKey(l)); if (c) pick.add(c); else miss.push(l); }
    if (!pick.size) return (err.textContent = "Никого из списка не нашлось в " + CUR + ".");
    if (!base.length) return (err.textContent = `Сначала выберите предмет, который у вас у ВСЕГО класса (например, Математика), и нажмите «Всему классу». Потом снова выберите «${nm}» → «Только группе».`);
    if (miss.length && !confirm(`Не найдены в ${CUR}:\n${miss.join("\n")}\n\nПродолжить без них?`)) return;
    if (!confirm(`«${nm}» увидят ${pick.size} уч. из ${inCls.length}. Сохранить?`)) return;
  }
  if (mode === "none" && !base.length) return (err.textContent = "Это единственный предмет класса — если убрать его, ученики увидят все предметы сайта. Сначала добавьте классу другой предмет.");
  if (mode === "none" && !confirm(`Убрать «${nm}» у всех учеников ${CUR}?`)) return;

  for (const [code] of inCls) upd[`roster/${code}/plus/${id}`] = mode === "group" && pick.has(code) ? true : null;
  const ids = mode === "all" ? [...base, id] : base;
  try {
    // сначала общие предметы класса, потом отметки учеников — чтобы у класса ни на миг не пропали все предметы
    await saveClassSubj(ids);
    await update(ref(db), upd);
    await load();
    GMSG = mode === "all" ? `✓ ${esc(nm)}: у всего класса` : mode === "none" ? `✓ ${esc(nm)}: убран` :
      `✓ ${esc(nm)}: только группе — ${pick.size} уч.` + (miss.length ? ` · не найдено: ${miss.length}` : "");
    render();
  } catch (e) { err.textContent = "Не удалось сохранить: " + (e.code || e.message); }
}

// «1. BALAN GLEB» → «BALAN GLEB»
async function stripNumbers(inCls) {
  const upd = {};
  for (const [code, s] of inCls) { const n = s.name.replace(/^\s*\d+[.)]?\s+/, ""); if (n !== s.name) upd[`roster/${code}/name`] = n; }
  const k = Object.keys(upd).length;
  if (!k || !confirm(`Убрать номера у ${k} уч.? Коды не меняются.`)) return;
  try { await update(ref(db), upd); await load(); GMSG = `✓ Номера убраны у ${k} уч.`; render(); }
  catch (e) { alert("Не удалось сохранить: " + (e.code || e.message)); }
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
//  Пересчёт прогресса вручную (то же делает автообновление — engine/sync.js)
// =====================================================================
async function syncAll() {
  const btn = $("#bSync"), info = $("#syncInfo");
  btn.disabled = true; btn.textContent = "Считаю…"; info.textContent = "";
  try {
    const r = await syncProgress(db, ROSTER);
    await load(); render();
    $("#syncInfo").innerHTML = `✓ Готово: учтено работ — <b>${r.matched}</b>.` + (r.unmatched ? ` Не найдено в списках — ${r.unmatched} (ученик написал имя иначе или его нет в списке класса).` : "");
  } catch (e) {
    console.error(e);
    btn.disabled = false; btn.textContent = "🔄 Обновить прогресс сейчас";
    info.textContent = "Ошибка: " + (e.code || e.message);
  }
}
