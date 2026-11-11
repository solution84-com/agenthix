export type ChangeStatus = 'added' | 'modified' | 'removed' | 'renamed'

interface MarkerLook { sign: string; word: string; tone: string }

/** A letter or cross and a token colour, never colour alone (board U3b). */
const LOOKS: Record<ChangeStatus, MarkerLook> = {
  added: { sign: 'A', word: 'added', tone: 'text-success' },
  modified: { sign: 'M', word: 'modified', tone: 'text-warning' },
  removed: { sign: '✕', word: 'deleted', tone: 'text-danger' },
  renamed: { sign: 'R', word: 'renamed', tone: 'text-text-secondary' },
}

/** "modified, 3 lines added, 1 removed": the marker's name for assistive technology. */
export function changeLabel(status: ChangeStatus, added = 0, removed = 0): string {
  const parts: string[] = [LOOKS[status].word]
  if (added) parts.push(`${added} ${added === 1 ? 'line' : 'lines'} added`)
  if (removed) parts.push(`${removed} removed`)
  return parts.join(', ')
}

export function ChangeMarker({ status, added, removed }: { status: ChangeStatus; added?: number; removed?: number }) {
  const look = LOOKS[status]
  return (
    <span role="img" aria-label={changeLabel(status, added, removed)} className={`inline-block w-4 shrink-0 text-center font-mono font-medium ${look.tone}`}>
      {look.sign}
    </span>
  )
}
