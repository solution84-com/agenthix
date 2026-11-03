/**
 * What the guard asks of Docker, as one interface the tests replace: the event stream for live previews' containers,
 * the containers there are, how each is set up, their use, and killing them. Every call has a deadline, so a daemon
 * that hangs fails the look instead of stalling it, and a look that fails counts against the guard.
 */
import { spawn } from 'node:child_process'
import { docker, within } from '../../../agents/runtime/containerLifecycle'
import { anyLivePreviewFilters, livePreviewFilters, livePreviewLabelKey } from '../container/labels'

/** One `docker events` line for a container: `action` is Docker's, such as `start` or `exec_start: <command>`. */
export type DockerEvent = { action: string; containerId: string; name: string; livePreviewId: string | null; at: number }

/** A container as `docker inspect` says it is, with the whole answer for the template comparison. */
export type InspectedContainer = {
  id: string
  name: string
  running: boolean
  paused: boolean
  /** Docker's `State.OOMKilled`: a process of it was killed for memory. */
  oomKilled: boolean
  addresses: string[]
  raw: unknown
}

export type UsageSample = { containerId: string; cpuPercent: number; memoryBytes: number; netBytes: number }
export type EventStream = { stop(): void }

export type GuardDocker = {
  events(onEvent: (event: DockerEvent) => void, onEnd: (why: string) => void): EventStream
  containerIds(livePreviewId?: string): Promise<string[]>
  inspect(ids: string[]): Promise<InspectedContainer[]>
  usage(ids: string[]): Promise<UsageSample[]>
  /** Kills and removes the containers at once; one already gone is no failure. */
  kill(ids: string[]): Promise<void>
}

export const DOCKER_CALL_TIMEOUT_MS = 4_000
const MAX_EVENT_LINE = 64 * 1024

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function parseDockerEvent(line: string): DockerEvent | null {
  if (!line.trim() || line.length > MAX_EVENT_LINE) return null
  let raw: Record<string, unknown>
  try {
    raw = obj(JSON.parse(line))
  } catch {
    return null
  }
  if (str(raw.Type) !== 'container') return null
  const actor = obj(raw.Actor)
  const attributes = obj(actor.Attributes)
  const containerId = str(actor.ID) || str(raw.id)
  const action = str(raw.Action) || str(raw.status)
  if (!containerId || !action) return null
  const seconds = num(raw.time)
  return {
    action, containerId, name: str(attributes.name), livePreviewId: str(attributes[livePreviewLabelKey()]) || null,
    at: seconds ? seconds * 1000 : Date.now(),
  }
}

export function readInspected(raw: unknown): InspectedContainer | null {
  const c = obj(raw)
  const id = str(c.Id)
  if (!id) return null
  const state = obj(c.State)
  const networks = obj(obj(c.NetworkSettings).Networks)
  return {
    id,
    name: str(c.Name).replace(/^\//, ''),
    running: state.Running === true,
    paused: state.Paused === true,
    oomKilled: state.OOMKilled === true,
    addresses: Object.values(networks).map(n => str(obj(n).IPAddress)).filter(Boolean),
    raw,
  }
}

/** `docker stats` sizes such as `12.5MiB` or `3kB`, in bytes. */
export function readSize(text: string): number {
  const m = /^([\d.]+)\s*([kKMGT]?i?B)?$/.exec(text.trim())
  if (!m) return 0
  const unit = m[2] ?? 'B'
  const power = { B: 0, k: 1, K: 1, M: 2, G: 3, T: 4 }[unit[0] as 'B'] ?? 0
  return Number(m[1]) * (unit.includes('i') ? 1024 : 1000) ** power
}

export function readUsageLine(line: string): UsageSample | null {
  let raw: Record<string, unknown>
  try {
    raw = obj(JSON.parse(line))
  } catch {
    return null
  }
  const containerId = str(raw.ID)
  if (!containerId) return null
  const [netIn = '', netOut = ''] = str(raw.NetIO).split('/')
  return {
    containerId,
    cpuPercent: Number.parseFloat(str(raw.CPUPerc)) || 0,
    memoryBytes: readSize(str(raw.MemUsage).split('/')[0] ?? ''),
    netBytes: readSize(netIn) + readSize(netOut),
  }
}

const call = (args: string[], timeoutMs = DOCKER_CALL_TIMEOUT_MS) => within(docker(args), timeoutMs, `docker ${args[0]}`)
const lines = (out: string) => out.split('\n').map(l => l.trim()).filter(Boolean)

export const cliGuardDocker: GuardDocker = {
  events(onEvent, onEnd) {
    const child = spawn('docker', ['events', '--format', '{{json .}}', '--filter', 'type=container', ...anyLivePreviewFilters()], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let buffer = ''
    let ended = false
    const end = (why: string) => {
      if (ended) return
      ended = true
      onEnd(why)
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      let at = buffer.indexOf('\n')
      while (at >= 0) {
        const event = parseDockerEvent(buffer.slice(0, at))
        buffer = buffer.slice(at + 1)
        if (event) onEvent(event)
        at = buffer.indexOf('\n')
      }
      if (buffer.length > MAX_EVENT_LINE) buffer = ''
    })
    child.on('error', err => end(err.message))
    child.on('close', code => end(`docker events ended (${code ?? 'signal'})`))
    return { stop() { ended = true; child.kill('SIGTERM') } }
  },
  async containerIds(livePreviewId) {
    const filters = livePreviewId ? livePreviewFilters(livePreviewId) : anyLivePreviewFilters()
    return lines((await call(['ps', '--all', '--no-trunc', '--quiet', ...filters])).stdout)
  },
  async inspect(ids) {
    if (!ids.length) return []
    const { stdout } = await call(['inspect', '--type', 'container', ...ids])
    const parsed: unknown = JSON.parse(stdout)
    return (Array.isArray(parsed) ? parsed : []).map(readInspected).filter((c): c is InspectedContainer => c !== null)
  },
  async usage(ids) {
    if (!ids.length) return []
    const { stdout } = await call(['stats', '--no-stream', '--no-trunc', '--format', '{{json .}}', ...ids], 2 * DOCKER_CALL_TIMEOUT_MS)
    return lines(stdout).map(readUsageLine).filter((s): s is UsageSample => s !== null)
  },
  async kill(ids) {
    if (!ids.length) return
    await call(['rm', '--force', ...ids]).catch(() => undefined)
  },
}
