import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { getTelegramStatus } from "@/lib/actions/telegram";
import { SettingsForm } from "./_components/SettingsForm";
import { ProfileForm } from "./_components/ProfileForm";
import { TeamSection } from "./_components/TeamSection";
import { TelegramConnect } from "./_components/TelegramConnect";

export default async function SettingsPage() {
  const sessionUser = await requireUser();
  const isAdmin = sessionUser.role === "ADMIN";
  const user = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
  const telegramStatus = await getTelegramStatus();

  const settings = isAdmin
    ? await prisma.settings.upsert({
        where: { id: "singleton" },
        update: {},
        create: { id: "singleton" },
      })
    : null;

  const [team, projects] = isAdmin
    ? await Promise.all([
        prisma.user.findMany({ include: { projectAccess: true }, orderBy: { createdAt: "asc" } }),
        prisma.project.findMany({ orderBy: { order: "asc" } }),
      ])
    : [null, null];

  const serializedTeam = team?.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatarUrl,
    editTasksSelf: u.editTasksSelf,
    viewAccounting: u.viewAccounting,
    viewChannels: u.viewChannels,
    editCrm: u.editCrm,
    editTasksOthers: u.editTasksOthers,
    projectIds: u.projectAccess.map((a) => a.projectId),
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Настройки</h1>
        <p className="text-sm text-muted">Ваш профиль и параметры платформы</p>
      </div>
      <div className="flex flex-col gap-6 p-5">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-medium text-foreground">Мой профиль</h2>
            <ProfileForm
              user={{
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
                hasMotivationPhoto: !!user.motivationPhotoKey,
              }}
            />
            <TelegramConnect status={telegramStatus} />
          </div>
          {isAdmin && settings && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-foreground">
                Расписание сводок и проверок дедлайнов
              </h2>
              <SettingsForm settings={settings} />
              <p className="mt-4 max-w-lg text-xs text-muted">
                По этому расписанию Telegram-бот присылает утреннюю сводку задач и
                вечерний отчёт о выполненном. Сотрудник должен подключить Telegram
                в своём профиле, чтобы получать сообщения.
              </p>
            </div>
          )}
        </div>
        {isAdmin && serializedTeam && projects && (
          <div>
            <h2 className="mb-2 text-sm font-medium text-foreground">Управление командой</h2>
            <TeamSection users={serializedTeam} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
          </div>
        )}
      </div>
    </div>
  );
}
