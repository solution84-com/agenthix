/**
 * The memory tools (memory and knowledge spec; ADR-0188): `remember`, `forget` and `recall`, for a run through its
 * site's data path and for a conversation's turn in process. Who they read and write for is memoryPrincipalOf's one
 * rule (memory/principal.ts); where a memory holds is hq's to set from that principal, never an argument.
 *
 * Data-path-only, like runtimeOps.ts's: registered in operations.ts and kept out of CONTROL_PLANE_TOOLS, so hq's
 * own MCP surface does not grow them. The registry leaves the person check to them (operations.ts): a call for no
 * person is refused here, with the reason.
 */
import type { MemoryItemKindValue } from '../../shared/memory/protocol'
import type { MemoryPrincipal, MemoryService, RecalledItem } from '../../memory/contract'
import { memoryService, MemoryRefused } from '../../memory/memoryService'
import { memoryPrincipalOf, requireMayWrite } from '../../memory/principal'
import { NO_PERSON_REFUSAL } from '../../memory/scopes'
import { ControlPlaneError, type CallerContext } from './types'

/** @deprecated since the memory scope change (ADR-0188): read and ignored; hq sets a memory's scope. */
export const TOOL_SCOPES = ['person', 'agent_person', 'agent_place'] as const
/**
 * `fact` and `rule`; the kinds before ADR-0188 are still read: `preference`, `decision` and `feedback` as a Rule,
 * `project` as a Fact. They are deprecated (docs/architecture/versioning.md).
 */
export const TOOL_KINDS = ['fact', 'rule', 'preference', 'decision', 'feedback', 'project'] as const
export const RECALL_KINDS = ['fact', 'rule'] as const
type ToolScope = (typeof TOOL_SCOPES)[number]
type ToolKind = (typeof TOOL_KINDS)[number]

export function itemKindOf(kind: ToolKind): MemoryItemKindValue {
  return kind === 'fact' || kind === 'project' ? 'FACT' : 'RULE'
}

const service: MemoryService = memoryService

function refusal(err: unknown): never {
  if (err instanceof MemoryRefused) throw new ControlPlaneError('forbidden', err.reason)
  throw err
}

/** Memory is a person's: work for no person is told so, rather than finding nothing. */
function requirePerson(principal: MemoryPrincipal): void {
  if (!principal.personId) throw new ControlPlaneError('forbidden', NO_PERSON_REFUSAL)
}

export async function rememberOp(
  ctx: CallerContext,
  args: { title: string; body: string; kind: ToolKind; tags?: string[]; key?: string; requested?: boolean; scope?: ToolScope },
): Promise<{ status: 'added' | 'replaced' | 'superseded' | 'merged'; key: string; itemId: string; requested: boolean }> {
  requireMayWrite(ctx, 'remember')
  const principal = await memoryPrincipalOf(ctx, 'remember')
  requirePerson(principal)
  const outcome = await service.remember(principal, {
    title: args.title, body: args.body, kind: itemKindOf(args.kind), tags: args.tags, key: args.key,
    requested: args.requested === true, conversationId: ctx.kind === 'turn' ? ctx.turn.conversationId : null,
  })
  if (outcome.status === 'refused') throw new ControlPlaneError('invalid', outcome.reason)
  return { status: outcome.status, key: outcome.key, itemId: outcome.itemId, requested: args.requested === true }
}

export async function forgetOp(ctx: CallerContext, args: { key: string; scope?: ToolScope }): Promise<{ forgotten: boolean }> {
  requireMayWrite(ctx, 'forget')
  const principal = await memoryPrincipalOf(ctx, 'forget')
  requirePerson(principal)
  const forgotten = await service.forget(principal, args.key).catch(refusal)
  return { forgotten }
}

export interface RecalledForTool {
  key: string
  title: string
  body: string
  kind: 'fact' | 'rule'
  tags: string[]
  writtenAt: string
}

export const forTool = (item: RecalledItem): RecalledForTool => ({
  key: item.key,
  title: item.title,
  body: item.body,
  kind: item.kind === 'RULE' ? 'rule' : 'fact',
  tags: item.tags,
  writtenAt: item.writtenAt,
})

export type RecallArgs = { key?: string; query?: string; kind?: 'fact' | 'rule'; tags?: string[] }

/** One of a key, or a query and filters; the filters alone list what carries them. */
export function recallRequest(args: RecallArgs):
  | { by: 'key'; key: string }
  | { by: 'query'; query: string | null; kind?: MemoryItemKindValue; tags?: string[] }
  | { refused: string } {
  const key = args.key?.trim()
  const query = args.query?.trim() || null
  const tags = args.tags?.map(t => t.trim().toLowerCase()).filter(Boolean)
  const kind = args.kind ? (args.kind === 'rule' ? 'RULE' as const : 'FACT' as const) : undefined
  const filtered = !!kind || !!tags?.length
  if (key) {
    return query || filtered ? { refused: 'recall takes a key, or a query and filters, not both' } : { by: 'key', key }
  }
  if (!query && !filtered) return { refused: 'recall takes a key, a query, or a kind or tags to look for' }
  return { by: 'query', query, ...(kind ? { kind } : {}), ...(tags?.length ? { tags } : {}) }
}

/** What a recall finds for this principal, by key, by meaning, or by kind and tags alone. */
export async function recallFor(svc: MemoryService, principal: MemoryPrincipal, request: Exclude<ReturnType<typeof recallRequest>, { refused: string }>) {
  if (request.by === 'key') return { items: await svc.recallByKey(principal, [request.key]), cut: [] as string[] }
  const filters = { kind: request.kind, tags: request.tags }
  return request.query ? svc.recallByQuery(principal, request.query, filters) : svc.recallFiltered(principal, filters)
}

export async function recallOp(ctx: CallerContext, args: RecallArgs): Promise<{ items: RecalledForTool[]; cut: string[] }> {
  const request = recallRequest(args)
  if ('refused' in request) throw new ControlPlaneError('invalid', request.refused)
  const principal = await memoryPrincipalOf(ctx, 'recall')
  requirePerson(principal)
  const { items, cut } = await recallFor(service, principal, request)
  await service.recordOutcomes(items.map(item => ({
    itemId: item.itemId,
    kind: 'RECALLED' as const,
    similarity: item.similarity,
    ...(ctx.kind === 'turn' ? { conversationId: ctx.turn.conversationId, turnId: ctx.turn.turnId } : {}),
  })))
  return { items: items.map(forTool), cut }
}
