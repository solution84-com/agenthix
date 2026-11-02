/**
 * A run's egress proxy container: the proxy's program (`program/`) in a container of its own, on the run's internal
 * network at a fixed address and on its own way out. It runs in the site's executor image, which has Node, as the
 * same unprivileged user as the steps and hardened as they are, and is handed its program on standard input, so
 * nothing of it is on the machine's disk. The site keeps the attached `docker start` until the run ends; nothing the
 * proxy writes is logged, by Docker or by the site.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { executorImageName } from '../../agents/runtime/agentImage'
import { composeProjectLabelArgs, labelKey } from '../../agents/runtime/containerLabels'
import { docker, dockerWithin } from '../../agents/runtime/containerLifecycle'
import { ipv6OffArgs } from '../../agents/runtime/ipv6Off'
import { STEP_UID } from '../stepContainer'
import { removeContainer } from '../stepRunner'
import type { EgressProxyConfig } from './program/proxyMain'
import { egressProxyProgram } from './program/source'

const READY_TIMEOUT_MS = 30_000
const INSPECT_TIMEOUT_MS = 30_000

export const proxyLabel = () => labelKey('workflow-proxy')

export type ProxyContainerSpec = {
  runId: string
  name: string
  internalNetwork: string
  egressNetwork: string
  config: EgressProxyConfig
  /** Name servers the proxy itself resolves with; Docker's own when empty. Tests point it at a logging resolver. */
  upstreamDns?: string[]
}

export type ProxyContainer = { stop(): Promise<void> }

export function proxyCreateArgs(s: ProxyContainerSpec, image: string): string[] {
  return [
    'create', '-i',
    '--name', s.name,
    '--label', `${proxyLabel()}=${s.runId}`,
    ...composeProjectLabelArgs('egress-proxy'),
    '--network', s.internalNetwork,
    '--ip', s.config.address,
    ...(s.upstreamDns ?? []).flatMap(a => ['--dns', a]),
    '--user', `${STEP_UID}:${STEP_UID}`,
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--read-only',
    // An unprivileged user binds the approved ports and DNS's own, below 1024, without a capability.
    '--sysctl', 'net.ipv4.ip_unprivileged_port_start=0',
    ...ipv6OffArgs(),
    '--memory', '256m',
    '--memory-swap', '256m',
    '--pids-limit', '64',
    '--cpus', '1',
    '--log-driver', 'none',
    '--restart', 'no',
    '--init',
    image,
    'node', '--input-type=module', '-',
  ]
}

async function proxyImage(): Promise<string> {
  const name = executorImageName()
  const { stdout } = await dockerWithin(['image', 'inspect', '--format', '{{.Id}}', name], INSPECT_TIMEOUT_MS).catch(() => {
    throw new Error(`The egress proxy runs in the executor image ${name}, which this machine does not have.`)
  })
  return stdout.trim()
}

/** Creates and starts the proxy, and returns once it listens; on any failure it is removed again and this throws. */
export async function startProxyContainer(s: ProxyContainerSpec): Promise<ProxyContainer> {
  await docker(proxyCreateArgs(s, await proxyImage()))
  let child: ChildProcess | null = null
  const stop = async () => {
    child?.kill()
    await removeContainer(s.name)
  }
  try {
    await docker(['network', 'connect', s.egressNetwork, s.name])
    child = spawn('docker', ['start', '-a', '-i', s.name], { stdio: ['pipe', 'pipe', 'pipe'] })
    await ready(child, egressProxyProgram(s.config))
    return { stop }
  } catch (err) {
    await stop().catch(() => {})
    throw err
  }
}

function ready(child: ChildProcess, program: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let out = ''
    let err = ''
    let settled = false
    const settle = (e?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (e) reject(e)
      else resolve()
    }
    const timer = setTimeout(() => settle(new Error(`The egress proxy was not ready within ${READY_TIMEOUT_MS / 1000} s.`)), READY_TIMEOUT_MS)
    child.stdout!.on('data', d => {
      if (settled) return
      out += d
      for (const line of out.split('\n').slice(0, -1)) {
        const said = parse(line)
        if (said?.ready === true) settle()
        else if (typeof said?.failed === 'string') settle(new Error(`The egress proxy could not start: ${said.failed}.`))
      }
    })
    child.stderr!.on('data', d => { if (!settled) err = (err + d).slice(-2000) })
    child.on('error', e => settle(e))
    child.on('exit', code => settle(new Error(`The egress proxy stopped as it started (${code}): ${err.trim()}`)))
    child.stdin!.on('error', () => {})
    child.stdin!.end(program)
  })
}

function parse(line: string): { ready?: unknown; failed?: unknown } | null {
  try {
    return JSON.parse(line) as { ready?: unknown; failed?: unknown }
  } catch {
    return null
  }
}

/** The proxy containers on this machine of this site's namespace, of every run. */
export async function listProxyContainers(): Promise<string[]> {
  const { stdout } = await dockerWithin(['ps', '-a', '--filter', `label=${proxyLabel()}`, '--format', '{{.Names}}'], INSPECT_TIMEOUT_MS)
  return stdout.split('\n').map(s => s.trim()).filter(Boolean)
}
