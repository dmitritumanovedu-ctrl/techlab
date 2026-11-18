/**
 * TechLab · загрузка файлов (презентации, PDF, документы) на Google Диск.
 *
 * Как установить (один раз, 5 минут):
 *  1. Откройте https://script.google.com → «Новый проект». Назовите: TechLab Файлы.
 *  2. Удалите всё в Code.gs и вставьте этот файл целиком.
 *  3. Ниже в строке SECRET придумайте своё секретное слово (латиницей, 10+ символов).
 *  4. «Начать развёртывание» → «Новое развёртывание» → тип «Веб-приложение»:
 *       Выполнять от имени: «Я»;  У кого есть доступ: «Все».
 *     Нажмите «Развернуть», разрешите доступ к Диску. Скопируйте URL (заканчивается на /exec).
 *  5. В TechLab: Центр управления → «📎 Материалы на стартовой» → «⚙ Настроить загрузку файлов»:
 *     вставьте URL и то же секретное слово.
 *
 * Файлы складываются в папку «TechLab материалы» на вашем Диске (по подпапкам предмет/класс)
 * и открываются по ссылке «только просмотр» — ученикам не нужен Google-аккаунт.
 */
const SECRET = "ПРИДУМАЙТЕ_СВОЁ_СЛОВО";
const ROOT_NAME = "TechLab материалы";
const MAX_MB = 30;
const ALLOWED = /\.(pptx?|ppsx?|pdf|docx?|xlsx?|odp|odt|ods|txt|png|jpe?g|gif|webp|mp3|mp4|zip)$/i;

function doGet() { return out({ ok: true, service: "TechLab files" }); }

function doPost(e) {
  try {
    const q = JSON.parse(e.postData.contents || "{}");
    if (q.secret !== SECRET) return out({ error: "Неверное секретное слово" });
    if (q.ping) return out({ ok: true, service: "TechLab files", folder: ROOT_NAME });
    if (q.action === "upload") return out(upload(q));
    if (q.action === "delete") return out(del(q));
    return out({ error: "Неизвестное действие" });
  } catch (err) {
    return out({ error: String(err && err.message || err) });
  }
}

function upload(q) {
  const name = String(q.name || "файл").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120);
  if (!ALLOWED.test(name)) return { error: "Этот тип файла нельзя загрузить: " + name };
  const bytes = Utilities.base64Decode(String(q.data || ""));
  if (!bytes.length) return { error: "Пустой файл" };
  if (bytes.length > MAX_MB * 1024 * 1024) return { error: "Файл больше " + MAX_MB + " МБ" };
  const blob = Utilities.newBlob(bytes, String(q.mime || "application/octet-stream"), name);
  const folder = sub(sub(root(), String(q.subject || "Общее")), String(q.grade ? q.grade + " класс" : "Все классы"));
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  file.setDescription("TechLab · " + (q.title || name));
  const id = file.getId();
  return { ok: true, id: id, name: name, size: bytes.length, url: "https://drive.google.com/file/d/" + id + "/view" };
}

function del(q) {
  try { DriveApp.getFileById(String(q.id)).setTrashed(true); return { ok: true }; }
  catch (err) { return { ok: false, error: "Файл не найден (возможно, уже удалён)" }; }
}

function root() {
  const it = DriveApp.getFoldersByName(ROOT_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_NAME);
}
function sub(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
