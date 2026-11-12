/**
 * The demo guard (live demo spec, *Getting in*), after hq's read-only mode (`server/readOnly.ts`). A visitor is an
 * organisation member and a viewer of the sample's projects, so the product's own roles keep the sample as seeded; the
 * guard holds only what a member may still do that a public demo must not, and refuses it with one sentence.
 *
 * - **Wasp operations** (`POST /operations/<name>`): refused when named in `REFUSED_OPERATIONS`, or when they would
 *   fetch a package from a link. The arguments are read as Wasp will hand them to the operation (superjson's
 *   `deserialize`), and a body whose `meta` copies one value onto another path (`referentialEqualities`) is refused,
 *   so what is judged is what runs.
 * - **Other routes**: reads answer but for `REFUSED_READS`; a write answers only from `DEMO_WRITES`, so signing in,
 *   signing up, a password change or reset and a phone's pairing are refused.
 * - **Storage**: an operation from a signed-in visitor is counted against the visitor's and the demo's byte budgets
 *   (`storageBudget.ts`), and given back when it answers with a failure. A small read costs nothing. Without a session
 *   nothing is counted: Wasp refuses the operation itself.
 *
 * With the setting off it passes everything on untouched.
 */
import type { Request, RequestHandler } from 'express'
import { deserialize } from 'wasp/core/serialization'
import { Logger } from '../../server/utils/logger'
import { DEMO_REFUSAL, demoOn } from '../demoMode'
import { FROM_LINK_OPERATIONS, REFUSED_OPERATIONS } from './refused'
import { DEMO_WRITES, REFUSED_READS } from './routes'
import { bodyBytes, giveBytes, takeBytes } from './storageBudget'
import { visitorOf } from './visitorOf'

const logger = new Logger('DemoGuard')

const READS = new Set(['GET', 'HEAD', 'OPTIONS'])
const REFUSED = new Set<string>(Object.values(REFUSED_OPERATIONS).flat())
const FROM_LINK = new Set(FROM_LINK_OPERATIONS)

/** A read's arguments are this small; a body above it is counted whatever the operation is called. */
export const SMALL_READ_BYTES = 1_000

const camel = (kebab: string) => kebab.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())

/** The path as Express routes it — case and repeated or trailing slashes ignored — or null when it cannot be read. */
export function routedPath(url: string): string | null {
  let path: string
  try {
    path = decodeURIComponent(url.split('?')[0])
  } catch {
    return null
  }
  return path.toLowerCase().replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
}

/** Whether the body asks superjson to copy one value onto another path, which no operation needs. */
function copiesValues(body: unknown): boolean {
  const meta = (body as { meta?: unknown } | null | undefined)?.meta
  return typeof meta === 'object' && meta !== null && 'referentialEqualities' in meta
}

/** An operation's arguments exactly as Wasp hands them to it (`createOperation` in Wasp's server). */
function argsOf(body: unknown): Record<string, unknown> {
  const args: unknown = (body && deserialize(body as Parameters<typeof deserialize>[0])) || {}
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {}
}

function operationRefused(name: string, body: unknown): boolean {
  if (copiesValues(body)) return true
  if (REFUSED.has(name)) return true
  return FROM_LINK.has(name) && argsOf(body).from === 'url'
}

/** The operation a request calls, by name; null for a read or any other route. */
function operationOf(method: string, url: string): string | null {
  if (READS.has(method.toUpperCase())) return null
  const path = routedPath(url)
  const operation = path === null ? null : /^\/operations\/([a-z0-9-]+)$/.exec(path)
  return operation ? camel(operation[1]) : null
}

/** Whether demo mode refuses this request. */
export function refusedInDemo(method: string, url: string, body: unknown): boolean {
  const path = routedPath(url)
  if (path === null) return true
  if (READS.has(method.toUpperCase())) return REFUSED_READS.has(path)
  const operation = /^\/operations\/([a-z0-9-]+)$/.exec(path)
  if (operation) return operationRefused(camel(operation[1]), body)
  return !DEMO_WRITES.has(path)
}

/** Whether an operation's body is counted: anything but a small read (named as Wasp's reads are, with small arguments). */
export function counted(name: string, bytes: number): boolean {
  return bytes > SMALL_READ_BYTES || !/^(get|list|find|search)[A-Z]/.test(name)
}

type Judged = { refusal: string } | { refusal: null; charged: { userId: string; bytes: number } | null }

/** What the demo makes of a request: refused with a sentence, or answered, with the bytes it counted. */
export async function judge(req: Request): Promise<Judged> {
  if (refusedInDemo(req.method, req.originalUrl, req.body)) return { refusal: DEMO_REFUSAL }
  const visitor = await visitorOf(req)
  const name = operationOf(req.method, req.originalUrl)
  // Without a session nothing is counted, so traffic with no account cannot use up the demo's budget; Wasp answers
  // every operation but `getDemoInfo` with 401 itself.
  if (name === null || visitor === null) return { refusal: null, charged: null }
  const bytes = bodyBytes(req.body)
  if (!counted(name, bytes)) return { refusal: null, charged: null }
  const refusal = await takeBytes(visitor, bytes)
  return refusal ? { refusal } : { refusal: null, charged: { userId: visitor, bytes } }
}

export const demoGuard: RequestHandler = (req, res, next) => {
  if (!demoOn()) return next()
  judge(req).then(
    (judged) => {
      if (judged.refusal !== null) return void res.status(403).json({ message: judged.refusal, demo: true })
      const charged = judged.charged
      if (charged) {
        res.on('finish', () => {
          if (res.statusCode < 400) return
          giveBytes(charged.userId, charged.bytes).catch((err: unknown) => logger.warn('could not give back bytes', err))
        })
      }
      next()
    },
    (err: unknown) => {
      logger.error('demo guard check failed; refused', err)
      res.status(403).json({ message: DEMO_REFUSAL, demo: true })
    },
  )
}
