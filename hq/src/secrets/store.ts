/**
 * The secret store (spec part 3; adr-0147): the one module through which every secret of a place is written and read.
 *
 * - **Written once, never shown.** A value is typed or uploaded, encrypted at once (AES-256-GCM under
 *   `SECRETS_MASTER_KEY`, bound to the secret's id and its place, S1) and never returned: not to a page, an operation,
 *   a log or a refusal. It can only be replaced.
 * - **Read only for a run.** `valuesForRun` is the one reader, for the run of an approved version that names the
 *   secrets; nothing else here decrypts.
 * - **Every use is recorded** (S8): set, replaced, deleted, and each run given it or that printed it, with who and
 *   when, never the value.
 *
 * Variables live beside it in `variables.ts`, re-exported here so the library has one module to ask.
 */
import { randomUUID } from 'node:crypto'
import { INTEGRATION_SECRET_NAMES } from '@agenthix/core'
import { decryptBytesBound, encryptBytesBound } from '../server/crypto/secretCrypto'
import { requireAdministerPlace } from './access'
import { secretsDb, type SecretMeta, type SecretRecordRow } from './db'
import { secretAssociatedData, type Place } from './place'
import { refuse } from './refusal'
import { clearRotationNotice } from './rotation'
import { checkDescription, checkSecretName, secretValueBytes, type SecretDescription, type SecretValueInput } from './rules'
import { refuseDeleteWhileUsed } from './usedBy'

export { listPlaceVariableNames } from './variables'

export type NewSecretInput = { name: string; value: SecretValueInput } & Partial<SecretDescription>

const DAY_MS = 24 * 60 * 60 * 1000

function checkRotateBy(rotateBy: Date | null, now: Date): void {
  if (rotateBy && rotateBy.getTime() < now.getTime() - DAY_MS) refuse('invalid', 'The rotate-by date has passed: choose a later one.')
}

function record(name: string, secretId: string | null, action: SecretRecordRow['action'], byUserId: string | null, at: Date, runId: string | null = null): SecretRecordRow {
  return { secretName: name, secretId, action, byUserId, runId, at }
}

async function existing(place: Place, name: string): Promise<SecretMeta> {
  const row = await secretsDb().secretByName(place, name)
  if (!row) refuse('not_found', `This place has no secret ${name}: it may have been deleted. Reload the page.`)
  return row
}

export async function addSecret(place: Place, byUserId: string, input: NewSecretInput): Promise<SecretMeta> {
  await requireAdministerPlace(place, byUserId, 'Adding a secret')
  checkSecretName(input.name)
  const desc = checkDescription(input)
  const now = new Date()
  checkRotateBy(desc.rotateBy, now)
  const { kind, bytes } = secretValueBytes(input.value)
  const id = randomUUID()
  const ciphertext = encryptBytesBound(bytes, secretAssociatedData(id, place))
  bytes.fill(0)
  const created = await secretsDb().createSecret(place, { id, name: input.name, kind, ...desc, createdById: byUserId, ciphertext },
    record(input.name, id, 'SET', byUserId, now))
  if (!created) refuse('exists', `This place already has a secret ${input.name}: replace it, or choose another name.`)
  return existing(place, input.name)
}

/** A new value under the same name, description and record; the next run uses it. Its rotate-by date starts again. */
export async function replaceSecret(
  place: Place, byUserId: string, name: string, value: SecretValueInput, rotateBy: Date | null = null,
): Promise<SecretMeta> {
  await requireAdministerPlace(place, byUserId, 'Replacing a secret')
  const row = await existing(place, name)
  const now = new Date()
  const nextRotateBy = rotateBy == null ? null : new Date(rotateBy)
  if (nextRotateBy && Number.isNaN(nextRotateBy.getTime())) refuse('invalid', 'The rotate-by date is not a date.')
  checkRotateBy(nextRotateBy, now)
  const { kind, bytes } = secretValueBytes(value)
  const ciphertext = encryptBytesBound(bytes, secretAssociatedData(row.id, place))
  bytes.fill(0)
  await secretsDb().replaceSecret(row.id, { kind, ciphertext, replacedById: byUserId, rotateBy: nextRotateBy },
    record(name, row.id, 'REPLACED', byUserId, now))
  await clearRotationNotice(row.id)
  return existing(place, name)
}

/**
 * What it is, who issues it, where to renew it and when to rotate it: the value is untouched. A field left out keeps
 * what the secret has; only one sent empty (or a `rotateBy` of null) clears it.
 */
export async function describeSecret(place: Place, byUserId: string, name: string, d: Partial<SecretDescription>): Promise<SecretMeta> {
  await requireAdministerPlace(place, byUserId, 'Changing a secret’s description')
  const row = await existing(place, name)
  const desc = checkDescription({
    description: d.description ?? row.description,
    issuer: d.issuer ?? row.issuer,
    renewAt: d.renewAt ?? row.renewAt,
    rotateBy: d.rotateBy === undefined ? row.rotateBy : d.rotateBy,
  })
  if (desc.rotateBy?.getTime() !== row.rotateBy?.getTime()) checkRotateBy(desc.rotateBy, new Date())
  await secretsDb().describeSecret(row.id, desc)
  if (desc.rotateBy?.getTime() !== row.rotateBy?.getTime()) await clearRotationNotice(row.id)
  return existing(place, name)
}

/** Refused while a switched-on workflow's approved version names it; the refusal names those workflows. */
export async function deleteSecret(place: Place, byUserId: string, name: string): Promise<void> {
  await requireAdministerPlace(place, byUserId, 'Deleting a secret')
  const row = await existing(place, name)
  await refuseDeleteWhileUsed(place, 'secret', name)
  await secretsDb().deleteSecret(row.id, record(name, null, 'DELETED', byUserId, new Date()))
  await clearRotationNotice(row.id)
}

/** The place's secrets as people see them: never a value. Callers check who may read. */
export function listSecrets(place: Place): Promise<SecretMeta[]> {
  return secretsDb().secrets(place)
}

export function secretHistory(place: Place, name: string): Promise<SecretRecordRow[]> {
  return secretsDb().records(place, name)
}

/** For the library: the names a proposal may give a step (3b). */
export function listPlaceSecretNames(place: Place): Promise<string[]> {
  return secretsDb().secretNames(place)
}

/**
 * The only reader of a value: the named secrets' bytes, in hq's memory, for the run of an approved version that
 * names them (3d), which sends them to the site and drops them. An integration's name (`GITHUB_TOKEN`) is not stored
 * and is skipped: the run mints it. A stored name the place lacks, or a value that will not decrypt under its own
 * row and place, refuses the run without saying anything about the value.
 */
export async function valuesForRun(place: Place, names: readonly string[]): Promise<Map<string, Buffer>> {
  const wanted = [...new Set(names)].filter(n => !isIntegrationName(n))
  if (wanted.length === 0) return new Map()
  const rows = await secretsDb().sealed(place, wanted)
  const missing = wanted.filter(n => !rows.some(r => r.name === n))
  if (missing.length) {
    refuse('not_found', `This place has no secret ${missing.join(', ')}: an administrator of the place adds it, then the run is started again.`)
  }
  const out = new Map<string, Buffer>()
  for (const r of rows) {
    try {
      out.set(r.name, decryptBytesBound(r.ciphertext, secretAssociatedData(r.id, place)))
    } catch {
      for (const v of out.values()) v.fill(0)
      refuse('unreadable', `The stored value of ${r.name} can't be read for this place: an administrator of the place replaces it.`)
    }
  }
  return out
}

const isIntegrationName = (n: string) => (INTEGRATION_SECRET_NAMES as readonly string[]).includes(n)

/** The record that a run was given these secrets (3d calls it once the run is sent). Integration names included. */
export async function recordUse(place: Place, runId: string, names: readonly string[], byUserId: string | null = null): Promise<void> {
  await recordRun(place, runId, names, 'USED', byUserId)
}

/** The record that masking found these secrets in a run's output: the run is flagged *printed a secret*. */
export async function recordPrinted(place: Place, runId: string, names: readonly string[]): Promise<void> {
  await recordRun(place, runId, names, 'PRINTED', null)
}

async function recordRun(place: Place, runId: string, names: readonly string[], action: 'USED' | 'PRINTED', byUserId: string | null) {
  const unique = [...new Set(names)]
  if (unique.length === 0) return
  const stored = await secretsDb().secrets(place)
  const at = new Date()
  await secretsDb().addRecords(place, unique.map(n => record(n, stored.find(s => s.name === n)?.id ?? null, action, byUserId, at, runId)))
}
