/** What the Tasks tool says when the project has no tasks at all (P5): one sentence, and the box that adds the first open. */
export function emptyTasksState({ loaded, taskCount, canStart }: { loaded: boolean; taskCount: number; canStart: boolean }): {
  text: string | null
  quickAddOpen: boolean
} {
  if (!loaded || taskCount > 0) return { text: null, quickAddOpen: false }
  return {
    text: canStart ? 'No tasks yet. Say what needs doing below, and an agent can start on it.' : 'No tasks yet.',
    quickAddOpen: canStart,
  }
}
