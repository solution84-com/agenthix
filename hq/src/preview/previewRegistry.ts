import { prisma } from 'wasp/server'
import { randomBytes } from 'node:crypto'
import type { PreviewSession } from 'wasp/entities'
import type { WorkspaceOwnerType } from '@prisma/client'

/**
 * Saves a database read per proxied request, which for a dev server is one per
 * asset — but it is also what a preview host resolves through, so a row ended
 * behind its back would go on admitting people.
 *
 * Every write that ends a row deletes its entry from here. That is not enough
 * on its own: a `touch` already in flight when a row is ended can commit its
 * own `cache.set` after the delete has run, putting the stale row back. So an
 * entry is also only trusted for `CACHE_TTL_MS`, which turns "for the life of
 * the process" into a bound measured in seconds. The two together are what
 * make the window narrow AND finite; neither alone does.
 */
const CACHE_TTL_MS = 5_000

const cache = new Map<string, { row: PreviewSession; cachedAt: number }>()

/**
 * The row's unique token. A preview is addressed by its row id (previewWiring.ts),
 * so the token is never handed out; it stays only because the schema requires it.
 */
function mintToken(): string {
  return randomBytes(24).toString('base64url')
}

export interface CreatePreviewInput {
  agentId: string
  sessionId: string | null
  /** The Execution Site holding the container the preview runs in. */
  siteId: string
  /** That site's own id for the preview — what a stream to it names. */
  previewId: string
  command: string
  ttlMs: number
  /**
   * The storage boundary whose working tree the container holds. The row is
   * what a live preview resolves through, and the agent stopped identifying the
   * content when the mount stopped being that agent's workspace — so this is
   * what a requester check has to be made against (previewAuth.ts).
   */
  ownerType: WorkspaceOwnerType
  ownerId: string
  workspaceId: string | null
  taskId: string | null
}

/**
 * A preview never outlives the session that started it: `expiresAt` is the
 * earlier of its own TTL and the session's own end, when the session has one.
 * A session that ends before the TTL would otherwise leave it resolving
 * through it for the rest of the window — and the sweep, which is driven by
 * `expiresAt` alone, would not come for it until then either.
 */
async function sessionEnd(sessionId: string | null): Promise<Date | null> {
  if (!sessionId) return null
  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    select: { expiresAt: true },
  })
  return session?.expiresAt ?? null
}

export async function createPreview(input: CreatePreviewInput): Promise<PreviewSession> {
  const token = mintToken()
  const ttlEnd = new Date(Date.now() + input.ttlMs)
  const end = await sessionEnd(input.sessionId)
  const expiresAt = end && end < ttlEnd ? end : ttlEnd
  const row = await prisma.previewSession.create({
    data: {
      token,
      agentId: input.agentId,
      sessionId: input.sessionId,
      siteId: input.siteId,
      previewId: input.previewId,
      command: input.command,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      status: 'starting',
      expiresAt,
    },
  })
  remember(row)
  return row
}

function remember(row: PreviewSession): void {
  cache.set(row.id, { row, cachedAt: Date.now() })
}

export async function getById(id: string): Promise<PreviewSession | null> {
  const cached = cache.get(id)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached.row
  if (cached) cache.delete(id)
  const row = await prisma.previewSession.findUnique({ where: { id } })
  if (row) remember(row)
  return row
}

/**
 * Only a row that is still live goes back in the cache. `touch` runs on every
 * proxied request, so without this test a request in flight when the preview
 * was ended would re-cache the `running` row it read on the way in.
 */
export async function touch(id: string): Promise<void> {
  const row = await prisma.previewSession.update({
    where: { id },
    data: { lastAccessAt: new Date() },
  })
  if (row.status === 'running' || row.status === 'starting') remember(row)
  else cache.delete(row.id)
}

/**
 * `stopping` is the state of a preview whose expiry has passed but whose site
 * has not acknowledged the stop (previewSweep.ts). It resolves for nobody, and
 * unlike `expired` it stays in `listExpired`'s candidate set, so the sweep
 * comes back to it — which is the only thing that eventually gives the
 * container its hold back.
 */
export async function markStatus(id: string, status: 'running' | 'stopping' | 'expired'): Promise<void> {
  const row = await prisma.previewSession.update({ where: { id }, data: { status } })
  if (status === 'running') remember(row)
  else cache.delete(row.id)
}

/**
 * The sweep's candidate set: everything past its expiry that has not been
 * confirmed stopped. `stopping` rows are deliberately included — that is what
 * makes an unacknowledged stop retry rather than leak.
 */
export async function listExpired(at: Date): Promise<PreviewSession[]> {
  return prisma.previewSession.findMany({
    where: { status: { not: 'expired' }, expiresAt: { lt: at } },
  })
}

/**
 * End every live preview a session started, whatever its own expiry said.
 *
 * Archiving, deleting or clearing a session is a statement that the work
 * behind it is over, and a preview is a window onto that work's files — so its
 * expiry is brought forward to now and it stops resolving at once.
 *
 * The rows move to `stopping` rather than straight to `expired`, which is the
 * same distinction the sweep draws and for the same reason: a live preview
 * HOLDS its container on the site, and `preview.stop` is the only thing that
 * gives the hold back. Writing `expired` here would end the preview and pin that
 * container open for good, because an `expired` row is out of the sweep's
 * candidate set and nothing else holds the preview's id. `stopping` with an
 * expiry of now resolves for nobody AND is exactly what the next sweep picks
 * up, so the site is asked to let the container go and the row reaches
 * `expired` on its acknowledgement.
 *
 * The rows are read before they are written so they can leave the
 * cache: `getById` answers from memory first, so a row ended behind the
 * cache's back would go on resolving for as long as the process lived.
 *
 * Returns how many rows it ended.
 */
export async function expirePreviewsForSession(sessionId: string): Promise<number> {
  return expirePreviewsForSessions([sessionId])
}

/**
 * The same, for the paths that end sessions in bulk — a task's context being
 * cleared, an agent being deleted, a person being removed. One query rather
 * than one per session, because those lists are not bounded by anything.
 */
export async function expirePreviewsForSessions(sessionIds: string[]): Promise<number> {
  if (sessionIds.length === 0) return 0
  const live = await prisma.previewSession.findMany({
    where: { sessionId: { in: sessionIds }, status: { in: ['starting', 'running'] } },
    select: { id: true },
  })
  if (live.length === 0) return 0
  await prisma.previewSession.updateMany({
    where: { id: { in: live.map(row => row.id) } },
    data: { status: 'stopping', expiresAt: new Date() },
  })
  for (const row of live) cache.delete(row.id)
  return live.length
}

/** test-only */
export function _resetCache(): void {
  cache.clear()
}
