import { useCallback, useState, type ReactNode } from 'react'
import { useAction, updateRoutine, runRoutineNow, deleteRoutine } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import { useAttention } from '../../shared/components/AttentionDialog'
import { refusalText } from '../../shared/refusal'
import { askWords, nextRunLine, savingAsks, type Changeable, type Me, type RoutinePatch } from './routineWords'

export type { RoutinePatch } from './routineWords'

type Asking = { title: string; text: string; next: string; go: () => Promise<boolean>; resolve: (saved: boolean) => void }

/** Saving asks first (N6): only when the change moves whose behalf the routine runs on. Its one filled button saves. */
function SaveAsksDialog({ asking, onDone }: { asking: Asking; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const close = (saved: boolean) => { asking.resolve(saved); onDone() }
  return (
    <Modal open onClose={() => close(false)} title="Save this change?">
      <p className="text-body text-text-secondary">{asking.text}</p>
      <p className="mt-2 text-body text-text-secondary">{asking.next}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => close(false)}>Cancel</Button>
        <Button type="button" disabled={busy} onClick={() => { setBusy(true); void asking.go().then(close) }}>Save</Button>
      </div>
    </Modal>
  )
}

/**
 * A routine's acts, the same on its card and its page: a change (switching on or off included) asks first when it
 * would move whose behalf the routine runs on; Run now is one run on behalf of whoever pressed it; Delete. A refusal
 * opens the centred dialog with why; a result the screen shows gets no message.
 */
export function useRoutineActs({ me, refetch }: { me: Me; refetch?: () => unknown }): {
  change: (r: Changeable, patch: RoutinePatch) => Promise<boolean>
  runNow: (r: Changeable) => Promise<boolean>
  remove: (r: Changeable) => Promise<boolean>
  busyId: string | null
  dialog: ReactNode
} {
  const update = useAction(updateRoutine)
  const run = useAction(runRoutineNow)
  const del = useAction(deleteRoutine)
  const attention = useAttention()
  const [asking, setAsking] = useState<Asking | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const perform = useCallback(async (id: string, title: string, fn: () => Promise<unknown>): Promise<boolean> => {
    setBusyId(id)
    try {
      await fn()
      await refetch?.()
      return true
    } catch (e) {
      attention.show({ title, text: refusalText(e, 'That did not work. Nothing was changed.') })
      return false
    } finally {
      setBusyId(null)
    }
  }, [attention, refetch])

  const change = useCallback((r: Changeable, patch: RoutinePatch): Promise<boolean> => {
    const go = () => perform(r.id, `${r.title} was not changed`, () => update({ routineId: r.id, ...patch }))
    if (!savingAsks(r, me)) return go()
    return new Promise(resolve => setAsking({ title: r.title, text: askWords(r, me), next: nextRunLine(r, patch, new Date()), go, resolve }))
  }, [me, perform, update])

  const runNow = useCallback((r: Changeable) => perform(r.id, `${r.title} did not run`, async () => {
    const result = await run({ routineId: r.id })
    if (result.state === 'FAILED' || result.state === 'SKIPPED') throw new Error(result.reason ?? 'It did not start.')
  }), [perform, run])

  const remove = useCallback((r: Changeable) => perform(r.id, `${r.title} was not deleted`, () => del({ routineId: r.id })), [perform, del])

  return {
    change, runNow, remove, busyId,
    dialog: (
      <>
        {asking && <SaveAsksDialog asking={asking} onDone={() => setAsking(null)} />}
        {attention.dialog}
      </>
    ),
  }
}
