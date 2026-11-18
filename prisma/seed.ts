import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import { PrismaClient } from '../lib/generated/prisma/client.ts';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env and fill it in.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms);

const DEV_ACCOUNT_PASSWORD = 'Antilonely123!';

const USERS = {
  testerOne: '11111111-1111-4111-8111-111111111111',
  testerTwo: '33333333-3333-4333-8333-333333333333',
  puayleng: '10000000-0000-4000-8000-000000000003',
  pakkad: '10000000-0000-4000-8000-000000000004',
  tonhom: '10000000-0000-4000-8000-000000000005',
  saifon: '10000000-0000-4000-8000-000000000006',
  adminSeed: '10000000-0000-4000-8000-000000000007',
} as const;

const SEED_USERS = [
  {
    id: USERS.testerOne,
    accountId: 'a0000000-0000-4000-8000-000000000001',
    username: 'tester_one',
    displayUsername: 'คนทดสอบ',
    name: 'Tester One',
    email: 'tester1@example.com',
    role: 'user' as const,
  },
  {
    id: USERS.testerTwo,
    accountId: 'a0000000-0000-4000-8000-000000000002',
    username: 'tester_two',
    displayUsername: 'เพื่อนในห้อง',
    name: 'Tester Two',
    email: 'tester2@example.com',
    role: 'user' as const,
  },
  {
    id: USERS.puayleng,
    accountId: 'a0000000-0000-4000-8000-000000000003',
    username: 'puayleng',
    displayUsername: 'ปวยเล้ง',
    name: 'Puayleng',
    email: 'puayleng@example.com',
    role: 'user' as const,
  },
  {
    id: USERS.pakkad,
    accountId: 'a0000000-0000-4000-8000-000000000004',
    username: 'pakkad',
    displayUsername: 'ผักกาด',
    name: 'Pakkad',
    email: 'pakkad@example.com',
    role: 'user' as const,
  },
  {
    id: USERS.tonhom,
    accountId: 'a0000000-0000-4000-8000-000000000005',
    username: 'tonhom',
    displayUsername: 'ต้นหอม',
    name: 'Tonhom',
    email: 'tonhom@example.com',
    role: 'user' as const,
  },
  {
    id: USERS.saifon,
    accountId: 'a0000000-0000-4000-8000-000000000006',
    username: 'saifon',
    displayUsername: 'สายฝน',
    name: 'Saifon',
    email: 'saifon@example.com',
    role: 'user' as const,
  },
  {
    id: USERS.adminSeed,
    accountId: 'a0000000-0000-4000-8000-000000000007',
    username: 'admin_seed',
    displayUsername: 'แอดมิน',
    name: 'Admin Seed',
    email: 'admin@example.com',
    role: 'admin' as const,
  },
] as const;

const SEED_NOTIFICATIONS = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    userId: USERS.testerOne,
    type: 'reply' as const,
    isRead: false,
    createdAt: ago(50 * MINUTE_MS),
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    userId: USERS.testerOne,
    type: 'reaction' as const,
    isRead: false,
    createdAt: ago(1 * HOUR_MS + 35 * MINUTE_MS),
  },
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    userId: USERS.testerOne,
    type: 'mention' as const,
    isRead: true,
    createdAt: ago(1 * DAY_MS),
  },
] as const;

/** Idempotently seeds users/credentials and notifications. No rooms are seeded. */
async function main() {
  const hashedUserPassword = await hashPassword(DEV_ACCOUNT_PASSWORD);

  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        displayUsername: user.displayUsername,
        name: user.name,
        role: user.role,
      },
      create: {
        id: user.id,
        username: user.username,
        displayUsername: user.displayUsername,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: true,
      },
    });

    await prisma.account.upsert({
      where: { id: user.accountId },
      update: {
        accountId: user.id,
        providerId: 'credential',
        password: hashedUserPassword,
        userId: user.id,
      },
      create: {
        id: user.accountId,
        accountId: user.id,
        providerId: 'credential',
        password: hashedUserPassword,
        userId: user.id,
      },
    });
  }

  for (const notification of SEED_NOTIFICATIONS) {
    await prisma.notification.upsert({
      where: { id: notification.id },
      update: {
        type: notification.type,
        isRead: notification.isRead,
      },
      create: notification,
    });
  }
  console.log(`Seeded ${SEED_USERS.length} users (+credential accounts), ${SEED_NOTIFICATIONS.length} notifications.`);
  console.log(`Dev login password (all seeded users): ${DEV_ACCOUNT_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
