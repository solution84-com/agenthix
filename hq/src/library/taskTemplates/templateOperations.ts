/**
 * Task templates as Wasp operations (spec D16, TM1, TM2): what adding one to a project would do, and adding it; a new
 * type from one of a template's types; a project's types and fields to share, publishing or proposing them; and the
 * review of a proposal. Each acts as the signed-in person: the Library is for the organisation's people, a project's
 * types are changed by whoever may work in it, and publishing and reviewing are the Library policy's.
 */
import { HttpError, prisma } from 'wasp/server'
import { formatAssetIdentity, type TaskTemplateType, type TaskTypeView } from '@agenthix/core'
import { ContentTooLargeError, readContent } from '../../assets/content'
import { personActor } from '../../assets/policyActors'
import { NoOrganisationError } from '../../assets/organisationPublisher'
import { requireMayWorkInProject } from '../../projects/membership'
import { listTaskTypes } from '../../projects/taskTypeService'
import { taskTypeUse, type TaskTypeUse } from '../../projects/taskTypeUse'
import { titleOfName } from '../assetList/words'
import { TaskTemplateRefused, readTemplatePackage } from './templateContent'
import { addTypeFromTemplate, installTaskTemplate, taskTemplateInstallPlanView, type InstallPlanView } from './templateInstall'
import { mayPublishTemplates, proposeFromProject, publishFromProject } from './templatePublish'
import { acceptTaskTemplateProposal as accept, rejectTaskTemplateProposal as reject, viewTaskTemplateProposal, type TaskTemplateProposalView } from './templateReview'

type Ctx = { user?: { id: string } | null }
type Args = Record<string, unknown>
const args = (a: unknown): Args => (a && typeof a === 'object' ? (a as Args) : {})
const CHANGING = "Changing this project's task types"
const TEMPLATES_LISTED = 100

function projectIdOf(a: Args): string {
  if (typeof a.projectId !== 'string' || a.projectId === '') throw new HttpError(400, 'A project id is required')
  return a.projectId
}

/** The person, who must be one of the organisation's people; refusals become HTTP answers. */
async function asPerson<T>(context: Ctx, work: (userId: string) => Promise<T>): Promise<T> {
  if (!context.user) throw new HttpError(401)
  const userId = context.user.id
  if ((await personActor(userId, prisma)).role === null) throw new HttpError(403, 'The Library is for people in this organisation. Nothing was changed.')
  try {
    return await work(userId)
  } catch (err) {
    if (err instanceof TaskTemplateRefused) throw new HttpError(err.status, err.message)
    if (err instanceof NoOrganisationError) throw new HttpError(409, err.message)
    if (err instanceof ContentTooLargeError) throw new HttpError(400, `${err.message} Nothing was changed.`)
    throw err
  }
}

export const getTaskTemplateInstallPlan = (a: unknown, c: Ctx): Promise<InstallPlanView> => asPerson(c, async userId => {
  const projectId = projectIdOf(args(a))
  await requireMayWorkInProject(projectId, userId, CHANGING)
  return taskTemplateInstallPlanView({ assetId: args(a).assetId, projectId })
})

export const installTaskTemplateInProject = (a: unknown, c: Ctx) => asPerson(c, async userId => {
  const x = args(a)
  const projectId = projectIdOf(x)
  await requireMayWorkInProject(projectId, userId, CHANGING)
  return installTaskTemplate({ assetId: x.assetId, projectId, versionId: x.versionId, types: x.types, fields: x.fields })
})

export type NewTypeTemplate = {
  assetId: string
  title: string
  identity: string
  version: string
  /** Its types the project has no type of the same name for. */
  types: TaskTemplateType[]
  /** Its types the project already has, by name. */
  alreadyHere: string[]
}

/** New task type: the Library's task templates, each with the types it would offer this project. */
export const getNewTaskTypeChoices = (a: unknown, c: Ctx): Promise<NewTypeTemplate[]> => asPerson(c, async userId => {
  const projectId = projectIdOf(args(a))
  await requireMayWorkInProject(projectId, userId, CHANGING)
  const have = new Set((await listTaskTypes(projectId, true)).map(t => t.name.toLowerCase()))
  const assets = await prisma.asset.findMany({
    where: { kind: 'TASK_TEMPLATE', removedAt: null, currentVersionId: { not: null } },
    orderBy: [{ name: 'asc' }, { publisher: 'asc' }], take: TEMPLATES_LISTED,
    select: { id: true, publisher: true, name: true, currentVersion: { select: { version: true, digest: true } } },
  })
  const out: NewTypeTemplate[] = []
  for (const asset of assets) {
    let types: TaskTemplateType[]
    try {
      types = readTemplatePackage(await readContent(asset.currentVersion!.digest, prisma)).content.types
    } catch {
      continue
    }
    if (types.length === 0) continue
    out.push({
      assetId: asset.id, title: titleOfName(asset.name), identity: formatAssetIdentity(asset), version: asset.currentVersion!.version,
      types: types.filter(t => !have.has(t.name.toLowerCase())), alreadyHere: types.filter(t => have.has(t.name.toLowerCase())).map(t => t.name),
    })
  }
  return out
})

export const createTaskTypeFromTemplate = (a: unknown, c: Ctx): Promise<TaskTypeView> => asPerson(c, async userId => {
  const x = args(a)
  const projectId = projectIdOf(x)
  await requireMayWorkInProject(projectId, userId, CHANGING)
  return addTypeFromTemplate({ projectId, assetId: x.assetId, typeName: x.typeName, name: x.name, icon: x.icon })
})

export type FieldToShare = { id: string; name: string; type: 'SINGLE_SELECT'; options: { name: string; colour: string }[] }

export type TaskTemplateSource = {
  projectName: string
  types: TaskTypeView[]
  use: TaskTypeUse[]
  fields: FieldToShare[]
  /** Administrators and Library maintainers publish; anyone else proposes. */
  mayPublish: boolean
  /** The organisation's publisher name, which the template goes out under. */
  publisher: string | null
}

/** A project's types and fields, for Publish (or Propose) as task template. */
export const getTaskTemplateSource = (a: unknown, c: Ctx): Promise<TaskTemplateSource> => asPerson(c, async userId => {
  const projectId = projectIdOf(args(a))
  await requireMayWorkInProject(projectId, userId, "Sharing this project's types and fields")
  const [project, types, use, fields, mayPublish, org] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true } }),
    listTaskTypes(projectId),
    taskTypeUse(projectId),
    prisma.customField.findMany({
      where: { projectId, archivedAt: null }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, type: true, options: { orderBy: { order: 'asc' }, select: { name: true, colour: true } } },
    }),
    mayPublishTemplates(userId),
    prisma.org.findFirst({ select: { publisherName: true } }),
  ])
  return { projectName: project.name, types, use, fields, mayPublish, publisher: org?.publisherName ?? null }
})

const publishInput = (x: Args) => ({ projectId: projectIdOf(x), name: x.name, description: x.description, typeIds: x.typeIds, fieldIds: x.fieldIds })

export const publishTaskTemplate = (a: unknown, c: Ctx) => asPerson(c, userId => publishFromProject(userId, publishInput(args(a))))
export const proposeTaskTemplate = (a: unknown, c: Ctx) => asPerson(c, userId => proposeFromProject(userId, publishInput(args(a))))

export const getTaskTemplateProposal = (a: unknown, c: Ctx): Promise<TaskTemplateProposalView> =>
  asPerson(c, userId => viewTaskTemplateProposal(userId, args(a).proposalId))
export const acceptTaskTemplateProposal = (a: unknown, c: Ctx) =>
  asPerson(c, userId => accept(userId, { proposalId: args(a).proposalId, digest: args(a).digest }))
export const rejectTaskTemplateProposal = (a: unknown, c: Ctx) =>
  asPerson(c, userId => reject(userId, { proposalId: args(a).proposalId, digest: args(a).digest, note: args(a).note }))
