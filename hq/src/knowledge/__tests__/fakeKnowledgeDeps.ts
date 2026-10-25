/**
 * The knowledge service's deps replaced for its unit tests: sites holding pages in memory, with a gate that applies
 * the version and passage rules as the real one does, and a guide of a few pages. A site can be made unreachable,
 * silent (never answers) or failing.
 */
import type { KnowledgeChangeResult, KnowledgeGrepHit, KnowledgeGrepParams, KnowledgeOwnerRef } from '@agenthix/core'
import { versionOf } from '@agenthix/core/file-tools'
import type { GrepFound } from '@agenthix/core/file-tools'
import type { KnowledgeChangeEntry, KnowledgeDeps, KnowledgeSites, SiteAnswer, SiteFailure } from '../deps'

type Pages = Map<string, string>
const keyOf = (o: KnowledgeOwnerRef) => `${o.ownerType}:${o.ownerId}`
const v = (text: string) => versionOf(Buffer.from(text, 'utf8'))

export type SiteMode = 'ok' | SiteFailure | 'silent' | 'throws'

function grepPages(pages: Pages, params: KnowledgeGrepParams): KnowledgeGrepHit[] {
  const re = new RegExp(params.pattern, params['-i'] === false ? '' : 'i')
  const mode = params.output_mode ?? 'files_with_matches'
  const hits: KnowledgeGrepHit[] = []
  for (const [page, text] of [...pages].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (params.path && !page.startsWith(params.path)) continue
    const lines = text.split('\n')
    const matched = lines.map((l, i) => ({ l, i })).filter(x => re.test(x.l))
    if (!matched.length) continue
    if (mode === 'files_with_matches') hits.push({ page })
    else if (mode === 'count') hits.push({ page, count: matched.length })
    else for (const m of matched) hits.push({ page, ...(params['-n'] === false ? {} : { line: m.i + 1 }), text: m.l })
  }
  return params.head_limit ? hits.slice(0, params.head_limit) : hits
}

export class FakeSites implements KnowledgeSites {
  readonly store = new Map<string, Pages>()
  readonly modes = new Map<string, SiteMode>()
  readonly calls: { method: string; owner: string; params?: unknown }[] = []
  /** The kept versions a delete made, by id. */
  private readonly kept = new Map<string, { page: string; version: string }>()

  put(owner: KnowledgeOwnerRef, page: string, text: string): void {
    const pages = this.store.get(keyOf(owner)) ?? new Map()
    pages.set(page, text)
    this.store.set(keyOf(owner), pages)
  }

  text(owner: KnowledgeOwnerRef, page: string): string | undefined {
    return this.store.get(keyOf(owner))?.get(page)
  }

  private async run<T>(method: string, owner: KnowledgeOwnerRef, params: unknown, work: (pages: Pages) => T): Promise<SiteAnswer<T>> {
    this.calls.push({ method, owner: keyOf(owner), params })
    const mode = this.modes.get(keyOf(owner)) ?? 'ok'
    if (mode === 'silent') return new Promise(() => {})
    if (mode === 'throws') throw new Error('site at 10.0.0.7 failed reading /srv/knowledge/projects/42')
    if (mode !== 'ok') return { ok: false, why: mode }
    const pages = this.store.get(keyOf(owner)) ?? new Map()
    this.store.set(keyOf(owner), pages)
    return { ok: true, value: work(pages) }
  }

  grep: KnowledgeSites['grep'] = (owner, params) =>
    this.run('grep', owner, params, pages => ({ outcome: 'done' as const, mode: params.output_mode ?? 'files_with_matches', hits: grepPages(pages, params) }))

  list: KnowledgeSites['list'] = owner =>
    this.run('list', owner, undefined, pages => {
      const all = [...pages.keys()]
      const sections = new Map<string, number>()
      for (const p of all) if (p.includes('/')) sections.set(p.slice(0, p.lastIndexOf('/')), (sections.get(p.slice(0, p.lastIndexOf('/'))) ?? 0) + 1)
      return {
        files: [],
        truncated: false,
        sections: [...sections].map(([path, pageCount]) => ({ path, pageCount })),
        pages: all.map(page => ({
          page, title: page, description: '', properties: {}, size: 0, modifiedAt: '', version: v(pages.get(page)!), problems: [],
          tags: [...(pages.get(page)!.match(/tags: \[(.*)\]/)?.[1].split(', ') ?? [])],
        })),
      }
    })

  read: KnowledgeSites['read'] = async (owner, page) => {
    const answer = await this.run('read', owner, page, pages => pages.get(page))
    if (!answer.ok) return answer
    return answer.value === undefined ? { ok: false, why: 'not_found' } : { ok: true, value: Buffer.from(answer.value, 'utf8') }
  }

  write: KnowledgeSites['write'] = (owner, change) =>
    this.run('write', owner, change, (pages): KnowledgeChangeResult => {
      const current = pages.get(change.page)
      if (current !== undefined && change.baseVersion !== v(current)) {
        return {
          outcome: 'refused', reason: 'conflict', current: { content: current, version: v(current) },
          message: change.baseVersion === null ? `There is already a page ${change.page}. Read it, then change it. Nothing was changed.` : `${change.page} changed since it was read. Nothing was changed.`,
        }
      }
      if (!change.content.startsWith('---')) return { outcome: 'refused', reason: 'problems', problems: [], message: `${change.page} was not saved: title is missing. Nothing was changed.` }
      pages.set(change.page, change.content)
      return { outcome: 'done', page: change.page, change: current === undefined ? 'created' : 'edited', version: v(change.content), ...(current !== undefined ? { previousVersionId: 'k1' } : {}) }
    })

  edit: KnowledgeSites['edit'] = (owner, change) =>
    this.run('edit', owner, change, (pages): KnowledgeChangeResult => {
      const current = pages.get(change.page)
      if (current === undefined) return { outcome: 'refused', reason: 'not_found', message: `There is no page ${change.page}. Nothing was changed.` }
      const found = current.split(change.old_string).length - 1
      if (found !== 1 && !change.replace_all) return { outcome: 'refused', reason: 'not_unique', found, message: `old_string was found ${found} times in ${change.page}. Nothing was changed.` }
      const next = current.split(change.old_string).join(change.new_string)
      pages.set(change.page, next)
      return { outcome: 'done', page: change.page, change: 'edited', version: v(next), previousVersionId: 'k2' }
    })

  delete: KnowledgeSites['delete'] = (owner, change) =>
    this.run('delete', owner, change, (pages): KnowledgeChangeResult => {
      const current = pages.get(change.page)
      if (current === undefined) return { outcome: 'refused', reason: 'not_found', message: `There is no page ${change.page}. Nothing was changed.` }
      pages.delete(change.page)
      this.kept.set('k-del', { page: change.page, version: v(current) })
      return { outcome: 'done', page: change.page, change: 'deleted', previousVersionId: 'k-del' }
    })

  versions: KnowledgeSites['versions'] = (owner, page) =>
    this.run('versions', owner, page, () => ({
      truncated: false,
      versions: [...this.kept].filter(([, k]) => k.page === page).map(([id, k]) => ({
        page, id, version: k.version, savedAt: '', size: 0, change: 'deleted' as const, deleted: true,
      })),
    }))
}

export const GUIDE_PAGES: Record<string, string> = {
  'your-tools/providers.md': '---\ntitle: Providers\n---\nAdd a model key under Models.\nStaging is not a guide word.',
}

export function fakeDeps(over: Partial<KnowledgeDeps> = {}) {
  const sites = new FakeSites()
  const records: KnowledgeChangeEntry[] = []
  const admins = new Set<string>()
  const warnings: { message: string; fields?: Record<string, unknown> }[] = []
  let guideMissing = false
  const deps: KnowledgeDeps = {
    sites,
    guide: {
      async grep(params) {
        if (guideMissing) return { ok: false, missing: true, message: 'The guide is not in this installation.' }
        const hits = grepPages(new Map(Object.entries(GUIDE_PAGES).map(([k, t]) => [`pages/${k}`, t])), params as KnowledgeGrepParams)
        const found: GrepFound = {
          ok: true, mode: 'content', showLineNumbers: true, numLines: hits.length, totalLines: hits.length, incomplete: false,
          lines: hits.map(h => ({ kind: 'match' as const, file: h.page, line: h.line ?? 0, text: h.text ?? '' })),
        }
        return { ok: true, found }
      },
      outline: () => (guideMissing ? null : Object.keys(GUIDE_PAGES).map(name => ({ name, title: name }))),
      read: ({ page }) => ({ ok: true, text: `GUIDE ${page}` }),
    },
    isOrgAdmin: async userId => admins.has(userId),
    recordChange: async entry => {
      records.push(entry)
    },
    searchTimeLimitMs: 200,
    log: { warn: (message, fields) => warnings.push({ message, fields }) },
    ...over,
  }
  return { deps, sites, records, admins, warnings, setGuideMissing: (m: boolean) => (guideMissing = m) }
}
