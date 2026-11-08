/**
 * Adding a Library task template to a project (spec D16, TM1): it extends the project. Each of its types (with their
 * columns) and fields (with their options) is added, unless the project already has a type or field of that name,
 * ignoring case, which is left alone, never changed or merged. What is added is the project's own, with a read-only
 * note of the version it came from (`madeFromVersionId`); later versions of the template never reach it.
 *
 * The person sees the plan first and confirms it: the install names the version and the names it expects to add, and is
 * refused if either moved on meanwhile, so nothing is added that the person was not shown.
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import {
  formatAssetIdentity, PROJECT_CUSTOM_FIELDS_MAX, PROJECT_TASK_TYPES_MAX, taskTemplateInstallPlan, type TaskTemplateContent,
  type TaskTemplateField, type TaskTemplateType,
} from '@agenthix/core'
import { readContent } from '../../assets/content'
import { titleOfName } from '../assetList/words'
import { ensureBuiltInTaskTypes } from '../../projects/taskTypes'
import { createTaskType } from '../../projects/taskTypeService'
import { triggerSnapshotPush } from '../../server/dashboard/debouncedPush'
import { readTemplatePackage } from './templateContent'
import { isSystemTaskTemplate } from '../systemTemplates'

const NOTHING = 'Nothing was changed.'
type Tx = Prisma.TransactionClient
type Db = Tx | typeof prisma

export type KeptType = { name: string; /** The version of this template it was made from, when it was. */ madeFromThis: string | null }
export type KeptField = KeptType & { options: string[] }

export type InstallPlanView = {
  assetId: string
  identity: string
  title: string
  version: string
  versionId: string
  project: { id: string; name: string }
  adds: { types: TaskTemplateType[]; fields: TaskTemplateField[] }
  keeps: { types: KeptType[]; fields: KeptField[] }
}

/** A task template in the Library at its pinned version, with what it holds. */
export async function libraryTaskTemplate(db: Db, assetId: unknown) {
  const asset = typeof assetId === 'string'
    ? await db.asset.findUnique({ where: { id: assetId }, select: { id: true, kind: true, publisher: true, name: true, removedAt: true, currentVersion: { select: { id: true, version: true, digest: true } } } })
    : null
  if (!asset || asset.kind !== 'TASK_TEMPLATE' || asset.removedAt || !asset.currentVersion || isSystemTaskTemplate(asset)) {
    throw new HttpError(404, `That task template isn't in the Library. ${NOTHING}`)
  }
  const { description, content } = readTemplatePackage(await readContent(asset.currentVersion.digest, db))
  return { asset, version: asset.currentVersion, description, content }
}

async function projectNames(db: Db, projectId: string) {
  const [types, fields] = await Promise.all([
    db.taskType.findMany({ where: { projectId }, select: { name: true, madeFromVersion: { select: { assetId: true, version: true } } } }),
    db.customField.findMany({ where: { projectId }, select: { name: true, madeFromVersion: { select: { assetId: true, version: true } }, options: { orderBy: { order: 'asc' }, select: { name: true } } } }),
  ])
  return { types, fields }
}

function planFor(content: TaskTemplateContent, assetId: string, held: Awaited<ReturnType<typeof projectNames>>) {
  const plan = taskTemplateInstallPlan(content, { typeNames: held.types.map(t => t.name), fieldNames: held.fields.map(f => f.name) })
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  const fromThis = (row?: { madeFromVersion: { assetId: string; version: string } | null }) =>
    row?.madeFromVersion?.assetId === assetId ? row.madeFromVersion.version : null
  return {
    adds: { types: plan.addsTypes, fields: plan.addsFields },
    keeps: {
      types: plan.keepsTypes.map(name => ({ name, madeFromThis: fromThis(held.types.find(t => same(t.name, name))) })),
      fields: plan.keepsFields.map(name => {
        const row = held.fields.find(f => same(f.name, name))
        return { name, madeFromThis: fromThis(row), options: row?.options.map(o => o.name) ?? [] }
      }),
    },
  }
}

/** What adding the template to the project would add and leave alone, for the person to confirm. */
export async function taskTemplateInstallPlanView(input: { assetId: unknown; projectId: string }): Promise<InstallPlanView> {
  const { asset, version, content } = await libraryTaskTemplate(prisma, input.assetId)
  const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true, name: true } })
  if (!project) throw new HttpError(404, 'Project not found')
  await ensureBuiltInTaskTypes(project.id)
  return {
    assetId: asset.id, identity: formatAssetIdentity(asset), title: titleOfName(asset.name), version: version.version, versionId: version.id,
    project, ...planFor(content, asset.id, await projectNames(prisma, project.id)),
  }
}

function sameNames(a: readonly string[], b: readonly string[]): boolean {
  const norm = (x: readonly string[]) => [...x].map(s => s.toLowerCase()).sort().join('\n')
  return norm(a) === norm(b)
}

const typeCreate = (projectId: string, t: TaskTemplateType, order: number, madeFromVersionId: string) => ({
  projectId, name: t.name, icon: t.icon, kind: 'CUSTOM' as const, order, madeFromVersionId,
  columns: { create: t.columns.map((c, i) => ({ name: c.name, colour: c.colour, state: c.state, defaultForState: c.defaultForState, order: i })) },
})

/** Serialises changes to one project's list of types and fields while an install reads and writes it. */
export async function lockProjectTypes(tx: Tx, projectId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('task-types'), hashtext(${projectId}))`
}

/**
 * Adds these types (with their columns) and fields (with their options) to the project after its own, each noting the
 * version it came from: a task template's, or the team template's that started the project. The caller holds the
 * project's types lock and has left out any name the project already has.
 */
export async function addTypesAndFields(
  tx: Tx, projectId: string, adds: { types: TaskTemplateType[]; fields: TaskTemplateField[] }, madeFromVersionId: string,
): Promise<{ types: number; fields: number }> {
  const [typeCount, fieldCount, lastType, lastField] = await Promise.all([
    tx.taskType.count({ where: { projectId } }),
    tx.customField.count({ where: { projectId } }),
    tx.taskType.aggregate({ where: { projectId }, _max: { order: true } }),
    tx.customField.aggregate({ where: { projectId }, _max: { order: true } }),
  ])
  if (typeCount + adds.types.length > PROJECT_TASK_TYPES_MAX) throw new HttpError(400, `A project has at most ${PROJECT_TASK_TYPES_MAX} task types. ${NOTHING}`)
  if (fieldCount + adds.fields.length > PROJECT_CUSTOM_FIELDS_MAX) throw new HttpError(400, `A project has at most ${PROJECT_CUSTOM_FIELDS_MAX} custom fields. ${NOTHING}`)
  let typeOrder = (lastType._max.order ?? -1) + 1
  for (const t of adds.types) await tx.taskType.create({ data: typeCreate(projectId, t, typeOrder++, madeFromVersionId) })
  let fieldOrder = (lastField._max.order ?? -1) + 1
  for (const f of adds.fields) {
    await tx.customField.create({
      data: {
        projectId, name: f.name, type: f.type, order: fieldOrder++, madeFromVersionId,
        options: { create: f.options.map((o, i) => ({ name: o.name, colour: o.colour, order: i })) },
      },
    })
  }
  return { types: adds.types.length, fields: adds.fields.length }
}

export type InstallInput = { assetId: unknown; projectId: string; versionId: unknown; types: unknown; fields: unknown }

/** Adds what the person confirmed; refused when the template or the project changed since the plan was shown. */
export async function installTaskTemplate(input: InstallInput): Promise<{ types: number; fields: number }> {
  const expectTypes = Array.isArray(input.types) ? input.types.filter((n): n is string => typeof n === 'string') : null
  const expectFields = Array.isArray(input.fields) ? input.fields.filter((n): n is string => typeof n === 'string') : null
  if (!expectTypes || !expectFields) throw new HttpError(400, `Say which types and fields you saw it add. ${NOTHING}`)
  const { asset, version, content } = await libraryTaskTemplate(prisma, input.assetId)
  if (version.id !== input.versionId) throw new HttpError(409, `${titleOfName(asset.name)} has a newer version since you looked. Look at what it adds again. ${NOTHING}`)
  await ensureBuiltInTaskTypes(input.projectId)
  try {
    const added = await prisma.$transaction(async tx => {
      await lockProjectTypes(tx, input.projectId)
      const { adds } = planFor(content, asset.id, await projectNames(tx, input.projectId))
      if (!sameNames(adds.types.map(t => t.name), expectTypes) || !sameNames(adds.fields.map(f => f.name), expectFields)) {
        throw new HttpError(409, `The project's types or fields changed since you looked. Look at what it adds again. ${NOTHING}`)
      }
      if (adds.types.length + adds.fields.length === 0) throw new HttpError(409, `The project already has every type and field in it. ${NOTHING}`)
      return addTypesAndFields(tx, input.projectId, adds, version.id)
    })
    triggerSnapshotPush()
    return added
  } catch (err) {
    // A type or field of the same name made at the same moment outside an install.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new HttpError(409, `The project's types or fields changed since you looked. Look at what it adds again. ${NOTHING}`)
    }
    throw err
  }
}

/**
 * New task type, from one of a template's types: its columns, under the name the person gave, noting the version.
 * The type's own checks (a name not taken, the project's limit) are the type service's.
 */
export async function addTypeFromTemplate(input: { projectId: string; assetId: unknown; typeName: unknown; name: unknown; icon?: unknown }) {
  const { version, content } = await libraryTaskTemplate(prisma, input.assetId)
  const from = content.types.find(t => t.name === input.typeName)
  if (!from) throw new HttpError(404, `That template has no type named ${String(input.typeName)}. ${NOTHING}`)
  const made = await createTaskType({ projectId: input.projectId, name: input.name, icon: input.icon ?? from.icon, columns: from.columns })
  await prisma.taskType.update({ where: { id: made.id }, data: { madeFromVersionId: version.id } })
  return { ...made, madeFromVersionId: version.id }
}
