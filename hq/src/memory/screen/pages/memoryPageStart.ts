import type { MemoryScopeValue } from '../../../shared/memory/protocol'

const SCOPES: readonly MemoryScopeValue[] = ['PERSON', 'AGENT_PERSON', 'AGENT_PLACE']

/** Where Settings › Memory opens: the scope, agent and place its address names, as *Show in Memory* gives them. */
export function memoryPageStart(params: URLSearchParams): { scope: MemoryScopeValue; agentId: string; placeKey: string } {
  const named = params.get('scope')
  const scope = SCOPES.find(s => s === named) ?? 'PERSON'
  return { scope, agentId: params.get('agent') ?? '', placeKey: params.get('place') ?? '' }
}
