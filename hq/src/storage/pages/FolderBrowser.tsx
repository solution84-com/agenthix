import { useState, type ReactNode } from 'react'
import type { FileFrameProps } from '@agenthix/ui/files'
import { SearchField } from '@agenthix/ui/primitives'
import { FilesQuietLine } from '@agenthix/ui/projects'
import { FolderTree } from './FolderTree'
import { FoundFiles } from './FoundFiles'
import type { Target } from './filesToolData'

/** "‹ reports": the folder an open file is in, or the place's top (`Files`, the workspace's name). */
export function folderBackLabel(file: string, top: string): string {
  const folders = file.split('/').filter(Boolean).slice(0, -1)
  return folders[folders.length - 1] ?? top
}

export interface OpenedParts {
  back: { label: string; onBack: () => void }
  /** Wide only: ▤ shows the folder beside the file. */
  folderToggle?: FileFrameProps['folderToggle']
}

/**
 * A place's folders and the file open in them (decision D1): with no file open, the tree beside a line asking for one;
 * opening a file folds the tree away, so the file gets the whole tool and looks as the file viewer does, with
 * "‹ <folder>" back. ▤ in the file's header brings the folder back beside it, for going through files one by one.
 * Search files finds a name in every folder. Narrow, the caller's own list stands in for the tree.
 */
export function FolderBrowser({ target, top, wide, file, onOpenFile, onClose, opened, narrowList, chosen = true }: {
  target: Target
  /** The place's top folder as the person knows it: "Files", the workspace's name. */
  top: string
  wide: boolean
  file: string | null
  onOpenFile: (path: string) => void
  /** ‹ back from the open file. */
  onClose: () => void
  opened: (parts: OpenedParts) => ReactNode
  /** Narrow, with no file open: the folder as a list. */
  narrowList: (search: ReactNode, found: ReactNode | null) => ReactNode
  /** False for a file the place opened on by itself (a workspace's README): the folder stays beside it. */
  chosen?: boolean
}) {
  const [query, setQuery] = useState('')
  const [folderShown, setFolderShown] = useState(false)
  const back = { label: folderBackLabel(file ?? '', top), onBack: onClose }
  const search = (
    <div className="flex px-4 py-2.5">
      <SearchField label="Search files" value={query} onChange={setQuery} className="flex-1" />
    </div>
  )
  const found = query.trim() ? <FoundFiles target={target} query={query} selected={file} onOpenFile={onOpenFile} /> : null

  if (!wide) {
    if (file) return <>{opened({ back })}</>
    return <>{narrowList(search, found)}</>
  }

  const besideShown = !file || folderShown || !chosen
  const folder = (
    <div className="w-64 shrink-0 overflow-y-auto border-r border-border-subtle" data-testid="folder-beside">
      {search}
      {found ?? <FolderTree target={target} selected={file} onOpenFile={onOpenFile} />}
    </div>
  )
  return (
    <div className="flex min-h-0 flex-1">
      {besideShown && folder}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {file
          ? opened({ back, folderToggle: chosen ? { shown: folderShown, onToggle: () => setFolderShown(v => !v) } : undefined })
          : <FilesQuietLine>Select a file to read it.</FilesQuietLine>}
      </section>
    </div>
  )
}
