// Кабинет родителя: вход по коду родителя → оценки, работы, советы из разборов ИИ
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "../firebase-config.js";
import { SUBJECTS } from "../tests.js?v=7";
import { cleanCode, prettyCode, levelOf, awardsOf, fmt1, esc } from "../engine/people.js?v=1";

const $ = (s) => document.querySelector(s);
const app = $("#app");
const db = getDatabase(initializeApp(firebaseConfig));
const KEY = "techlab_parent";
const subj = (id) => SUBJECTS.find((s) => s.id === id) || { name: "", icon: "" };
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
    <h1>Успехи вашего ребёнка</h1>
    <p>Введите код родителя с карточки, которую выдал учитель. Вы увидите оценки, выполненные работы и советы, что повторить.</p>
    <form id="f"><label for="c" class="sr">Код родителя</label>
      <input id="c" autocomplete="off" spellcheck="false" maxlength="14" placeholder="PXXX-XXXX">
      <div class="err" id="e">${esc(err)}</div>
      <button class="btn-p" type="submit">Войти</button></form>
    <small class="muted">Код начинается с буквы P. Детей несколько — после входа можно добавить второй код.</small></div>`;
  $("#c").focus();
  $("#f").onsubmit = async (ev) => {
    ev.preventDefault();
    const c = cleanCode($("#c").value);
    if (c[0] === "S") return ($("#e").textContent = "Это код ученика. Нужен код родителя — он начинается с P.");
    if (c.length < 6 || c[0] !== "P") return ($("#e").textContent = "Проверьте код: он начинается с буквы P.");
    $("#e").textContent = "Проверяю…";
    try {
      const s = (await get(ref(db, `parentCodes/${c}`))).val();
      if (!s) return ($("#e").textContent = "Такого кода нет. Проверьте буквы и цифры.");
      const list = codes().filter((x) => x !== c); list.unshift(c); saveCodes(list); CUR = c;
      show(c);
    } catch (x) { $("#e").textContent = "Нет связи с сервером. Попробуйте ещё раз."; }
  };
}

async function show(pcode) {
  app.innerHTML = `<div class="pc"><p class="muted">Загружаю…</p></div>`;
  let scode, R, P;
  try {
    scode = (await get(ref(db, `parentCodes/${pcode}`))).val();
    if (!scode) { saveCodes(codes().filter((x) => x !== pcode)); return login("Код больше не действует — попросите у учителя новый."); }
    const [r, p] = await Promise.all([get(ref(db, `roster/${scode}`)), get(ref(db, `progress/${scode}`))]);
    R = r.val(); P = p.val() || { xp: 0, works: {} };
  } catch (e) { app.innerHTML = `<div class="pc"><h2>Нет связи с сервером</h2><p>Обновите страницу чуть позже.</p></div>`; return; }
  if (!R) { saveCodes(codes().filter((x) => x !== pcode)); return login("Ученик не найден — попросите у учителя новый код."); }

  // переключатель детей
  const list = codes();
  const names = await Promise.all(list.map(async (c) => {
    if (c === pcode) return [c, R.name];
    try { const s = (await get(ref(db, `parentCodes/${c}`))).val(); const r = s && (await get(ref(db, `roster/${s}`))).val(); return [c, r ? r.name : prettyCode(c)]; }
    catch (e) { return [c, prettyCode(c)]; }
  }));
  $("#who").innerHTML = `<label for="child" class="muted">Ребёнок:</label>
    <select id="child">${names.map(([c, n]) => `<option value="${c}" ${c === pcode ? "selected" : ""}>${esc(n)}</option>`).join("")}
      <option value="+">+ добавить ещё ребёнка</option></select>
    <button type="button" class="p-out" id="out">Выйти</button>`;
  $("#child").onchange = (e) => { if (e.target.value === "+") return login(); CUR = e.target.value; show(CUR); };
  $("#out").onclick = () => { if (confirm("Выйти и забыть коды на этом устройстве?")) { saveCodes([]); login(); } };

  const works = Object.values(P.works || {}).sort((a, b) => (b.date || 0) - (a.date || 0));
  const done = works.filter((w) => w.complete);
  const avg = done.length ? done.reduce((a, w) => a + w.grade, 0) / done.length : null;
  const pending = works.length - done.length;
  const viol = works.reduce((a, w) => a + (w.viol || 0), 0);
  const L = levelOf(P.xp || 0);
  const aw = awardsOf(P.works).filter((a) => a.ok);
  const bySubj = {};
  for (const w of done) (bySubj[w.subject] = bySubj[w.subject] || []).push(w.grade);
  const sumW = works.find((w) => w.summary);
  const fmtD = (t) => t ? new Date(t).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "";
  const gc = (g) => g >= 9 ? "g-hi" : g >= 7 ? "g-mid" : g >= 5 ? "g-lo" : "g-bad";
  const upd = P.updatedAt ? new Date(P.updatedAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";

  app.innerHTML = `
  <h1 class="p-h1">Успехи: ${esc(R.name)} <small>${esc(R.cls)}</small></h1>
  <div class="p-stats">
    <div class="pc ps"><span>Средняя оценка</span><b class="blue">${avg === null ? "—" : fmt1(avg)}</b><small>по ${done.length} ${done.length === 1 ? "проверенной работе" : "проверенным работам"}</small></div>
    <div class="pc ps"><span>Выполнено работ</span><b>${works.length}</b><small>${pending ? `${pending} ждёт проверки учителем` : "все проверены"}</small></div>
    <div class="pc ps"><span>Уровень на платформе</span><b>${L.n}</b><small>${esc(L.name)} · ${P.xp || 0} XP · наград: ${aw.length}</small></div>
    <div class="pc ps"><span>Нарушения в тестах</span><b class="${viol ? "red" : "green"}">${viol}</b><small>${viol ? "уход со вкладки, попытки копирования" : "честная работа"}</small></div>
  </div>

  <div class="p-grid">
    <div class="pc">
      <h2>Работы</h2>
      ${works.length ? works.map((w) => `<div class="pw">
          <span class="wg ${w.complete ? gc(w.grade) : "g-wait"}">${w.complete ? w.grade : "…"}</span>
          <div class="pw-t"><b>${esc(w.title)}</b><small>${esc(subj(w.subject).name)} · ${esc(w.kindName || "")}${w.retake ? " · пересдача" : ""} · ${fmtD(w.date)}</small></div>
          <span class="pw-p">${w.complete ? `${fmt1(w.total)} / ${w.max} б.` : "проверяется"}</span></div>`).join("")
        : `<p class="muted">Пока нет работ. Они появятся здесь после того, как учитель проверит первую работу.</p>`}
    </div>
    <div class="p-side">
      ${sumW ? `<div class="pc p-ai"><h2>Разбор последней работы</h2><p class="muted small">${esc(sumW.title)}</p>
        ${sumW.summary.strengths ? `<p><b>Получается хорошо:</b> ${esc(sumW.summary.strengths)}</p>` : ""}
        ${sumW.summary.gaps ? `<p><b>Есть пробелы:</b> ${esc(sumW.summary.gaps)}</p>` : ""}
        ${sumW.summary.advice ? `<p><b>Что повторить дома:</b> ${esc(sumW.summary.advice)}</p>` : ""}</div>` : ""}
      <div class="pc"><h2>По предметам</h2>
        ${Object.keys(bySubj).length ? Object.entries(bySubj).map(([s, g]) => {
          const a = g.reduce((x, y) => x + y, 0) / g.length;
          return `<div class="sb"><span>${esc(subj(s).name)}</span><span class="sb-b"><i style="width:${a * 10}%"></i></span><b>${fmt1(a)}</b></div>`; }).join("")
          : `<p class="muted">Нет проверенных работ.</p>`}
      </div>
      <div class="pc p-note"><h2>Как читать оценки</h2>
        <p class="small">Оценки по 10-балльной шкале. Развёрнутые ответы проверяются с помощью ИИ, окончательную оценку утверждает учитель.
          «…» — работа сдана и ждёт проверки.${upd ? ` Данные обновлены ${esc(upd)}.` : ""}</p></div>
    </div>
  </div>`;
}
