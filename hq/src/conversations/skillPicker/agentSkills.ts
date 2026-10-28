/**
 * The skills a conversation's agent would have staged on its next turn, for the `/` picker (spec part 5, *Picking a
 * skill*): the same sources and the same clash order and staged names as a run (`resolveRunSkills`), but read from
 * hq's records only. Nothing is asked of the site and nothing is written, so it answers while hq is read-only: the
 * place's skills in files are the last scan's rows, and a skill whose files hq holds no published version of shows
 * the name and description the last scan read from its front matter, or its folder name.
 *
 * Left out: a skill the run would set aside, one switched off, and one that sets `user-invocable: false`.
 */
import type { FileSkillGroup, FileSkillEntry, InstalledSkillEntry, PersonSkillEntry } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { SKILL_FILE, readSkillMd } from '../../assets/skillFile'
import { settleClashes, skillKey, type SkillCandidate } from '../../assets/delivery/clashOrder'
import { installedSkillsFor } from '../../assets/delivery/installed'
import { builtInSkillsFor } from '../../assets/builtins/delivery'
import { personSkillsFor } from '../../assets/delivery/personSkills'
import { placeDefaultOf } from '../../assets/delivery/fileSkills'
import { settleStagedNames, stagedNameOf, type NamedItem } from '../../assets/delivery/stagedNames'
import { effectiveDefault, switchState } from '../../assets/places/switchState'
import type { Place as StoragePlace } from '../../assets/places/scan'
import { scannedFacts, skillFacts, type SkillFacts } from './skillFacts'
import { recordedRepository } from './repositoryHint'

/** Where a skill comes from, as the picker's groups name it. */
export type SkillSourceKind = 'builtin' | 'every-agent' | 'this-agent' | 'place' | 'yours'

export type ConversationSkill = {
  /** The name the run stages it under: what a pick sends. */
  name: string
  /** What a person reads. */
  title: string
  description: string
  source: SkillSourceKind
  /** The group heading: Built in, the organisation's name, This agent, the place's name, Yours. */
  sourceName: string
  /** The identity and version, or the folder, for the row's tag. */
  detail: string
}

export type SkillsInput = {
  agentId: string
  /** The conversation's person; their own skills are listed because the conversation is theirs. */
  personId: string
  /** The conversation's own place, when the person may open it; null lists no skills from files. */
  place: StoragePlace | null
  placeName: string
  /** The conversation, once it exists: its work tells whether it runs in a repository. */
  conversationId: string | null
}

type Described = {
  item: NamedItem; source: SkillSourceKind; sourceName: string; detail: string; md: string | null; fallback: string
  /** For a file skill hq holds no version of: what the last scan read. */
  scanned?: { name: string; description: string }
}

const lastPart = (s: string): string => s.slice(s.lastIndexOf('/') + 1)

async function skillMdAt(db: Db, digest: string | null): Promise<string | null> {
  if (!digest) return null
  const file = await db.packageFile.findUnique({ where: { contentDigest_path: { contentDigest: digest, path: SKILL_FILE } }, select: { bytes: true } })
  return file ? Buffer.from(file.bytes).toString('utf-8') : null
}

function installedSource(entry: InstalledSkillEntry, orgName: string): Pick<Described, 'source' | 'sourceName'> {
  if (entry.level === 'builtin') return { source: 'builtin', sourceName: 'Built in' }
  return entry.level === 'org' ? { source: 'every-agent', sourceName: orgName } : { source: 'this-agent', sourceName: 'This agent' }
}

export async function conversationSkills(db: Db, input: SkillsInput): Promise<ConversationSkill[]> {
  const org = await db.org.findFirst({ select: { name: true, fileSkillsDefault: true, personalSkillsOutsideSpace: true } })
  const orgDefault = org?.fileSkillsDefault ?? 'OFF'
  const orgName = org?.name || 'Organisation'
  const yourSpace = input.place?.placeType === 'user' && input.place.placeId === input.personId

  const [builtIn, installed, placeDefault] = await Promise.all([
    // The picker asks no site: a built-in given only in a repository is offered when hq's records show one.
    builtInSkillsFor(db, recordedRepository(db, { conversationId: input.conversationId, place: input.place })),
    installedSkillsFor(db, input.agentId),
    input.place ? placeDefaultOf(db, input.place) : Promise.resolve(null),
  ])
  const described = new Map<NamedItem, Described>()
  const candidates: SkillCandidate<NamedItem>[] = []
  const add = (level: SkillCandidate<NamedItem>['level'], key: string, label: string, d: Described) => {
    described.set(d.item, d)
    candidates.push({ level, key, label, item: d.item })
  }

  for (const entry of [...builtIn, ...installed]) {
    add('installed', entry.identity, entry.identity, {
      item: { kind: 'installed', entry }, ...installedSource(entry, orgName),
      detail: `${entry.identity} ${entry.version}`, md: await skillMdAt(db, entry.digest), fallback: lastPart(entry.identity),
    })
  }

  if (input.place && effectiveDefault(placeDefault, orgDefault) !== 'NEVER') {
    const rows = await db.placeSkill.findMany({
      where: { ...input.place, goneAt: null, OR: [{ group: 'PLACE' }, { group: 'AGENT', agentId: input.agentId }] },
      select: {
        path: true, group: true, switch: true, switchFingerprint: true, lastFingerprint: true, name: true, description: true,
        versions: { select: { digest: true } },
      },
      orderBy: { path: 'asc' },
    })
    for (const row of rows) {
      if (!row.lastFingerprint || switchState(row, placeDefault, orgDefault) !== 'on') continue
      const group: FileSkillGroup = row.group === 'AGENT' ? 'agent' : 'place'
      const entry: FileSkillEntry = { placeId: input.place.placeId, path: row.path, fingerprint: row.lastFingerprint, group }
      const kept = row.versions.some(v => v.digest === row.lastFingerprint) ? row.lastFingerprint : null
      const folder = lastPart(row.path)
      const md = await skillMdAt(db, kept)
      const header = md === null ? null : readSkillMd(md).header
      const meta = header?.metadata && typeof header.metadata === 'object' ? header.metadata as Record<string, unknown> : null
      const ownName = typeof header?.name === 'string' ? header.name : md === null && row.name ? row.name : null
      const key = skillKey({ identity: typeof meta?.identity === 'string' ? meta.identity : null, name: ownName, path: row.path })
      add('project', key, key, {
        item: { kind: 'file', entry },
        source: yourSpace ? 'yours' : 'place', sourceName: yourSpace ? 'Yours' : input.placeName,
        detail: row.path, md, fallback: folder,
        ...(md === null ? { scanned: { name: row.name, description: row.description } } : {}),
      })
    }
  }

  if (!yourSpace && (org?.personalSkillsOutsideSpace ?? true)) {
    const spaceDefault = await placeDefaultOf(db, { placeType: 'user', placeId: input.personId })
    for (const c of await personSkillsFor(db, { personId: input.personId, agentId: input.agentId, spaceDefault, orgDefault })) {
      add('person', c.key, c.label, {
        item: { kind: 'person', entry: c.entry as PersonSkillEntry }, source: 'yours', sourceName: 'Yours',
        detail: `${c.entry.identity} ${c.entry.version}`, md: await skillMdAt(db, c.entry.digest), fallback: lastPart(c.entry.identity),
      })
    }
  }

  const kept = settleStagedNames(settleClashes(candidates).kept).kept
  const out: ConversationSkill[] = []
  for (const c of kept) {
    const d = described.get(c.item)!
    const name = stagedNameOf(c.item)
    if (name === null) continue
    const facts: SkillFacts = d.scanned ? scannedFacts(d.scanned, d.fallback) : skillFacts(d.md, d.fallback)
    if (!facts.userInvocable) continue
    out.push({ name, title: facts.title, description: facts.description, source: d.source, sourceName: d.sourceName, detail: d.detail })
  }
  return out
}
