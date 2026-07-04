import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { SettingsForm } from "./_components/SettingsForm";
import { ProfileForm } from "./_components/ProfileForm";

export default async function SettingsPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  const settings = isAdmin
    ? await prisma.settings.upsert({
        where: { id: "singleton" },
        update: {},
        create: { id: "singleton" },
      })
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Настройки</h1>
        <p className="text-sm text-muted">Ваш профиль и параметры платформы</p>
      </div>
      <div className="flex flex-col gap-6 p-5">
        <div>
          <h2 className="mb-2 text-sm font-medium text-foreground">Мой профиль</h2>
          <ProfileForm user={{ name: user.name ?? "", email: user.email ?? "" }} />
        </div>
        {isAdmin && settings && (
          <div>
            <h2 className="mb-2 text-sm font-medium text-foreground">
              Расписание сводок и проверок дедлайнов
            </h2>
            <SettingsForm settings={settings} />
            <p className="mt-4 max-w-lg text-xs text-muted">
              Эти параметры сохраняются в базе и готовы к использованию будущим
              Telegram-ботом уведомлений. Сама отправка сообщений (утренняя/вечерняя
              сводка, напоминания о дедлайнах) требует отдельного bot-сервиса — в
              этой версии платформы он не подключён, значения только хранятся.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
