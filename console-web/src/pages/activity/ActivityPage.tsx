/**
 * Activity (board *Every action recorded against a person*): the record of everything done here and at the command
 * line, and who did it, newest first. It is HQ's, kept for a year, and nobody can edit it: the Fleet Console shows what
 * HQ says, and nothing when HQ does not say. It is read only — the notices, which are dismissed, are the bell's.
 */
import { useMemo, useState } from 'react'
import { Button, EmptyState, FilterSelect, StatePill } from '@agenthix/ui/primitives'
import { Card, ListTitleRow, Notice } from '../../components'
import { useFleet } from '../dashboard/useFleet'
import { whenIs } from '../dashboard/words'
import { KINDS, matches, NO_FILTER, whoOptions, type ActivityFilter, type ActivityKind } from './filters'
import { useActivity } from './useActivity'
import { activityLine, whoDid } from './words'

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function ActivityPage() {
  const record = useActivity()
  const fleet = useFleet()
  const hosts = useMemo(() => {
    const all = fleet.phase === 'loading' ? [] : fleet.fleet?.hosts ?? []
    return [...all].sort((a, b) => Number(b.hqMachine) - Number(a.hqMachine) || a.machineName.localeCompare(b.machineName))
  }, [fleet])
  const [filter, setFilter] = useState<ActivityFilter>(NO_FILTER)
  const now = new Date()
  const entries = record.entries ?? []
  const shown = entries.filter(e => matches(e, filter, hosts)).sort((a, b) => b.at.localeCompare(a.at))
  const filtered = filter.who !== '' || filter.where !== '' || filter.kind !== ''
  const set = (change: Partial<ActivityFilter>) => setFilter(f => ({ ...f, ...change }))

  return (
    <div className="max-w-4xl">
      <ListTitleRow title="Activity" lede="Everything done here and at the command line, and who did it, newest first. Kept in HQ for a year; nobody can edit it." />

      {record.problem && (
        <Notice tone={record.problem.code === 'hq_too_old' ? 'neutral' : 'warning'} title={record.problem.code === 'hq_too_old' ? 'HQ does not keep the record yet' : 'The record could not be read'}
          action={record.problem.code === 'hq_too_old' ? undefined : <Button variant="secondary" onClick={record.reload}>Try again</Button>}>
          {record.problem.message}
        </Notice>
      )}
      {record.entries && record.entries.length > 0 && (
        <div role="group" aria-label="Find in the record" className="mb-3 flex flex-wrap items-center gap-2">
          <FilterSelect label="Who" value={filter.who} onChange={who => set({ who })}>
            <option value="">Anyone</option>
            {whoOptions(entries).map(name => <option key={name} value={name}>{name}</option>)}
          </FilterSelect>
          <FilterSelect label="Done to" value={filter.where} onChange={where => set({ where })}>
            <option value="">HQ and every site</option>
            <option value="hq">HQ</option>
            {hosts.map(h => <option key={h.fingerprint} value={h.fingerprint}>{h.machineName}</option>)}
          </FilterSelect>
          <FilterSelect label="Kind" value={filter.kind} onChange={kind => set({ kind: kind as '' | ActivityKind })}>
            <option value="">Every kind</option>
            {(Object.keys(KINDS) as ActivityKind[]).map(k => <option key={k} value={k}>{KINDS[k]}</option>)}
          </FilterSelect>
          {filtered && <Button variant="secondary" size="sm" onClick={() => setFilter(NO_FILTER)}>Show everything</Button>}
        </div>
      )}
      {record.entries && (record.entries.length === 0
        ? <EmptyState title="Nothing has been done here yet." hint="Each sign-in, site added, command and change of role is recorded here." />
        : shown.length === 0
          ? <EmptyState variant="inline" title="Nothing in the record so far matches." hint={record.next ? 'Show earlier to look further back.' : undefined} />
          : (
            <Card>
              <ul aria-label="What was done">
                {shown.map(e => {
                  const who = whoDid(e.by)
                  return (
                    <li key={e.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-border-subtle py-2 text-small first:border-t-0">
                      <time dateTime={e.at} className="font-mono text-micro text-text-muted">{capital(whenIs(e.at, now))}</time>
                      <div className="min-w-0">
                        <p className="text-text-primary"><b className="font-semibold">{who.name}</b> {activityLine(e.action)}</p>
                        <p className="text-micro text-text-secondary">{e.subject}</p>
                      </div>
                      {who.commandLine ? <StatePill>command line</StatePill> : <span />}
                    </li>
                  )
                })}
              </ul>
            </Card>
          ))}
      {record.next && (
        <div className="mt-3">
          <Button variant="secondary" disabled={record.loadingMore} onClick={record.more}>Show earlier</Button>
        </div>
      )}
    </div>
  )
}
