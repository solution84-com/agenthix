import { useState } from 'react'
import { useAction, useQuery, listTrustedPublishers, removeTrustedPublisher, renameTrustedPublisher, trustPublisher } from 'wasp/client/operations'
import { refusalText } from '../../../shared/refusal'
import { SettingBlock } from './ChoiceGroup'
import { PublisherForm } from './PublisherForm'
import { publisherLine } from './publisherLine'
import { FIELD as FIELD_LOOK, BUTTON_SECONDARY, FOCUS_RING } from '@agenthix/ui/primitives'
import { ReadFailure, ShowAttention } from '@agenthix/ui/attention'

const SMALL = 'text-small font-medium text-text-secondary not-disabled:hover:text-text-primary disabled:opacity-40'

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
      {error && <ReadFailure what="The publishers" retry={() => void refetch()} />}
      <ul className="mt-2 divide-y divide-border-subtle" data-testid="publishers">
        {(data ?? []).map(p => (
          <li key={p.id ?? p.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
            <span aria-hidden className="w-5 shrink-0 text-center font-mono text-small text-text-muted">{p.kind === 'key' ? 'K' : p.displayName.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1 basis-64">
              {renaming && renaming.id === p.id ? (
                <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); void run(() => rename({ id: renaming.id, displayName: renaming.name })).then(() => setRenaming(null)) }}>
                  <label className="sr-only" htmlFor={`rename-${p.id}`}>Name shown for {p.name}</label>
                  <input id={`rename-${p.id}`} value={renaming.name} maxLength={100} autoFocus onChange={e => setRenaming({ id: renaming.id, name: e.target.value })}
                    className={`min-w-0 flex-1 rounded-lg px-2 py-1 text-body ${FIELD_LOOK}`} />
                  <button type="submit" disabled={state.busy || !renaming.name.trim()} className={SMALL}>Save</button>
                  <button type="button" className={`rounded-lg px-2.5 py-1 text-small ${BUTTON_SECONDARY}`} onClick={() => setRenaming(null)}>Cancel</button>
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
      <ShowAttention kind="alert" text={state.error} title="The publisher was not changed" onClose={() => setState({ busy: false, error: null, message: null })} />
      <button type="button" onClick={() => setAdding(a => !a)} className={`rounded mt-2 text-small font-medium text-link hover:underline ${FOCUS_RING}`}>{adding ? 'Cancel' : 'Add a publisher or a public key…'}</button>
      {adding && <PublisherForm onAdded={message => { setAdding(false); setState({ busy: false, error: null, message }); void refetch() }} />}
    </SettingBlock>
  )
}
