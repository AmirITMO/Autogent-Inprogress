import { requireUser } from "@/lib/roles";

export default async function KnowledgeBasePage() {
  await requireUser();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">База знаний</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <p className="max-w-xl text-sm text-muted">
          В дальнейшем сюда будем грузить скрипты продаж, важные файлы, регламенты и т.д., чтобы
          всё было в едином месте.
        </p>
      </div>
    </div>
  );
}
