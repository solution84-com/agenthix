import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadDemoSeed, type DemoSeed } from '@agenthix/core'
import { seedHqDemo } from '../index'
import { seedSecrets } from '../secrets'
import { seedsInsteadOfFirstAdmin, shouldStartProviderHealth } from '../decision'
import { DEMO_PROVIDER_KEY, NEVER_CHECKED } from '../types'
import { created, fakeDb } from './fakeDb'
import { NOW, deps } from './fakeDeps'
import { readSkillMd } from '../../../assets/skillFile'

const REPO_DEMO = path.resolve(import.meta.dirname, '../../../../../demo')
const place = { siteId: 'site-row', siteLogicalId: 'site-logical', kernelId: 'kernel-id' }

let seed: DemoSeed
beforeAll(async () => {
  seed = await loadDemoSeed(REPO_DEMO, { list: dir => readdir(dir), read: file => readFile(file, 'utf8') })
})

describe('hq\'s part of the seed @SC-1977', () => {
  it('writes each skill\'s SKILL.md with front matter hq can read, whatever its words hold', async () => {
    const files: string[] = []
    const real = deps()
    const d = deps({ publishSkill: async (db, skill, agents) => { files.push(skill.files[0].content.toString('utf-8')); return real.publishSkill(db, skill, agents) } })
    await seedHqDemo(fakeDb().db, seed, place, d)
    expect(files.length).toBeGreaterThan(0)
    for (const text of files) expect(readSkillMd(text).headerError).toBeNull()
  })

  it('writes every person with the fixed id, a password nobody knows, and no fleet admin', async () => {
    const { db, calls } = fakeDb()
    const d = deps()
    await seedHqDemo(db, seed, place, d)
    const users = created(calls, 'user')
    expect(users.map(u => u.id)).toEqual(seed.organisation.people.map(p => p.id))
    expect(users.some(u => 'fleetAdmin' in u)).toBe(false)
    expect(new Set(d.passwords).size).toBe(seed.organisation.people.length)
    expect(users[0].auth.create.identities.create.providerData).toContain('hash(random-1)')
    expect(created(calls, 'userSettings').map(s => s.role)).toEqual(seed.organisation.people.map(p => p.role))
  })

  it('dates everything from now, in minutes', async () => {
    const { db, calls } = fakeDb()
    await seedHqDemo(db, seed, place, deps())
    const tasks = created(calls, 'task')
    const web2 = tasks.find(t => t.title === 'Write the home page copy')
    const source = seed.organisation.tasks.find(t => t.key === 'WEB-2')!
    expect(web2.createdAt.getTime()).toBe(NOW.getTime() + source.createdAt * 60_000)
    expect(web2.createdAt.getTime()).toBeLessThan(NOW.getTime())
    const waiting = tasks.find(t => t.title === 'Draft the case-study page')
    expect(waiting.scheduleAt.getTime()).toBeGreaterThan(NOW.getTime())
    expect(waiting.runState).toBe('RUN_NONE')
  })

  it('makes the same rows at every start, apart from the random passwords and turn ids', async () => {
    const a = fakeDb(); await seedHqDemo(a.db, seed, place, deps())
    const b = fakeDb(); await seedHqDemo(b.db, seed, place, deps())
    const ids = (calls: typeof a.calls) => calls.filter(c => c.args?.data?.id).map(c => c.args.data.id)
    expect(ids(a.calls)).toEqual(ids(b.calls))
    expect(created(a.calls, 'task').map(t => t.id)).toEqual(seed.organisation.tasks.map(t => t.id))
  })

  it('never dates a row\'s creation after the moment the seed runs, even for things scheduled ahead', async () => {
    const { db, calls } = fakeDb()
    await seedHqDemo(db, seed, place, deps())
    const rows = calls.flatMap(c => (Array.isArray(c.args?.data) ? c.args.data : c.args?.data ? [c.args.data] : []))
    const nested = (row: Record<string, unknown>): Record<string, unknown>[] => [row, ...Object.values(row).flatMap(v => (v && typeof v === 'object' && Array.isArray((v as { create?: unknown }).create) ? (v as { create: Record<string, unknown>[] }).create.flatMap(nested) : []))]
    const stamped = rows.flatMap(nested).flatMap(r => ['createdAt', 'at', 'replacedAt', 'approvedAt'].map(k => r[k]).filter((v): v is Date => v instanceof Date))
    expect(stamped.length).toBeGreaterThan(50)
    for (const d of stamped) expect(d.getTime()).toBeLessThanOrEqual(NOW.getTime())
  })

  it('creates an epic before the tasks in it', async () => {
    const { db, calls } = fakeDb()
    await seedHqDemo(db, seed, place, deps())
    const order = created(calls, 'task').map(t => t.id)
    for (const t of seed.organisation.tasks.filter(x => x.epic)) {
      expect(order.indexOf(seed.organisation.tasks.find(e => e.key === t.epic)!.id)).toBeLessThan(order.indexOf(t.id))
    }
  })

  it('stores providers as working with the fake key, sealed, and never due a check', async () => {
    const { db, calls } = fakeDb()
    const d = deps()
    await seedHqDemo(db, seed, place, d)
    const providers = created(calls, 'aiProvider')
    expect(providers).toHaveLength(seed.library.providers.length)
    for (const p of providers) {
      expect(p.state).toBe('works')
      expect(p.lastCheckedAt).toBe(NEVER_CHECKED)
      expect(p.secret).toMatch(/^sealed\(/)
    }
    expect(d.sealed.filter(s => s === DEMO_PROVIDER_KEY)).toHaveLength(providers.length)
    expect(JSON.stringify(calls, (_k, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(DEMO_PROVIDER_KEY)
  })

  it('seals a conversation and gives a person\'s message the turn its answer has', async () => {
    const { db, calls } = fakeDb()
    const d = deps()
    await seedHqDemo(db, seed, place, d)
    const conversations = created(calls, 'conversation')
    expect(conversations).toHaveLength(seed.activity.conversations.length)
    for (const c of conversations) {
      const [asked, answered] = c.messages.create
      expect(asked.turnId).toBeTruthy()
      expect(asked.turnId).toBe(answered.turnId)
      expect(asked.body).toMatch(/^sealed\(/)
    }
    expect(conversations.find(c => c.title.startsWith('Plan a first week')).agentId).toBe('kernel-id')
  })

  it('seeds what the guide leaves empty, with no secret value in the rows', async () => {
    const { db, calls } = fakeDb()
    const d = deps()
    await seedHqDemo(db, seed, place, d)
    expect(d.skills).toEqual(['client-report-style'])
    expect(created(calls, 'workflow')).toHaveLength(1)
    const versions = created(calls, 'workflowVersion')
    expect(versions[0].hash).toMatch(/^[0-9a-f]{64}$/)
    expect(created(calls, 'workflowRun').map(r => r.state)).toEqual(['PASSED', 'FAILED'])
    const [failed] = created(calls, 'workflowRun').filter(r => r.state === 'FAILED')
    expect(failed.steps.create.map((s: { state: string }) => s.state)).toEqual(['PASSED', 'FAILED', 'SKIPPED'])
    expect(calls.some(c => c.model === 'placeSecret')).toBe(false)
    expect(created(calls, 'workspacePlacement').map(w => w.workspaceId)).toEqual(seed.site.workspaces.map(w => w.id))
    expect(created(calls, 'taskAttachment').map(a => a.fileName)).toEqual(['site-map.pdf'])
    expect(d.instructions).toHaveLength(seed.organisation.agents.length)
  })

  it("numbers each seeded run and records its result, so a task's earlier run reads as Run 1 with what it achieved", async () => {
    const { db, calls } = fakeDb()
    await seedHqDemo(db, seed, place, deps())
    const results = created(calls, 'runResult')
    expect(results.map(r => r.runId)).toEqual(seed.activity.sessions.map(s => s.run.id))
    for (const s of seed.activity.sessions) {
      const row = results.find(r => r.runId === s.run.id)
      expect(row.number).toBe(1)
      expect(row.siteId).toBe(place.siteLogicalId)
      if (s.run.status === 'COMPLETED' && !s.run.endsWith) expect(row).toMatchObject({ result: s.run.output, stated: true })
      else expect(row).toMatchObject({ result: null, stated: false })
    }
    const counted = calls.filter(c => c.model === 'task' && c.method === 'update' && c.args.data.runCount !== undefined)
    expect(counted.map(c => c.args.data.runCount)).toEqual(seed.activity.sessions.map(() => 1))
  })

  it('writes only hq\'s tables', async () => {
    const { db, calls } = fakeDb()
    await seedHqDemo(db, seed, place, deps())
    const models = new Set(calls.map(c => c.model))
    for (const siteOnly of ['agentRun', 'transcriptEntry', 'toolCallLog', 'workspace', 'repoAttachment']) expect(models.has(siteOnly)).toBe(false)
    expect(created(calls, 'agentSession').map(s => s.id)).toEqual(seed.activity.sessions.map(s => s.id))
  })
})

describe('the secrets @SC-1977', () => {
  it('are names with no value anyone holds, written through the secret store', async () => {
    const d = deps()
    const written: { place: unknown; secret: Record<string, unknown>; record: Record<string, unknown> }[] = []
    const made = await seedSecrets(seed, { createSecret: async (place, secret, record) => { written.push({ place, secret, record }); return true } }, d)
    expect(made).toBe(1)
    expect(written[0].secret.name).toBe('STAGING_DEPLOY_KEY')
    expect(written[0].place).toEqual({ type: 'project', id: seed.organisation.projects.find(p => p.key === 'WEB')!.id })
    expect(written[0].record.action).toBe('SET')
    expect((written[0].record.at as Date).getTime()).toBeLessThanOrEqual(NOW.getTime())
    expect(d.secrets).toEqual([{ id: written[0].secret.id, project: (written[0].place as { id: string }).id }])
  })

  it('leave one that is already there alone', async () => {
    expect(await seedSecrets(seed, { createSecret: async () => false }, deps())).toBe(0)
  })
})

describe('what replaces the first-admin link @SC-1977 @SC-1978', () => {
  it('is demo mode on an empty database, and nothing else', () => {
    expect(seedsInsteadOfFirstAdmin(true, { DEMO_MODE: 'true' })).toBe(true)
    expect(seedsInsteadOfFirstAdmin(false, { DEMO_MODE: 'true' })).toBe(false)
  })

  it('is never with the setting off', () => {
    expect(seedsInsteadOfFirstAdmin(true, {})).toBe(false)
    expect(seedsInsteadOfFirstAdmin(true, { DEMO_MODE: 'false' })).toBe(false)
    expect(seedsInsteadOfFirstAdmin(true, { DEMO_MODE: '1' })).toBe(false)
    expect(seedsInsteadOfFirstAdmin(true, { DEMO_MODE: 'TRUE' })).toBe(false)
  })
})

describe('the provider health sweep @SC-1978', () => {
  it('does not start in demo mode, so the fake key is never sent to a vendor', () => {
    expect(shouldStartProviderHealth({ DEMO_MODE: 'true' })).toBe(false)
  })

  it('starts as before with the setting off', () => {
    expect(shouldStartProviderHealth({})).toBe(true)
    expect(shouldStartProviderHealth({ DEMO_MODE: 'false' })).toBe(true)
  })
})

describe('what the lead finds @SC-1977', () => {
  it('has a working provider with a key and a default conversation model, and sets no tool permission', async () => {
    const { db, calls } = fakeDb()
    await seedHqDemo(db, seed, place, deps())
    const org = calls.find(c => c.model === 'org' && c.args.data.defaultConversationModel)!.args.data
    expect(org.defaultConversationProviderId).toBeTruthy()
    expect(org.defaultConversationModel).toBeTruthy()
    const provider = created(calls, 'aiProvider').find(p => p.vendor === 'anthropic')
    expect(provider.secret).toBeTruthy()
    expect(provider.state).toBe('works')
    // Nothing the seed writes touches a permission: the lead's tools keep their default.
    expect(JSON.stringify(calls, (_k, v) => (typeof v === 'bigint' ? String(v) : v))).not.toMatch(/ermission/)
  })
})
