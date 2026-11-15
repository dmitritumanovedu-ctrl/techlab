// =====================================================================
//  Автообновление прогресса учеников: results → progress/<код> и board/<класс>
//  Работает в любой странице учителя (Центр управления, «Ученики и родители»).
//  Пока у учителя открыта такая страница, оценки сразу попадают
//  на страничку ученика и в кабинет родителя — без кнопки «Обновить».
// =====================================================================
import { ref, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { grade, toGrade, usesQual, qualOf } from "./grading.js?v=5";
import { TESTS, kindOf } from "../tests.js?v=8";
import { nameKey, clsKey, xpOf } from "./people.js?v=2";

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
  try { BT = Object.entries((await get(ref(db, "pubIndex"))).val() || {}).map(([id, x]) => ({ id, type: "test", teacher: true, kind: x.kind || "to", subject: x.subject, grade: x.grade, title: x.title, path: `b/?t=${id}` })); } catch (e) {}
  for (const t of READY.concat(BT)) {
    const list = RES[t.id]; if (!list) continue;
    const KEYS = (t.type !== "mission" && !t.teacher) ? await keysOf(db, t.id) : null;
    const K = kindOf(t, SET);
    for (const r of Object.values(list)) {
      if (!r || r.status !== "submitted") continue;
      const code = byName[clsKey(r.cls) + "|" + nameKey(r.name)];
      if (!code) { unmatched++; continue; }
      let e = null;
      try {
        if (t.type === "mission") e = missionEval(r, t);
        else if (t.teacher) e = r.result ? { total: r.result.total, max: r.result.max, pct: Math.round(r.result.total / r.result.max * 100), grade: r.result.grade, complete: !!r.result.complete } : null;
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
      if (t.path) w.path = t.path;
      if (usesQual(t.subject)) { const q = qualOf(w.pct); w.qual = q[1]; w.qualName = q[2]; }
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
