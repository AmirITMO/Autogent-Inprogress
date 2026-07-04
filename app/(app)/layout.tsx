import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Sidebar role={session.user.role} userName={session.user.name ?? session.user.email ?? ""} />
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
