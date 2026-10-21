/**
 * Product operations — control-plane service layer (hq/site split spec §7.2,
 * plan 5b-2 task 4). See taskOps.ts's header for the shared conventions.
 *
 * No blanket try/catch-and-wrap here: none of
 * these calls have a domain error type worth translating, so a failure
 * propagates uncaught — dataApi.ts turns it into a generic 500, never
 * forwarding err.message (which can carry Prisma's file paths and code
 * excerpts) into the response body. The only ControlPlaneErrors thrown here
 * are the deliberate ones below (role floor, and the run's person).
 */
import { prisma } from 'wasp/server'
import { getProduct, createProduct, updateProduct, deleteProduct, type ProjectViewer } from '../../products/productService'
import type { CallerContext } from './types'
import { requireRoleFloor } from './authorize'
import { actingPerson, confinedProjectId, reachesOwnSpace } from './runPerson'

// ── list_products ─────────────────────────────────────────────────────────
// A product groups projects and owns nothing (ADR-0061), so there is no
// membership to pin the list to: every product is org structure, and the list
// is the same one for every caller. SC-309's pin-to-the-acting-agent rule
// applied while ProductMember decided what an agent could reach.

export async function listProductsOp(_ctx: CallerContext, _args: { agentId?: string }) {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, slug: true, description: true, vision: true, status: true },
  })
  return { products }
}

// ── get_product ───────────────────────────────────────────────────────────────

// The projects under a product are seen as the caller sees projects everywhere
// else: as its person sees them (membership), narrowed to the run's project for
// a run confined to one (adr-0101), and for a connection to its own project list.
async function viewerOf(ctx: CallerContext): Promise<ProjectViewer> {
  if (ctx.kind === 'connection') return { userId: ctx.connection.userId, onlyProjectIds: ctx.connection.projectIds }
  const { userId } = await actingPerson(ctx, 'get_product')
  if (reachesOwnSpace(ctx)) return { userId }
  const confined = confinedProjectId(ctx)
  return { userId, onlyProjectIds: confined ? [confined] : [] }
}

export async function getProductOp(ctx: CallerContext, args: { productId: string }) {
  const product = await getProduct(args.productId, await viewerOf(ctx))
  return { product }
}

// ── create_product ────────────────────────────────────────────────────────────

interface CreateProductArgs {
  name: string
  slug: string
  description?: string
  vision?: string
}

export async function createProductOp(ctx: CallerContext, args: CreateProductArgs) {
  await requireRoleFloor(ctx, 'create_product')
  // Defence in depth (review I1/C1): dataApi.ts's boundary validation already
  // strips unknown keys via the tool's zod schema before this runs, but the
  // MCP path's schema only shapes destructuring at the call site, not this
  // function's own args type — so this op destructures explicitly too rather
  // than spreading `args` into createProduct, which spreads verbatim into
  // prisma.product.create({ data }). A literal object here means an extra
  // key (e.g. a nested relation write) can never reach Prisma from this op,
  // regardless of what either transport's boundary layer does.
  const { name, slug, description, vision } = args
  const product = await createProduct({ name, slug, description, vision })
  return { product }
}

// ── update_product ────────────────────────────────────────────────────────────

interface UpdateProductArgs {
  productId: string
  name?: string
  slug?: string
  description?: string | null
  vision?: string | null
  status?: 'active' | 'sunset'
}

export async function updateProductOp(ctx: CallerContext, args: UpdateProductArgs) {
  await requireRoleFloor(ctx, 'update_product')
  // Same defence-in-depth reasoning as createProductOp above.
  const { productId, name, slug, description, vision, status } = args
  const product = await updateProduct({ productId, name, slug, description, vision, status })
  return { product }
}

// ── delete_product ────────────────────────────────────────────────────────────

export async function deleteProductOp(ctx: CallerContext, args: { productId: string }) {
  await requireRoleFloor(ctx, 'delete_product')
  await deleteProduct(args.productId)
  return { deleted: true, productId: args.productId }
}
