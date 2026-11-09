// =====================================================================
//  СПИСОК ПРЕДМЕТОВ И ТЕСТОВ САЙТА TechLab
//  Чтобы добавить класс — допишите его номер в grades.
//  Чтобы добавить тест — добавьте строку в TESTS (папку теста готовит Claude).
// =====================================================================

export const SITE = {
  title: "TechLab",
  school: "IPLT „Alexandr Pușkin”",
  teacher: "Туманов Д.",
};

export const SUBJECTS = [
  { id: "geo",  name: "География",                     icon: "🌍", color: "#1f6f5c", grades: ["11", "12"] },
  { id: "inf",  name: "Информатика",                   icon: "💻", color: "#2d5fa8", grades: ["7"] },
  { id: "tech", name: "Технологическое воспитание",    icon: "🛠", color: "#b8641b", grades: ["5", "6", "7"] },
];

export const TESTS = [
  { id: "geo11-pop", subject: "geo", grade: "11", title: "Население и населённые пункты",
    note: "Ед. обучения III · §12–16 · 40 минут", path: "geo11/test-naselenie/",
    aiSubject: "география, 11 класс" },
];
