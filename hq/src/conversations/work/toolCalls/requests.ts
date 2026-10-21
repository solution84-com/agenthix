/**
 * What answering or stopping a request leaves behind: who may answer one, and the request done with — its card no
 * longer awaiting a turn to present it (the turn on the answer does), and its notification handled.
 */
import { prisma } from 'wasp/server'
import type { SharedBoundary } from '../../contract'
import { boundaryName } from '../../coordinator/continuationChecks'
import { permissionsOf } from '../../tools/mintTurnCapability'
import { turnToolState } from '../../../server/controlplane/turnCaller'
import { mayWorkInProject } from '../../../projects/membership'
import { markOperationNotificationsHandled } from '../../../notifications/handled'
import { admitToBoundary } from '../boundaries'

export interface AskedOperation {
  kind: string
  toolName: string
  boundaryType: 'user' | 'project' | null
  boundaryId: string | null
}

/**
 * Why this person may not answer the request, or null when they may: the asker's checks re-run as them. A member
 * of the operation's boundary who may work there; the tool not Never there for the agent; for a worker's request,
 * also the agent still assigned there — the three checks its brief was admitted with.
 */
export async function answererRefusal(op: AskedOperation, answererId: string, agentId: string | null): Promise<string | null> {
  if (!op.boundaryType || !op.boundaryId) return null
  const boundary: SharedBoundary = {
    key: op.boundaryId, type: op.boundaryType, id: op.boundaryId, name: await boundaryName(op.boundaryType, op.boundaryId),
  }
  if (op.kind === 'WORKER' && agentId) {
    const admitted = await admitToBoundary({ personId: answererId, agentId, boundary, tool: op.toolName })
    return admitted.ok ? null : admitted.reason
  }
  if (boundary.type === 'user') {
    if (boundary.id !== answererId) return "that request is in someone else's space"
  } else if (!(await mayWorkInProject(boundary.id, answererId))) {
    return `you can't work in ${boundary.name}, so you can't answer for it`
  }
  if (agentId && turnToolState(await permissionsOf(agentId, { type: boundary.type, id: boundary.id }), op.toolName) === 'never') {
    return `${op.toolName} isn't allowed in ${boundary.name}`
  }
  return null
}

/** The request is answered or stopped: no report turn presents its card any more, and its notification is handled. */
export async function requestDone(operationId: string): Promise<void> {
  await prisma.conversationMessage.updateMany({
    where: { operationId, kind: 'APPROVAL_REQUEST', awaitsTurn: true, turnId: null },
    data: { awaitsTurn: false },
  })
  await markOperationNotificationsHandled(operationId)
}
