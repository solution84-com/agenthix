/**
 * The Avatar tab's gallery (boards/picker-gallery.html, proposal B): every look this subject may use, drawn large on
 * its own name, under its category's heading, the saved one marked Current. Choosing a look opens its fine-tuning.
 */
import { useEffect, useState } from 'react'
import { CARD_CHOSEN, FOCUS_RING } from '@agenthix/ui/primitives'
import { randomRecipe } from '../pictures'
import type { PictureContext, PictureRecipe } from '../recipe'
import { CATEGORY_ORDER, stylesFor, type PictureStyle, type StyleCategory } from '../styles'
import { RecipeImage } from './PictureView'
import { Heading } from './pickerParts'

const CATEGORY_LABEL: Record<StyleCategory, string> = {
  robots: 'Robots', faces: 'Faces', symbols: 'Symbols', initials: 'Initials', cover: 'Covers',
}

/** Each style's look on this subject: the draft for the style it is in, otherwise one drawn from the subject's name. */
function useTiles(styles: PictureStyle[], ctx: PictureContext, draft: PictureRecipe | null): Map<string, PictureRecipe> {
  const [tiles, setTiles] = useState(new Map<string, PictureRecipe>())
  const ids = styles.map(s => s.id).join(',')
  useEffect(() => {
    let live = true
    void Promise.all(styles.map(s => randomRecipe(s.id, `${s.id}:${ctx.subject.name}`, ctx).then(r => [s.id, r] as const, () => null)))
      .then(pairs => { if (live) setTiles(new Map(pairs.filter((p): p is readonly [string, PictureRecipe] => p !== null))) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, ctx.subject.name])
  if (!draft) return tiles
  const withDraft = new Map(tiles)
  withDraft.set(draft.style, draft)
  return withDraft
}

export function AvatarGallery({ ctx, draft, chosenStyle, savedStyle, round, onChoose }: {
  ctx: PictureContext
  draft: PictureRecipe | null
  /** The look being made, marked as chosen. */
  chosenStyle: string | null
  /** The saved look, labelled Current. */
  savedStyle: string | null
  round: boolean
  onChoose: (recipe: PictureRecipe) => void
}) {
  const styles = stylesFor('avatar', ctx)
  const tiles = useTiles(styles, ctx, draft)
  const groups = CATEGORY_ORDER.map(c => ({ category: c, styles: styles.filter(s => s.category === c) })).filter(g => g.styles.length > 0)
  return (
    <div>
      {groups.map(group => (
        <section key={group.category} aria-label={CATEGORY_LABEL[group.category]}>
          <Heading>{CATEGORY_LABEL[group.category]}</Heading>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2.5">
            {group.styles.map(style => {
              const recipe = tiles.get(style.id)
              const on = style.id === chosenStyle
              return (
                <button
                  key={style.id} type="button" aria-pressed={on} disabled={!recipe}
                  onClick={() => recipe && onChoose(recipe)}
                  className={`rounded-xl border border-transparent px-1 py-1.5 text-center text-small text-text-secondary hover:bg-surface-hover ${on ? CARD_CHOSEN : ''} ${FOCUS_RING}`}
                >
                  <span className={`relative mx-auto mb-1 block h-[68px] w-[68px] overflow-hidden bg-surface-2 ${round ? 'rounded-full' : 'rounded-2xl'}`}>
                    {recipe && <RecipeImage recipe={recipe} kind="avatar" ctx={ctx} />}
                  </span>
                  <span className="block truncate">{style.label}</span>
                  {style.id === savedStyle && <span className="block text-micro text-text-muted">Current</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}
      <p className="mt-3 text-small text-text-muted">Choose a look to fine-tune it.</p>
    </div>
  )
}
