/**
 * The picker's own drawings: a recipe drawn in the browser by the same registry the server draws with, a saved
 * picture, a chosen file under its frame, or initials. A drawing is shown as an <img> of an SVG data URL, so nothing in
 * it runs; a robot is its picture placed on its background as the server places it (116 %, a little low).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { INITIALS_MARK } from '@agenthix/ui/primitives'
import { AuthedImg } from '../../components/AuthedImg'
import { drawRecipe } from '../pictures'
import type { PictureContext, PictureKind, PictureRecipe } from '../recipe'
import type { PictureFill } from '../styles/types'
import { robotUrl } from './robotFiles'
import type { CropArea, Shown } from './pickerState'

type Drawn = { type: 'svg'; src: string } | { type: 'robot'; src: string; background: PictureFill; flip: boolean } | { type: 'failed' }

/** Draws a recipe in the browser; null while it is being drawn. A recipe the registry refuses is drawn as nothing. */
export function useDrawing(recipe: PictureRecipe | null, kind: PictureKind, ctx: PictureContext): Drawn | null {
  const [drawn, setDrawn] = useState<Drawn | null>(null)
  const key = recipe ? JSON.stringify(recipe) : ''
  const ctxKey = `${ctx.subject.kind}|${ctx.subject.name}|${ctx.subject.isKernel ? 1 : 0}|${(ctx.robots ?? []).length}`
  useEffect(() => {
    if (!recipe) { setDrawn(null); return }
    let live = true
    drawRecipe(recipe, kind, ctx).then(
      drawing => {
        if (!live) return
        if (drawing.type === 'svg') {
          setDrawn({ type: 'svg', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawing.svg)}` })
        } else {
          const src = robotUrl(drawing.name)
          setDrawn(src ? { type: 'robot', src, background: drawing.background, flip: drawing.flip } : { type: 'failed' })
        }
      },
      () => { if (live) setDrawn({ type: 'failed' }) },
    )
    return () => { live = false }
    // The recipe and the subject are compared by value: a caller builds them afresh on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind, ctxKey])
  return drawn
}

function fillOf(background: PictureFill): string {
  const [a, b] = background.colours
  // The server draws a two-colour background at 45° from the top-left corner: 135° as CSS reads an angle.
  return b === undefined ? `#${a}` : `linear-gradient(135deg, #${a}, #${b})`
}

const FILL = 'absolute inset-0 h-full w-full'

export function DrawnImage({ drawn }: { drawn: Drawn | null }) {
  if (!drawn || drawn.type === 'failed') return <span className={`${FILL} bg-surface-2`} />
  if (drawn.type === 'svg') return <img src={drawn.src} alt="" className={`${FILL} object-cover`} />
  return (
    <span className={`${FILL} overflow-hidden`} style={{ background: fillOf(drawn.background) }}>
      <img
        src={drawn.src} alt=""
        className="absolute max-w-none"
        style={{ left: '-8%', top: '-2%', width: '116%', height: '116%', transform: drawn.flip ? 'scaleX(-1)' : undefined }}
      />
    </span>
  )
}

export function RecipeImage({ recipe, kind, ctx }: { recipe: PictureRecipe; kind: PictureKind; ctx: PictureContext }) {
  return <DrawnImage drawn={useDrawing(recipe, kind, ctx)} />
}

/** A chosen file shown as its frame will cut it. */
function CroppedImage({ url, area }: { url: string; area: CropArea | null }) {
  if (!area) return <img src={url} alt="" className={`${FILL} object-cover`} />
  return (
    <span className={`${FILL} overflow-hidden`}>
      <img
        src={url} alt="" className="absolute max-w-none"
        style={{
          width: `${10000 / area.width}%`, height: `${10000 / area.height}%`,
          left: `${(-area.x * 100) / area.width}%`, top: `${(-area.y * 100) / area.height}%`,
        }}
      />
    </span>
  )
}

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

/** What a tab shows in the preview: the look being made, a chosen file, the saved picture, or initials. */
export function ShownPicture({ shown, kind, ctx, fallback }: { shown: Shown; kind: PictureKind; ctx: PictureContext; fallback?: ReactNode }) {
  switch (shown.type) {
    case 'recipe':
      return <RecipeImage recipe={shown.recipe} kind={kind} ctx={ctx} />
    case 'upload':
      return <CroppedImage url={shown.url} area={shown.area} />
    case 'saved':
      return (
        <>
          {fallback}
          <AuthedImg src={shown.url} size={kind === 'cover' ? 'full' : 'small'} className={`${FILL} object-cover`} />
        </>
      )
    case 'none':
      return kind === 'avatar'
        ? <span className={`${FILL} flex items-center justify-center ${INITIALS_MARK} text-h2`}>{initialsOf(ctx.subject.name)}</span>
        : <span className={`${FILL} bg-surface-3`} />
  }
}
