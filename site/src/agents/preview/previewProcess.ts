/**
 * A preview is a process inside an existing container of its boundary (ADR-0063):
 * the one belonging to the runner the preview's session runs for (ADR-0074) —
 * the caller derives that runner, and this module looks for that container and
 * no other. A preview command runs with the whole container, that runner's
 * private harness home included, so it must never land in another person's.
 *
 * Never a second container, and never a second mount of the same files: the
 * dev server has to serve exactly what the run sees, and a preview-shaped
 * container would put a per-preview component back into a mount signature —
 * which is how two agents in one project end up evicting each other.
 *
 * This module therefore only ever `exec`s. If the boundary has no running
 * container it REFUSES, with the reason. Creating one here would be a
 * container built from a preview's parameters rather than from a run's
 * verified capability, which is precisely the thing the boundary key exists to
 * prevent.
 *
 * Both candidate names are tried — a runner holds at most two containers in a
 * boundary, one per bind mode — and whichever is running wins. A run's mode is not
 * knowable from a preview's parameters and must not be guessed at: asking
 * docker which one exists is the honest form of the question.
 *
 * ## How the process is found again
 *
 * The launch records the SESSION id of what it started, and the stop kills
 * that session. Not a pattern over the command line, which was the obvious
 * design and does not work in this image:
 *
 *  - busybox `sh -lc '<one command>'` execs the command in place, so any
 *    marker the launch put in the shell's argv is gone from the process that
 *    actually runs; and
 *  - a `pkill -f <marker>` issued through `sh -lc` matches the marker in its
 *    OWN argv and kills itself, reporting success while the dev server carries
 *    on.
 *
 * `setsid` puts the launch in a session of its own, so the recorded id names
 * the dev server and every child it spawns and nothing else — which is what
 * "stop the preview" has to mean for a dev server that forks.
 */
import { execFile } from 'node:child_process'
import { PreviewError } from '@agenthix/core'
import { agentContainerManager } from '../runtime/AgentContainerManager'
import type { CapabilityRunner } from '@agenthix/core'
import type { StorageBoundaryKey } from '../runtime/containerTypes'
import { previewRelayArgs } from './relayScript'

export type DockerFn = (args: string[]) => Promise<{ stdout: string; stderr: string }>

/** The bind modes a boundary can hold a container in, most likely first: a
 *  preview is for work somebody is doing, and work that writes is read-write. */
const BIND_MODES: StorageBoundaryKey['mode'][] = ['rw', 'ro']

/** Matches what the old hq-side manager waited before giving up — 60 s. */
const DEFAULT_READY_TRIES = 60
const DEFAULT_READY_INTERVAL_MS = 1000

/** How much of the command's own output a failure carries back. */
const LOG_TAIL_LINES = 40

const defaultDocker: DockerFn = (args) =>
  new Promise((resolve, reject) =>
    execFile('docker', args, (err, stdout, stderr) => (err ? reject(err) : resolve({ stdout, stderr }))))

export interface StartPreviewProcessInput {
  /** Minted by the site, because it identifies a process in one of this site's containers. */
  previewId: string
  /** The boundary whose container holds the files. Nothing here creates one. */
  location: { ownerType: StorageBoundaryKey['ownerType']; ownerId: string }
  /** Whose container in that boundary: the runner the preview's session runs for. */
  runner: CapabilityRunner
  /** The container-side directory the command runs in — the same one a run in this location gets. */
  cwd: string
  command: string
  port: number
}

export interface PreviewProcessDeps {
  docker?: DockerFn
  /** Answers "is the port open inside the container yet". */
  probe?: (container: string, port: number) => Promise<boolean>
  readyTries?: number
  readyIntervalMs?: number
  /**
   * Called the moment the container is known and BEFORE anything is started in
   * it — which is the only point at which a caller can hold it.
   *
   * Readiness can take a minute, and for that whole minute the container is
   * carrying a preview that is starting. A caller told only on success would
   * have nothing held during it, and an idle sweep would take the container
   * out from under the very thing it is waiting for — leaving a refusal with
   * no output in it, because the log read would exec into a container that had
   * gone. So the caller is told early and releases on failure, rather than
   * told late and never having held it at all.
   */
  onContainerResolved?: (container: string) => void | Promise<void>
}

export interface StartPreviewProcessResult {
  container: string
}

/** Both files live in the container's own /tmp, which the container's writable
 *  layer owns — never in a mounted location, where they would become a file in
 *  somebody's project. */
function logPath(previewId: string): string {
  return `/tmp/agenthix-preview-${previewId}.log`
}

function sessionPath(previewId: string): string {
  return `/tmp/agenthix-preview-${previewId}.sid`
}

async function isRunning(docker: DockerFn, name: string): Promise<boolean> {
  try {
    const { stdout } = await docker(['inspect', '--format', '{{.State.Running}}', name])
    return stdout.trim() === 'true'
  } catch {
    // `inspect` fails when no such container exists, which is the common case
    // for the mode this boundary is not currently using.
    return false
  }
}

/**
 * Which of this runner's two possible containers in the boundary is up, or
 * null. Never another runner's: if theirs is not running, there is none.
 *
 * Exported because the stop path and the connect handler need the same answer
 * about the same boundary, and re-deriving a container name is how two callers
 * end up exec-ing into different ones.
 */
export async function findBoundaryContainer(
  location: StartPreviewProcessInput['location'],
  runner: CapabilityRunner,
  docker: DockerFn = defaultDocker,
): Promise<string | null> {
  for (const mode of BIND_MODES) {
    const name = agentContainerManager.containerName({
      scope: 'storage',
      ownerType: location.ownerType,
      ownerId: location.ownerId,
      mode,
      runner,
    })
    if (await isRunning(docker, name)) return name
  }
  return null
}

/**
 * The script the launch runs.
 *
 * It records its own session id first, then redirects its own output for the
 * rest of the script — `exec >file` without a command redirects the shell
 * rather than replacing it, so the command that follows may be anything a
 * person would type, including a compound one, and still be captured.
 */
function launchScript(previewId: string, command: string): string {
  return [
    `echo $$ > ${sessionPath(previewId)}`,
    `exec >> ${logPath(previewId)} 2>&1`,
    command,
  ].join('\n')
}

/**
 * The script the stop runs.
 *
 * Guarded on the recorded id being digits: an empty or missing file would
 * otherwise become `pkill -s ''`, which busybox reads as the CURRENT session —
 * this exec's own — so the guard is what keeps a stop for a preview that never
 * started from being a stop for whatever else is in there.
 */
function stopScript(previewId: string): string {
  return [
    `sid=$(cat ${sessionPath(previewId)} 2>/dev/null)`,
    // The tidy-up lives INSIDE the branch that found a session, and that is
    // not neatness. A stop racing a launch that has not written the file yet
    // would otherwise delete it the moment it appeared, destroying the only
    // handle by which that process could ever be killed.
    `case "$sid" in`,
    `  ''|*[!0-9]*) ;;`,
    `  *) pkill -s "$sid" || true; rm -f ${sessionPath(previewId)} ${logPath(previewId)} ;;`,
    `esac`,
  ].join('\n')
}

/**
 * Whether the port answers, asked from inside the container.
 *
 * `docker exec` without `-i` gives the relay no stdin, so a successful
 * connection ends immediately and exits 0 while a refused one exits 1 — the
 * exit status is the whole answer. It runs the same relay the byte stream
 * uses, so a preview reported ready is one that path can actually reach.
 */
function defaultProbe(docker: DockerFn): (container: string, port: number) => Promise<boolean> {
  return async (container, port) =>
    docker(['exec', container, ...previewRelayArgs(port)]).then(() => true).catch(() => false)
}

/** Best-effort: a preview that failed without writing anything still has to
 *  fail with a message, so an unreadable log is an empty one. */
async function readLogTail(docker: DockerFn, container: string, previewId: string): Promise<string> {
  try {
    const { stdout, stderr } = await docker(['exec', container, 'cat', logPath(previewId)])
    return [stdout, stderr].filter(Boolean).join('\n').trim().split('\n').slice(-LOG_TAIL_LINES).join('\n')
  } catch {
    return ''
  }
}

export async function startPreviewProcess(
  input: StartPreviewProcessInput,
  deps: PreviewProcessDeps = {},
): Promise<StartPreviewProcessResult> {
  const docker = deps.docker ?? defaultDocker
  const probe = deps.probe ?? defaultProbe(docker)
  const tries = deps.readyTries ?? DEFAULT_READY_TRIES
  const intervalMs = deps.readyIntervalMs ?? DEFAULT_READY_INTERVAL_MS

  const container = await findBoundaryContainer(input.location, input.runner, docker)
  if (container) await deps.onContainerResolved?.(container)
  if (!container) {
    // The refusal carries the vocabulary's own code from here rather than
    // being recognised by its wording further up: a handler matching on prose
    // is a handler that reports the wrong thing the day the prose is edited.
    throw new PreviewError(
      'no_container',
      `No running container for ${input.location.ownerType} ${input.location.ownerId} — ` +
      "a preview runs inside the container its session's runs use, and that one is not up",
    )
  }

  await docker([
    'exec', '-d', '-w', input.cwd, container,
    'setsid', 'sh', '-lc', launchScript(input.previewId, input.command),
  ])

  for (let i = 0; i < tries; i++) {
    if (await probe(container, input.port)) return { container }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  // A silent "did not become ready" is what made this feature hard to use
  // before. The command's own output is the whole difference between a
  // preview somebody can fix and one they cannot.
  const tail = await readLogTail(docker, container, input.previewId)
  await stopPreviewProcess({ container, previewId: input.previewId }, { docker })
  throw new PreviewError(
    'not_ready',
    `The preview command did not open port ${input.port} within ` +
    `${Math.round((tries * intervalMs) / 1000)}s.` +
    (tail ? `\n--- the command's own output ---\n${tail}` : ''),
  )
}

/**
 * Stop the process and leave the container alone.
 *
 * Never `docker rm`, `docker stop` or `docker kill`: the container belongs to
 * the boundary and outlives every preview in it. Never throws either — hq
 * calls this on a sweep, and a container that has already gone is the expected
 * case rather than a failure.
 */
export async function stopPreviewProcess(
  target: { container: string; previewId: string },
  deps: Pick<PreviewProcessDeps, 'docker'> = {},
): Promise<void> {
  const docker = deps.docker ?? defaultDocker
  await docker(['exec', target.container, 'sh', '-lc', stopScript(target.previewId)]).catch(() => undefined)
}
