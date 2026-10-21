interface PickableAgent {
  id: string
}

interface ProjectWithRoster {
  agents?: Array<{ agent: { id: string } }>
}

/**
 * The agents a task in a project may be assigned to: the project's own roster.
 * Creating or updating a task refuses any other agent (400), so the picker
 * does not offer one. The task's current assignee stays in the list even when
 * it has since left the roster, otherwise the picker would show the task as
 * unassigned when it is not.
 */
export function agentsForProjectPicker<A extends PickableAgent>(
  allAgents: readonly A[],
  project: ProjectWithRoster | null | undefined,
  currentAgentId?: string | null,
): A[] {
  if (!project?.agents) return []
  const onRoster = new Set(project.agents.map(pa => pa.agent.id))
  return allAgents.filter(a => onRoster.has(a.id) || a.id === currentAgentId)
}
