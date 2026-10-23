import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { Firewall, type NftRunner } from '../../protections/firewall'
import { AgentProtections, protectionFigures, useProtections } from '../../protections/protections'
import type { RuleSet } from '../../protections/rules'
import { POSTGRES_IMAGE } from '../../images/published'
import { binEntries } from '../bin'
import { fetchedImages, type UninstallPlan } from '../uninstall'
import type { Uninstalled } from '../uninstallSteps'

const ADDRESS = 'https://hq.acme.example'
const HQ_IMAGE = `ghcr.io/solution84-com/agenthix-hq-server\t<none>\tsha256:${'1'.repeat(64)}`
const OLD_SITE_IMAGE = `ghcr.io/solution84-com/agenthix-site-server\t<none>\tsha256:${'2'.repeat(64)}`
const HOST_IMAGE = `ghcr.io/solution84-com/agenthix-host\t<none>\tsha256:${'3'.repeat(64)}`
const [PG_REPO, PG_DIGEST] = POSTGRES_IMAGE.replace(/:[^@]+@/, '@').split('@')
const POSTGRES = `${PG_REPO}\t<none>\t${PG_DIGEST}`
const SOMEONE_ELSES = `postgres\t16-alpine\tsha256:${'4'.repeat(64)}`

const set: RuleSet = { table: 'agenthix_agents', range: { addr: '10.213.0.0', len: 16 }, machineAddresses: [] }

let m: FakeMachine
let table: boolean
let nft: string[][]
let steps: string[]
let outcomes: string[]

const ask = (data: unknown) =>
  ownerHandler(m.ctx)(data, p => {
    if (p.event === 'step') steps.push(p.step)
    if (p.event === 'stepDone') outcomes.push(p.outcome)
  }) as Promise<{ ok: boolean; result: unknown; refusal?: { code: string; message: string } }>
const plan = async () => (await ask({ op: 'machine.uninstallCheck' })).result as UninstallPlan
const uninstall = async (purge: string[] = []) => ask({ op: 'machine.uninstall', confirmed: true, purge })
const removed = (kind: string) => m.calls.filter(c => c[0] === kind && c[1] === 'rm').map(c => c[2])
const changes = () => m.calls.filter(c => c.includes('rm') || c.includes('down'))


beforeEach(() => {
  m = fakeMachine()
  table = true
  nft = []
  const run: NftRunner = async args => {
    nft.push(args)
    if (args[0] === '-j') return table ? { code: 0, stdout: '{"nftables":[]}', stderr: '' } : { code: 1, stdout: '', stderr: 'Error: No such file or directory' }
    if (args[0] === 'delete') {
      const was = table
      table = false
      return was ? { code: 0, stdout: '', stderr: '' } : { code: 1, stdout: '', stderr: 'Error: No such file or directory' }
    }
    table = true
    return { code: 0, stdout: '', stderr: '' }
  }
  useProtections(new AgentProtections(new Firewall(run), async () => set, () => m.ctx.now()))
  m.volumes.push('agenthix-host-figures', 'agenthix-console-state', 'someone-elses-data')
  m.dockerNetworks.push({ name: 'agenthix-console', subnets: [] }, { name: 'agenthix-hq-link', subnets: [] }, { name: 'bridge', subnets: [] })
  m.agentContainers.push('agenthix-agent-1')
  m.agentNetworks.push('agenthix-agent-1-net')
  m.images.push(HQ_IMAGE, OLD_SITE_IMAGE, HOST_IMAGE, POSTGRES, SOMEONE_ELSES)
  m.imagesInUse.add(`ghcr.io/solution84-com/agenthix-host@sha256:${'3'.repeat(64)}`)
  steps = []
  outcomes = []
})
afterEach(() => m.cleanup())

describe('agenthix uninstall refuses @SC-1159', () => {
  it('while HQ is on the machine, running or suspended, and removes nothing', async () => {
    await install(m.ctx, { address: ADDRESS }, () => {})
    m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
    m.calls.length = 0
    const r = await uninstall()
    expect(r).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    expect(r.refusal!.message).toContain(`HQ at ${ADDRESS} is on hq-box. Nothing was removed.`)
    expect(r.refusal!.message).toContain('agenthix hq erase')
    expect((await ask({ op: 'suspend', target: 'hq' })).ok).toBe(true)
    expect((await uninstall()).refusal!.message).toContain('is on hq-box, suspended.')
    expect(changes()).toEqual([])
    expect(table).toBe(true)
  })

  it('while a site is on the machine, and says to erase it', async () => {
    m.ctx.state.writeJson(['site', 'settings.json'], { name: 'edge-1', installedAt: '2026-10-01T00:00:00Z' })
    const r = await ask({ op: 'machine.uninstallCheck' })
    expect(r.refusal!.message).toBe('Not uninstalled: the site edge-1 is on hq-box. Nothing was removed. Erasing it keeps a final backup for 30 days. Erase it first: agenthix site erase')
  })

  it('while the fleet’s Fleet Console runs here, whose keys would go', async () => {
    m.ctx.state.writeJson(['console', 'settings.json'], { hqAddress: ADDRESS, onHqMachine: false })
    const r = await uninstall()
    expect(r.refusal!.message).toContain('the Fleet Console runs on hq-box, and removing it deletes its keys.')
  })

  it('while the backup location is inside the state folder, which goes', async () => {
    m.ctx.state.writeJson(['backups', 'location.json'], { path: '/home/sam/.agenthix/copies', publicKey: 'k', setAt: '2026-10-01T00:00:00Z' })
    expect((await uninstall()).refusal!.message).toContain('the backup location, /home/sam/.agenthix/copies, is inside the state folder')
  })

  it('unless confirmed', async () => {
    const r = await ask({ op: 'machine.uninstall', purge: [] })
    expect(r.refusal!.message).toBe('Not uninstalled: it was not confirmed. Nothing was removed.')
    expect(changes()).toEqual([])
  })
})

describe('an erased HQ still in the bin @SC-1160', () => {
  beforeEach(async () => {
    await install(m.ctx, { address: ADDRESS }, () => {})
    m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
    expect((await ask({ op: 'erase', target: 'hq', confirmAddress: ADDRESS })).ok).toBe(true)
    m.calls.length = 0
  })

  it('is listed with when it is purged, and blocks the uninstall until its address is typed', async () => {
    expect((await plan()).binned).toEqual([expect.objectContaining({ target: 'hq', name: ADDRESS, purgeAfter: binEntries(m.ctx)[0].purgeAfter })])
    const r = await uninstall(['https://hq.other.example'])
    expect(r.refusal!.message).toMatch(/^Not uninstalled: HQ at https:\/\/hq\.acme\.example was erased and is kept until \d{4}-\d\d-\d\d\. Nothing was removed\./)
    expect(changes()).toEqual([])
    expect(fs.existsSync(m.ctx.state.path('bin'))).toBe(true)
  })

  it('is purged once its address is typed, and the Fleet Console that came with HQ goes too', async () => {
    expect((await uninstall([ADDRESS])).ok).toBe(true)
    expect(steps).toContain('Purging the erased backups')
    expect(outcomes[steps.indexOf('Removing the Fleet Console')]).toBe('done')
    expect(m.calls).toContainEqual(expect.arrayContaining(['compose', '-p', 'agenthix-console', 'down', '--volumes']))
    expect(fs.existsSync(m.ctx.state.path('bin'))).toBe(false)
  })
})

describe('agenthix uninstall @SC-1161', () => {
  it('lists exactly what goes', async () => {
    expect(await plan()).toEqual({
      machine: 'hq-box', binned: [], fleetConsole: false, leavesFleet: false, agentContainers: 1,
      firewallTable: 'agenthix_agents',
      volumes: ['agenthix-console-state', 'agenthix-host-figures'],
      networks: ['agenthix-console', 'agenthix-hq-link', 'agenthix-agent-1-net'],
      images: [
        `ghcr.io/solution84-com/agenthix-hq-server@sha256:${'1'.repeat(64)}`,
        `ghcr.io/solution84-com/agenthix-site-server@sha256:${'2'.repeat(64)}`,
        `ghcr.io/solution84-com/agenthix-host@sha256:${'3'.repeat(64)}`,
        POSTGRES_IMAGE.replace(/:[^@]+@/, '@'),
      ],
      hostContainers: ['agenthix-host'],
      stateFolder: '/home/sam/.agenthix', backupsOnMachine: 0, exports: 0, backupLocation: null,
      hostImage: 'a'.repeat(12),
    })
  })

  it('removes each thing by its namespace name, in order, and the host service’s own container last', async () => {
    const r = await uninstall()
    expect(r.ok).toBe(true)
    expect(steps).toEqual([
      'Removing the Fleet Console', 'Removing the containers left in its groups', 'Removing the agent protections',
      'Removing the volumes', 'Removing the networks', 'Removing the images it fetched',
      "Removing the host service's earlier containers", 'Handing the rest to its helper',
    ])
    expect(m.agentContainers).toEqual([])
    expect(nft.filter(a => a[0] === 'delete')).toEqual([['delete', 'table', 'inet', 'agenthix_agents']])
    // The figures volume is the host service's, in use until its container goes: the helper removes it.
    expect(removed('volume')).toEqual(['agenthix-console-state'])
    expect(m.volumes).toEqual(['agenthix-host-figures', 'someone-elses-data'])
    expect(m.dockerNetworks.map(n => n.name)).toEqual(['bridge'])
    expect(m.agentNetworks).toEqual([])
    expect(m.images).toEqual([HOST_IMAGE, SOMEONE_ELSES])
    expect(m.containers.calls.at(-1)).toMatch(/^run agenthix-host-uninstall sha256:a+ node --enable-source-maps \/app\/dist\/launcher\.js uninstall agenthix \.agenthix$/)
    expect(r.result).toMatchObject({ notRemoved: [], imagesKept: 1, helper: 'agenthix-host-uninstall', stateFolder: '/home/sam/.agenthix' })
  })

  it('no longer keeps the agent protections once their table is removed', async () => {
    await uninstall()
    const applied = nft.filter(a => a[0] === '-f').length
    expect(protectionFigures(m.ctx.now()).holding).toBe(false)
    expect(table).toBe(false)
    expect(nft.filter(a => a[0] === '-f').length).toBe(applied)
  })

  it('says what a failing step did not remove, and still runs the rest', async () => {
    m.dockerFails.add('volume rm')
    const r = await uninstall()
    expect(r.ok).toBe(true)
    expect(outcomes[steps.indexOf('Removing the volumes')]).toBe('failed')
    expect((r.result as Uninstalled).notRemoved).toEqual(['The volume agenthix-console-state: Error response from daemon: the disk is full'])
    expect(m.dockerNetworks.map(n => n.name)).toEqual(['bridge'])
    expect(m.containers.byName('agenthix-host-uninstall')).not.toBeNull()
  })

  it('run again, or after a partial run, removes what is left and fails on nothing it finds gone', async () => {
    m.dockerFails.add('volume rm')
    await uninstall()
    m.dockerFails.clear()
    // The first helper ended without finishing, and stays for its logs.
    m.containers.byName('agenthix-host-uninstall')!.running = false
    steps = []
    outcomes = []
    const r = await uninstall()
    expect(r.ok).toBe(true)
    expect((r.result as Uninstalled).notRemoved).toEqual([])
    expect(m.volumes).toEqual(['agenthix-host-figures', 'someone-elses-data'])
    expect(outcomes).toEqual(['nothing left', 'nothing left', 'nothing left', 'done (1)', 'nothing left', 'nothing left; 1 kept, in use', 'done (1)', 'done'])
  })

  it('is refused while its helper is still finishing @SC-1159', async () => {
    await uninstall()
    const r = await uninstall()
    expect(r.refusal).toMatchObject({ code: 'busy' })
  })
})

describe('the images an uninstall removes @SC-1161', () => {
  const rows = [
    { repository: 'ghcr.io/solution84-com/agenthix-hq-web', tag: '0.2.0', digest: null },
    { repository: 'postgres', tag: '16-alpine', digest: `sha256:${'4'.repeat(64)}` },
    { repository: 'agenthix-hq-server', tag: 'latest', digest: null },
  ]

  it('are those fetched from the published registry and the pinned ones, not a database image of another digest or a local build', () => {
    expect(fetchedImages(rows, '0.2.0')).toEqual(['ghcr.io/solution84-com/agenthix-hq-web:0.2.0'])
  })

  it('are none for a development build, which fetched none', () => {
    expect(fetchedImages(rows, 'dev')).toEqual([])
  })
})
