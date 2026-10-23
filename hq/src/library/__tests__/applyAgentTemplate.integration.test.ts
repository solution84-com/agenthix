import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { prisma } from '../../test/db'

// SC-065 — "User can browse and apply agent templates (creating a fully
// configured agent)." applyAgentTemplate reads the template bundle from hq's
// own assets and creates a DB agent whose instructions, listed
// skills become its content and whose settings are its own (5b.12). Runs at the
// integration level (ADR-0035) with a temp HQ_ASSETS_ROOT holding a minimal
// bundle; the activity side effect is mocked.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { applyAgentTemplate } from '../agentTemplateService'
import { readAgentContent } from '../../packages/agentPackageService'

let tmpRoot: string
const prevHqAssetsRoot = process.env.HQ_ASSETS_ROOT

async function seedBundle(slug: string, handle: string) {
  const agentDir = path.join(tmpRoot, 'assets', 'library', 'agents', slug)
  await fs.mkdir(path.join(agentDir, 'skills', 'demo-skill'), { recursive: true })
  await fs.writeFile(
    path.join(agentDir, 'agent.json'),
    JSON.stringify({
      name: 'Wasp Developer',
      handle,
      role: 'Engineer',
      approval: 'deferred',
      skills: ['demo-skill'],
    }),
    'utf-8',
  )
  await fs.writeFile(path.join(agentDir, 'instructions.md'), '# Wasp Developer', 'utf-8')
  await fs.writeFile(path.join(agentDir, 'skills', 'demo-skill', 'SKILL.md'), '---\nname: Demo\n---\n\nDemo skill', 'utf-8')

  await prisma.agentTemplate.create({
    data: { slug, name: 'Wasp Developer', version: 1, handle, assetPath: `library/agents/${slug}`, isSystem: true } as any,
  })
}

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-tpl-'))
  // hq reads its own bundled assets via HQ_ASSETS_ROOT, never SITE_ROOT/assets.
  process.env.HQ_ASSETS_ROOT = path.join(tmpRoot, 'assets')
  vi.clearAllMocks()
})

afterEach(async () => {
  if (prevHqAssetsRoot === undefined) delete process.env.HQ_ASSETS_ROOT
  else process.env.HQ_ASSETS_ROOT = prevHqAssetsRoot
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

describe('applyAgentTemplate @SC-065', () => {
  it('creates a fully configured agent from the template bundle', async () => {
    await seedBundle('wasp-developer', 'wasp-dev')

    const result = await applyAgentTemplate('wasp-developer', 'wasp-dev', 'admin-1')

    expect(result.handle).toBe('wasp-dev')
    const agent = await prisma.agent.findUnique({ where: { id: result.id } })
    expect(agent?.name).toBe('Wasp Developer')
    expect(agent?.handle).toBe('wasp-dev')
    // Settings live on the Agent row itself (ADR-0072).
    expect(agent?.approval).toBe('deferred')

    const current = await readAgentContent(result.id)
    expect(current?.instructions).toContain('# Wasp Developer')
    expect(current?.skillFiles.map((f) => f.path)).toEqual(['skills/demo-skill/SKILL.md'])
  })

  it('throws when the agent template slug is unknown', async () => {
    await expect(applyAgentTemplate('no-such-slug', 'x', null)).rejects.toThrow(/not found/)
  })
})

describe('applyAgentTemplate @SC-186', () => {
  it('fails when the chosen handle already exists, creating no second agent', async () => {
    await seedBundle('wasp-developer', 'wasp-dev')
    // Occupy the handle first.
    await prisma.agent.create({ data: { name: 'Existing', handle: 'wasp-dev' } as any })

    await expect(applyAgentTemplate('wasp-developer', 'wasp-dev', null)).rejects.toThrow(/already exists/)

    // Still only the single pre-existing agent — no duplicate created.
    const agents = await prisma.agent.findMany({ where: { handle: 'wasp-dev' } })
    expect(agents).toHaveLength(1)
    expect(agents[0].name).toBe('Existing')
  })
})
