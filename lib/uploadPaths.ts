import path from "path";

// Файлы задач хранятся вне /public — доступ отдаётся только авторизованным
// пользователям через app/api/attachments/[id]/route.ts.
export const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

// Аватарки — тоже вне /public (см. комментарий в lib/actions/profile.ts про
// баг кэширования статики в Next.js), раздаются через app/api/avatar/[userId]/route.ts.
export const AVATAR_DIR = path.join(UPLOAD_ROOT, "avatars");
