/**
 * Running a program in a live preview's container, addressed by the container's id once it is checked against its
 * template. Two ways, and only these:
 * - `execInPreview` / `spawnInPreview`: an app's, a service's or an install's command, always through the sandbox
 *   launcher as the image's user, in a working folder inside the copy. The launcher keeps its signals inside its own
 *   sandbox, so nothing an app runs can stop the site's own helpers.
 * - `helperInPreview` / `spawnHelper`: one of the site's fixed scripts (the guard's look and kill, the app forwarder,
 *   the secrets' hand-off),
 *   outside the launcher because they must see every process. Each reads only what the kernel answers, and never runs
 *   or opens for its content anything in the copy.
 * Values for the environment reach the docker client by name, never on its command line. Output is capped.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { COMMAND_LAUNCHER_PATH, HARNESS_SECRET_ENV } from '../../../agents/runtime/agentImage'
import { runningContainer } from './container'
import { LIVE_PREVIEW_USER } from './template'

export const EXEC_TIMEOUT_MS = 10 * 60 * 1000
export const EXEC_OUTPUT_BYTES = 1024 * 1024
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
/** The docker client's own: which `docker` runs, where it connects, what it loads. A caller's variables never set these. */
const CLIENT_ENV = /^(PATH|DOCKER_.*|LD_.*)$/

export type PreviewExecOptions = { cwd: string; env?: Record<string, string>; stdin?: Uint8Array; timeoutMs?: number; signal?: AbortSignal }
export type PreviewExecResult = { exitCode: number; stdout: string; stderr: string }
/** A program left running: `exited` gives its exit code; `detach` lets go of its output only. */
export type PreviewSpawned = {
  exited: Promise<number>
  detach(): void
  stdin: NodeJS.WritableStream | null
  stdout: NodeJS.ReadableStream | null
  stderr: NodeJS.ReadableStream | null
}

/** A working folder inside `root`, or null. */
export function cwdInside(root: string, cwd: string): string | null {
  if (!path.posix.isAbsolute(cwd) || cwd.includes('\0')) return null
  const normal = path.posix.normalize(cwd)
  return normal === root || normal.startsWith(`${root}/`) ? normal : null
}

function checkArgv(argv: string[]): void {
  if (argv.length === 0 || argv.some(a => typeof a !== 'string' || a.includes('\0'))) {
    throw new Error('Refusing to run nothing, or an argument with a NUL, in a live preview')
  }
}

function envNames(env: Record<string, string> | undefined): string[] {
  const names = Object.keys(env ?? {})
  const bad = names.find(n => !ENV_NAME.test(n) || CLIENT_ENV.test(n) || HARNESS_SECRET_ENV.includes(n))
  if (bad !== undefined) throw new Error(`Refusing the environment variable ${JSON.stringify(bad)} in a live preview`)
  return names
}

/** `docker exec`'s arguments for a contained command: the launcher first, then the program. Pure. */
export function launcherExecArgs(containerId: string, root: string, argv: string[], opts: PreviewExecOptions): string[] {
  checkArgv(argv)
  const cwd = cwdInside(root, opts.cwd)
  if (!cwd) throw new Error('Refusing a working folder outside the live preview\'s copy')
  return [
    'exec', ...(opts.stdin ? ['-i'] : []), '-u', LIVE_PREVIEW_USER, '-w', cwd,
    ...envNames(opts.env).flatMap(n => ['-e', n]),
    containerId, COMMAND_LAUNCHER_PATH, ...argv,
  ]
}

/** `docker exec`'s arguments for one of the site's fixed helpers: from `/`, as the image's user, no environment. Pure. */
export function helperExecArgs(containerId: string, argv: string[], interactive = false): string[] {
  checkArgv(argv)
  return ['exec', ...(interactive ? ['-i'] : []), '-u', LIVE_PREVIEW_USER, '-w', '/', containerId, ...argv]
}

function spawnDocker(args: string[], env: Record<string, string> | undefined, stdin: boolean): ChildProcess {
  return spawn('docker', args, {
    env: { PATH: process.env.PATH ?? '', ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}), ...env },
    stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  })
}

function collect(child: ChildProcess, opts: { stdin?: Uint8Array; timeoutMs?: number; signal?: AbortSignal }): Promise<PreviewExecResult> {
  return new Promise((resolve, reject) => {
    const out = { stdout: '', stderr: '' }
    const take = (which: 'stdout' | 'stderr') => (chunk: Buffer) => {
      if (out[which].length < EXEC_OUTPUT_BYTES) out[which] += chunk.toString('utf8').slice(0, EXEC_OUTPUT_BYTES - out[which].length)
    }
    child.stdout?.on('data', take('stdout'))
    child.stderr?.on('data', take('stderr'))
    const end = () => child.kill('SIGKILL')
    const timer = setTimeout(end, opts.timeoutMs ?? EXEC_TIMEOUT_MS)
    opts.signal?.addEventListener('abort', end, { once: true })
    child.on('error', err => { clearTimeout(timer); reject(err) })
    child.on('close', code => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', end)
      resolve({ exitCode: code ?? -1, ...out })
    })
    if (opts.stdin && child.stdin) child.stdin.end(Buffer.from(opts.stdin))
  })
}

function spawned(child: ChildProcess, onOutput?: (chunk: string) => void): PreviewSpawned {
  if (onOutput) {
    child.stdout?.setEncoding('utf8').on('data', onOutput)
    child.stderr?.setEncoding('utf8').on('data', onOutput)
  }
  const exited = new Promise<number>(resolve => {
    child.on('error', () => resolve(-1))
    child.on('close', code => resolve(code ?? -1))
  })
  return {
    exited, detach: () => { child.kill('SIGKILL') }, stdin: child.stdin,
    stdout: onOutput ? null : child.stdout, stderr: onOutput ? null : child.stderr,
  }
}

/**
 * A contained command in an agent's own container, by its name: `install_packages` for a run in a branch's copy with
 * no live preview open. The same launcher, user and checks as a live preview's; the caller names the container and the
 * copy's folder in it from the run's own record, never from the agent.
 */
export function execInAgentContainer(containerName: string, root: string, argv: string[], opts: PreviewExecOptions): Promise<PreviewExecResult> {
  return collect(spawnDocker(launcherExecArgs(containerName, root, argv, opts), opts.env, !!opts.stdin), opts)
}

export async function execInPreview(id: string, root: string, argv: string[], opts: PreviewExecOptions): Promise<PreviewExecResult> {
  const containerId = await runningContainer(id)
  return collect(spawnDocker(launcherExecArgs(containerId, root, argv, opts), opts.env, !!opts.stdin), opts)
}

/** Starts a contained command and leaves it running: an app's. Ending the docker client does not end it. */
export async function spawnInPreview(
  id: string, root: string, argv: string[], opts: Omit<PreviewExecOptions, 'stdin' | 'timeoutMs' | 'signal'>, onOutput: (chunk: string) => void,
): Promise<PreviewSpawned> {
  const containerId = await runningContainer(id)
  return spawned(spawnDocker(launcherExecArgs(containerId, root, argv, opts), opts.env, false), onOutput)
}

/** `stdin`, when given, is the helper's whole standard input: how the secrets' helper is handed its values. */
export async function helperInPreview(id: string, argv: string[], timeoutMs: number, stdin?: Uint8Array): Promise<PreviewExecResult> {
  const containerId = await runningContainer(id)
  return collect(spawnDocker(helperExecArgs(containerId, argv, !!stdin), undefined, !!stdin), { timeoutMs, stdin })
}

/** One of the site's helpers left running, with its standard input and output: the app forwarder. */
export async function spawnHelper(id: string, argv: string[]): Promise<PreviewSpawned> {
  const containerId = await runningContainer(id)
  return spawned(spawnDocker(helperExecArgs(containerId, argv, true), undefined, true))
}
