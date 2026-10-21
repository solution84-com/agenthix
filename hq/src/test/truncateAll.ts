// The between-test TRUNCATE of every table (ADR-0035), with a bounded retry
// on a Postgres deadlock. TRUNCATE takes ACCESS EXCLUSIVE locks on every table,
// so a background connection still holding a row lock from the previous test
// (a dangling write, a pool connection finishing off) can deadlock with it
// and abort the truncate — the abort leaves nothing half done, so trying the
// same statement again is safe.

export interface TruncateTarget {
  listTables(): Promise<string[]>
  truncate(quotedTableList: string): Promise<unknown>
}

export interface RetryOptions {
  attempts?: number
  delayMs?: number
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_ATTEMPTS = 5
const DEFAULT_DELAY_MS = 50

// Postgres SQLSTATE 40P01 is deadlock_detected. Prisma surfaces it as a raw
// query error whose message carries the driver's text, and — depending on the
// path — the code in `meta`; its own transaction-conflict code is P2034.
export function isDeadlock(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { message, code, meta } = error as {
    message?: unknown
    code?: unknown
    meta?: { code?: unknown; message?: unknown }
  }
  if (code === 'P2034') return true
  if (meta?.code === '40P01') return true
  return [message, meta?.message].some(
    (text) => typeof text === 'string' && /deadlock detected|40P01/i.test(text)
  )
}

export async function truncateAll(
  target: TruncateTarget,
  { attempts = DEFAULT_ATTEMPTS, delayMs = DEFAULT_DELAY_MS, sleep = defaultSleep }: RetryOptions = {}
): Promise<void> {
  const tables = await target.listTables()
  if (tables.length === 0) return
  const list = tables.map((name) => `"public"."${name}"`).join(', ')
  await retryOnDeadlock(() => target.truncate(list), { attempts, delayMs, sleep })
}

// Runs `statement`, trying it again on a deadlock: a statement aborted by one
// leaves nothing half done.
export async function retryOnDeadlock(
  statement: () => Promise<unknown>,
  { attempts = DEFAULT_ATTEMPTS, delayMs = DEFAULT_DELAY_MS, sleep = defaultSleep }: RetryOptions = {}
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await statement()
      return
    } catch (error) {
      if (!isDeadlock(error) || attempt >= attempts) throw error
      await sleep(delayMs * attempt)
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
