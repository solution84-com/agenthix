import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readSkillTree, replaceSkill, removeSkill, skillEntries, librarySkillFiles, assertSkillSlug } from '../skillFiles'

let dir: string
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-')) })
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

const f = (p: string, s: string) => ({ path: p, content: Buffer.from(s) })

describe('skill files', () => {
  it('reads a skill tree under a prefix, skipping hidden files, links and unlisted skills', async () => {
    await fs.mkdir(path.join(dir, 'review', 'refs'), { recursive: true })
    await fs.writeFile(path.join(dir, 'review', 'SKILL.md'), 'r')
    await fs.writeFile(path.join(dir, 'review', 'refs', 'a.md'), 'a')
    await fs.writeFile(path.join(dir, 'review', '.DS_Store'), 'x')
    await fs.mkdir(path.join(dir, 'other'))
    await fs.writeFile(path.join(dir, 'other', 'SKILL.md'), 'o')
    await fs.writeFile(path.join(dir, '.gitkeep'), '')
    await fs.symlink('/etc/hosts', path.join(dir, 'review', 'hosts'))

    const all = await readSkillTree(dir, 'skills')
    expect(all.map(x => x.path)).toEqual(['skills/other/SKILL.md', 'skills/review/SKILL.md', 'skills/review/refs/a.md'])
    const only = await readSkillTree(dir, 'skills', new Set(['review']))
    expect(only.map(x => x.path)).toEqual(['skills/review/SKILL.md', 'skills/review/refs/a.md'])
    expect(await readSkillTree(path.join(dir, 'missing'), 'skills')).toEqual([])
  })

  it('replaces every file of one skill and leaves the others', () => {
    const files = [f('instructions.md', 'i'), f('skills/a/SKILL.md', 'old'), f('skills/a/x.md', 'x'), f('skills/b/SKILL.md', 'b')]
    const next = replaceSkill(files, 'a', [f('SKILL.md', 'new')])
    expect(next.map(x => [x.path, x.content.toString()])).toEqual([
      ['instructions.md', 'i'], ['skills/b/SKILL.md', 'b'], ['skills/a/SKILL.md', 'new'],
    ])
    expect(removeSkill(next, 'a').map(x => x.path)).toEqual(['instructions.md', 'skills/b/SKILL.md'])
  })

  it('refuses a skill without SKILL.md and a slug that cannot be namespaced', () => {
    expect(() => replaceSkill([], 'a', [f('x.md', 'x')])).toThrow(/SKILL.md/)
    expect(() => assertSkillSlug('Bad Slug')).toThrow(/lowercase/)
    expect(() => assertSkillSlug('x'.repeat(52))).toThrow(/51/)
  })

  it('lists skill entries from SKILL.md frontmatter', () => {
    const entries = skillEntries([f('skills/b/SKILL.md', '---\nname: Bee\ndescription: d\nversion: 3\ninstalled_from: s9\n---\nbody'), f('skills/b/x.md', 'x')])
    expect(entries).toEqual([{ slug: 'b', name: 'Bee', description: 'd', content: '---\nname: Bee\ndescription: d\nversion: 3\ninstalled_from: s9\n---\nbody', version: 3, installedFrom: 's9' }])
  })

  it('builds a library skill\'s files deterministically, with provenance and no install time', async () => {
    process.env.HQ_ASSETS_ROOT = dir
    await fs.mkdir(path.join(dir, 'library', 'skills', 'qa-plan'), { recursive: true })
    await fs.writeFile(path.join(dir, 'library', 'skills', 'qa-plan', 'SKILL.md'), '---\nname: Old\n---\n\nPlan tests.')
    await fs.writeFile(path.join(dir, 'library', 'skills', 'qa-plan', 'template.md'), 'T')
    const skill = { id: 's1', slug: 'qa-plan', name: 'QA Plan', description: 'Plans', assetPath: 'library/skills/qa-plan', version: 2, scope: 'PLATFORM', orgId: null }
    const one = await librarySkillFiles(skill)
    const two = await librarySkillFiles(skill)
    expect(one).toEqual(two)
    expect(one.map(x => x.path)).toEqual(['SKILL.md', 'template.md'])
    expect(one[0].content.toString()).toBe('---\nname: QA Plan\nslug: qa-plan\ndescription: Plans\nversion: 2\nscope: PLATFORM\ninstalled_from: s1\n---\n\nPlan tests.')
    delete process.env.HQ_ASSETS_ROOT
  })
})
