import { useEffect, useState } from 'react'
import { useQuery, useAction, getSiteConfig, updateRiskRules } from 'wasp/client/operations'
import { Plus, Trash2 } from 'lucide-react'
import { OrgAdminHeading, OrgAdminPage } from '../OrgAdminPage'

type RiskRule = { pattern: string; riskLevel: string }
const LEVELS = ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'FLAGGED']
const FIELD = 'bg-surface-1 border border-border-subtle rounded-lg py-1.5 text-body text-text-primary focus:outline-none focus:border-accent'

/** Organisation › Settings › Tool risk rules, moved as they were. */
export function RiskRulesPage() {
  const { data: config } = useQuery(getSiteConfig)
  const save = useAction(updateRiskRules)
  const [rules, setRules] = useState<RiskRule[]>([])
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (config) setRules(Array.isArray(config.riskRules) ? config.riskRules as RiskRule[] : [])
  }, [config])

  const change = (i: number, patch: Partial<RiskRule>) => setRules(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  async function handleSave() {
    setError(null)
    setSaved(false)
    try {
      await save({ rules })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
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
      <div className="space-y-3">
        {rules.map((rule, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              value={rule.pattern}
              onChange={e => change(i, { pattern: e.target.value })}
              placeholder="pattern (e.g. rm -rf)"
              aria-label="Pattern"
              className={`flex-1 px-3 font-mono ${FIELD}`}
            />
            <select value={rule.riskLevel} onChange={e => change(i, { riskLevel: e.target.value })} aria-label="Risk" className={`px-2 ${FIELD}`}>
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
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
          <button
            type="button"
            onClick={() => void handleSave()}
            className="bg-accent hover:bg-accent/90 text-on-accent px-4 py-2 rounded-lg text-body font-medium transition-colors cursor-pointer"
          >
            Save rules
          </button>
          {saved && <span className="text-success text-body">Saved</span>}
          {error && <span className="text-danger text-body">{error}</span>}
        </div>
      </div>
    </OrgAdminPage>
  )
}
