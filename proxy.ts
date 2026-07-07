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

  // "/settings" не входит в этот список: страница настроек доступна всем —
  // раздел профиля виден каждому, а расписание сводок рендерится только для ADMIN.
  const adminOnly = ["/accounting", "/employees"];
  if (
    adminOnly.some((p) => pathname.startsWith(p)) &&
    req.auth?.user?.role !== "ADMIN"
  ) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Любой путь с расширением файла (favicon.svg и т.п.) считается статическим
  // ассетом из /public и не должен уходить через auth-мидлварь: иначе
  // NextResponse.next() после проверки сессии не докатывается до раздачи файла и
  // отдаёт 404 вместо самой картинки.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
