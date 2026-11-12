/** The sample's pictures: every recipe the seed data names is one hq accepts, and each is drawn onto its own row. */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { loadDemoSeed, type DemoSeed } from '@agenthix/core'

const saved = vi.hoisted(() => [] as { owner: { kind: string; id: string }; picture: string; style: string }[])
vi.mock('../../../pictures/service', () => ({
  saveRecipePicture: async (owner: { kind: string; id: string }, picture: string, recipe: { style: string }) => {
    if (owner.id === 'fails') throw new Error('cannot draw')
    saved.push({ owner, picture, style: recipe.style })
    return { url: '/x.webp', recipe }
  },
}))

import { checkSeedPictures, drawSeedPictures } from '../pictures'

const REPO_DEMO = path.resolve(import.meta.dirname, '../../../../../demo')
/** The robots bundle's names, as the spec's table has them. */
const ROBOTS = ['planner-checklist', 'security', 'data-analyst', 'analyst-specs', 'researcher-data', 'support', 'automation', 'team-panel',
  'orange-glow', 'sparkle-badge', 'developer-laptop', 'coder-ide', 'artist-palette', 'knowledge-book', 'learner-quill', 'gardener-sprout',
  'mechanic-wrench', 'blueprint-thumbs-up', 'cyan-thumbs-up', 'kernel']

let seed: DemoSeed
beforeAll(async () => {
  seed = await loadDemoSeed(REPO_DEMO, { list: dir => readdir(dir), read: file => readFile(file, 'utf8') })
})

describe('the sample\'s pictures @SC-2005', () => {
  it('names a recipe hq accepts for every agent, team, person and the organisation, with and without the robots', async () => {
    const o = seed.organisation
    const count = 2 + o.people.length + 2 * o.teams.length + 2 * o.agents.length
    const withRobots = await checkSeedPictures(seed, ROBOTS)
    expect(withRobots).toHaveLength(count)
    const agentAvatars = withRobots.filter(j => j.kind === 'agent' && j.picture === 'avatar')
    expect(agentAvatars.map(j => j.recipe.style)).toEqual(o.agents.map(() => 'robots'))
    expect(agentAvatars.map(j => j.recipe.choices.robot)).toEqual(['researcher-data', 'learner-quill', 'analyst-specs'])

    const without = await checkSeedPictures(seed, null)
    expect(without.filter(j => j.kind === 'agent' && j.picture === 'avatar').map(j => j.recipe.style)).toEqual(o.agents.map(() => 'thumbs'))
    expect(without.filter(j => j.kind === 'team' && j.picture === 'avatar').map(j => j.recipe.style)).toEqual(o.teams.map(() => 'initials'))
    expect(without.find(j => j.kind === 'org' && j.picture === 'avatar')?.recipe.style).toBe('icons')
    expect(without.filter(j => j.kind === 'person').map(j => j.picture)).toEqual(o.people.map(() => 'cover'))
  })

  it('refuses the seed when a recipe is one hq would not make', async () => {
    const bad = structuredClone(seed)
    bad.organisation.teams[0].avatar = { ...bad.organisation.teams[0].avatar, style: 'thumbs' }
    await expect(checkSeedPictures(bad, null)).rejects.toThrow(/team studio avatar/)
  })

  it('draws each onto its own row, the organisation\'s onto its one row, and carries on past one that fails', async () => {
    saved.length = 0
    const jobs = await checkSeedPictures(seed, null)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const drawn = await drawSeedPictures([...jobs, { ...jobs[0], id: 'fails' }], 'org-row')
    errors.mockRestore()
    expect(drawn).toBe(jobs.length)
    expect(saved.filter(s => s.owner.kind === 'org').map(s => s.owner.id)).toEqual(['org-row', 'org-row'])
    expect(saved.find(s => s.owner.kind === 'person')?.owner.id).toBe(seed.organisation.people[0].id)
  })
})
