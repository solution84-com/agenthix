import { useQuery, getPlaceSkillVersions, rollBackPlaceSkillVersion } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import { useAct } from './useAct'

type Versions = {
  path: string
  versions: { id: string; number: number; note: string | null; at: string | Date; inFiles: boolean; requestedByAgentId: string | null }[]
}

/** A place skill's versions (FV3), newest first, each with Roll back for those who may. A roll back is the older files as the next version. */
export function SkillHistoryDialog({ placeSkillId, name, mayRollBack, onClose }: {
  placeSkillId: string
  name: string
  mayRollBack: boolean
  onClose: () => void
}) {
  const { data, error: readError } = useQuery(getPlaceSkillVersions, { placeSkillId }, { retry: false })
  const history = data as Versions | undefined
  const { busy, error, run } = useAct()
  const rollBack = async (versionId: string) => {
    const done = await run(() => rollBackPlaceSkillVersion({ placeSkillId, versionId, reason: 'Rolled back from the Skills page' }).then(() => true))
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
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => rollBack(v.id)}>Roll back to {v.number}</Button>
              )}
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
      </div>
    </Modal>
  )
}
