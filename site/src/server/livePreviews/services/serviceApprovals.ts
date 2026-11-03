/**
 * What a workspace's people approved of its live previews' services: each yes is to exactly one declaration, by its
 * hash, and is kept in the site's database, so a restart of the site asks again only for a new or changed service.
 */
import { prisma } from '#db'

export type ServiceApprovals = {
  /** Every approved declaration of the workspace, as `approvalKey(service, hash)`. */
  approved(workspaceId: string): Promise<Set<string>>
  approve(workspaceId: string, service: string, declarationHash: string): Promise<void>
  forgetWorkspace(workspaceId: string): Promise<void>
}

export const approvalKey = (service: string, declarationHash: string): string => `${service}\u0000${declarationHash}`

export const dbServiceApprovals: ServiceApprovals = {
  async approved(workspaceId) {
    const rows = await prisma.livePreviewServiceApproval.findMany({
      where: { workspaceId },
      select: { service: true, declarationHash: true },
    })
    return new Set(rows.map(r => approvalKey(r.service, r.declarationHash)))
  },
  async approve(workspaceId, service, declarationHash) {
    await prisma.livePreviewServiceApproval.upsert({
      where: { workspaceId_service_declarationHash: { workspaceId, service, declarationHash } },
      create: { workspaceId, service, declarationHash },
      update: {},
    })
  },
  async forgetWorkspace(workspaceId) {
    await prisma.livePreviewServiceApproval.deleteMany({ where: { workspaceId } })
  },
}

/** The same, held in memory: for tests, and as a model of the table. */
export function memoryServiceApprovals(): ServiceApprovals {
  const rows = new Map<string, Set<string>>()
  return {
    async approved(workspaceId) {
      return new Set(rows.get(workspaceId) ?? [])
    },
    async approve(workspaceId, service, declarationHash) {
      const set = rows.get(workspaceId) ?? new Set<string>()
      set.add(approvalKey(service, declarationHash))
      rows.set(workspaceId, set)
    },
    async forgetWorkspace(workspaceId) {
      rows.delete(workspaceId)
    },
  }
}
