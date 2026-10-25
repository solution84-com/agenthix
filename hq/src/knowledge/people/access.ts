/**
 * Who may read and change each level's knowledge in hq's screens (agent knowledge spec, part 4, *Who reaches what*):
 * a project's — read by its members, changed by those who may change its files (a Member or Admin; a Viewer reads);
 * a person's own — only themselves; the organisation's — read by every member, changed by organisation admins. A
 * project is checked by the one location access rule, as its files are.
 */
import { prisma } from 'wasp/server'
import { assertLocationAccess } from '../../storage/locationAccess'
import { isOrgAdmin, mayWorkInProject } from '../../projects/membership'
import { projectLevel } from '../../conversations/places'
import { ORG_LEVEL, ORG_OWNER, PERSONAL_LEVEL } from '../reach'
import { KnowledgeRefusal, type OwnerAccess } from './deps'
import type { KnowledgeOwner } from './types'

export const ORG_NAME = 'Organisation'
export const YOUR_SPACE_NAME = 'Your space'

export async function openKnowledge(owner: KnowledgeOwner, userId: string): Promise<OwnerAccess> {
  switch (owner.ownerType) {
    case 'org':
      return { ref: ORG_OWNER, level: ORG_LEVEL, name: ORG_NAME, canChange: await isOrgAdmin(userId) }
    case 'user':
      if (owner.ownerId !== userId) throw new KnowledgeRefusal(403, "A person's own knowledge is theirs alone: you can open only yours.")
      return { ref: { ownerType: 'user', ownerId: userId }, level: PERSONAL_LEVEL, name: YOUR_SPACE_NAME, canChange: true }
    case 'project': {
      await assertLocationAccess({ ownerType: 'project', ownerId: owner.ownerId }, userId, 'read')
      const project = await prisma.project.findUnique({ where: { id: owner.ownerId }, select: { name: true, slug: true, key: true } })
      if (!project) throw new KnowledgeRefusal(404, 'There is no such project.')
      return {
        ref: { ownerType: 'project', ownerId: owner.ownerId },
        level: projectLevel(project),
        name: project.name,
        canChange: await mayWorkInProject(owner.ownerId, userId),
      }
    }
  }
}
