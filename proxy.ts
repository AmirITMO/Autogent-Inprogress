import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isLoginPage = pathname === "/login";

  if (!isLoggedIn && !isLoginPage) {
    const url = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  // Управление командой теперь живёт внутри /settings (видно только ADMIN в самом
  // компоненте), отдельного пути под это больше нет. Доступ к /accounting и
  // /channels зависит от гранулярных прав сотрудника — эти флаги не кладутся в
  // JWT (чтобы смена прав админом отражалась сразу), поэтому проверяются не тут,
  // а на уровне самой страницы через requirePagePermission() — см. lib/roles.ts.

  return NextResponse.next();
});

export const config = {
  // Любой путь с расширением файла (favicon.svg и т.п.) считается статическим
  // ассетом из /public и не должен уходить через auth-мидлварь: иначе
  // NextResponse.next() после проверки сессии не докатывается до раздачи файла и
  // отдаёт 404 вместо самой картинки.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
