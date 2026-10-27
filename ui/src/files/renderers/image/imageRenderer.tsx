import { useEffect, useState } from 'react'
import type { Renderer, RendererProps } from '../../renderer'

/** Past this an image is not loaded (spec part 6). */
export const IMAGE_LIMIT = 20 * 1024 * 1024

const TAB = 'rounded-md px-2.5 py-1 text-small'
// A checkered ground, so transparency shows. Its tint is a token and the squares sit on the page's own surface.
const GROUND = {
  backgroundColor: 'var(--color-surface-1)',
  backgroundImage:
    'conic-gradient(var(--color-checker) 25%, transparent 0 50%, var(--color-checker) 0 75%, transparent 0)',
  backgroundSize: '16px 16px',
} as const

/**
 * An image is drawn as an `<img>` from the relay's preview link and never fetched here: the relay sends it as
 * cross-origin readable, and an SVG is only ever an image, so any script in it never runs.
 */
function ImageView({ facts, bytes, mode, report, fact }: RendererProps) {
  const [fit, setFit] = useState(true)
  const [failed, setFailed] = useState(false)
  const tooLarge = facts.size > IMAGE_LIMIT

  useEffect(() => {
    if (tooLarge) report({ state: 'failed', reason: 'too-large' })
  }, [tooLarge, report])

  if (tooLarge || failed) return null
  const embedded = mode === 'embedded'
  const size = fit || embedded ? 'max-h-[480px] max-w-full object-contain' : ''
  return (
    <div>
      {!embedded && (
        <div role="tablist" aria-label="Size" className="mb-3 flex gap-1">
          {([['Fit', true], ['100%', false]] as const).map(([label, value]) => (
            <button
              key={label} type="button" role="tab" aria-selected={fit === value} onClick={() => setFit(value)}
              className={`${TAB} ${fit === value ? 'bg-selected text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div style={GROUND} className={`rounded-md border border-border-subtle ${fit || embedded ? 'flex justify-center' : 'overflow-auto'}`}>
        <img
          src={bytes.link} alt={facts.name} referrerPolicy="no-referrer" decoding="async" className={`block ${size}`}
          onLoad={e => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget
            if (w > 0 && h > 0) fact(`${w.toLocaleString('en-GB')} × ${h.toLocaleString('en-GB')}`)
            report({ state: 'ready' })
          }}
          onError={() => { setFailed(true); report({ state: 'failed', reason: 'unreadable' }) }}
        />
      </div>
    </div>
  )
}

export const imageRenderer: Renderer = {
  id: 'image',
  kinds: ['image'],
  runs: 'page',
  previewLimit: IMAGE_LIMIT,
  embeds: true,
  render: props => <ImageView {...props} />,
}
