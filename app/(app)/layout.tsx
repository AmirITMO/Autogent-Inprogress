import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Аватарка читается напрямую из БД (не из JWT-сессии), чтобы обновление
  // фото профиля отражалось сразу, без повторного логина.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { avatarUrl: true },
  });

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Sidebar
        role={session.user.role}
        userName={session.user.name ?? session.user.email ?? ""}
        avatarUrl={dbUser?.avatarUrl}
      />
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
