/**
 * Billing profiles (part 5, B1–B4): what a place's AI cost belongs to. Organisation admins make, rename and archive
 * them, and choose the default; none is ever deleted or its id reused. Archiving is refused for the default and while
 * projects use the profile, unless the admin names where those projects go, which moves them first. A project's
 * profile is changed by organisation admins only, from its next call, and each change is recorded.
 */
import { HttpError, prisma } from 'wasp/server'
import { BILLING_PROFILE_NAME_MAX, type BillingProfileArchiveRefusal } from '@agenthix/core'
import { ensureDefaultBillingProfile } from './defaultProfile'

export function cleanProfileName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
  if (!name) throw new HttpError(400, 'A billing profile needs a name.')
  if (name.length > BILLING_PROFILE_NAME_MAX) throw new HttpError(400, `A billing profile's name is at most ${BILLING_PROFILE_NAME_MAX} characters.`)
  return name
}

async function requireNameFree(name: string, exceptId?: string): Promise<void> {
  const taken = await prisma.billingProfile.findFirst({
    where: { archivedAt: null, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  })
  if (taken) throw new HttpError(409, `There is already a billing profile named ${name}.`)
}

async function activeProfile(id: unknown): Promise<{ id: string; name: string; isDefault: boolean }> {
  const row = typeof id === 'string' && id
    ? await prisma.billingProfile.findUnique({ where: { id }, select: { id: true, name: true, isDefault: true, archivedAt: true } })
    : null
  if (!row) throw new HttpError(404, 'That billing profile does not exist.')
  if (row.archivedAt) throw new HttpError(409, `${row.name} is archived.`)
  return row
}

/** The shared projects among these ids; a person's own place is always the default's. */
async function sharedProjects(projectIds: readonly string[]): Promise<{ id: string; billingProfileId: string | null }[]> {
  if (projectIds.length === 0) return []
  const rows = await prisma.project.findMany({ where: { id: { in: [...projectIds] } }, select: { id: true, billingProfileId: true, personalOwnerId: true } })
  if (rows.length !== new Set(projectIds).size) throw new HttpError(404, 'A project named does not exist.')
  if (rows.some(r => r.personalOwnerId)) throw new HttpError(400, "A person's own project is always billed to the default profile.")
  return rows
}

/** Moves projects to a profile from their next call, recording each change. */
async function moveProjects(projects: { id: string; billingProfileId: string | null }[], toProfileId: string, byUserId: string): Promise<void> {
  const moving = projects.filter(p => p.billingProfileId !== toProfileId)
  if (moving.length === 0) return
  await prisma.$transaction([
    prisma.project.updateMany({ where: { id: { in: moving.map(p => p.id) } }, data: { billingProfileId: toProfileId } }),
    prisma.projectBillingChange.createMany({
      data: moving.map(p => ({ projectId: p.id, fromProfileId: p.billingProfileId, toProfileId, changedById: byUserId })),
    }),
  ])
}

export async function createBillingProfile(input: { name: unknown; projectIds?: readonly string[] }, byUserId: string): Promise<{ id: string }> {
  const name = cleanProfileName(input.name)
  await ensureDefaultBillingProfile()
  await requireNameFree(name)
  const projects = await sharedProjects(input.projectIds ?? [])
  const made = await prisma.billingProfile.create({ data: { name, createdById: byUserId }, select: { id: true } })
  await moveProjects(projects, made.id, byUserId)
  return made
}

export async function renameBillingProfile(input: { id: unknown; name: unknown }): Promise<void> {
  const profile = await activeProfile(input.id)
  const name = cleanProfileName(input.name)
  await requireNameFree(name, profile.id)
  await prisma.billingProfile.update({ where: { id: profile.id }, data: { name } })
}

export async function makeDefaultBillingProfile(input: { id: unknown }): Promise<void> {
  const profile = await activeProfile(input.id)
  if (profile.isDefault) return
  // Off first, then on: the partial unique index allows one default at a time.
  await prisma.$transaction([
    prisma.billingProfile.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    prisma.billingProfile.update({ where: { id: profile.id }, data: { isDefault: true } }),
  ])
}

/** Archiving refused: 409, with why (`BillingProfileArchiveRefusal`) as the error's data. */
function archiveRefused(message: string, refusal: BillingProfileArchiveRefusal): HttpError {
  return new HttpError(409, message, refusal)
}

export async function archiveBillingProfile(input: { id: unknown; moveProjectsTo?: unknown }, byUserId: string): Promise<void> {
  const profile = await activeProfile(input.id)
  if (profile.isDefault) throw archiveRefused(`${profile.name} is the default billing profile. Make another the default first.`, { reason: 'is_default' })
  const using = await prisma.project.findMany({ where: { billingProfileId: profile.id }, select: { id: true, billingProfileId: true } })
  if (using.length > 0) {
    if (input.moveProjectsTo === undefined || input.moveProjectsTo === null) {
      const n = using.length
      throw archiveRefused(`${n} project${n === 1 ? ' uses' : 's use'} ${profile.name}. Move ${n === 1 ? 'it' : 'them'} first.`, { reason: 'in_use', projectCount: n })
    }
    const to = await activeProfile(input.moveProjectsTo)
    if (to.id === profile.id) throw new HttpError(400, 'Its projects must move to another billing profile.')
    await moveProjects(using, to.id, byUserId)
  }
  const { count } = await prisma.billingProfile.updateMany({ where: { id: profile.id, archivedAt: null, isDefault: false }, data: { archivedAt: new Date() } })
  if (count !== 1) throw new HttpError(409, `${profile.name} changed meanwhile. Try again.`)
}

/** An organisation admin moves a shared project's cost, from its next call. */
export async function setProjectBillingProfile(input: { projectId: unknown; billingProfileId: unknown }, byUserId: string): Promise<void> {
  if (typeof input.projectId !== 'string' || !input.projectId) throw new HttpError(400, 'Name a project.')
  const [project] = await sharedProjects([input.projectId])
  const to = await activeProfile(input.billingProfileId)
  await moveProjects([project], to.id, byUserId)
}

/** The profile a new shared project gets: the creator's pick when it is one not archived, else the default. */
export async function profileForNewProject(pick: unknown): Promise<string> {
  if (pick === undefined || pick === null || pick === '') return ensureDefaultBillingProfile()
  return (await activeProfile(pick)).id
}
