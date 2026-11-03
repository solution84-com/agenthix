/**
 * A service's yes against a real database: kept by workspace, service and declaration hash, approved twice without a
 * second row, and removed with the workspace.
 */
import { describe, it, expect } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import { prisma } from '../../../../test/db'
import { approvalKey, dbServiceApprovals } from '../serviceApprovals'

let n = 0
const uniq = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${n++}`

withFeature('livePreview', () => {
  describe('dbServiceApprovals @SC-1742', () => {
    it('keeps each approved declaration of a workspace, once', async () => {
      const ws = uniq('ws')
      await dbServiceApprovals.approve(ws, 'redis', 'h1')
      await dbServiceApprovals.approve(ws, 'redis', 'h1')
      await dbServiceApprovals.approve(ws, 'redis', 'h2')
      await dbServiceApprovals.approve(uniq('other'), 'redis', 'h3')
      expect(await dbServiceApprovals.approved(ws)).toEqual(new Set([approvalKey('redis', 'h1'), approvalKey('redis', 'h2')]))
      expect(await prisma.livePreviewServiceApproval.count({ where: { workspaceId: ws } })).toBe(2)
    })

    it('forgets a workspace\'s approvals, and only that workspace\'s', async () => {
      const ws = uniq('ws')
      const other = uniq('other')
      await dbServiceApprovals.approve(ws, 'redis', 'h1')
      await dbServiceApprovals.approve(other, 'redis', 'h1')
      await dbServiceApprovals.forgetWorkspace(ws)
      expect((await dbServiceApprovals.approved(ws)).size).toBe(0)
      expect((await dbServiceApprovals.approved(other)).size).toBe(1)
    })
  })
})
