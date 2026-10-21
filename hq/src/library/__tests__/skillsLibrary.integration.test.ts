import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'

// SC-062 — "User can create, edit, and delete org library skills (platform
// library skills are read-only)." The skills-library service writes to the
// real test DB (ADR-0035). Modules in the import chain pull `prisma` from
// `wasp/server`, so we substitute the test client + real HttpError.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import {
  createLibrarySkill,
  updateLibrarySkill,
  deleteLibrarySkill,
} from '../../agents/skillsLibraryService'

async function makeOrg() {
  return prisma.org.create({ data: { name: 'Acme' } as any })
}

describe('skills library CRUD @SC-062', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an org library skill row', async () => {
    const org = await makeOrg()
    const skill = await createLibrarySkill({
      slug: 'my-skill',
      name: 'My Skill',
      description: 'does things',
      assetPath: 'org/skills/my-skill',
      scope: 'ORG',
      orgId: org.id,
    })

    expect(skill.slug).toBe('my-skill')
    expect(skill.scope).toBe('ORG')
    const stored = await prisma.skill.findUnique({ where: { id: skill.id } })
    expect(stored?.name).toBe('My Skill')
  })

  it('rejects an invalid slug', async () => {
    const org = await makeOrg()
    await expect(
      createLibrarySkill({
        slug: 'Bad Slug!',
        name: 'X',
        description: 'd',
        assetPath: 'org/skills/x',
        scope: 'ORG',
        orgId: org.id,
      }),
    ).rejects.toThrow(/Invalid slug/)
  })

  it('updates an existing org skill row', async () => {
    const org = await makeOrg()
    const skill = await createLibrarySkill({
      slug: 'editable',
      name: 'Before',
      description: 'd',
      assetPath: 'org/skills/editable',
      scope: 'ORG',
      orgId: org.id,
    })

    const updated = await updateLibrarySkill(skill.id, { name: 'After', description: 'changed' })

    expect(updated.name).toBe('After')
    expect(updated.description).toBe('changed')
  })

  it('deletes an org skill row', async () => {
    const org = await makeOrg()
    const skill = await createLibrarySkill({
      slug: 'temp',
      name: 'Temp',
      description: 'd',
      assetPath: 'org/skills/temp',
      scope: 'ORG',
      orgId: org.id,
    })

    await deleteLibrarySkill(skill.id)

    expect(await prisma.skill.findUnique({ where: { id: skill.id } })).toBeNull()
  })
})
