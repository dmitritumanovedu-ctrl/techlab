// =====================================================================
//  TechLab · надёжная запись в базу для страниц учеников.
//
//  Это та же библиотека Firebase Realtime Database (всё экспортируется как есть),
//  но set / update / get больше никогда не «зависают»:
//    1) сначала обычная запись через Firebase (до 4 секунд);
//    2) если не успела — та же запись напрямую по HTTPS (REST), 2 попытки;
//    3) если и так не вышло — ответы сохраняются на компьютере (engine/outbox.js)
//       и отправляются сами, как только появится связь. Кнопка «Сдать» не висит.
//
//  Как подключить: в странице ученика заменить
//    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js"
//  на
//    from "../../engine/rtdb.js?v=1"      (путь — относительно страницы)
// =====================================================================
export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { set as sdkSet, update as sdkUpdate, get as sdkGet } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import "./outbox.js?v=1";

const SDK_MS = 4000, REST_MS = 6500;
const OB = () => window.TLOutbox;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const urlOf = (r) => r.toString().replace(/\/$/, "") + ".json";
const race = (p, ms) => Promise.race([
  p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e })),
  sleep(ms).then(() => ({ timeout: true }))]);
const denied = (e) => /permission|denied/i.test(String(e?.code || e?.message || ""));
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));   // serverTimestamp() = {".sv":"timestamp"} — REST понимает

async function rest(method, url, body) {
  for (let i = 0; i < 2; i++) {
    const st = await OB().send({ method, url, body }, REST_MS + i * 2500);
    if (st >= 200 && st < 300) return true;
    if (st === 401 || st === 403) { const e = new Error("PERMISSION_DENIED"); e.code = "PERMISSION_DENIED"; throw e; }
    if (i === 0) await sleep(700);
  }
  return false;
}

async function write(method, r, value, sdkCall) {
  const url = urlOf(r);
  let body = plain(value);
  const old = OB().peek(url);
  if (!old) {
    const res = await race(sdkCall(), SDK_MS);
    if (res.ok) return res.v;
    if (res.e && denied(res.e)) throw res.e;
  } else if (method === "PATCH" && old.method === "PATCH") {
    body = { ...old.body, ...body };                       // неотправленное раньше + новое (новое важнее)
  } else if (method === "PATCH" && old.method === "PUT") {
    OB().put(url, method, body); return OB().flush().then(() => ({ queued: !!OB().peek(url) }));
  }
  if (await rest(method, url, body)) { OB().drop(url); return undefined; }
  OB().put(url, method, body);                             // не вышло — сохраняем на компьютере
  sdkCall().catch(() => {});                               // и оставляем Firebase попробовать ещё
  return { queued: true };
}

export function set(r, value) { return write("PUT", r, value, () => sdkSet(r, value)); }
export function update(r, value) { return write("PATCH", r, value, () => sdkUpdate(r, value)); }

// Снимок, похожий на настоящий (val, exists, key, forEach, child)
function snap(key, v) {
  return {
    key, val: () => v, exists: () => v !== null && v !== undefined, toJSON: () => v,
    child: (p) => { let c = v; for (const k of String(p).split("/").filter(Boolean)) c = c && typeof c === "object" ? c[k] ?? null : null; return snap(String(p).split("/").pop(), c); },
    forEach: (fn) => { if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (fn(snap(k, x)) === true) return true; return false; },
  };
}
export async function get(r) {
  const p = sdkGet(r);
  const res = await race(p, 5000);
  if (res.ok) return res.v;
  if (res.e && denied(res.e)) throw res.e;
  for (let i = 0; i < 2; i++) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), REST_MS + i * 2500);
    try {
      const x = await fetch(urlOf(r), { cache: "no-store", signal: ctrl.signal });
      if (x.ok) return snap(r.key, await x.json());
      if (x.status === 401 || x.status === 403) break;
    } catch (e) {} finally { clearTimeout(t); }
    await sleep(600);
  }
  const last = await race(p, 8000);
  if (last.ok) return last.v;
  throw last.e || new Error("Нет связи с сервером");
}

// Кнопка «Да, сдать» сразу показывает, что работа отправляется, и не нажимается второй раз
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("#mYes");
  if (b) setTimeout(() => { if (b.isConnected) { b.disabled = true; b.textContent = "⏳ Отправляю работу…"; } }, 0);
}, true);
