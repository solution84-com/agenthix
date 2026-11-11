import { useState } from 'react'
import { useQuery, getModelList, getProjectModelsLine } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import { ListEditor, type ListDraft } from '../../../models-settings/components/ListEditor'
import { useModelListSaver } from '../../../models-settings/components/saveList'
import { Part, ReadOnlyValue } from './Part'
import { ReadFailure } from '@agenthix/ui/attention'

/**
 * Which models the project may use, for its admins: the organisation's list narrowed, never widened. Every change
 * saves at once and shows nothing when it worked; a failure opens a dialog with Try again. Switching to *Only these*
 * starts with the models its agents use now (the server fills it in), so nothing stops.
 */
export function ModelsSection({ projectId }: { projectId: string }) {
  const { data, error, refetch } = useQuery(getModelList, { owner: 'project', ownerId: projectId })
  const saveList = useModelListSaver('project')
  const [failed, setFailed] = useState<{ message: string; draft: ListDraft } | null>(null)

  if (error) return <ReadFailure what="The model list" error={error} retry={() => void refetch()} />
  if (!data) return <p className="text-small text-text-muted">Loading…</p>

  const save = async (draft: ListDraft) => {
    setFailed(null)
    try {
      await saveList(projectId, draft)
      await refetch()
    } catch (err) {
      setFailed({ message: err instanceof Error ? err.message : 'Could not save the list', draft })
    }
  }
  return (
    <>
      <ListEditor view={data.list} reachable={data.reachable} above={data.orgName}
        intro={`This project can use fewer models than ${data.orgName} allows, never more.`} save={save} />
      <Modal open={failed !== null} onClose={() => setFailed(null)} title="The models weren't changed" maxWidth="max-w-md">
        <p className="text-body text-text-secondary">{failed?.message} Nothing was changed.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setFailed(null)}>Close</Button>
          <Button onClick={() => failed && void save(failed.draft)}>Try again</Button>
        </div>
      </Modal>
    </>
  )
}

/** What a person who may not change the list reads: what is allowed here, in a line. */
export function ModelsLine({ projectId }: { projectId: string }) {
  const { data } = useQuery(getProjectModelsLine, { projectId })
  return (
    <Part label="Allowed here" htmlFor="set-models">
      <ReadOnlyValue id="set-models">{data ?? 'Loading…'}</ReadOnlyValue>
    </Part>
  )
}
