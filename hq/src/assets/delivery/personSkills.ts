/**
 * The person's own skills, following them into their own conversations (spec part 4 *The person's skills*, D15).
 * Only a version the person published follows them, whatever the default: an unpublished change in Your space never
 * leaves it (security review H4). Only their own conversation's turns and the workers it hands work to on their behalf
 * (L5): never a task's, a scheduled or automated run's, or a run someone else started. The person is the run's
 * on-behalf-of person and the conversation's owner, both the same, never anything an agent said. The organisation can turn this off.
 */
import type { FileSkillsDefault, PlaceSkillSwitch, WorkspaceOwnerType } from '@prisma/client'
import { formatAssetIdentity, parseAssetIdentity, type PersonSkillEntry, type RunStartedBy } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { SKILL_FILE, readSkillMd } from '../skillFile'
import { switchState } from '../places/switchState'
import { skillKey } from './clashOrder'

export type RunFor = {
  kind: 'chat' | 'task'
  startedBy: RunStartedBy
  /** The run's on-behalf-of person. */
  personId: string | null
  /** A turn of the person's own conversation, or a worker it handed work to on their behalf (`isOwnConversation`). */
  ownConversation: boolean
  place: { placeType: WorkspaceOwnerType; placeId: string }
}

export type ChatTurn = {
  taskId: string | null
  /** The session's person: a plain chat's owner, or the person a conversation's worker works for. */
  sessionUserId: string
  /** The run's on-behalf-of person: who sent this turn or commissioned this brief. */
  senderId: string
  /** The conversation a worker serves, when it is one; `conversationId` set with no row found counts as someone else's. */
  conversationId: string | null
  conversation: { openedById: string; home: 'PERSON' | 'PROJECT' | 'TASK' } | null
}

/**
 * A turn of the person's own conversation: their own chat, or a worker their own conversation handed work to on their
 * behalf. Never a task's session or a task's thread, and never a turn or brief of someone else's.
 */
export function isOwnConversation(turn: ChatTurn): boolean {
  if (turn.taskId || turn.senderId !== turn.sessionUserId) return false
  if (!turn.conversationId) return true
  return turn.conversation !== null && turn.conversation.home !== 'TASK' && turn.conversation.openedById === turn.senderId
}

/** Whether the person's skills follow them into this run. In Your space they are the place's own skills already. */
export function personalSkillsApply(run: RunFor, orgAllows: boolean): run is RunFor & { personId: string } {
  if (!orgAllows || !run.personId) return false
  if (run.kind !== 'chat' || run.startedBy !== 'person' || !run.ownConversation) return false
  return !(run.place.placeType === 'user' && run.place.placeId === run.personId)
}

export type PersonSkillRow = {
  path: string
  switch: PlaceSkillSwitch | null
  switchFingerprint: string | null
  /** The newest version the person published, or none. */
  published: { id: string; number: number; digest: string } | null
  /** The published version's `SKILL.md`, as text. */
  skillMd: string | null
}

export type PersonSkillCandidate = { entry: PersonSkillEntry; key: string; label: string }

/**
 * The published version a row gives, or null. The switch is judged on that version's fingerprint, not on what the
 * files hold now, since only the published version leaves Your space. The entry names it by the identity it was
 * copied in with, or else by the person and its folder, `<person id>/<folder>`: the site stages a person's skill as
 * `person-<last part of the identity>`, and needs an identity to do it.
 */
export function publishedPersonSkill(
  personId: string, row: PersonSkillRow, spaceDefault: FileSkillsDefault | null, orgDefault: FileSkillsDefault,
): PersonSkillCandidate | null {
  const v = row.published
  if (!v) return null
  const state = switchState({ switch: row.switch, switchFingerprint: row.switchFingerprint, lastFingerprint: v.digest }, spaceDefault, orgDefault)
  if (state !== 'on') return null
  const header = row.skillMd ? readSkillMd(row.skillMd).header : null
  const meta = header?.metadata && typeof header.metadata === 'object' ? header.metadata as Record<string, unknown> : null
  const name = typeof header?.name === 'string' ? header.name : null
  const copiedAs = parseAssetIdentity(meta?.identity)
  const key = skillKey({ identity: copiedAs ? formatAssetIdentity(copiedAs) : null, name, path: row.path })
  const identity = copiedAs ? formatAssetIdentity(copiedAs) : `${personId}/${row.path.slice(row.path.lastIndexOf('/') + 1)}`
  return {
    entry: { identity, version: String(v.number), digest: v.digest, ref: { kind: 'skill', key: v.id, digest: v.digest } },
    key,
    label: name?.trim() || key,
  }
}

export async function personSkillsFor(
  db: Db,
  input: { personId: string; agentId: string; spaceDefault: FileSkillsDefault | null; orgDefault: FileSkillsDefault },
): Promise<PersonSkillCandidate[]> {
  const person = await db.user.findUnique({ where: { id: input.personId }, select: { deactivatedAt: true } })
  if (!person || person.deactivatedAt !== null) return []
  const rows = await db.placeSkill.findMany({
    where: {
      placeType: 'user', placeId: input.personId, goneAt: null,
      OR: [{ group: 'PLACE' }, { group: 'AGENT', agentId: input.agentId }],
    },
    select: {
      path: true, switch: true, switchFingerprint: true,
      versions: { orderBy: { number: 'desc' }, take: 1, select: { id: true, number: true, digest: true } },
    },
    orderBy: { path: 'asc' },
  })
  const out: PersonSkillCandidate[] = []
  for (const row of rows) {
    const published = row.versions[0] ?? null
    const file = published
      ? await db.packageFile.findUnique({ where: { contentDigest_path: { contentDigest: published.digest, path: SKILL_FILE } }, select: { bytes: true } })
      : null
    const candidate = publishedPersonSkill(
      input.personId,
      { path: row.path, switch: row.switch, switchFingerprint: row.switchFingerprint, published, skillMd: file ? Buffer.from(file.bytes).toString('utf-8') : null },
      input.spaceDefault, input.orgDefault,
    )
    if (candidate) out.push(candidate)
  }
  return out
}
