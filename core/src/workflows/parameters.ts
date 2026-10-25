/**
 * The values a run is given for its workflow's parameters, checked by hq before the run (spec part 1,
 * *Parameters*; attack A10). Every parameter needs a value, nothing else may be given, and each value must match its
 * pattern or list. Values reach the steps as files (`/run/params/<name>`), never pasted into a command.
 */
import { WORKFLOW_LIMITS as L, type WorkflowDefinition } from './definition.js'
import { matchesParameterPattern } from './patterns.js'

export type ParameterValuesCheck =
  | { ok: true; values: Record<string, string> }
  | { ok: false; errors: { parameter: string; message: string }[] }

export function checkParameterValues(definition: WorkflowDefinition, given: Record<string, unknown>): ParameterValuesCheck {
  const errors: { parameter: string; message: string }[] = []
  const values: Record<string, string> = {}
  for (const name of Object.keys(given)) {
    if (!definition.parameters.some(p => p.name === name)) errors.push({ parameter: name, message: `${definition.name} has no parameter ${name}.` })
  }
  for (const p of definition.parameters) {
    const v = given[p.name]
    if (v === undefined) { errors.push({ parameter: p.name, message: `${p.name} needs a value.` }); continue }
    if (typeof v !== 'string') { errors.push({ parameter: p.name, message: `${p.name}'s value is text.` }); continue }
    if (v.includes('\0')) { errors.push({ parameter: p.name, message: `${p.name}'s value cannot hold a NUL character.` }); continue }
    const max = p.kind === 'text' ? L.textParameterValueMax : L.parameterValueMax
    if (v.length > max) { errors.push({ parameter: p.name, message: `${p.name}'s value is at most ${max} characters.` }); continue }
    if (p.kind === 'pattern' && !matchesParameterPattern(p.pattern, v)) {
      errors.push({ parameter: p.name, message: `${JSON.stringify(v)} doesn't match ${p.name}'s pattern, ${p.pattern}.` })
      continue
    }
    if (p.kind === 'values' && !p.values.includes(v)) {
      errors.push({ parameter: p.name, message: `${p.name} is one of ${p.values.join(', ')}.` })
      continue
    }
    values[p.name] = v
  }
  return errors.length ? { ok: false, errors } : { ok: true, values }
}
