/**
 * The Fleet Console's compose project against a real Docker (`npm run test:container`), laid out as on HQ's machine:
 * its own network with its port published to 127.0.0.1, and HQ's link network, where a stand-in for hq-web runs.
 * Build the Fleet Console's image first, at the repository root:
 * `docker build -f console/docker/Dockerfile -t agenthix-console .` (or name another with CONSOLE_IMAGE).
 * It publishes on a free port it chooses on 127.0.0.1 (CONSOLE_TEST_PORT overrides), so it runs beside an installation's
 * Fleet Console, and refuses to start, touching nothing, when that port is held. Its project, container and networks carry a namespace
 * of its own for the run, and every docker command goes through the guard (`containerGuard.ts`), so it can run
 * beside a real install and touch none of it.
 */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { composeJson } from '../projects'
import { CONSOLE_PORT, consoleProject } from '../console'
import { machineSubnets } from '../../__tests__/containerSubnets'
import { claimNames, guardedDocker, freePorts, portsTaken, testNamespace } from '../../__tests__/containerGuard'

const IMAGE = process.env.CONSOLE_IMAGE || 'agenthix-console'
let PORT = Number(process.env.CONSOLE_TEST_PORT) || 0
const NS = testNamespace('console')
const names = claimNames(NS)
const HQ_WEB = names.container('hq-web')
let dir: string
let file: string

const docker = guardedDocker(NS, { stdio: ['ignore', 'pipe', 'pipe'] })
const compose = (...args: string[]) => docker('compose', '-p', names.consoleProject, '-f', file, ...args)
const consoleExec = (...args: string[]) => docker('exec', names.consoleContainer, ...args)

/** What `wget` in a container on `network` gets from `url`: the status line, or why it got none. */
function fetchFrom(network: string, url: string): string {
  try {
    return docker('run', '--rm', '--network', network, '--entrypoint', 'wget', IMAGE, '-S', '-q', '-O', '-', '-T', '5', url)
  } catch (err) {
    return String((err as { stderr?: unknown }).stderr ?? err)
  }
}

function get(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port: PORT, path: '/api/status', headers: { host } }, res => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    // A connection the published port accepts and then stalls must end, so the caller can ask again.
    request.setTimeout(3000, () => request.destroy(new Error('no answer within 3 seconds')))
    request.on('error', reject)
  })
}

/** The first real answer to `host`, asking again for up to 15 seconds while the published port gives none. */
async function getWhenAnswered(host: string): Promise<number> {
  let status = 0
  for (let tries = 0; tries < 50 && status === 0; tries++) {
    status = await get(host).catch(() => 0)
    if (status === 0) await new Promise(r => setTimeout(r, 300))
  }
  return status
}

const ownAddress = () => {
  const inspect = JSON.parse(docker('inspect', names.consoleContainer))[0]
  return inspect.NetworkSettings.Networks[names.consoleNetwork].IPAddress as string
}

beforeAll(async () => {
  if (PORT === 0) [PORT] = await freePorts(1)
  else if ((await portsTaken([PORT])).length) throw new Error(`CONSOLE_TEST_PORT ${PORT} is held on this machine. It touched nothing; choose another.`)
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'console-compose-'))
  docker('network', 'create', names.hqLinkNetwork)
  // Answers to hq-web's name on the link network, as hq-web does; the Fleet Console only needs to resolve it to start.
  docker('run', '-d', '--name', HQ_WEB, '--network', names.hqLinkNetwork, '--entrypoint', 'sleep', IMAGE, '600')
  const project = consoleProject(names, {
    version: 'dev', images: { console: IMAGE }, hqAddress: 'http://127.0.0.1:4100', onHqMachine: true, installedAt: new Date().toISOString(),
  }, 'test-box', { pairingSecret: 'p'.repeat(64) }, machineSubnets(docker, names), {
    namespace: names.namespace, ports: { hq: null, console: PORT }, agentRange: null, recordedAt: new Date().toISOString(),
  })
  file = path.join(dir, 'compose.json')
  fs.writeFileSync(file, composeJson(project))
  compose('up', '-d')
  for (let i = 0; i < 100; i++) {
    if (docker('logs', names.consoleContainer).includes('listening')) return
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error(`The Fleet Console did not start:\n${docker('logs', names.consoleContainer)}`)
})

afterAll(() => {
  if (file) docker.quiet('compose', '-p', names.consoleProject, '-f', file, 'down', '--volumes')
  docker.quiet('rm', '-f', HQ_WEB)
  docker.quiet('network', 'rm', names.hqLinkNetwork)
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
})

describe('the Fleet Console on its own network, published to 127.0.0.1 @SC-861', () => {
  it('listens on its own network’s address, taking the gateway of each network it is on as its one peer there', () => {
    const inspect = JSON.parse(docker('inspect', names.consoleContainer))[0]
    const own = inspect.NetworkSettings.Networks[names.consoleNetwork]
    expect(docker('logs', names.consoleContainer)).toContain(`listening on ${own.IPAddress}:${CONSOLE_PORT} in its container, from the gateway of each network it is on only`)
    expect(inspect.HostConfig.NetworkMode).not.toBe('host')
  })

  it('answers a browser on the machine at 127.0.0.1, and refuses another Host header', async () => {
    // Docker's published port can still be wiring up just after the server logs that it listens: a connection it
    // accepts and drops then is not the console's answer, so it is asked again, for a few seconds at most.
    expect(await getWhenAnswered(`127.0.0.1:${PORT}`)).toBe(200)
    expect(await getWhenAnswered('evil.example')).toBe(421)
  })

  it('is not published on any address of the machine but 127.0.0.1', () => {
    expect(docker('port', names.consoleContainer, `${CONSOLE_PORT}/tcp`).trim().split('\n')).toEqual([`127.0.0.1:${PORT}`])
  })

  it('answers nothing on HQ’s link network, to hq-web or anything else there', () => {
    const fromLink = fetchFrom(names.hqLinkNetwork, `http://${names.consoleContainer}:${CONSOLE_PORT}/api/status`)
    expect(fromLink).not.toMatch(/HTTP\/1\.1 200/)
    expect(fromLink).toMatch(/refused|timed out|can't connect|bad address|403/i)
    const toOwn = fetchFrom(names.hqLinkNetwork, `http://${ownAddress()}:${CONSOLE_PORT}/api/status`)
    expect(toOwn).not.toMatch(/HTTP\/1\.1 200/)
  })

  it('refuses any other peer on its own network', () => {
    expect(fetchFrom(names.consoleNetwork, `http://${ownAddress()}:${CONSOLE_PORT}/api/status`)).toMatch(/403/)
  })

  it('takes a packet only on the network its source is reached through', () => {
    expect(consoleExec('cat', '/proc/sys/net/ipv4/conf/all/rp_filter').trim()).toBe('1')
  })

  it('runs without raw packets, as every service on HQ’s link network does', () => {
    const inspect = JSON.parse(docker('inspect', names.consoleContainer))[0]
    expect(inspect.HostConfig.CapDrop.map((c: string) => c.replace(/^CAP_/, ''))).toContain('NET_RAW')
  })
})
