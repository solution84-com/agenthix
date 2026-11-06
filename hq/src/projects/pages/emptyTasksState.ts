/**
 * What the Tasks tool says when it shows no task: a project with none yet, with New task for someone who may add one
 * (there is no quick-add box, T7), or a list that its filters, scorecard or search left empty.
 */
export function emptyTasksState({ loaded, taskCount, narrowed, canStart }: {
  loaded: boolean
  taskCount: number
  /** A filter, a scorecard other than All, or a search is in use. */
  narrowed: boolean
  canStart: boolean
}): { text: string | null; newTask: boolean } {
  if (!loaded || taskCount > 0) return { text: null, newTask: false }
  if (narrowed) return { text: 'No task matches.', newTask: false }
  return { text: 'No tasks yet.', newTask: canStart }
}
