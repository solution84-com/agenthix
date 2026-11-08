/** A task's key as a caller may write it: its project's key and its number, `WEB-3`, in any case. */
const TASK_KEY_FORM = /^([A-Za-z0-9]+)-(\d+)$/

/**
 * Whether the words a caller gave for a task name this one, read as hq reads them: its id, or its key in any case
 * and with the number written any way (`web-03` is `WEB-3`). `key` is null when the task's key is not known here.
 */
export function namesTask(words: unknown, task: { id: string; key: string | null }): boolean {
  if (typeof words !== 'string') return false
  const given = words.trim()
  if (given === task.id) return true
  if (!task.key) return false
  const a = TASK_KEY_FORM.exec(given)
  const b = TASK_KEY_FORM.exec(task.key)
  return !!a && !!b && a[1]!.toUpperCase() === b[1]!.toUpperCase() && Number(a[2]) === Number(b[2])
}
