/**
 * Making a personal project (models from one place, part 4): any active person, as many as they like. It asks
 * for a name, a description and, if the person typed one, its key — the site is the one that holds the person's own storage, the
 * owner is its one admin, and it has no product, programme, members or billing profile.
 */
import type { CreatePersonalProject } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import type { Project } from 'wasp/entities'
import { createProject as createProjectRecord } from './projectService'
import { ensureUserStoragePlacement } from '../storage/storageSite'
import { deriveProjectKey } from '../shared/identifiers'
import { rethrowLocationFileErrorAsHttp } from '../storage/httpErrors'
import { checkedProjectName } from './projectFields'

export const createPersonalProject: CreatePersonalProject<{ name: string; description?: string; key?: string }, Project> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const person = await prisma.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true, erasedAt: true } })
  if (!person || person.deactivatedAt || person.erasedAt) throw new HttpError(403, 'Only a person in the organisation can make a personal project')

  const name = checkedProjectName(args?.name)
  const description = typeof args.description === 'string' && args.description.trim() ? args.description.trim() : undefined

  // On the site that holds the person's own storage, so no site is asked for.
  const logicalSiteId = await ensureUserStoragePlacement(userId)
  const site = await prisma.executionSite.findUnique({ where: { siteId: logicalSiteId }, select: { id: true } })
  if (!site) throw new HttpError(400, 'The site that holds your files is not available')

  // A key the person typed is checked where every project's is; with none, one is derived that is free.
  const key = args.key !== undefined && args.key !== ''
    ? args.key
    : deriveProjectKey(name, (await prisma.project.findMany({ select: { key: true } })).map(p => p.key))

  try {
    return await createProjectRecord({ name, description, key, executionSiteId: site.id, personalOwnerId: userId })
  } catch (err) {
    rethrowLocationFileErrorAsHttp(err)
  }
}
