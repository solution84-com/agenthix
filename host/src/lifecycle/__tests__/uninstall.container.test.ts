/**
 * `agenthix uninstall` against a real Docker (`npm run test:container`, after building the image as
 * image.container.test.ts says). A host service is started as the guide's command starts it, with the machine's
 * network and NET_ADMIN, so its protections write their firewall table; an agent container in the agents' group and a
 * network of the install stand beside it. Uninstalled, nothing named after the namespace is left: no container, volume
 * or network, no firewall table, and an empty state folder, which the person removes.
 *
 * It changes this machine's firewall while it runs: one table of its own, `<namespace>_agents`. Its namespace is its
 * own for the run, recorded in the state folder, and every docker command it runs goes through the guard
 * (`containerGuard.ts`). Teardown removes whatever of that namespace a failing run left.
 */
import { ADDRESS_BLOCKS } from '@agenthix/core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { tableFor } from '../../protections/rules'
import { helperName } from '../../launcher/uninstall'
import { claimNames, guardedDocker, recordNamespace, testNamespace } from '../../__tests__/containerGuard'

const IMAGE = process.env.HOST_IMAGE || 'agenthix-host'
const NS = testNamespace('uninst')
const NAMES = claimNames(NS)
const HOST = NAMES.hostContainer
const HELPER = helperName(NAMES)
const AGENT = `${NS}-agent-probe`
const TABLE = tableFor(NS)
/** The installation's agent slice, from the tests' block: without one the host service writes no rules. */
const SLICE = `${ADDRESS_BLOCKS.tests.split('.').slice(0, 2).join('.')}.251.0/29`
const docker = guardedDocker(NS, { timeout: 120_000 })
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The machine's firewall tables, listed from a container on the machine's network, as the host service sees them. */
const tables = () => docker('run', '--rm', '--network', 'host', '--cap-add', 'NET_ADMIN', '--entrypoint', 'nft', IMAGE, 'list', 'tables')
const ours = (listing: string) => listing.split('\n').map(n => n.trim()).filter(n => n.startsWith(`${NS}-`))
const containers = () => ours(docker('ps', '-a', '--format', '{{.Names}}'))

describe('agenthix uninstall on a real machine @SC-1163', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'host-uninst-'))
  const state = path.join(tmp, 'state')

  beforeAll(async () => {
    fs.mkdirSync(state)
    recordNamespace(state, NS)
    const file = path.join(state, 'installation.json')
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), agentRange: SLICE }))
    docker('network', 'create', NAMES.hqLinkNetwork)
    docker('run', '-d', '--name', AGENT, '--label', `com.docker.compose.project=${NAMES.agentsProject}`,
      '--entrypoint', 'node', IMAGE, '-e', 'setInterval(() => {}, 60_000)')
    docker('run', '-d', '--name', HOST, '-v', '/var/run/docker.sock:/var/run/docker.sock', '-v', `${state}:/state`,
      '-v', `${NAMES.hostFiguresVolume}:/run/host-figures`, '--network', 'host', '--cap-add', 'NET_ADMIN',
      '--label', `com.docker.compose.project=${NAMES.hostProject}`, IMAGE)
    for (let i = 0; i < 100 && !docker('logs', HOST).includes('Agent protections'); i++) await wait(200)
  })

  afterAll(() => {
    for (const c of [HOST, HELPER, AGENT]) docker.quiet('rm', '-f', c)
    docker.quiet('run', '--rm', '--network', 'host', '--cap-add', 'NET_ADMIN', '--entrypoint', 'nft', IMAGE, 'delete', 'table', 'inet', TABLE)
    docker.quiet('volume', 'rm', NAMES.hostFiguresVolume)
    docker.quiet('network', 'rm', NAMES.hqLinkNetwork)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('leaves nothing named after the namespace: containers, volumes, networks, the firewall table; and the state folder empty', async () => {
    expect(docker('logs', HOST)).toContain('Agent protections hold.')
    expect(tables()).toContain(`table inet ${TABLE}`)

    const said = docker('exec', HOST, 'agenthix', 'uninstall', '--yes')
    expect(said).toMatch(/Removing the agent protections \.+ done/)
    expect(said).toContain('Uninstalled.')

    for (let i = 0; i < 60 && containers().length; i++) await wait(1000)
    expect(containers()).toEqual([])
    expect(ours(docker('volume', 'ls', '--format', '{{.Name}}'))).toEqual([])
    expect(ours(docker('network', 'ls', '--format', '{{.Name}}'))).toEqual([])
    expect(tables()).not.toContain(TABLE)
    // The helper is given the state folder alone, so it empties it and leaves the folder for the person to remove.
    expect(fs.readdirSync(state)).toEqual([])
  }, 180_000)
})
