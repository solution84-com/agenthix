/**
 * Where Settings › Memory opens: the agent its address names, as an agent's page or an older *Show in Memory* line
 * gives it (`agent=`). The old `scope` and `place` parameters are read no more (ADR-0188).
 */
export function memoryPageStart(params: URLSearchParams): { agentId: string } {
  return { agentId: params.get('agent') ?? '' }
}
