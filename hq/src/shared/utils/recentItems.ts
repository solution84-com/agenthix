const MAX_RECENT = 5

export interface RecentProject {
  id: string
  name: string
  key: string
}

export interface RecentBoard {
  id: string
  name: string
  projectId: string
  projectName: string
  projectKey?: string
  status?: string
}

const RECENT_UPDATED = 'recentItemsUpdated'

export function saveRecentProject(project: RecentProject): void {
  const existing = getRecentProjects()
  const filtered = existing.filter(p => p.id !== project.id)
  localStorage.setItem('recentProjects', JSON.stringify([project, ...filtered].slice(0, MAX_RECENT)))
  window.dispatchEvent(new CustomEvent(RECENT_UPDATED))
}

export function getRecentProjects(): RecentProject[] {
  try { return JSON.parse(localStorage.getItem('recentProjects') ?? '[]') } catch { return [] }
}

export function saveRecentBoard(board: RecentBoard): void {
  const existing = getRecentBoards()
  const filtered = existing.filter(b => b.id !== board.id)
  localStorage.setItem('recentBoards', JSON.stringify([board, ...filtered].slice(0, MAX_RECENT)))
  window.dispatchEvent(new CustomEvent(RECENT_UPDATED))
}

export function getRecentBoards(): RecentBoard[] {
  try { return JSON.parse(localStorage.getItem('recentBoards') ?? '[]') } catch { return [] }
}

export function pruneRecentProjects(existingIds: string[]): void {
  const set = new Set(existingIds)
  const pruned = getRecentProjects().filter(p => set.has(p.id))
  localStorage.setItem('recentProjects', JSON.stringify(pruned))
  window.dispatchEvent(new CustomEvent(RECENT_UPDATED))
}

export function pruneRecentBoards(existingIds: string[]): void {
  const set = new Set(existingIds)
  const pruned = getRecentBoards().filter(b => set.has(b.id))
  localStorage.setItem('recentBoards', JSON.stringify(pruned))
  window.dispatchEvent(new CustomEvent(RECENT_UPDATED))
}
