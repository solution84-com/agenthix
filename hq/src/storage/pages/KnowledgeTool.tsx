import { useState } from 'react'
import { SearchField, FilterSelect } from '@agenthix/ui/primitives'
import {
  FilesGroupHeading, FilesQuietLine, FilesToolNote, TopicRow, filterTopics, newestFirst, tagsOf, changedLabel,
} from '@agenthix/ui/projects'
import { isSiteUnreachable } from '../../shared/siteSilence'
import { FileOpened } from './FileOpened'
import { useKnowledge, type Owner } from './filesToolData'
import { useToolParams } from './useToolParams'

/**
 * The Knowledge tool (every screen reviewed spec §3): what is known in the place, filed by topic, newest first. A
 * topic opens like a file. It lists what the place's index gives; tags show once they are stored.
 */
export function KnowledgeTool({ owner, personal }: { owner: Owner; personal?: boolean }) {
  const url = useToolParams()
  const path = url.get('topic')
  const list = useKnowledge(owner)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('')

  if (path) {
    const topic = list.data?.find(t => t.path === path)
    return (
      <FileOpened
        kind="knowledge" target={owner} path={path} title={topic?.title}
        entry={topic && { name: topic.path, modifiedAt: topic.modifiedAt }}
        backLabel="Knowledge" onBack={() => url.set({ topic: null })} editPlaceholder
      />
    )
  }

  const topics = list.data ?? []
  const tags = tagsOf(topics)
  const shown = newestFirst(filterTopics(topics, { query, tag }).map(t => ({ ...t, name: t.title })))
  const now = new Date()
  return (
    <div className="bg-surface-1">
      <FilesToolNote>
        {personal
          ? 'What is known in your own space, filed by topic. Only you see it, and it never reaches a project unless you copy it there. Agents look things up here when they need to; nothing here is read on every run.'
          : 'What is known here, filed by topic. Agents look things up here when they need to and add what they learn. Nothing here is read on every run: that is AGENTS.md.'}
      </FilesToolNote>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <SearchField label="Search knowledge" value={query} onChange={setQuery} className="flex-1" />
        <FilterSelect label="Tag" value={tag} onChange={setTag}>
          <option value="">Tag</option>
          {tags.map(t => <option key={t} value={t}>{t}</option>)}
        </FilterSelect>
      </div>
      {list.error ? (
        <FilesQuietLine role="status">
          {isSiteUnreachable(list.error) ? `The site holding these isn't answering. ${list.error.message}` : list.error.message}
        </FilesQuietLine>
      ) : !list.data ? (
        <FilesQuietLine>Loading…</FilesQuietLine>
      ) : (
        <>
          <FilesGroupHeading count={shown.length}>Topics</FilesGroupHeading>
          {shown.length === 0 ? (
            <FilesQuietLine>{query || tag ? 'No topics match.' : 'Nothing is known here yet. Agents add topics as they learn.'}</FilesQuietLine>
          ) : (
            shown.map(t => (
              <TopicRow key={t.path} title={t.title} summary={t.summary} tags={t.tags} when={changedLabel(t.modifiedAt, now)} onOpen={() => url.set({ topic: t.path })} />
            ))
          )}
        </>
      )}
    </div>
  )
}
