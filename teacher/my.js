// =====================================================================
//  TechLab · «Мои предметы» — кабинет учителя.
//  Учитель выбирает предметы, которые ведёт, и подключает к ним классы.
//  Ученики и родители этих классов сразу видят предмет и имя учителя.
//  Новый предмет (которого нет на сайте) — заявка администратору.
//  Часть класса (группа) подключается администратором в «Ученики и родители».
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";
import { roleOf, pendingHtml, myStaff, logAction } from "../engine/staff.js?v=3";
import { SUBJECTS, addSubjects, TESTS } from "../tests.js?v=9";
import { CLASSES, clsKey, makeCode, prettyCode, cleanCode } from "../engine/people.js?v=4";
import { startNotify } from "../engine/notify.js?v=2";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app"), dlg = $("#dlg");
const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb), auth = getAuth(fb);
let USER = null, ROLE = "none", MINE = {}, CT = {}, REQ = {}, NAME = "", SHARED = {}, CODES = {}, JOINS = {};
const shortName = (n) => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? `${p[1]} ${p[0][0]}.` : p[0] || ""; };
const val = async (p) => { try { return (await get(ref(db, p))).val(); } catch (e) { return null; } };

onAuthStateChanged(auth, async (user) => {
  USER = user;
  if (!user) return showLogin();
  ROLE = await roleOf(db, user);
  $("#sideWho").innerHTML = `${esc(user.email)} · <a href="#" id="out" style="color:inherit">выйти</a>`;
  $("#out").onclick = (e) => { e.preventDefault(); signOut(auth); };
  if (ROLE === "pending") { app.innerHTML = pendingHtml(user, esc); return; }
  NAME = shortName(user.displayName || user.email);
  await load(); route();
  startNotify(db, user, ROLE, { base: "../" });
  if (location.hash === "#shared") setTimeout(() => document.getElementById("shared")?.scrollIntoView({ behavior: "smooth" }), 300);
});
function showLogin() {
  app.innerHTML = `<div class="ad-card ad-center"><h2>📚 Мои предметы</h2><p class="muted">Войдите Google-аккаунтом учителя.</p>
    <button class="btn" id="go">Войти через Google</button><p class="bad-t" id="err"></p></div>`;
  $("#go").onclick = async () => { try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { $("#err").textContent = e.code || e.message; } };
}
async function load() {
  const [xs, ct, me, rq, sh] = await Promise.all([val("settings/subjects"), val("settings/classTeachers"),
    ROLE === "admin" ? Promise.resolve(null) : val(`staff/${USER.uid}`), val(`subjectRequests/${USER.uid}`),
    ROLE === "admin" ? Promise.resolve(null) : val(`staffShares/${USER.uid}`)]);
  SHARED = sh || {};
  if (xs) addSubjects(xs);
  CT = ct || {}; REQ = rq || {};
  // коды классов этого учителя (classCodes/<код> = { cls, sid, uid }) и заявки учеников на вход
  CODES = {}; JOINS = {};
  try { const c = (await get(query(ref(db, "classCodes"), orderByChild("uid"), equalTo(USER.uid)))).val() || {};
    for (const [k, x] of Object.entries(c)) if (x && x.cls && x.sid) CODES[x.cls + "|" + x.sid] = k; } catch (e) { console.warn("classCodes", e.code || e); }
  const ks = Object.values(CODES);
  await Promise.all(ks.map(async (k) => { try { const j = (await get(query(ref(db, "joinRequests"), orderByChild("k"), equalTo(k)))).val() || {};
    for (const [id, x] of Object.entries(j)) if (x && x.status === "new") JOINS[id] = x; } catch (e) { console.warn("joinRequests", e.code || e); } }));
  if (ROLE === "admin") {
    MINE = {};                                            // администратор: предметы, где он уже подключил классы
    for (const subs of Object.values(CT)) for (const [sid, t] of Object.entries(subs || {})) if (t?.[USER.uid]) MINE[sid] = true;
  } else {
    MINE = { ...(me?.subj || {}) };
    for (const s of me?.subjects || []) MINE[s] = true;    // предметы, которые выдал администратор при приёме
  }
}
const joinsOf = (k) => k ? Object.entries(JOINS).filter(([, x]) => x.k === k) : [];
const myClasses = (sid) => Object.entries(CT).filter(([, subs]) => subs?.[sid]?.[USER.uid]).map(([k]) => k);

function render() {
  const S = SUBJECTS.filter((s) => MINE[s.id]);
  const pend = Object.entries(REQ).filter(([, x]) => x && !x.done);
  app.innerHTML = `<div class="ad-h"><h2>📚 Мои предметы</h2><span class="sp"></span><span class="sub">${esc(NAME)} · ${ROLE === "admin" ? "администратор" : "учитель"}</span></div>
    <p class="sub" style="margin:-4px 0 16px">Выберите, что вы ведёте, и подключите классы — у учеников и их родителей предмет появится сразу, с вашим именем.</p>
    <div class="my-grid">
      ${S.map((s) => `<div class="my-s"><span class="my-st ok">активен</span><div class="ic">${s.icon}</div><b class="n">${esc(s.name)}</b>
        <div class="my-rows">${myClasses(s.id).map((c) => { const k = CODES[c + "|" + s.id], nj = joinsOf(k).length;
          return `<div class="my-row"><b>${esc(c)}</b><span class="sp"></span>${k ? `<code class="my-code">${esc(prettyCode(k))}</code>` : `<button class="btn ghost small" data-mk="${esc(s.id)}|${esc(c)}">Создать код</button>`}
            ${nj ? `<span class="my-badge" title="Заявки учеников">${nj}</span>` : ""}<a class="btn small" href="#c=${encodeURIComponent(c)}|${encodeURIComponent(s.id)}">Открыть</a>
            <button class="my-x" title="Отключить класс" data-off="${esc(s.id)}|${esc(c)}">✕</button></div>`; }).join("")}</div>
        <button class="my-add" data-addcls="${esc(s.id)}" style="margin-top:10px">＋ класс</button>
        ${!myClasses(s.id).length ? `<p class="sub" style="margin-top:10px">Классы ещё не подключены.</p>` : ""}
        <div style="margin-top:12px"><button class="btn ghost small" data-drop="${esc(s.id)}">Убрать предмет</button></div></div>`).join("")}
      ${pend.map(([, x]) => `<div class="my-s"><span class="my-st wait">ждёт одобрения</span><div class="ic">${esc(x.icon || "📘")}</div><b class="n">${esc(x.name)}</b>
        <p class="sub" style="margin-top:10px">Новый предмет появится после одобрения администратором.</p></div>`).join("")}
      <button class="my-new" id="addSubj">＋<br>Добавить предмет<br><span class="sub" style="font-weight:500">выбрать из списка или предложить новый</span></button>
    </div>
    ${ROLE !== "admin" ? sharedHtml() : ""}
    <div class="ad-card" style="margin-top:18px"><b>Как это работает</b>
      <ul style="margin:8px 0 0;padding-left:18px;line-height:1.6">
        <li>Предметы и работы видят только ученики ваших классов. Гости сайта видят лишь работы, отмеченные «открыть всем».</li>
        <li>У каждого класса свой код. Новый ученик вводит его на главной и пишет имя — вы подтверждаете заявку на странице класса.</li>
        <li>Ваши тесты из Конструктора появляются у класса, когда вы их публикуете и открываете.</li>
        <li>Если предмет у вас только у части класса (группа), напишите администратору — он отметит учеников. Коды у детей не меняются.</li>
      </ul></div>`;
  app.querySelectorAll("[data-addcls]").forEach((b) => b.onclick = () => classDialog(b.dataset.addcls));
  app.querySelectorAll("[data-off]").forEach((b) => b.onclick = () => { const [sid, c] = b.dataset.off.split("|"); disconnect(sid, c); });
  app.querySelectorAll("[data-drop]").forEach((b) => b.onclick = () => dropSubject(b.dataset.drop));
  app.querySelectorAll("[data-mk]").forEach((b) => b.onclick = async () => { const [sid, c] = b.dataset.mk.split("|"); b.disabled = true; await makeClassCode(sid, c); render(); });
  $("#addSubj").onclick = subjectDialog;
}

// ---------- 📥 «Мне открыли»: тесты и материалы, которыми поделился администратор ----------
function sharedHtml() {
  const L = Object.entries(SHARED).filter(([, x]) => x && typeof x === "object").sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  const fresh = (x) => Date.now() - (x.at || 0) < 3 * 864e5;
  const bySubj = {};
  for (const [id, x] of L) (bySubj[x.subject || ""] = bySubj[x.subject || ""] || []).push([id, x]);
  return `<div class="ad-card" id="shared" style="margin-top:18px"><div class="ad-h" style="margin:0 0 6px"><b>📥 Мне открыли</b><span class="sp"></span><span class="sub">${L.length} шт.</span></div>
    ${L.length ? Object.entries(bySubj).map(([sid, arr]) => { const sj = SUBJECTS.find((x) => x.id === sid);
      return `<div style="margin-top:10px"><div class="sub" style="font-weight:700;margin-bottom:4px">${sj ? sj.icon + " " + esc(sj.name) : "Без предмета"}</div>
        ${arr.map(([id, x]) => `<div class="req"><div class="who"><b>${x.kind === "material" ? (x.file ? "📁" : "🔗") : "🧩"} ${esc(x.title || id)}</b>${fresh(x) ? ' <span class="chip ok">новое</span>' : ""}
          <div class="sub">${x.kind === "material" ? (x.file ? "файл · " + esc(x.file.name || "") : "ссылка") : "тест — в Конструкторе, вкладка «📂 Общая папка», кнопка «📥 Скопировать к себе»"}${x.grade ? " · " + esc(x.grade) + " кл." : ""} · от ${esc(x.by || "администратора")}</div></div>
          ${x.kind === "material" ? `<a class="btn small" href="${esc(x.url)}" target="_blank" rel="noopener">Открыть ↗</a>` : `<a class="btn small" href="builder.html">В Конструктор →</a>`}</div>`).join("")}</div>`; }).join("")
      : '<div class="empty">Пока ничего. Когда администратор откроет вам тест или материал, он появится здесь, а на колокольчике 🔔 загорится число.</div>'}</div>`;
}

function openDlg(title, body) {
  dlg.innerHTML = `<div class="hd"><b>${title}</b><button class="btn small ghost" data-x>Закрыть ✕</button></div><div class="bd">${body}</div>`;
  dlg.querySelector("[data-x]").onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
}
function classDialog(sid) {
  const s = SUBJECTS.find((x) => x.id === sid), have = myClasses(sid);
  const list = CLASSES.filter((c) => !s?.grades?.length || s.grades.includes(c.split(" ")[0]));
  openDlg(`＋ Подключить класс · ${esc(s?.icon || "")} ${esc(s?.name || sid)}`, `
    <label class="f">Класс (можно несколько)</label>
    <div class="pills">${list.map((c) => `<button class="pill" data-c="${esc(c)}" ${have.includes(clsKey(c)) ? "disabled" : ""}>${esc(c)}</button>`).join("")}</div>
    <p class="sub" style="margin-top:10px">Подключается весь класс. Для части класса (группы) — напишите администратору.</p>
    <div style="margin-top:14px;display:flex;gap:8px"><button class="btn" id="cOk">Подключить</button><span class="bad-t" id="cErr"></span></div>`);
  dlg.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => b.classList.toggle("on"));
  $("#cOk").onclick = async () => {
    const cls = [...dlg.querySelectorAll("[data-c].on")].map((b) => b.dataset.c);
    if (!cls.length) return ($("#cErr").textContent = "Выберите класс.");
    const upd = {};
    for (const c of cls) { upd[`settings/classSubjects/${clsKey(c)}/${sid}`] = true; upd[`settings/classTeachers/${clsKey(c)}/${sid}/${USER.uid}`] = { name: NAME }; }
    try { await update(ref(db), upd); logAction(db, USER, `${NAME}: подключены классы ${cls.join(", ")} к предмету «${s?.name || sid}»`, "staff"); dlg.close(); await load(); render(); }
    catch (e) { $("#cErr").textContent = "Не удалось: " + (e.code || e.message); }
  };
}
async function disconnect(sid, c) {
  const s = SUBJECTS.find((x) => x.id === sid);
  if (!confirm(`Отключить ${c} от предмета «${s?.name || sid}»? Оценки учеников останутся.`)) return;
  const others = Object.keys(CT[c]?.[sid] || {}).filter((u) => u !== USER.uid);
  const upd = { [`settings/classTeachers/${c}/${sid}/${USER.uid}`]: null };
  if (!others.length) upd[`settings/classSubjects/${c}/${sid}`] = null;   // больше никто не ведёт — предмет у класса скрывается
  try { await update(ref(db), upd); logAction(db, USER, `${NAME}: класс ${c} отключён от «${s?.name || sid}»`, "staff"); await load(); render(); }
  catch (e) { alert("Не удалось: " + (e.code || e.message)); }
}
async function dropSubject(sid) {
  if (myClasses(sid).length) return alert("Сначала отключите классы этого предмета.");
  if (ROLE === "admin") { delete MINE[sid]; return render(); }
  try { await remove(ref(db, `staff/${USER.uid}/subj/${sid}`)); await load(); render(); } catch (e) { alert(e.code || e.message); }
}
function subjectDialog() {
  const free = SUBJECTS.filter((s) => !MINE[s.id]);
  openDlg("＋ Добавить предмет", `
    <label class="f">Выбрать из предметов сайта</label>
    <div class="pills">${free.length ? free.map((s) => `<button class="pill" data-s="${s.id}">${s.icon} ${esc(s.name)}</button>`).join("") : '<span class="sub">Все предметы сайта уже у вас.</span>'}</div>
    <div style="margin-top:10px"><button class="btn" id="sOk">Добавить выбранные</button></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
    <label class="f" for="nName">Или предложить новый предмет</label><input id="nName" maxlength="40" placeholder="Например: История">
    <div style="display:grid;grid-template-columns:90px 1fr;gap:8px;margin-top:8px"><input id="nIcon" maxlength="4" value="📘" title="Значок"><input id="nGr" placeholder="Классы: 5, 6, 7"></div>
    <div class="hint">Новый предмет появится у учеников после одобрения администратором. Предмет из списка — сразу.</div>
    <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button class="btn ghost" id="nOk">Отправить на одобрение</button><span class="bad-t" id="nErr"></span></div>`);
  dlg.querySelectorAll("[data-s]").forEach((b) => b.onclick = () => b.classList.toggle("on"));
  $("#sOk").onclick = async () => {
    const ids = [...dlg.querySelectorAll("[data-s].on")].map((b) => b.dataset.s);
    if (!ids.length) return;
    if (ROLE === "admin") { ids.forEach((i) => (MINE[i] = true)); dlg.close(); return render(); }
    try { await update(ref(db), Object.fromEntries(ids.map((i) => [`staff/${USER.uid}/subj/${i}`, true]))); dlg.close(); await load(); render(); }
    catch (e) { alert("Не удалось: " + (e.code || e.message)); }
  };
  $("#nOk").onclick = async () => {
    const name = $("#nName").value.trim(), icon = $("#nIcon").value.trim() || "📘";
    const grades = $("#nGr").value.split(/[ ,;]+/).filter((x) => /^\d{1,2}$/.test(x));
    if (name.length < 2) return ($("#nErr").textContent = "Введите название.");
    if (!grades.length) return ($("#nErr").textContent = "Укажите классы цифрами.");
    const id = "r" + Date.now().toString(36);
    try {
      await set(ref(db, `subjectRequests/${USER.uid}/${id}`), { name, icon, grades, by: NAME, email: USER.email || "", at: Date.now() });
      logAction(db, USER, `${NAME} предложил(а) новый предмет «${name}»`, "staff");
      dlg.close(); await load(); render();
    } catch (e) { $("#nErr").textContent = "Не удалось: " + (e.code || e.message); }
  };
}


// =====================================================================
//  Закрытые классы: код класса, заявки учеников, работы класса («только классу» / «всем»)
// =====================================================================
addEventListener("hashchange", () => { if (USER) route(); });
function route() {
  const m = decodeURIComponent(location.hash).match(/^#c=(.+)\|(.+)$/);
  if (m && MINE[m[2]] && myClasses(m[2]).includes(m[1])) return classView(m[1], m[2]);
  render();
}
async function makeClassCode(sid, c) {
  for (let i = 0; i < 5; i++) {
    const k = makeCode("K");
    try {
      if ((await get(ref(db, `classCodes/${k}`))).exists()) continue;
      await set(ref(db, `classCodes/${k}`), { cls: c, sid, uid: USER.uid, name: NAME, at: Date.now() });
      CODES[c + "|" + sid] = k; logAction(db, USER, `${NAME}: код класса ${c} · ${sid}`, "staff"); return k;
    } catch (e) { alert("Не удалось создать код: " + (e.code || e.message) + "\nВероятно, нужно обновить правила Firebase (см. инструкцию)."); return null; }
  }
  return null;
}
const subjOf = (sid) => SUBJECTS.find((x) => x.id === sid) || { id: sid, name: sid, icon: "📘" };
async function classView(c, sid) {
  const s = subjOf(sid), grade = String(c).split(" ")[0], k = CODES[c + "|" + sid];
  app.innerHTML = `<div class="ad-card ad-center"><p class="muted">Загрузка класса…</p></div>`;
  const [roster, cs, settings, mine] = await Promise.all([val("roster"), val(`settings/classSubjects/${clsKey(c)}`), val("settings"), val(`builder/${USER.uid}`)]);
  const whole = !!(cs && cs[sid]);
  const kids = roster ? Object.entries(roster).filter(([, x]) => x && clsKey(x.cls) === clsKey(c) && (whole || x.plus?.[sid])).sort((a, b) => String(a[1].name).localeCompare(String(b[1].name), "ru")) : null;
  // работы: тесты сайта (администратор) + свои тесты из Конструктора
  const site = ROLE === "admin" ? TESTS.filter((t) => t.subject === sid && String(t.grade) === grade && t.path) : [];
  const own = Object.entries(mine || {}).filter(([, t]) => t && t.pubAt && t.subject === sid && String(t.grade || "") === grade).map(([id, t]) => ({ id, title: t.title, path: `../b/?t=${id}`, own: true }));
  const works = site.map((t) => ({ id: t.id, title: t.title, path: "../" + t.path })).concat(own);
  const st = (id) => settings?.[id] || {};
  const jn = joinsOf(k);
  const sw = (id, key, on, label) => `<label class="my-sw"><input type="checkbox" data-sw="${esc(id)}|${key}" ${on ? "checked" : ""}><span></span>${label}</label>`;
  app.innerHTML = `<div class="crumbs" style="margin-bottom:10px"><a href="#">📚 Мои предметы</a> › ${esc(s.name)} › <b>${esc(c)}</b></div>
    <div class="ad-card my-head"><div class="ic" style="font-size:30px">${s.icon}</div><div style="flex:1"><h2 style="margin:0">${esc(s.name)} · ${esc(c)}</h2>
      <div class="sub">${kids ? kids.length + " учеников" : "список учеников видит администратор"}${whole ? " · весь класс" : " · группа"}</div></div>
      <div class="my-codebox"><small>КОД КЛАССА</small>${k ? `<b>${esc(prettyCode(k))}</b><button class="btn ghost small" id="show">Показать на экране</button>` : `<button class="btn" id="mk">Создать код</button>`}</div></div>
    ${jn.length ? `<div class="ad-card" style="margin-top:14px;border:2px solid #F29A3A"><b>✋ Заявки на вход · ${jn.length}</b>
      ${jn.map(([id, x]) => `<div class="req"><div class="who"><b>${esc(x.name)}</b><div class="sub">${x.scode ? "уже есть код " + esc(prettyCode(x.scode)) + " · просит добавить предмет" : "новый ученик"} · ${new Date(x.at || 0).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div></div>
        <button class="btn small" data-ok="${esc(id)}">Принять</button> <button class="btn ghost small" data-no="${esc(id)}">Отклонить</button></div>`).join("")}</div>` : ""}
    <div class="my-2col">
      <div class="ad-card"><b>Работы класса</b><p class="sub" style="margin:4px 0 8px">«Открыта» — класс видит работу на главной. «Всем» — работа попадает в открытые тренажёры для гостей сайта (без оценки).</p>
        ${works.length ? works.map((w) => `<div class="req"><div class="who"><b>${esc(w.title)}</b><div class="sub">${w.own ? "мой тест из Конструктора" : "тест сайта"} · <a href="${esc(w.path)}" target="_blank" rel="noopener">открыть ↗</a></div></div>
          <div class="my-sws">${sw(w.id, "open", st(w.id).open, "открыта")}${sw(w.id, "public", st(w.id).public, "всем")}</div></div>`).join("")
          : `<div class="empty">Для ${esc(grade)} класса по этому предмету ещё нет работ. Создайте тест в <a href="builder.html">Конструкторе</a> — укажите предмет и класс.</div>`}</div>
      <div class="ad-card"><b>Ученики</b>${kids ? (kids.length ? kids.map(([code, x]) => `<div class="req"><div class="who"><b>${esc(x.name)}</b></div><code class="my-code">${esc(prettyCode(code))}</code></div>`).join("")
          : '<div class="empty">Пока никого. Раздайте код класса — ученики сами отправят заявки.</div>') : '<div class="empty">Список учеников доступен администратору.</div>'}</div>
    </div>`;
  if ($("#mk")) $("#mk").onclick = async () => { await makeClassCode(sid, c); classView(c, sid); };
  if ($("#show")) $("#show").onclick = () => openDlg("Код класса", `<div style="text-align:center;padding:20px 10px"><div class="sub">Откройте сайт TechLab, нажмите «Я ученик» и введите:</div>
    <div style="font:800 64px/1.2 ui-monospace,monospace;letter-spacing:.08em;margin:18px 0">${esc(prettyCode(k))}</div><div class="sub">${esc(s.name)} · ${esc(c)} · ${esc(NAME)}</div></div>`);
  app.querySelectorAll("[data-sw]").forEach((x) => x.onchange = async () => {
    const [id, key] = x.dataset.sw.split("|");
    try {
      await set(ref(db, `settings/${id}/${key}`), x.checked);
      logAction(db, USER, `${NAME}: «${works.find((w) => w.id === id)?.title || id}» — ${key === "open" ? (x.checked ? "открыта" : "закрыта") : (x.checked ? "открыта всем" : "только классу")}`, "test");
    } catch (e) { x.checked = !x.checked; alert("Не удалось: " + (e.code || e.message)); }
  });
  app.querySelectorAll("[data-ok]").forEach((b) => b.onclick = () => acceptJoin(b.dataset.ok, c, sid, whole));
  app.querySelectorAll("[data-no]").forEach((b) => b.onclick = async () => {
    try { await update(ref(db, `joinRequests/${b.dataset.no}`), { status: "no", by: NAME }); delete JOINS[b.dataset.no]; classView(c, sid); } catch (e) { alert(e.code || e.message); }
  });
}
async function acceptJoin(id, c, sid, whole) {
  const x = JOINS[id]; if (!x) return;
  try {
    const upd = {};
    let code = x.scode ? cleanCode(x.scode) : "";
    if (code) {                                       // ученик уже есть — добавляем предмет
      const r = await val(`roster/${code}`);
      if (!r) throw new Error("ученик с кодом " + code + " не найден");
      if (!whole || clsKey(r.cls) !== clsKey(c)) upd[`roster/${code}/plus/${sid}`] = true;
    } else {                                          // новый ученик — выдаём личный код и код родителя
      code = makeCode("S"); const p = makeCode("P");
      upd[`roster/${code}`] = { name: x.name, cls: c, pcode: p, at: Date.now(), ...(whole ? {} : { plus: { [sid]: true } }) };
      upd[`parentCodes/${p}`] = code;
    }
    upd[`joinRequests/${id}/status`] = "ok"; upd[`joinRequests/${id}/code`] = code; upd[`joinRequests/${id}/by`] = NAME;
    await update(ref(db), upd);
    logAction(db, USER, `${NAME}: принят(а) в ${c} · ${x.name}`, "staff");
    delete JOINS[id]; classView(c, sid);
  } catch (e) { alert("Не удалось принять: " + (e.code || e.message) + (String(e.code || "").includes("PERMISSION") ? "\nСоздавать учеников может администратор — попросите его принять заявку." : "")); }
}
