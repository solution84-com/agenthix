import { modelsForRuntime } from '../models'

/** A model as a person reads it: its catalogue name, or the stored id where the catalogue does not know it. */
export function modelLabel(id: string, runtime: string): string {
  return modelsForRuntime(runtime).find(m => m.value === id)?.label ?? id
}
