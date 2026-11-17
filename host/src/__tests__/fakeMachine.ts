/**
 * A machine for tests: a temporary state folder and a stand-in for the docker CLI that records what it is asked
 * and answers like Docker with hq and its site running. Nothing here runs Docker.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Docker, type DockerRunner, type RunResult } from '../docker/docker'
import { HqControl, type HqCommandResult } from '../hq/control'
import { StateFolder } from '../state/folder'
import { namesFor } from '../state/namespace'
import type { SignatureCheck } from '../images/signatures'
import { machinePathsFrom, type Context } from '../service/context'
import { fakeBackupIO, type FakeBackupIO } from '../backups/__tests__/fakeBackupIO'
import { FakeContainers } from '../launcher/__tests__/fakeContainers'
import type { DockerNetwork } from '../compose/subnets'
import type { MachineContainer } from '../docker/machineContainers'

export type FakeMachine = {
  ctx: Context
  calls: string[][]
  dir: string
  /** What hq's control socket answers, by command; null makes hq not answer. */
  hq: Record<string, HqCommandResult | null>
  /** Projects whose containers run. */
  up: Set<string>
  missingImages: Set<string>
  /** What the signature check answers, by image; any other published image is signed, with `digestOf` its digest. */
  signatures: Map<string, SignatureCheck>
  /** Each signature check asked: the image and the signer expected. */
  checked: [string, string][]
  /** Why Caddy's check of a configuration fails, as hq-web's Caddy says it; null when it passes. */
  caddyRefuses: { reason: string | null }
  /** Databases, storage folders and the folders a machine admin names, without Docker. */
  backups: FakeBackupIO
  /** The registry's tags, by repository (`solution84-com/agenthix-hq-server`); `registryDown` makes listing fail. */
  tags: Map<string, string[]>
  registryDown: { reason: string | null }
  /** What the site's control socket answers `status` with; null makes the site not answer. */
  siteReport: { value: unknown }
  /** The agent containers a site started, by name, in the agents' group: `docker ps` lists them and `docker rm` removes them. */
  agentContainers: string[]
  /** Every other container on the machine, as `docker inspect` reads it for the port check; none by default. */
  machineContainers: MachineContainer[]
  /**
   * Containers' environments, by container name, as `docker container inspect` reads them. Without one, a running
   * site's container has the environment its compose file gives it, and any other none.
   */
  containerEnvs: Map<string, string[]>
  /** Ports a program outside Docker holds, as the port check's bind probe finds them; none by default. */
  heldPorts: Set<number>
  /** The agents' networks, in the same group: `docker network ls` lists them and `docker network rm` removes them. */
  agentNetworks: string[]
  /**
   * Every other Docker network on the machine, with its subnets, as `docker network inspect` reads them; a project's
   * networks join it when compose brings the project up. None by default.
   */
  dockerNetworks: DockerNetwork[]
  /** The host service's own container, its launcher and the images they run (ADR-0118). */
  containers: FakeContainers
  /** The named volumes on the machine: `docker volume ls` lists them and `docker volume rm` removes them. */
  volumes: string[]
  /** The images on the machine, as `docker image ls --digests` lists them: `<repository>\t<tag>\t<digest>`. */
  images: string[]
  /** Images, by the reference removed, that a container uses: `docker image rm` refuses them. */
  imagesInUse: Set<string>
  /** Docker commands that fail, by their first two words (`volume rm`, `network rm`, `image ls` …). */
  dockerFails: Set<string>
  /** What the Fleet Console's `local-join` prints inside its container; null makes it fail. */
  consoleLocalJoin: { code: string | null }
  /** What the Fleet Console's `handover-code` and `handover-status` print inside its container; a missing one fails. */
  consoleAnswers: Record<string, unknown>
  /** What the agent image's launcher prints for `--abi` (the kernel's Landlock ABI), and its exit code; 8 by default. */
  landlock: { stdout: string; code: number }
  /** What `docker info` says of the system and kernel the containers run on. */
  system: { operatingSystem: string; kernel: string }
  cleanup: () => void
}

const SERVICES: Record<string, string[]> = { hq: ['hq-db', 'hq-server', 'relay', 'hq-web'], site: ['site-db', 'site'] }

export function fakeMachine(ns = 'agenthix'): FakeMachine {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-machine-'))
  const state = new StateFolder(path.join(dir, 'state'))
  state.prepare()
  // What the host service records at its first start, before any operation runs.
  state.writeJson(['installation.json'], { namespace: ns, ports: { hq: null, console: null }, agentRange: null, recordedAt: '2026-10-14T09:00:00.000Z' })
  const calls: string[][] = []
  const up = new Set<string>()
  const missingImages = new Set<string>()
  const signatures = new Map<string, SignatureCheck>()
  const checked: [string, string][] = []
  const caddyRefuses: FakeMachine['caddyRefuses'] = { reason: null }
  const agentContainers: string[] = []
  const agentNetworks: string[] = []
  const dockerNetworks: DockerNetwork[] = []
  const machineContainers: MachineContainer[] = []
  const heldPorts = new Set<number>()
  const containerEnvs = new Map<string, string[]>()
  const siteReport: FakeMachine['siteReport'] = { value: null }
  const consoleLocalJoin: FakeMachine['consoleLocalJoin'] = { code: null }
  const consoleAnswers: FakeMachine['consoleAnswers'] = {}
  const landlock: FakeMachine['landlock'] = { stdout: '8\n', code: 0 }
  const system: FakeMachine['system'] = { operatingSystem: 'Debian GNU/Linux 13 (trixie)', kernel: '6.12.48+deb13-amd64' }
  const volumes: string[] = []
  const images: string[] = []
  const imagesInUse = new Set<string>()
  const dockerFails = new Set<string>()
  const drop = (list: string[], name: string) => {
    const i = list.indexOf(name)
    if (i >= 0) list.splice(i, 1)
    return i >= 0
  }
  const refOf = (row: string) => {
    const [repository, tag, digest] = row.split('\t')
    return digest && digest !== '<none>' ? `${repository}@${digest}` : `${repository}:${tag}`
  }
  const hq: FakeMachine['hq'] = {
    status: { ok: true, text: 'HQ', data: { users: 0, hqSite: { state: 'connected', dockerRunning: true }, address: 'x', version: 'dev', commit: 'c' } },
    'invite-admin': { ok: true, text: 'No admin yet. Open this link to set up Agenthix (valid 24 hours):\nhttps://hq.acme.example/setup?token=abc', data: { kind: 'first_admin', link: 'https://hq.acme.example/setup?token=abc', validHours: 24 } },
  }
  const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' })
  const run: DockerRunner = async args => {
    calls.push(args)
    if (dockerFails.has(`${args[0]} ${args[1]}`)) return { code: 1, stdout: '', stderr: 'Error response from daemon: the disk is full' }
    if (args[0] === 'volume' && args[1] === 'ls') return ok(volumes.join('\n'))
    if (args[0] === 'volume' && args[1] === 'rm') return drop(volumes, args[2]) ? ok() : { code: 1, stdout: '', stderr: `Error: No such volume: ${args[2]}` }
    if (args[0] === 'image' && args[1] === 'ls') return ok(images.join('\n'))
    if (args[0] === 'image' && args[1] === 'rm') {
      const ref = args[2]
      if (imagesInUse.has(ref)) return { code: 1, stdout: '', stderr: `Error response from daemon: conflict: unable to remove repository reference "${ref}" (must force) - container 1234 is using its referenced image` }
      const row = images.find(r => refOf(r) === ref)
      return row && drop(images, row) ? ok() : { code: 1, stdout: '', stderr: `Error: No such image: ${ref}` }
    }
    if (args[0] === 'container' && args[1] === 'inspect' && args.includes('{{json .Config.Env}}')) {
      const env = containerEnvs.get(args[args.length - 1]) ?? composedEnv(args[args.length - 1])
      return env ? ok(JSON.stringify(env)) : { code: 1, stdout: '', stderr: `Error: No such container: ${args[args.length - 1]}` }
    }
    if (args[0] === 'container' && args[1] === 'inspect' && args.includes('{{.Image}}')) {
      const image = composedImage(args[args.length - 1])
      if (image) return ok(`${image}\n`)
    }
    if (args[0] === 'container' && args[1] === 'inspect') return ok(JSON.stringify([{ Source: '/home/sam/.agenthix', Destination: '/state' }]))
    if (args[0] === 'image') return missingImages.has(args[args.length - 1]) ? { code: 1, stdout: '', stderr: 'No such image' } : ok('sha256:1')
    if (args[0] === 'pull') return missingImages.has(args[args.length - 1]) ? { code: 1, stdout: '', stderr: 'not found' } : ok()
    if (args[0] === 'version') return ok('29.0.0\n')
    if (args[0] === 'info') return ok(`${system.operatingSystem}\t${system.kernel}\n`)
    if (args[0] === 'run' && args[args.length - 1] === '--abi') return { code: landlock.code, stdout: landlock.stdout, stderr: '' }
    if (args[0] === 'compose') {
      const project = args[args.indexOf('-p') + 1]
      const role = project.endsWith('-hq') ? 'hq' : 'site'
      if (args.includes('up') || args.includes('start')) {
        up.add(project)
        joinNetworks(args[args.indexOf('-f') + 1])
      }
      if (args.includes('stop') || args.includes('down')) up.delete(project)
      if (args.includes('ps')) {
        return ok(up.has(project) ? SERVICES[role].map(s => JSON.stringify({ Service: s, State: 'running', Health: '' })).join('\n') : '')
      }
      if (args.includes('logs')) return ok(`${ns}-hq-server  | 2026-10-14T09:00:00Z started\n`)
      return ok()
    }
    const inAgents = args.includes(`label=com.docker.compose.project=${ns}-agents`)
    if (args[0] === 'ps' && args.includes('--quiet') && !inAgents) return ok(machineContainers.map(c => c.name).join('\n'))
    if (args[0] === 'inspect' && args[1] === '--type') {
      const wanted = new Set(args.slice(5))
      return ok(machineContainers.filter(c => wanted.has(c.name)).map(c => [
        `/${c.name}`, c.labels, c.running,
        c.running ? Object.fromEntries(c.published.map((p, i) => [`${4000 + i}/tcp`, [{ HostIp: p.ip, HostPort: String(p.port) }]])) : {},
      ].map(v => JSON.stringify(v)).join('\t')).join('\n'))
    }
    if (args[0] === 'ps') return ok(inAgents ? agentContainers.join('\n') : '')
    if (args[0] === 'rm') {
      for (const name of args.slice(2)) drop(agentContainers, name)
      return ok()
    }
    if (args[0] === 'network' && args[1] === 'ls' && !args.includes('--filter')) return ok(dockerNetworks.map(n => n.name).join('\n'))
    if (args[0] === 'network' && args[1] === 'inspect') {
      const wanted = new Set(args.slice(4))
      return ok(dockerNetworks.filter(n => wanted.has(n.name)).map(n => `${n.name}\t${n.subnets.map(s => `${s} `).join('')}\n`).join(''))
    }
    if (args[0] === 'network' && args[1] === 'ls') return ok(inAgents ? agentNetworks.join('\n') : '')
    if (args[0] === 'network' && args[1] === 'rm') {
      const missing = args.slice(2).filter(name => {
        const i = dockerNetworks.findIndex(n => n.name === name)
        if (i >= 0) dockerNetworks.splice(i, 1)
        return !drop(agentNetworks, name) && i < 0
      })
      return missing.length ? { code: 1, stdout: '', stderr: `Error: No such network: ${missing.join(', ')}` } : ok()
    }
    if (args[0] === 'exec' && args[2] === `${ns}-site-server` && args.includes('node')) {
      return siteReport.value && up.has(`${ns}-site`) ? ok(`${JSON.stringify(siteReport.value)}\n`) : { code: 3, stdout: '', stderr: '' }
    }
    if (args[0] === 'exec' && args.includes('local-join')) {
      return consoleLocalJoin.code && up.has(`${ns}-console`) ? ok(`${JSON.stringify({ code: consoleLocalJoin.code })}\n`) : { code: 1, stdout: '', stderr: '' }
    }
    if (args[0] === 'exec' && args[2] === `${ns}-console`) {
      const answer = consoleAnswers[args[args.length - 1]]
      return answer !== undefined && up.has(`${ns}-console`)
        ? ok(`${JSON.stringify(answer)}\n`)
        : { code: 1, stdout: '', stderr: `${JSON.stringify({ error: 'HQ is not answering.' })}\n` }
    }
    if (args[0] === 'exec' && args.includes('caddy')) {
      return caddyRefuses.reason ? { code: 1, stdout: '', stderr: caddyRefuses.reason } : ok('Valid configuration\n')
    }
    if (args[0] === 'exec') {
      const command = args[args.indexOf('-') + 1]
      const answer = up.has(`${ns}-hq`) ? hq[command] : null
      return answer ? ok(`${JSON.stringify(answer)}\n`) : { code: 3, stdout: '', stderr: '' }
    }
    return { code: 1, stdout: '', stderr: `unexpected docker ${args.join(' ')}` }
  }
  const composedEnv = (container: string): string[] | undefined => {
    const file = state.path('site', 'compose.json')
    if (container !== `${ns}-site-server` || !up.has(`${ns}-site`) || !fs.existsSync(file)) return undefined
    const env = (JSON.parse(fs.readFileSync(file, 'utf8')) as { services: { site: { environment: Record<string, string> } } }).services.site.environment
    return Object.entries(env).map(([k, v]) => `${k}=${v}`)
  }
  // The image a running hq-server or site container runs: its compose file's, by the id the containers stand-in gives it.
  const composedImage = (container: string): string | undefined => {
    const role = container === `${ns}-hq-server` ? 'hq' : container === `${ns}-site-server` ? 'site' : null
    const file = role && state.path(role, 'compose.json')
    if (!role || !file || !up.has(`${ns}-${role}`) || !fs.existsSync(file)) return undefined
    const services = (JSON.parse(fs.readFileSync(file, 'utf8')) as { services: Record<string, { image: string }> }).services
    const ref = services[role === 'hq' ? 'hq-server' : 'site'].image
    return containers.refs.get(ref) ?? ref
  }
  // What compose would make of a project's networks: those it declares with a subnet, unless one of that name exists.
  const joinNetworks = (file: string) => {
    if (!fs.existsSync(file)) return
    const declared = (JSON.parse(fs.readFileSync(file, 'utf8')) as { networks?: Record<string, { name: string; ipam?: { config: { subnet: string }[] } }> }).networks ?? {}
    for (const n of Object.values(declared)) {
      if (n.ipam && !dockerNetworks.some(d => d.name === n.name)) dockerNetworks.push({ name: n.name, subnets: n.ipam.config.map(c => c.subnet) })
    }
  }
  const docker = new Docker(run)
  const containers = new FakeContainers(ns)
  const names = namesFor(ns)
  const backups = fakeBackupIO(dir)
  const tags = new Map<string, string[]>()
  const registryDown: FakeMachine['registryDown'] = { reason: null }
  let clock = Date.parse('2026-10-14T09:00:00Z')
  const ctx: Context = {
    state,
    names,
    docker,
    containers,
    hqControl: new HqControl(docker, names.container('hq-server')),
    machine: { name: 'hq-box', hostServiceVersion: '0.2.0' },
    signatures: async (ref, signer) => {
      checked.push([ref, signer.identity])
      return signatures.get(ref) ?? { kind: 'signed', digest: digestOf(ref) }
    },
    machinePaths: machinePathsFrom(docker, names.hostContainer),
    figuresWarning: null,
    sleep: async ms => { clock += ms },
    now: () => new Date(clock),
    waits: { hqMs: 60_000, siteMs: 30_000, pollMs: 3_000 },
    backupIO: backups,
    // Nothing answers on HQ's relay unless a test stands one in.
    dial: (_url, _headers, events) => {
      setTimeout(() => events.close(), 0)
      return { send: () => {}, close: () => {} }
    },
    reach: async () => true,
    // The test runner's own ports would make the check depend on what runs where the tests run.
    portInUse: async port => heldPorts.has(port),
    // The test runner's own interfaces would make the subnets chosen depend on the machine the tests run on.
    machineAddresses: () => [],
    registryTags: async repository => {
      if (registryDown.reason) throw new Error(registryDown.reason)
      return tags.get(repository) ?? []
    },
    // Never the real registry: a test that wants an answer gives its own.
    registryPlatformDigest: async () => null,
  }
  return { ctx, calls, dir, hq, up, missingImages, signatures, checked, caddyRefuses, backups, tags, registryDown, agentContainers, agentNetworks, dockerNetworks, machineContainers, heldPorts, containerEnvs, siteReport, containers, consoleLocalJoin, consoleAnswers, landlock, system, volumes, images, imagesInUse, dockerFails, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

/** A digest that stands in for an image's, the same for the same name. */
export function digestOf(ref: string): string {
  let h = 0
  for (const c of ref) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `sha256:${h.toString(16).padStart(8, '0').repeat(8)}`
}
