import path from "path";

// Файлы задач хранятся вне /public — доступ отдаётся только авторизованным
// пользователям через app/api/attachments/[id]/route.ts.
export const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
