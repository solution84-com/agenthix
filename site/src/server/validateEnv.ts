import { masterKeyProblem } from './crypto/secretCrypto'

/**
 * What the site will not start without. DATABASE_URL is first because nothing
 * else can run without it; Prisma would otherwise only fail at the first query.
 * SITE_ROOT is next: unset, the runtime used to boot against an empty directory
 * beside the build output and fail later with nothing naming the cause. SECRETS_MASTER_KEY encrypts the site's
 * stored credential to hq, so without it the site could never connect.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = []
  const db = env.DATABASE_URL?.trim()
  if (!db) {
    problems.push('  - DATABASE_URL (always required): this site\'s PostgreSQL database, postgresql://user:password@host:port/database.')
  } else if (!/^postgres(ql)?:\/\//.test(db)) {
    problems.push('  - DATABASE_URL must be a postgresql:// address.')
  }
  if (!env.SITE_ROOT?.trim()) {
    problems.push('  - SITE_ROOT (always required): the folder holding this site\'s data. In a container it is mounted at the same path inside and out.')
  }
  const keyProblem = masterKeyProblem(env.SECRETS_MASTER_KEY)
  if (keyProblem) {
    problems.push(`  - SECRETS_MASTER_KEY (always required; this site's own, generate one with: openssl rand -base64 32) — ${keyProblem}`)
  }
  return problems
}
