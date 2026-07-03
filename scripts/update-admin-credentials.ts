import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const oldEmail = process.env.OLD_EMAIL ?? "admin@autogentgroup.ru";
  const newEmail = process.env.NEW_EMAIL;
  const newPassword = process.env.NEW_PASSWORD;

  if (!newEmail || !newPassword) {
    throw new Error("Set NEW_EMAIL and NEW_PASSWORD env vars before running this script.");
  }

  const user = await prisma.user.update({
    where: { email: oldEmail },
    data: { email: newEmail, passwordHash: await hash(newPassword, 10) },
  });

  console.log(`Updated: ${oldEmail} -> ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
