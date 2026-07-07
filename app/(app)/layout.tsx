import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions } from "@/lib/roles";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Аватарка и роль читаются напрямую из БД (не из JWT-сессии): JWT выставляется
  // один раз при логине, поэтому смена роли админом иначе не отражалась бы до
  // следующего перелогина пользователя — см. requireUser() в lib/roles.ts.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { avatarUrl: true, role: true },
  });
  if (!dbUser) redirect("/login");
  const permissions = await getPermissions(session.user.id, dbUser.role);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Sidebar
        role={dbUser.role}
        userName={session.user.name ?? session.user.email ?? ""}
        avatarUrl={dbUser.avatarUrl}
        permissions={permissions}
      />
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
