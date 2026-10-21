import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@agenthix/ui/primitives'
import { DropDown, Notice } from '../../components'
import { DraftScope, DraftStore } from '../../forms/drafts'
import { setSearchParams, useSearchParam } from '../../router'
import { useShellPanel } from '../../shell/useShellPanel'
import { useFleet } from '../dashboard/useFleet'
import { KindForm } from './KindForm'
import { CHANGE_WORDS, isKind, notOffered, thingFor, thingsOf, type ChangeKind, type Thing } from './things'

/**
 * *Plan maintenance* (board *Changes flow*, proposal), beside the page it was opened from: *Which* and *What*, always
 * there and always changeable, the chosen kind's fields, then *When* and the one button. Nothing starts over: changing
 * What keeps Which, changing Which keeps What when the new thing allows it, and every form keeps what was typed in it
 * while the panel is open. Escape, the close button or a click beside it closes it, leaving the page as it was.
 */
export function PlanMaintenancePanel({ pollMs }: { pollMs?: number }) {
  const { close } = useShellPanel()
  const whichKey = useSearchParam('which')
  const asked = useSearchParam('what')
  const what: ChangeKind | null = isKind(asked) ? asked : null
  const state = useFleet()
  const fleet = state.phase === 'loading' ? null : state.fleet
  const [store] = useState(() => new DraftStore())
  const [cleared, setCleared] = useState<string | null>(null)
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    store.alive = true
    return () => { store.alive = false }
  }, [store])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])
  useEffect(() => { panel.current?.focus() }, [])

  const things = fleet ? thingsOf(fleet) : []
  const thing = fleet && whichKey ? thingFor(things, whichKey, what) : null

  const chooseWhich = (key: string) => {
    const next = things.find(t => t.key === key)
    if (!next) return
    const keep = what !== null && next.changes.includes(what)
    setCleared(what && !keep ? notOffered(next, what) : null)
    // A night belongs to its machine: another Which chooses its own.
    setSearchParams({ which: next.key, what: keep ? what : null, night: null })
  }
  const chooseWhat = (key: string) => {
    setCleared(null)
    setSearchParams({ what: key })
  }

  return (
    <section ref={panel} tabIndex={-1} id="maintenance-panel" role="dialog" aria-label="Plan maintenance" className="flex h-full flex-col outline-none">
      <header className="flex flex-none items-center gap-2 border-b border-border-subtle px-4 py-3">
        <h2 className="flex-1 text-h3 font-semibold text-text-primary">Plan maintenance</h2>
        <button type="button" onClick={close} aria-label="Close Plan maintenance" className="grid size-7 place-items-center rounded-lg text-text-muted hover:bg-surface-hover">
          <X size={15} aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!fleet && state.phase === 'failed' && (
          <Notice tone="danger" action={<Button variant="secondary" onClick={state.refresh}>Try again</Button>}>{state.message}</Notice>
        )}
        {fleet && (
          <div className="flex flex-col gap-3">
            {things.length === 0 && <Notice>Neither HQ nor a site is connected to this Fleet Console yet.</Notice>}
            <DropDown label="Which" placeholder="Choose HQ or a site" findLabel="Find HQ or a site" value={thing?.key ?? null} onChange={chooseWhich}
              options={things.map(t => ({ key: t.key, label: t.name, tag: t.tag === t.name ? undefined : t.tag, hint: t.unavailable ?? undefined }))} />
            {whichKey && !thing && <Notice tone="danger">That is not HQ or a site connected to this Fleet Console.</Notice>}
            <WhatChoice thing={thing} what={what} onChange={chooseWhat} cleared={cleared} />
            {thing && what && thing.changes.includes(what) && (
              <div className="mt-2 border-t border-border-subtle pt-4">
                <DraftScope store={store} prefix={`${thing.key}:${what}`}>
                  <KindForm key={`${thing.key}:${what}`} thing={thing} kind={what} fleet={fleet} pollMs={pollMs} />
                </DraftScope>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function WhatChoice({ thing, what, onChange, cleared }: { thing: Thing | null; what: ChangeKind | null; onChange: (key: string) => void; cleared: string | null }) {
  const offered = thing?.changes ?? []
  const chosen = what && offered.includes(what) ? what : null
  return (
    <div>
      <DropDown label="What" placeholder={thing ? 'Choose what to do' : 'Choose which first'} disabled={!thing} value={chosen} onChange={onChange}
        options={offered.map(c => ({ key: c, label: CHANGE_WORDS[c].label, hint: CHANGE_WORDS[c].hint }))} />
      {cleared && <p className="mt-1.5 text-small text-text-secondary">{cleared}</p>}
      {thing && what && !offered.includes(what) && !cleared && <p className="mt-1.5 text-small text-text-secondary">{`${CHANGE_WORDS[what].label} is not offered for ${thing.name}.`}</p>}
      {thing?.tag === "HQ's site" && <p className="mt-1.5 text-small text-text-secondary">HQ's own site upgrades and moves with HQ: choose HQ for those.</p>}
    </div>
  )
}
