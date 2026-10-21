import { HttpError } from 'wasp/server'
import {
  type GetProducts,
  type GetProduct,
  type GetProductBySlug,
  type GetPrograms,
  type GetProgram,
  type GetProgramBySlug,
} from 'wasp/server/operations'
import {
  listProducts,
  getProduct as getProductRecord,
  getProductBySlug as getProductBySlugRecord,
  listPrograms,
  getProgram as getProgramRecord,
  getProgramBySlug as getProgramBySlugRecord,
} from './productService'

export const getProducts: GetProducts<void, any[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return listProducts({ userId: context.user.id })
}

export const getProduct: GetProduct<{ productId: string }, any> = async ({ productId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return getProductRecord(productId, { userId: context.user.id })
}

export const getProductBySlug: GetProductBySlug<{ slug: string }, any> = async ({ slug }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return getProductBySlugRecord(slug, { userId: context.user.id })
}

export const getPrograms: GetPrograms<void, any[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return listPrograms({ userId: context.user.id })
}

export const getProgram: GetProgram<{ programId: string }, any> = async ({ programId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return getProgramRecord(programId, { userId: context.user.id })
}

export const getProgramBySlug: GetProgramBySlug<{ slug: string }, any> = async ({ slug }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return getProgramBySlugRecord(slug, { userId: context.user.id })
}
