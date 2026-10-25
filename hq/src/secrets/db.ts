/**
 * The secret store's database side: the only code that touches `PlaceSecret`, `SecretRecord`, `PlaceVariable` and
 * `PlaceVariableChange`, and the reads of approved workflow versions it needs for *Used by*. A secret's row comes out
 * as `SecretMeta`, which has no value; the one read of a ciphertext is `sealed`, for `store.ts`'s `valuesForRun`.
 *
 * Behind an interface so the store's rules are tested against an in-memory one (`useSecretsDb`); the database itself
 * is tested in `db.integration.test.ts`.
 */
import { prisma } from 'wasp/server'
import type { PlaceSecretKind, SecretRecordAction, VariableChangeAction } from '@prisma/client'
import { placeWhere as where, type Place } from './place'

export type SecretMeta = {
  id: string
  name: string
  kind: PlaceSecretKind
  description: string
  issuer: string
  renewAt: string
  rotateBy: Date | null
  createdById: string
  createdAt: Date
  replacedAt: Date
  replacedById: string | null
}

export type SecretRecordRow = {
  secretName: string
  secretId: string | null
  action: SecretRecordAction
  byUserId: string | null
  runId: string | null
  at: Date
}

export type VariableRow = {
  id: string
  name: string
  value: string
  createdById: string
  updatedById: string | null
  createdAt: Date
  updatedAt: Date
}

export type VariableChangeRow = {
  name: string
  action: VariableChangeAction
  oldValue: string | null
  newValue: string | null
  byUserId: string
  at: Date
}

/** An approved version of a workflow of the place, as *Used by* reads it. */
export type ApprovedVersion = {
  workflowId: string
  workflowName: string
  enabled: boolean
  definition: unknown
  githubSecretNames: string[]
}

export type DueRotation = { place: Place; id: string; name: string; rotateBy: Date }

export type NewSecret = Omit<SecretMeta, 'createdAt' | 'replacedAt' | 'replacedById'> & { ciphertext: Buffer }
export type Replacement = { kind: PlaceSecretKind; ciphertext: Buffer; replacedById: string; rotateBy: Date | null }

export interface SecretsDb {
  secretByName(place: Place, name: string): Promise<SecretMeta | null>
  secrets(place: Place): Promise<SecretMeta[]>
  secretNames(place: Place): Promise<string[]>
  /** False when the place already has a secret of that name. */
  createSecret(place: Place, secret: NewSecret, record: SecretRecordRow): Promise<boolean>
  replaceSecret(id: string, r: Replacement, record: SecretRecordRow): Promise<void>
  describeSecret(id: string, d: Pick<SecretMeta, 'description' | 'issuer' | 'renewAt' | 'rotateBy'>): Promise<void>
  deleteSecret(id: string, record: SecretRecordRow): Promise<void>
  /** The named secrets' ciphertexts: only for `valuesForRun`. */
  sealed(place: Place, names: string[]): Promise<Array<{ id: string; name: string; ciphertext: Buffer }>>
  addRecords(place: Place, records: SecretRecordRow[]): Promise<void>
  /** Newest first. */
  records(place: Place, name: string): Promise<SecretRecordRow[]>

  variableByName(place: Place, name: string): Promise<VariableRow | null>
  variables(place: Place): Promise<VariableRow[]>
  /** False when the place already has a variable of that name. */
  createVariable(place: Place, name: string, value: string, byUserId: string): Promise<boolean>
  /** Every write keeps its change, old → new, in the same transaction. */
  updateVariable(place: Place, v: VariableRow, value: string, byUserId: string): Promise<void>
  deleteVariable(place: Place, v: VariableRow, byUserId: string): Promise<void>
  /** Newest first. */
  variableChanges(place: Place, name: string): Promise<VariableChangeRow[]>

  approvedVersions(place: Place): Promise<ApprovedVersion[]>
  /** Secrets with a rotate-by date on or before `before`. */
  dueRotations(before: Date): Promise<DueRotation[]>
}

const META = {
  id: true, name: true, kind: true, description: true, issuer: true, renewAt: true, rotateBy: true, createdById: true,
  createdAt: true, replacedAt: true, replacedById: true,
} as const
const RECORD = { secretName: true, secretId: true, action: true, byUserId: true, runId: true, at: true } as const
const VARIABLE = { id: true, name: true, value: true, createdById: true, updatedById: true, createdAt: true, updatedAt: true } as const
const CHANGE = { name: true, action: true, oldValue: true, newValue: true, byUserId: true, at: true } as const

const isUniqueClash = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'

export const prismaSecretsDb: SecretsDb = {
  secretByName: (place, name) => prisma.placeSecret.findUnique({
    where: { placeType_placeId_name: { ...where(place), name } }, select: META,
  }),
  secrets: place => prisma.placeSecret.findMany({ where: where(place), select: META, orderBy: { name: 'asc' } }),
  secretNames: async place => (await prisma.placeSecret.findMany({
    where: where(place), select: { name: true }, orderBy: { name: 'asc' },
  })).map(r => r.name),
  createSecret: async (place, s, record) => {
    try {
      await prisma.$transaction([
        prisma.placeSecret.create({ data: { ...where(place), ...s, ciphertext: s.ciphertext } }),
        prisma.secretRecord.create({ data: { ...where(place), ...record } }),
      ])
      return true
    } catch (err) {
      if (isUniqueClash(err)) return false
      throw err
    }
  },
  replaceSecret: async (id, r, record) => {
    const row = await prisma.placeSecret.findUniqueOrThrow({ where: { id }, select: { placeType: true, placeId: true } })
    await prisma.$transaction([
      prisma.placeSecret.update({
        where: { id },
        data: {
          kind: r.kind, ciphertext: r.ciphertext, replacedById: r.replacedById, replacedAt: record.at,
          rotateBy: r.rotateBy, rotateNoticeSentAt: null,
        },
      }),
      prisma.secretRecord.create({ data: { ...row, ...record } }),
    ])
  },
  describeSecret: async (id, d) => {
    await prisma.placeSecret.update({ where: { id }, data: { ...d, rotateNoticeSentAt: null } })
  },
  deleteSecret: async (id, record) => {
    const row = await prisma.placeSecret.findUniqueOrThrow({ where: { id }, select: { placeType: true, placeId: true } })
    await prisma.$transaction([
      prisma.placeSecret.delete({ where: { id } }),
      // The record outlives the secret: it keeps the name, not the row.
      prisma.secretRecord.updateMany({ where: { secretId: id }, data: { secretId: null } }),
      prisma.secretRecord.create({ data: { ...row, ...record, secretId: null } }),
    ])
  },
  sealed: async (place, names) => (await prisma.placeSecret.findMany({
    where: { ...where(place), name: { in: names } }, select: { id: true, name: true, ciphertext: true },
  })).map(r => ({ id: r.id, name: r.name, ciphertext: Buffer.from(r.ciphertext) })),
  addRecords: async (place, records) => {
    if (records.length) await prisma.secretRecord.createMany({ data: records.map(r => ({ ...where(place), ...r })) })
  },
  records: (place, name) => prisma.secretRecord.findMany({
    where: { ...where(place), secretName: name }, select: RECORD, orderBy: { at: 'desc' },
  }),

  variableByName: (place, name) => prisma.placeVariable.findUnique({
    where: { placeType_placeId_name: { ...where(place), name } }, select: VARIABLE,
  }),
  variables: place => prisma.placeVariable.findMany({ where: where(place), select: VARIABLE, orderBy: { name: 'asc' } }),
  createVariable: async (place, name, value, byUserId) => {
    try {
      await prisma.$transaction([
        prisma.placeVariable.create({ data: { ...where(place), name, value, createdById: byUserId } }),
        prisma.placeVariableChange.create({ data: { ...where(place), name, action: 'SET', oldValue: null, newValue: value, byUserId } }),
      ])
      return true
    } catch (err) {
      if (isUniqueClash(err)) return false
      throw err
    }
  },
  updateVariable: async (place, v, value, byUserId) => {
    await prisma.$transaction([
      prisma.placeVariable.update({ where: { id: v.id }, data: { value, updatedById: byUserId } }),
      prisma.placeVariableChange.create({
        data: { ...where(place), name: v.name, action: 'CHANGED', oldValue: v.value, newValue: value, byUserId },
      }),
    ])
  },
  deleteVariable: async (place, v, byUserId) => {
    await prisma.$transaction([
      prisma.placeVariable.delete({ where: { id: v.id } }),
      prisma.placeVariableChange.create({
        data: { ...where(place), name: v.name, action: 'DELETED', oldValue: v.value, newValue: null, byUserId },
      }),
    ])
  },
  variableChanges: (place, name) => prisma.placeVariableChange.findMany({
    where: { ...where(place), name }, select: CHANGE, orderBy: { at: 'desc' },
  }),

  approvedVersions: async place => (await prisma.workflowVersion.findMany({
    where: { state: 'APPROVED', workflow: where(place) },
    select: { definition: true, githubSecretNames: true, workflow: { select: { id: true, name: true, enabled: true } } },
  })).map(v => ({
    workflowId: v.workflow.id, workflowName: v.workflow.name, enabled: v.workflow.enabled,
    definition: v.definition, githubSecretNames: v.githubSecretNames,
  })),
  dueRotations: async before => (await prisma.placeSecret.findMany({
    where: { rotateBy: { not: null, lte: before } },
    select: { id: true, name: true, placeType: true, placeId: true, rotateBy: true },
  })).flatMap(r => (r.rotateBy ? [{ id: r.id, name: r.name, rotateBy: r.rotateBy, place: { type: r.placeType, id: r.placeId } }] : [])),
}

let override: SecretsDb | null = null

export function secretsDb(): SecretsDb {
  return override ?? prismaSecretsDb
}

/** Tests only: put an in-memory database in place, or null to go back to Prisma. */
export function useSecretsDb(db: SecretsDb | null): void {
  override = db
}
