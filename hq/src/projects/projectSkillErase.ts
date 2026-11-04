import type { Prisma } from '@prisma/client'
import { personSkillErasure } from '../assets/conversation/usedSkillErase'

/**
 * Deleting a project takes the content hq kept of its skills with it, as erasing a person does for theirs: its place
 * skills with every version and draft, and the proposals made for it. A proposal names its project by id only, so
 * nothing cascades. The content is released for the sweep, which keeps it only while anything else still names it.
 */
export async function projectSkillErasure(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  const where = { aim: 'PROJECT' as const, placeId: projectId }
  const proposals = await tx.proposal.findMany({ where, select: { digest: true } })
  for (const write of await personSkillErasure(tx, [{ type: 'project', id: projectId }])) await write
  await tx.proposal.deleteMany({ where })
  const digests = [...new Set(proposals.map(p => p.digest))]
  if (digests.length) await tx.packageContent.updateMany({ where: { digest: { in: digests } }, data: { releasedAt: new Date() } })
}
