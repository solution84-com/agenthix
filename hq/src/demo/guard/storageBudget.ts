/**
 * How much a visitor may store in the demo (live demo spec: "uploads are capped"): the demo shares its machine, so
 * what visitors send is bounded per visitor and in all, until the reset wipes it. Every action's body is counted —
 * attachments, shared files, drafts, Knowledge pages and pictures are the large ones; a click or a message costs a few
 * hundred bytes — once the guard has let it through, and only from a signed-in visitor (the guard refuses an action
 * without a session first). Bytes of an action that does not succeed are given back. Kept in hq's `RateLimit` table,
 * which the reset wipes.
 */
import { prisma } from 'wasp/server'
import { DEMO_FULL_STORAGE, DEMO_VISITOR_STORAGE } from '../demoWords'

/** 20 MB from each visitor. */
export const VISITOR_BYTES = 20_000_000
/** 2 GB from every visitor together (within the table's 32-bit count). */
export const DEMO_BYTES = 2_000_000_000

const ALL = 'demo-bytes:all'
const visitorKey = (userId: string) => `demo-bytes:${userId}`
/** Longer than the time between resets, which wipe the rows: a budget never renews in between. */
const KEPT_MS = 24 * 60 * 60 * 1000

/** The size of an operation's body as it came, in bytes. */
export function bodyBytes(body: unknown): number {
  return Buffer.byteLength(JSON.stringify(body ?? {}) ?? '')
}

async function add(key: string, bytes: number): Promise<number> {
  const resetAt = new Date(Date.now() + KEPT_MS)
  const upsert = () => prisma.rateLimit.upsert({
    where: { ip: key },
    create: { ip: key, count: bytes, resetAt },
    update: { count: { increment: bytes } },
    select: { count: true },
  })
  // Two first writes at once: one creates the row, the other's create fails on the key and is tried again as an update.
  try {
    return (await upsert()).count
  } catch {
    return (await upsert()).count
  }
}

/**
 * Counts `bytes` against the visitor's budget and the demo's; null when both hold them, otherwise the sentence that
 * says which is used up. Bytes refused are given back, so a refusal costs nothing.
 */
export async function takeBytes(userId: string, bytes: number): Promise<string | null> {
  const [all, own] = await Promise.all([add(ALL, bytes), add(visitorKey(userId), bytes)])
  const over = all > DEMO_BYTES ? DEMO_FULL_STORAGE : own > VISITOR_BYTES ? DEMO_VISITOR_STORAGE : null
  if (over) await giveBytes(userId, bytes)
  return over
}

/** Gives back bytes `takeBytes` counted, for an action that was refused or did not succeed. */
export async function giveBytes(userId: string, bytes: number): Promise<void> {
  await Promise.all([ALL, visitorKey(userId)].map(k =>
    prisma.rateLimit.update({ where: { ip: k }, data: { count: { decrement: bytes } } })))
}

/**
 * Operations charged by what they write rather than by their body (generated and uploaded pictures spec: *Making a
 * picture costs the server*): a recipe is a few dozen bytes, but saving one writes four files. The guard does not count
 * their bodies; the operation checks the budget first (`budgetRefusal`) and charges the bytes it wrote (`chargeWritten`).
 */
export const CHARGED_BY_WHAT_THEY_WRITE: readonly string[] = ['savePictures']

/** Null while the visitor and the demo still have room, otherwise the sentence that says which is used up. */
export async function budgetRefusal(userId: string): Promise<string | null> {
  return takeBytes(userId, 0)
}

/** Counts bytes already written; never refused, since they are on disk. The next operation is refused when over. */
export async function chargeWritten(userId: string, bytes: number): Promise<void> {
  if (bytes > 0) await Promise.all([add(ALL, bytes), add(visitorKey(userId), bytes)])
}
