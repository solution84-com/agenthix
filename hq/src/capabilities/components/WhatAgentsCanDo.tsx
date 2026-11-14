import { useId, useState, type ReactNode } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { MARK_WORDS, WEB_SEARCH_HELP, type Capability, type CapabilityAction, type CapabilityId, type CapabilityMark } from '../capabilityList'

const ACTION_WORDS: Record<CapabilityAction, string> = { change: 'Change', add_key: 'Add a key', add_provider: 'Add a provider' }

const LINK = `rounded shrink-0 text-small font-medium text-link hover:underline ${FOCUS_RING}`

/** ✓, an empty circle, or !; its meaning is read out in place of the sign. */
export function Mark({ mark }: { mark: CapabilityMark }) {
  const look = mark === 'can' ? 'border-success text-success' : mark === 'some' ? 'border-warning text-warning' : 'border-border-strong'
  return (
    <span data-mark={mark} className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-micro font-medium ${look}`}>
      <span aria-hidden>{mark === 'can' ? '✓' : mark === 'some' ? '!' : ''}</span>
      <span className="sr-only">{MARK_WORDS[mark]}</span>
    </span>
  )
}

function Help() {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <>
      <button type="button" aria-expanded={open} aria-controls={id} aria-label="What is a runtime?" onClick={() => setOpen(o => !o)}
        className={`ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-strong text-micro text-text-muted hover:text-text-primary ${FOCUS_RING}`}>?</button>
      {open && <p id={id} className="mt-1 text-small text-text-muted">{WEB_SEARCH_HELP}</p>}
    </>
  )
}

export interface WhatAgentsCanDoProps {
  capabilities: readonly Capability[]
  onAction: (id: CapabilityId, action: CapabilityAction) => void
  /** Where the place offers Add a provider on a line; setup has it in its header instead. */
  offersAddProvider?: boolean
  /** What the place draws under a line, such as the picker Change opens. */
  below?: Partial<Record<CapabilityId, ReactNode>>
  /** The place's own Change, drawn in place of the button: the AI page's model picker and its hearing and speaking pop-ups. */
  changeControls?: Partial<Record<CapabilityId, ReactNode>>
}

/** Each line's element id, which a link to it (`#web-search`) scrolls to. */
export const CAPABILITY_ANCHORS: Record<CapabilityId, string> = { thinking: 'thinking', hearing: 'hearing', speaking: 'speaking', web_search: 'web-search' }

/** Thinking, Hearing, Speaking and Web search, each with its mark, what agents use, and its action. */
export function WhatAgentsCanDo({ capabilities, onAction, offersAddProvider = false, below = {}, changeControls = {} }: WhatAgentsCanDoProps) {
  return (
    <ul className="divide-y divide-border-subtle">
      {capabilities.map(c => {
        const action = c.action === 'add_provider' && !offersAddProvider ? null : c.action
        const control = action === 'change' ? changeControls[c.id] : undefined
        return (
          <li key={c.id} id={CAPABILITY_ANCHORS[c.id]} aria-label={c.name} className="scroll-mt-4 py-2.5">
            <div className="flex items-start gap-3">
              <Mark mark={c.mark} />
              <div className="min-w-0 flex-1">
                <div className="text-body font-medium text-text-primary">
                  {c.name}{c.id === 'web_search' && <Help />}
                </div>
                <p className="text-small text-text-secondary">{c.line}</p>
                {c.runtimes.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {c.runtimes.map(r => (
                      <li key={r.runtime} className="flex justify-between gap-3 text-small">
                        <span className="text-text-secondary">{r.name}</span>
                        <span className={r.ok ? 'text-success' : 'text-text-muted'}>{r.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {control ?? (action && (
                <button type="button" onClick={() => onAction(c.id, action)} aria-label={`${ACTION_WORDS[action]}: ${c.name}`} className={LINK}>
                  {ACTION_WORDS[action]}
                </button>
              ))}
            </div>
            {below[c.id]}
          </li>
        )
      })}
    </ul>
  )
}

/** The short form, for setup's review step: each capability and its mark. */
export function WhatAgentsCanDoShort({ capabilities }: { capabilities: readonly Capability[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {capabilities.map(c => (
        <li key={c.id} className="inline-flex items-center gap-1.5 text-small text-text-secondary">
          <Mark mark={c.mark} />{c.name}
        </li>
      ))}
    </ul>
  )
}
