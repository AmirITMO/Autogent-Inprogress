import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { testUser } from "../testUser";

vi.mock("@/lib/roles", () => ({
  requireUser: async () => testUser,
  getPermissions: async () => ({
    editTasksSelf: true,
    viewAccounting: true,
    viewChannels: true,
    editCrm: true,
    editTasksOthers: true,
  }),
}));

const { approveTgCommentDraft, skipTgCommentDraft } = await import("@/lib/actions/tgCommentDrafts");

let channelId: string;

beforeEach(async () => {
  await prisma.tgCommentDraft.deleteMany();
  await prisma.user.deleteMany();
  await prisma.trafficChannel.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Тест", email: `user-${Date.now()}@test.local`, passwordHash: "x", role: "ADMIN" },
  });
  testUser.id = user.id;
  testUser.role = "ADMIN";

  const channel = await prisma.trafficChannel.create({
    data: { name: "Тестовый автокомментинг", type: "TG_AUTOCOMMENT" },
  });
  channelId = channel.id;
});

describe("approveTgCommentDraft", () => {
  it("переводит PENDING-черновик в APPROVED с отредактированным текстом", async () => {
    const draft = await prisma.tgCommentDraft.create({
      data: {
        channelId,
        externalId: "c1:1",
        targetChannelUsername: "somechannel",
        postLink: "https://t.me/somechannel/1",
        draftComment: "исходный текст",
        status: "PENDING",
      },
    });

    const result = await approveTgCommentDraft(draft.id, "отредактированный текст");

    expect(result.ok).toBe(true);
    const updated = await prisma.tgCommentDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(updated.status).toBe("APPROVED");
    expect(updated.draftComment).toBe("отредактированный текст");
  });

  it("отказывает на уже не-PENDING черновике", async () => {
    const draft = await prisma.tgCommentDraft.create({
      data: {
        channelId,
        externalId: "c1:1",
        targetChannelUsername: "somechannel",
        postLink: "https://t.me/somechannel/1",
        draftComment: "текст",
        status: "SENT",
      },
    });

    const result = await approveTgCommentDraft(draft.id);

    expect(result.ok).toBe(false);
  });

  // Тот же класс гонки, что чинили в agentKnowledgeBase.ts/b2bEmailSend.ts —
  // двойной клик "Одобрить" на одном черновике должен дать ровно один успех.
  it("два одновременных вызова на один черновик — ровно один успех", async () => {
    const draft = await prisma.tgCommentDraft.create({
      data: {
        channelId,
        externalId: "c1:1",
        targetChannelUsername: "somechannel",
        postLink: "https://t.me/somechannel/1",
        draftComment: "текст",
        status: "PENDING",
      },
    });

    const results = await Promise.all([approveTgCommentDraft(draft.id), approveTgCommentDraft(draft.id)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });
});

describe("skipTgCommentDraft", () => {
  it("переводит PENDING-черновик в SKIPPED", async () => {
    const draft = await prisma.tgCommentDraft.create({
      data: {
        channelId,
        externalId: "c1:1",
        targetChannelUsername: "somechannel",
        postLink: "https://t.me/somechannel/1",
        draftComment: "текст",
        status: "PENDING",
      },
    });

    const result = await skipTgCommentDraft(draft.id);

    expect(result.ok).toBe(true);
    const updated = await prisma.tgCommentDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(updated.status).toBe("SKIPPED");
  });
});
