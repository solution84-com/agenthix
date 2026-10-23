/**
 * What hq may ask this site to do about a preview — a dev server somebody is
 * watching in a browser (ADR-0051: a closed set of named methods, never a
 * generic relay). One function per control-channel `PREVIEW_METHODS` entry,
 * registered in `./channelMethods.ts`; the byte stream that reaches a running
 * preview is `PREVIEW_METHODS.connect` and belongs on the content transport,
 * not here.
 *
 * ## The site mints the id, and the site resolves the directory
 *
 * The id names a process inside one of this site's containers, so this site is
 * what can name it. The working directory is resolved here too, from the
 * location. It has to be the SAME path a run in this location gets, which is
 * why it goes through `resolvePrimaryContainerDir` rather than being assembled
 * here. Container paths are ids (ADR-0074), so the owner slug hq still sends
 * plays no part in it.
 *
 * ## Whose container
 *
 * A project holds a container per runner — one per member, one for the
 * project's own runs (ADR-0074) — and a preview command runs with the whole of
 * the container it is started in, that runner's private harness home included.
 * So it runs only in the container of the runner the preview's SESSION runs
 * for, derived from this site's own copy of that session by the rule the runner
 * claim follows: a chat's person, the project for anything else in a project —
 * except a task in a person's personal project, which ran in that person's
 * container (hq names them, `personalOwnerId`) — and the owner in a person's
 * own storage. Never another runner's container, and
 * never a fallback to one: a session this site does not hold, or one that does
 * not work in the location named, is refused.
 *
 * ## The site never asks who is calling
 *
 * Neither params shape carries a user id. hq settles who may watch a preview
 * before it asks, and per ADR-0042 this site has no identity store to
 * re-derive that from.
 *
 * ## Params arrive as `unknown`
 *
 * hq is the only caller and it is trusted, but the JSON still comes off a
 * socket, so each function validates its own shape INSIDE the guard — a parse
 * that threw outside it would cross the channel as a raw zod blob rather than
 * as this vocabulary's `invalid`. The `Exact` assertions pin the schemas to
 * core's types, and vitest transpiles those away, so `npx tsc --noEmit` is not
 * optional for this module.
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '#db'
import {
  PREVIEW_METHODS,
  PreviewError,
  WORKSPACE_OWNER_TYPES,
  runnerBoundaryMismatch,
  type CapabilityRunner,
  type Exact,
  type PreviewStartParams,
  type PreviewStartResult,
  type PreviewStopParams,
  type PreviewStopResult,
  type LocationRef as WireLocationRef,
} from '@agenthix/core'
import { agentContainerManager } from '../../agents/runtime/AgentContainerManager'
import { resolvePrimaryContainerDir } from '../../agents/runtime/locationResolver'
import { resolvePrimaryLocation } from '../storage/primaryLocationService'
import { startPreviewProcess, stopPreviewProcess } from '../../agents/preview/previewProcess'
import * as registryModule from '../../agents/preview/previewRegistry'
import { Logger } from '../utils/logger'

const logger = new Logger('preview')

const locRefSchema = z
  .object({
    ownerType: z.enum(WORKSPACE_OWNER_TYPES),
    ownerId: z.string().min(1),
    workspaceId: z.string().nullish(),
    taskId: z.string().nullish(),
  })

const previewStartParams = z
  .object({
    location: locRefSchema,
    ownerSlug: z.string().min(1),
    sessionId: z.string().min(1),
    command: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    personalOwnerId: z.string().min(1).max(100).optional(),
  })

const previewStopParams = z.object({ previewId: z.string().min(1) })

/**
 * Pinned against CORE's shapes, not this app's own — the wire is core's
 * declaration, and a field added there would otherwise be silently dropped
 * at runtime by these schemas with everything still compiling.
 */
const _wireMirrorsCore: [
  Exact<z.infer<typeof locRefSchema>, WireLocationRef>,
  Exact<z.infer<typeof previewStartParams>, PreviewStartParams>,
  Exact<z.infer<typeof previewStopParams>, PreviewStopParams>,
] = [true, true, true]
void _wireMirrorsCore

/** Anything that is not already one of ours becomes `invalid` — a shape this
 *  method does not accept is hq's bug or a version skew, and either way the
 *  detail names the method rather than quoting a parser. */
function parseParams<T>(schema: z.ZodType<T>, params: unknown, method: string): T {
  const parsed = schema.safeParse(params)
  if (!parsed.success) {
    throw new PreviewError('invalid', `${method} was called with parameters it does not accept`)
  }
  return parsed.data
}

/**
 * What this module reaches for, named so a test can stand in for it.
 *
 * The registry and the hold marks are process-wide singletons, which is
 * correct for a site — there is one container runtime — and untestable as a
 * direct import. They come in here instead, defaulted to the real ones, so a
 * handler test can watch what the handler did to them without the module
 * graph having to be torn apart.
 */
export interface PreviewMethodDeps {
  registry: Pick<typeof registryModule, 'register' | 'get' | 'remove'>
  markPreviewStart: (container: string) => void
  markPreviewEnd: (container: string) => void
  startProcess: typeof startPreviewProcess
  stopProcess: typeof stopPreviewProcess
}

const realDeps: PreviewMethodDeps = {
  registry: registryModule,
  markPreviewStart: (container) => agentContainerManager.markPreviewStart(container),
  markPreviewEnd: (container) => agentContainerManager.markPreviewEnd(container),
  startProcess: startPreviewProcess,
  stopProcess: stopPreviewProcess,
}

/**
 * The container-side directory the preview runs in: the same one a run in this
 * location gets.
 *
 * The workspace is looked up on this site's rows — hq holds none — SCOPED to
 * the owner, as the run path's is. An id that exists but belongs to someone
 * else must read as absent here, or this is a way to ask about another owner's
 * storage.
 *
 * Every refusal it raises is `invalid`: each one is hq naming a location this
 * site cannot resolve, which is what that code means. `resolvePrimaryContainerDir`
 * raises a plain error of its own for a task location in storage that holds no
 * tasks — the same kind of thing, so it is caught and recoded rather than
 * escaping as a fault.
 */
async function resolveCwd(loc: PreviewStartParams['location'], method: string): Promise<string> {
  if (loc.workspaceId) {
    const ws = await prisma.workspace.findFirst({
      where: { id: loc.workspaceId, ownerType: loc.ownerType, ownerId: loc.ownerId },
      select: { id: true, name: true },
    })
    if (!ws) {
      throw new PreviewError('invalid', `${method} names a workspace this site does not have in that location`)
    }
  }
  try {
    return resolvePrimaryContainerDir(loc)
  } catch (err) {
    // Recoded because this is hq naming a location this site cannot resolve,
    // which is what `invalid` means. A programming fault in there would be
    // recoded too, so the reason is written to this site's own log before it
    // is dropped: an operator standing in front of the machine is who that log
    // is for, and a refusal that names a path on this disk is not something to
    // send hq.
    logger.warn(
      `[preview] ${method} could not resolve a directory for ${loc.ownerType} ${loc.ownerId}: ` +
      (err instanceof Error ? err.message : String(err)),
    )
    throw new PreviewError('invalid', `${method} names a location this site cannot resolve a directory for`)
  }
}

/**
 * Whose container the preview runs in — see "Whose container" above. Refuses
 * with `invalid` rather than choosing some other runner's container.
 */
async function resolvePreviewRunner(
  loc: PreviewStartParams['location'],
  sessionId: string,
  personalOwnerId: string | undefined,
  method: string,
): Promise<CapabilityRunner> {
  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    select: {
      primaryOwnerType: true, primaryOwnerId: true, primaryWorkspaceId: true,
      taskId: true, userId: true, sessionType: true,
    },
  })
  const storage = session ? resolvePrimaryLocation(session) : null
  if (!session || !storage || storage.ownerType !== loc.ownerType || storage.ownerId !== loc.ownerId) {
    throw new PreviewError('invalid', `${method} names a session that does not work in that location`)
  }
  const personalProject = storage.ownerType === 'project' && personalOwnerId ? personalOwnerId : null
  const runner: CapabilityRunner =
    storage.ownerType === 'user' ? { kind: 'person', userId: storage.ownerId }
    : session.sessionType === 'chat' ? { kind: 'person', userId: session.userId }
    : personalProject ? { kind: 'person', userId: personalProject }
    : { kind: 'project', projectId: storage.ownerId }
  const mismatch = runnerBoundaryMismatch({
    runner,
    storage: { ownerType: storage.ownerType, ownerId: storage.ownerId, ...(personalProject ? { personalOwnerId: personalProject } : {}) },
    sessionType: session.sessionType,
    invokerUserId: session.userId,
  })
  if (mismatch) throw new PreviewError('invalid', `${method} names a session whose runner does not fit that location`)
  return runner
}

/**
 * Start a dev server inside the container this boundary already has.
 *
 * Nothing here creates a container, and the refusal when there is none is the
 * point rather than a gap — see `previewProcess.ts` for why a preview-shaped
 * container is the one thing that must never exist.
 *
 * The hold is taken the moment the container is KNOWN, before anything is
 * started in it, and released in `finally` on every path that does not end
 * with a registered preview. Taken on success instead, it would leave the
 * whole readiness wait — up to a minute — with the container unheld and
 * nothing touching its activity, so an idle sweep could remove the container
 * the preview is starting in and the refusal would come back with no output in
 * it. Taken early without the release, a failed start would hold a container
 * open forever. Both halves, or neither works.
 */
export async function previewStart(params: unknown, deps: PreviewMethodDeps = realDeps): Promise<PreviewStartResult> {
  const method = PREVIEW_METHODS.start
  const { location, sessionId, command, port, personalOwnerId } = parseParams(previewStartParams, params, method)
  const previewId = randomUUID()
  let held: string | null = null
  try {
    const cwd = await resolveCwd(location, method)
    const runner = await resolvePreviewRunner(location, sessionId, personalOwnerId, method)
    const { container } = await deps.startProcess(
      { previewId, location, runner, cwd, command, port },
      {
        onContainerResolved: (name) => {
          // The hold keeps either sweep off the container while the preview starts.
          held = name
          deps.markPreviewStart(name)
        },
      },
    )
    deps.registry.register({ previewId, container, port, sessionId })
    // The hold now belongs to the registered preview, and `preview.stop` is
    // what releases it.
    held = null
    return { previewId }
  } catch (err) {
    // `previewProcess` already raises this vocabulary's own codes for the two
    // outcomes hq has to tell apart. Anything else is docker or this site
    // failing, whose reason may name a path on this disk — it goes to the
    // local log and the caller gets the code alone.
    if (err instanceof PreviewError) throw err
    logger.warn(
      `[preview] ${method} failed for ${location.ownerType} ${location.ownerId}: ` +
      (err instanceof Error ? err.message : String(err)),
    )
    throw new PreviewError('exec_failed', `${method} could not start a preview in that location`)
  } finally {
    if (held !== null) deps.markPreviewEnd(held)
  }
}

/**
 * Stop one, and let the container carry on.
 *
 * Idempotent by design: hq calls this on a sweep, and an id this site does not
 * know is the expected case — the container was swept, or this site restarted
 * — not a failure. So an unknown id answers `{ stopped: false }`.
 *
 * The registry's own `remove` is what decides whether this call is the one
 * doing the stopping, and it is consulted BEFORE the await rather than after.
 * Two stops for one id can overlap — hq's sweep firing while the person closes
 * the tab — and both would pass a mere `get`, both reach the release, and the
 * count would fall by two. With two previews in one container that takes it to
 * zero and the SURVIVING preview loses its hold. `Math.max(0, …)` keeps the
 * number sane and cannot help with this; the boolean can, because only one
 * caller can be the one that removed the entry.
 */
export async function previewStop(params: unknown, deps: PreviewMethodDeps = realDeps): Promise<PreviewStopResult> {
  const method = PREVIEW_METHODS.stop
  const { previewId } = parseParams(previewStopParams, params, method)
  const entry = deps.registry.get(previewId)
  if (!entry) return { stopped: false }
  if (!deps.registry.remove(previewId)) return { stopped: false }

  await deps.stopProcess({ container: entry.container, previewId })
  deps.markPreviewEnd(entry.container)
  return { stopped: true }
}
