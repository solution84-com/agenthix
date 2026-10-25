/**
 * The people operations' deps replaced for their unit tests: the knowledge service's fake sites, an access table by
 * owner, the change record kept in memory, and authors read from it as hq's record would be joined.
 */
import { KNOWLEDGE_ORG_OWNER_ID, type KnowledgeOwnerRef } from '@agenthix/core'
import type { KnowledgeChangeEntry } from '../../deps'
import { FakeSites } from '../../__tests__/fakeKnowledgeDeps'
import { KnowledgeRefusal, type ChangeAuthors, type OwnerAccess, type PeopleKnowledgeDeps } from '../deps'
import type { ChangeAuthorView, KnowledgeOwner } from '../types'

export const WEB: KnowledgeOwnerRef = { ownerType: 'project', ownerId: 'p-web' }
export const ORG: KnowledgeOwnerRef = { ownerType: 'org', ownerId: KNOWLEDGE_ORG_OWNER_ID }
export const PAGE = '---\ntitle: Release process\ndescription: How we release.\n---\nStaging deploys go out after the checks pass.\n'

type Standing = 'reads' | 'changes'

const keyOf = (o: KnowledgeOwner) => (o.ownerType === 'org' ? 'org' : `${o.ownerType}:${o.ownerId}`)

export function fakePeople() {
  const sites = new FakeSites()
  const records: (KnowledgeChangeEntry & { at: Date })[] = []
  const warnings: { message: string; fields?: Record<string, unknown> }[] = []
  /** Who may reach which owner: by owner, then person. Anyone not listed is refused. */
  const standing = new Map<string, Map<string, Standing>>()
  let clock = Date.parse('2026-10-25T09:00:00.000Z')
  let failRecord = false

  const allow = (owner: KnowledgeOwner, userId: string, how: Standing) => {
    const people = standing.get(keyOf(owner)) ?? new Map<string, Standing>()
    people.set(userId, how)
    standing.set(keyOf(owner), people)
  }

  const level = (o: KnowledgeOwner) => (o.ownerType === 'org' ? 'org' : o.ownerType === 'user' ? 'personal' : 'website-rebuild')
  const name = (o: KnowledgeOwner) => (o.ownerType === 'org' ? 'Organisation' : o.ownerType === 'user' ? 'Your space' : 'Website rebuild')

  const by = (r: KnowledgeChangeEntry): ChangeAuthorView =>
    r.reach.agent ? { kind: 'agent', agentName: 'Kernel', forName: r.reach.userId, conversationId: r.reach.agent.conversationId } : { kind: 'person', name: r.reach.userId }
  const same = (a: KnowledgeOwnerRef, b: KnowledgeOwnerRef) => a.ownerType === b.ownerType && a.ownerId === b.ownerId
  const newest = (ref: KnowledgeOwnerRef) => [...records].reverse().filter(r => same(r.owner, ref))

  const authors: ChangeAuthors = {
    async lastChanges(ref, pages) {
      const out = new Map()
      for (const p of pages) {
        const r = newest(ref).find(x => x.page === p.page && x.version === p.version && x.kind !== 'deleted')
        if (r) out.set(p.page, { at: r.at.toISOString(), by: by(r), change: r.kind })
      }
      return out
    },
    async ofVersions(ref, page, versions) {
      const out = new Map()
      for (const v of versions) {
        const r = newest(ref).find(x => x.page === page && x.version === v.version && x.kind !== 'deleted')
        if (r) out.set(v.id, by(r))
      }
      return out
    },
    async deletions(ref, pages) {
      const out = new Map()
      for (const p of pages) {
        const r = newest(ref).find(x => x.page === p.page && x.kind === 'deleted')
        if (r) out.set(p.page, by(r))
      }
      return out
    },
  }

  const deps: PeopleKnowledgeDeps = {
    sites,
    async open(owner, userId): Promise<OwnerAccess> {
      const how = standing.get(keyOf(owner))?.get(userId)
      if (!how) throw new KnowledgeRefusal(403, 'Not yours to open.')
      const ref = owner.ownerType === 'org' ? ORG : { ownerType: owner.ownerType, ownerId: owner.ownerId }
      return { ref, level: level(owner), name: name(owner), canChange: how === 'changes' }
    },
    async recordChange(entry) {
      if (failRecord) throw new Error('database at 10.0.0.9 is down')
      clock += 60_000
      records.push({ ...entry, at: new Date(clock) })
    },
    authors,
    siteTimeLimitMs: 200,
    log: { warn: (message, fields) => warnings.push({ message, fields }) },
  }
  return { deps, sites, records, warnings, allow, failRecords: (f: boolean) => (failRecord = f) }
}
