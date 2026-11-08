/** Whether a task, as a client reads it, is an epic: a task of the type Epic. A task of no type yet is a task. */
export const isEpicTask = (task: { type?: { kind: string } | null }): boolean => task.type?.kind === 'EPIC'
