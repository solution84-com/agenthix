import { useState } from 'react'
import { useAction, useQuery, listTrustedPublishers, removeTrustedPublisher, renameTrustedPublisher, trustPublisher } from 'wasp/client/operations'
import { RefusedAction } from '../../../shared/components/RefusedAction'
import { refusalText } from '../../../shared/refusal'
import { SettingBlock } from './ChoiceGroup'
import { PublisherForm } from './PublisherForm'
import { publisherLine } from './publisherLine'

const SMALL = 'text-small font-medium text-text-secondary hover:text-text-primary disabled:opacity-50'

/**
 * Trusted publishers (board R2, P1): the signers whose assets install without asking. Agenthix is always on the list.
 * Removing one uninstalls nothing; what it signed stays installed under its name and anything new it signs asks first.
 */
export function TrustedPublishersSection() {
  const { data, error, refetch } = useQuery(listTrustedPublishers)
  const trust = useAction(trustPublisher)
  const remove = useAction(removeTrustedPublisher)
  const rename = useAction(renameTrustedPublisher)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [state, setState] = useState<{ busy: boolean; error: string | null; message: string | null }>({ busy: false, error: null, message: null })

  const run = async (work: () => Promise<{ message: string }>) => {
    setState({ busy: true, error: null, message: null })
    try {
      setState({ busy: false, error: null, message: (await work()).message })
    } catch (err) {
      setState({ busy: false, error: refusalText(err), message: null })
    }
    void refetch()
  }

  return (
    <SettingBlock title="Trusted publishers" intro="Assets they sign install without asking. A signature proves who published something, not that it's safe.">
      {error && <RefusedAction reason={refusalText(error)} />}
      <ul className="mt-2 divide-y divide-border-subtle" data-testid="publishers">
        {(data ?? []).map(p => (
          <li key={p.id ?? p.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
            <span aria-hidden className="w-5 shrink-0 text-center font-mono text-small text-text-muted">{p.kind === 'key' ? 'K' : p.displayName.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1 basis-64">
              {renaming && renaming.id === p.id ? (
                <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); void run(() => rename({ id: renaming.id, displayName: renaming.name })).then(() => setRenaming(null)) }}>
                  <label className="sr-only" htmlFor={`rename-${p.id}`}>Name shown for {p.name}</label>
                  <input id={`rename-${p.id}`} value={renaming.name} maxLength={100} autoFocus onChange={e => setRenaming({ id: renaming.id, name: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-surface-1 px-2 py-1 text-body text-text-primary focus:border-accent focus:outline-none" />
                  <button type="submit" disabled={state.busy || !renaming.name.trim()} className={SMALL}>Save</button>
                  <button type="button" className={SMALL} onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              ) : (
                <p className="text-body font-medium text-text-primary">{p.displayName} <span className="text-small font-normal text-text-muted">{p.name}/…</span></p>
              )}
              <p className="break-words text-small text-text-secondary">{publisherLine(p)}</p>
            </div>
            {p.id && p.kind !== 'built-in' && renaming?.id !== p.id && <button type="button" disabled={state.busy} className={SMALL} onClick={() => setRenaming({ id: p.id!, name: p.displayName })}>Rename</button>}
            {p.status === 'remembered' && <button type="button" disabled={state.busy} className={SMALL} onClick={() => void run(() => trust({ id: p.id! }))}>Trust again</button>}
            {p.removable && <button type="button" disabled={state.busy} className={SMALL} onClick={() => void run(() => remove({ id: p.id! }))}>Remove</button>}
          </li>
        ))}
      </ul>
      <RefusedAction reason={state.error} onDismiss={() => setState({ busy: false, error: null, message: null })} className="mt-2" />
      {state.message && <p role="status" className="mt-2 text-small text-text-secondary">{state.message}</p>}
      <button type="button" onClick={() => setAdding(a => !a)} className="mt-2 text-small font-medium text-accent hover:text-accent-hover">{adding ? 'Cancel' : 'Add a publisher or a public key…'}</button>
      {adding && <PublisherForm onAdded={message => { setAdding(false); setState({ busy: false, error: null, message }); void refetch() }} />}
    </SettingBlock>
  )
}
