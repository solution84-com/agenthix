import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { BranchFileChange, GitTreeEntry } from '@agenthix/core'
import type { BranchRef } from '../../branches/views'
import { FilesPanel } from './FilesPanel'
import { OpenAFile } from './OpenAFile'
import { ROW_CHOSEN, ROW_ITEM } from '@agenthix/ui/primitives'

/**
 * The left panel's files (board *Files and changes, one view*): *Open a file…*, the *Files* heading with *Only
 * changed · N* beside it while there are changes, and the one tree. Without Git, `plainTree` (the workspace's folder)
 * stands in for the tree.
 */
export function FilesSide({ workspaceId, gitRef, changes, onlyChanged, onOnlyChanged, onlyLabel, selected, onOpenFile, plainTree }: {
  workspaceId: string
  gitRef: BranchRef | null
  changes: readonly BranchFileChange[]
  onlyChanged: boolean
  onOnlyChanged: (on: boolean) => void
  /** "Only changed", or "Only changed in v12" for an older version. */
  onlyLabel: string
  selected: string | null
  onOpenFile: (path: string) => void
  plainTree?: ReactNode
}) {
  const [listed, setListed] = useState<ReadonlySet<string>>(new Set())
  const onListed = useCallback((entries: readonly GitTreeEntry[]) => {
    setListed(prev => {
      const files = entries.filter(e => e.kind === 'file' && !prev.has(e.path))
      if (files.length === 0) return prev
      const next = new Set(prev)
      for (const f of files) next.add(f.path)
      return next
    })
  }, [])
  const paths = useMemo(() => [...new Set([...changes.map(c => c.path), ...listed])].sort(), [changes, listed])
  const narrowing = changes.length > 0 && onlyChanged

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <OpenAFile paths={paths} onOpen={onOpenFile} />
      <div className="flex items-center gap-2 px-3 pb-1 pt-2">
        <h2 className="text-small font-medium text-text-primary">Files</h2>
        {changes.length > 0 && (
          <button type="button" aria-pressed={onlyChanged} onClick={() => onOnlyChanged(!onlyChanged)}
            title={onlyChanged ? 'Show every file' : 'Show only the changed files'}
            className={`ml-auto rounded-full border border-border-subtle px-2 py-0.5 text-micro ${onlyChanged ? ROW_CHOSEN : ROW_ITEM}`}>
            {onlyLabel} · {changes.length}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {gitRef
          ? <FilesPanel key={JSON.stringify(gitRef)} workspaceId={workspaceId} gitRef={gitRef} changes={changes} onlyChanged={narrowing}
              selected={selected} onOpenFile={onOpenFile} onListed={onListed} />
          : plainTree}
      </div>
    </div>
  )
}
