// Тренировочный итоговый тест · Математика 5 · Делимость и числовые выражения.
// 5 вариантов по образцу итогового теста учебника. Здесь только условия — ответов нет.
export const TEST = {
  id: "math5-itog",
  title: "Тренировочный итоговый тест",
  subtitle: "Математика · 5 класс · подготовка к итоговому тесту",
  topic: "Делимость натуральных чисел. Деление с остатком. Числовые выражения",
  minutes: 45,
  max: 33,
  classes: ["5 «А»", "5 «Б»"],
  plan: [["Задание 1", "≈ 25 мин"], ["Задание 2", "≈ 17 мин"], ["Проверка", "≈ 3 мин"]],
  // Схема оценивания из учебника: сумма баллов → отметка
  scale: [[31, 10], [28, 9], [25, 8], [20, 7], [15, 6], [10, 5], [7, 4], [4, 3], [2, 2], [0, 1]],
};

// st — утверждения для 1 а): div — «x ⋮ y», ndiv — «x не делится на y», mult — «x кратно y»
// shop — данные задачи о покупке; ex — выражение p·q + r:s − t^k; m — на что должен делиться результат в 2 в)
export const VARIANTS = [
  { id: 1, a: { name: "альбом для рисования", many: "альбомов", price: 25 }, b: { name: "набор красок", many: "наборов красок", price: 30 },
    buyer: "Ион", his: "у него", budget: 230,
    st: [{ k: "div", x: 25, y: 10 }, { k: "ndiv", x: 30, y: 4 }, { k: "mult", x: 230, y: 23 }],
    ex: { n: [7, 6, 18, 6, 2], k: 3 }, m: 5 },
  { id: 2, a: { name: "тетрадь", many: "тетрадей", price: 15 }, b: { name: "книга", many: "книг", price: 40 },
    buyer: "Мария", his: "у неё", budget: 190,
    st: [{ k: "div", x: 15, y: 3 }, { k: "ndiv", x: 40, y: 8 }, { k: "mult", x: 190, y: 20 }],
    ex: { n: [8, 9, 18, 6, 4], k: 2 }, m: 10 },
  { id: 3, a: { name: "пачка печенья", many: "пачек печенья", price: 18 }, b: { name: "коробка конфет", many: "коробок конфет", price: 42 },
    buyer: "Андрей", his: "у него", budget: 240,
    st: [{ k: "div", x: 18, y: 4 }, { k: "ndiv", x: 42, y: 5 }, { k: "mult", x: 240, y: 48 }],
    ex: { n: [9, 6, 45, 5, 5], k: 2 }, m: 5 },
  { id: 4, a: { name: "блокнот", many: "блокнотов", price: 16 }, b: { name: "пенал", many: "пеналов", price: 56 },
    buyer: "Даниела", his: "у неё", budget: 200,
    st: [{ k: "div", x: 16, y: 8 }, { k: "ndiv", x: 56, y: 7 }, { k: "mult", x: 200, y: 30 }],
    ex: { n: [6, 5, 9, 3, 2], k: 3 }, m: 10 },
  { id: 5, a: { name: "мороженое", many: "порций мороженого", price: 20 }, b: { name: "билет в кино", many: "билетов в кино", price: 70 },
    buyer: "Николай", his: "у него", budget: 250,
    st: [{ k: "div", x: 20, y: 6 }, { k: "ndiv", x: 70, y: 3 }, { k: "mult", x: 250, y: 25 }],
    ex: { n: [5, 4, 35, 5, 3], k: 2 }, m: 5 },
];

// ---------- общие помощники (ученик, учитель, бланки) ----------
export const OPS = ["·", "+", ":", "−"];
const SUP = { 2: "²", 3: "³" };
export const sup = (k) => SUP[k] || "^" + k;
export const lei = (n) => { const d = n % 10, h = n % 100; return n + " " + (d === 1 && h !== 11 ? "лей" : d >= 2 && d <= 4 && (h < 12 || h > 14) ? "лея" : "лей"); };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
export function shopText(v) {
  return `Известно, что ${v.a.name} стоит ${lei(v.a.price)}, а ${v.b.name} — ${lei(v.b.price)}.`;
}
export function stHtml(s) {
  if (s.k === "div") return `${s.x} <span class="dv">⋮</span> ${s.y}`;
  if (s.k === "ndiv") return `${s.x} <span class="dv ndv">⋮</span> ${s.y}`;
  return `${s.x} кратно ${s.y}`;
}
export function buyText(v) {
  return `${cap(v.buyer)} хочет купить ${v.a.many} и ${v.b.many} (хотя бы по одному каждого вида) и потратить ровно ${lei(v.budget)} — все деньги. Сколько ${v.a.many} и сколько ${v.b.many} можно купить? Укажите все возможные варианты.`;
}
// Выражение: o[i], c[i] — сколько скобок открыто перед i-м числом и закрыто после него
export function exprHtml(ex, o = [], c = []) {
  let s = "";
  ex.n.forEach((x, i) => {
    s += "(".repeat(o[i] || 0) + x;
    if (i < 4) s += ")".repeat(c[i] || 0) + " " + OPS[i] + " ";
  });
  return s + ")".repeat(c[4] || 0) + `<sup>${ex.k}</sup>`;
}
export const mText = (m) => m === 10 ? "делился на 10" : "делился на 5";
