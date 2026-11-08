import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createProduct, createProgram, createProject, createTestTask } from '../../test/factories'

// SC-402, SC-395, R-198 against the real test DB: a product or programme is org
// structure, but the projects filed under it are not — a private project's name,
// key, description, task counts and states are for its members only, in every
// list, page and count.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})

import {
  getProducts, getProduct, getProductBySlug, getPrograms, getProgram, getProgramBySlug,
} from '../queries'
import { getProductOp } from '../../server/controlplane/productOps'
import { connectionCaller } from '../../shared/testing/connectionCaller'
import type { CapabilityClaims } from '@agenthix/core'
import type { CallerContext } from '../../server/controlplane/types'
import { claims, chatSession } from '../../server/controlplane/__tests__/controlPlaneFixtures'

const ctxFor = (userId: string) => ({ user: { id: userId }, entities: {} }) as any

async function seed() {
  const member = await createUser()
  const outsider = await createUser()
  const product = await createProduct()
  const program = await createProgram()
  const open = await createProject({ name: 'Open Project', accessLevel: 'OPEN', productId: product.id, programId: program.id })
  const secret = await createProject({
    name: 'Secret Project', description: 'Secret description', accessLevel: 'PRIVATE',
    productId: product.id, programId: program.id,
  })
  await prisma.projectMember.create({ data: { projectId: secret.id, userId: member.id, role: 'ADMIN' } })
  // Both are members of the open project (adr-0099); only `member` is on the private one.
  await prisma.projectMember.createMany({ data: [member, outsider].map(u => ({ projectId: open.id, userId: u.id })) })
  await createTestTask({ data: { title: 'Secret task', projectId: secret.id, number: 1, runState: 'RUN_ACTIVE', onBehalfOfUserId: member.id } as any })
  await createTestTask({ data: { title: 'Open task', projectId: open.id, number: 1, onBehalfOfUserId: member.id } as any })
  return { member, outsider, product, program, open, secret }
}

describe('a private project does not show through a product or a programme @SC-402', () => {
  it('getProducts counts only the projects the caller may open', async () => {
    const { member, outsider, product } = await seed()
    const asOutsider = (await getProducts(undefined as any, ctxFor(outsider.id))).find((p: any) => p.id === product.id)
    const asMember = (await getProducts(undefined as any, ctxFor(member.id))).find((p: any) => p.id === product.id)
    expect(asOutsider._count.projects).toBe(1)
    expect(asMember._count.projects).toBe(2)
  })

  it('getProgram and getPrograms leave a private project out for a non-member', async () => {
    const { member, outsider, program, secret } = await seed()
    const listed = (await getPrograms(undefined as any, ctxFor(outsider.id))).find((p: any) => p.id === program.id)
    expect(listed._count.projects).toBe(1)

    const page = await getProgram({ programId: program.id }, ctxFor(outsider.id))
    expect(page.projects.map((p: any) => p.name)).toEqual(['Open Project'])
    expect(JSON.stringify(page)).not.toContain('Secret')
    expect(JSON.stringify(page)).not.toContain(secret.key)

    const asMember = await getProgramBySlug({ slug: program.slug }, ctxFor(member.id))
    expect(asMember.projects.map((p: any) => p.name).sort()).toEqual(['Open Project', 'Secret Project'])
    const outsiderBySlug = await getProgramBySlug({ slug: program.slug }, ctxFor(outsider.id))
    expect(JSON.stringify(outsiderBySlug)).not.toContain('Secret')
  })

  it('getProduct and getProductBySlug leave out a private project, its description, task count and states', async () => {
    const { member, outsider, product, secret } = await seed()
    for (const read of [
      () => getProduct({ productId: product.id }, ctxFor(outsider.id)),
      () => getProductBySlug({ slug: product.slug }, ctxFor(outsider.id)),
    ]) {
      const page = await read()
      expect(page.projects.map((p: any) => p.name)).toEqual(['Open Project'])
      const text = JSON.stringify(page)
      expect(text).not.toContain('Secret')
      expect(text).not.toContain(secret.key)
      expect(text).not.toContain('RUN_ACTIVE')
    }

    const asMember = await getProductBySlug({ slug: product.slug }, ctxFor(member.id))
    const shown = asMember.projects.find((p: any) => p.name === 'Secret Project')
    expect(shown).toMatchObject({ key: secret.key, description: 'Secret description', _count: { tasks: 1 } })
    expect(shown.tasks).toEqual([{ runState: 'RUN_ACTIVE', state: 'BACKLOG' }])
  })

  it('an open project is seen by its members', async () => {
    const { outsider, product } = await seed()
    const page = await getProduct({ productId: product.id }, ctxFor(outsider.id))
    expect(page.projects).toHaveLength(1)
    expect(page.projects[0]).toMatchObject({ name: 'Open Project', _count: { tasks: 1 } })
  })
})

// The agent-facing twin of the browser read moves with it.
describe('get_product sees projects as its caller does', () => {
  // A run is seen as its person sees projects, narrowed to its own project when confined to one (adr-0101).
  const run = (over: Partial<CapabilityClaims>): CallerContext => ({ kind: 'run', claims: claims({ role: null, ...over }) })

  it("a person's chat run is confined to the projects that person is a member of", async () => {
    const { member, outsider, product } = await seed()
    await chatSession(member.id)
    const asOutsider = await getProductOp(run({ userId: outsider.id, projectId: null }), { productId: product.id })
    expect(asOutsider.product.projects.map((p: any) => p.name)).toEqual(['Open Project'])
    const asMember = await getProductOp(run({ userId: member.id, projectId: null }), { productId: product.id })
    expect(asMember.product.projects).toHaveLength(2)
  })

  it('a run in a project sees its own project only, and a run on behalf of no one is refused', async () => {
    const { member, outsider, product, open } = await seed()
    await chatSession(member.id)
    const own = await getProductOp(run({ userId: outsider.id, projectId: open.id }), { productId: product.id })
    expect(own.product.projects.map((p: any) => p.name)).toEqual(['Open Project'])
    await expect(getProductOp(run({ projectId: open.id, taskId: 'gone' }), { productId: product.id })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it("a person's connection sees what its person does, narrowed to its project list (adr-0090)", async () => {
    const { member, product, open } = await seed()
    const all = await getProductOp(connectionCaller({ userId: member.id, role: 'ADMIN' }), { productId: product.id })
    expect(all.product.projects).toHaveLength(2)
    const limited = await getProductOp(connectionCaller({ userId: member.id, projectIds: [open.id] }), { productId: product.id })
    expect(limited.product.projects.map((p: any) => p.name)).toEqual(['Open Project'])
  })
})
