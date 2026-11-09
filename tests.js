// =====================================================================
//  СПИСОК ПРЕДМЕТОВ, ТЕСТОВ И МИССИЙ САЙТА TechLab
//  Чтобы добавить класс — допишите его номер в grades.
//  Новые тесты и миссии готовит Claude: присылает папку и строку для этого файла.
// =====================================================================

export const SITE = { title: "TechLab" };

export const SUBJECTS = [
  { id: "geo",  name: "География",                  icon: "🌍", color: "#45D3FF", grades: ["11", "12"] },
  { id: "inf",  name: "Информатика",                icon: "💻", color: "#7B6CFF", grades: ["7"] },
  { id: "tech", name: "Технологическое воспитание", icon: "🛠", color: "#B26BFF", grades: ["5", "6", "7"] },
];

// Экспедиции — большие темы из нескольких миссий (уроков)
export const EXPEDITIONS = [
  { id: "tech5-media", subject: "tech", grade: "5", icon: "🛰",
    title: "Медиалаборатория: редактирование изображений",
    note: "4 миссии · по одной на урок" },
];

// type: "test" — тест с вариантами; type: "mission" — миссия экспедиции.
// Миссия без path — ещё в разработке (показывается закрытой 🔒).
export const TESTS = [
  { id: "geo11-pop", type: "test", subject: "geo", grade: "11", title: "Население и населённые пункты",
    note: "Ед. обучения III · §12–16 · 40 минут", path: "geo11/test-naselenie/",
    aiSubject: "география, 11 класс" },

  { id: "tech5-media-m1", type: "mission", expedition: "tech5-media", n: 1, date: "12.11",
    subject: "tech", grade: "5", title: "Что значит редактировать изображение",
    note: "Бортовой журнал · Разогрев · 5 заданий · Финиш", path: "tech5/media/m1/",
    classes: ["5 «А»", "5 «Б»", "5 «В»", "5 «Г»"],
    parts: [
      { k: "warm", name: "Разогрев", max: 6 }, { k: "q1", name: "Спаси фото", max: 6 },
      { k: "q2", name: "Повтори образец", max: 6 }, { k: "q3", name: "Фотодетектив", max: 7 },
      { k: "q4", name: "Пиксель-художник", max: 6 }, { k: "q5", name: "Блиц 60 с", max: 6 } ] },
  { id: "tech5-media-m2", type: "mission", expedition: "tech5-media", n: 2, date: "19.11",
    subject: "tech", grade: "5", title: "Художественные эффекты" },
  { id: "tech5-media-m3", type: "mission", expedition: "tech5-media", n: 3, date: "26.11",
    subject: "tech", grade: "5", title: "Цвета, размеры, разрешение" },
  { id: "tech5-media-m4", type: "mission", expedition: "tech5-media", n: 4, date: "03.12",
    subject: "tech", grade: "5", title: "Графические форматы" },
];
