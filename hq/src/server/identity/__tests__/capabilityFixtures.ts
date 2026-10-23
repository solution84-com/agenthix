/**
 * Shared set-up for the capability tests (capability*.integration.test.ts): one
 * small organisation in the real test database. Person u1 has their storage on
 * site-1; project p1 and workspace w1 live on site-1 too; task t1 is p1's.
 * Agent a1 can read files. A workspace's own settings live on its site, so the
 * tests answer that read themselves (`siteWorkspaces`).
 */
import type { LocationRef } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createTestTask } from '../../../test/factories'

export const agent = { id: 'a1', allowedTools: [{ name: 'read_file', state: 'always' }], allowedBashPatterns: null, approval: 'deferred' }
export const chatSession = {
  id: 's1', userId: 'u1', primaryOwnerType: 'user' as const, primaryOwnerId: 'u1', primaryWorkspaceId: 'w1', taskId: null, sessionType: 'chat',
}
export const chatLoc: LocationRef = { ownerType: 'user', ownerId: 'u1', workspaceId: 'w1' }
export const userFilesLoc: LocationRef = { ownerType: 'user', ownerId: 'u1' }
export const projectTaskLoc: LocationRef = { ownerType: 'project', ownerId: 'p1', taskId: 't1' }

export async function site(siteId: string, isDefault = false) {
  return prisma.executionSite.create({ data: { siteId, label: siteId, isDefault, credentialHash: 'h'.repeat(64) } })
}

/** The organisation above, with the stored agent and chat session behind `agent` and `chatSession`. */
export async function seedOrganisation() {
  const site1 = await site('site-1', true)
  await prisma.user.create({ data: { id: 'u1' } })
  await prisma.userStoragePlacement.create({ data: { userId: 'u1', siteId: site1.id } })
  await prisma.project.create({ data: { id: 'p1', name: 'P1', key: 'P1', executionSiteId: site1.id } })
  await createTestTask({ data: { id: 't1', title: 't', projectId: 'p1', number: 1, onBehalfOfUserId: 'u1' } })
  await prisma.workspacePlacement.create({ data: { workspaceId: 'w1', siteId: site1.id } })
  await prisma.agent.create({ data: { id: 'a1', name: 'Agent', handle: 'a1', allowedTools: agent.allowedTools, approval: 'deferred' } })
  await prisma.agentSession.create({
    data: { id: 's1', userId: 'u1', agentId: 'a1', sessionType: 'chat', primaryOwnerType: 'user', primaryOwnerId: 'u1', primaryWorkspaceId: 'w1' },
  })
  return { site1 }
}

/** A person's space (their default personal project, whose tasks work in their own storage), with one task, and that person's storage on `siteId`. */
export async function seedPersonalProject(userId: string, siteRowId: string) {
  await prisma.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} })
  await prisma.userStoragePlacement.upsert({ where: { userId }, create: { userId, siteId: siteRowId }, update: { siteId: siteRowId } })
  await prisma.project.create({ data: { id: 'p-mine', name: 'Mine', key: 'MINE', personalOwnerId: userId, personalSpace: true, accessLevel: 'PRIVATE' } })
  await createTestTask({ data: { id: 't-mine', title: 't', projectId: 'p-mine', number: 1, onBehalfOfUserId: userId } })
}

/** Another of a person's personal projects, with storage of its own on `siteId`, and one task. */
export async function seedSidePersonalProject(userId: string, siteRowId: string) {
  await prisma.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} })
  await prisma.project.create({
    data: { id: 'p-side', name: 'Side', key: 'SIDE', personalOwnerId: userId, accessLevel: 'PRIVATE', executionSiteId: siteRowId },
  })
  await createTestTask({ data: { id: 't-side', title: 't', projectId: 'p-side', number: 1, onBehalfOfUserId: userId } })
}

type Entry = { state: 'always' | 'ask' | 'never' }
export function override(
  boundaryType: 'user' | 'project', boundaryId: string,
  values: { allowedTools?: (Entry & { name: string })[]; allowedBashPatterns?: (Entry & { pattern: string })[]; approval?: string },
) {
  return prisma.agentOverride.create({ data: { boundaryType, boundaryId, agentId: 'a1', ...values } })
}
