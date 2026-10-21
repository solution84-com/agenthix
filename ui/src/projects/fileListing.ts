/** What the Files tools list (every screen reviewed spec §3): an entry of a folder, and a topic of Knowledge. */
export interface ListedEntry {
  name: string
  isDir?: boolean
  size?: number
  /** ISO time the file last changed; absent when the site did not say. */
  modifiedAt?: string
}

export interface KnowledgeTopic {
  path: string
  title: string
  summary: string
  tags: string[]
  modifiedAt: string
}

const EXTENSION_KIND: Record<string, string> = {
  md: 'Markdown', markdown: 'Markdown', pdf: 'PDF', csv: 'CSV', txt: 'Text', json: 'JSON',
  png: 'Image', jpg: 'Image', jpeg: 'Image', gif: 'Image', webp: 'Image', svg: 'Image', bmp: 'Image', ico: 'Image',
  ts: 'Code', tsx: 'Code', js: 'Code', jsx: 'Code', py: 'Code', rb: 'Code', go: 'Code', rs: 'Code', java: 'Code',
  c: 'Code', cpp: 'Code', cs: 'Code', sh: 'Code', yml: 'Code', yaml: 'Code', toml: 'Code', css: 'Code',
  html: 'Code', sql: 'Code', prisma: 'Code',
}

export function kindLabel(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return 'File'
  return EXTENSION_KIND[name.slice(dot + 1).toLowerCase()] ?? 'File'
}

function oneDecimal(n: number): string {
  return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10)
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${oneDecimal(bytes / 1024)} KB`
  return `${oneDecimal(bytes / (1024 * 1024))} MB`
}

/** "Markdown · 2 KB"; a folder is just "Folder"; no size is left out rather than guessed. */
export function kindAndSize(entry: Pick<ListedEntry, 'name' | 'isDir' | 'size'>): string {
  if (entry.isDir) return 'Folder'
  const kind = kindLabel(entry.name)
  return entry.size === undefined ? kind : `${kind} · ${sizeLabel(entry.size)}`
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Whole calendar days between `modifiedAt` and `now`; a time in the future counts as today. */
function daysAgo(modifiedAt: string, now: Date): number {
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(new Date(modifiedAt))) / 86_400_000))
}

/** "10:25" today, "Yesterday", "Mon", "last week", "2 weeks ago", then "30 Aug". */
export function changedLabel(modifiedAt: string | undefined, now: Date = new Date()): string {
  if (!modifiedAt) return ''
  const d = new Date(modifiedAt)
  const days = daysAgo(modifiedAt, now)
  if (days === 0) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' })
  if (days < 14) return 'last week'
  if (days < 28) return `${Math.floor(days / 7)} weeks ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

const time = (e: { modifiedAt?: string }) => (e.modifiedAt ? new Date(e.modifiedAt).getTime() : -Infinity)

/** Newest first; what has no time sorts after what has, by name. */
export function newestFirst<T extends { name?: string; modifiedAt?: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => time(b) - time(a) || (a.name ?? '').localeCompare(b.name ?? ''))
}

export interface RecencyGroup<T> {
  label: 'Today' | 'This week' | 'Older'
  entries: T[]
}

/** Today · This week · Older over a list already newest first; empty groups are left out. */
export function groupByRecency<T extends { modifiedAt?: string }>(entries: T[], now: Date = new Date()): RecencyGroup<T>[] {
  const groups: RecencyGroup<T>[] = [
    { label: 'Today', entries: [] }, { label: 'This week', entries: [] }, { label: 'Older', entries: [] },
  ]
  for (const e of entries) {
    const days = e.modifiedAt ? daysAgo(e.modifiedAt, now) : Infinity
    groups[days === 0 ? 0 : days < 7 ? 1 : 2].entries.push(e)
  }
  return groups.filter(g => g.entries.length > 0)
}

/** Hidden names (the agents' own folder, `.git`) are not documents a person reads. */
export function visibleEntries<T extends { name: string }>(entries: T[]): T[] {
  return entries.filter(e => !e.name.startsWith('.'))
}

export function filterByName<T extends { name: string }>(entries: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  return q ? entries.filter(e => e.name.toLowerCase().includes(q)) : entries
}

export function filterTopics(topics: KnowledgeTopic[], by: { query: string; tag: string }): KnowledgeTopic[] {
  const q = by.query.trim().toLowerCase()
  return topics.filter(t =>
    (!by.tag || t.tags.includes(by.tag)) &&
    (!q || [t.title, t.summary, ...t.tags].some(s => s.toLowerCase().includes(q))))
}

export function tagsOf(topics: KnowledgeTopic[]): string[] {
  return [...new Set(topics.flatMap(t => t.tags))].sort((a, b) => a.localeCompare(b))
}

export const joinPath = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name)
export const parentOf = (path: string): string => path.split('/').slice(0, -1).join('/')
