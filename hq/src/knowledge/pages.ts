/**
 * `read_knowledge`, `write_knowledge`, `edit_knowledge` and `delete_knowledge` (K2–K5): a page's name picks the one
 * level it goes to, among those the caller holds (B2). A change is decided here before it reaches the gate —
 * `platform:` is read-only, `org:` changes only for an organisation admin, a caller that may not change refuses
 * (places.md, *Who reaches what*) — and every change the gate accepts is recorded with who made it (G5).
 */
import { KNOWLEDGE_LIMITS, type KnowledgeChangeResult } from '@agenthix/core'
import { MAX_LINE_LENGTH, splitLines, versionOf } from '@agenthix/core/file-tools'
import { KNOWLEDGE_READ_MAX_LINES } from '../server/controlplane/knowledgeToolSchemas'
import type { KnowledgeDeps, SiteAnswer } from './deps'
import { levelFailureMessage, MESSAGES } from './messages'
import { parseToolParams } from './params'
import { levelNames, levelsOf, pageKey, resolveLevel, splitName, type KnowledgeReach, type Level } from './reach'
import type { ReadRecord } from './readRecord'
import { tellChange, tellPlatformPage, type ChangeAsked } from './steps'

type SiteLevel = Extract<Level, { kind: 'org' | 'place' }>
type Target = { ok: true; level: Level; page: string } | { ok: false; message: string }

/** A page inside its level: no way out of the level's folder, whatever the site would also check (S3). */
export function isPageName(page: string): boolean {
  if (!page || page.length > 600 || page.startsWith('/') || page.includes('\\') || page.includes('\0')) return false
  return page.split('/').every(seg => seg !== '' && seg !== '.' && seg !== '..')
}

export function targetOf(reach: KnowledgeReach, name: string): Target {
  const split = splitName(name)
  if (!split) return { ok: false, message: MESSAGES.noLevel(levelNames(reach)) }
  const level = resolveLevel(reach, split.level)
  if (!level) {
    const message = reach.agent?.conversationId
      ? MESSAGES.pageNotInConversation(split.level, levelsOf(reach).map(l => l.name))
      : MESSAGES.notInReach(levelNames(reach))
    return { ok: false, message }
  }
  if (!isPageName(split.rest)) return { ok: false, message: MESSAGES.badPage() }
  return { ok: true, level, page: split.rest }
}

function numbered(text: string, offset: number | undefined, limit: number | undefined): { body: string; start: number; end: number; total: number } {
  const lines = splitLines(text)
  const start = Math.max(offset ?? 1, 1) - 1
  const shown = lines.slice(start, start + (limit ?? KNOWLEDGE_READ_MAX_LINES))
  const body = shown
    .map((line, i) => `${String(start + i + 1).padStart(6)}\t${line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)} [line cut at 2,000 characters]` : line}`)
    .join('\n')
  return { body, start: start + 1, end: start + shown.length, total: lines.length }
}

function pageText(name: string, text: string, version: string, offset?: number, limit?: number): string {
  if (text === '') return `[${name} is empty. Version ${version}.]`
  const n = numbered(text, offset, limit)
  if (n.end < n.start) return `[${name} has ${n.total} lines; there is nothing from line ${n.start}. Version ${version}.]`
  const more = n.end < n.total ? ` Read on with offset ${n.end + 1}.` : ''
  return `${n.body}\n[${name}: lines ${n.start}-${n.end} of ${n.total}. Version ${version}.${more}]`
}

/** The checks before a change reaches a level's gate. */
async function mayChange(deps: KnowledgeDeps, reach: KnowledgeReach, level: Level): Promise<string | null> {
  if (level.kind === 'platform') return MESSAGES.platformReadOnly()
  if (!reach.mayChange) return MESSAGES.mayNotChange()
  if (level.kind === 'org' && !(await deps.isOrgAdmin(reach.userId))) return MESSAGES.orgAdminOnly()
  return null
}

export class KnowledgePages {
  constructor(private readonly deps: KnowledgeDeps, private readonly reads: ReadRecord) {}

  async read(reach: KnowledgeReach, input: unknown): Promise<string> {
    const parsed = parseToolParams('read_knowledge', input)
    if (!parsed.ok) return parsed.message
    const { page: name, offset, limit } = parsed.value as { page: string; offset?: number; limit?: number }
    const target = targetOf(reach, name)
    if (!target.ok) return target.message
    const { level, page } = target
    if (level.kind === 'platform') {
      const answer = this.deps.guide.read({ page, offset, limit })
      if (answer.ok) tellPlatformPage(reach, page, this.deps.guide.outline()?.find(o => o.name === page)?.title)
      return answer.text
    }

    const bytes = await this.ask(level, () => this.deps.sites.read(level.owner, page))
    if (!bytes.ok) return levelFailureMessage(level.name, bytes.why)
    const text = Buffer.from(bytes.value).toString('utf8')
    if (text.includes('\0')) return MESSAGES.binary()
    const version = versionOf(bytes.value)
    this.reads.remember(reach.callerKey, pageKey(level.owner, page), version)
    return pageText(`${level.name}:${page}`, text, version, offset, limit)
  }

  async write(reach: KnowledgeReach, input: unknown): Promise<string> {
    const parsed = parseToolParams('write_knowledge', input)
    if (!parsed.ok) return parsed.message
    const { page: name, content } = parsed.value as { page: string; content: string }
    const target = await this.changeTarget(reach, name)
    if (!target.ok) return target.message
    const { level, page } = target
    if (Buffer.byteLength(content, 'utf8') > KNOWLEDGE_LIMITS.maxPageBytes) return MESSAGES.tooLarge(KNOWLEDGE_LIMITS.maxPageBytes / 1024)

    const key = pageKey(level.owner, page)
    const baseVersion = this.reads.recall(reach.callerKey, key)
    const answer = await this.ask(level, () => this.deps.sites.write(level.owner, { page, content, baseVersion }))
    if (!answer.ok) return levelFailureMessage(level.name, answer.why)
    const result = answer.value
    if (result.outcome === 'refused' && result.reason === 'conflict') {
      // Not read first: the page is there, and its text is not handed over by a write (K3).
      if (baseVersion === null || !result.current) return MESSAGES.readFirst(`${level.name}:${page}`)
      // Read, but changed since (G2): the current text is what the next write starts from.
      this.reads.remember(reach.callerKey, key, result.current.version)
      return `${result.message}\n${pageText(`${level.name}:${page}`, result.current.content, result.current.version)}`
    }
    return this.finish(reach, level, page, result, { tool: 'write', content })
  }

  async edit(reach: KnowledgeReach, input: unknown): Promise<string> {
    const parsed = parseToolParams('edit_knowledge', input)
    if (!parsed.ok) return parsed.message
    const p = parsed.value as { page: string; old_string: string; new_string: string; replace_all?: boolean }
    const target = await this.changeTarget(reach, p.page)
    if (!target.ok) return target.message
    const { level, page } = target
    const change = { page, old_string: p.old_string, new_string: p.new_string, ...(p.replace_all !== undefined ? { replace_all: p.replace_all } : {}) }
    const answer = await this.ask(level, () => this.deps.sites.edit(level.owner, change))
    if (!answer.ok) return levelFailureMessage(level.name, answer.why)
    return this.finish(reach, level, page, answer.value, { tool: 'edit', old_string: p.old_string, new_string: p.new_string })
  }

  async delete(reach: KnowledgeReach, input: unknown): Promise<string> {
    const parsed = parseToolParams('delete_knowledge', input)
    if (!parsed.ok) return parsed.message
    const target = await this.changeTarget(reach, (parsed.value as { page: string }).page)
    if (!target.ok) return target.message
    const { level, page } = target
    const answer = await this.ask(level, () => this.deps.sites.delete(level.owner, { page }))
    if (!answer.ok) return levelFailureMessage(level.name, answer.why)
    return this.finish(reach, level, page, answer.value, { tool: 'delete' })
  }

  private async changeTarget(reach: KnowledgeReach, name: string): Promise<{ ok: true; level: SiteLevel; page: string } | { ok: false; message: string }> {
    const target = targetOf(reach, name)
    if (!target.ok) return target
    const refusal = await mayChange(this.deps, reach, target.level)
    if (refusal) return { ok: false, message: refusal }
    return { ok: true, level: target.level as SiteLevel, page: target.page }
  }

  /** A site call that never throws: whatever went wrong is a failure from the fixed set, and its detail is logged. */
  private async ask<T>(level: SiteLevel, call: () => Promise<SiteAnswer<T>>): Promise<SiteAnswer<T>> {
    try {
      return await call()
    } catch (err) {
      this.deps.log.warn('knowledge call to a site failed', { level: level.kind, error: err instanceof Error ? err.name : 'unknown' })
      return { ok: false, why: 'failed' }
    }
  }

  private async finish(reach: KnowledgeReach, level: SiteLevel, page: string, result: KnowledgeChangeResult, asked: ChangeAsked): Promise<string> {
    if (result.outcome === 'refused') return result.message
    const name = `${level.name}:${page}`
    const key = pageKey(level.owner, page)
    let version = result.version
    if (result.change === 'deleted' || result.change === 'moved') {
      version = this.reads.recall(reach.callerKey, key) ?? (await this.keptVersion(level, page, result.previousVersionId))
      this.reads.forget(reach.callerKey, key)
    } else if (version) {
      this.reads.remember(reach.callerKey, key, version)
    }
    try {
      await this.deps.recordChange({ owner: level.owner, page, kind: result.change, version: version ?? '', reach })
    } catch (err) {
      // The change stands on the site; only its record is missing, which the log says.
      this.deps.log.warn('a knowledge change was made but not recorded', { level: level.kind, error: err instanceof Error ? err.name : 'unknown' })
    }
    if (reach.onStep) tellChange(reach, level, page, result, version, await this.withTitle(level, page, asked))
    if (result.change === 'deleted') {
      return `Deleted ${name}. It is kept among the recently deleted for 30 days: a person can restore it from History in HQ's Knowledge tool, or write the page again.`
    }
    const short = version ? ` Version ${version.slice(0, 12)}.` : ''
    const previous = result.previousVersionId ? ' The previous one is in History.' : ''
    return `Done: ${name} ${result.change}.${short}${previous}`
  }

  /** An edit's page read back, for the title its work step names; without it the step names the file. */
  private async withTitle(level: SiteLevel, page: string, asked: ChangeAsked): Promise<ChangeAsked> {
    if (asked.tool !== 'edit') return asked
    const bytes = await this.ask(level, () => this.deps.sites.read(level.owner, page))
    return bytes.ok ? { ...asked, content: Buffer.from(bytes.value).toString('utf8') } : asked
  }

  /** The version a deleted page had, from the kept version the delete made, when the caller never read it. */
  private async keptVersion(level: SiteLevel, page: string, id: string | undefined): Promise<string | undefined> {
    if (!id) return undefined
    const kept = await this.ask(level, () => this.deps.sites.versions(level.owner, page))
    return kept.ok ? kept.value.versions.find(v => v.id === id)?.version : undefined
  }
}
