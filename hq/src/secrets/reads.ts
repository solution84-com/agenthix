/**
 * The screens' reads of a place's secrets and variables: rows from the store turned into views, with *Used by*, the
 * rotation state and the people named. No value of a secret reaches a view; a secret row is built field by field so
 * a column added later is not passed through by accident.
 */
import { INTEGRATION_SECRET_NAMES, type IntegrationSecretName } from '@agenthix/core'
import { peopleByIds } from '../server/identity/people'
import { mayAdministerPlace } from './access'
import { secretsDb } from './db'
import type { Place } from './place'
import { rotationState } from './rotation'
import { listSecrets, secretHistory } from './store'
import { usedByMap } from './usedBy'
import { listVariables, variableHistory } from './variables'
import type {
  PersonRef, PlaceSecretsView, PlaceVariablesView, SecretRecordView, SecretView, VariableChangeView,
} from './views'

const INTEGRATION_WORDS: Record<IntegrationSecretName, string> = {
  GITHUB_TOKEN: 'Minted by HQ for each run, for the workspace’s repository and the permissions the workflow declares.',
}

async function people(ids: Array<string | null>): Promise<(id: string | null) => PersonRef | null> {
  const found = await peopleByIds(ids.filter((x): x is string => x !== null))
  return id => {
    if (id === null) return null
    const p = found.get(id)
    return { id, name: p?.name ?? 'Former member' }
  }
}

export async function placeSecretsView(place: Place, userId: string, now: Date = new Date()): Promise<PlaceSecretsView> {
  const [rows, versions, mayChange] = await Promise.all([
    listSecrets(place), secretsDb().approvedVersions(place), mayAdministerPlace(place, userId),
  ])
  const usedBy = usedByMap(versions, 'secret')
  const person = await people(rows.map(r => r.replacedById ?? r.createdById))
  const stored: SecretView[] = rows.map(r => ({
    name: r.name,
    kind: r.kind === 'FILE' ? 'file' : 'text',
    description: r.description,
    issuer: r.issuer,
    renewAt: r.renewAt,
    rotateBy: r.rotateBy,
    rotation: rotationState(r.rotateBy, now),
    changedAt: r.replacedAt,
    changedBy: person(r.replacedById ?? r.createdById),
    usedBy: usedBy.get(r.name) ?? [],
  }))
  // An integration's value is listed once a workflow of the place uses it: it can't be set or replaced.
  const minted: SecretView[] = INTEGRATION_SECRET_NAMES.filter(n => usedBy.has(n)).map(n => ({
    name: n, kind: 'from_github', description: INTEGRATION_WORDS[n], issuer: 'GitHub', renewAt: '', rotateBy: null,
    rotation: 'none', changedAt: null, changedBy: null, usedBy: usedBy.get(n) ?? [],
  }))
  return { mayChange, secrets: [...stored, ...minted] }
}

export async function placeVariablesView(place: Place, userId: string): Promise<PlaceVariablesView> {
  const [rows, versions, mayChange] = await Promise.all([
    listVariables(place), secretsDb().approvedVersions(place), mayAdministerPlace(place, userId),
  ])
  const usedBy = usedByMap(versions, 'variable')
  const person = await people(rows.map(r => r.updatedById ?? r.createdById))
  return {
    mayChange,
    variables: rows.map(r => ({
      name: r.name, value: r.value, changedAt: r.updatedAt,
      changedBy: person(r.updatedById ?? r.createdById)!, usedBy: usedBy.get(r.name) ?? [],
    })),
  }
}

export async function secretHistoryView(place: Place, name: string): Promise<SecretRecordView[]> {
  const rows = await secretHistory(place, name)
  const person = await people(rows.map(r => r.byUserId))
  return rows.map(r => ({
    action: r.action.toLowerCase() as SecretRecordView['action'], by: person(r.byUserId), runId: r.runId, at: r.at,
  }))
}

export async function variableHistoryView(place: Place, name: string): Promise<VariableChangeView[]> {
  const rows = await variableHistory(place, name)
  const person = await people(rows.map(r => r.byUserId))
  return rows.map(r => ({
    action: r.action.toLowerCase() as VariableChangeView['action'], oldValue: r.oldValue, newValue: r.newValue,
    by: person(r.byUserId)!, at: r.at,
  }))
}
