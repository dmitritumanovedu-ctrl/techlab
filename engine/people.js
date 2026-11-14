// =====================================================================
//  Ученики, родители, опыт (XP), уровни и награды — общий модуль TechLab
// =====================================================================

import { LEVEL_NAMES, AWARD_TEXT } from "./i18n.js?v=1";

// Классы, для которых можно составить списки
export const CLASSES = ["5", "6", "7", "11", "12"].flatMap((g) => ["А", "Б", "В", "Г"].map((l) => `${g} «${l}»`));

// Тариф: сейчас всё бесплатно, счётчик работ учителя только показывается
export const PLAN = { tier: "free", name: "Бесплатный", limit: 10 };

// ---------- вход ученика (хранится на этом компьютере) ----------
const SKEY = "techlab_student";
export function getSession() {
  try { const s = JSON.parse(localStorage.getItem(SKEY) || "null"); return s && s.code ? s : null; } catch (e) { return null; }
}
export function setSession(s) { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {} }
export function clearSession() { try { localStorage.removeItem(SKEY); } catch (e) {} }

// ---------- коды ----------
const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";          // без похожих символов O/0, I/1, L
export function makeCode(prefix = "") {
  const a = new Uint32Array(7); crypto.getRandomValues(a);
  return prefix + Array.from(a, (x) => ALPH[x % ALPH.length]).join("");
}
export const cleanCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const prettyCode = (c) => String(c).replace(/(.{4})(?=.)/g, "$1-");

// Сравнение имён: «Попеску Андрей» = «андрей попеску»
export const nameKey = (s) => String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-яăâîșşțţ\s-]/gi, " ")
  .split(/\s+/).filter(Boolean).sort().join(" ");
export const clsKey = (s) => String(s || "").replace(/[.#$/\[\]]/g, "").trim();

// ---------- опыт и уровни ----------
// За работу: 20 XP за сдачу + 10 XP за каждый балл оценки + 10 XP, если без нарушений
export function xpOf(w) {
  if (!w) return 0;
  let x = 20;
  if (w.complete && w.grade) x += w.grade * 10;
  if (!w.viol) x += 10;
  return x;
}
export const LEVELS = LEVEL_NAMES;   // названия уровней — на языке интерфейса (engine/i18n.js)
export const LEVEL_XP = 200;
export function levelOf(xp) {
  const n = Math.floor(xp / LEVEL_XP) + 1;
  return { n, name: LEVELS[Math.min(n - 1, LEVELS.length - 1)], next: LEVELS[Math.min(n, LEVELS.length - 1)],
    from: (n - 1) * LEVEL_XP, to: n * LEVEL_XP, pct: Math.round(((xp - (n - 1) * LEVEL_XP) / LEVEL_XP) * 100) };
}

// ---------- награды (считаются из работ) ----------
export function awardsOf(works) {
  const list = Object.values(works || {}).sort((a, b) => (a.date || 0) - (b.date || 0));
  const done = list.filter((w) => w.complete);
  const avg = done.length ? done.reduce((s, w) => s + w.grade, 0) / done.length : 0;
  let honest = 0, run = 0; for (const w of list) { run = w.viol ? 0 : run + 1; honest = Math.max(honest, run); }
  const subj = new Set(list.map((w) => w.subject)).size;
  const ok = {
    first: list.length >= 1, ten: done.some((w) => w.grade === 10), honest: honest >= 3, five: list.length >= 5,
    star: done.length >= 3 && avg >= 9, multi: subj >= 2, pr: list.some((w) => w.kind === "pr"), max: done.some((w) => w.pct >= 100),
  };
  // подписи наград — на языке интерфейса (engine/i18n.js)
  return Object.keys(ok).map((k) => { const [t, name, hint] = AWARD_TEXT[k]; return { k, t, name, hint, ok: ok[k] }; });
}

export const fmt1 = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
