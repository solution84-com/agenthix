import { useEffect, useState } from 'react'
import { Loader2, Shield, ShieldOff } from 'lucide-react'
import { BUTTON_SECONDARY } from '@agenthix/ui/primitives'
import { useAction, setWorkspaceAllowedTools } from 'wasp/client/operations'
import { FILES_BUTTON } from '@agenthix/ui/projects'
import { listKnownToolNames, ALWAYS_INJECTED_MCP_TOOLS } from '../../shared/mcpTools'
import { ShowAttention } from '@agenthix/ui/attention'

// Stable across renders — the checkbox list order and the filters below all key off this.
const KNOWN_TOOLS = listKnownToolNames()

/** The tools agents may use in one workspace (spec §3, "Change"): off means every tool, on means the ones checked. */
export function WorkspaceToolsForm({ workspaceId, allowedTools, onSaved }: { workspaceId: string; allowedTools: string[] | null; onSaved?: () => void }) {
  const setAllowedTools = useAction(setWorkspaceAllowedTools)
  const [restricted, setRestricted] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  // Seed the form from the workspace's current cap whenever it loads or changes; the id guards against carrying
  // a previous workspace's selection over.
  useEffect(() => {
    setRestricted(allowedTools != null)
    setChecked(new Set(allowedTools ?? []))
    setConfirmEmpty(false)
  }, [workspaceId, allowedTools])

  const toggleRestricted = () => {
    const turningOn = !restricted
    // No saved list yet: start from the always-injected task tools rather than empty, so restricting does not
    // default to locking an agent out of its own task lifecycle. A saved list (even []) is left as loaded.
    if (turningOn && allowedTools == null) {
      const injected = new Set(ALWAYS_INJECTED_MCP_TOOLS)
      setChecked(new Set(KNOWN_TOOLS.filter(t => injected.has(t))))
    }
    setRestricted(turningOn)
    setConfirmEmpty(false)
  }

  const save = async () => {
    setBusy(true); setError(null)
    try {
      await setAllowedTools({ workspaceId, allowedTools: restricted ? KNOWN_TOOLS.filter(t => checked.has(t)) : null })
      setConfirmEmpty(false)
      onSaved?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save tool restriction')
    } finally {
      setBusy(false)
    }
  }
  const emptySave = restricted && checked.size === 0

  return (
    <div className="space-y-2 py-2">
      <p className="text-small text-text-muted">
        A session working in this workspace can only use the tools checked here; sessions working elsewhere in the project are not affected. An empty list blocks every tool. This is a guardrail enforced by the platform's tool check, not isolation — with the shell allowed, an agent can still reach the rest of the project. Restricting below the pre-checked task tools can leave an agent unable to work its own tasks.
      </p>
      <button type="button" onClick={toggleRestricted} className={FILES_BUTTON}>
        {restricted ? <Shield size={12} aria-hidden /> : <ShieldOff size={12} aria-hidden />}
        Restrict tools for sessions working in this workspace
      </button>
      {restricted && (
        <div className="grid max-h-64 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto rounded-lg border border-border p-2.5">
          {KNOWN_TOOLS.map(tool => (
            <label key={tool} className="flex items-center gap-1.5 font-mono text-small text-text-secondary">
              <input
                type="checkbox"
                checked={checked.has(tool)}
                onChange={() => {
                  setChecked(prev => {
                    const next = new Set(prev)
                    if (next.has(tool)) next.delete(tool)
                    else next.add(tool)
                    return next
                  })
                  setConfirmEmpty(false)
                }}
              />
              {tool}
            </label>
          ))}
        </div>
      )}
      {error && <ShowAttention text={error} />}
      {emptySave && confirmEmpty ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setConfirmEmpty(false)} className={`rounded-lg px-2.5 py-1 text-small ${BUTTON_SECONDARY}`}>Cancel</button>
          <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-warning/20 px-3 py-1 text-small font-medium text-warning not-disabled:hover:bg-warning/30 disabled:opacity-40">
            {busy && <Loader2 size={11} className="animate-spin" aria-hidden />} Confirm — blocks every tool
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => (emptySave ? setConfirmEmpty(true) : void save())} disabled={busy} className={FILES_BUTTON}>
          {busy && <Loader2 size={11} className="animate-spin" aria-hidden />}
          {emptySave ? 'Save — blocks every tool' : 'Save'}
        </button>
      )}
    </div>
  )
}
