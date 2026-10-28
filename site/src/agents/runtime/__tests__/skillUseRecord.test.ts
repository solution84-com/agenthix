import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { packageDigestInput, PACKAGE_FORMAT_VERSION } from '@agenthix/core'

const h = vi.hoisted(() => ({ update: vi.fn() }))
vi.mock('#db', () => ({ prisma: { agentRun: { update: h.update } } }))

import { stageSkills, skillRootsFor } from '../skillStaging'
import { recordSkillsUsed, skillUsesOf } from '../skillUseRecord'

let dir: string
beforeEach(async () => {
  dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilluse-')))
  h.update.mockReset()
  h.update.mockResolvedValue({})
})
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

async function skill(root: string, slug: string, md: string, extra: Record<string, string> = {}) {
  await fs.mkdir(path.join(dir, root, 'skills', slug), { recursive: true })
  await fs.writeFile(path.join(dir, root, 'skills', slug, 'SKILL.md'), md)
  for (const [name, text] of Object.entries(extra)) await fs.writeFile(path.join(dir, root, 'skills', slug, name), text)
}

async function stageAll() {
  const filesHome = path.join(dir, 'home')
  const boundary = path.join(filesHome, '.agents', 'agents', 'a1')
  const shared = path.join(filesHome, '.agents', 'skills')
  await fs.mkdir(path.join(boundary, 'skills', 'mine'), { recursive: true })
  await fs.writeFile(path.join(boundary, 'skills', 'mine', 'SKILL.md'), '---\nname: Mine\ndescription: m\n---\n')
  await fs.mkdir(path.join(shared, 'team'), { recursive: true })
  await fs.writeFile(path.join(shared, 'team', 'SKILL.md'), '---\nname: Team\ndescription: t\n---\n')
  const roots = skillRootsFor(
    { platformDir: path.join(dir, 'platform'), orgDir: path.join(dir, 'org'), agentDir: path.join(dir, 'agent') },
    { dir: boundary, filesHome },
    { dir: shared, filesHome },
  )
  const dest = path.join(dir, 'out')
  return { staged: await stageSkills(roots, dest), dest }
}

describe('the record of skills a run used', () => {
  it('has one entry per staged name, with the source and the fingerprint of what was staged', async () => {
    for (const root of ['platform', 'org', 'agent']) await skill(root, 'review', `---\nname: R\ndescription: ${root}\n---\n`, { 'a.md': root })
    const { staged, dest } = await stageAll()
    const uses = skillUsesOf(staged)
    expect(uses.map(u => [u.name, u.source])).toEqual([
      ['platform-review', 'platform'], ['org-review', 'org'], ['agent-review', 'agent'],
      ['boundary-mine', 'boundary'], ['shared-team', 'shared'],
    ])
    const stagedFiles = async (name: string) => {
      const files = await Promise.all(['SKILL.md', ...(name.endsWith('review') ? ['a.md'] : [])].map(async p => ({
        path: p, sha256: createHash('sha256').update(await fs.readFile(path.join(dest, name, p))).digest('hex'),
      })))
      return createHash('sha256').update(packageDigestInput({ formatVersion: PACKAGE_FORMAT_VERSION, files })).digest('hex')
    }
    for (const u of uses) expect(u.fingerprint).toBe(await stagedFiles(u.name))
    expect(new Set(uses.map(u => u.fingerprint)).size).toBe(uses.length)
  })

  it('knows the path of a skill in a place\'s files, and none for a package skill', async () => {
    await skill('platform', 'review', '---\nname: R\ndescription: d\n---\n')
    const uses = skillUsesOf((await stageAll()).staged)
    expect(uses.find(u => u.name === 'boundary-mine')?.path).toBe('.agents/agents/a1/skills/mine')
    expect(uses.find(u => u.name === 'shared-team')?.path).toBe('.agents/skills/team')
    expect(uses.find(u => u.name === 'platform-review')?.path).toBeUndefined()
  })

  it('gives a different fingerprint when a file changes', async () => {
    await skill('platform', 'review', '---\nname: R\ndescription: d\n---\n', { 'a.md': 'one' })
    const first = skillUsesOf((await stageAll()).staged)[0]!.fingerprint
    await fs.rm(path.join(dir, 'out'), { recursive: true })
    await fs.writeFile(path.join(dir, 'platform', 'skills', 'review', 'a.md'), 'two')
    const second = skillUsesOf((await stageAll()).staged)[0]!.fingerprint
    expect(second).not.toBe(first)
  })

  it('is written on the run', async () => {
    await skill('platform', 'review', '---\nname: R\ndescription: d\n---\n')
    const { staged } = await stageAll()
    await recordSkillsUsed('run-1', staged)
    expect(h.update).toHaveBeenCalledWith({ where: { id: 'run-1' }, data: { skillsUsed: skillUsesOf(staged) } })
  })

  it('never fails the run when it cannot be written', async () => {
    h.update.mockRejectedValue(new Error('db down'))
    await expect(recordSkillsUsed('run-1', [{ source: 'platform', slug: 'x', name: 'platform-x', fingerprint: 'a'.repeat(64) }])).resolves.toBeUndefined()
  })

  it('writes nothing when no skill was staged', async () => {
    await recordSkillsUsed('run-1', [])
    expect(h.update).not.toHaveBeenCalled()
  })
})
