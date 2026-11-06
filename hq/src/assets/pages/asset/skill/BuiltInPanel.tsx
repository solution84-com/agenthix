import { useState } from 'react'
import { useAction, setBuiltInSkillSwitch } from 'wasp/client/operations'
import type { Attention } from '../../../../shared/components/AttentionDialog'
import { refusalText } from '../../../../shared/refusal'
import { WorkflowSwitch } from '../../../../workflows/components/WorkflowSwitch'

/**
 * Who uses a built-in skill (owner's area 8 walk, finding 4): every agent while it is on, none while it is off, and
 * nothing in between. The one switch is an administrator's; anyone else reads the state.
 */
export function BuiltInPanel({ title, assetId, on, may, refetch, onFailed }: {
  title: string
  assetId: string
  on: boolean
  may: boolean
  refetch: () => unknown
  onFailed: (attention: Attention) => void
}) {
  const set = useAction(setBuiltInSkillSwitch)
  const [busy, setBusy] = useState(false)
  const flip = async (next: boolean): Promise<void> => {
    setBusy(true)
    try {
      await set({ assetId, on: next })
    } catch (err) {
      onFailed({ title: 'The switch did not change', text: refusalText(err), retry: () => void flip(next) })
    }
    setBusy(false)
    void refetch()
  }
  return (
    <div className="space-y-2 p-2" data-testid="asset-holders">
      <p className="text-small font-semibold text-text-primary">{on ? `Every agent uses ${title}` : `No agent uses ${title}`}</p>
      <p className="text-micro text-text-muted">Built in to HQ: it is on for every agent or for none.</p>
      {may ? (
        <div className="flex items-center gap-2 text-small text-text-primary">
          <span className="flex-1">On for every agent</span>
          <WorkflowSwitch on={on} label="On for every agent" busy={busy} onToggle={() => void flip(!on)} />
        </div>
      ) : (
        <p className="text-small text-text-secondary">{on ? 'It is on for every agent.' : 'It is switched off for every agent.'} Switching it is for administrators.</p>
      )}
    </div>
  )
}
