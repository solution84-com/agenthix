/**
 * ToolCallLog row access — plan 5d-2 task 3. Authored BY SITE.
 */
import { prisma } from '#db'
import type { ToolCallRow } from '@agenthix/core'

export async function listToolCalls(runId: string): Promise<ToolCallRow[]> {
  const calls = await prisma.toolCallLog.findMany({
    where: { runId },
    orderBy: { createdAt: 'asc' },
  })
  return calls.map((call) => ({
    id: call.id,
    runId: call.runId,
    toolName: call.toolName,
    toolInput: call.toolInput as ToolCallRow['toolInput'],
    toolUseId: call.toolUseId,
    riskLevel: call.riskLevel as ToolCallRow['riskLevel'],
    blocked: call.blocked,
    blockReason: call.blockReason,
    createdAt: call.createdAt.toISOString(),
  }))
}
