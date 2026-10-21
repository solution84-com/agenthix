import { PrismaClient } from '@prisma/client'

// Integration-test Prisma client, pointed at DATABASE_URL (set to the test DB
// by scripts/test/with-test-db.mjs). Second safety guard after the wrapper:
// refuse to connect unless the database name ends in `_test`, so the
// truncate-between-tests logic can never touch dev data.
const url = process.env.DATABASE_URL ?? ''
const dbName = (() => {
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return ''
  }
})()

if (!dbName.endsWith('_test')) {
  throw new Error(
    `[integration] refusing to connect: DATABASE_URL database "${dbName}" is not a *_test database. ` +
      'Run via `npm run test:integration`.'
  )
}

export const prisma = new PrismaClient()
