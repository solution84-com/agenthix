/**
 * Where an action line's *Show in …* goes: the place's tool, opened with the item marked, in the address the tools
 * already take (`?tool=boards&board=<id>`). A kind with no tool of its own has no link.
 */
export type ActionTarget = { kind: string; id: string; label: string; params?: Record<string, string> }

/**
 * `param`: the name the tool reads the marked item by, where it is not the kind's own. `page`: a screen of its own,
 * opened in place of the place's tool — Memory, whose screen holds every scope (walkthrough finding 35).
 */
const TOOLS: Record<string, { tool: string; label: string; param?: string; page?: string }> = {
  task: { tool: 'tasks', label: 'Tasks' },
  board: { tool: 'boards', label: 'Boards' },
  workspace: { tool: 'workspaces', label: 'Workspaces' },
  run: { tool: 'runs', label: 'Runs' },
  automation: { tool: 'routines', label: 'Routines', param: 'routine' },
  memory: { tool: 'memory', label: 'Memory', page: '/settings/memory' },
}

/** A branch's Git panel in the workspace view, where *Merge into main* is (live preview spec, part 1, *Switching*). */
export function branchGitHref(workspaceId: string, branch: string): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}/view?${new URLSearchParams({ branch, section: 'git' })}`
}

export function showInTool(target: ActionTarget | undefined, placePath: string | undefined): { label: string; href: string } | null {
  // A branch opens in its workspace's own view, not in a place's tool: `id` is the workspace, `params.branch` the branch.
  if (target?.kind === 'branch' && target.params?.branch) return { label: 'Open in the workspace', href: branchGitHref(target.id, target.params.branch) }
  const known = target && TOOLS[target.kind]
  if (!known || !target) return null
  const label = `Show in ${known.label}`
  if (known.page) {
    const query = new URLSearchParams({ ...target.params, [known.param ?? target.kind]: target.id })
    return { label, href: `${known.page}?${query}` }
  }
  if (!placePath) return null
  return { label, href: `${placePath}?tool=${known.tool}&${known.param ?? target.kind}=${encodeURIComponent(target.id)}` }
}

/** A task's own page. */
export function taskPath(taskKey: string): string {
  return `/tasks/${encodeURIComponent(taskKey)}`
}
