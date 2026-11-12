import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DemoSeedError, loadDemoSeed, parseDemoSeed, readDemoSeed } from '../seedLoad.js'
import { seedTime } from '../seed.js'

const REPO_DEMO = path.resolve(import.meta.dirname, '../../../../demo')
const nodeReader = { list: (dir: string) => readdir(dir), read: (file: string) => readFile(file, 'utf8') }

describe('the demo seed in the repository @SC-1985', () => {
  it('loads, with every reference resolved', async () => {
    const seed = await loadDemoSeed(REPO_DEMO, nodeReader)
    expect(seed.organisation.people.map(p => p.key)).toEqual(['sam', 'priya', 'alex', 'jordan', 'kai'])
    expect(seed.organisation.tasks.map(t => t.key)).toContain('WEB-2')
    expect(seed.organisation.people.some(p => 'fleetAdmin' in p)).toBe(false)
  })

  it('has what the guide\'s sample leaves empty', async () => {
    const seed = await loadDemoSeed(REPO_DEMO, nodeReader)
    expect(seed.library.workflows[0].runs.map(r => r.state)).toEqual(['PASSED', 'FAILED'])
    expect(seed.library.skills).toHaveLength(1)
    expect(seed.library.secrets.map(s => s.name)).toEqual(['STAGING_DEPLOY_KEY'])
    expect(seed.site.attachmentFiles.map(f => f.fileName)).toEqual(['site-map.pdf'])
    for (const p of seed.organisation.projects) {
      expect(seed.site.knowledge.some(k => 'project' in k.owner && k.owner.project === p.key), `Knowledge for ${p.key}`).toBe(true)
    }
  })

  it('gives every Knowledge page a few short sections, and keeps the guide\'s own text where the demo\'s grew', async () => {
    const seed = await loadDemoSeed(REPO_DEMO, nodeReader)
    for (const k of seed.site.knowledge) {
      for (const page of k.pages) {
        const body = page.content.replace(/^---[\s\S]*?---\n/, '')
        expect(body.match(/^## /gm)?.length ?? 0, page.path).toBeGreaterThanOrEqual(2)
        expect(body.length, page.path).toBeGreaterThan(400)
        if (k.inGuide) expect(page.guide, page.path).toBeTruthy()
        if (page.guide) expect(page.content.startsWith(page.guide.trimEnd()), page.path).toBe(true)
      }
    }
  })

  it('refers to the tasks by the keys of the guide\'s sample', async () => {
    const seed = await loadDemoSeed(REPO_DEMO, nodeReader)
    const keys = new Set(seed.organisation.tasks.map(t => t.key))
    for (const key of ['WEB-1', 'WEB-2', 'WEB-3', 'WEB-7', 'RES-2', 'QTR-1', 'QTR-2', 'QTR-5']) expect(keys.has(key)).toBe(true)
  })

  it('keeps every identifier fixed, so two loads agree', async () => {
    const a = await loadDemoSeed(REPO_DEMO, nodeReader)
    const b = await loadDemoSeed(REPO_DEMO, nodeReader)
    expect(a).toEqual(b)
    expect(a.activity.sessions.every(s => s.id !== s.sessionKey)).toBe(true)
  })
})

describe('parseDemoSeed @SC-1985', () => {
  const load = () => readDemoSeed(REPO_DEMO, nodeReader)
  const mutate = async (file: 'organisation' | 'activity' | 'library' | 'site', change: (doc: any) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any -- a test edits the parsed JSON freely
    const texts = await load()
    const doc = JSON.parse(texts[file])
    change(doc)
    return { ...texts, [file]: JSON.stringify(doc) }
  }

  it('refuses text that is not JSON', async () => {
    expect(() => parseDemoSeed({ ...{ organisation: '', activity: '{}', library: '{}', site: '{}' } })).toThrow(DemoSeedError)
  })

  it('refuses a task in a project that is not there', async () => {
    const texts = await mutate('organisation', d => { d.tasks[0].project = 'NOPE' })
    expect(() => parseDemoSeed(texts)).toThrow(/project NOPE is not in the data/)
  })

  it('refuses a session on a task that is not there, and a duplicated id', async () => {
    const texts = await mutate('activity', d => { d.sessions[0].task = 'WEB-99'; d.sessions[1].id = d.sessions[0].id })
    const err = (() => { try { parseDemoSeed(texts) } catch (e) { return e as DemoSeedError } })()
    expect(err?.problems.map(p => p.message).join('\n')).toMatch(/task WEB-99 is not in the data/)
    expect(err?.problems.map(p => p.message).join('\n')).toMatch(/used twice/)
  })

  it('refuses a path that leaves its folder', async () => {
    const texts = await mutate('site', d => { d.files[0].path = '../escape.md' })
    expect(() => parseDemoSeed(texts)).toThrow(/not a plain relative path/)
  })

  it("refuses a workspace file that leaves the workspace's folder, or sits in a .git folder", async () => {
    const out = await mutate('site', d => { d.workspaces[0].files = [{ path: '../escape.md', content: 'x' }] })
    expect(() => parseDemoSeed(out)).toThrow(/website-code: \.\.\/escape\.md is not a plain relative path/)
    const git = await mutate('site', d => { d.workspaces[0].files = [{ path: '.git/config', content: 'x' }] })
    expect(() => parseDemoSeed(git)).toThrow(/inside a \.git folder/)
  })

  it("gives each seeded workspace a few files of its own", async () => {
    const texts = await mutate('site', () => {})
    const seed = parseDemoSeed(texts)
    for (const w of seed.site.workspaces) expect(w.files?.length ?? 0).toBeGreaterThan(0)
  })

  it('refuses an attachment file with no attachment row', async () => {
    const texts = await mutate('organisation', d => { d.attachments = [] })
    expect(() => parseDemoSeed(texts)).toThrow(/has no attachment row/)
  })
})

describe("parseDemoSeed: the sprint, the invitation, the skill's places and the artefacts @SC-1985", () => {
  const mutate = async (file: 'organisation' | 'library' | 'site', change: (doc: any) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any -- a test edits the parsed JSON freely
    const texts = await readDemoSeed(REPO_DEMO, nodeReader)
    const doc = JSON.parse(texts[file])
    change(doc)
    return { ...texts, [file]: JSON.stringify(doc) }
  }

  it('refuses an epic or a backlog task in a sprint, and a task of another project', async () => {
    const texts = await mutate('organisation', d => { d.sprints[0].tasks.push('WEB-8', 'WEB-6', 'RES-2') })
    const err = (() => { try { parseDemoSeed(texts) } catch (e) { return e as DemoSeedError } })()
    const said = err?.problems.map(p => p.message).join('\n')
    expect(said).toMatch(/WEB-8 is an epic or in the backlog/)
    expect(said).toMatch(/WEB-6 is an epic or in the backlog/)
    expect(said).toMatch(/RES-2 is not a task of WEB/)
  })

  it('refuses an invitation that is no longer waiting', async () => {
    const texts = await mutate('organisation', d => { d.invitations[0].expiresAt = -1 })
    expect(() => parseDemoSeed(texts)).toThrow(/it is not waiting/)
  })

  it("refuses a skill added to a project with no copy of it in the project's files", async () => {
    const texts = await mutate('site', d => { d.files = d.files.filter((f: { path: string }) => !f.path.startsWith('.agents/skills/')) })
    expect(() => parseDemoSeed(texts)).toThrow(/site.files has no .agents\/skills\/client-report-style\/SKILL.md there/)
  })

  it('refuses an artefact whose name is a path', async () => {
    const texts = await mutate('site', d => { d.artefacts[0].name = '../escape.md' })
    expect(() => parseDemoSeed(texts)).toThrow(/not a plain file name/)
  })
})

describe('seedTime @SC-1985', () => {
  it('counts minutes from now, the past negative', () => {
    const now = new Date('2026-11-11T12:00:00.000Z')
    expect(seedTime(now, -90).toISOString()).toBe('2026-11-11T10:30:00.000Z')
    expect(seedTime(now, 1440).toISOString()).toBe('2026-11-12T12:00:00.000Z')
  })
})
