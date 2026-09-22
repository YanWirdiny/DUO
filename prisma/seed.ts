import "dotenv/config";
import { PrismaClient, type Weekday } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_GYM_DAYS: Weekday[] = ["MON", "WED", "FRI"] as Weekday[];

/** Creates or updates a demo user and gives them a default MON/WED/FRI gym schedule. */
async function seedUser(opts: {
  username: string;
  password: string;
  displayName: string;
  avatarColor: string;
}) {
  const username = opts.username.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(opts.password, 12);
  const user = await prisma.user.upsert({
    where: { username },
    create: {
      username,
      passwordHash,
      displayName: opts.displayName,
      avatarColor: opts.avatarColor,
    },
    update: {
      passwordHash,
      displayName: opts.displayName,
    },
  });

  const existingDays = await prisma.scheduleDay.count({ where: { userId: user.id } });
  if (existingDays === 0) {
    await prisma.scheduleDay.createMany({
      data: (["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as Weekday[]).map((weekday) => ({
        userId: user.id,
        weekday,
        isGymDay: DEFAULT_GYM_DAYS.includes(weekday),
      })),
    });
  }

  return user;
}

/** Seeds two demo users (from env vars) and pairs them as gym buddies if not already linked. */
async function main() {
  const u1 = {
    username: requireEnv("SEED_USER1_USERNAME"),
    password: requireEnv("SEED_USER1_PASSWORD"),
    displayName: process.env.SEED_USER1_NAME || requireEnv("SEED_USER1_USERNAME"),
  };
  const u2 = {
    username: requireEnv("SEED_USER2_USERNAME"),
    password: requireEnv("SEED_USER2_PASSWORD"),
    displayName: process.env.SEED_USER2_NAME || requireEnv("SEED_USER2_USERNAME"),
  };

  const userA = await seedUser({ ...u1, avatarColor: "#FF3131" });
  const userB = await seedUser({ ...u2, avatarColor: "#3A3A3B" });

  const alreadyPaired = await prisma.buddyPair.findFirst({
    where: { OR: [{ userAId: userA.id }, { userBId: userA.id }] },
  });
  if (!alreadyPaired) {
    await prisma.buddyPair.create({ data: { userAId: userA.id, userBId: userB.id } });
    console.log(`Linked ${userA.username} <-> ${userB.username} as buddies.`);
  }

  console.log(`Seeded users: ${userA.username}, ${userB.username}`);
}

/** Reads a required env var, throwing with a clear message if it's unset. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
