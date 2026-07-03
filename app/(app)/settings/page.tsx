import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { SettingsForm } from "./_components/SettingsForm";

export default async function SettingsPage() {
  await requireAdmin();

  const settings = await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Настройки</h1>
        <p className="text-sm text-muted">Расписание сводок и проверок дедлайнов</p>
      </div>
      <div className="p-5">
        <SettingsForm settings={settings} />
        <p className="mt-4 max-w-lg text-xs text-muted">
          Эти параметры сохраняются в базе и готовы к использованию будущим
          Telegram-ботом уведомлений. Сама отправка сообщений (утренняя/вечерняя
          сводка, напоминания о дедлайнах) требует отдельного bot-сервиса — в
          этой версии платформы он не подключён, значения только хранятся.
        </p>
      </div>
    </div>
  );
}
