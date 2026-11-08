import { prisma, HttpError } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { deriveSlug } from '../shared/identifiers'
import { visibleProjectsFilter } from '../projects/membership'

/**
 * Whose eyes the projects under a product or programme are seen through. A
 * product and a programme are org structure and everyone may see them; what
 * hangs under them are projects, and a private project's name, key,
 * description, task counts and states are not for anyone off its member list
 * (spec §6.4, SC-402). An open project is listed to everyone, as its preview is
 * (adr-0099). `null` sees every project; no caller passes it today.
 * A person's connection sees its person's projects, narrowed to its own
 * project list when it has one (adr-0090).
 *
 * A run confined to one project (an unattended task run) sees
 * that project and nothing else, mirroring `requireProjectScope`; one with no
 * project sees none.
 */
export type ProjectViewer =
  | { userId: string; onlyProjectIds?: readonly string[] | null }
  | { projectId: string | null }
  | null

function projectsVisibleTo(viewer: ProjectViewer): Prisma.ProjectWhereInput {
  if (viewer === null) return {}
  if ('projectId' in viewer) return { id: viewer.projectId === null ? { in: [] } : viewer.projectId }
  if (!viewer.onlyProjectIds) return visibleProjectsFilter(viewer.userId)
  return { AND: [visibleProjectsFilter(viewer.userId), { id: { in: [...viewer.onlyProjectIds] } }] }
}

const projectsOfProduct = (viewer: ProjectViewer) => ({
  where: projectsVisibleTo(viewer),
  select: {
    id: true,
    name: true,
    key: true,
    description: true,
    _count: { select: { tasks: true } },
    tasks: {
      select: { runState: true, state: true },
    },
  },
})

const projectsOfProgram = (viewer: ProjectViewer) => ({
  where: projectsVisibleTo(viewer),
  select: { id: true, name: true, key: true, description: true },
})

// A product or programme that is not there is a 404, never the database's own failure (which answers 500).
const isMissingRow = (err: unknown): boolean => (err as { code?: string } | null)?.code === 'P2025'

async function orNotFound<T>(what: 'Product' | 'Programme', run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (isMissingRow(err)) throw new HttpError(404, `${what} not found`)
    throw err
  }
}

const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** The slug a caller asks for, in the shape a slug has and not taken by another; a name's slug is numbered by the caller instead. */
function checkedSlug(slug: string, takenByOthers: readonly string[]): string {
  if (typeof slug !== 'string' || !SLUG_FORMAT.test(slug)) {
    throw new HttpError(400, 'A slug is lowercase letters and digits, with single hyphens between them')
  }
  if (takenByOthers.includes(slug)) throw new HttpError(409, `Slug "${slug}" is already taken`)
  return slug
}

const slugsOf = async (kind: 'product' | 'program', exceptId?: string): Promise<string[]> => {
  const where = exceptId ? { id: { not: exceptId } } : undefined
  const rows = kind === 'product'
    ? await prisma.product.findMany({ where, select: { slug: true } })
    : await prisma.program.findMany({ where, select: { slug: true } })
  return rows.map(r => r.slug)
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function listProducts(viewer: ProjectViewer) {
  return prisma.product.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { projects: { where: projectsVisibleTo(viewer) } } } },
  })
}

export async function getProduct(productId: string, viewer: ProjectViewer) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { projects: projectsOfProduct(viewer) },
  })
  if (!product) throw new HttpError(404, 'Product not found')
  return product
}

export async function getProductBySlug(slug: string, viewer: ProjectViewer) {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: { projects: projectsOfProduct(viewer) },
  })
  if (!product) throw new HttpError(404, `Product with slug "${slug}" not found`)
  return product
}

export async function createProduct(params: {
  name: string
  /** Left out, the name's slug is numbered to a free one; given, it must be free. */
  slug?: string
  description?: string
  vision?: string
  status?: 'active' | 'sunset'
}) {
  // A product groups projects and owns nothing (ADR-0061) — no files home is
  // provisioned for it. Named fields only: the id is generated.
  const { name, description, vision, status } = params
  const taken = await slugsOf('product')
  const slug = params.slug && params.slug.trim() ? checkedSlug(deriveSlug(params.slug), taken) : deriveSlug(name, taken)
  return prisma.product.create({ data: { name, slug, description, vision, status } })
}

export async function updateProduct(params: {
  productId: string
  name?: string
  slug?: string
  description?: string | null
  vision?: string | null
  status?: 'active' | 'sunset'
}) {
  // Named fields only: the action's args come from the browser.
  const { productId, name, description, vision, status } = params
  const slug = params.slug === undefined ? undefined : checkedSlug(params.slug, await slugsOf('product', productId))
  return orNotFound('Product', () => prisma.product.update({
    where: { id: productId },
    data: { name, slug, description, vision, status },
    include: { _count: { select: { projects: true } } },
  }))
}

export async function deleteProduct(productId: string) {
  await orNotFound('Product', () => prisma.$transaction(async (tx) => {
    await tx.project.updateMany({ where: { productId }, data: { productId: null } })
    await tx.product.delete({ where: { id: productId } })
  }))
}

// ── Programs ──────────────────────────────────────────────────────────────────

export async function listPrograms(viewer: ProjectViewer) {
  return prisma.program.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { projects: { where: projectsVisibleTo(viewer) } } } },
  })
}

export async function getProgram(programId: string, viewer: ProjectViewer) {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: { projects: projectsOfProgram(viewer) },
  })
  if (!program) throw new HttpError(404, 'Programme not found')
  return program
}

export async function getProgramBySlug(slug: string, viewer: ProjectViewer) {
  const program = await prisma.program.findUnique({
    where: { slug },
    include: { projects: projectsOfProgram(viewer) },
  })
  if (!program) throw new HttpError(404, `Programme with slug "${slug}" not found`)
  return program
}

export async function createProgram(params: {
  name: string
  slug?: string
  description?: string
  status?: 'planning' | 'active' | 'archived'
}) {
  const existingSlugs = await slugsOf('program')
  const slug = params.slug && params.slug.trim() ? checkedSlug(deriveSlug(params.slug), existingSlugs) : deriveSlug(params.name, existingSlugs)
  // A programme groups projects and owns nothing (ADR-0061) — no files home is
  // provisioned for it. Named fields only: the id is generated.
  const { name, description, status } = params
  return prisma.program.create({ data: { name, description, status, slug } })
}

export async function updateProgram(params: {
  programId: string
  name?: string
  slug?: string
  description?: string | null
  status?: 'planning' | 'active' | 'archived'
}) {
  const { programId, name, description, status } = params
  const slug = params.slug === undefined ? undefined : checkedSlug(params.slug, await slugsOf('program', programId))
  return orNotFound('Programme', () => prisma.program.update({
    where: { id: programId },
    data: { name, slug, description, status },
    include: { _count: { select: { projects: true } } },
  }))
}

export async function deleteProgram(programId: string) {
  await orNotFound('Programme', () => prisma.$transaction(async (tx) => {
    await tx.project.updateMany({ where: { programId }, data: { programId: null } })
    await tx.program.delete({ where: { id: programId } })
  }))
}
