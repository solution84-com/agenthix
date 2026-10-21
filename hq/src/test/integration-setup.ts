import { beforeEach, afterAll } from 'vitest'
import { prisma } from './db'
import { truncateAll, retryOnDeadlock } from './truncateAll'
import { childrenFirst, emptyStatement, type ForeignKey } from './emptyTables'

// Empty every table (except Prisma's migration ledger) before each test, so
// each test starts from an empty database and order never matters (ADR-0035).
// Retries on a Postgres deadlock — see truncateAll.

const listTables = async () => {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  return rows.map((r) => r.tablename)
}

// The schema does not change during a run, so the statement is built once per file.
async function buildEmptyStatement(): Promise<string | null> {
  const tables = await listTables()
  const keys = await prisma.$queryRaw<ForeignKey[]>`
    SELECT child.relname AS child, parent.relname AS parent
    FROM pg_constraint
    JOIN pg_class child ON child.oid = conrelid
    JOIN pg_class parent ON parent.oid = confrelid
    WHERE contype = 'f' AND connamespace = 'public'::regnamespace`
  const sequences = await prisma.$queryRaw<{ name: string }[]>`
    SELECT relname AS name FROM pg_class
    WHERE relkind = 'S' AND relnamespace = 'public'::regnamespace`
  const order = childrenFirst(tables, keys)
  return order && emptyStatement(order, sequences.map((s) => s.name))
}

let statement: Promise<string | null> | undefined

beforeEach(async () => {
  statement ??= buildEmptyStatement()
  const sql = await statement
  if (sql) {
    await retryOnDeadlock(() => prisma.$executeRawUnsafe(sql))
    return
  }
  await truncateAll({
    listTables,
    truncate: (list) => prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`),
  })
})

afterAll(async () => {
  await prisma.$disconnect()
})
