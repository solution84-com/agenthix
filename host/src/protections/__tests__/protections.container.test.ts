/**
 * The agent protections against a real Docker (`npm run test:container`, after building the image as
 * image.container.test.ts says): the host service is started as the guide's command starts it, with the machine's
 * network and NET_ADMIN, and a container on a network in the agents' range tries what an agent following a planted
 * instruction would. A container outside the range tries the same, so a refusal is known to be the rules'.
 *
 * It changes this machine's firewall while it runs: one table of its own, `<namespace>_agents`, removed afterwards. Its
 * namespace is its own for the run, recorded in the state folder, so its containers, network, volume and table are
 * its own, and every docker command goes through the guard (`containerGuard.ts`). Its agent slice is a block of the
 * tests' range, recorded as a site's first install records one, so an installation's rules on the same machine, which
 * cover that installation's own slice alone, never refuse its probes. Its two stand-ins publish free ports it chooses.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADDRESS_BLOCKS } from '@agenthix/core'
import { tableFor } from '../rules'
import { claimNames, guardedDocker, freePorts, recordNamespace, testNamespace } from '../../__tests__/containerGuard'

const IMAGE = process.env.HOST_IMAGE || 'agenthix-host'
const NS = testNamespace('prot')
const NAMES = claimNames(NS)
const HOST = NAMES.hostContainer
const VOLUME = NAMES.hostFiguresVolume
const NET = `${NS}-probe-agents`
/** A block of the tests' range, outside every installation's agent slice: the test's own slice and its one agent network. */
const SUBNET = `${ADDRESS_BLOCKS.tests.split('.').slice(0, 2).join('.')}.250.0/29`
const GATEWAY = SUBNET.replace(/0\/29$/, '1')
const [PUBLISHED, MACHINE_PORT] = await freePorts(2)
const TABLE = tableFor(NS)
let state: string

const docker = guardedDocker(NS, { timeout: 60_000 })
const tryDocker = docker.quiet

const SERVE = (port: number) => `require('node:http').createServer((q, r) => r.end('reached')).listen(${port})`
/** Prints `reached` or `refused` for one http request, within three seconds. */
const PROBE = `
const req = require('node:http').get(process.argv[1], { timeout: 3000 }, r => { r.resume(); r.on('end', () => console.log('reached')) })
req.on('timeout', () => { req.destroy(); console.log('refused') })
req.on('error', () => console.log('refused'))
`
function probe(network: string, url: string): 'reached' | 'refused' {
  const out = docker('run', '--rm', '--network', network, '--entrypoint', 'node', IMAGE, '-e', PROBE, url).trim()
  return out.endsWith('reached') ? 'reached' : 'refused'
}

beforeAll(async () => {
  state = fs.mkdtempSync(path.join(os.tmpdir(), 'host-prot-'))
  // A namespace of its own, so the rules are a table of their own; a slice of its own, which they cover.
  recordNamespace(state, NS)
  const file = path.join(state, 'installation.json')
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), agentRange: SUBNET }))
  docker('volume', 'create', VOLUME)
  docker('network', 'create', '--driver', 'bridge', '--subnet', SUBNET, NET)
  docker('run', '-d', '--name', `${NS}-published`, '-p', `${PUBLISHED}:8080`, '--entrypoint', 'node', IMAGE, '-e', SERVE(8080))
  docker('run', '-d', '--name', `${NS}-machine`, '--network', 'host', '--entrypoint', 'node', IMAGE, '-e', SERVE(MACHINE_PORT))
  docker('run', '-d', '--name', HOST, '-v', `${state}:/state`, '-v', `${VOLUME}:/run/host-figures`, '--network', 'host', '--cap-add', 'NET_ADMIN', IMAGE)
  for (let i = 0; i < 100; i++) {
    if (docker('logs', HOST).includes('Agent protections')) break
    await new Promise(r => setTimeout(r, 200))
  }
})

afterAll(() => {
  tryDocker('exec', HOST, 'nft', 'delete', 'table', 'inet', TABLE)
  tryDocker('exec', HOST, 'sh', '-c', 'rm -rf /state/* /state/.[!.]*')
  for (const c of [HOST, `${NS}-published`, `${NS}-machine`]) tryDocker('rm', '-f', c)
  tryDocker('network', 'rm', NET)
  tryDocker('volume', 'rm', VOLUME)
  if (state) fs.rmSync(state, { recursive: true, force: true })
})

describe('the agent protections on this machine @SC-824', () => {
  it('hold once the host service has started, and say so', () => {
    expect(docker('logs', HOST)).toContain('Agent protections hold.')
    expect(docker('exec', HOST, 'nft', 'list', 'table', 'inet', TABLE)).toMatch(/hook input[\s\S]*hook forward/)
  })

  it('shut the machine’s own ports to an agent', () => {
    expect(probe('bridge', `http://172.17.0.1:${MACHINE_PORT}/`)).toBe('reached')
    expect(probe(NET, `http://${GATEWAY}:${MACHINE_PORT}/`)).toBe('refused')
  })

  it('shut ports other containers publish on the machine', () => {
    expect(probe('bridge', `http://172.17.0.1:${PUBLISHED}/`)).toBe('reached')
    expect(probe(NET, `http://${GATEWAY}:${PUBLISHED}/`)).toBe('refused')
  })

  it('shut the cloud metadata addresses', () => {
    expect(probe(NET, 'http://169.254.169.254/latest/meta-data/')).toBe('refused')
    const forward = docker('exec', HOST, 'nft', 'list', 'chain', 'inet', TABLE, 'forward')
    const line = forward.split('\n').find(l => l.includes('"metadata-address"')) ?? ''
    for (const a of ['169.254.0.0/16', '168.63.129.16', '100.100.100.200']) expect(line).toContain(a)
  })

  it('leave ordinary internet access (set HOST_TEST_INTERNET=1 where the machine has it)', () => {
    if (process.env.HOST_TEST_INTERNET !== '1') return
    expect(probe(NET, 'http://example.com/')).toBe('reached')
  })

  it('on Docker Desktop, also shut the computer Docker runs on', () => {
    if (!/linuxkit/i.test(docker('info', '--format', '{{.KernelVersion}}'))) return
    const forward = docker('exec', HOST, 'nft', 'list', 'chain', 'inet', TABLE, 'forward')
    expect(forward).toMatch(/ip daddr \{?\s*\d+\.\d+\.\d+\.\d+[^\n]*drop comment "machine-ports"/)
  })

  // Last: it removes the table, and the rules are back only once the host service has seen it.
  it('are put back within a minute when something removes them', async () => {
    docker('exec', HOST, 'nft', 'delete', 'table', 'inet', TABLE)
    expect(probe(NET, `http://${GATEWAY}:${PUBLISHED}/`)).toBe('reached')
    for (let i = 0; i < 75; i++) {
      try {
        docker('exec', HOST, 'nft', 'list', 'table', 'inet', TABLE)
        break
      } catch {
        await new Promise(r => setTimeout(r, 1000))
      }
    }
    expect(probe(NET, `http://${GATEWAY}:${PUBLISHED}/`)).toBe('refused')
  }, 120_000)
})
