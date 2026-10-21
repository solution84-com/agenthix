import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApprovalCards } from './ApprovalCards'
import { PresetChips } from './PresetChips'
import { ToolGroups } from './ToolGroups'
import {
  ORGANISATION_PRESET, addPattern, applyPreset, detectPreset, isDirty, narrowedCount,
  organisationsPreset, presetsFor, removePattern, setApproval, setGroupState, setPatternState, setToolState,
  toSave, toolsShown, type PermissionsDraft,
} from './permissionsModel'
import { PERMISSION_PRESETS } from '../tabs/permissionPresets'
import type { PermissionsSave } from './permissionsTypes'

const BUTTON = 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 py-1 text-small font-medium text-text-primary hover:bg-surface-hover disabled:opacity-40'
const PRIMARY = 'inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1 text-small font-medium text-on-accent hover:bg-accent-hover disabled:opacity-40'
const DANGER = 'inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1 text-small font-medium text-on-accent hover:bg-danger-hover disabled:opacity-40'

export interface AgentPermissionsViewProps {
  /** The working copy's starting point: the saved permissions at this level. A new one replaces any unsaved change. */
  initial: PermissionsDraft
  agentName: string
  /** A heading over the view, with the narrowed count at its right: "Permissions here", "Your permissions in Chat". */
  title?: string
  /** Read only for anyone who may not change this level. */
  canChange: boolean
  onSave: (next: PermissionsSave) => Promise<void>
  /** Present where the view is an editor opened in place: Cancel closes it. */
  onCancel?: () => void
  /** Said under a view that cannot be changed. */
  readOnlyNote?: string
}

function BypassConfirm({ agentName, busy, onConfirm, onCancel }: { agentName: string; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="alertdialog" aria-label={`Bypass approval for ${agentName}?`} className="rounded-xl border border-danger/40 bg-danger/10 p-4">
      <h4 className="text-body font-semibold text-text-primary">Bypass approval for {agentName}?</h4>
      <p className="mt-1 text-small text-text-secondary">
        Every tool will run, including tools set to Never, and no one will be asked — wherever it runs, unless a project or a person
        sets a stricter approval. Its page and the agents list will show it as bypassed.
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" className={DANGER} disabled={busy} onClick={onConfirm}>Bypass approval</button>
        <button type="button" className={BUTTON} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

/**
 * An agent's permissions (every screen reviewed spec §3): one view at every level. Approval as three cards, a
 * preset, then every tool in groups. Below the organisation each line shows the organisation's setting and offers
 * only that and stricter ones; with approval Bypassed there is no tool list, and saving it asks first.
 */
export function AgentPermissionsView({ initial, agentName, title, canChange, onSave, onCancel, readOnlyNote }: AgentPermissionsViewProps) {
  const [draft, setDraft] = useState(initial)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setDraft(initial); setConfirming(false) }, [initial])

  const narrowing = draft.level === 'narrowing'
  const dirty = useMemo(() => isDirty(draft, initial), [draft, initial])
  const presets = useMemo(() => presetsFor(draft), [draft.level]) // eslint-disable-line react-hooks/exhaustive-deps
  const selectedPreset = useMemo(() => detectPreset(draft), [draft])
  const change = (next: PermissionsDraft) => { setDraft(next); setConfirming(false) }

  const pickPreset = (id: string) => {
    if (id === ORGANISATION_PRESET) return change(organisationsPreset(draft))
    const preset = PERMISSION_PRESETS.find(p => p.id === id)
    if (preset) change(applyPreset(draft, preset))
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await onSave(toSave(draft))
      setConfirming(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }
  const startSave = () => {
    // Saving Bypassed, newly, is the one dangerous choice: it asks first.
    if (draft.approval === 'bypassed' && initial.approval !== 'bypassed' && !narrowing) setConfirming(true)
    else void save()
  }

  const count = narrowedCount(draft)
  let tools: ReactNode
  if (!toolsShown(draft)) {
    tools = (
      <p className="text-small text-text-muted">
        With approval bypassed, every tool runs and no one is asked, so there is no list to set. Choose Deferred or Immediate to set
        each tool to Always, Ask or Never.
      </p>
    )
  } else {
    tools = (
      <>
        <PresetChips presets={presets} selected={selectedPreset} readOnly={!canChange} onPick={pickPreset} />
        {narrowing && <p className="text-micro text-text-muted">A preset never loosens the organisation&apos;s: each tool takes the stricter of the two.</p>}
        <ToolGroups
          draft={draft} readOnly={!canChange}
          onTool={(n, s) => change(setToolState(draft, n, s))}
          onGroup={(g, s) => change(setGroupState(draft, g, s))}
          onPattern={(p, s) => change(setPatternState(draft, p, s))}
          onAddPattern={p => change(addPattern(draft, p))}
          onRemovePattern={p => change(removePattern(draft, p))}
        />
      </>
    )
  }

  return (
    <div className="space-y-4" data-testid="agent-permissions">
      {(title || narrowing) && (
        <h4 className="flex items-center justify-between text-micro font-medium uppercase tracking-wide text-text-muted">
          <span>{title}</span>
          {narrowing && <span className="normal-case tracking-normal" data-testid="narrowed-count">{count === 0 ? 'Nothing narrowed' : `${count} narrowed`}</span>}
        </h4>
      )}
      <ApprovalCards
        value={draft.approval} limit={draft.approvalLimit} organisation={draft.organisationApproval}
        narrowed={narrowing && draft.approval !== draft.approvalLimit} readOnly={!canChange}
        onChange={a => change(setApproval(draft, a))}
      />
      {tools}
      {confirming && <BypassConfirm agentName={agentName} busy={busy} onConfirm={() => void save()} onCancel={() => setConfirming(false)} />}
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      {!canChange && readOnlyNote && <p className="text-micro text-text-muted">{readOnlyNote}</p>}
      {canChange && !confirming && (dirty || onCancel) && (
        <div className="flex gap-2">
          <button type="button" className={PRIMARY} disabled={busy || !dirty} onClick={startSave}>Save</button>
          <button type="button" className={BUTTON} onClick={() => { change(initial); onCancel?.() }}>Cancel</button>
        </div>
      )}
    </div>
  )
}
