/** A waiting merge card as the work bar shows it: the branch, and whether the viewer may press *Merge* or *Not now*. */
import type { MergeApprovalCard } from '@agenthix/core'
import { openJson } from '../conversations/sealing'
import { isMergeCard, parseMergeCardArgs } from './mergeCardArgs'
import { mayActIn } from './workspaceAccess'

type Row = { toolName: string; args: string | null; boundaryType: 'user' | 'project' | null; boundaryId: string | null }

export async function mergeCardView(row: Row, viewerId: string): Promise<{ mergeCard?: MergeApprovalCard }> {
  if (!isMergeCard(row.toolName) || !row.args) return {}
  const args = parseMergeCardArgs(openJson<Record<string, unknown>>(row.args))
  if (!args) return {}
  const canAnswer = row.boundaryType && row.boundaryId ? await mayActIn({ ownerType: row.boundaryType, ownerId: row.boundaryId }, viewerId) : false
  return { mergeCard: { workspaceId: args.workspaceId, branch: args.branch, main: args.main, agentName: args.agentName, canAnswer } }
}
