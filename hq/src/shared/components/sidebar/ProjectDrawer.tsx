import { BUTTON_GHOST, FOCUS_RING } from '@agenthix/ui/primitives'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, X } from 'lucide-react'
import type { PlaceNav } from '../../layouts/placeNavTypes'
import { FindProjectList } from './FindProject'
import { PlaceNavAvatar, PlaceSections } from './PlacePanel'
import { switchesProject } from './projectChoices'

const ICON_BUTTON = `flex items-center justify-center p-1.5 rounded-lg ${BUTTON_GHOST}`

/**
 * On a phone, a place's menu as a drawer from the right: its name ▾ on top, then every section, the one shown lit.
 * The name brings up Find a project in the same drawer (the second and last layer), with ‹ back to the sections.
 * Esc, ✕ or a tap outside closes it.
 */
export function ProjectDrawer({ nav, onClose }: { nav: PlaceNav; onClose: () => void }) {
  const [finding, setFinding] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const close = <button type="button" onClick={onClose} aria-label="Close" className={ICON_BUTTON}><X size={16} /></button>

  return (
    <>
      <div data-testid="project-drawer-backdrop" onClick={onClose} className="fixed inset-0 z-30 bg-scrim lg:hidden" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={finding ? 'Find a project' : `${nav.name} menu`}
        className="fixed inset-y-0 right-0 z-40 flex w-72 max-w-[85vw] flex-col bg-surface-0 border-l border-border-subtle shadow-pop lg:hidden"
      >
        {finding ? (
          <>
            <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
              <button type="button" onClick={() => setFinding(false)} aria-label={`Back to ${nav.name}'s menu`} className={ICON_BUTTON}><ChevronLeft size={16} /></button>
              <span className="flex-1 text-body font-medium text-text-primary">Find a project</span>
              {close}
            </div>
            <FindProjectList nav={nav} onChoose={onClose} />
          </>
        ) : (
          <>
            <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
              {switchesProject(nav) ? (
                <button
                  type="button"
                  onClick={() => setFinding(true)}
                  aria-label={`${nav.name}, find a project`}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING}`}
                >
                  <PlaceNavAvatar nav={nav} size="sm" />
                  <span className="min-w-0 truncate text-body font-medium text-text-primary">{nav.name}</span>
                  <ChevronDown size={14} aria-hidden className="shrink-0 text-text-muted" />
                </button>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-2 px-1">
                  <PlaceNavAvatar nav={nav} size="sm" />
                  <span className="min-w-0 truncate text-body font-medium text-text-primary">{nav.name}</span>
                </span>
              )}
              {close}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              <PlaceSections nav={nav} collapsed={false} onNavigate={onClose} />
            </div>
          </>
        )}
      </div>
    </>
  )
}
