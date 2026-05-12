import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const seeds: { email: string; name: string; role: UserRole }[] = [
    {
      email: "admin@opspilot.local",
      name: "Platform Admin",
      role: UserRole.PLATFORM_ADMIN,
    },
    {
      email: "devops@opspilot.local",
      name: "DevOps Engineer",
      role: UserRole.DEVOPS_ENGINEER,
    },
    {
      email: "release@opspilot.local",
      name: "Release Manager",
      role: UserRole.RELEASE_MANAGER,
    },
    {
      email: "leadership@opspilot.local",
      name: "Leadership",
      role: UserRole.LEADERSHIP,
    },
    {
      email: "viewer@opspilot.local",
      name: "Read-only",
      role: UserRole.VIEWER,
    },
  ];

  for (const row of seeds) {
    await prisma.user.upsert({
      where: { email: row.email },
      create: row,
      update: { name: row.name, role: row.role },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
