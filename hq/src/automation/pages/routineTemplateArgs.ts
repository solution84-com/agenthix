import type { RoutineTemplateArgs } from '../routineActions'

/**
 * The routine form (@agenthix/ui) still names a column `stage`, and sends null
 * when a board is chosen without one, meaning its first column.
 */
export function routineTemplateArgs<T extends Omit<RoutineTemplateArgs, 'column'> & { stage?: string | null }>(template: T): RoutineTemplateArgs {
  const { stage, ...rest } = template
  return { ...rest, column: stage ?? undefined }
}
