/**
 * A project's types and fields shared as a Library task template (spec D16, TM2), by the rules skills follow (adr-0157,
 * adr-0159): administrators and Library maintainers publish it, as version 1.0.0 of an asset made here under the
 * organisation's name; anyone else who may work in the project proposes it, and a maintainer reviews the proposal
 * (`templateReview.ts`). Task and Epic are in every project, so they are never shared. The project's own types and
 * fields stay as they are and do not start following the template.
 */
import { prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import { formatAssetIdentity, isBoardColour, type TaskTemplateContent } from '@agenthix/core'
import { storeContent } from '../../assets/content'
import { organisationPublisher } from '../../assets/organisationPublisher'
import { may } from '../../assets/policy'
import { organisationTarget, personActor } from '../../assets/policyActors'
import { requireMayWorkInProject } from '../../projects/membership'
import { FIRST_VERSION, TaskTemplateRefused, taskTemplateFiles, templateDescriptionOf, templateNameOf } from './templateContent'
import type { PackageFile } from '../packages/packageZip'

const NOTHING = 'Nothing was changed.'
type Tx = Prisma.TransactionClient
type Db = Tx | typeof prisma

export type PublishInput = { projectId: string; name: unknown; description: unknown; typeIds: unknown; fieldIds: unknown }

const idList = (raw: unknown): string[] => (Array.isArray(raw) ? [...new Set(raw.filter((v): v is string => typeof v === 'string'))] : [])

/** The ticked types and fields as a template holds them. Every id must be the project's own; Task and Epic never are shared. */
export async function contentFromProject(db: Db, projectId: string, typeIds: unknown, fieldIds: unknown): Promise<TaskTemplateContent> {
  const tIds = idList(typeIds)
  const fIds = idList(fieldIds)
  if (tIds.length + fIds.length === 0) throw new TaskTemplateRefused(`Tick a type or a field to share. ${NOTHING}`)
  const [types, fields] = await Promise.all([
    db.taskType.findMany({
      where: { projectId, id: { in: tIds } }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { name: true, icon: true, kind: true, columns: { orderBy: { order: 'asc' }, select: { name: true, colour: true, state: true, defaultForState: true } } },
    }),
    db.customField.findMany({
      where: { projectId, id: { in: fIds } }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { name: true, type: true, options: { orderBy: { order: 'asc' }, select: { name: true, colour: true } } },
    }),
  ])
  if (types.length !== tIds.length || fields.length !== fIds.length) throw new TaskTemplateRefused(`One of those types or fields isn't in this project. ${NOTHING}`, 404)
  if (types.some(t => t.kind !== 'CUSTOM')) throw new TaskTemplateRefused(`Every project has Task and Epic, so they are not shared. ${NOTHING}`)
  const colour = (c: string) => (isBoardColour(c) ? c : 'neutral')
  return {
    types: types.map(t => ({ name: t.name, icon: t.icon, columns: t.columns.map(c => ({ ...c, colour: colour(c.colour) })) })),
    fields: fields.map(f => ({ name: f.name, type: f.type, options: f.options.map(o => ({ name: o.name, colour: colour(o.colour) })) })),
  }
}

async function packageFor(db: Db, input: PublishInput) {
  const project = await db.project.findUnique({ where: { id: input.projectId }, select: { name: true } })
  if (!project) throw new TaskTemplateRefused('Project not found', 404)
  const name = templateNameOf(input.name)
  const description = templateDescriptionOf(input.description, `Task types and fields from ${project.name}.`)
  const content = await contentFromProject(db, input.projectId, input.typeIds, input.fieldIds)
  const publisher = await organisationPublisher(db)
  return { name, description, publisher, files: taskTemplateFiles({ publisher, name, version: FIRST_VERSION, description, content }) }
}

async function refuseTakenName(db: Db, publisher: string, name: string): Promise<void> {
  const taken = await db.asset.findUnique({ where: { kind_publisher_name: { kind: 'TASK_TEMPLATE', publisher, name } }, select: { id: true } })
  if (taken) throw new TaskTemplateRefused(`The Library already has a task template called ${publisher}/${name}. Choose another name. ${NOTHING}`, 409)
}

/** Version 1.0.0 of a new task template made here, pinned, with who published it and why. */
export async function publishFirstVersion(tx: Tx, input: { publisher: string; name: string; files: PackageFile[]; byId: string; note: string }) {
  await refuseTakenName(tx, input.publisher, input.name)
  const asset = await tx.asset.create({ data: { kind: 'TASK_TEMPLATE', publisher: input.publisher, name: input.name } })
  const version = await tx.assetVersion.create({
    data: { assetId: asset.id, version: FIRST_VERSION, digest: await storeContent(input.files, tx), source: 'MADE_HERE', byId: input.byId, note: input.note },
  })
  await tx.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } })
  await tx.assetPinChange.create({ data: { assetId: asset.id, toVersionId: version.id, byId: input.byId, reason: `Published: ${input.note}` } })
  return { assetId: asset.id, versionId: version.id, identity: formatAssetIdentity(asset), version: FIRST_VERSION }
}

const nameTaken = (err: unknown, publisher: string, name: string): never => {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new TaskTemplateRefused(`The Library already has a task template called ${publisher}/${name}. Choose another name. ${NOTHING}`, 409)
  }
  throw err
}

/** Whether the person publishes (administrators and Library maintainers) or proposes, for the screens to offer the right one. */
export async function mayPublishTemplates(userId: string): Promise<boolean> {
  return may(await personActor(userId, prisma), 'publish', await organisationTarget(prisma))
}

export async function publishFromProject(userId: string, input: PublishInput) {
  await requireMayWorkInProject(input.projectId, userId, 'Sharing this project\'s types and fields')
  if (!(await mayPublishTemplates(userId))) {
    throw new TaskTemplateRefused(`Publishing to the Library is for administrators and Library maintainers. Propose it instead, and a maintainer publishes it. ${NOTHING}`, 403)
  }
  const pkg = await packageFor(prisma, input)
  return prisma.$transaction(tx => publishFirstVersion(tx, { ...pkg, byId: userId, note: 'Made from a project\'s types and fields' }))
    .catch(err => nameTaken(err, pkg.publisher, pkg.name))
}

/**
 * A proposal a Library maintainer reviews. One open proposal of a task template per name, by the partial unique index
 * on Proposal (kind, aim, place, name), so two sent at once leave one.
 */
export async function proposeFromProject(userId: string, input: PublishInput): Promise<{ proposalId: string }> {
  await requireMayWorkInProject(input.projectId, userId, 'Sharing this project\'s types and fields')
  const pkg = await packageFor(prisma, input)
  await refuseTakenName(prisma, pkg.publisher, pkg.name)
  const waiting = `A task template called ${pkg.name} is already waiting for review. Wait for its review, or choose another name. ${NOTHING}`
  try {
    return await prisma.$transaction(async tx => {
      const open = await tx.proposal.findFirst({ where: { kind: 'TASK_TEMPLATE', aim: 'ORGANISATION', placeId: null, name: pkg.name, state: 'OPEN' }, select: { id: true } })
      if (open) throw new TaskTemplateRefused(waiting, 409)
      const row = await tx.proposal.create({
        data: {
          kind: 'TASK_TEMPLATE', aim: 'ORGANISATION', placeId: null, name: pkg.name, description: pkg.description,
          digest: await storeContent(pkg.files, tx), forUserId: userId, agentId: null,
        },
        select: { id: true },
      })
      return { proposalId: row.id }
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new TaskTemplateRefused(waiting, 409)
    throw err
  }
}
