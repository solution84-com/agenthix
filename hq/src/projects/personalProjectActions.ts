/**
 * Making a personal project (models from one place, part 4): any active person, as many as they like. It asks
 * for a name and a description and nothing else — the site is the one that holds the person's own storage, the
 * owner is its one admin, and it has no product, programme, members or billing profile.
 */
import type { CreatePersonalProject } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import type { Project } from 'wasp/entities'
import { createProject as createProjectRecord } from './projectService'
import { ensureUserStoragePlacement } from '../storage/storageSite'
import { deriveProjectKey } from '../shared/identifiers'
import { rethrowLocationFileErrorAsHttp } from '../storage/httpErrors'

const MAX_NAME_LENGTH = 120

export const createPersonalProject: CreatePersonalProject<{ name: string; description?: string }, Project> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const person = await prisma.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true, erasedAt: true } })
  if (!person || person.deactivatedAt || person.erasedAt) throw new HttpError(403, 'Only a person in the organisation can make a personal project')

  const name = typeof args?.name === 'string' ? args.name.trim() : ''
  if (!name) throw new HttpError(400, 'A project needs a name')
  if (name.length > MAX_NAME_LENGTH) throw new HttpError(400, `A project name is at most ${MAX_NAME_LENGTH} characters`)
  const description = typeof args.description === 'string' && args.description.trim() ? args.description.trim() : undefined

  // On the site that holds the person's own storage, so no site is asked for.
  const logicalSiteId = await ensureUserStoragePlacement(userId)
  const site = await prisma.executionSite.findUnique({ where: { siteId: logicalSiteId }, select: { id: true } })
  if (!site) throw new HttpError(400, 'The site that holds your files is not available')

  const existingKeys = (await prisma.project.findMany({ select: { key: true } })).map(p => p.key)
  const key = deriveProjectKey(name, existingKeys)

  try {
    return await createProjectRecord({ name, description, key, executionSiteId: site.id, personalOwnerId: userId })
  } catch (err) {
    rethrowLocationFileErrorAsHttp(err)
  }
}
