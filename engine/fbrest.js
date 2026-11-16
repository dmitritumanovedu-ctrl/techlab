// =====================================================================
//  Быстрое чтение из базы Firebase для стартовой страницы и входа ученика.
//  Обычный HTTPS-запрос (REST) вместо постоянного подключения:
//   • не нужно скачивать библиотеку Firebase и устанавливать соединение — вход быстрее;
//   • у каждого запроса есть ограничение по времени и повторные попытки —
//     при плохом интернете страница не «зависает» навсегда на «Проверяю…»;
//   • последние данные хранятся на компьютере — страница открывается сразу,
//     даже если интернет тормозит, а свежие данные подтягиваются следом.
// =====================================================================
import { firebaseConfig } from "../firebase-config.js";

const BASE = String(firebaseConfig.databaseURL || "").replace(/\/+$/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const encPath = (p) => String(p).split("/").filter(Boolean).map(encodeURIComponent).join("/");

// Прочитать путь базы. Таймаут растёт с каждой попыткой: 4 с, 7 с, 10 с.
// onTry(n) — чтобы показать ученику «попытка 2 из 3».
export async function readDb(path, { tries = 3, timeout = 4000, onTry = null } = {}) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    if (onTry) try { onTry(i + 1, tries); } catch (e) {}
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), timeout + i * 3000);
    try {
      const r = await fetch(`${BASE}/${encPath(path)}.json`, { signal: ctrl.signal, cache: "no-store" });
      if (r.status === 401 || r.status === 403) { last = new Error("denied"); last.denied = true; break; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      last = e;
      if (i < tries - 1) await sleep(500 + i * 700);
    } finally { clearTimeout(tm); }
  }
  // Запасной путь: через библиотеку Firebase (если REST закрыт правилами или прокси школы)
  if (navigator.onLine === false) throw last || new Error("offline");
  try { return await sdkRead(path, 10000); } catch (e) { throw last || e; }
}

let sdkDb = null;
async function sdkRead(path, ms) {
  const [{ initializeApp, getApps }, D] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js")]);
  if (!sdkDb) {
    const app = getApps().find((a) => a.name === "rest-fallback") || initializeApp(firebaseConfig, "rest-fallback");
    sdkDb = D.getDatabase(app);
  }
  const snap = await Promise.race([D.get(D.ref(sdkDb, path)),
    new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
  return snap.val();
}

// ---------- кэш последних данных на этом компьютере ----------
const CK = "techlab_cache_";
export function cacheGet(key, maxAgeMs = 7 * 24 * 3600e3) {
  try {
    const x = JSON.parse(localStorage.getItem(CK + key) || "null");
    return x && Date.now() - x.at < maxAgeMs ? x.v : undefined;
  } catch (e) { return undefined; }
}
export function cachePut(key, v) {
  try { localStorage.setItem(CK + key, JSON.stringify({ at: Date.now(), v })); } catch (e) {}
}
export function cacheDrop(prefix) {
  try { Object.keys(localStorage).filter((k) => k.startsWith(CK + prefix)).forEach((k) => localStorage.removeItem(k)); } catch (e) {}
}
