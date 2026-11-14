import { Modal, FOCUS_RING_INSET, ROW_CHOSEN, ROW_ITEM } from '@agenthix/ui/primitives'

export interface ListeningOption {
  model: string
  label: string
  /** Languages' note and price (where shown), already joined. */
  detail: string
  /** The provider that serves it. */
  via: string
  providerId: string
  /** A plain note about quality, shown under the option it is about. */
  quality: string | null
}

/** Choosing how agents hear people, in a pop-up like the model and the voice (the model chosen decides the provider). */
export function ListeningDialog({ title, current, showVia, options, onClose, onChoose }: {
  title: string
  current: string | null
  /** Names the provider beside each model once there is more than one. */
  showVia: boolean
  options: ListeningOption[]
  onClose: () => void
  onChoose: (option: ListeningOption) => void
}) {
  return (
    <Modal open onClose={onClose} title={title}>
      <ul role="listbox" aria-label="Hearing model" className="space-y-1.5">
        {options.map(o => {
          const chosen = o.model === current
          return (
            <li key={`${o.providerId}:${o.model}`} role="option" aria-selected={chosen} tabIndex={0} onClick={() => onChoose(o)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoose(o) } }}
              className={`cursor-pointer rounded-lg px-3 py-2 ${FOCUS_RING_INSET} ${chosen ? ROW_CHOSEN : ROW_ITEM}`}>
              <span className="block text-small font-medium text-text-primary">{o.label}{showVia ? ` · via ${o.via}` : ''}</span>
              {o.detail && <span className="block text-small text-text-muted">{o.detail}</span>}
              {o.quality && <span className="mt-1 block text-small text-text-muted">{o.quality}</span>}
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
