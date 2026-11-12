import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { PLACE_SKILLS_ROOT, loadDemoSeed, type DemoSeed } from '@agenthix/core'
import { seedHqDemo } from '../index'
import { placeCopy } from '../placeSkills'
import { slugOf } from '../../../assets/publisherNames'
import { created, fakeDb } from './fakeDb'
import { NOW, deps } from './fakeDeps'

const REPO_DEMO = path.resolve(import.meta.dirname, '../../../../../demo')
const place = { siteId: 'site-row', siteLogicalId: 'site-logical', kernelId: 'kernel-id' }

let seed: DemoSeed
beforeAll(async () => {
  seed = await loadDemoSeed(REPO_DEMO, { list: dir => readdir(dir), read: file => readFile(file, 'utf8') })
})

const web = () => seed.organisation.projects.find(p => p.key === 'WEB')!.id

describe("the sample's plans, as the guide's screens show them @SC-1977", () => {
  it("starts Website relaunch's sprint, begun before now, with its tasks in it", async () => {
    const { db, calls } = fakeDb()
    await seedHqDemo(db, seed, place, deps())
    const [sprint] = created(calls, 'sprint')
    expect(sprint.projectId).toBe(web())
    expect(sprint.startDate.getTime()).toBeLessThanOrEqual(NOW.getTime())
    expect(sprint.finishDate.getTime()).toBeGreaterThan(NOW.getTime())
    const planned = calls.find(c => c.model === 'task' && c.method === 'updateMany' && c.args.data.sprintId === sprint.id)
    const ids = seed.organisation.sprints[0].tasks.map(k => seed.organisation.tasks.find(t => t.key === k)!.id)
    expect(planned?.args.where.id.in).toEqual(ids)
  })

  it('leaves the invitation for Robin Ellis waiting, with a link nobody holds', async () => {
    const { db, calls } = fakeDb()
    await seedHqDemo(db, seed, place, deps())
    const [invite] = created(calls, 'invite')
    expect(invite.note).toBe('Robin Ellis')
    expect(invite.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(invite.projectIds).toEqual([web()])
    expect(invite.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime())
    expect(invite.expiresAt.getTime()).toBeGreaterThan(NOW.getTime())
    expect(invite.consumedAt).toBeUndefined()
  })
})

describe("the organisation's skill, added to Website relaunch @SC-1977", () => {
  it("is published under the organisation's name, the one the copy's metadata names", () => {
    expect(slugOf(seed.organisation.org.name)).toBe('fernhill-co')
  })

  it('is recorded as added from the Library and switched on, with the files the site writes there', async () => {
    const { db, calls } = fakeDb()
    await seedHqDemo(db, seed, place, deps())
    const [skill] = created(calls, 'placeSkill')
    expect(skill).toMatchObject({ placeType: 'project', placeId: web(), path: `${PLACE_SKILLS_ROOT}/client-report-style`, group: 'PLACE', switch: 'ON' })
    expect(skill.switchFingerprint).toBe(skill.lastFingerprint)
    const [version] = created(calls, 'placeSkillVersion')
    expect(version).toMatchObject({ number: 1, digest: skill.lastFingerprint, originIdentity: 'fernhill-co/client-report-style', originVersion: '1.0.0' })
  })

  it("stops the seed when the site's copy is not what hq writes there", async () => {
    const changed: DemoSeed = { ...seed, site: { ...seed.site, files: seed.site.files.map(f => (f.path.endsWith('client-report-style/SKILL.md') ? { ...f, content: `${f.content}\nChanged.` } : f)) } }
    await expect(seedHqDemo(fakeDb().db, changed, place, deps())).rejects.toThrow(/client-report-style in WEB/)
  })

  it('has its copy as Add to this place writes it', async () => {
    const skill = seed.library.skills[0]
    const d = deps()
    const text = `---\nname: ${JSON.stringify(skill.name)}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.body}`
    const published = await d.publishSkill(fakeDb().db, { name: skill.name, files: [{ path: 'SKILL.md', content: Buffer.from(text) }], givenToAll: false, grantedTo: [], byId: 'x', at: NOW }, {})
    const copy = placeCopy(published)[0].content.toString('utf-8')
    const onSite = seed.site.files.find(f => f.path === `${PLACE_SKILLS_ROOT}/${skill.name}/SKILL.md`)
    expect(onSite?.content, JSON.stringify(copy)).toBe(copy)
  })
})
