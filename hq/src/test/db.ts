import { PrismaClient } from '@prisma/client'
import { withoutPrismaEnvFile } from './prismaEnvFile'
import { withTestPoolSize } from './poolSize'

// Integration-test Prisma client, pointed at DATABASE_URL (set to the test DB
// by scripts/test/with-test-db.mjs). When the wrapper prepared one database per
// test process (TEST_DB_WORKER_NAMES), this process takes the one matching its
// Vitest worker number, so files running at the same time never share a
// database. Second safety guard after the wrapper: refuse to connect unless the
// database name ends in `_test`, so the truncate-between-tests logic can never
// touch dev data.
const workerNames = process.env.TEST_DB_WORKER_NAMES?.split(',')
if (workerNames) {
  const name = workerNames[Number(process.env.VITEST_POOL_ID) - 1]
  if (!name) {
    throw new Error(
      `[integration] no test database for Vitest worker ${process.env.VITEST_POOL_ID}: the wrapper prepared ${workerNames.length}.`
    )
  }
  const url = new URL(process.env.DATABASE_URL ?? '')
  url.pathname = `/${name}`
  process.env.DATABASE_URL = url.toString()
}

process.env.DATABASE_URL = withTestPoolSize(process.env.DATABASE_URL ?? '')
const url = process.env.DATABASE_URL
const dbName = (() => {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
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

export const prisma = withoutPrismaEnvFile(() => new PrismaClient())
