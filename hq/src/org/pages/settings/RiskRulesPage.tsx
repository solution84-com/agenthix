import { useEffect, useState } from 'react'
import { useQuery, useAction, getSiteConfig, updateRiskRules } from 'wasp/client/operations'
import { Plus, Trash2 } from 'lucide-react'
import { OrgAdminHeading, OrgAdminPage } from '../OrgAdminPage'
import { FIELD, Button, NativeSelect } from '@agenthix/ui/primitives'
import { useAttentionWhen, useBackgroundRead } from '@agenthix/ui/attention'

type RiskRule = { pattern: string; riskLevel: string }
const LEVELS = ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'FLAGGED']
const FIELD_CLASS = `rounded-lg ${FIELD} py-1.5 text-body`

/** Organisation › Settings › Tool risk rules, moved as they were. */
export function RiskRulesPage() {
  const query = useQuery(getSiteConfig)
  const config = query.data
  const read = useBackgroundRead(query, { what: 'The tool risk rules' })
  const save = useAction(updateRiskRules)
  const [rules, setRules] = useState<RiskRule[]>([])
  const [error, setError] = useState<string | null>(null)
  const errorDialog = useAttentionWhen(error, { kind: 'alert' })

  useEffect(() => {
    if (config) setRules(Array.isArray(config.riskRules) ? config.riskRules as RiskRule[] : [])
  }, [config])

  const change = (i: number, patch: Partial<RiskRule>) => setRules(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  async function handleSave() {
    setError(null)
    try {
      await save({ rules })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <OrgAdminPage area="settings" title="Tool risk rules">
      <OrgAdminHeading title="Tool risk rules">
        Labels each shell command an agent runs by how risky it looks, for looking back over a run. Your rules
        are checked first, in order, then the built-in ones; the first pattern found anywhere in the command
        decides. A label never allows, asks or blocks anything — an agent's permissions do that.
      </OrgAdminHeading>
      {!config ? (
        read.failedWithoutData ? read.nudge : <p className="text-small text-text-muted">Loading…</p>
      ) : (
      <div className="space-y-3">
        {rules.map((rule, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              value={rule.pattern}
              onChange={e => change(i, { pattern: e.target.value })}
              placeholder="pattern (e.g. rm -rf)"
              aria-label="Pattern"
              className={`flex-1 px-3 font-mono ${FIELD_CLASS}`}
            />
            <NativeSelect value={rule.riskLevel} onChange={e => change(i, { riskLevel: e.target.value })} aria-label="Risk" className="w-32">
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </NativeSelect>
            <button type="button" aria-label="Remove rule" onClick={() => setRules(prev => prev.filter((_, j) => j !== i))} className="text-text-muted hover:text-danger cursor-pointer">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRules(prev => [...prev, { pattern: '', riskLevel: 'MEDIUM' }])}
          className="flex items-center gap-1.5 text-small text-text-muted hover:text-text-secondary cursor-pointer"
        >
          <Plus size={12} /> Add rule
        </button>
        <div className="flex items-center gap-3 pt-1">
          <Button
            type="button"
            onClick={() => void handleSave()}
          >
            Save rules
          </Button>
          {read.nudge}
          {errorDialog}
        </div>
      </div>
      )}
    </OrgAdminPage>
  )
}
