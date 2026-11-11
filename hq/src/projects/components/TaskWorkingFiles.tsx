import { useState } from 'react'
import { FileText, Folder } from 'lucide-react'
import type { LocationRef } from '@agenthix/core'
import { FOCUS_RING_INSET, ROW_CHOSEN, ROW_ITEM, FOCUS_RING } from '@agenthix/ui/primitives'
import { TaskFact } from '@agenthix/ui/tasks'
import { isSiteUnreachable } from '../../shared/siteSilence'
import { useTaskFolder } from '../hooks/useTaskFiles'
import { Nudge, useBackgroundRead } from '@agenthix/ui/attention'

const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name)
const parentOf = (path: string) => path.split('/').slice(0, -1).join('/')

/**
 * A task's working files (spec part 3, *A task's files*): its own folder on the site, where its runs work, listed
 * folder by folder. A file opens beside the task. An empty folder says nothing.
 */
export function TaskWorkingFiles({ loc, selected, onOpen }: {
  loc: LocationRef
  /** The path of the working file open beside the task. */
  selected?: string
  onOpen: (path: string) => void
}) {
  const [dir, setDir] = useState(() => (selected ? parentOf(selected) : ''))
  const folder = useTaskFolder(loc, dir)
  const entries = (folder.entries ?? []).filter(e => !e.name.startsWith('.'))
  const read = useBackgroundRead({ data: folder.entries, error: folder.error, dataUpdatedAt: folder.dataUpdatedAt, refetch: folder.refetch }, { what: 'The working files' })

  if (read.failedWithoutData) {
    if (!isSiteUnreachable(folder.error)) return <TaskFact label="Working files">{read.nudge}</TaskFact>
    return (
      <TaskFact label="Working files">
        <Nudge place="meta" action={{ label: 'Try again', onClick: () => void folder.refetch() }}>
          The site holding this task's files isn't answering.
        </Nudge>
      </TaskFact>
    )
  }
  if (!dir && entries.length === 0) return null

  return (
    <TaskFact label="Working files">
      {read.nudge}
      <div className="space-y-0.5">
        {dir && (
          <button type="button" onClick={() => setDir(parentOf(dir))} className={`rounded block truncate text-small text-link hover:underline ${FOCUS_RING}`}>
            ‹ {dir}
          </button>
        )}
        <ul className="space-y-0.5">
          {entries.map(entry => {
            const path = joinPath(dir, entry.name)
            const Icon = entry.isDir ? Folder : FileText
            return (
              <li key={entry.name}>
                <button
                  type="button"
                  onClick={() => (entry.isDir ? setDir(path) : onOpen(path))}
                  aria-current={path === selected ? 'true' : undefined}
                  className={`flex w-full items-center gap-1.5 rounded-lg px-1 text-left text-small ${FOCUS_RING_INSET} ${path === selected ? ROW_CHOSEN : ROW_ITEM}`}
                >
                  <Icon size={11} className="shrink-0 text-text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </TaskFact>
  )
}
