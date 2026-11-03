import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ClaudeLoginCancelResult, ClaudeLoginFinishResult, ClaudeLoginStartResult } from '@agenthix/core'
import { dockerWithin } from '../../agents/runtime/containerLifecycle'
import { AGENT_CONTAINER_CLAUDE_HOME, getSiteRoot } from '../../agents/agentDiskPaths'
import { agentImageName } from '../../agents/runtime/agentImage'
import { ensureAgentNetwork, releaseAgentNetwork } from '../../agents/runtime/containerNetwork'
import { ipv6OffArgs } from '../../agents/runtime/ipv6Off'
import { composeProjectLabelArgs, siteNamespace } from '../../agents/runtime/containerLabels'
import { readCredentialFile } from '../../agents/runtime/credentialFile'
import { Logger } from '../utils/logger'

const logger = new Logger('ClaudeLogin')

const LOGIN_LIFETIME_MS = 10 * 60_000
const URL_WAIT_MS = 30_000
const FINISH_WAIT_MS = 60_000
const KILL_TIMEOUT_MS = 10_000
const MAX_CONCURRENT = 3
const MAX_CODE_LENGTH = 2000
const OUTPUT_KEEP = 4000
const OUTPUT_SHOWN = 300

const NOT_ACCEPTED = 'Claude did not accept that code'
const UNKNOWN_LOGIN = 'This sign-in is unknown or has expired — start again'

/** Everything the driver touches outside itself, so a test can fake the process and the clock. */
export interface LoginDeps {
  spawn: (command: string, args: string[]) => ChildProcessWithoutNullStreams
  mkScratch: () => Promise<string>
  rmScratch: (dir: string) => Promise<void>
  killContainer: (name: string) => Promise<void>
  now: () => number
  /** Runs `fn` after `ms`; returns a function that cancels it. */
  setTimer: (fn: () => void, ms: number) => () => void
  image: string
  maxConcurrent: number
  /**
   * The container's own network, from the agents' range (containerNetwork.ts), so the host service's agent
   * protections cover it as they cover an agent's: it runs the harness's sign-in, and must not reach the machine.
   */
  network: { ensure: (name: string) => Promise<string>; release: (name: string) => void }
}

/** Where sign-ins hold Claude's folder while they run: under the site's data folder. */
export function signInScratchRoot(): string {
  return path.join(getSiteRoot(), 'sign-ins')
}

/**
 * The folder bound as Claude's in the sign-in container. Docker resolves a
 * bind's source on the machine, not in the site's container, so it must be
 * under the data folder, which the installed site sees at the same path as the
 * machine does (deployment.md); the site's own `/tmp` is not there. Only the
 * site's user may open it: the sign-in container runs as the same user
 * (agent.Dockerfile, Dockerfile), and the person's tokens sit in it until the
 * sign-in ends.
 */
export async function makeSignInScratch(): Promise<string> {
  const root = signInScratchRoot()
  await fs.mkdir(root, { recursive: true, mode: 0o700 })
  await fs.chmod(root, 0o700)
  return fs.mkdtemp(path.join(root, 'claude-'))
}

const realDeps = (): LoginDeps => ({
  spawn: (command, args) => nodeSpawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] }),
  mkScratch: makeSignInScratch,
  rmScratch: dir => fs.rm(dir, { recursive: true, force: true }),
  killContainer: async name => {
    await dockerWithin(['kill', name], KILL_TIMEOUT_MS)
  },
  now: () => Date.now(),
  setTimer: (fn, ms) => {
    const handle = setTimeout(fn, ms)
    handle.unref?.()
    return () => clearTimeout(handle)
  },
  image: agentImageName(),
  maxConcurrent: MAX_CONCURRENT,
  network: { ensure: ensureAgentNetwork, release: releaseAgentNetwork },
})

interface Login {
  id: string
  name: string
  scratch: string | null
  proc: ChildProcessWithoutNullStreams | null
  /** Resolves with the exit code (or -1 when the process could not run); never rejects. */
  exited: Promise<number> | null
  output: string
  ready: boolean
  finishing: boolean
  cleaned: boolean
  /** Set once its network exists, until cleanup releases it. */
  network: string | null
  cancelTimers: Array<() => void>
  cleanup: () => Promise<void>
}

const registry = new Map<string, Login>()

/** Forget every login and its timers without touching Docker — for tests only. */
export function _resetForTests(): void {
  for (const login of registry.values()) login.cancelTimers.forEach(cancel => cancel())
  registry.clear()
}

function redact(text: string): string {
  return text.replace(/https?:\/\/\S+/g, '[link]').trim().slice(-OUTPUT_SHOWN)
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g
// A link ends at whitespace; waiting for it avoids returning half of one that arrived in two chunks.
const LINK = /https:\/\/[^\s"'<>]+(?=\s)/

function trimOutput(text: string): string {
  return text.length > OUTPUT_KEEP ? text.slice(-OUTPUT_KEEP) : text
}

function args(login: Login, scratch: string, image: string, network: string): string[] {
  return [
    'run', '-i', '--rm',
    '--name', login.name,
    // In the agents' group, which erasing the site takes down with any sign-in left running.
    ...composeProjectLabelArgs('claude-login'),
    '--network', network,
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    ...ipv6OffArgs(),
    '--memory', '512m',
    '--pids-limit', '256',
    '-v', `${scratch}:${AGENT_CONTAINER_CLAUDE_HOME}`,
    '--entrypoint', 'claude',
    image, 'auth', 'login',
  ]
}

function makeCleanup(login: Login, d: LoginDeps): () => Promise<void> {
  return async () => {
    if (login.cleaned) return
    login.cleaned = true
    registry.delete(login.id)
    login.cancelTimers.forEach(cancel => cancel())
    login.cancelTimers = []
    await d.killContainer(login.name).catch(err => {
      const message = err instanceof Error ? err.message : String(err)
      if (!/no such container/i.test(message)) logger.warn(`could not kill login container ${login.name}`)
    })
    try { login.proc?.kill() } catch { /* already gone */ }
    // The network sweep takes it once the container is gone (containerNetwork.ts).
    if (login.network) d.network.release(login.name)
    if (login.scratch) {
      await d.rmScratch(login.scratch).catch(() => logger.warn(`could not remove scratch for login ${login.id}`))
    }
  }
}

function waitForLink(login: Login, proc: ChildProcessWithoutNullStreams, d: LoginDeps): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false
    const stopTimer = d.setTimer(() => settle(() => reject(new Error(redact(login.output) || 'no output'))), URL_WAIT_MS)
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      stopTimer()
      fn()
    }
    const onData = (chunk: Buffer | string) => {
      login.output = trimOutput(login.output + String(chunk).replace(ANSI, ''))
      if (settled) return
      const found = LINK.exec(login.output)
      if (found) settle(() => resolve(found[0]))
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    void login.exited?.then(code => {
      settle(() => reject(new Error(`${redact(login.output) || 'no output'} (exit ${code})`)))
    })
  })
}

export async function startLogin(deps: Partial<LoginDeps> = {}): Promise<ClaudeLoginStartResult> {
  const d: LoginDeps = { ...realDeps(), ...deps }
  if (registry.size >= d.maxConcurrent) {
    throw new Error('Too many sign-ins are in progress on this site — try again in a moment')
  }

  const id = randomUUID()
  const login: Login = {
    id, name: `${siteNamespace()}-claude-login-${id}`, scratch: null, proc: null, exited: null,
    output: '', ready: false, finishing: false, cleaned: false, network: null, cancelTimers: [],
    cleanup: async () => undefined,
  }
  login.cleanup = makeCleanup(login, d)
  registry.set(id, login)

  try {
    login.scratch = await d.mkScratch()
    login.network = await d.network.ensure(login.name)
    const proc = d.spawn('docker', args(login, login.scratch, d.image, login.network))
    login.proc = proc
    login.exited = new Promise<number>(resolve => {
      proc.on('exit', code => resolve(code ?? -1))
      proc.on('error', err => {
        login.output = trimOutput(`${login.output}${err.message}`)
        resolve(-1)
      })
    })
    // A write after the process has gone would otherwise be an unhandled 'error' on the stream.
    proc.stdin.on('error', () => undefined)
    login.cancelTimers.push(d.setTimer(() => {
      logger.info(`login ${id} abandoned; removing`)
      void login.cleanup()
    }, LOGIN_LIFETIME_MS))

    const url = await waitForLink(login, proc, d)
    login.ready = true
    logger.info(`login ${id} started`)
    return { loginId: id, url }
  } catch (err) {
    await login.cleanup()
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`The login did not start: ${redact(reason)}`)
  }
}

function parseIds(params: unknown): { loginId: string; code?: unknown } {
  if (typeof params !== 'object' || params === null) throw new Error('Invalid login request')
  const { loginId, code } = params as Record<string, unknown>
  if (typeof loginId !== 'string' || loginId.length === 0) throw new Error('Invalid login request')
  return { loginId, code }
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

function checkCode(code: unknown): string {
  if (typeof code !== 'string') throw new Error('That sign-in code is not valid')
  const trimmed = code.trim()
  if (trimmed.length < 1 || trimmed.length > MAX_CODE_LENGTH || CONTROL.test(trimmed)) {
    throw new Error('That sign-in code is not valid')
  }
  return trimmed
}

async function readCredentials(scratch: string): Promise<string> {
  const read = await readCredentialFile(scratch)
  if (read.state !== 'read') throw new Error('no credentials')
  const text = read.text
  const parsed: unknown = JSON.parse(text)
  const oauth = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>).claudeAiOauth : undefined
  if (typeof oauth !== 'object' || oauth === null) throw new Error('no credentials')
  return text
}

export async function finishLogin(params: unknown, deps: Partial<LoginDeps> = {}): Promise<ClaudeLoginFinishResult> {
  const d: LoginDeps = { ...realDeps(), ...deps }
  const { loginId, code: rawCode } = parseIds(params)
  const login = registry.get(loginId)
  if (!login || !login.ready || login.finishing || !login.proc || !login.exited || !login.scratch) {
    throw new Error(UNKNOWN_LOGIN)
  }
  const code = checkCode(rawCode)

  login.finishing = true
  try {
    login.proc.stdin.write(`${code}\n`)
    let stopTimer: () => void = () => undefined
    const timedOut = new Promise<'timeout'>(resolve => { stopTimer = d.setTimer(() => resolve('timeout'), FINISH_WAIT_MS) })
    const exit = await Promise.race([login.exited, timedOut])
    stopTimer()
    if (exit !== 0) throw new Error('exit')
    const oauthJson = await readCredentials(login.scratch)
    logger.info(`login ${loginId} finished`)
    return { oauthJson }
  } catch {
    // Deliberately nothing from the process or the file: either may quote the code.
    logger.warn(`login ${loginId} was not accepted`)
    throw new Error(NOT_ACCEPTED)
  } finally {
    await login.cleanup()
  }
}

export async function cancelLogin(params: unknown, deps: Partial<LoginDeps> = {}): Promise<ClaudeLoginCancelResult> {
  void deps
  const { loginId } = parseIds(params)
  await registry.get(loginId)?.cleanup()
  return { cancelled: true }
}
