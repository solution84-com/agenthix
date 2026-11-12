/**
 * One look's fine-tuning (boards/picker-gallery.html, proposal B): ← All looks; the robots as a grid; a face's or a
 * symbol's parts as chips, each a grid of every option drawn on this subject (None first where the part may be left
 * out); the style's colours; the background, one colour or two. Initials have their colours only.
 */
import { useEffect, useState } from 'react'
import { FOCUS_RING, SegmentedControl } from '@agenthix/ui/primitives'
import { AVATAR_COLOURS, avatarColourHex, colourHex, colourSet } from '../palette'
import type { PictureContext, PictureRecipe } from '../recipe'
import { findStyle, type StyleControls } from '../styles'
import { robotsFor } from '../styles/robots'
import { RecipeImage } from './PictureView'
import { Cell, CellGrid, Chip, Heading, Swatches, partLabel } from './pickerParts'

const withChoices = (recipe: PictureRecipe, patch: Record<string, unknown>): PictureRecipe => ({ ...recipe, choices: { ...recipe.choices, ...patch } })
const withPart = (recipe: PictureRecipe, key: string, value: string | null): PictureRecipe =>
  withChoices(recipe, { parts: { ...(recipe.choices.parts as Record<string, string | null>), [key]: value } })

function useControls(style: string, ctx: PictureContext): StyleControls | null {
  const [controls, setControls] = useState<StyleControls | null>(null)
  useEffect(() => {
    let live = true
    setControls(null)
    void findStyle(style)?.describe(ctx).then(c => { if (live) setControls(c) }, () => {})
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style])
  return controls
}

export function AvatarTuning({ ctx, draft, onChange, onBack }: {
  ctx: PictureContext
  draft: PictureRecipe
  onChange: (recipe: PictureRecipe) => void
  /** Left out where the subject has one look only. */
  onBack?: () => void
}) {
  const controls = useControls(draft.style, ctx)
  const [part, setPart] = useState<string | null>(null)
  const style = findStyle(draft.style)
  const parts = controls?.parts ?? []
  const current = parts.find(p => p.key === part) ?? parts[0]
  const chosenParts = (draft.choices.parts ?? {}) as Record<string, string | null>
  const background = draft.choices.background as string
  const background2 = (draft.choices.background2 ?? null) as string | null

  return (
    <div>
      {onBack && (
        <div className="mb-3 flex items-center gap-2 text-body">
          <button type="button" onClick={onBack} className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>← All looks</button>
          <span className="text-text-muted">·</span>
          <span className="font-medium text-text-primary">{style?.label}</span>
        </div>
      )}

      {draft.style === 'robots' && (
        <>
          <Heading>Robot</Heading>
          <CellGrid tall>
            {robotsFor(ctx).map(name => (
              <Cell key={name} on={draft.choices.robot === name} label={name.replace(/-/g, ' ')} onClick={() => onChange(withChoices(draft, { robot: name }))}>
                <RecipeImage recipe={withChoices(draft, { robot: name })} kind="avatar" ctx={ctx} />
              </Cell>
            ))}
          </CellGrid>
        </>
      )}

      {current && (
        <>
          <Heading>Parts</Heading>
          <div className="flex flex-wrap gap-1.5">
            {parts.map(p => <Chip key={p.key} on={p.key === current.key} onClick={() => setPart(p.key)}>{partLabel(p.key)}</Chip>)}
          </div>
          <div className="mt-2">
            <CellGrid>
              {[...(current.optional ? [null] : []), ...current.values].map(value => (
                <Cell key={value ?? 'none'} on={chosenParts[current.key] === value} label={value ?? 'None'} onClick={() => onChange(withPart(draft, current.key, value))}>
                  {value === null
                    ? <span className="flex h-full items-center justify-center text-micro text-text-muted">None</span>
                    : <RecipeImage recipe={withPart(draft, current.key, value)} kind="avatar" ctx={ctx} />}
                </Cell>
              ))}
            </CellGrid>
          </div>
        </>
      )}

      {controls?.colours.map(({ key, set }) => (
        <div key={key}>
          <Heading>{partLabel(key)}</Heading>
          <Swatches label={partLabel(key)} names={colourSet(set)} chosen={draft.choices[key] as string} fill={n => `#${colourHex(set, n)}`} onChoose={n => onChange(withChoices(draft, { [key]: n }))} />
        </div>
      ))}

      {controls?.background && (
        <>
          <Heading>Background</Heading>
          <Swatches label="Background" names={AVATAR_COLOURS} chosen={background} fill={n => `#${avatarColourHex(n)}`} onChoose={n => onChange(withChoices(draft, { background: n }))} />
          <div className="mt-2">
            <SegmentedControl
              label="One colour or a gradient"
              options={[{ value: 'one', label: 'One colour' }, { value: 'two', label: 'Gradient' }]}
              value={background2 ? 'two' : 'one'}
              onChange={v => onChange(withChoices(draft, {
                background2: v === 'two' ? AVATAR_COLOURS[(AVATAR_COLOURS.indexOf(background) + 9) % AVATAR_COLOURS.length] : null,
              }))}
            />
          </div>
          {background2 && (
            <>
              <Heading>Second colour</Heading>
              <Swatches label="Second colour" names={AVATAR_COLOURS} chosen={background2} fill={n => `#${avatarColourHex(n)}`} onChoose={n => onChange(withChoices(draft, { background2: n }))} />
            </>
          )}
        </>
      )}
    </div>
  )
}
