/**
 * Where a call is made, as the resolver needs it (core's `ResolvePlace`): a person's own place — their space and
 * every personal project they made — or a shared project, task threads included.
 */
import { HttpError, prisma } from 'wasp/server'
import type { ResolvePlace } from '@agenthix/core'
import type { ConversationHomeRef } from '../conversations/contract'

export async function placeOfProject(projectId: string): Promise<ResolvePlace> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { personalOwnerId: true } })
  if (!project) throw new HttpError(404, 'Project not found')
  return project.personalOwnerId ? { kind: 'own', userId: project.personalOwnerId, projectId } : { kind: 'project', projectId }
}

/** A run's boundary: a person's own storage, or a project's. */
export async function placeOfBoundary(boundary: { type: 'user' | 'project'; id: string } | null): Promise<ResolvePlace> {
  if (!boundary) return { kind: 'organisation' }
  if (boundary.type === 'user') return { kind: 'own', userId: boundary.id }
  return placeOfProject(boundary.id)
}

export async function placeOfConversation(ref: Pick<ConversationHomeRef, 'home' | 'projectId' | 'taskId' | 'openedById'>): Promise<ResolvePlace> {
  if (ref.home === 'PERSON') return { kind: 'own', userId: ref.openedById }
  if (ref.home === 'PROJECT') {
    if (!ref.projectId) throw new HttpError(500, 'A project conversation names no project')
    return placeOfProject(ref.projectId)
  }
  if (!ref.taskId) throw new HttpError(500, 'A task conversation names no task')
  const task = await prisma.task.findUnique({ where: { id: ref.taskId }, select: { projectId: true } })
  if (!task) throw new HttpError(404, 'Task not found')
  return placeOfProject(task.projectId)
}
