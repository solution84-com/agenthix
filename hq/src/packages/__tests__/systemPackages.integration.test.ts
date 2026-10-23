import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prisma } from '../../test/db'
import { createAgent } from '../../test/factories'

// The platform package, the kernel's definition and a run's package resolution against the real test DB
// (ADR-0094). hq's assets come from the real bundle, or from a temp root where a test needs a directory missing.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { writePlatformPackage } from '../platformPackageService'
import { ensureKernelDefinition } from '../kernelPackage'
import { resolveRunPackages, AgentPackageMissingError, SystemPackageMissingError } from '../runPackages'
import { writePackage, getCurrentPackage, readCurrentFiles } from '../packageStore'
import { readAgentContent, writeAgentContent } from '../agentPackageService'

const realAssets = path.resolve(__dirname, '../../../assets')
const saved = process.env.HQ_ASSETS_ROOT
let root: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-assets-'))
  process.env.HQ_ASSETS_ROOT = root
})
afterEach(async () => {
  if (saved === undefined) delete process.env.HQ_ASSETS_ROOT
  else process.env.HQ_ASSETS_ROOT = saved
  await fs.rm(root, { recursive: true, force: true })
})

describe('platform package', () => {
  it('writes the built-in skills from hq\'s assets, as the system', async () => {
    await fs.mkdir(path.join(root, 'platform', 'skills', 'example-skill'), { recursive: true })
    await fs.writeFile(path.join(root, 'platform', 'skills', 'example-skill', 'SKILL.md'), 'read')
    await fs.writeFile(path.join(root, 'platform', 'skills', '.gitkeep'), '')

    const { ref, changed } = await writePlatformPackage()

    expect(changed).toBe(true)
    expect(ref).toMatchObject({ kind: 'platform', key: 'platform' })
    expect(await getCurrentPackage('platform', 'platform')).toMatchObject({ updatedById: null })
    const files = await readCurrentFiles('platform', 'platform')
    expect(files?.map(f => [f.path, f.content.toString()])).toEqual([['skills/example-skill/SKILL.md', 'read']])
  })

  it('refuses to write when the platform skills directory is missing, naming the path and HQ_ASSETS_ROOT', async () => {
    const err = await writePlatformPackage().catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain(path.join(root, 'platform', 'skills'))
    expect(err.message).toContain('HQ_ASSETS_ROOT')
    expect(await prisma.package.count()).toBe(0)
  })

  it('still writes a present but empty platform skills directory', async () => {
    await fs.mkdir(path.join(root, 'platform', 'skills'), { recursive: true })
    await writePlatformPackage()
    expect(await readCurrentFiles('platform', 'platform')).toEqual([])
  })

  it('changes nothing when written again with the same skills', async () => {
    await fs.mkdir(path.join(root, 'platform', 'skills'), { recursive: true })
    await writePlatformPackage()
    expect((await writePlatformPackage()).changed).toBe(false)
  })
})

describe('kernel definition', () => {
  const kernelRow = () => createAgent({ handle: 'kernel', isKernel: true, approval: 'immediate' })

  it('writes the kernel\'s content from its asset files, with every kernel skill, as the system', async () => {
    process.env.HQ_ASSETS_ROOT = realAssets
    const kernel = await kernelRow()
    await ensureKernelDefinition(kernel)

    expect((await getCurrentPackage('agent', kernel.id))?.updatedById).toBeNull()
    const content = await readAgentContent(kernel.id)
    expect(content?.instructions).toContain('You are Kernel')
    expect(content?.skillFiles.map(f => f.path.split('/')[1])).toEqual(expect.arrayContaining(['assembly', 'orchestrate', 'planning']))
    expect(content?.skillFiles.some(f => /AGENDA|ONBOARDING/.test(f.path))).toBe(false)
  })

  it('leaves the built-in agent\'s settings as they are', async () => {
    process.env.HQ_ASSETS_ROOT = realAssets
    const kernel = await kernelRow()
    await ensureKernelDefinition(kernel)
    const row = await prisma.agent.findUnique({ where: { id: kernel.id } })
    expect(row).toMatchObject({ approval: 'immediate', allowedTools: kernel.allowedTools })
  })

  it('never overwrites content a person edited with the assets, nor an approval they chose', async () => {
    process.env.HQ_ASSETS_ROOT = realAssets
    const kernel = await kernelRow()
    await writeAgentContent(kernel.id, { instructions: 'my own', skillFiles: [] }, 'admin-1')

    const result = await ensureKernelDefinition(kernel)

    expect(result.changed).toBe(false)
    expect((await readAgentContent(kernel.id))?.instructions).toBe('my own')
    expect((await prisma.agent.findUnique({ where: { id: kernel.id } }))?.approval).toBe('immediate')
  })

  describe('with hq\'s assets somewhere else', () => {
    it('refuses when the kernel\'s asset directory is missing, naming the path and HQ_ASSETS_ROOT', async () => {
      const kernel = await kernelRow()
      const err = await ensureKernelDefinition(kernel).catch(e => e)
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toContain(path.join(root, 'library', 'agents', 'kernel'))
      expect(err.message).toContain('HQ_ASSETS_ROOT')
      expect(await getCurrentPackage('agent', kernel.id)).toBeNull()
    })

    it('refuses when the kernel\'s skills directory is missing', async () => {
      const kernel = await kernelRow()
      await fs.mkdir(path.join(root, 'library', 'agents', 'kernel'), { recursive: true })
      await expect(ensureKernelDefinition(kernel)).rejects.toThrow(path.join(root, 'library', 'agents', 'kernel', 'skills'))
      expect(await getCurrentPackage('agent', kernel.id)).toBeNull()
    })

    it('still writes present but empty kernel directories', async () => {
      const kernel = await kernelRow()
      await fs.mkdir(path.join(root, 'library', 'agents', 'kernel', 'skills'), { recursive: true })
      await ensureKernelDefinition(kernel)
      expect((await readAgentContent(kernel.id))?.skillFiles).toEqual([])
    })
  })
})

describe('resolveRunPackages @SC-445 @SC-446', () => {
  const put = (kind: 'agent' | 'org' | 'platform', key: string, text = 'x') =>
    writePackage({ kind, key, files: [{ path: 'instructions.md', content: Buffer.from(text) }], updatedById: null })

  it('names each package\'s current content by digest, with no version', async () => {
    const org = await prisma.org.create({ data: { name: 'Acme' } as any })
    const [agent, orgPkg, platform] = await Promise.all([put('agent', 'a1', 'agent'), put('org', org.id, 'org'), put('platform', 'platform', 'platform')])
    expect(await resolveRunPackages('a1')).toEqual({ agent: agent.ref, org: orgPkg.ref, platform: platform.ref })
  })

  it('an edit reaches the next run: the run after it names the new digest, with nothing published', async () => {
    await put('platform', 'platform')
    const first = await put('agent', 'a1', 'one')
    expect((await resolveRunPackages('a1')).agent.digest).toBe(first.ref.digest)
    const second = await put('agent', 'a1', 'two')
    expect((await resolveRunPackages('a1')).agent.digest).toBe(second.ref.digest)
  })

  it('has no org package before an org exists, and none while the org has no content yet', async () => {
    await put('platform', 'platform')
    await put('agent', 'a1')
    expect((await resolveRunPackages('a1')).org).toBeNull()
    await prisma.org.create({ data: { name: 'Acme' } as any })
    expect((await resolveRunPackages('a1')).org).toBeNull()
  })

  it('refuses an agent with no content, naming it, and a platform package hq has not written', async () => {
    await put('platform', 'platform')
    await expect(resolveRunPackages('a1')).rejects.toBeInstanceOf(AgentPackageMissingError)
    await prisma.package.deleteMany({ where: { kind: 'PLATFORM' } })
    await put('agent', 'a1')
    await expect(resolveRunPackages('a1')).rejects.toBeInstanceOf(SystemPackageMissingError)
  })
})
