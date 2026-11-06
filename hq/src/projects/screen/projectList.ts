import type { ProjectCardCounts } from '@agenthix/ui/projects'
import type { ProjectCardLine } from '../projectCardQueries'

/** The project card's pin says what pinning does: it changes Home and the chat bar, not only this list. */
export const PIN_SAYS = { pin: 'Pin: shows it on Home and in the chat bar', unpin: 'Unpin: takes it off Home and the chat bar' }

/**
 * A card's state line. Someone not in the project is not told what needs *them* there; they see what is running
 * and open. Null while the line is being read.
 */
export function cardCounts(line: ProjectCardLine | undefined, isMember: boolean): ProjectCardCounts | null {
  if (!line) return null
  return { needsYou: isMember ? line.needsYouCount : 0, running: line.runningCount, open: line.openCount ?? 0 }
}

const at = (iso: string | Date | null | undefined): number => (iso ? new Date(iso).getTime() : 0)

/** Most recent activity first; a project whose line is not read yet goes by when the project itself last changed. */
export function byLatestActivity<P extends { id: string; updatedAt?: string | Date }>(projects: P[], lineOf: Map<string, ProjectCardLine>): P[] {
  const when = (p: P) => at(lineOf.get(p.id)?.lastActivityAt ?? p.updatedAt)
  return projects.map((p, i) => ({ p, i })).sort((a, b) => when(b.p) - when(a.p) || a.i - b.i).map(x => x.p)
}

/** The line when nothing is shown: it names the search, or the product or programme chosen. */
export function noMatchLine(search: string, filedUnder: Array<string | undefined>): string {
  const typed = search.trim()
  if (typed) return `No project matches “${typed}”`
  const names = filedUnder.filter((n): n is string => !!n)
  return names.length ? `No project is filed under ${names.join(' and ')}` : 'No project matches'
}
