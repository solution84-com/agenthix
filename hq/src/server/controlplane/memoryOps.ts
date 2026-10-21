/**
 * The memory tools (memory and knowledge spec): `remember`, `forget` and `recall`, for a run through its site's
 * data path and for a conversation's turn in process. Who they read and write for is memoryPrincipalOf's one
 * rule (memory/principal.ts); the store reaches only the scopes that principal may.
 *
 * Data-path-only, like runtimeOps.ts's: registered in operations.ts and kept out of CONTROL_PLANE_TOOLS, so hq's
 * own MCP surface does not grow them. They need no person behind the call — a run nobody commissioned still
 * reaches the memory of its place — so the registry leaves the person check to them (operations.ts).
 */
import type { MemoryItemKindValue, MemoryScopeValue } from '../../shared/memory/protocol'
import type { MemoryService, RecalledItem } from '../../memory/contract'
import { memoryService, MemoryRefused } from '../../memory/memoryService'
import { memoryPrincipalOf, requireMayWrite } from '../../memory/principal'
import { ControlPlaneError, type CallerContext } from './types'

export const TOOL_SCOPES = ['person', 'agent_person', 'agent_place'] as const
export const TOOL_KINDS = ['fact', 'preference', 'decision', 'feedback', 'project'] as const
type ToolScope = (typeof TOOL_SCOPES)[number]
type ToolKind = (typeof TOOL_KINDS)[number]

const toScope = (scope: ToolScope) => scope.toUpperCase() as MemoryScopeValue
const toKind = (kind: ToolKind) => kind.toUpperCase() as MemoryItemKindValue
const fromScope = (scope: MemoryScopeValue) => scope.toLowerCase() as ToolScope

const service: MemoryService = memoryService

function refusal(err: unknown): never {
  if (err instanceof MemoryRefused) throw new ControlPlaneError('forbidden', err.reason)
  throw err
}

export async function rememberOp(
  ctx: CallerContext,
  args: { scope: ToolScope; title: string; body: string; kind: ToolKind; tags?: string[]; key?: string },
): Promise<{ status: 'added' | 'replaced' | 'superseded' | 'merged'; key: string; scope: ToolScope }> {
  requireMayWrite(ctx, 'remember')
  const principal = await memoryPrincipalOf(ctx, 'remember')
  const outcome = await service.remember(principal, {
    scope: toScope(args.scope),
    title: args.title,
    body: args.body,
    kind: toKind(args.kind),
    tags: args.tags,
    key: args.key,
    writtenBy: { agentId: principal.agentId },
  })
  if (outcome.status === 'refused') throw new ControlPlaneError('invalid', outcome.reason)
  return { status: outcome.status, key: outcome.key, scope: args.scope }
}

export async function forgetOp(ctx: CallerContext, args: { key: string; scope: ToolScope }): Promise<{ forgotten: boolean }> {
  requireMayWrite(ctx, 'forget')
  const principal = await memoryPrincipalOf(ctx, 'forget')
  const forgotten = await service.forget(principal, args.key, toScope(args.scope)).catch(refusal)
  return { forgotten }
}

export interface RecalledForTool {
  key: string
  scope: ToolScope
  title: string
  body: string
  kind: ToolKind
  tags: string[]
  pinned: boolean
  writtenAt: string
}

const forTool = (item: RecalledItem): RecalledForTool => ({
  key: item.key,
  scope: fromScope(item.scope),
  title: item.title,
  body: item.body,
  kind: item.kind.toLowerCase() as ToolKind,
  tags: item.tags,
  pinned: item.pinned,
  writtenAt: item.writtenAt,
})

export async function recallOp(
  ctx: CallerContext,
  args: { key?: string; query?: string },
): Promise<{ items: RecalledForTool[]; cut: string[] }> {
  const key = args.key?.trim()
  const query = args.query?.trim()
  if (!key === !query) throw new ControlPlaneError('invalid', 'recall takes a key or a query, one of the two')
  const principal = await memoryPrincipalOf(ctx, 'recall')
  const { items, cut } = key
    ? { items: await service.recallByKey(principal, [key]), cut: [] }
    : await service.recallByQuery(principal, query as string)
  await service.recordOutcomes(items.map(item => ({
    itemId: item.itemId,
    kind: 'RECALLED' as const,
    similarity: item.similarity,
    ...(ctx.kind === 'turn' ? { conversationId: ctx.turn.conversationId, turnId: ctx.turn.turnId } : {}),
  })))
  return { items: items.map(forTool), cut }
}
