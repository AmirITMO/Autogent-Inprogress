import { requireUser } from "@/lib/roles";
import { buildAuthUrl } from "@/lib/integrations/youtube";

// Не публичный — только вошедший в CRM сотрудник может инициировать
// подключение (иначе кто угодно мог бы дёрнуть чужой OAuth-редирект).
export async function GET() {
  await requireUser();
  return Response.redirect(buildAuthUrl());
}
