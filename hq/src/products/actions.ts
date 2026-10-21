import {
  type CreateProduct,
  type UpdateProduct,
  type DeleteProduct,
  type CreateProgram,
  type UpdateProgram,
  type DeleteProgram,
} from 'wasp/server/operations'
import { requireRole } from '../server/identity/requireRole'
import {
  createProduct as createProductRecord,
  updateProduct as updateProductRecord,
  deleteProduct as deleteProductRecord,
  createProgram as createProgramRecord,
  updateProgram as updateProgramRecord,
  deleteProgram as deleteProgramRecord,
} from './productService'

export const createProduct: CreateProduct<
  { name: string; slug: string; description?: string; vision?: string; status?: 'active' | 'sunset' },
  any
> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Creating a product')
  return createProductRecord(args)
}

export const updateProduct: UpdateProduct<
  { productId: string; name?: string; slug?: string; description?: string | null; vision?: string | null; status?: 'active' | 'sunset' },
  any
> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Updating a product')
  return updateProductRecord(args)
}

export const deleteProduct: DeleteProduct<{ productId: string }, any> = async (
  { productId },
  context,
) => {
  await requireRole(context, 'ADMIN', 'Deleting a product')
  return deleteProductRecord(productId)
}

export const createProgram: CreateProgram<
  { name: string; slug?: string; description?: string; status?: 'planning' | 'active' | 'archived' },
  any
> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Creating a program')
  return createProgramRecord(args)
}

export const updateProgram: UpdateProgram<
  { programId: string; name?: string; slug?: string; description?: string | null; status?: 'planning' | 'active' | 'archived' },
  any
> = async (args, context) => {
  await requireRole(context, 'ADMIN', 'Updating a program')
  return updateProgramRecord(args)
}

export const deleteProgram: DeleteProgram<{ programId: string }, any> = async (
  { programId },
  context,
) => {
  await requireRole(context, 'ADMIN', 'Deleting a program')
  return deleteProgramRecord(programId)
}
