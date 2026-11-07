import { useState } from 'react'
import { useQuery, getPlaceSkillVersions, rollBackPlaceSkillVersion } from 'wasp/client/operations'
import { Button, Modal, Textarea } from '@agenthix/ui/primitives'
import { RETURN_TO_VERSION } from '../asset/skill/skillWords'
import { useAct } from './useAct'

type Versions = {
  path: string
  versions: { id: string; number: number; note: string | null; at: string | Date; inFiles: boolean; requestedByAgentId: string | null }[]
}

/**
 * A place skill's versions (FV3), newest first, each with Return to this version for those who may. Returning is the older files
 * as the next version, and asks why first, as the Library's does (V3): the history records the reason written.
 */
export function SkillHistoryDialog({ placeSkillId, name, mayRollBack, onClose }: {
  placeSkillId: string
  name: string
  mayRollBack: boolean
  onClose: () => void
}) {
  const { data, error: readError } = useQuery(getPlaceSkillVersions, { placeSkillId }, { retry: false })
  const history = data as Versions | undefined
  const { busy, error, run, clear } = useAct()
  const [going, setGoing] = useState<{ id: string; number: number } | null>(null)
  const [reason, setReason] = useState('')
  const rollBack = async (versionId: string) => {
    const why = reason.trim()
    const done = await run(() => rollBackPlaceSkillVersion({ placeSkillId, versionId, ...(why ? { reason: why } : {}) }).then(() => true))
    if (done) onClose()
  }
  return (
    <Modal open onClose={onClose} title={`History of ${name}`} maxWidth="max-w-xl">
      <div className="space-y-3" data-testid="skill-history-dialog">
        {readError && <p role="alert" className="text-small text-danger">{readError.message}</p>}
        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {history?.versions.map((v, i) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="text-body font-medium text-text-primary">Version {v.number}</span>
              {v.inFiles && <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-micro font-medium text-accent">in the files now</span>}
              <span className="min-w-0 flex-1 truncate text-small text-text-muted">
                {[new Date(v.at).toLocaleDateString(), v.requestedByAgentId ? 'asked by an agent' : null, v.note].filter(Boolean).join(' · ')}
              </span>
              {mayRollBack && i > 0 && !v.inFiles && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => { clear(); setReason(''); setGoing({ id: v.id, number: v.number }) }}>{RETURN_TO_VERSION}</Button>
              )}
            </li>
          ))}
        </ul>
        {going && (
          <div className="space-y-2 rounded-lg border border-border-subtle p-3" data-testid="roll-back-confirm">
            <p className="text-small text-text-primary">Version {going.number}’s files are published as the next version, and the agents that work here use them from their next turn.</p>
            <label className="block text-small text-text-secondary">
              Why (optional, kept in the history)
              <Textarea rows={2} value={reason} maxLength={900} onChange={e => setReason(e.target.value)} className="mt-1" />
            </label>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setGoing(null)}>Cancel</Button>
              <Button size="sm" disabled={busy} onClick={() => void rollBack(going.id)}>Go back to version {going.number}</Button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
      </div>
    </Modal>
  )
}
