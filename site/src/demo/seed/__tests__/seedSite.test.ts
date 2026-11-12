import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadDemoSeed, parseFrontMatter, seedIds, type DemoSeed } from '@agenthix/core'
import { seedFiles, seedSiteRows, type SeedDb, type SiteSeedDeps } from '../index'

const REPO_DEMO = path.resolve(import.meta.dirname, '../../../../../demo')
const NOW = new Date('2026-11-11T12:00:00.000Z')

type Call = { model: string; method: string; args: any } // eslint-disable-line @typescript-eslint/no-explicit-any -- recorded Prisma arguments are any shape

function fakeDb(): { db: SeedDb; calls: Call[] } {
  const calls: Call[] = []
  const db = new Proxy({}, {
    get: (_t, model: string) => new Proxy({}, { get: (_m, method: string) => async (args: unknown) => { calls.push({ model, method, args }); return { count: 1 } } }),
  }) as unknown as SeedDb
  return { db, calls }
}
const created = (calls: Call[], model: string) => calls.filter(c => c.model === model && c.method === 'create').map(c => c.args.data)

function deps() {
  const written = new Map<string, Buffer>()
  const dirs: string[] = []
  const d: SiteSeedDeps = {
    now: NOW,
    siteId: 'this-site',
    paths: {
      projectFilesDir: p => `/root/projects/${p}/files`,
      workspaceDir: (p, w) => `/root/projects/${p}/workspaces/${w}`,
      taskDir: (p, t) => `/root/projects/${p}/tasks/${t}`,
      knowledgePagesDir: o => `/root/knowledge/${o.ownerType}/${o.ownerId}/pages`,
      artefactsDir: p => `/root/projects/${p}/artefacts`,
    },
    writeFile: async (file, content) => { written.set(file, content) },
    makeDir: async dir => { dirs.push(dir) },
  }
  return { d, written, dirs }
}

let seed: DemoSeed
beforeAll(async () => {
  seed = await loadDemoSeed(REPO_DEMO, { list: dir => readdir(dir), read: file => readFile(file, 'utf8') })
})

describe('the site\'s part of the seed @SC-1991', () => {
  it('writes each session and run under the ids hq\'s part uses', async () => {
    const { db, calls } = fakeDb()
    await seedSiteRows(db, seed, deps().d)
    const ids = seedIds(seed)
    const sessions = created(calls, 'agentSession')
    expect(sessions.map(s => s.id)).toEqual(seed.activity.sessions.map(s => s.id))
    expect(sessions.map(s => s.sessionKey)).toEqual(seed.activity.sessions.map(s => s.sessionKey))
    const web2 = sessions.find(s => s.taskId === ids.tasks['WEB-2'])
    expect(web2.userId).toBe(ids.people.sam)
    expect(web2.agentId).toBe(ids.agents.writer)
    expect(web2.primaryOwnerId).toBe(ids.projects.WEB)
    expect(created(calls, 'agentRun').map(r => r.id)).toEqual(seed.activity.sessions.map(s => s.run.id))
  })

  it('dates runs from now, and ends them as the data says', async () => {
    const { db, calls } = fakeDb()
    await seedSiteRows(db, seed, deps().d)
    const runs = created(calls, 'agentRun')
    const failed = runs.find(r => r.status === 'FAILED')
    expect(failed.error).toContain('npm run build')
    expect(failed.outputText).toBeNull()
    for (const r of runs) {
      expect(r.startedAt.getTime()).toBeLessThan(NOW.getTime())
      expect(r.endedAt.getTime()).toBeGreaterThan(r.startedAt.getTime())
    }
    const waiting = runs.find(r => r.manifestStatus === 'PENDING_APPROVAL')
    expect(waiting.pendingManifest.tools[0].name).toBe('WebFetch')
    const entries = calls.find(c => c.model === 'transcriptEntry' && c.args.data.some((e: { kind?: string }) => e.kind === 'APPROVAL_REQUESTED'))
    expect(entries).toBeTruthy()
  })

  it('never dates a row\'s creation after the moment the seed runs', async () => {
    const { db, calls } = fakeDb()
    await seedSiteRows(db, seed, deps().d)
    const rows = calls.flatMap(c => (Array.isArray(c.args?.data) ? c.args.data : c.args?.data ? [c.args.data] : []))
    const stamped = rows.map(r => r.createdAt).filter((v): v is Date => v instanceof Date)
    expect(stamped.length).toBeGreaterThan(15)
    for (const d of stamped) expect(d.getTime()).toBeLessThanOrEqual(NOW.getTime())
  })

  it('keeps the workspaces\' ids, with a repository on one of them', async () => {
    const { db, calls } = fakeDb()
    await seedSiteRows(db, seed, deps().d)
    expect(created(calls, 'workspace').map(w => w.id)).toEqual(seed.site.workspaces.map(w => w.id))
    expect(created(calls, 'workspace').every(w => w.siteId === 'this-site')).toBe(true)
    expect(created(calls, 'repoAttachment')).toHaveLength(1)
  })

  it('makes only the site\'s own rows', async () => {
    const { db, calls } = fakeDb()
    await seedSiteRows(db, seed, deps().d)
    const models = new Set(calls.map(c => c.model))
    for (const hqOnly of ['user', 'project', 'task', 'conversation', 'aiProvider']) expect(models.has(hqOnly)).toBe(false)
  })

  it('writes the attachment, the project files and Knowledge for every project and the organisation', async () => {
    const { d, written } = deps()
    await seedFiles(seed, d)
    const ids = seedIds(seed)
    const attachment = seed.organisation.attachments[0]
    const file = written.get(`/root/projects/${ids.projects.WEB}/tasks/${ids.tasks['WEB-1']}/${attachment.uuid}/${attachment.fileName}`)
    expect(file?.length).toBe(attachment.sizeBytes)
    expect(file?.subarray(0, 5).toString()).toBe('%PDF-')
    for (const key of Object.keys(ids.projects)) {
      const dir = `/root/knowledge/project/${ids.projects[key]}/pages/`
      expect([...written.keys()].some(k => k.startsWith(dir)), `Knowledge for ${key}`).toBe(true)
    }
    expect([...written.keys()].some(k => k.startsWith('/root/knowledge/org/org/pages/'))).toBe(true)
    expect(written.has(`/root/projects/${ids.projects.QTR}/files/figures/q3-summary.md`)).toBe(true)
  })

  it('writes every Knowledge page with a description, so none is listed as needing a fix', async () => {
    const { d, written } = deps()
    await seedFiles(seed, d)
    const pages = [...written.entries()].filter(([k]) => k.includes('/knowledge/'))
    expect(pages.length).toBeGreaterThan(8)
    const needFix = pages.filter(([, v]) => !/^description: .+/m.test(v.toString()))
    // The guide's sample keeps one page without a description on purpose, so Needs fixing has something to list.
    expect(needFix.map(([k]) => k)).toEqual([expect.stringContaining('reference/old-notes.md')])
  })

  it('writes every Knowledge page with front matter the Knowledge reader takes without a problem', async () => {
    const { d, written } = deps()
    await seedFiles(seed, d)
    const pages = [...written.entries()].filter(([k]) => k.includes('/knowledge/'))
    expect(pages.length).toBe(seed.site.knowledge.reduce((n, k) => n + k.pages.length, 0))
    for (const [file, content] of pages) expect(parseFrontMatter(content.toString()).problems, file).toEqual([])
  })

  it('writes a few real files into each seeded workspace, so neither opens empty (usability finding 8)', async () => {
    const { d, written } = deps()
    await seedFiles(seed, d)
    const web = seedIds(seed).projects.WEB
    const inWorkspace = (name: string) => {
      const w = seed.site.workspaces.find(x => x.name === name)!
      return [...written.keys()].filter(k => k.startsWith(`/root/projects/${web}/workspaces/${w.id}/`)).map(k => k.split(`${w.id}/`)[1])
    }
    expect(inWorkspace('website-code')).toEqual(expect.arrayContaining(['README.md', 'index.html']))
    expect(inWorkspace('case-study-drafts')).toEqual(expect.arrayContaining(['README.md', 'harbour-bakery.md']))
    const code = seed.site.workspaces.find(x => x.name === 'website-code')!
    expect(written.get(`/root/projects/${web}/workspaces/${code.id}/README.md`)?.toString()).toContain('# Fernhill & Co website')
  })

  it('writes an artefact in Website relaunch, and the organisation skill it was given there', async () => {
    const { d, written } = deps()
    await seedFiles(seed, d)
    const web = seedIds(seed).projects.WEB
    expect(written.get(`/root/projects/${web}/artefacts/launch-week-checklist.md`)?.toString()).toContain('# Launch week checklist')
    expect(written.get(`/root/projects/${web}/files/.agents/skills/client-report-style/SKILL.md`)?.toString()).toContain('identity: ')
  })
})
