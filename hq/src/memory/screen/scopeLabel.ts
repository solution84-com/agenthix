import type { MemoryScopeValue } from '../../shared/memory/protocol'

export function scopeLabel(scope: MemoryScopeValue, agentName: string | null, placeName: string | null): string {
  if (scope === 'PERSON') return 'Everyone you work with'
  if (scope === 'AGENT_PERSON') return `${agentName ?? 'An agent'}, about you`
  return `${agentName ?? 'An agent'}, in ${placeName ?? 'a place'}`
}
