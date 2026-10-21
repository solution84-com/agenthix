import { beforeEach, afterAll } from 'vitest'
import { prisma } from './db'

// Truncate every table (except Prisma's migration ledger) before each test, so
// each test starts from an empty database and order never matters (ADR-0035).
beforeEach(async () => {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (rows.length === 0) return
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
})

afterAll(async () => {
  await prisma.$disconnect()
})
