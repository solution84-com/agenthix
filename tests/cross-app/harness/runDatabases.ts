// Each cross-app run has test databases of its own, named for the run and dropped after it, so two runs on one machine
// never truncate each other's data. The names keep the `_test` ending every wrapper and truncation insists on.
import { randomBytes } from 'node:crypto'

const RUN_ID = /^[a-z0-9]{6,16}$/
const RUN_DATABASE = /^agenthix(_site)?_x[a-z0-9]{6,16}_test$/

export function newRunId(): string {
  return randomBytes(5).toString('hex')
}

/** The two databases a run uses: hq's and the site's. */
export function runDatabaseNames(runId: string): { hq: string; site: string } {
  if (!RUN_ID.test(runId)) throw new Error(`refusing a cross-app run id "${runId}": 6 to 16 lowercase letters and digits`)
  return { hq: `agenthix_x${runId}_test`, site: `agenthix_site_x${runId}_test` }
}

/** The statement that removes one run's database, refused for any name a run does not make. */
export function dropDatabaseStatement(name: string): string {
  if (!RUN_DATABASE.test(name)) throw new Error(`refusing to drop "${name}": it is not a cross-app run's database`)
  return `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`
}

/** `url` with its database swapped for `name`, on the same server. */
export function withDatabase(url: string, name: string): string {
  const u = new URL(url)
  u.pathname = `/${name}`
  return u.toString()
}
