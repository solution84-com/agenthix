import { useRef } from 'react'
import {
  FileRow, FilesQuietLine, joinPath, kindAndSize, newestFirst, parentOf, changedLabel, visibleEntries,
} from '@agenthix/ui/projects'
import { ReadNudge, useSiteRead } from '../../shared/siteRead'
import { BackupLine } from './BackupLine'
import { GitLine } from './GitLine'
import { OpenedFile } from './OpenedFile'
import { FolderBrowser } from './FolderBrowser'
import { useFolder, type Owner } from './filesToolData'
import { useToolParams, useWide } from './useToolParams'
import { FOCUS_RING_INSET, ROW_ITEM } from '@agenthix/ui/primitives'

/**
 * The Files tool (every screen reviewed spec §3): the place's documents, with their git status (when `files/` is a
 * repository) and the GitHub backup each on one line above them. It is the file's home for browsing: opening a file
 * folds the folders away, so it reads as the file viewer does, with "‹ <folder>" back and ▤ to show the folder beside it.
 */
export function FilesTool({ owner }: { owner: Owner }) {
  const root = useRef<HTMLDivElement>(null)
  const wide = useWide(root)
  const url = useToolParams()
  const file = url.get('file')
  const dir = url.get('dir') ?? ''
  const folder = useFolder(owner, dir, !file && wide === false)
  const openFile = (path: string) => url.set({ file: path })
  // Back to the folder the file is in: the narrow list opens on it, the tree has it open.
  const closeFile = () => url.set({ file: null, dir: file ? parentOf(file) || null : null })

  // Not laid out yet: the open file's frame mounts once, in the layout it will stay in.
  if (wide === null) return <div ref={root} className="flex min-h-0 flex-1 flex-col" />

  const target = { ...owner }
  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col bg-surface-1">
      {!(file && !wide) && <GitLine target={owner} />}
      {!(file && !wide) && <BackupLine owner={owner} />}
      <FolderBrowser
        target={target} top="Files" wide={wide} file={file} onOpenFile={openFile} onClose={closeFile}
        opened={({ back, folderToggle }) => file && (
          <OpenedFile
            file={{ space: 'place', loc: { ...owner, workspaceId: null, taskId: null }, path: file }}
            kind="files" path={file} breadcrumb={['Files', ...parentOf(file).split('/').filter(Boolean)]}
            back={back} folderToggle={folderToggle}
            link={{ tool: url.get('tool'), file }}
            onOpenFile={ref => { if (ref.space === 'place') openFile(ref.path) }}
          />
        )}
        narrowList={(search, found) => (
          <div>
            {search}
            {found ?? <NarrowFolder dir={dir} folder={folder} onDir={d => url.set({ dir: d || null })} onOpenFile={openFile} />}
          </div>
        )}
      />
    </div>
  )
}

/** Narrow, one folder at a time as a list, newest first, with "‹ <folder>" up. */
function NarrowFolder({ dir, folder, onDir, onOpenFile }: {
  dir: string
  folder: ReturnType<typeof useFolder>
  onDir: (dir: string) => void
  onOpenFile: (path: string) => void
}) {
  const rows = newestFirst(visibleEntries(folder.data ?? []))
  const now = new Date()
  const read = useSiteRead(folder, { what: 'This folder' })
  return (
    <>
      {dir && (
        <button type="button" onClick={() => onDir(parentOf(dir))} className={`block min-h-11 w-full border-b border-border-subtle px-4 py-2 text-left text-small ${ROW_ITEM} ${FOCUS_RING_INSET}`}>
          ‹ {dir}
        </button>
      )}
      <ReadNudge read={read} />
      {read.failedWithoutData ? null : !folder.data ? (
        <FilesQuietLine>Loading…</FilesQuietLine>
      ) : rows.length === 0 ? (
        <FilesQuietLine>No files yet. Ask an agent to write one, for example “put this in specs”.</FilesQuietLine>
      ) : (
        rows.map(e => (
          <FileRow
            key={e.name} name={e.name} isDir={e.isDir} meta={kindAndSize(e)} when={changedLabel(e.modifiedAt, now)}
            onOpen={() => (e.isDir ? onDir(joinPath(dir, e.name)) : onOpenFile(joinPath(dir, e.name)))}
          />
        ))
      )}
    </>
  )
}
