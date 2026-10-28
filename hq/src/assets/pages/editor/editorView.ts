/**
 * The editor's one read (skills spec part 6 *The editor*): a Library skill's or a place skill's draft with the version
 * it is compared with, who saved it, whether this person may publish it, and the version a publish would make. Whoever
 * may edit the draft may read it; the draft reads are the lifecycle's and the place's own, so their policy is theirs.
 */
import type { PrismaClient } from '@prisma/client'
import type { Db } from '../../../packages/packageStore'
import { readContent } from '../../content'
import { DraftError } from '../../lifecycle/drafts'
import { assertEditedInPlace, readDraft } from '../../lifecycle/draftStore'
import { holdersOf } from '../../lifecycle/holders'
import { librarySkill, libraryTarget } from '../../lifecycle/records'
import { nextVersion } from '../../lifecycle/versions'
import { newestVersion, readPlaceDraft, skillNameOf } from '../../places/placeDrafts'
import { placeOfSkill } from '../../places/place'
import { may, type PersonActor } from '../../policy'
import { PERSON_SELECT, personSummary } from '../../../server/identity/personSummary'
import type { EditorFileData, EditorRevision, EditorTarget, EditorView } from './editorTypes'

const asData = (files: { path: string; content: Buffer }[]): EditorFileData[] =>
  files.map(f => ({ path: f.path, base64: f.content.toString('base64') }))

type RawRevision = { number: number; authorId: string | null; proposedByAgentId: string | null; at: Date }

async function revisionsOf(db: Db, raw: RawRevision[]): Promise<EditorRevision[]> {
  const people = [...new Set(raw.flatMap(r => r.authorId ?? []))]
  const agents = [...new Set(raw.flatMap(r => r.proposedByAgentId ?? []))]
  const [users, agentRows] = await Promise.all([
    people.length ? db.user.findMany({ where: { id: { in: people } }, select: PERSON_SELECT }) : [],
    agents.length ? db.agent.findMany({ where: { id: { in: agents } }, select: { id: true, name: true } }) : [],
  ])
  const nameOf = new Map<string, string>(users.map((u: Parameters<typeof personSummary>[0]): [string, string] => [u.id, personSummary(u).name]))
  const agentName = new Map<string, string>(agentRows.map((a: { id: string; name: string }): [string, string] => [a.id, a.name]))
  return raw.map(r => {
    const person = r.authorId ? nameOf.get(r.authorId) ?? 'Someone' : 'Someone'
    const by = r.proposedByAgentId ? `${agentName.get(r.proposedByAgentId) ?? 'An agent'}, for ${person}` : person
    return { number: r.number, by, at: r.at.toISOString() }
  })
}

const NO_STEPS = { patch: '1.0.0', minor: '1.0.0', major: '1.0.0' }

export async function libraryEditorView(db: PrismaClient, actor: PersonActor, assetId: unknown): Promise<EditorView> {
  const draft = await readDraft(db, actor, assetId)
  const asset = await librarySkill(db, assetId)
  const base = asset.currentVersion ? await readContent(asset.currentVersion.digest, db) : []
  let notEditableReason: string | null = null
  try { await assertEditedInPlace(db, asset) } catch (err) {
    if (!(err instanceof DraftError)) throw err
    notEditableReason = err.message
  }
  const versions = await db.assetVersion.findMany({ where: { assetId: asset.id }, select: { version: true } })
  const held = versions.map((v: { version: string }) => v.version)
  const holders = await holdersOf(db, asset.id)
  const revisions = await revisionsOf(db, draft.revisions)
  return {
    target: { kind: 'library', assetId: asset.id },
    name: asset.name,
    identity: draft.identity,
    where: 'Library',
    revision: draft.revision,
    files: draft.files,
    base: asData(base),
    baseLabel: asset.currentVersion ? `version ${asset.currentVersion.version}, in use` : 'nothing published yet',
    inUse: asset.currentVersion?.version ?? null,
    draftBy: revisions.length ? revisions[revisions.length - 1]!.by : null,
    revisions,
    editsHere: notEditableReason === null,
    notEditableReason,
    mayPublish: may(actor, 'publish', await libraryTarget(db)),
    nextVersions: held.length
      ? { patch: nextVersion(held, 'patch'), minor: nextVersion(held, 'minor'), major: nextVersion(held, 'major') }
      : NO_STEPS,
    nextNumber: null,
    agentsWith: { everyAgent: holders.everyAgent, names: holders.agents.map(a => a.name) },
    warnings: draft.warnings,
  }
}

export async function placeEditorView(db: PrismaClient, actor: PersonActor, placeSkillId: unknown): Promise<EditorView> {
  const draft = await readPlaceDraft(db, actor, placeSkillId)
  const { ctx, skill } = await placeOfSkill(db, placeSkillId)
  const newest = await newestVersion(db, skill.id)
  const base = newest ? await readContent(newest.digest, db) : []
  const project = await db.project.findUnique({ where: { id: ctx.projectId }, select: { name: true, personalSpace: true } })
  const revisions = await revisionsOf(db, draft.revisions)
  return {
    target: { kind: 'place', placeSkillId: skill.id },
    name: skillNameOf(skill),
    identity: draft.path,
    where: project?.personalSpace ? 'Your space' : project?.name ?? 'This place',
    revision: draft.revision,
    files: draft.files,
    base: asData(base),
    baseLabel: newest ? `version ${newest.number}, the newest published` : 'nothing published yet',
    inUse: newest ? String(newest.number) : null,
    draftBy: revisions.length ? revisions[revisions.length - 1]!.by : null,
    revisions,
    editsHere: true,
    notEditableReason: null,
    mayPublish: may(actor, 'publish', ctx.target),
    nextVersions: null,
    nextNumber: (newest?.number ?? 0) + 1,
    agentsWith: { everyAgent: false, names: [] },
    warnings: draft.warnings,
  }
}

export function editorViewOf(db: PrismaClient, actor: PersonActor, target: EditorTarget): Promise<EditorView> {
  return target.kind === 'library' ? libraryEditorView(db, actor, target.assetId) : placeEditorView(db, actor, target.placeSkillId)
}
