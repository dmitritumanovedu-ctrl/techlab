// Общий модуль защиты: вход по коду, проверка ученика и учителя.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Код ученика превращается во «внутренний» логин и пароль Firebase.
// Почта не настоящая, письма на неё никогда не отправляются.
const EMAIL_DOMAIN = "students.techlab.school";
export const CODE_LENGTH = 9;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // без 0/O, 1/I/L — чтобы дети не путали

export function normalizeCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function prettyCode(code) {
  return code.replace(/(.{3})(?=.)/g, "$1-"); // K7M4QXP9R → K7M-4QX-P9R
}
export function codeToEmail(code) { return code.toLowerCase() + "@" + EMAIL_DOMAIN; }
export function codeToPassword(code) { return "TL-" + code; }

export function generateCode() {
  const buf = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(buf);
  let s = "";
  for (const n of buf) s += ALPHABET[n % ALPHABET.length];
  return s;
}

function currentUser() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((res) => {
    const stop = onAuthStateChanged(auth, (u) => { stop(); res(u); });
  });
}

// Вход ученика по коду
export async function loginWithCode(raw) {
  const code = normalizeCode(raw);
  if (code.length !== CODE_LENGTH) throw new Error("Код должен состоять из " + CODE_LENGTH + " символов.");
  // Сессия живёт до закрытия вкладки — важно для общих компьютеров в кабинете
  await setPersistence(auth, browserSessionPersistence);
  try {
    await signInWithEmailAndPassword(auth, codeToEmail(code), codeToPassword(code));
  } catch (e) {
    if (e.code === "auth/too-many-requests") throw new Error("Слишком много попыток. Подождите несколько минут.");
    throw new Error("Неверный код.");
  }
  const p = await getProfile();
  if (!p || p.active !== true) {
    await signOut(auth);
    throw new Error("Этот код отключён. Обратитесь к учителю.");
  }
  return p;
}

export async function getProfile() {
  const u = await currentUser();
  if (!u) return null;
  try {
    const snap = await get(ref(db, "sec/students/" + u.uid));
    return snap.exists() ? { uid: u.uid, ...snap.val() } : null;
  } catch { return null; }
}

// Ставится в начало каждой страницы ученика
export async function requireStudent() {
  const p = await getProfile();
  if (!p || p.active !== true) {
    location.replace("login.html");
    throw new Error("Нет входа");
  }
  return p;
}

export async function isAdmin() {
  const u = await currentUser();
  if (!u) return false;
  // Раздел sec/catalog целиком может прочитать только учитель — так решают правила
  try { await get(ref(db, "sec/catalog")); return true; }
  catch { return false; }
}

export async function logout(to = "login.html") {
  await signOut(auth);
  location.replace(to);
}

// Безопасное создание элементов (без innerHTML — защита от вставки чужого кода)
export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined) e.append(k instanceof Node ? k : String(k));
  return e;
}
