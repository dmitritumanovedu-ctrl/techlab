// =====================================================================
//  Автообновление прогресса учеников: results → progress/<код> и board/<класс>
//  Работает в любой странице учителя (Центр управления, «Ученики и родители»).
//  Пока у учителя открыта такая страница, оценки сразу попадают
//  на страничку ученика и в кабинет родителя — без кнопки «Обновить».
// =====================================================================
import { ref, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { grade, toGrade, usesQual, qualOf } from "./grading.js?v=5";
import { TESTS, kindOf } from "../tests.js?v=9";
import { nameKey, clsKey, xpOf } from "./people.js?v=2";
import { gradeAttempt } from "./btest.js?v=1";

// ---------- разбор работы для ученика ----------
// settings/<id>/review: 0 (или нет) — выключен; 1 — баллы по заданиям и ответы ученика; 2 — ещё и правильные ответы.
// Разбор кладётся в progress/<код>/works/<id>/review — его видят только сам ученик и его родитель (по коду).
const cut = (x, n = 400) => { const t = String(x ?? "").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const rnd = (x) => x === null || x === undefined ? null : Math.round(Number(x) * 10) / 10;
function reviewOf(level, items) {
  return { lv: level, at: Date.now(), items: items.slice(0, 80).map((x) => {
    const o = { l: cut(x.l, 300), s: rnd(x.s), m: rnd(x.m) };
    if (x.a) o.a = cut(x.a);
    if (level >= 2 && x.k) o.k = cut(x.k);
    if (x.c) o.c = cut(x.c);
    return o;
  }) };
}
const aiText = (a) => a ? [a.comment, a.missing ? "Не хватает: " + a.missing : "", a.advice ? "Совет: " + a.advice : ""].filter(Boolean).join(" ") : "";
function missionReview(r, t) {
  const out = [];
  for (const p of t.parts || []) {
    if (p.open) continue;
    out.push({ l: p.name, s: Number(r.score?.[p.k]) || 0, m: p.max });
  }
  for (const q of t.openQs || []) {
    const ans = String(r.open?.[q.k] || "").trim();
    const tch = Number.isFinite(r.manual?.[q.k]) ? r.manual[q.k] : null;
    const ai = r.ai?.[q.k] && Number.isFinite(r.ai[q.k].score) ? r.ai[q.k].score : null;
    out.push({ l: (q.title ? q.title + ": " : "") + q.q, s: !ans ? 0 : (tch ?? ai), m: q.max, a: ans || "—", k: q.model, c: aiText(r.ai?.[q.k]) });
  }
  return out;
}
const testReview = (g) => g.items.map((x) => ({ l: x.label, s: x.score, m: x.max,
  a: typeof x.answer === "string" ? x.answer : "", k: typeof x.model === "string" ? x.model : "", c: x.aiComment || aiText(x.aiAdvice ? { advice: x.aiAdvice } : null) }));
const builderReview = (g) => g.items.map((x) => ({ l: (x.n ? x.n + ". " : "") + x.label, s: x.score, m: x.max, a: x.answer || "—", k: x.key || "", c: aiText(x.aiData) }));

const READY = TESTS.filter((t) => t.path);
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

// ключи тестов меняются редко — держим их 10 минут
const KEYCACHE = {};
async function keysOf(db, id) {
  const c = KEYCACHE[id];
  if (c && Date.now() - c.at < 600000) return c.v;
  let v = null;
  try { v = (await get(ref(db, `keys/${id}`))).val(); } catch (e) {}
  KEYCACHE[id] = { v, at: Date.now() };
  return v;
}

// Пересчитать прогресс всех учеников. ROSTER можно передать, иначе он прочитается из базы.
export async function syncProgress(db, ROSTER = null, RES = null) {
  const [rs, ss, ro] = await Promise.all([
    RES ? null : get(ref(db, "results")), get(ref(db, "settings")), ROSTER ? null : get(ref(db, "roster"))]);
  RES = RES || rs.val() || {};
  const SET = ss.val() || {};
  ROSTER = ROSTER || ro.val() || {};
  const byName = {};
  for (const [code, s] of Object.entries(ROSTER)) byName[clsKey(s.cls) + "|" + nameKey(s.name)] = code;
  const works = {};
  let matched = 0, unmatched = 0;
  let BT = [];
  try { BT = Object.entries((await get(ref(db, "pubIndex"))).val() || {}).map(([id, x]) => ({ id, type: "test", teacher: true, bt: true, kind: x.kind || "to", subject: x.subject, grade: x.grade, title: x.title, path: `b/?t=${id}` })); } catch (e) {}
  for (const t of READY.concat(BT)) {
    const list = RES[t.id]; if (!list) continue;
    const RV = Number(SET[t.id]?.review) || 0;                 // разбор для учеников включён?
    const KEYS = (t.type !== "mission" && (!t.teacher || (RV && t.bt))) ? await keysOf(db, t.id) : null;
    const K = kindOf(t, SET);
    for (const r of Object.values(list)) {
      if (!r || r.status !== "submitted") continue;
      const code = byName[clsKey(r.cls) + "|" + nameKey(r.name)];
      if (!code) { unmatched++; continue; }
      let e = null, rv = null;
      try {
        if (t.type === "mission") { e = missionEval(r, t); if (RV) rv = missionReview(r, t); }
        else if (t.teacher) {
          e = r.result ? { total: r.result.total, max: r.result.max, pct: Math.round(r.result.total / r.result.max * 100), grade: r.result.grade, complete: !!r.result.complete } : null;
          if (RV && t.bt && KEYS) rv = builderReview(gradeAttempt(KEYS, r));
          else if (RV && Array.isArray(r.result?.items)) rv = r.result.items.map((x) => ({ l: x.l, s: x.s, m: x.m, a: x.a, k: x.k, c: x.c }));
        }
        else if (KEYS) {
          const k = KEYS.variants?.[String(r.variant)];
          if (k) { const g = grade({ ...k, points: KEYS.points }, r.answers || {}, r.manual || {}, r.ai || {});
            e = { total: g.total, max: g.max, pct: Math.round(g.total / g.max * 100), grade: g.complete ? g.grade : toGrade(g.total, g.max), complete: g.complete };
            if (RV) rv = testReview(g); }
        }
      } catch (err) { console.warn(t.id, err); }
      if (!e) e = { complete: false, total: 0, max: 0, pct: 0, grade: 0 };
      const date = r.submittedAt || r.updatedAt || r.startedAt || 0;
      const prev = works[code]?.[t.id];
      if (prev && prev.date > date) continue;           // берём последнюю попытку
      const w = { title: t.title, subject: t.subject, kind: K.id, kindName: K.short, retake: !!t.retake,
        grade: e.grade || 0, total: Math.round((e.total || 0) * 10) / 10, max: e.max || 0, pct: e.pct || 0, complete: !!e.complete,
        viol: r.violations || 0, date };
      if (t.path) w.path = t.path;
      if (usesQual(t.subject)) { const q = qualOf(w.pct); w.qual = q[1]; w.qualName = q[2]; }
      if (rv && rv.length) w.review = reviewOf(RV, rv);
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
  return { matched, unmatched };
}

// ---------- автообновление ----------
// Слушает результаты и пересчитывает прогресс не чаще раза в 20 секунд.
// Выключается на этом компьютере: localStorage.techlab_autosync = "0".
let started = false;
export function autoSyncOn() { try { return localStorage.getItem("techlab_autosync") !== "0"; } catch (e) { return true; } }
export function setAutoSync(v) { try { localStorage.setItem("techlab_autosync", v ? "1" : "0"); } catch (e) {} }

export function startAutoSync(db, onDone = null) {
  if (started || !autoSyncOn()) return () => {};
  started = true;
  let timer = null, last = 0, busy = false, first = true, roster = null, lastRes = null;
  const run = async () => {
    if (busy) { timer = setTimeout(run, 5000); return; }
    busy = true;
    try {
      roster = (await get(ref(db, "roster"))).val() || {};
      const r = await syncProgress(db, roster, lastRes);
      last = Date.now();
      onDone && onDone(r);
    } catch (e) { console.warn("Автообновление прогресса:", e.code || e.message); }
    finally { busy = false; }
  };
  const un = onValue(ref(db, "results"), (snap) => {
    lastRes = snap.val() || {};
    if (first) { first = false; }          // первая загрузка — тоже пересчитываем
    clearTimeout(timer);
    const wait = Math.max(4000, 20000 - (Date.now() - last));
    timer = setTimeout(run, wait);
  }, (e) => console.warn("Автообновление недоступно:", e.code || e.message));
  return () => { un(); clearTimeout(timer); started = false; };
}

// ---------- предметы класса ----------
// settings/classSubjects/<класс> = { inf: true, geo: true } — какие предметы учитель ведёт в классе.
export async function getClassSubjects(db) {
  try { return (await get(ref(db, "settings/classSubjects"))).val() || {}; } catch (e) { return {}; }
}
export function setClassSubjects(db, cls, ids) {
  const v = {}; ids.forEach((id) => { v[id] = true; });
  return update(ref(db, "settings/classSubjects"), { [clsKey(cls)]: ids.length ? v : null });
}
