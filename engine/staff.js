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

import { ref, get, set, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const configured = () => ADMIN_EMAILS.some((e) => e && !e.startsWith("ВАШ_"));
const low = (s) => String(s || "").trim().toLowerCase();

// Узнать роль вошедшего учителя: "admin" | "colleague" | "pending"
export async function roleOf(db, user) {
  if (!user) return "none";
  if (!configured()) return "admin";                         // почта владельца ещё не вписана — работает как раньше
  if (ADMIN_EMAILS.map(low).includes(low(user.email))) return "admin";
  try {
    const s = (await get(ref(db, `staff/${user.uid}`))).val();
    if (s?.role === "admin") return "admin";
    if (s) return "colleague";
  } catch (e) { /* нет доступа — значит, не подтверждён */ }
  // отправляем заявку владельцу (один раз)
  try { await set(ref(db, `staffRequests/${user.uid}`), { email: user.email || "", name: user.displayName || "", at: Date.now() }); } catch (e) {}
  return "pending";
}

// Экран «Доступ ещё не выдан» для страниц учителя
export function pendingHtml(user, esc) {
  return `<div class="card center" style="max-width:620px">
    <h2>⏳ Ждём подтверждения</h2>
    <p>Вы вошли как <b>${esc(user.email)}</b>. Заявка на доступ к TechLab отправлена владельцу платформы.</p>
    <p class="muted">Когда он нажмёт «Принять» в разделе «👥 Коллеги», обновите эту страницу — откроется ваш кабинет:
      Конструктор тестов, ваши результаты и общая папка материалов.</p>
    <button class="btn" type="button" onclick="location.reload()">Обновить</button></div>`;
}

// ---------- для владельца: список коллег и заявок ----------
export async function loadStaff(db) {
  const [s, r] = await Promise.all([get(ref(db, "staff")).catch(() => null), get(ref(db, "staffRequests")).catch(() => null)]);
  return { staff: s?.val() || {}, requests: r?.val() || {} };
}
export async function acceptStaff(db, uid, req) {
  await set(ref(db, `staff/${uid}`), { email: req.email || "", name: req.name || "", role: "colleague", at: Date.now() });
  await remove(ref(db, `staffRequests/${uid}`));
}
export const declineStaff = (db, uid) => remove(ref(db, `staffRequests/${uid}`));
export const removeStaff = (db, uid) => remove(ref(db, `staff/${uid}`));
