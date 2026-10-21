/**
 * Which previews are running on this site, and in which container.
 *
 * In memory, and deliberately so. The entries describe processes inside
 * containers, and a process does not outlive the container it is in — so a
 * table of them that survived a site restart would describe things that are
 * gone. An empty registry after a restart is the correct answer, not lost
 * state: hq's own rows expire on the first `preview.connect` that comes back
 * `not_found`.
 *
 * It holds no authority and answers no question about people. hq settles who
 * may watch a preview before it ever asks for one, and per ADR-0042 this site
 * has no identity store to re-derive that from — so nothing here is keyed by
 * a user, and nothing here decides anything.
 */
import { onContainerDestroyed } from '../runtime/containerDestroyed'
import { addConversationHold } from '../runtime/conversationHolds'
import type { DockerFn } from './previewProcess'

export interface PreviewEntry {
  container: string
  port: number
  /** The session the preview belongs to, so it can expire with it. */
  sessionId: string
  startedAt: number
}

const previews = new Map<string, PreviewEntry>()

export function register(input: { previewId: string; container: string; port: number; sessionId: string }): PreviewEntry {
  const entry: PreviewEntry = {
    container: input.container,
    port: input.port,
    sessionId: input.sessionId,
    startedAt: Date.now(),
  }
  previews.set(input.previewId, entry)
  return entry
}

export function get(previewId: string): PreviewEntry | undefined {
  return previews.get(previewId)
}

/** True when this site knew the id — which is what makes `preview.stop` able
 *  to answer `{ stopped: false }` rather than fail. */
export function remove(previewId: string): boolean {
  return previews.delete(previewId)
}

export function listAll(): { previewId: string; entry: PreviewEntry }[] {
  return [...previews].map(([previewId, entry]) => ({ previewId, entry }))
}

/**
 * Forget every preview in a container that has just been destroyed.
 *
 * Subscribed to the runtime's destroy seam below, so this fires on the
 * recreate, the agent stop and both sweeps alike — every path by which a
 * container stops being the container these entries name. The processes died
 * with it, so there is nothing to stop; the records are what is left.
 *
 * Returns the ids it forgot, for a caller that has one. The seam's own
 * subscriber ignores them: the container is gone, so its hold went with it
 * (`AgentContainerManager` clears it on the same path) and there is nothing
 * left to release.
 */
export function forgetContainer(containerName: string): string[] {
  const dropped: string[] = []
  for (const { previewId, entry } of listAll()) {
    if (entry.container !== containerName) continue
    previews.delete(previewId)
    dropped.push(previewId)
  }
  return dropped
}

/**
 * Forget every preview whose container is no longer running, and return their
 * ids.
 *
 * It stops nothing. The container going is what took the process with it, so
 * there is nothing left to kill — and exec-ing into a container that has gone
 * is an error, not a cleanup. One inspect per distinct container, not per
 * preview: several previews can share one container, and they share its fate.
 *
 * **It releases no holds, and a caller must not assume it did.** This is the
 * reconciling path, for a container that went without the runtime announcing
 * it — so the hold, if one is still recorded, is the caller's to release with
 * `agentContainerManager.markPreviewEnd(entry.container)` for each id it gets
 * back. It is not done here because this module holds no reference to the
 * runtime's bookkeeping and must not acquire one: the runtime is what calls
 * INTO this module, through the destroy seam, and a call the other way would
 * close the cycle that seam exists to keep open.
 */
export async function sweepGone(deps: { docker: DockerFn }): Promise<string[]> {
  const containers = new Set(listAll().map(p => p.entry.container))
  const running = new Map<string, boolean>()
  for (const container of containers) {
    const up = await deps.docker(['inspect', '--format', '{{.State.Running}}', container])
      .then(r => r.stdout.trim() === 'true')
      .catch(() => false)
    running.set(container, up)
  }

  const dropped: string[] = []
  for (const { previewId, entry } of listAll()) {
    if (running.get(entry.container)) continue
    previews.delete(previewId)
    dropped.push(previewId)
  }
  return dropped
}

/**
 * A destroyed container takes its previews with it.
 *
 * Subscribed once, at module load — `previewMethods.ts` imports this module
 * and `channelMethods.ts` imports that, so it is registered before any
 * container can be removed. A side effect at import is the price of it.
 *
 * What the seam buys is precisely that the runtime holds no DIRECT dependency
 * on the preview modules — not that the module graph is acyclic. It is not:
 * this module's own registration reaches the runtime through the chain above,
 * which already loops back through `hqConnection`/`channelMethods`, and that
 * cycle predates any of this. The eagerness of this subscription quietly
 * relies on it resolving in the order it does today, which is worth knowing
 * before anything here is made lazier.
 */
onContainerDestroyed(forgetContainer)

/** True while a preview is held open for the session: its processes stay past
 *  the conversation's idle time (spec §3), as they did past the old reset. */
export function holdsSession(sessionId: string): boolean {
  return listAll().some(({ entry }) => entry.sessionId === sessionId)
}

addConversationHold(holdsSession)

/** test-only */
export function _reset(): void {
  previews.clear()
}
