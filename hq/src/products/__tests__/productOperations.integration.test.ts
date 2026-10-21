import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createProduct as seedProduct, createProgram as seedProgram, createProject } from '../../test/factories'

// Products and programmes are the org's structure and the org admin's (spec
// §6.4): every write sits at ADMIN, matching the MCP twins' floors in
// rolePolicy.ts (@SC-310). Against the real test DB.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { createProduct, updateProduct, deleteProduct, createProgram, updateProgram, deleteProgram } from '../actions'
import { getProducts, getProduct, getProductBySlug, getPrograms, getProgram, getProgramBySlug } from '../queries'

const as = (userId: string) => ({ user: { id: userId } }) as any
const savedSiteRoot = process.env.SITE_ROOT
let root: string

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'product-operations-'))
  process.env.SITE_ROOT = root
})

afterAll(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
})

describe('role floors @SC-310', () => {
  const writes: Array<{ name: string; run: (ctx: any, ids: { productId: string; programId: string }) => Promise<unknown> }> = [
    { name: 'createProduct', run: (ctx) => createProduct({ name: 'P', slug: 'p-new' }, ctx) },
    { name: 'updateProduct', run: (ctx, { productId }) => updateProduct({ productId, name: 'Renamed' }, ctx) },
    { name: 'deleteProduct', run: (ctx, { productId }) => deleteProduct({ productId }, ctx) },
    { name: 'createProgram', run: (ctx) => createProgram({ name: 'Pr New' }, ctx) },
    { name: 'updateProgram', run: (ctx, { programId }) => updateProgram({ programId, name: 'Renamed' }, ctx) },
    { name: 'deleteProgram', run: (ctx, { programId }) => deleteProgram({ programId }, ctx) },
  ]

  async function structure() {
    const product = await seedProduct({ name: 'Original' })
    const program = await seedProgram({ name: 'Original' })
    return { productId: product.id, programId: program.id }
  }
  async function unchanged() {
    expect(await prisma.product.findMany({ select: { name: true } })).toEqual([{ name: 'Original' }])
    expect(await prisma.program.findMany({ select: { name: true } })).toEqual([{ name: 'Original' }])
  }

  for (const { name, run } of writes) {
    it(`${name} refuses a Member with 403, and changes nothing`, async () => {
      const ids = await structure()
      for (const role of ['MEMBER'] as const) {
        const caller = await createUserWithRole(role)
        await expect(run(as(caller.id), ids)).rejects.toMatchObject({ statusCode: 403 })
      }
      await unchanged()
    })

    it(`${name} refuses a caller with no role, and one not signed in`, async () => {
      const ids = await structure()
      const roleless = await createUser()
      await expect(run(as(roleless.id), ids)).rejects.toMatchObject({ statusCode: 403 })
      await expect(run({ user: undefined }, ids)).rejects.toMatchObject({ statusCode: 401 })
      await unchanged()
    })
  }
})

describe('Product CRUD @SC-102', () => {
  it('createProduct persists every field a product may be given', async () => {
    const admin = await createUserWithRole('ADMIN')
    const product = await createProduct(
      { name: 'Agenthix Site', slug: 'agenthix-site', description: 'D', vision: 'V', status: 'sunset' }, as(admin.id),
    )
    expect(await prisma.product.findUnique({ where: { id: product.id } })).toMatchObject({
      name: 'Agenthix Site', slug: 'agenthix-site', description: 'D', vision: 'V', status: 'sunset',
    })
  })

  it('createProduct without optional fields takes the defaults', async () => {
    const admin = await createUserWithRole('ADMIN')
    const product = await createProduct({ name: 'HQ', slug: 'hq' }, as(admin.id))
    expect(product).toMatchObject({ name: 'HQ', slug: 'hq', description: null, vision: null, status: 'active' })
  })

  it('createProduct ignores an id and nested relation writes, and provisions no directory at all', async () => {
    const admin = await createUserWithRole('ADMIN')
    const project = await createProject()
    const product = await createProduct({
      name: 'Widget', slug: 'widget', id: 'chosen-by-caller', projects: { connect: [{ id: project.id }] },
    } as any, as(admin.id))

    expect(product.id).not.toBe('chosen-by-caller')
    expect((await prisma.project.findUnique({ where: { id: project.id } }))?.productId).toBeNull()
    // A product groups projects and owns nothing (ADR-0061): no files home.
    await expect(fs.readdir(path.join(root, 'products'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('updateProduct writes the named fields and answers with the project count', async () => {
    const admin = await createUserWithRole('ADMIN')
    const product = await seedProduct({ name: 'Before', vision: 'Old' })
    await createProject({ productId: product.id })

    const updated = await updateProduct(
      { productId: product.id, name: 'N', slug: 'renamed', description: null, vision: 'V', status: 'sunset' }, as(admin.id),
    )

    expect(updated).toMatchObject({ id: product.id, name: 'N', slug: 'renamed', description: null, vision: 'V', status: 'sunset', _count: { projects: 1 } })
  })

  it('updateProduct ignores a replaced id and nested relation writes', async () => {
    const admin = await createUserWithRole('ADMIN')
    const product = await seedProduct()
    const project = await createProject({ productId: product.id })

    await updateProduct({ productId: product.id, name: 'Renamed', id: 'other-id', projects: { set: [] } } as any, as(admin.id))

    expect(await prisma.product.findUnique({ where: { id: product.id } })).toMatchObject({ name: 'Renamed' })
    expect((await prisma.project.findUnique({ where: { id: project.id } }))?.productId).toBe(product.id)
  })

  it('deleteProduct unlinks its projects, keeps them, and deletes the product', async () => {
    const admin = await createUserWithRole('ADMIN')
    const product = await seedProduct()
    const project = await createProject({ productId: product.id })

    await deleteProduct({ productId: product.id }, as(admin.id))

    expect(await prisma.product.findUnique({ where: { id: product.id } })).toBeNull()
    expect((await prisma.project.findUnique({ where: { id: project.id } }))?.productId).toBeNull()
  })
})

describe('Program CRUD @SC-103', () => {
  it('createProgram persists name, description and status, deriving the slug from the name', async () => {
    const admin = await createUserWithRole('ADMIN')
    const program = await createProgram({ name: 'Phase 1.5', description: 'Agent Intelligence', status: 'active' }, as(admin.id))
    expect(await prisma.program.findUnique({ where: { id: program.id } })).toMatchObject({
      name: 'Phase 1.5', slug: 'phase-1-5', description: 'Agent Intelligence', status: 'active',
    })
  })

  it('createProgram without optional fields takes the defaults', async () => {
    const admin = await createUserWithRole('ADMIN')
    const program = await createProgram({ name: 'Phase 2' }, as(admin.id))
    expect(program).toMatchObject({ name: 'Phase 2', slug: 'phase-2', description: null, status: 'planning' })
  })

  it('createProgram derives a free slug when the name\'s is taken, and refuses a taken slug asked for outright', async () => {
    const admin = await createUserWithRole('ADMIN')
    await seedProgram({ name: 'Launch', slug: 'launch' })

    const second = await createProgram({ name: 'Launch' }, as(admin.id))
    expect(second.slug).not.toBe('launch')
    await expect(createProgram({ name: 'Other', slug: 'launch' }, as(admin.id))).rejects.toThrow(/already taken/)
    expect(await prisma.program.count()).toBe(2)
  })

  it('createProgram ignores an id and nested relation writes, and provisions no directory at all', async () => {
    const admin = await createUserWithRole('ADMIN')
    const project = await createProject()
    const program = await createProgram(
      { name: 'Launch', id: 'chosen-by-caller', projects: { connect: [{ id: project.id }] } } as any, as(admin.id),
    )

    expect(program.id).not.toBe('chosen-by-caller')
    expect((await prisma.project.findUnique({ where: { id: project.id } }))?.programId).toBeNull()
    // A programme groups projects and owns nothing (ADR-0061): no files home.
    await expect(fs.readdir(path.join(root, 'programs'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('updateProgram writes the named fields, ignoring a replaced id and nested relation writes', async () => {
    const admin = await createUserWithRole('ADMIN')
    const program = await seedProgram()
    const project = await createProject({ programId: program.id })

    const updated = await updateProgram(
      { programId: program.id, name: 'N', slug: 's', description: null, status: 'archived', id: 'other-id', projects: { set: [] } } as any,
      as(admin.id),
    )

    expect(updated).toMatchObject({ id: program.id, name: 'N', slug: 's', description: null, status: 'archived', _count: { projects: 1 } })
    expect((await prisma.project.findUnique({ where: { id: project.id } }))?.programId).toBe(program.id)
  })

  it('deleteProgram unlinks its projects, keeps them, and deletes the programme', async () => {
    const admin = await createUserWithRole('ADMIN')
    const program = await seedProgram()
    const project = await createProject({ programId: program.id })

    await deleteProgram({ programId: program.id }, as(admin.id))

    expect(await prisma.program.findUnique({ where: { id: program.id } })).toBeNull()
    expect((await prisma.project.findUnique({ where: { id: project.id } }))?.programId).toBeNull()
  })
})

describe('reading products and programmes @SC-104', () => {
  it('every query refuses a caller who is not signed in with 401', async () => {
    // F-013b: a 401, not a bare Error, which Wasp surfaces as a 500.
    const noUser = { user: undefined } as any
    await expect(getProducts(undefined as any, noUser)).rejects.toMatchObject({ statusCode: 401 })
    await expect(getProduct({ productId: 'p1' }, noUser)).rejects.toMatchObject({ statusCode: 401 })
    await expect(getProductBySlug({ slug: 'acme' }, noUser)).rejects.toMatchObject({ statusCode: 401 })
    await expect(getPrograms(undefined as any, noUser)).rejects.toMatchObject({ statusCode: 401 })
    await expect(getProgram({ programId: 'pr1' }, noUser)).rejects.toMatchObject({ statusCode: 401 })
    await expect(getProgramBySlug({ slug: 'phase-2' }, noUser)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('a product and a programme are found by slug, and an unknown slug is not found', async () => {
    const reader = await createUser()
    const product = await seedProduct({ slug: 'acme' })
    const program = await seedProgram({ slug: 'phase-2' })

    expect((await getProductBySlug({ slug: 'acme' }, as(reader.id))).id).toBe(product.id)
    expect((await getProgramBySlug({ slug: 'phase-2' }, as(reader.id))).id).toBe(program.id)
    await expect(getProductBySlug({ slug: 'nope' }, as(reader.id))).rejects.toThrow(/not found/)
    await expect(getProgramBySlug({ slug: 'nope' }, as(reader.id))).rejects.toThrow(/not found/)
  })

  it('lists products and programmes by name', async () => {
    const reader = await createUser()
    await seedProduct({ name: 'Zeta' })
    await seedProduct({ name: 'Alpha' })
    await seedProgram({ name: 'Later' })
    await seedProgram({ name: 'Earlier' })

    expect((await getProducts(undefined as any, as(reader.id))).map((p: any) => p.name)).toEqual(['Alpha', 'Zeta'])
    expect((await getPrograms(undefined as any, as(reader.id))).map((p: any) => p.name)).toEqual(['Earlier', 'Later'])
  })
})
