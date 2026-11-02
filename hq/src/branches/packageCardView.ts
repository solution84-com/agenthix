/** A waiting package card as the work bar shows it: the package, HQ's question, and whether the viewer may answer. */
import type { PackageApprovalCard } from '@agenthix/core'
import { openJson } from '../conversations/sealing'
import { isPackageCard, parsePackageCardArgs } from './packageCardArgs'
import { mayActIn } from './workspaceAccess'

type Row = { toolName: string; args: string | null; boundaryType: 'user' | 'project' | null; boundaryId: string | null }

export async function packageCardView(row: Row, viewerId: string): Promise<{ packageCard?: PackageApprovalCard }> {
  if (!isPackageCard(row.toolName) || !row.args) return {}
  const a = parsePackageCardArgs(openJson<Record<string, unknown>>(row.args))
  if (!a) return {}
  const canAnswer = row.boundaryType && row.boundaryId ? await mayActIn({ ownerType: row.boundaryType, ownerId: row.boundaryId }, viewerId) : false
  return { packageCard: { workspaceId: a.workspaceId, branch: a.branch, name: a.name, version: a.version, question: a.question, agentName: a.agentName, canAnswer } }
}
