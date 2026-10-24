/**
 * The Secrets and variables operations (spec part 3; screens in part 5, U6). Members of a place read names,
 * descriptions and variables' values; only its administrators write. No answer carries a secret's value: a value
 * comes in once, with add or replace, and never goes out.
 */
import { HttpError } from 'wasp/server'
import type {
  AddPlaceSecret, AddPlaceVariable, DeletePlaceSecret, DeletePlaceVariable, DescribePlaceSecret, EditPlaceVariable,
  GetPlaceSecretHistory, GetPlaceSecrets, GetPlaceVariableHistory, GetPlaceVariables, ReplacePlaceSecret,
  TurnOffWhatUsesIt,
} from 'wasp/server/operations'
import { requireReadPlace } from './access'
import { isPlace, type Place } from './place'
import { placeSecretsView, placeVariablesView, secretHistoryView, variableHistoryView } from './reads'
import { SecretsRefusal, type SecretsRefusalCode } from './refusal'
import type { SecretDescription, SecretValueInput } from './rules'
import { addSecret, deleteSecret, describeSecret, replaceSecret } from './store'
import { turnOffWhatUses } from './turnOff'
import { addVariable, deleteVariable, editVariable, type VariableSave } from './variables'
import type {
  PlaceSecretsView, PlaceVariablesView, SecretRecordView, TurnedOffView, ValueKind, VariableChangeView, VariableSaveView,
} from './views'

type Ctx = { user?: { id: string } | null }
type PlaceArgs = { place: Place }
type Named = PlaceArgs & { name: string }
type DescriptionArgs = { description?: string; issuer?: string; renewAt?: string; rotateBy?: Date | string | null }

const STATUS: Record<SecretsRefusalCode, number> = {
  not_allowed: 403, not_found: 404, exists: 409, invalid: 400, in_use: 409, unreadable: 409,
}

async function answering<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof SecretsRefusal) throw new HttpError(STATUS[err.code], err.message, { code: err.code, workflows: err.workflows })
    throw err
  }
}

function userOf(context: Ctx): string {
  if (!context.user) throw new HttpError(401)
  return context.user.id
}

function placeOf(args: unknown): Place {
  const place = (args as Partial<PlaceArgs> | undefined)?.place
  if (!isPlace(place)) throw new HttpError(400, 'Which project or own storage?')
  return { type: place.type, id: place.id }
}

function nameOf(args: unknown): string {
  const name = (args as { name?: unknown } | undefined)?.name
  if (typeof name !== 'string' || !name) throw new HttpError(400, 'Which one?')
  return name
}

function kindOf(args: unknown): ValueKind {
  const kind = (args as { kind?: unknown } | undefined)?.kind
  if (kind !== 'secret' && kind !== 'variable') throw new HttpError(400, 'A secret or a variable?')
  return kind
}

function valueOf(args: unknown): SecretValueInput {
  const value = (args as { value?: unknown } | undefined)?.value
  if (!value || typeof value !== 'object') throw new HttpError(400, 'The secret has no value: type it or choose a file.')
  return value as SecretValueInput
}

function descriptionOf(args: DescriptionArgs): Partial<SecretDescription> {
  return {
    description: args.description, issuer: args.issuer, renewAt: args.renewAt,
    rotateBy: args.rotateBy == null || args.rotateBy === '' ? null : new Date(args.rotateBy),
  }
}

const saveView = (s: VariableSave): VariableSaveView =>
  s.saved ? { saved: true, variable: { name: s.variable.name, value: s.variable.value } } : s

export const getPlaceSecrets: GetPlaceSecrets<PlaceArgs, PlaceSecretsView> = (args, context) => answering(async () => {
  const userId = userOf(context)
  const place = placeOf(args)
  await requireReadPlace(place, userId, 'Reading this place’s secrets')
  return placeSecretsView(place, userId)
})

export const getPlaceVariables: GetPlaceVariables<PlaceArgs, PlaceVariablesView> = (args, context) => answering(async () => {
  const userId = userOf(context)
  const place = placeOf(args)
  await requireReadPlace(place, userId, 'Reading this place’s variables')
  return placeVariablesView(place, userId)
})

export const getPlaceSecretHistory: GetPlaceSecretHistory<Named, SecretRecordView[]> = (args, context) => answering(async () => {
  const place = placeOf(args)
  await requireReadPlace(place, userOf(context), 'Reading a secret’s history')
  return secretHistoryView(place, nameOf(args))
})

export const getPlaceVariableHistory: GetPlaceVariableHistory<Named, VariableChangeView[]> = (args, context) => answering(async () => {
  const place = placeOf(args)
  await requireReadPlace(place, userOf(context), 'Reading a variable’s history')
  return variableHistoryView(place, nameOf(args))
})

export const addPlaceSecret: AddPlaceSecret<Named & DescriptionArgs & { value: SecretValueInput }, { name: string }> =
  (args, context) => answering(async () => {
    const s = await addSecret(placeOf(args), userOf(context), { name: nameOf(args), value: valueOf(args), ...descriptionOf(args) })
    return { name: s.name }
  })

export const replacePlaceSecret: ReplacePlaceSecret<Named & { value: SecretValueInput; rotateBy?: Date | string | null }, { name: string }> =
  (args, context) => answering(async () => {
    const rotateBy = args?.rotateBy == null || args.rotateBy === '' ? null : new Date(args.rotateBy)
    const s = await replaceSecret(placeOf(args), userOf(context), nameOf(args), valueOf(args), rotateBy)
    return { name: s.name }
  })

export const describePlaceSecret: DescribePlaceSecret<Named & DescriptionArgs, { name: string }> =
  (args, context) => answering(async () => {
    const s = await describeSecret(placeOf(args), userOf(context), nameOf(args), descriptionOf(args))
    return { name: s.name }
  })

export const deletePlaceSecret: DeletePlaceSecret<Named, { ok: true }> = (args, context) => answering(async () => {
  await deleteSecret(placeOf(args), userOf(context), nameOf(args))
  return { ok: true as const }
})

export const addPlaceVariable: AddPlaceVariable<Named & { value: string; notASecret?: boolean }, VariableSaveView> =
  (args, context) => answering(async () =>
    saveView(await addVariable(placeOf(args), userOf(context), nameOf(args), args?.value, { notASecret: args?.notASecret === true })))

export const editPlaceVariable: EditPlaceVariable<Named & { value: string; notASecret?: boolean }, VariableSaveView> =
  (args, context) => answering(async () =>
    saveView(await editVariable(placeOf(args), userOf(context), nameOf(args), args?.value, { notASecret: args?.notASecret === true })))

export const deletePlaceVariable: DeletePlaceVariable<Named, { ok: true }> = (args, context) => answering(async () => {
  await deleteVariable(placeOf(args), userOf(context), nameOf(args))
  return { ok: true as const }
})

export const turnOffWhatUsesIt: TurnOffWhatUsesIt<Named & { kind: ValueKind }, TurnedOffView> = (args, context) => answering(async () => {
  const r = await turnOffWhatUses(placeOf(args), userOf(context), kindOf(args), nameOf(args))
  return { workflows: r.workflows, runsStopped: r.runsStopped.length, next: r.next }
})
