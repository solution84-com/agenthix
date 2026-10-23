import { HttpError, prisma } from 'wasp/server'
import { mayWorkInProject } from '../projects/membership'

/** Whoever may work in a project may see which models its tasks and routines can name; nobody else. */
export async function mayPickFor(projectId: unknown, userId: string): Promise<void> {
  if (typeof projectId !== 'string' || !projectId) throw new HttpError(400, 'Which project?')
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { personalOwnerId: true } })
  if (!project) throw new HttpError(404, 'Project not found')
  if (project.personalOwnerId ? project.personalOwnerId === userId : await mayWorkInProject(projectId, userId)) return
  throw new HttpError(403, 'You do not work in this project')
}
