/**
 * What the workspace view's address carries (live preview spec, part 1, *Switching*): the branch chosen, the section
 * open and what the middle shows. The view also remembers them per workspace and per person in the browser's storage,
 * for when the person comes back by a link that names none of them.
 */

export type ViewSection = 'preview' | 'files' | 'git'

/**
 * `branch` is `main` or a branch's name. The middle shows a file, or a file's changes (`diff`), or neither. `version`
 * is an older version of main being looked at, read-only; null is the latest. It is kept only with `main` and is never
 * remembered: coming back opens the latest.
 */
export interface ViewState {
  branch: string
  section: ViewSection
  file: string | null
  diff: string | null
  version: string | null
}

const SECTIONS: readonly ViewSection[] = ['preview', 'files', 'git']
const MAX_TEXT = 1024
const RECENT_MAX = 20

export const MAIN = 'main'

export function workspaceViewPath(workspaceId: string): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}/view`
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= MAX_TEXT ? v : null)
const section = (v: unknown): ViewSection | null => (SECTIONS.includes(v as ViewSection) ? (v as ViewSection) : null)

/** What the address names; anything it does not name, or names wrongly, is left out. */
export function readViewAddress(params: URLSearchParams): Partial<ViewState> {
  const out: Partial<ViewState> = {}
  const branch = text(params.get('branch'))
  const sec = section(params.get('section'))
  const file = text(params.get('file'))
  const diff = text(params.get('diff'))
  const version = text(params.get('version'))
  if (branch) out.branch = branch
  if (version && (branch ?? MAIN) === MAIN) out.version = version
  if (sec) out.section = sec
  if (file) out.file = file
  else if (diff) out.diff = diff
  return out
}

/** A link from a merge request asks for the branch's Merge dialog to open (`merge=1`); it is not part of the place. */
export function asksToMerge(params: URLSearchParams): boolean {
  return params.get('merge') === '1'
}

export function viewAddressOf(state: ViewState): string {
  const params = new URLSearchParams()
  if (state.branch !== MAIN) params.set('branch', state.branch)
  params.set('section', state.section)
  if (state.file) params.set('file', state.file)
  else if (state.diff) params.set('diff', state.diff)
  if (state.version && state.branch === MAIN) params.set('version', state.version)
  return `?${params.toString()}`
}

/** True when the address names where the view is, so the remembered place is not used. */
export function addressNamesAPlace(params: URLSearchParams): boolean {
  return ['branch', 'section', 'file', 'diff', 'version'].some(k => params.has(k))
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

const placeKey = (userId: string, workspaceId: string) => `workspaceView:${userId}:${workspaceId}`
const recentKey = (userId: string) => `workspaceView:${userId}:recent`

function readJson(store: Store, key: string): unknown {
  try { return JSON.parse(store.getItem(key) ?? 'null') } catch { return null }
}

function write(store: Store, key: string, value: unknown) {
  try { store.setItem(key, JSON.stringify(value)) } catch { /* storage full or refused: nothing is remembered */ }
}

/** The place last seen in this workspace, checked as the address is: storage is the browser's, not hq's. */
export function readRemembered(store: Store, userId: string, workspaceId: string): Partial<ViewState> {
  const raw = readJson(store, placeKey(userId, workspaceId))
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const params = new URLSearchParams()
  for (const k of ['branch', 'section', 'file', 'diff']) if (typeof r[k] === 'string') params.set(k, r[k] as string)
  return readViewAddress(params)
}

export function remember(store: Store, userId: string, workspaceId: string, state: ViewState) {
  write(store, placeKey(userId, workspaceId), { ...state, version: null })
}

/** Workspace ids, most recently opened first. */
export function recentWorkspaces(store: Store, userId: string): string[] {
  const raw = readJson(store, recentKey(userId))
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string').slice(0, RECENT_MAX) : []
}

export function noteOpened(store: Store, userId: string, workspaceId: string) {
  const next = [workspaceId, ...recentWorkspaces(store, userId).filter(id => id !== workspaceId)].slice(0, RECENT_MAX)
  write(store, recentKey(userId), next)
}

/** The place's workspaces, the most recently opened first, then the rest in the order given. */
export function byRecent<T extends { id: string }>(items: readonly T[], recent: readonly string[]): T[] {
  const rank = (id: string) => { const i = recent.indexOf(id); return i === -1 ? Number.MAX_SAFE_INTEGER : i }
  return [...items].map((item, i) => ({ item, i })).sort((a, b) => rank(a.item.id) - rank(b.item.id) || a.i - b.i).map(x => x.item)
}
