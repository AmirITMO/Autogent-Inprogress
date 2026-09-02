import { prisma } from "@/lib/prisma";

// Публичный редирект по персональной ссылке партнёра — без авторизации,
// партнёр не пользователь CRM. Считает переход и уводит на destinationUrl.
// Неизвестный/неактивный код — на главную сайта, а не 404 с трейсом.
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const partner = await prisma.partner.findUnique({ where: { referralCode: code } });
  if (!partner || !partner.isActive) {
    return Response.redirect("https://autogentgroup.ru", 302);
  }

  await prisma.partner.update({ where: { id: partner.id }, data: { clickCount: { increment: 1 } } });

  return Response.redirect(partner.destinationUrl, 302);
}
