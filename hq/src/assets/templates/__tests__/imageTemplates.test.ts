/**
 * Agenthix's own templates in hq's image, read as boot installs them: every one built from its sources into a package
 * the pipeline accepts, its role skills named under it, its shared skills the shelf's own, and Kernel's never among them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import { IMAGE_TEMPLATE_KINDS, imageTemplateArrivals, imageTemplateSources } from '../imageTemplates'
import { readSkillSources } from '../imageBuild'
import { listShelf } from '../../sources/imageShelf'
import { fingerprintOf } from '../../content'
import { previewImageInstall } from '../../install/preview'
import type { Db } from '../../../packages/packageStore'
import type { SignatureVerifier } from '../../signing/types'

const prev = process.env.HQ_ASSETS_ROOT
beforeAll(() => { process.env.HQ_ASSETS_ROOT = path.resolve(__dirname, '../../../../assets') })
afterAll(() => { if (prev === undefined) delete process.env.HQ_ASSETS_ROOT; else process.env.HQ_ASSETS_ROOT = prev })

const emptyDb = {
  org: { findFirst: async () => null },
  asset: { findUnique: async () => null },
} as unknown as Db
const noVerifier: SignatureVerifier = { verify: async () => { throw new Error('the image is never verified') }, trustRootAge: () => ({ issuedAt: new Date(0), expired: false }) }

describe("the templates in hq's image @SC-1635", () => {
  it('are every agent template but Kernel, every board template and every team template', async () => {
    expect((await imageTemplateArrivals('agent')).map(a => a.arrived.root)).toEqual(['product-manager', 'project-manager', 'qa', 'skills-engineer', 'wasp-developer'])
    expect((await imageTemplateArrivals('board')).map(a => a.arrived.root)).toEqual(['ideation', 'issues', 'kanban', 'roadmap', 'sprint', 'workforce-assembly'])
    expect((await imageTemplateArrivals('team')).map(a => a.arrived.root)).toEqual(['ai-startup', 'content-studio', 'dev-team', 'research-lab', 'solo-dev'])
  })

  it('include the task templates, each valid and installable as a task template', async () => {
    const arrivals = await imageTemplateArrivals('task-template')
    expect(arrivals.map(a => a.arrived.root)).toEqual(['issues', 'product-roadmap'])
    for (const arrival of arrivals) {
      const preview = await previewImageInstall(arrival, { db: emptyDb, verifier: noVerifier, now: new Date() })
      expect({ root: arrival.arrived.root, refusal: preview.refusal, kind: preview.main.kind, embedded: preview.embedded.length })
        .toEqual({ root: arrival.arrived.root, refusal: null, kind: 'task-template', embedded: 0 })
    }
  })

  it('keep no copy of a shared skill: every one is built from the shelf, the same content and version (T11, I5)', async () => {
    for (const kind of IMAGE_TEMPLATE_KINDS) {
      for (const { root, files } of await imageTemplateSources(kind)) {
        expect({ root, manifests: files.filter(f => /^skills\/[^/]+\/package\.json$/.test(f.path)).map(f => f.path) }).toEqual({ root, manifests: [] })
      }
    }
    const shelf = new Map((await listShelf()).map(s => [s.name, s]))
    for (const arrival of await imageTemplateArrivals('team')) {
      const preview = await previewImageInstall(arrival, { db: emptyDb, verifier: noVerifier, now: new Date() })
      const shared = preview.embedded.filter(e => !e.name.includes('/'))
      expect(shared.length).toBeGreaterThan(0)
      for (const skill of shared) {
        const source = shelf.get(skill.name)!
        expect({ name: skill.name, version: skill.version, fingerprint: skill.fingerprint }).toEqual({ name: source.name, version: source.version, fingerprint: fingerprintOf(source.files) })
      }
    }
  })

  it('carry the 23 shared skills the team templates used to keep by hand', async () => {
    const counts = await Promise.all((await imageTemplateArrivals('team')).map(async a => (await previewImageInstall(a, { db: emptyDb, verifier: noVerifier, now: new Date() })).embedded.length))
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(23)
  })

  it('name, for every board they start, a board template in the image, by its bare name', async () => {
    const boards = new Set((await imageTemplateArrivals('board')).map(a => a.arrived.root))
    for (const arrival of await imageTemplateArrivals('team')) {
      const team = JSON.parse(arrival.arrived.files.find(f => f.path === 'team.json')!.content.toString()) as { projects: Array<{ boards: Array<{ template: string }> }> }
      for (const ref of team.projects.flatMap(p => p.boards.map(b => b.template))) expect({ team: arrival.arrived.root, ref, found: boards.has(ref) }).toEqual({ team: arrival.arrived.root, ref, found: true })
    }
  })

  it("keep Kernel's three skills inside Kernel's own template, never offered on the shelf (5.6)", async () => {
    const kernel = await imageTemplateSources('agent')
    expect(kernel.some(t => t.root === 'kernel')).toBe(false)
    const shelf = (await listShelf()).map(s => s.name)
    for (const name of ['assembly', 'orchestrate', 'planning']) expect(shelf).not.toContain(name)
    const fs = await import('node:fs/promises')
    const dir = path.resolve(__dirname, '../../../../assets/library/agents/kernel')
    expect((await fs.readdir(path.join(dir, 'skills'))).sort()).toEqual(['assembly', 'orchestrate', 'planning'])
    expect(JSON.parse(await fs.readFile(path.join(dir, 'agent.json'), 'utf-8')).skills.sort()).toEqual(['assembly', 'orchestrate', 'planning'])
    expect(await fs.readFile(path.join(dir, 'skills/planning/SKILL.md'), 'utf-8')).not.toMatch(/sys-tpl-/)
  })

  it("never carry a built-in skill or Kernel's own", async () => {
    const { builtIn } = await readSkillSources()
    for (const kind of IMAGE_TEMPLATE_KINDS) {
      for (const arrival of await imageTemplateArrivals(kind)) {
        const folders = new Set(arrival.arrived.files.filter(f => f.path.startsWith('skills/')).map(f => f.path.split('/')[1]))
        for (const name of [...builtIn, 'assembly', 'orchestrate', 'planning']) expect({ root: arrival.arrived.root, has: folders.has(name), name }).toEqual({ root: arrival.arrived.root, has: false, name })
      }
    }
  })

  it('each installs as agenthix/<name>, with nothing refused', async () => {
    for (const kind of IMAGE_TEMPLATE_KINDS) {
      for (const arrival of await imageTemplateArrivals(kind)) {
        const preview = await previewImageInstall(arrival, { db: emptyDb, verifier: noVerifier, now: new Date() })
        expect({ root: arrival.arrived.root, refusal: preview.refusal }).toEqual({ root: arrival.arrived.root, refusal: null })
        expect(preview).toMatchObject({ state: 'built-in', publisher: 'agenthix', kind, main: { identity: `agenthix/${arrival.arrived.root}`, outcome: 'new' } })
        for (const skill of preview.embedded) expect(skill.identity).toMatch(new RegExp(`^agenthix/(${arrival.arrived.root}/)?[a-z0-9-]+$`))
      }
    }
  })

  it('carry the role skills of their template under its name', async () => {
    const pm = (await imageTemplateArrivals('agent')).find(a => a.arrived.root === 'project-manager')!
    const preview = await previewImageInstall(pm, { db: emptyDb, verifier: noVerifier, now: new Date() })
    expect(preview.embedded.map(e => e.identity)).toContain('agenthix/project-manager/read-context')
    expect(preview.summary).toMatch(/^This agent template brings \d+ skills: \d+ for its role\.$/)
  })
})
