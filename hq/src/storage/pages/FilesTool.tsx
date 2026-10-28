import { useRef, useState } from 'react'
import { SearchField } from '@agenthix/ui/primitives'
import {
  FileRow, FilesQuietLine, filterByName, joinPath, kindAndSize, newestFirst, parentOf, changedLabel, visibleEntries,
} from '@agenthix/ui/projects'
import { isSiteUnreachable } from '../../shared/siteSilence'
import { BackupLine } from './BackupLine'
import { GitLine } from './GitLine'
import { OpenedFile } from './OpenedFile'
import { FolderTree } from './FolderTree'
import { useFolder, type Owner } from './filesToolData'
import { useToolParams, useWide } from './useToolParams'

/**
 * The Files tool (every screen reviewed spec §3): the place's documents, newest first, with their git status (when
 * `files/` is a repository) and the GitHub backup each on one line above them. A file opens inside the tool; wide,
 * the folders sit beside the open file.
 */
export function FilesTool({ owner }: { owner: Owner }) {
  const root = useRef<HTMLDivElement>(null)
  const wide = useWide(root)
  const url = useToolParams()
  const file = url.get('file')
  const dir = url.get('dir') ?? ''
  const [query, setQuery] = useState('')
  const folder = useFolder(owner, dir)
  const siblings = useFolder(owner, parentOf(file ?? ''), !!file)
  const entry = file ? siblings.data?.find(e => e.name === file.split('/').pop()) : undefined
  const openFile = (path: string | null) => url.set({ file: path })

  const opened = file && (
    <OpenedFile
      file={{ space: 'place', loc: { ...owner, workspaceId: null, taskId: null }, path: file }}
      kind="files" path={file} entry={entry} breadcrumb={['Files', ...parentOf(file).split('/').filter(Boolean)]}
      backLabel="Files" onBack={() => openFile(null)} layout={wide ? 'wide' : 'narrow'}
      link={{ tool: url.get('tool'), file }}
      onOpenFile={ref => { if (ref.space === 'place') openFile(ref.path) }}
    />
  )
  const search = (
    <div className="flex px-4 py-2.5">
      <SearchField label="Search files" value={query} onChange={setQuery} className="flex-1" />
    </div>
  )

  if (wide) {
    return (
      <div ref={root} className="flex min-h-0 flex-1 flex-col bg-surface-1">
        <GitLine target={owner} />
        <BackupLine owner={owner} />
        <div className="flex min-h-0 flex-1">
          <div className="w-64 shrink-0 overflow-y-auto border-r border-border-subtle">
            {search}
            <FolderTree target={owner} query={query} selected={file} onOpenFile={openFile} />
          </div>
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            {opened || <FilesQuietLine>Select a file to read it.</FilesQuietLine>}
          </section>
        </div>
      </div>
    )
  }

  if (file) return <div ref={root} className="flex min-h-0 flex-1 flex-col">{opened}</div>

  const rows = newestFirst(filterByName(visibleEntries(folder.data ?? []), query))
  const now = new Date()
  const silent = isSiteUnreachable(folder.error)
  return (
    <div ref={root} className="bg-surface-1">
      <GitLine target={owner} />
      <BackupLine owner={owner} />
      {search}
      {dir && (
        <button type="button" onClick={() => url.set({ dir: parentOf(dir) || null })} className="block w-full border-b border-border-subtle px-4 py-2 text-left text-small text-accent hover:bg-surface-hover">
          ‹ {dir}
        </button>
      )}
      {silent ? (
        <FilesQuietLine role="status">The site holding these files isn't answering. {folder.error?.message}</FilesQuietLine>
      ) : folder.error ? (
        <FilesQuietLine role="status">Could not list this folder: {folder.error.message}</FilesQuietLine>
      ) : !folder.data ? (
        <FilesQuietLine>Loading…</FilesQuietLine>
      ) : rows.length === 0 ? (
        <FilesQuietLine>{query ? `No files match “${query}”.` : 'No files yet. Ask an agent to write one, for example “put this in specs”.'}</FilesQuietLine>
      ) : (
        rows.map(e => (
          <FileRow
            key={e.name}
            name={e.name}
            isDir={e.isDir}
            meta={kindAndSize(e)}
            when={changedLabel(e.modifiedAt, now)}
            onOpen={() => (e.isDir ? url.set({ dir: joinPath(dir, e.name) }) : openFile(joinPath(dir, e.name)))}
          />
        ))
      )}
    </div>
  )
}
