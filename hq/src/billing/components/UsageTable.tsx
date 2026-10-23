import type { CostBasis } from '@agenthix/core'
import type { ReportGroup, ReportRow, ReportTotal } from '../report'
import { BASIS_ORDER, BASIS_WORDS, callsWords, moneyOf } from './costWords'

const FIRST_COLUMN: Record<ReportGroup, string> = { profile: 'Billing profile', project: 'Project', agent: 'Agent', person: 'Person' }

/** What one basis cell says: an amount for each currency, or the calls when the basis has no amount. */
function cellLines(totals: ReportTotal[], basis: CostBasis): string[] {
  const these = totals.filter(t => t.basis === basis)
  const priced = these.filter(t => t.amountMicros !== null)
  if (priced.length) return priced.map(t => moneyOf(t.amountMicros as number, t.currency))
  const calls = these.reduce((n, t) => n + t.calls, 0)
  return calls ? [callsWords(calls)] : []
}

/** Only the bases that occur appear as columns, so a solo organisation on its own keys sees one. */
export function UsageTable({ rows, group }: { rows: ReportRow[]; group: ReportGroup }) {
  const bases = BASIS_ORDER.filter(b => rows.some(r => r.totals.some(t => t.basis === b)))
  if (rows.length === 0) return <p className="mt-6 rounded-2xl border border-dashed border-border p-6 text-body text-text-secondary">Nothing was used this month.</p>
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-border-subtle">
      <table className="w-full text-left text-body">
        <thead className="bg-surface-1 text-small text-text-secondary">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">{FIRST_COLUMN[group]}</th>
            {group !== 'profile' && <th scope="col" className="px-4 py-2 font-medium">Billing profile</th>}
            {bases.map(b => <th key={b} scope="col" className="px-4 py-2 font-medium">{BASIS_WORDS[b].label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${r.billingProfileId}/${r.key ?? ''}`} className="border-t border-border-subtle align-top">
              <th scope="row" className="px-4 py-2 font-medium text-text-primary">{r.name}</th>
              {group !== 'profile' && <td className="px-4 py-2 text-text-secondary">{r.billingProfileName}</td>}
              {bases.map(b => {
                const lines = cellLines(r.totals, b)
                return (
                  <td key={b} className="px-4 py-2 text-text-primary">
                    {lines.length ? lines.map(l => <div key={l}>{l}</div>) : <span className="text-text-muted">—</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="space-y-1 border-t border-border-subtle bg-surface-1 px-4 py-3 text-small text-text-secondary">
        {bases.map(b => <div key={b}><dt className="inline font-medium text-text-primary">{BASIS_WORDS[b].label}: </dt><dd className="inline">{BASIS_WORDS[b].means}</dd></div>)}
      </dl>
    </div>
  )
}
