// =====================================================================
//  TechLab · учителя: владелец платформы и коллеги.
//
//  Владелец (администратор) — вы: видите всё, как раньше.
//  Коллега — свой кабинет: свои тесты в Конструкторе, их результаты и проверка ИИ,
//            плюс «📂 Общая папка» — ваши тесты, которыми вы поделились (она копирует их к себе).
//            Ваши тесты без «Поделиться», ваших учеников и их результаты она не видит.
//
//  Кто владелец — задаётся здесь и (обязательно!) в правилах Firebase (файл database.rules.json).
//  ⚠️ Впишите свою почту Google, с которой входите в панель учителя:
// =====================================================================
export const ADMIN_EMAILS = ["dmitri.tumanov.edu@gmail.com"];

import { ref, get, set, remove, update, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const configured = () => ADMIN_EMAILS.some((e) => e && !e.startsWith("ВАШ_"));
const low = (s) => String(s || "").trim().toLowerCase();

// ---------- права учителя (выдаёт администратор на странице admin/) ----------
// По умолчанию всё разрешено — как было раньше. Администратор может выключить любой пункт.
export const PERMS = [
  { id: "builder", name: "🧩 Конструктор тестов", note: "создавать и публиковать свои тесты" },
  { id: "folder",  name: "📂 Общая папка", note: "видеть тесты, которыми поделились со всеми" },
  { id: "share",   name: "🤝 Делиться своими", note: "класть свои тесты в общую папку" },
  { id: "ai",      name: "🤖 Проверка ИИ", note: "проверять развёрнутые ответы ИИ" },
];
export const permOf = (rec, id) => !rec || rec.role === "admin" || rec.perm?.[id] !== false;
let ME = null;                                  // запись staff/<uid> вошедшего коллеги
export const myStaff = () => ME;

// Журнал действий для страницы администратора (log/<id>)
export function logAction(db, user, text, kind = "info") {
  try { return push(ref(db, "log"), { at: Date.now(), by: user?.email || "", text: String(text).slice(0, 300), kind }).catch(() => {}); }
  catch (e) { return Promise.resolve(); }
}

// Узнать роль вошедшего учителя: "admin" | "colleague" | "pending"
export async function roleOf(db, user) {
  if (!user) return "none";
  if (!configured()) return "admin";                         // почта владельца ещё не вписана — работает как раньше
  if (ADMIN_EMAILS.map(low).includes(low(user.email))) return "admin";
  try {
    const s = (await get(ref(db, `staff/${user.uid}`))).val();
    if (s?.role === "admin") return "admin";
    if (s) { ME = s; set(ref(db, `staff/${user.uid}/seen`), Date.now()).catch(() => {}); return "colleague"; }
  } catch (e) { /* нет доступа — значит, не подтверждён */ }
  // отправляем заявку владельцу (один раз)
  try {
    const old = (await get(ref(db, `staffRequests/${user.uid}`)).catch(() => null))?.val();
    await set(ref(db, `staffRequests/${user.uid}`), { email: user.email || "", name: user.displayName || "", at: old?.at || Date.now(), subject: old?.subject || "", school: old?.school || "" });
    window.__tlPendingSave = async () => {
      const subj = document.getElementById("rqSubj")?.value.trim().slice(0, 120) || "", school = document.getElementById("rqSchool")?.value.trim().slice(0, 120) || "";
      await update(ref(db, `staffRequests/${user.uid}`), { subject: subj, school });
      const m = document.getElementById("rqMsg"); if (m) m.textContent = "✓ Сохранено — администратор увидит это в заявке.";
    };
  } catch (e) {}
  return "pending";
}

// Экран «Доступ ещё не выдан» для страниц учителя
export function pendingHtml(user, esc) {
  return `<div class="card center" style="max-width:620px">
    <h2>⏳ Ждём подтверждения</h2>
    <p>Вы вошли как <b>${esc(user.email)}</b>. Заявка на доступ к TechLab отправлена владельцу платформы.</p>
    <p class="muted">Когда администратор примет заявку, обновите эту страницу — откроется ваш кабинет:
      Конструктор тестов, ваши результаты и общая папка материалов.</p>
    <div style="text-align:left;max-width:440px;margin:14px auto">
      <label class="f" for="rqSubj">Какой предмет вы ведёте и в каких классах?</label>
      <input id="rqSubj" maxlength="120" placeholder="Например: история, 6–9 классы">
      <label class="f" for="rqSchool">Школа (если не наш лицей)</label>
      <input id="rqSchool" maxlength="120" placeholder="Необязательно">
      <button class="btn small" type="button" style="margin-top:8px" onclick="window.__tlPendingSave && window.__tlPendingSave()">Отправить администратору</button>
      <div class="muted" id="rqMsg" style="font-size:14px;margin-top:6px"></div></div>
    <button class="btn" type="button" onclick="location.reload()">Обновить</button></div>`;
}

// ---------- для владельца: список коллег и заявок ----------
export async function loadStaff(db) {
  const [s, r] = await Promise.all([get(ref(db, "staff")).catch(() => null), get(ref(db, "staffRequests")).catch(() => null)]);
  return { staff: s?.val() || {}, requests: r?.val() || {} };
}
export async function acceptStaff(db, uid, req, opts = {}) {
  await set(ref(db, `staff/${uid}`), { email: req.email || "", name: req.name || "", role: "colleague", at: Date.now(),
    perm: opts.perm || { builder: true, folder: true, share: true, ai: true }, subjects: opts.subjects || null, subjectNote: req.subject || "" });
  await remove(ref(db, `staffRequests/${uid}`));
}
export const setPerm = (db, uid, id, on) => set(ref(db, `staff/${uid}/perm/${id}`), !!on);
export const declineStaff = (db, uid) => remove(ref(db, `staffRequests/${uid}`));
export const removeStaff = (db, uid) => remove(ref(db, `staff/${uid}`));
