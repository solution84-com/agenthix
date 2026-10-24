import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { prisma } from '../../test/db'
import { createAgent, createUserWithRole } from '../../test/factories'

// Logs and diagnostics operations (logs and diagnostics spec), against the real
// test database. Only what leaves HQ is replaced: the channel to each site, and
// the site's run store behind it.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
const h = vi.hoisted(() => ({ online: new Set<string>(), request: vi.fn() }))
vi.mock('../../sites/channel', () => {
  class ChannelRequestFailed extends Error {
    constructor(message: string, readonly code: string) { super(message) }
  }
  return {
    ChannelRequestFailed,
    siteChannelRegistry: {
      isOnline: (id: string) => h.online.has(id),
      get onlineSiteIds() { return [...h.online] },
      request: h.request,
    },
  }
})

import { getDiagnosticsHealth, checkDiagnosticsHealthNow, getRecentErrors, getDiagnosticsSummary } from '../operations'
import { getLogSources, getLogs, downloadLogs, buildSupportBundle } from '../logOperations'
import { noteSchedulerTick, __resetSchedulerTickForTests } from '../hqHealth'
import { startLogFile } from '../../server/utils/logFile'
import { Logger } from '../../server/utils/logger'
import { makeSiteUnreachable, reset as resetRunStore } from '../../test/fakes/siteRuntimeStore'
import { BUILD_INFO } from '../../server/buildInfo'

const entities = new Proxy({}, {
  get: (_target, name: string) => (prisma as unknown as Record<string, unknown>)[name[0].toLowerCase() + name.slice(1)],
})
const ctx = (user?: { id: string }) => ({ user, entities }) as any

const SECRET = 'sk-ant-oat01-AClaudeLoginThatMustNeverLeaveTheMachine'
const HEALTH = {
  takenAt: new Date().toISOString(), runs: { running: 2, maxAtOnce: 4 }, disk: { freeBytes: 182e9, totalBytes: 500e9 },
  docker: { running: true, version: '27.1' }, agentImage: { name: 'agenthix/agent', present: true, version: '0.4.0' },
  ceilings: null, memoryNearlyFull: false,
}

let logDir: string
beforeAll(async () => {
  logDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-logs-'))
  startLogFile(logDir)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  new Logger('dispatch').error(`run r-1 failed for Frontend dev with ${SECRET}`, { runId: 'r-1', token: SECRET })
  new Logger('Scheduler').info('tick: 1 pulse(s)')
})
afterAll(async () => {
  vi.restoreAllMocks()
  await fs.rm(logDir, { recursive: true, force: true })
})

let admin: { id: string }
let builtIn: { id: string; siteId: string }
let laptop: { id: string; siteId: string }
beforeEach(async () => {
  vi.clearAllMocks()
  resetRunStore()
  __resetSchedulerTickForTests()
  h.online = new Set(['hq-site'])
  // As the first account an install makes: organisation admin and fleet admin.
  admin = await createUserWithRole('ADMIN', { fleetAdmin: true })
  builtIn = await prisma.executionSite.create({
    data: { siteId: 'hq-site', label: 'HQ built in', status: 'ONLINE', isDefault: true, protocolVersion: '1.0', lastSeenAt: new Date(), health: HEALTH, healthReportedAt: new Date() } as any,
  })
  laptop = await prisma.executionSite.create({
    data: { siteId: 'laptop', label: 'Design laptop', status: 'OFFLINE', protocolVersion: '1.0', lastSeenAt: new Date(Date.now() - 86400_000) } as any,
  })
  await prisma.executionSite.create({ data: { siteId: 'gone', label: 'Gone', status: 'REVOKED' } as any })
})

describe('every operation is for organisation admins only @SC-724', () => {
  // Health, the logs and the support bundle carry a machine's figures, versions and lines: a fleet admin's (spec §10).
  const ops: [string, (a: any, c: any) => unknown, unknown, boolean][] = [
    ['getDiagnosticsHealth', getDiagnosticsHealth, undefined, true],
    ['checkDiagnosticsHealthNow', checkDiagnosticsHealthNow, undefined, true],
    ['getRecentErrors', getRecentErrors, {}, false],
    ['getDiagnosticsSummary', getDiagnosticsSummary, undefined, false],
    ['getLogSources', getLogSources, undefined, true],
    ['getLogs', getLogs, { source: 'hq' }, true],
    ['downloadLogs', downloadLogs, { source: 'hq' }, true],
    ['buildSupportBundle', buildSupportBundle, {}, true],
  ]
  for (const [name, op, args, fleetOnly] of ops) {
    it(name, async () => {
      const member = await createUserWithRole('MEMBER')
      await expect((async () => op(args, ctx()))()).rejects.toMatchObject({ statusCode: 401 })
      await expect((async () => op(args, ctx(member)))()).rejects.toMatchObject({ statusCode: 403 })
    })
    it(`${name} ${fleetOnly ? 'refuses an organisation admin who is not a fleet admin' : 'answers an organisation admin who is not a fleet admin'}`, async () => {
      const orgAdmin = await createUserWithRole('ADMIN')
      const answer = (async () => op(args, ctx(orgAdmin)))()
      if (fleetOnly) await expect(answer).rejects.toMatchObject({ statusCode: 403 })
      else await expect(answer).resolves.toBeDefined()
    })
  }
})

describe('Health @SC-725', () => {
  it("gives HQ's own facts and a card for each site it still has", async () => {
    noteSchedulerTick(true)
    makeSiteUnreachable('laptop')
    const health = await getDiagnosticsHealth(undefined, ctx(admin))
    expect(health.hq).toMatchObject({ version: BUILD_INFO.version, databaseAnswers: true, sitesKnown: 2, schedulerLastTick: { ok: true } })
    expect(health.hq.runningSince.getTime()).toBeLessThanOrEqual(Date.now())
    expect(health.sites.map(s => s.label)).toEqual(["HQ built in · HQ's site", 'Design laptop'])
    expect(health.sites[0]).toMatchObject({ connected: true, runStore: 'answers', health: { runs: { running: 2, maxAtOnce: 4 } } })
    expect(health.sites[1]).toMatchObject({ connected: false, runStore: 'not-connected' })
  })

  it('Check again asks every connected site for its health now and keeps the answer', async () => {
    const now = { ...HEALTH, takenAt: new Date().toISOString(), docker: { running: false, version: null } }
    h.request.mockResolvedValueOnce(now)
    const result = await checkDiagnosticsHealthNow(undefined, ctx(admin))
    expect(h.request).toHaveBeenCalledWith('hq-site', 'site.healthNow', {}, expect.any(Number))
    expect(result.sitesAsked).toBe(1)
    expect(result.sites[0].health?.docker.running).toBe(false)
    expect(result.sites[0].problems).toContainEqual({ kind: 'dockerDown' })
  })
})

describe('Logs @SC-728', () => {
  it("lists HQ and each site, saying which cannot be read now", async () => {
    const sources = await getLogSources(undefined, ctx(admin))
    expect(sources.map(s => [s.source, s.notice === null])).toEqual([['hq', true], [builtIn.id, true], [laptop.id, false]])
    expect(sources.map(s => s.label)).toEqual(['HQ', "HQ built in · HQ's site", 'Design laptop'])
  })

  it("reads HQ's own lines, errors and warnings first, with every secret gone", async () => {
    // Everything this file's operations log lands in the same file, so the lines are found by what they say.
    const page = await getLogs({ source: 'hq' }, ctx(admin))
    const failed = page.lines.find(l => l.source === 'dispatch')
    expect(failed?.fields).toMatchObject({ runId: 'r-1', token: '[redacted]' })
    expect(page.lines.every(l => l.level === 'error' || l.level === 'warn')).toBe(true)
    expect(JSON.stringify(page)).not.toContain(SECRET)
    const everything = await getLogs({ source: 'hq', levels: 'all', search: 'pulse' }, ctx(admin))
    expect(everything.lines.map(l => l.message)).toEqual(['tick: 1 pulse(s)'])
  })

  it("reads a site's lines from the site when asked, checking each and removing what it left in", async () => {
    h.request.mockResolvedValueOnce({
      lines: [
        { at: '2026-10-10T11:04:10.000Z', level: 'error', source: 'dispatch', message: `login refused ${SECRET}` },
        { level: 'error', message: 'not a line' },
      ],
      nextCursor: '2026-10-10.000.jsonl:3',
    })
    const page = await getLogs({ source: builtIn.id, search: 'login' }, ctx(admin))
    expect(h.request).toHaveBeenCalledWith('hq-site', 'site.readLogs', expect.objectContaining({ levels: 'problems', search: 'login' }), expect.any(Number))
    expect(page.lines).toHaveLength(1)
    expect(page.lines[0].message).not.toContain(SECRET)
    expect(page.nextCursor).toBe('2026-10-10.000.jsonl:3')
    expect(await prisma.recordedError.count()).toBe(0)
  })

  it('says a site that is not connected cannot be read, and refuses a source it does not have', async () => {
    const page = await getLogs({ source: laptop.id }, ctx(admin))
    expect(page).toMatchObject({ lines: [], nextCursor: null, source: { connected: false, notice: expect.stringContaining('Design laptop is not connected') } })
    expect(h.request).not.toHaveBeenCalled()
    await expect(getLogs({ source: 'nope' }, ctx(admin))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('downloads a source and range as text, oldest first @SC-729', async () => {
    const file = await downloadLogs({ source: 'hq', levels: 'all' }, ctx(admin))
    expect(file.fileName).toMatch(/^agenthix-logs-hq-\d{4}-\d{2}-\d{2}\.txt$/)
    const lines = file.text.trim().split('\n')
    const failed = lines.findIndex(l => l.includes('ERROR [dispatch] run r-1 failed'))
    const tick = lines.findIndex(l => l.includes('INFO  [Scheduler] tick: 1 pulse(s)'))
    expect(failed).toBeGreaterThanOrEqual(0)
    expect(tick).toBeGreaterThan(failed)
    expect(file.text).not.toContain(SECRET)
  })
})

describe('Support bundle @SC-730', () => {
  it('holds versions, settings set or not, health, errors and logs; no secret, no value and no name', async () => {
    vi.stubEnv('SECRETS_MASTER_KEY', 'a-master-key-value-nobody-may-read')
    await createAgent({ name: 'Frontend dev' })
    h.request.mockResolvedValue({ lines: [{ at: new Date().toISOString(), level: 'warn', source: 'sites', message: 'Docker is not running' }], nextCursor: null })

    const bundle = await buildSupportBundle({}, ctx(admin))
    expect(bundle.files.map(f => f.path)).toEqual([
      'README.txt', 'versions.json', 'settings.json', 'health.json', 'recent-errors.json', 'logs/hq.log', 'logs/hq-built-in-hq-s-site.log',
    ])
    expect(bundle.covers).toBe('HQ and 2 sites · Design laptop not connected, so only its last health report')
    const all = bundle.files.map(f => f.text).join('\n')
    expect(all).not.toContain(SECRET)
    expect(all).not.toContain('a-master-key-value-nobody-may-read')
    expect(all).not.toContain('Frontend dev')
    expect(all).toMatch(/run r-1 failed for agent-\d+/)
    expect(JSON.parse(bundle.files[2].text)).toContainEqual({ name: 'SECRETS_MASTER_KEY', set: true })
    expect(bundle.files[0].text).toContain('Design laptop is not connected')

    const zip = await JSZip.loadAsync(bundle.zipBase64, { base64: true })
    expect(Object.keys(zip.files).filter(n => !zip.files[n].dir).sort()).toEqual(bundle.files.map(f => f.path).sort())
    expect(await zip.file('logs/hq.log')!.async('string')).toBe(bundle.files[5].text)
    expect(bundle.sizeBytes).toBeGreaterThan(0)
    vi.unstubAllEnvs()
  })
})

describe('the Infrastructure row @SC-724', () => {
  it('counts the errors of the last 24 hours and the sites whose logs can be read', async () => {
    expect(await getRecentErrors({ range: '7d' }, ctx(admin))).toMatchObject({ range: '7d', groups: [] })
    expect(await getDiagnosticsSummary(undefined, ctx(admin))).toEqual({ errorsLast24h: 0, sitesWithLogs: 1, sites: 2 })
  })
})
