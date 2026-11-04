/** A project named by its key (WAL, any case) or its id, as the people who use the tools know it. */
import { prisma } from 'wasp/server'

const PROJECT_KEY = /^[A-Za-z0-9]+$/

/**
 * The arguments with a `projectId` given as a key replaced by the project's id. An id, and words that name no project,
 * pass as they came: the operation says what it does with them.
 */
export async function withProjectId<T>(args: T): Promise<T> {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return args
  const given = (args as { projectId?: unknown }).projectId
  if (typeof given !== 'string') return args
  const words = given.trim()
  if (!PROJECT_KEY.test(words)) return args
  if (await prisma.project.findUnique({ where: { id: words }, select: { id: true } })) return args
  const project = await prisma.project.findUnique({ where: { key: words.toUpperCase() }, select: { id: true } })
  return project ? { ...args, projectId: project.id } : args
}
