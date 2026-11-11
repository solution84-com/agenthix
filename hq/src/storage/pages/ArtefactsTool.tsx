import { useState } from 'react'
import { SearchField } from '@agenthix/ui/primitives'
import {
  FileRow, FilesGroupHeading, FilesQuietLine, FilesToolNote, filterByName, groupByRecency, kindAndSize, newestFirst, changedLabel,
} from '@agenthix/ui/projects'
import { isSiteUnreachable } from '../../shared/siteSilence'
import { OpenedFile } from './OpenedFile'
import { useArtefacts, type Owner } from './filesToolData'
import { useToolParams } from './useToolParams'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * The Artefacts tool (every screen reviewed spec §3): the throwaway things agents made in conversations, newest
 * first in Today · This week · Older. One opens in the same viewer as a file; an agent's link opens it here too.
 */
export function ArtefactsTool({ owner }: { owner: Owner }) {
  const url = useToolParams()
  const name = url.get('artefact')
  const list = useArtefacts(owner)
  const [query, setQuery] = useState('')

  if (name) {
    return (
      <OpenedFile
        file={{ space: 'artefact', owner, name }}
        kind="artefacts" path={name} breadcrumb={['Artefacts']}
        back={{ label: 'Artefacts', onBack: () => url.set({ artefact: null }) }}
        link={{ tool: url.get('tool'), artefact: name }}
        onOpenFile={ref => { if (ref.space === 'artefact') url.set({ artefact: ref.name }) }}
      />
    )
  }

  const now = new Date()
  const groups = groupByRecency(newestFirst(filterByName(list.data ?? [], query)), now)
  return (
    <div className="bg-surface-1">
      <FilesToolNote>The throwaway things agents made in conversations, newest first. Keep one by asking an agent to move it into Files.</FilesToolNote>
      <div className="flex px-4 py-2.5">
        <SearchField label="Search artefacts" value={query} onChange={setQuery} className="flex-1" />
      </div>
      {list.error ? (
        <ShowAttention title="The artefacts could not be read"
          text={isSiteUnreachable(list.error) ? `The site holding these isn't answering. ${list.error.message}` : list.error.message} />
      ) : !list.data ? (
        <FilesQuietLine>Loading…</FilesQuietLine>
      ) : groups.length === 0 ? (
        <FilesQuietLine>{query ? `Nothing matches “${query}”.` : 'No artefacts yet. They appear when an agent makes something for you in a conversation.'}</FilesQuietLine>
      ) : (
        groups.map(g => (
          <section key={g.label} aria-label={g.label}>
            <FilesGroupHeading count={g.entries.length}>{g.label}</FilesGroupHeading>
            {g.entries.map(e => (
              <FileRow key={e.name} name={e.name} meta={kindAndSize(e)} when={changedLabel(e.modifiedAt, now)} onOpen={() => url.set({ artefact: e.name })} />
            ))}
          </section>
        ))
      )}
    </div>
  )
}
