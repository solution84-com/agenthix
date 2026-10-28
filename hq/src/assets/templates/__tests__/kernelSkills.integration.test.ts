/**
 * Integration tests (ADR-0094, real test DB) for Kernel's own skills at boot: installed from hq's image as Kernel's role
 * skills and granted to it once, so a run is given them (D14); an administrator's removal kept across boots; a changed
 * skill in a new image offered as an update, never pinned by itself (V2).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { ensureKernelSkills, KERNEL_SKILLS_REASON } from '../kernelSkills'
import { installedSkillsFor } from '../../delivery/installed'
import { createAgent } from '../../../test/factories'

const REAL = path.resolve(__dirname, '../../../../assets/library/agents/kernel/skills')
const NAMES = ['kernel/assembly', 'kernel/orchestrate', 'kernel/planning']

let dir: string
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-skills-'))
  await fs.cp(REAL, dir, { recursive: true })
})
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

const kernelRow = () => createAgent({ handle: 'kernel', isKernel: true })
const assetOf = (name: string) => prisma.asset.findUniqueOrThrow({
  where: { kind_publisher_name: { kind: 'SKILL', publisher: 'agenthix', name } },
  include: { currentVersion: true, versions: true, grants: true },
})

describe("Kernel's own skills, at boot @SC-1640", () => {
  it("installs the three from hq's image as Kernel's role skills, gives them to Kernel, and a run of Kernel's is given them", async () => {
    const kernel = await kernelRow()

    const first = await ensureKernelSkills(prisma, kernel.id, REAL)

    expect(first.map(s => [s.identity, s.outcome, s.version, s.problem])).toEqual(NAMES.map(n => [`agenthix/${n}`, 'new', '1.0.0', null]))
    for (const name of NAMES) {
      const asset = await assetOf(name)
      expect(asset).toMatchObject({ builtIn: false, givenToAll: false, removedAt: null })
      expect(asset.currentVersion).toMatchObject({ version: '1.0.0', source: 'BUILT_IN', signerKind: 'NONE', byId: null })
      expect(asset.grants.map(g => [g.agentId, g.grantedById])).toEqual([[kernel.id, null]])
    }
    const delivered = await installedSkillsFor(prisma, kernel.id)
    expect(delivered.map(e => [e.identity, e.level]).sort()).toEqual(NAMES.map(n => [`agenthix/${n}`, 'agent']))
    for (const entry of delivered) expect(entry.ref).toMatchObject({ kind: 'skill', digest: entry.digest })
    expect(await installedSkillsFor(prisma, (await createAgent({ handle: 'other' })).id)).toEqual([])
  })

  it('changes nothing on a second boot with the same image', async () => {
    const kernel = await kernelRow()
    await ensureKernelSkills(prisma, kernel.id, REAL)
    const second = await ensureKernelSkills(prisma, kernel.id, REAL)
    expect(second.map(s => s.outcome)).toEqual(['same', 'same', 'same'])
    expect(await prisma.assetVersion.count()).toBe(3)
    expect(await prisma.assetGrant.count()).toBe(3)
    expect(await prisma.assetPinChange.count({ where: { reason: KERNEL_SKILLS_REASON } })).toBe(3)
  })

  it('leaves a skill an administrator took from Kernel, or removed from the Library, as they left it', async () => {
    const kernel = await kernelRow()
    await ensureKernelSkills(prisma, kernel.id, REAL)
    const orchestrate = await assetOf('kernel/orchestrate')
    const planning = await assetOf('kernel/planning')
    await prisma.assetGrant.deleteMany({ where: { assetId: orchestrate.id } })
    await prisma.asset.update({ where: { id: planning.id }, data: { removedAt: new Date() } })

    const again = await ensureKernelSkills(prisma, kernel.id, REAL)

    expect(again.map(s => [s.identity, s.outcome])).toEqual([
      ['agenthix/kernel/assembly', 'same'], ['agenthix/kernel/orchestrate', 'same'], ['agenthix/kernel/planning', 'restore'],
    ])
    expect(await prisma.assetGrant.count({ where: { assetId: orchestrate.id } })).toBe(0)
    expect((await assetOf('kernel/planning')).removedAt).not.toBeNull()
    expect((await installedSkillsFor(prisma, kernel.id)).map(e => e.identity)).toEqual(['agenthix/kernel/assembly'])
  })

  it('installs and gives them on a later boot to a Kernel that had none, as on a fresh organisation', async () => {
    const kernel = await kernelRow()
    expect(await installedSkillsFor(prisma, kernel.id)).toEqual([])
    await ensureKernelSkills(prisma, kernel.id, dir)
    expect((await installedSkillsFor(prisma, kernel.id)).length).toBe(3)
  })

  it('offers a skill changed in a new image as an update, numbered by the build, never pinning it', async () => {
    const kernel = await kernelRow()
    await ensureKernelSkills(prisma, kernel.id, dir)
    await fs.appendFile(path.join(dir, 'planning', 'SKILL.md'), '\nOne more step.\n')

    const next = await ensureKernelSkills(prisma, kernel.id, dir)

    expect(next.find(s => s.identity === 'agenthix/kernel/planning')).toMatchObject({ outcome: 'update', version: '2.0.0' })
    const planning = await assetOf('kernel/planning')
    expect(planning.currentVersion?.version).toBe('1.0.0')
    expect(planning.versions.map(v => v.version).sort()).toEqual(['1.0.0', '2.0.0'])
    expect(planning.grants).toHaveLength(1)
  })

  it('reports a folder that fails the Agent Skills rules and installs the rest', async () => {
    const kernel = await kernelRow()
    await fs.mkdir(path.join(dir, 'Bad_Name'))
    await fs.writeFile(path.join(dir, 'Bad_Name', 'SKILL.md'), '---\ndescription: x\n---\n')

    const out = await ensureKernelSkills(prisma, kernel.id, dir)

    expect(out.filter(s => s.problem).map(s => s.outcome)).toEqual(['refused'])
    expect(out.filter(s => s.outcome === 'new')).toHaveLength(3)
  })

  it('throws when the folder is missing, so boot reports a broken image', async () => {
    const kernel = await kernelRow()
    await expect(ensureKernelSkills(prisma, kernel.id, path.join(dir, 'none'))).rejects.toThrow()
    expect(await prisma.asset.count()).toBe(0)
  })
})
