/**
 * How the host service drives Docker: the `docker` CLI, run with an argument list the host service builds itself
 * and never through a shell. No request carries an argument through to it — every call below is one of the
 * host service's own, which is how the closed set of operations stays closed (adr-0107).
 */
import { spawn } from 'node:child_process'
import { childEnv, type RegistryEnv } from '../images/registryAuth'
import { parseNetworkInspect, type DockerNetwork } from '../compose/subnets'
import { DockerRemoval } from './removal'
import { CONTAINER_FORMAT, parseContainerInspect, type MachineContainer } from './machineContainers'
import { mountArg } from './mountArg'
import { publishArgs, readPublishProbe } from './publishProbe'

export type RunResult = { code: number; stdout: string; stderr: string }

export type RunOptions = { input?: string; timeoutMs?: number; env?: RegistryEnv }

/** Runs `docker <args>`. Tests stand in a fake. */
export type DockerRunner = (args: string[], options?: RunOptions) => Promise<RunResult>

const MAX_OUTPUT = 8 * 1024 * 1024

export const dockerCli: DockerRunner = (args, options = {}) =>
  new Promise(resolve => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv(process.env, options.env) })
    let stdout = ''
    let stderr = ''
    const take = (into: 'out' | 'err') => (chunk: Buffer) => {
      if (into === 'out' && stdout.length < MAX_OUTPUT) stdout += chunk.toString('utf8')
      if (into === 'err' && stderr.length < MAX_OUTPUT) stderr += chunk.toString('utf8')
    }
    child.stdout.on('data', take('out'))
    child.stderr.on('data', take('err'))
    const timer = options.timeoutMs ? setTimeout(() => child.kill('SIGTERM'), options.timeoutMs) : null
    child.on('error', err => {
      if (timer) clearTimeout(timer)
      resolve({ code: 127, stdout, stderr: stderr || err.message })
    })
    child.on('close', code => {
      if (timer) clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
    child.stdin.end(options.input ?? '')
  })

export type ServiceState = { service: string; state: string; health: string }

/** The few Docker actions the host service takes, each built from its own arguments. */
export class Docker {
  private readonly images = new Map<string, string>()

  constructor(private readonly run: DockerRunner) {}

  private async ok(args: string[], options?: RunOptions): Promise<string> {
    const r = await this.run(args, options)
    if (r.code !== 0) throw new DockerError(args, r)
    return r.stdout
  }

  private compose(project: string, file: string, ...args: string[]): string[] {
    return ['compose', '-p', project, '-f', file, ...args]
  }

  async composeUp(project: string, file: string): Promise<void> {
    await this.ok(this.compose(project, file, 'up', '-d', '--remove-orphans'), { timeoutMs: 15 * 60_000 })
  }

  async composeStop(project: string, file: string): Promise<void> {
    await this.ok(this.compose(project, file, 'stop'), { timeoutMs: 5 * 60_000 })
  }

  async composeStart(project: string, file: string): Promise<void> {
    await this.ok(this.compose(project, file, 'start'), { timeoutMs: 5 * 60_000 })
  }

  /** Removes a project's containers, networks and volumes (an erase, spec §15); external volumes are left alone. */
  async composeDownWithVolumes(project: string, file: string): Promise<void> {
    await this.ok(this.compose(project, file, 'down', '--volumes', '--remove-orphans'), { timeoutMs: 10 * 60_000 })
  }

  /**
   * Takes down a group started with `docker run` rather than compose — the agents a site started — by its
   * `com.docker.compose.project` label: every container in it, running or not, then its networks.
   */
  async removeGroup(project: string): Promise<void> {
    const label = `label=com.docker.compose.project=${project}`
    const out = await this.ok(['ps', '--all', '--filter', label, '--format', '{{.Names}}'], { timeoutMs: 60_000 })
    const names = out.split('\n').map(n => n.trim()).filter(Boolean)
    if (names.length) await this.ok(['rm', '--force', ...names], { timeoutMs: 5 * 60_000 })
    const networks = (await this.ok(['network', 'ls', '--filter', label, '--format', '{{.Name}}'], { timeoutMs: 60_000 }))
      .split('\n').map(n => n.trim()).filter(Boolean)
    if (networks.length) await this.ok(['network', 'rm', ...networks], { timeoutMs: 2 * 60_000 })
  }

  /** Every network on the machine, with its IPv4 subnets (compose/subnets.ts). */
  async networks(): Promise<DockerNetwork[]> {
    const names = (await this.ok(['network', 'ls', '--format', '{{.Name}}'], { timeoutMs: 60_000 }))
      .split('\n').map(n => n.trim()).filter(Boolean)
    if (!names.length) return []
    const format = '{{.Name}}\t{{range .IPAM.Config}}{{.Subnet}} {{end}}'
    return parseNetworkInspect(await this.ok(['network', 'inspect', '--format', format, ...names], { timeoutMs: 60_000 }))
  }

  /**
   * Every container on the machine, running or not, with its labels and the ports Docker publishes for it now
   * (`machineContainers.ts`). One that goes between the listing and the inspect is left out.
   */
  async machineContainers(): Promise<MachineContainer[]> {
    const ids = (await this.ok(['ps', '--all', '--quiet', '--no-trunc'], { timeoutMs: 60_000 })).split('\n').map(n => n.trim()).filter(Boolean)
    if (!ids.length) return []
    const r = await this.run(['inspect', '--type', 'container', '--format', CONTAINER_FORMAT, ...ids], { timeoutMs: 60_000 })
    if (r.code !== 0 && !r.stdout.trim()) throw new DockerError(['inspect', '--type', 'container'], r)
    return parseContainerInspect(r.stdout)
  }

  /**
   * Whether Docker can publish `port` on `bind`, tried from a throwaway container of `hostContainer`'s own image
   * (`publishProbe.ts`): true when Docker says it is held, false when it published, null when Docker could not tell.
   */
  async publishProbe(port: number, bind: string, hostContainer: string): Promise<boolean | null> {
    let image = this.images.get(hostContainer)
    if (!image) {
      const r = await this.run(['container', 'inspect', '--format', '{{.Image}}', hostContainer], { timeoutMs: 30_000 })
      image = r.code === 0 ? r.stdout.trim() : ''
      if (!image) return null
      this.images.set(hostContainer, image)
    }
    return readPublishProbe(await this.run(publishArgs(image, port, bind), { timeoutMs: 60_000 }))
  }

  async composeLogs(project: string, file: string, tail: number, service?: string, since?: string): Promise<string> {
    const args = this.compose(project, file, 'logs', '--no-color', '--timestamps', '--tail', String(tail), ...(since ? ['--since', since] : []))
    return this.ok(service ? [...args, service] : args, { timeoutMs: 60_000 })
  }

  /** Every service of a project, running or not; none when the project does not exist. */
  async composePs(project: string, file: string): Promise<ServiceState[]> {
    const out = await this.ok(this.compose(project, file, 'ps', '--all', '--format', 'json'), { timeoutMs: 60_000 })
    return parseComposePs(out)
  }

  async imageExists(ref: string): Promise<boolean> {
    return (await this.run(['image', 'inspect', '--format', '{{.Id}}', ref], { timeoutMs: 60_000 })).code === 0
  }

  /** `env` is the registry credential's client configuration, given to the pull alone. */
  async pull(ref: string, env?: RegistryEnv): Promise<void> {
    await this.ok(['pull', '--quiet', ref], { timeoutMs: 30 * 60_000, env })
  }

  /** Runs a command in a running container, with `input` on its standard input. */
  async exec(container: string, command: string[], input: string, timeoutMs = 30_000): Promise<RunResult> {
    return this.run(['exec', '-i', container, ...command], { input, timeoutMs })
  }

  /** Where a container's mount at `destination` comes from on the machine; null when it has none there. */
  async mountSource(container: string, destination: string): Promise<string | null> {
    const out = await this.ok(['container', 'inspect', '--format', '{{json .Mounts}}', container], { timeoutMs: 30_000 })
    const mounts = JSON.parse(out) as { Source?: string; Destination?: string }[]
    return mounts.find(m => m.Destination === destination)?.Source ?? null
  }

  /** A container's environment, as its `docker run` or compose project set it; null when there is no such container. */
  async containerEnv(container: string): Promise<Record<string, string> | null> {
    const r = await this.run(['container', 'inspect', '--format', '{{json .Config.Env}}', container], { timeoutMs: 30_000 })
    if (r.code !== 0) return null
    const pairs = JSON.parse(r.stdout) as unknown
    if (!Array.isArray(pairs)) return null
    return Object.fromEntries(pairs.filter((p): p is string => typeof p === 'string' && p.includes('=')).map(p => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]))
  }

  async version(): Promise<string | null> {
    const r = await this.run(['version', '--format', '{{.Server.Version}}'], { timeoutMs: 15_000 })
    return r.code === 0 ? r.stdout.trim() || null : null
  }

  /** What uninstalling asks of Docker (`removal.ts`). */
  removal(): DockerRemoval {
    return new DockerRemoval(this.run)
  }
}

/** `docker compose ps --format json` prints one object per line (Compose 2.21 and later) or one array (earlier). */
export function parseComposePs(out: string): ServiceState[] {
  const text = out.trim()
  if (!text) return []
  const rows: unknown[] = text.startsWith('[') ? JSON.parse(text) : text.split('\n').filter(Boolean).map(l => JSON.parse(l))
  return rows.map(r => {
    const row = r as { Service?: unknown; State?: unknown; Health?: unknown }
    return { service: String(row.Service ?? ''), state: String(row.State ?? ''), health: String(row.Health ?? '') }
  })
}

export class DockerError extends Error {
  constructor(readonly args: string[], readonly result: RunResult) {
    super(`docker ${args.slice(0, 4).join(' ')} failed: ${(result.stderr || result.stdout).trim().split('\n').slice(-3).join(' ')}`)
    this.name = 'DockerError'
  }
}

/**
 * The Docker actions that move a backup's bytes (`backups/io.ts`): a database dump, a volume's or folder's
 * contents, and a folder the machine admin named. Streamed, never held whole, so a backup of any size passes
 * through. Each is a fixed argument list; what a helper container runs is fixed text, with any name passed to it
 * as an argument, never written into it. The helper is the host service's own image, already on the machine.
 */
export type StreamRunner = (args: string[], input?: AsyncIterable<Buffer>) => {
  stdout: AsyncIterable<Buffer>
  done: Promise<RunResult>
  /** Stops it, for a reader that has what it needs before the end. */
  kill: () => void
}

export const dockerStream: StreamRunner = (args, input) => {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv(process.env) })
  let stderr = ''
  // What went wrong with the bytes being sent in, which says more than the command stopped by it.
  let inputError: string | null = null
  child.stderr.on('data', (c: Buffer) => {
    if (stderr.length < 64 * 1024) stderr += c.toString('utf8')
  })
  const done = new Promise<RunResult>(resolve => {
    child.on('error', err => resolve({ code: 127, stdout: '', stderr: stderr || err.message }))
    child.on('close', code => resolve({ code: inputError ? 1 : code ?? 1, stdout: '', stderr: inputError ?? stderr }))
  })
  const stdin = child.stdin
  stdin.on('error', () => {})
  if (!input) stdin.end()
  else {
    void (async () => {
      try {
        for await (const chunk of input) {
          if (!stdin.write(chunk)) await new Promise(r => stdin.once('drain', r))
        }
      } catch (err) {
        inputError = err instanceof Error ? err.message : String(err)
        child.kill('SIGTERM')
      } finally {
        stdin.end()
      }
    })()
  }
  return { stdout: child.stdout, done, kill: () => void child.kill('SIGTERM') }
}

const LOCATION = '/location'
const FOLDER = '/folder'
// The copy is written under a temporary name and renamed whole. A copy that fails or is stopped leaves no temporary
// file behind (a stale one from a killed run is cleared first), and a half-written one never has the copy's name.
export const WRITE_SCRIPT = `p="${LOCATION}/.$1.part"; rm -f "$p"; trap 'rm -f "$p"' EXIT INT TERM; cat > "$p" && mv "$p" "${LOCATION}/$1"`

export class DockerStreams {
  private helper: string | null = null

  constructor(private readonly run: DockerRunner, private readonly stream: StreamRunner, private readonly hostContainer: string) {}

  private async ok(args: string[], timeoutMs = 120_000): Promise<string> {
    const r = await this.run(args, { timeoutMs })
    if (r.code !== 0) throw new DockerError(args, r)
    return r.stdout
  }

  /** The host service's own image, by its id, for helper containers. */
  private async helperImage(): Promise<string> {
    if (!this.helper) this.helper = (await this.ok(['container', 'inspect', '--format', '{{.Image}}', this.hostContainer])).trim()
    return this.helper
  }

  private async *out(args: string[]): AsyncGenerator<Buffer> {
    const { stdout, done, kill } = this.stream(args)
    let finished = false
    try {
      for await (const chunk of stdout) yield chunk
      finished = true
    } finally {
      if (!finished) kill()
    }
    const r = await done
    if (r.code !== 0) throw new DockerError(args, r)
  }

  private async in(args: string[], input: AsyncIterable<Buffer>): Promise<void> {
    const { stdout, done } = this.stream(args, input)
    for await (const _ of stdout) {
      // What the command prints is not needed; reading it keeps it from blocking.
    }
    const r = await done
    if (r.code !== 0) throw new DockerError(args, r)
  }

  private async helperArgs(mount: string, ...rest: string[]): Promise<string[]> {
    return ['run', '--rm', '-i', '--network', 'none', '--mount', mount, '--entrypoint', 'sh', await this.helperImage(), '-c', ...rest]
  }

  dumpDatabase(container: string, database: string): AsyncIterable<Buffer> {
    return this.out(['exec', container, 'pg_dump', '-U', 'postgres', '--format=custom', database])
  }

  async restoreDatabase(container: string, database: string, dump: AsyncIterable<Buffer>): Promise<void> {
    await this.ok(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database])
    await this.ok(['exec', container, 'createdb', '-U', 'postgres', database])
    await this.in(['exec', '-i', container, 'pg_restore', '-U', 'postgres', '--no-owner', '--exit-on-error', '-d', database], dump)
  }

  async createProject(project: string, file: string): Promise<void> {
    await this.ok(['compose', '-p', project, '-f', file, 'create'], 10 * 60_000)
  }

  async startServices(project: string, file: string, services: string[]): Promise<void> {
    await this.ok(['compose', '-p', project, '-f', file, 'up', '-d', '--wait', ...services], 10 * 60_000)
  }

  private mountOf(source: { volume: string } | { machinePath: string }, readonly: boolean): string {
    return 'volume' in source
      ? mountArg({ type: 'volume', name: source.volume, destination: FOLDER, readOnly: readonly })
      : mountArg({ type: 'bind', source: source.machinePath, destination: FOLDER, readOnly: readonly })
  }

  async *readFolder(source: { volume: string } | { machinePath: string }): AsyncGenerator<Buffer> {
    yield* this.out(await this.helperArgs(this.mountOf(source, true), `tar -C ${FOLDER} -cf - .`))
  }

  async writeFolder(source: { volume: string } | { machinePath: string }, tar: AsyncIterable<Buffer>): Promise<void> {
    await this.in(await this.helperArgs(this.mountOf(source, false), `find ${FOLDER} -mindepth 1 -delete && tar -C ${FOLDER} -xf -`), tar)
  }

  private bind(dir: string, readonly = false): string {
    return `type=bind,src=${dir},dst=${LOCATION}${readonly ? ',readonly' : ''}`
  }

  /** Null when a small file can be written and removed there; otherwise Docker's or the shell's words. */
  async testWrite(dir: string): Promise<string | null> {
    const r = await this.run(await this.helperArgs(this.bind(dir), `f=${LOCATION}/.write-test-$$ && echo test > "$f" && rm -f "$f"`), { timeoutMs: 60_000 })
    if (r.code === 0) return null
    return /bind source path does not exist|no such file or directory/i.test(r.stderr) ? 'missing' : (r.stderr.trim().split('\n').pop() ?? 'it could not be written')
  }

  /** The files directly in the folder, each with its size. */
  async list(dir: string): Promise<{ name: string; sizeBytes: number }[]> {
    const script = `cd ${LOCATION} && for f in *; do if [ -f "$f" ]; then echo "$(stat -c %s "$f") $f"; fi; done`
    const out = await this.ok(await this.helperArgs(this.bind(dir, true), script))
    return out.split('\n').flatMap(line => {
      const m = /^(\d+) (.+)$/.exec(line)
      return m ? [{ name: m[2], sizeBytes: Number(m[1]) }] : []
    })
  }

  async *read(dir: string, name: string): AsyncGenerator<Buffer> {
    yield* this.out([...(await this.helperArgs(this.bind(dir, true), `cat "${LOCATION}/$1"`)), 'read', name])
  }

  async write(dir: string, name: string, bytes: AsyncIterable<Buffer>): Promise<void> {
    await this.in([...(await this.helperArgs(this.bind(dir), WRITE_SCRIPT)), 'write', name], bytes)
  }

  async remove(dir: string, name: string): Promise<void> {
    await this.ok([...(await this.helperArgs(this.bind(dir), `rm -f "${LOCATION}/$1"`)), 'remove', name])
  }
}
