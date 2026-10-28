import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { readPlatformSkills } from '../platformSkills'
import { validateSkill } from '../../validation'

const image = path.resolve(__dirname, '../../../../assets/platform/skills')

describe("the built-in skills in hq's image", () => {
  it('are working-with-git and skill-creator, each a valid skill with nothing ignored when run', async () => {
    const { skills, problems } = await readPlatformSkills(image)
    expect(problems).toEqual([])
    expect(skills.map(s => s.name)).toEqual(['skill-creator', 'working-with-git'])
    for (const skill of skills) expect(validateSkill(skill.name, skill.files)).toEqual({ errors: [], warnings: [] })
  })

  it('working-with-git carries the workflow guide its SKILL.md names', async () => {
    const { skills } = await readPlatformSkills(image)
    const git = skills.find(s => s.name === 'working-with-git')!
    expect(git.files.map(f => f.path).sort()).toEqual(['SKILL.md', 'writing-workflows.md'])
    expect(git.files.find(f => f.path === 'SKILL.md')!.content.toString()).toContain('writing-workflows.md')
  })

  it('never tell an agent to push straight to a default branch, nor to write a skill into files', async () => {
    const { skills } = await readPlatformSkills(image)
    const text = skills.flatMap(s => s.files.map(f => f.content.toString())).join('\n')
    expect(text).not.toMatch(/git push origin|checkout develop/)
    expect(text).toContain('Never work directly on the base branch')
    expect(text).toContain('propose_skill')
    expect(text).toContain('Never write a skill folder into files yourself')
  })
})

describe('reading a folder of built-ins', () => {
  it('leaves out and names a folder that fails the rules, or whose name is not a skill name', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'builtins-'))
    try {
      await fs.mkdir(path.join(dir, 'good'))
      await fs.writeFile(path.join(dir, 'good', 'SKILL.md'), '---\nname: good\ndescription: Does good things.\n---\n\nBody\n')
      await fs.mkdir(path.join(dir, 'no-description'))
      await fs.writeFile(path.join(dir, 'no-description', 'SKILL.md'), '---\nname: no-description\n---\n\nBody\n')
      await fs.mkdir(path.join(dir, 'Bad Name'))
      await fs.writeFile(path.join(dir, 'stray.md'), 'x')
      const { skills, problems } = await readPlatformSkills(dir)
      expect(skills.map(s => s.name)).toEqual(['good'])
      expect(problems).toHaveLength(2)
      expect(problems.join(' ')).toMatch(/Bad Name: .*lowercase/)
      expect(problems.join(' ')).toMatch(/no-description: .*description/)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
