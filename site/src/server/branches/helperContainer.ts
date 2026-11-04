/**
 * The commit helper (live preview spec, *Words used*): where the site runs every Git command on a code workspace's
 * repository and its branches' copies, so nothing the site does follows a path an agent can write, and no setting,
 * hook or filter an agent planted runs on the site.
 *
 * One container per operation, removed when it ends. It has no Docker socket, none of the site's environment or
 * credentials, no capability, no new privileges, a read-only root, its own limits and IPv6 off. It has no network
 * unless it pushes to or fetches from GitHub, and then a network of its own like a run's, which the machine's
 * protections for agents cover; hq's token travels on standard input.
 *
 * **What it mounts (adr-0173): only folders whose path no container can change.** The workspace's `main`, from the
 * code space, at `/o/main`. A branch's copy lives in the boundary's `clones/`, so the helper is given the boundary's
 * whole folder at `/o/b` and finds the copy inside it (`/o/b/clones/<id>`): a symbolic link (symlink) a run put on the
 * way is then followed inside the helper, where it reaches only that boundary, never by Docker on this machine. A
 * copy that lives in the site's own data (a live preview's copy of `main`) is mounted as it is, at `/o/clones/<id>`.
 * Each is read-only unless the operation writes it.
 *
 * Every helper runs under the site-wide limit of `helperSlots.ts`, so no storm of requests starts more than a few.
 *
 * Where the site runs agents without containers (development), the same program runs as a Node process of its own
 * on the real paths: there an agent already runs on the machine itself, so a container would protect nothing more.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { agentImageName } from '../../agents/runtime/agentImage'
import { composeProjectLabelArgs, labelKey, siteNamespace } from '../../agents/runtime/containerLabels'
import { ensureAgentNetwork, releaseAgentNetwork } from '../../agents/runtime/containerNetwork'
import { docker } from '../../agents/runtime/containerLifecycle'
import { ipv6OffArgs } from '../../agents/runtime/ipv6Off'
import { hostFigures } from '../host/hostFigures'
import { boundaryCopyOf } from '../storage/paths'
import { GIT_PROGRAM } from './program/program'
import { helperSlots, wroteWorkspace, type Slots } from './helperSlots'

export const HELPER_UID = 1001
const OUTPUT_LIMIT = 16 * 1024 * 1024
/** Where the program stops its own git, ahead of the container's removal. */
const PROGRAM_MARGIN_MS = 2_000

export type HelperMount = { source: string; target: string; readOnly: boolean }

/** One operation's container: what it mounts, whether it reaches GitHub, and how long it has. */
export type HelperSpec = {
  /** The workspace it works for, by id: labels the container and names it. */
  workspaceId: string
  /** The workspace's `main` in the code space, and whether the operation writes it; left out when it needs none. */
  ws?: { dir: string; readOnly: boolean }
  /**
   * A copy the operation reads or writes: one in a boundary's `clones/`, named by the boundary's folder and the copy's
   * id (the boundary is mounted whole), or a folder in the site's own data, by its path.
   */
  copy?: BoundaryCopy | { dir: string; readOnly: boolean }
  /** A Git bundle the operation reads (read-only), and the folder it writes one into: both in the site's own data. */
  bundle?: { file: string }
  out?: { dir: string }
  /**
   * Another fixed program of the site's own to run instead of the Git program (the services file's parser), which
   * reads its folder from `TOOL_ROOT`: the copy's place.
   */
  program?: string
  network: boolean
  timeoutMs: number
}

/** A branch's copy in a boundary: `<boundary>/clones/<copyId>`. */
export type BoundaryCopy = { boundary: string; copyId: string; readOnly: boolean }

const inBoundary = (copy: HelperSpec['copy']): copy is BoundaryCopy => !!copy && 'boundary' in copy

/** A copy given by its path that is a boundary's copy is given as the boundary and the id, whoever built the spec. */
function asGiven(spec: HelperSpec): HelperSpec {
  const copy = spec.copy
  if (!copy || inBoundary(copy)) return spec
  const found = boundaryCopyOf(copy.dir)
  return found ? { ...spec, copy: { boundary: found.boundary, copyId: found.copyId, readOnly: copy.readOnly } } : spec
}

/** Where a copy is on this disk, as the site sees it; for the local program and the site's own records. */
export function copyHostDir(copy: NonNullable<HelperSpec['copy']>): string {
  return inBoundary(copy) ? path.join(copy.boundary, 'clones', copy.copyId) : copy.dir
}

/** What the program answered, or a refusal the helper itself gave. */
export type HelperAnswer = Record<string, unknown> & { refused?: string; detail?: string }

export const helperLabel = () => labelKey('commit-helper')

export function helperName(workspaceId: string, nonce: string): string {
  return `${siteNamespace()}-commit-helper-${workspaceId.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64)}-${nonce}`
}

/**
 * The paths inside the container. `within` is the boundary's folder a copy is found in, which the program checks the
 * copy is still inside; `wsSeen` is where an agent's container has `main` beside the copy, for the copy's relative
 * `alternates`, so they resolve in the agent's container as they did before.
 */
export function containerRoots(given: HelperSpec): { ws?: string; copy?: string; within?: string; wsSeen?: string; bundle?: string; out?: string } {
  const spec = asGiven(given)
  const copy = spec.copy
  return {
    ...(spec.ws ? { ws: '/o/main' } : {}),
    ...(inBoundary(copy)
      ? { copy: `/o/b/clones/${copy.copyId}`, within: '/o/b', wsSeen: `/o/b/workspaces/${spec.workspaceId}` }
      : copy ? { copy: `/o/clones/${path.basename(copy.dir)}` } : {}),
    ...(spec.bundle ? { bundle: '/o/bundle/in.bundle' } : {}),
    ...(spec.out ? { out: '/o/out' } : {}),
  }
}

export function helperMounts(given: HelperSpec): HelperMount[] {
  const spec = asGiven(given)
  const roots = containerRoots(spec)
  const mounts: HelperMount[] = []
  if (spec.ws && roots.ws) mounts.push({ source: spec.ws.dir, target: roots.ws, readOnly: spec.ws.readOnly })
  const copy = spec.copy
  if (inBoundary(copy) && roots.within) mounts.push({ source: copy.boundary, target: roots.within, readOnly: copy.readOnly })
  else if (copy && !inBoundary(copy) && roots.copy) mounts.push({ source: copy.dir, target: roots.copy, readOnly: copy.readOnly })
  if (spec.bundle && roots.bundle) mounts.push({ source: spec.bundle.file, target: roots.bundle, readOnly: true })
  if (spec.out && roots.out) mounts.push({ source: spec.out.dir, target: roots.out, readOnly: false })
  return mounts
}

export function buildHelperArgs(spec: HelperSpec, name: string, network: string): string[] {
  const mounts = helperMounts(spec).flatMap(m => ['--mount', `type=bind,source=${m.source},target=${m.target}${m.readOnly ? ',readonly' : ''}`])
  return [
    'run', '--rm', '-i',
    '--name', name,
    '--label', `${helperLabel()}=${spec.workspaceId}`,
    ...composeProjectLabelArgs('commit-helper'),
    '--user', `${HELPER_UID}:${HELPER_UID}`,
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    ...ipv6OffArgs(),
    '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=512m,mode=1777',
    '--memory', '1g', '--memory-swap', '1g',
    '--pids-limit', '256',
    '--cpus', '1',
    '--log-driver', 'none',
    '--restart', 'no',
    '--init',
    '--network', network,
    '--workdir', '/tmp',
    '--env', `TOOL_DEADLINE=${Date.now() + spec.timeoutMs - PROGRAM_MARGIN_MS}`,
    ...(spec.program && containerRoots(spec).copy ? ['--env', `TOOL_ROOT=${containerRoots(spec).copy}`] : []),
    ...mounts,
    '--entrypoint', '/usr/local/bin/node',
    agentImageName(),
    '-e', spec.program ?? GIT_PROGRAM,
  ]
}

export type HelperDeps = {
  /** Whether Git runs in a container (agents do), or as a process of the site's own (development). */
  contained: () => boolean
  spawnDocker: (args: string[]) => ChildProcess
  spawnLocal: (env: Record<string, string>, program?: string) => ChildProcess
  removeContainer: (name: string) => Promise<unknown>
  network: { ensure: (name: string) => Promise<string>; release: (name: string) => void }
  nonce: () => string
  /** Null when the host service's network protections for agents hold now; otherwise what is wrong. */
  protectionsProblem: () => Promise<string | null>
  /** The site-wide limit every helper runs under (`helperSlots.ts`). */
  slots: Slots
  /** Whether a folder the helper is to mount is there: Docker would make a missing source, root-owned. */
  folderThere: (dir: string) => Promise<boolean>
}

export const helperDeps: HelperDeps = {
  contained: () => process.env.AGENT_CONTAINER_ISOLATION === 'true',
  // The docker client's own environment; nothing of it reaches the container, which is given one `--env` only.
  spawnDocker: args => spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] }),
  spawnLocal: (env, program) => spawn(process.execPath, ['-e', program ?? GIT_PROGRAM], { stdio: ['pipe', 'pipe', 'pipe'], env, cwd: env.TOOL_TMP }),
  removeContainer: name => docker(['rm', '-f', name]).catch(() => null),
  network: { ensure: ensureAgentNetwork, release: releaseAgentNetwork },
  nonce: () => Math.random().toString(36).slice(2, 10),
  protectionsProblem: () => hostFigures.protectionsProblem(),
  slots: helperSlots,
  folderThere: dir => fs.stat(dir).then(st => st.isDirectory(), () => false),
}

/** Runs one operation of the program and returns its answer. */
export async function runHelper(given: HelperSpec, request: Record<string, unknown>, deps: HelperDeps = helperDeps): Promise<HelperAnswer> {
  const spec = asGiven(given)
  // A workspace with no `main` in the code space is not a repository; Docker would make a missing source root-owned.
  if (spec.ws && !(await deps.folderThere(spec.ws.dir))) return { refused: 'not_repository' }
  const writes = !!spec.ws && !spec.ws.readOnly
  const asked = Date.now()
  // A helper waits at most half its budget for a slot; what it waited comes off its own run, so the whole stays within
  // the budget the caller counts on.
  const release = await deps.slots.acquire(Math.floor(spec.timeoutMs / 2))
  if (!release) return { refused: 'busy', detail: `no commit helper came free within ${Math.floor(spec.timeoutMs / 2)} ms` }
  if (writes) wroteWorkspace(spec.workspaceId)
  try {
    return await runAdmitted({ ...spec, timeoutMs: spec.timeoutMs - (Date.now() - asked) }, request, deps)
  } finally {
    if (writes) wroteWorkspace(spec.workspaceId)
    release()
  }
}

async function runAdmitted(spec: HelperSpec, request: Record<string, unknown>, deps: HelperDeps): Promise<HelperAnswer> {
  if (!deps.contained()) return runLocal(spec, request, deps)
  if (spec.network) {
    const problem = await deps.protectionsProblem().catch(() => 'The machine\'s network protections could not be checked.')
    if (problem) return { refused: 'protections', detail: problem }
  }
  const name = helperName(spec.workspaceId, deps.nonce())
  const network = spec.network ? await deps.network.ensure(name) : 'none'
  try {
    const child = deps.spawnDocker(buildHelperArgs(spec, name, network))
    return await collect(child, { ...request, roots: containerRoots(spec) }, spec.timeoutMs, () => {
      void deps.removeContainer(name)
    })
  } finally {
    if (spec.network) deps.network.release(name)
  }
}

async function runLocal(spec: HelperSpec, request: Record<string, unknown>, deps: HelperDeps): Promise<HelperAnswer> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'commit-helper-'))
  try {
    const child = deps.spawnLocal({
      TOOL_GIT: 'git', TOOL_PATH: process.env.PATH ?? '/usr/bin:/bin', TOOL_TMP: tmp,
      TOOL_DEADLINE: String(Date.now() + spec.timeoutMs - PROGRAM_MARGIN_MS),
      ...(spec.program && spec.copy ? { TOOL_ROOT: copyHostDir(spec.copy) } : {}),
    }, spec.program)
    const roots = {
      ...(spec.ws ? { ws: spec.ws.dir } : {}),
      ...(spec.copy ? { copy: copyHostDir(spec.copy) } : {}),
      ...(inBoundary(spec.copy) ? { within: spec.copy.boundary } : {}),
      ...(spec.bundle ? { bundle: spec.bundle.file } : {}), ...(spec.out ? { out: spec.out.dir } : {}),
    }
    return await collect(child, { ...request, roots }, spec.timeoutMs, () => {})
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

function collect(child: ChildProcess, request: Record<string, unknown>, timeoutMs: number, onTimeout: () => void): Promise<HelperAnswer> {
  return new Promise<HelperAnswer>(resolve => {
    let out = ''
    let err = ''
    let settled = false
    const finish = (answer: HelperAnswer) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(answer)
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      onTimeout()
      finish({ refused: 'timedOut', detail: '' })
    }, timeoutMs)
    child.stdout?.setEncoding('utf8').on('data', (d: string) => { if (out.length < OUTPUT_LIMIT) out += d })
    child.stderr?.setEncoding('utf8').on('data', (d: string) => { if (err.length < 8192) err += d })
    child.on('error', e => finish({ refused: 'helperFailed', detail: e.message }))
    child.on('close', () => finish(parseAnswer(out, err)))
    child.stdin?.on('error', () => {})
    child.stdin?.end(JSON.stringify(request))
  })
}

export function parseAnswer(out: string, err: string): HelperAnswer {
  const last = out.trim().split('\n').pop() ?? ''
  try {
    const parsed: unknown = JSON.parse(last)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as HelperAnswer
  } catch {
    // Not an answer: the container failed before the program spoke.
  }
  return { refused: 'helperFailed', detail: err.slice(-1000) }
}
