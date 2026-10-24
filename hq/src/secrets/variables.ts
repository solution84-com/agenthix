/**
 * A place's variables (spec part 3, *The two kinds*): plain settings, read by people and agents, edited in place by
 * the place's administrators, every change kept old → new with who and when. A name that changes how programs run is
 * refused (core's `validateVariableName`), and a value that looks like a secret is held back with a question until
 * the person says it is not one.
 */
import { requireAdministerPlace } from './access'
import { secretsDb, type VariableChangeRow, type VariableRow } from './db'
import { looksLikeSecret } from './looksLikeSecret'
import type { Place } from './place'
import { refuse } from './refusal'
import { checkVariableName, checkVariableValue } from './rules'
import { refuseDeleteWhileUsed } from './usedBy'

/** Saved; or held back, with why it looks like a secret, until it is sent again with `notASecret`. */
export type VariableSave =
  | { saved: true; variable: VariableRow }
  | { saved: false; looksLikeSecret: string; question: string }

export const LOOKS_LIKE_A_SECRET_QUESTION = 'This looks like a secret. Add it under Secrets instead?'

function heldBack(value: string, notASecret: boolean): VariableSave | null {
  if (notASecret) return null
  const why = looksLikeSecret(value)
  return why ? { saved: false, looksLikeSecret: why, question: LOOKS_LIKE_A_SECRET_QUESTION } : null
}

async function existing(place: Place, name: string): Promise<VariableRow> {
  const row = await secretsDb().variableByName(place, name)
  if (!row) refuse('not_found', `This place has no variable ${name}: it may have been deleted. Reload the page.`)
  return row
}

export async function addVariable(
  place: Place, byUserId: string, name: string, value: unknown, opts: { notASecret?: boolean } = {},
): Promise<VariableSave> {
  await requireAdministerPlace(place, byUserId, 'Adding a variable')
  checkVariableName(name)
  const v = checkVariableValue(value)
  const held = heldBack(v, opts.notASecret === true)
  if (held) return held
  if (!(await secretsDb().createVariable(place, name, v, byUserId))) {
    refuse('exists', `This place already has a variable ${name}: edit it, or choose another name.`)
  }
  return { saved: true, variable: await existing(place, name) }
}

export async function editVariable(
  place: Place, byUserId: string, name: string, value: unknown, opts: { notASecret?: boolean } = {},
): Promise<VariableSave> {
  await requireAdministerPlace(place, byUserId, 'Editing a variable')
  const row = await existing(place, name)
  const v = checkVariableValue(value)
  if (v === row.value) return { saved: true, variable: row }
  const held = heldBack(v, opts.notASecret === true)
  if (held) return held
  await secretsDb().updateVariable(place, row, v, byUserId)
  return { saved: true, variable: await existing(place, name) }
}

/** Refused while a switched-on workflow's approved version names it; the refusal names those workflows. */
export async function deleteVariable(place: Place, byUserId: string, name: string): Promise<void> {
  await requireAdministerPlace(place, byUserId, 'Deleting a variable')
  const row = await existing(place, name)
  await refuseDeleteWhileUsed(place, 'variable', name)
  await secretsDb().deleteVariable(place, row, byUserId)
}

/** Callers check who may read. */
export function listVariables(place: Place): Promise<VariableRow[]> {
  return secretsDb().variables(place)
}

export function variableHistory(place: Place, name: string): Promise<VariableChangeRow[]> {
  return secretsDb().variableChanges(place, name)
}

/** For the library: the names a proposal may list in `variables` (3b). */
export async function listPlaceVariableNames(place: Place): Promise<string[]> {
  return (await secretsDb().variables(place)).map(v => v.name)
}

/** For a run (3d): the value of each variable the definition names; a name the place lacks refuses the run. */
export async function variableValuesForRun(place: Place, names: readonly string[]): Promise<Record<string, string>> {
  const all = await secretsDb().variables(place)
  const missing = names.filter(n => !all.some(v => v.name === n))
  if (missing.length) refuse('not_found', `This place has no variable ${missing.join(', ')}: an administrator of the place adds it, then the run is started again.`)
  return Object.fromEntries(names.map(n => [n, all.find(v => v.name === n)!.value]))
}
