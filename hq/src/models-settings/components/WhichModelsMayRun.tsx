import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useQuery, getModelsSettings } from 'wasp/client/operations'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { AI_ANCHORS } from '../../admin/aiPage'
import { useScrollToHash } from '../../admin/useScrollToHash'
import { ListEditor } from './ListEditor'
import { listLine } from './ListSummary'
import { useModelListSaver } from './saveList'
import { LINK } from './SettingRow'

const TITLE = 'Which models may run'

/**
 * The AI page's last section: the organisation's list, folded to its one line, which most organisations never open.
 * Unfolded, the list editor shows in place. `opened` unfolds it, for a link to the section.
 */
export function WhichModelsMayRun({ opened = false }: { opened?: boolean }) {
  const query = useQuery(getModelsSettings)
  const { data, refetch } = query
  const read = useBackgroundRead(query, { what: 'The model list' })
  const saveList = useModelListSaver('organisation')
  const [open, setOpen] = useState(opened)
  useScrollToHash(data !== undefined)
  useEffect(() => { if (opened) setOpen(true) }, [opened])

  return (
    <section id={AI_ANCHORS.models} aria-label={TITLE} className="scroll-mt-4">
      <h2 className="mb-2 text-h3 font-medium text-text-primary">
        <button type="button" aria-expanded={open} aria-controls="ai-models-list" onClick={() => setOpen(o => !o)}
          className={`inline-flex items-center gap-1 rounded ${FOCUS_RING}`}>
          {TITLE}
          <ChevronRight size={16} aria-hidden className={`text-text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      </h2>
      {!data && (read.failedWithoutData ? read.nudge : <p className="text-small text-text-muted">Loading…</p>)}
      {data && (
        <>
          {read.nudge}
          <p className="text-small text-text-secondary">
            {listLine(data.list)}. Agents, projects and people can narrow it further, never widen it.
            {!open && <>{' '}<button type="button" className={LINK} onClick={() => setOpen(true)}>Edit the list</button></>}
          </p>
          {open && (
            <div id="ai-models-list" className="mt-3 rounded-2xl border border-border-subtle bg-card p-4">
              <ListEditor view={data.list} reachable={data.reachable}
                intro={`For everyone in ${data.orgName}.`}
                save={async d => { await saveList(data.list.ownerId, d); await refetch() }} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
