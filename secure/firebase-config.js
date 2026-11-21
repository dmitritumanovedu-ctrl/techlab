// Вставьте сюда настройки своего проекта Firebase
// (Консоль Firebase → Настройки проекта → Ваши приложения → Конфигурация SDK).
// Эти данные не секретные: защищают не они, а правила базы данных (database.rules.json).
export const firebaseConfig = {
  apiKey: "AIzaSyDRuOcnT0wNfCa4moHRbmuvqkokF9jS71A",
  authDomain: "dmitri-bcd33.firebaseapp.com",
  databaseURL: "https://dmitri-bcd33-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "dmitri-bcd33",
  storageBucket: "dmitri-bcd33.firebasestorage.app",
  messagingSenderId: "184796452914",
  appId: "1:184796452914:web:b5d6e54a53ca76f884842b",
};

// Предметы и классы. Ключ (слева) — это «пропуск», который вы выдаёте ученику.
// Ученик с ключом "tech-6" НЕ сможет открыть ничего из "geo-12".
export const SUBJECTS = {
  "tech-5": "Технологическое воспитание, 5 класс",
  "tech-6": "Технологическое воспитание, 6 класс",
  "math-5": "Математика, 5 класс",
  "inf-7": "Информатика, 7 класс",
  "geo-11": "География, 11 класс",
  "geo-12": "География, 12 класс",
};
