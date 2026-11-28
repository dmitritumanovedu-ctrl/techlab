// =====================================================================
//  TechLab · вход в класс по коду класса (K…)
//  Новый ученик: вводит код класса и своё имя → заявка учителю → учитель принимает →
//  ученик получает личный код и входит сам (страница ждёт ответа).
//  Ученик, который уже вошёл: код класса добавляет ему предмет (например, группа по технологии).
//  Данные: classCodes/<K> = { cls, sid, uid, name }   joinRequests/<id> = { k, name, scode?, status, code? }
// =====================================================================
import { firebaseConfig } from "../firebase-config.js";
import { readDb } from "./fbrest.js?v=1";
import { LANG } from "./i18n.js?v=1";
import { getSession, signInStudent, cleanCode, prettyCode, plusOf, esc } from "./people.js?v=4";
import { SUBJECTS } from "../tests.js?v=9";

const L3 = (ru, ro, en) => ({ ru, ro, en })[LANG] || ru;
const JKEY = "techlab_join";
export const isClassCode = (v) => cleanCode(v)[0] === "K";
export function pendingJoin() { try { return JSON.parse(localStorage.getItem(JKEY) || "null"); } catch (e) { return null; } }
const savePending = (x) => { try { x ? localStorage.setItem(JKEY, JSON.stringify(x)) : localStorage.removeItem(JKEY); } catch (e) {} };
const subjName = (sid) => SUBJECTS.find((s) => s.id === sid)?.name || sid;

// Окно «Вход в класс»: показывает, какой это класс, спрашивает имя и отправляет заявку
export async function joinClass(raw, onDone) {
  const k = cleanCode(raw);
  const o = document.createElement("div");
  o.className = "code-ov";
  o.innerHTML = `<form class="code-box" id="jForm"><h2>${esc(L3("Вход в класс", "Intrare în clasă", "Join a class"))}</h2>
    <p id="jInfo">${esc(L3("Проверяю код…", "Verific codul…", "Checking the code…"))}</p><div id="jBody"></div>
    <div class="err" id="jErr" aria-live="polite"></div>
    <div class="cb-row"><button type="submit" class="btn-p" id="jGo" disabled>${esc(L3("Отправить учителю", "Trimite profesorului", "Send to teacher"))}</button>
      <button type="button" class="btn-g" id="jX">${esc(L3("Отмена", "Anulează", "Cancel"))}</button></div></form>`;
  document.body.appendChild(o);
  const $ = (s) => o.querySelector(s), close = () => o.remove();
  $("#jX").onclick = close;
  let c = null;
  try { c = await readDb(`classCodes/${k}`, { tries: 2 }); } catch (e) { $("#jInfo").textContent = L3("Нет связи с сервером. Попробуйте ещё раз.", "Nu există conexiune.", "No connection. Try again."); return; }
  if (!c) { $("#jInfo").textContent = L3(`Код класса ${prettyCode(k)} не найден. Проверьте буквы и цифры.`, `Codul ${prettyCode(k)} nu a fost găsit.`, `Class code ${prettyCode(k)} was not found.`); return; }
  const me = getSession();
  $("#jInfo").innerHTML = `<b>${esc(subjName(c.sid))} · ${esc(c.cls)}</b><br>${esc(L3("Учитель", "Profesor", "Teacher"))}: ${esc(c.name || "")}`;
  $("#jBody").innerHTML = me
    ? `<p>${esc(L3(`Вы вошли как ${me.name}. Учитель добавит вам этот предмет.`, `Ați intrat ca ${me.name}. Profesorul vă va adăuga această disciplină.`, `You're signed in as ${me.name}. The teacher will add this subject for you.`))}</p>`
    : `<label for="jName" class="sr">${esc(L3("Фамилия и имя", "Numele și prenumele", "Surname and name"))}</label>
       <input id="jName" maxlength="50" autocomplete="name" placeholder="${esc(L3("Фамилия Имя", "Nume Prenume", "Surname Name"))}" style="font: 500 17px Inter, system-ui, sans-serif; letter-spacing: 0; text-transform: none">`;
  $("#jGo").disabled = false;
  if ($("#jName")) $("#jName").focus();
  $("#jForm").onsubmit = async (e) => {
    e.preventDefault();
    const name = me ? me.name : $("#jName").value.trim().replace(/\s+/g, " ");
    if (!me && name.split(" ").length < 2) { $("#jErr").textContent = L3("Напишите фамилию и имя.", "Scrieți numele și prenumele.", "Write your surname and name."); return; }
    $("#jGo").disabled = true;
    try {
      const body = { k, name, at: Date.now(), status: "new", ...(me ? { scode: me.code } : {}) };
      const r = await fetch(`${firebaseConfig.databaseURL}/joinRequests.json`, { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const id = (await r.json()).name;
      savePending({ id, k, name, cls: c.cls, sid: c.sid, teacher: c.name || "", at: Date.now(), me: !!me });
      close(); if (onDone) onDone();
    } catch (x) {
      console.warn(x); $("#jGo").disabled = false;
      $("#jErr").textContent = L3("Не удалось отправить заявку. Попробуйте ещё раз или спросите учителя.", "Cererea nu a putut fi trimisă.", "Couldn't send the request. Try again or ask your teacher.");
    }
  };
}

// Карточка «Заявка отправлена — ждём учителя»; сама проверяет ответ каждые 8 секунд
let timer = null;
export function pendingCard(box, onSigned) {
  const p = pendingJoin();
  if (!box) return;
  if (!p) { box.innerHTML = ""; return; }
  const draw = (state, extra = "") => {
    box.innerHTML = `<div class="join-card ${state}"><b>${esc(subjName(p.sid))} · ${esc(p.cls)}</b>
      <span>${extra || esc(L3(`Заявка отправлена учителю (${p.teacher}). Как только он примет её, вы войдёте автоматически.`, `Cererea a fost trimisă profesorului (${p.teacher}). Când o acceptă, veți intra automat.`, `Request sent to the teacher (${p.teacher}). Once accepted, you'll be signed in automatically.`))}</span>
      <button type="button" class="btn-g" id="jCancel">${esc(state === "wait" ? L3("Отменить", "Anulează", "Cancel") : L3("Закрыть", "Închide", "Close"))}</button></div>`;
    box.querySelector("#jCancel").onclick = () => { savePending(null); clearInterval(timer); box.innerHTML = ""; };
  };
  draw("wait");
  const check = async () => {
    let r = null; try { r = await readDb(`joinRequests/${p.id}`, { tries: 1 }); } catch (e) { return; }
    if (!r) return;
    if (r.status === "no") { clearInterval(timer); savePending(null); draw("no", esc(L3("Учитель не принял заявку. Спросите его на уроке.", "Profesorul nu a acceptat cererea.", "The teacher declined the request."))); }
    if (r.status === "ok" && r.code) {
      clearInterval(timer); savePending(null);
      const s = await readDb(`roster/${r.code}`, { tries: 2 }).catch(() => null);
      if (s) { signInStudent({ code: r.code, name: s.name, cls: s.cls, plus: plusOf(s) }); box.innerHTML = ""; if (onSigned) onSigned(r.code); }
      else draw("ok", esc(L3(`Заявка принята! Ваш код: ${prettyCode(r.code)}. Запишите его и войдите.`, `Cererea a fost acceptată! Codul dvs.: ${prettyCode(r.code)}.`, `Accepted! Your code: ${prettyCode(r.code)}.`)));
    }
  };
  clearInterval(timer); timer = setInterval(() => { if (!document.hidden) check(); }, 8000); check();
}
