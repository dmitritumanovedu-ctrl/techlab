// Подсчёт баллов и перевод в 10-балльную шкалу. Используется на странице учителя.

// Шкала перевода (процент от максимума → оценка). Можно изменить под себя.
export const SCALE = [
  [95, 10], [85, 9], [75, 8], [65, 7], [55, 6], [45, 5], [35, 4], [25, 3], [15, 2], [0, 1],
];

export function toGrade(points, max) {
  const p = max ? (points / max) * 100 : 0;
  for (const [min, g] of SCALE) if (p >= min - 1e-9) return g;
  return 1;
}

export const CAT_BOUNDS = [["I", 100, Infinity], ["II", 20, 100], ["III", 2, 20], ["IV", -Infinity, 2]];
export function catOf(d) {
  for (const [c, lo, hi] of CAT_BOUNDS) if (d > lo && d <= hi) return c;
  return "IV";
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
export function parseNum(s) {
  const t = String(s ?? "").replace(/\s/g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

// Возвращает список пунктов оценивания: {key, task, label, max, auto(число|null), manual(true если нужна проверка), score}
// manual — объект ручных оценок учителя {itemKey: число}
export function grade(key, answers = {}, manual = {}) {
  const items = [];
  const add = (it) => {
    const m = manual?.[it.key];
    it.teacher = Number.isFinite(m) ? m : null;
    it.score = it.teacher ?? it.auto; // null = ещё не проверено
    items.push(it);
  };

  // 1. Верно / неверно
  const a1 = answers.t1 || {};
  for (const id of Object.keys(key.t1).sort()) {
    const k = key.t1[id], a = a1[id] || {};
    if (k.tf === "T") {
      add({ key: `t1_${id}`, task: 1, label: `1${id}) отметка`, max: 2, auto: a.v === "T" ? 2 : 0 });
    } else {
      add({ key: `t1_${id}m`, task: 1, label: `1${id}) отметка`, max: 1, auto: a.v === "F" ? 1 : 0 });
      let auto = 0;
      if (a.v === "F" && norm(a.fix)) {
        const f = norm(a.fix);
        auto = (k.kw || []).some((w) => f.includes(norm(w))) ? 1 : 0;
      }
      add({ key: `t1_${id}f`, task: 1, label: `1${id}) исправление`, max: 1, auto,
            check: a.v === "F" && !!norm(a.fix), answer: a.fix || "", model: k.fix });
    }
  }

  // 2. Таблица
  const a2 = answers.t2 || {};
  let s2 = 0;
  for (const [chip, col] of Object.entries(key.t2)) if (Number(a2[chip]) === col && a2[chip] !== undefined && a2[chip] !== null) s2++;
  add({ key: "t2", task: 2, label: "2) таблица", max: 6, auto: Math.min(6, s2) });

  // 3. Выбор
  add({ key: "t3", task: 3, label: "3) выбор", max: 2, auto: answers.t3 === key.t3 ? 2 : 0 });

  // 4–8. Развёрнутые ответы — только учитель
  for (const n of [4, 5, 6, 7, 8]) {
    const max = key.points?.[`t${n}`] ?? (n <= 5 || n === 8 ? 4 : 3);
    add({ key: `t${n}`, task: n, label: `${n}) развёрнутый ответ`, max, auto: null, check: true,
          answer: answers[`t${n}`] || "", model: key[`t${n}`]?.model, criteria: key[`t${n}`]?.criteria,
          empty: !norm(answers[`t${n}`]) });
  }

  // 9. Карта: страны
  const a9 = answers.t9 || {};
  let s9 = 0;
  for (const [L, name] of Object.entries(key.t9)) if (a9[L] === name) s9++;
  add({ key: "t9", task: 9, label: "9) страны на карте", max: 4, auto: s9 });

  // 10. Плотность
  const a10 = answers.t10 || {};
  const d = parseNum(a10.d), kd = key.t10.d;
  let calc = 0;
  if (d !== null) {
    const diff = Math.abs(d - kd);
    if (diff <= Math.max(kd * 0.03, 0.5)) calc = 2;
    else if (diff <= kd * 0.1) calc = 1;
  }
  add({ key: "t10a", task: 10, label: "10а) расчёт", max: 2, auto: calc });
  const catOk = a10.cat && (a10.cat === key.t10.cat || (d !== null && a10.cat === catOf(d)));
  add({ key: "t10b", task: 10, label: "10б) категория", max: 1, auto: catOk ? 1 : 0 });
  add({ key: "t10c", task: 10, label: "10в) объяснение", max: 1, auto: null, check: true,
        answer: a10.why || "", model: key.t10.model, empty: !norm(a10.why) });

  // Пустые развёрнутые ответы — сразу 0, проверять нечего
  for (const it of items) if (it.auto === null && it.empty && it.teacher === null) { it.auto = 0; it.score = 0; it.autoEmpty = true; }

  const max = items.reduce((s, i) => s + i.max, 0);
  const auto = items.reduce((s, i) => s + (i.auto ?? 0), 0);
  const pending = items.filter((i) => i.score === null);
  const total = items.reduce((s, i) => s + (i.score ?? 0), 0);
  const complete = pending.length === 0;
  return { items, max, auto, total, complete, pending: pending.length,
           grade: complete ? toGrade(total, max) : null, gradeNow: toGrade(total, max) };
}
