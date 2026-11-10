import { useEffect, useState } from 'react'
import type { Renderer, RendererProps } from '../../renderer'
import { ViewTabs } from '../ViewControls'

/** Past this an image is not loaded (spec part 6). */
export const IMAGE_LIMIT = 20 * 1024 * 1024

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
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const tooLarge = facts.size > IMAGE_LIMIT

  useEffect(() => {
    if (tooLarge) report({ state: 'failed', reason: 'too-large' })
  }, [tooLarge, report])

  if (tooLarge || failed) return null
  const embedded = mode === 'embedded'
  // Embedded keeps a cap on its height; an opened image fits the view's width and is as tall as it is.
  const size = embedded ? 'max-h-[480px] max-w-full object-contain' : fit ? 'max-w-full' : 'max-w-none shrink-0'
  return (
    <div>
      {!embedded && (
        <div className="mb-3">
          <ViewTabs label="Size" value={fit ? 'fit' : 'full'} onChange={v => setFit(v === 'fit')} tabs={[{ value: 'fit', label: 'Fit' }, { value: 'full', label: '100%' }]} />
        </div>
      )}
      <div style={GROUND} className="flex overflow-auto rounded-md border border-border-subtle [justify-content:safe_center]">
        <img
          src={bytes.link} alt={facts.name} referrerPolicy="no-referrer" decoding="async" className={`block ${size}`}
          style={!embedded && !fit && natural ? { width: natural.width, height: natural.height } : undefined}
          onLoad={e => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget
            if (w > 0 && h > 0) setNatural({ width: w, height: h })
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
